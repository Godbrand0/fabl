import { createPublicClient, createWalletClient, custom, http, formatEther, parseEther, WalletClient } from 'viem';
import { avalanche } from 'viem/chains';
import { FABLE_NFT_ADDRESS, FABLE_NFT_ABI, FABLE_TOKEN_ADDRESS, FABLE_TOKEN_ABI, FABLE_GAME_SESSION_ADDRESS, FABLE_GAME_SESSION_ABI, FABLE_SHOP_ADDRESS, FABLE_SHOP_ABI, NftItem } from './nft';
import { getWeb3AuthProvider } from './web3auth';

const AVALANCHE_RPC = process.env.NEXT_PUBLIC_AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc';

export const publicClient = createPublicClient({
  chain: avalanche,
  transport: http(AVALANCHE_RPC),
});

export const avalancheService = {
  hasInjectedProvider(): boolean {
    return typeof window !== 'undefined' && typeof (window as any).ethereum !== 'undefined';
  },

  getWalletClient(account?: `0x${string}`): WalletClient | null {
    const web3authProvider = getWeb3AuthProvider();
    if (web3authProvider) {
      return createWalletClient({ account, chain: avalanche, transport: custom(web3authProvider) });
    }
    if (this.hasInjectedProvider()) {
      return createWalletClient({ account, chain: avalanche, transport: custom((window as any).ethereum) });
    }
    return null;
  },

  // Switch the connected wallet to Avalanche C-Chain. Call before any write transaction.
  async ensureAvalancheNetwork(): Promise<void> {
    const web3authProvider = getWeb3AuthProvider();
    if (web3authProvider) return; // Web3Auth is pre-configured for Avalanche
    if (!this.hasInjectedProvider()) return;
    try {
      await (window as any).ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xa86a' }], // 43114 in hex
      });
    } catch (switchError: any) {
      // Chain not added to wallet — add it
      if (switchError.code === 4902) {
        await (window as any).ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0xa86a',
            chainName: 'Avalanche C-Chain',
            nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
            rpcUrls: [AVALANCHE_RPC],
            blockExplorerUrls: ['https://snowtrace.io'],
          }],
        });
      } else {
        throw switchError;
      }
    }
  },

  async getConnectedAddress(): Promise<string | null> {
    const walletClient = this.getWalletClient();
    if (walletClient) {
      try {
        const [address] = await walletClient.getAddresses();
        return address || null;
      } catch {
        return null;
      }
    }
    return (typeof window !== 'undefined' ? localStorage.getItem('fable_mock_wallet') : null) || null;
  },

  async connectWallet(): Promise<string> {
    const walletClient = this.getWalletClient();
    if (walletClient) {
      const [address] = await walletClient.requestAddresses();
      return address;
    }
    // Mock wallet for local dev
    let mockAddress = localStorage.getItem('fable_mock_wallet');
    if (!mockAddress) {
      const randHex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
      mockAddress = `0x${randHex}`;
      localStorage.setItem('fable_mock_wallet', mockAddress);
    }
    return mockAddress;
  },

  // Native AVAX balance
  async getAvaxBalance(address: string): Promise<string> {
    if (!address.startsWith('0x')) return '0.0000';
    if (!this.getWalletClient()) {
      return localStorage.getItem(`fable_mock_avax_bal_${address.toLowerCase()}`) || '5.0000';
    }
    try {
      const balance = await publicClient.getBalance({ address: address as `0x${string}` });
      return Number(formatEther(balance)).toFixed(4);
    } catch {
      return '0.0000';
    }
  },

  // Soulbound FABLE balance (progression currency — never spent on NFTs)
  async getFableBalance(address: string): Promise<string> {
    if (!address.startsWith('0x') || !FABLE_TOKEN_ADDRESS) return '0.00';
    if (!this.getWalletClient()) {
      return localStorage.getItem(`fable_mock_fable_bal_${address.toLowerCase()}`) || '0.00';
    }
    try {
      const balance = await publicClient.readContract({
        address: FABLE_TOKEN_ADDRESS, abi: FABLE_TOKEN_ABI, functionName: 'balanceOf', args: [address as `0x${string}`],
      });
      return Number(formatEther(balance)).toFixed(2);
    } catch {
      return '0.00';
    }
  },

  // Send native AVAX to an external wallet (Bank → Withdraw)
  async transferAvax(from: string, to: string, amountAvax: number): Promise<boolean> {
    const walletClient = this.getWalletClient(from as `0x${string}`);
    if (!walletClient) throw new Error('WalletClient not found');
    await this.ensureAvalancheNetwork();
    try {
      const hash = await walletClient.sendTransaction({
        account: from as `0x${string}`,
        to: to as `0x${string}`,
        value: parseEther(amountAvax.toString()),
        chain: avalanche,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('transferAvax error:', err);
      return false;
    }
  },

  // Buy a Tavern Shop weapon/ability: pays AVAX straight to FableNFT, which
  // mints the NFT to the buyer's wallet in the same transaction. Every
  // weapon is its own catalog entry with its own price — no rarity tiers.
  async buyItemWithAvax(walletAddress: string, itemId: string, weaponId: number, avaxCost: number): Promise<NftItem | null> {
    if (!this.getWalletClient()) {
      const currentBal = Number(await this.getAvaxBalance(walletAddress));
      if (currentBal < avaxCost) return null;
      localStorage.setItem(`fable_mock_avax_bal_${walletAddress.toLowerCase()}`, (currentBal - avaxCost).toFixed(4));
      return {
        itemId,
        tokenId: Math.floor(Math.random() * 1_000_000),
        txHash: `mock_buy_${itemId}_${Date.now()}`,
        mintedAt: new Date().toISOString(),
      };
    }

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) throw new Error('No wallet client available');

      const value = parseEther(avaxCost.toString());
      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_NFT_ADDRESS,
        abi: FABLE_NFT_ABI,
        functionName: 'mintWeaponWithAvax',
        args: [BigInt(weaponId)],
        value,
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') return null;

      // Pull the minted tokenId out of the WeaponPurchased event
      let tokenId = 0;
      for (const log of receipt.logs) {
        try {
          if (log.address.toLowerCase() !== FABLE_NFT_ADDRESS.toLowerCase()) continue;
          // topics[2] is the indexed tokenId on WeaponPurchased/Transfer
          if (log.topics[2]) tokenId = Number(BigInt(log.topics[2]));
        } catch { /* skip unrelated logs */ }
      }

      return { itemId, tokenId, txHash: hash, mintedAt: new Date().toISOString() };
    } catch (err) {
      console.error('buyItemWithAvax failed:', err);
      return null;
    }
  },

  // Spend FABLE on a FableShop consumable/buff (potions, temp buffs).
  async buyShopItem(walletAddress: string, itemId: number): Promise<boolean> {
    if (!FABLE_SHOP_ADDRESS) return false;
    if (!this.getWalletClient()) return false; // mock wallet — nothing on-chain to spend from

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) return false;

      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_SHOP_ADDRESS,
        abi: FABLE_SHOP_ABI,
        functionName: 'buyItem',
        args: [BigInt(itemId)],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('buyShopItem failed:', err);
      return false;
    }
  },

  // Spend FABLE on a stat point (first point cheaper, every point after flat).
  async buyStatPoint(walletAddress: string): Promise<boolean> {
    if (!FABLE_SHOP_ADDRESS) return false;
    if (!this.getWalletClient()) return false;

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) return false;

      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_SHOP_ADDRESS,
        abi: FABLE_SHOP_ABI,
        functionName: 'buyStatPoint',
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('buyStatPoint failed:', err);
      return false;
    }
  },

  // Player-signed: enter a zone (burns the zone's FABLE cost, if any).
  // Best-effort — callers should not block gameplay progression on this.
  async enterZone(walletAddress: string, zoneId: number): Promise<boolean> {
    if (!FABLE_GAME_SESSION_ADDRESS) return true; // not deployed yet — no-op success

    if (!this.getWalletClient()) {
      return true; // mock wallet in dev — nothing to sign
    }

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) return false;

      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_GAME_SESSION_ADDRESS,
        abi: FABLE_GAME_SESSION_ABI,
        functionName: 'enterZone',
        args: [BigInt(zoneId)],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('enterZone failed:', err);
      return false;
    }
  },

  // Player-signed: submit this run's score using the game server's
  // attestation. Repeatable — the zone's fixed FABLE reward only mints the
  // first time a player clears it, but score submission works every run.
  async clearZone(
    walletAddress: string,
    zoneId: number,
    score: number,
    deadline: number,
    signature: `0x${string}`,
  ): Promise<boolean> {
    if (!FABLE_GAME_SESSION_ADDRESS) return false;

    if (!this.getWalletClient()) {
      return false; // mock wallet in dev — nothing on-chain to submit to
    }

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) return false;

      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_GAME_SESSION_ADDRESS,
        abi: FABLE_GAME_SESSION_ABI,
        functionName: 'clearZone',
        args: [BigInt(zoneId), BigInt(score), BigInt(deadline), signature],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('clearZone failed:', err);
      return false;
    }
  },

  // Player-signed: died and quit. Banks the run's score with no FABLE reward.
  async submitCheckpoint(
    walletAddress: string,
    zoneId: number,
    score: number,
    deadline: number,
    signature: `0x${string}`,
  ): Promise<boolean> {
    if (!FABLE_GAME_SESSION_ADDRESS) return false;
    if (!this.getWalletClient()) return false;

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) return false;

      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_GAME_SESSION_ADDRESS,
        abi: FABLE_GAME_SESSION_ABI,
        functionName: 'submitCheckpoint',
        args: [BigInt(zoneId), BigInt(score), BigInt(deadline), signature],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('submitCheckpoint failed:', err);
      return false;
    }
  },

  // Player-signed: died and paid to keep fighting. Burns the flat continue
  // fee and banks the score so far; caller is responsible for resuming
  // gameplay with kill count intact once this succeeds.
  async continueRun(
    walletAddress: string,
    zoneId: number,
    score: number,
    deadline: number,
    signature: `0x${string}`,
  ): Promise<boolean> {
    if (!FABLE_GAME_SESSION_ADDRESS) return false;
    if (!this.getWalletClient()) return false;

    try {
      await this.ensureAvalancheNetwork();
      const walletClient = this.getWalletClient(walletAddress as `0x${string}`);
      if (!walletClient) return false;

      const { request } = await publicClient.simulateContract({
        account: walletAddress as `0x${string}`,
        address: FABLE_GAME_SESSION_ADDRESS,
        abi: FABLE_GAME_SESSION_ABI,
        functionName: 'continueRun',
        args: [BigInt(zoneId), BigInt(score), BigInt(deadline), signature],
      });
      const hash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return receipt.status === 'success';
    } catch (err) {
      console.error('continueRun failed:', err);
      return false;
    }
  },
};
