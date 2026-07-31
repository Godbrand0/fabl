'use client';

// Lazy-initialised Web3Auth v9 singleton
// This module must only run on the client side.

import { activeChain, activeChainIdHex, AVALANCHE_RPC_URL } from './chain';

let web3authInstance: any = null;
let isInitialized = false;

const clientId =
  process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ||
  'BPi5PB_UiIZ-cPz1GtV5i1I2iOSOHuimiXBI0e-Oe_u6X3oVAbCiIQMAGN3Tu58cLx_jEw9bU1b5sN8mB4F_Txs';

// Must match the network the client ID's project is configured for on the
// Web3Auth Dashboard (Sapphire Devnet is the default for new/free-tier projects;
// Mainnet requires the project to be explicitly upgraded there).
const web3AuthNetwork = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK || 'sapphire_devnet';

async function getWeb3Auth() {
  if (web3authInstance) return web3authInstance;

  const { Web3Auth } = await import('@web3auth/modal');
  const { EthereumPrivateKeyProvider } = await import('@web3auth/ethereum-provider');
  const { CHAIN_NAMESPACES } = await import('@web3auth/base');

  const privateKeyProvider = new EthereumPrivateKeyProvider({
    config: {
      chainConfig: {
        chainNamespace: CHAIN_NAMESPACES.EIP155,
        chainId: activeChainIdHex,
        rpcTarget: AVALANCHE_RPC_URL,
        displayName: activeChain.name,
        ticker: 'AVAX',
        tickerName: 'Avalanche',
      },
    },
  });

  web3authInstance = new Web3Auth({
    clientId,
    web3AuthNetwork: web3AuthNetwork as any,
    privateKeyProvider: privateKeyProvider as any,
  });

  return web3authInstance;
}

export async function web3authLogin(): Promise<void> {
  const web3auth = await getWeb3Auth();
  if (!isInitialized) {
    // initModal() (not init()) is required for the modal-flavored Web3Auth class —
    // it sets up the login modal UI that connect() depends on.
    await web3auth.initModal();
    isInitialized = true;
  }
  if (!web3auth.connected) {
    await web3auth.connect();
  }
}

export async function web3authLogout(): Promise<void> {
  if (!web3authInstance) return;
  if (!isInitialized) return;
  if (web3authInstance.connected) {
    await web3authInstance.logout();
  }
  isInitialized = false;
}

export function getWeb3AuthProvider(): any | null {
  if (!web3authInstance || !web3authInstance.connected) return null;
  return web3authInstance.provider;
}

export async function getUserInfo(): Promise<any | null> {
  if (!web3authInstance || !web3authInstance.connected) return null;
  return await web3authInstance.getUserInfo();
}
