# Fable — Avalanche Migration Change Document

> Complete breakdown of every change required to move Fable from
> Celo/GoodDollar to Avalanche C-Chain, covering chain config,
> wallet, token economy, smart contracts, game mechanics, UI, and signing.

---

## Table of Contents

- [Summary](#summary)
- [What Does Not Change](#what-does-not-change)
- [1. Chain Configuration](#1-chain-configuration)
- [2. Wallet Integration](#2-wallet-integration)
- [3. Token Economy Redesign](#3-token-economy-redesign)
- [4. Smart Contracts](#4-smart-contracts)
- [5. Game Mechanic Changes](#5-game-mechanic-changes)
- [6. Transaction Signing — Privy Session Model](#6-transaction-signing--privy-session-model)
- [7. In-Game UI Changes](#7-in-game-ui-changes)
- [8. In-Game Marketplace](#8-in-game-marketplace)
- [9. In-Game Bank](#9-in-game-bank)
- [10. Weekly Leaderboard](#10-weekly-leaderboard)
- [11. Gas Sponsorship — Paymaster](#11-gas-sponsorship--paymaster)
- [12. Environment Variables](#12-environment-variables)
- [13. Removed Features](#13-removed-features)
- [14. Implementation Order](#14-implementation-order)
- [15. Contract Deployment Checklist](#15-contract-deployment-checklist)

---

## Summary

Fable was originally built for GoodDollar on Celo, with G$ as the
in-game token and MiniPay as the wallet. The Avalanche version
replaces every chain-specific component while keeping the entire
game engine, combat mechanics, UI, and art assets completely
untouched.

```
TOTAL FILES THAT CHANGE: ~8 files
TOTAL FILES THAT STAY THE SAME: everything in /game/*

Chain:    Celo (42220)         → Avalanche C-Chain (43114)
Wallet:   MiniPay              → Core Wallet / WalletConnect
Token:    G$ (GoodDollar)      → FABLE (soulbound, non-tradeable)
Gold:     Off-chain soft coin  → FABLE (on-chain ERC-20)
Economy:  G$ claim mechanic    → Zone clears + kill rewards
Prizes:   G$ streaming         → AVAX weekly leaderboard
```

---

## What Does Not Change

The following require zero modification:

- All Phaser 3 game source (`/game/*`)
- Combat system, hit detection, block mechanic
- Enemy AI (Imps, Lava Pumpkin boss)
- Dual joystick controls
- Zone design (Town, Ember Fields)
- Loot drop animations
- Inventory / Bag system
- Loadout and equipment slots
- Stats and skills panel
- All sprite assets, tilesets, audio
- Bottom tab navigation
- Zone transition animations
- All TypeScript component logic unrelated to wallet/chain

---

## 1. Chain Configuration

### Before (Celo)

```typescript
// lib/chain.ts
export const chain = {
  id: 42220,
  name: 'Celo',
  network: 'celo',
  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://forno.celo.org'] },
    public:  { http: ['https://forno.celo.org'] },
  },
  blockExplorers: {
    default: { name: 'Celoscan', url: 'https://celoscan.io' },
  },
}
```

### After (Avalanche C-Chain)

```typescript
// lib/chain.ts
export const chain = {
  id: 43114,
  name: 'Avalanche',
  network: 'avalanche',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.avax.network/ext/bc/C/rpc'] },
    public:  { http: ['https://api.avax.network/ext/bc/C/rpc'] },
    wss:     { wss:  ['wss://api.avax.network/ext/bc/C/ws'] },
  },
  blockExplorers: {
    default: { name: 'Snowtrace', url: 'https://snowtrace.io' },
  },
}

// Fuji testnet for development
export const fujiChain = {
  id: 43113,
  name: 'Avalanche Fuji',
  network: 'avalanche-fuji',
  nativeCurrency: { name: 'Avalanche', symbol: 'AVAX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://api.avax-test.network/ext/bc/C/rpc'] },
    public:  { http: ['https://api.avax-test.network/ext/bc/C/rpc'] },
  },
  blockExplorers: {
    default: { name: 'Snowtrace Testnet', url: 'https://testnet.snowtrace.io' },
  },
  testnet: true,
}
```

---

## 2. Wallet Integration

### Before (MiniPay)

```typescript
// MiniPay is Celo-specific — remove entirely
import { MiniPay } from '@celo/minipay-sdk'
```

### After (Core Wallet + WalletConnect via Privy)

```typescript
// lib/wallet.ts
import { PrivyProvider } from '@privy-io/react-auth'
import { avalanche, avalancheFuji } from 'viem/chains'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  return (
    <PrivyProvider
      appId={process.env.NEXT_PUBLIC_PRIVY_APP_ID!}
      config={{
        loginMethods: ['google', 'email', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#7C3AED',
          logo: '/assets/ui/fable-logo.png',
        },
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          requireUserPasswordOnCreate: false,
        },
        defaultChain: avalanche,
        supportedChains: [avalanche, avalancheFuji],
        // Core wallet appears automatically for Avalanche users
        // MetaMask + WalletConnect as fallback
      }}
    >
      {children}
    </PrivyProvider>
  )
}
```

**No wallet extension is required.** Privy creates an embedded wallet
for every user who logs in with Google or email. Core wallet and
WalletConnect appear as options for users who already have wallets.
All confirmations happen as in-game modals — no browser popups.

---

## 3. Token Economy Redesign

### Before (G$ / GoodDollar)

| Mechanic | Implementation |
|---|---|
| Daily UBI claim | Call GoodDollar `UBIScheme.claim()` |
| In-game currency | G$ ERC-20 on Celo |
| Token tradeable | Yes, on Ubeswap |
| Token source | GoodDollar protocol |

### After (FABLE / Avalanche)

| Mechanic | Implementation |
|---|---|
| Currency source | Earned by playing — kills + zone clears |
| In-game currency | FABLE ERC-20 on Avalanche C-Chain |
| Token tradeable | **NO — soulbound, non-transferable** |
| Gold coins in game | ARE FABLE — visual rebrand only |
| Real money prizes | AVAX — weekly leaderboard top 20 |

### Why Non-Tradeable

FABLE cannot be bought or sold on any DEX. This is a deliberate
design decision to prevent wealthy players from buying dominance.
Everyone earns FABLE at the same rate per action regardless of
their real-world wealth. The only way to get FABLE is to play.

```
Rich player          Poor player
─────────────        ─────────────
Cannot buy FABLE     Cannot buy FABLE
+2 FABLE per imp     +2 FABLE per imp
+15 FABLE per zone   +15 FABLE per zone
Equal footing        Equal footing
```

### Emission Schedule

```
ACTION                  FABLE REWARD
─────────────────────────────────────
Kill an Imp             +2 FABLE
Kill a Boss              +25 FABLE
Clear a Zone             +15 FABLE
Daily Login              +5 FABLE
Tournament Top 10        +50–200 FABLE bonus
```

### Sink Schedule (FABLE burned forever)

```
ACTION                  FABLE COST
──────────────────────────────────────
Enter Elite Zone        10 FABLE burned
Buy Common NFT weapon   50 FABLE burned
Buy Rare NFT weapon     150 FABLE burned
Buy Epic NFT weapon     400 FABLE burned
Buy Legendary NFT       1,000 FABLE burned
Stat upgrade            30 FABLE burned
Revive mid-zone         10 FABLE burned
Tournament entry        5 FABLE → prize pool
```

Sink rate must exceed emission rate. A player who clears 3 zones
per day earns ~65 FABLE/day. Buying one Rare weapon costs 150 FABLE
(~2.3 days of play). Legendary items require 15+ days of active play.
This prevents rapid inflation while keeping progression feeling
rewarding.

---

## 4. Smart Contracts

Four contracts. All deployed on Fuji testnet first, then Avalanche
mainnet. All written in Solidity, deployed with Foundry.

### Contract 1 — FableToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FableToken is ERC20, Ownable {

    uint256 public constant MAX_SUPPLY = 100_000_000 * 10**18;

    address public gameContract;

    event GameContractUpdated(address indexed newContract);

    constructor() ERC20("Fable", "FABLE") Ownable(msg.sender) {}

    function setGameContract(address _gameContract) external onlyOwner {
        gameContract = _gameContract;
        emit GameContractUpdated(_gameContract);
    }

    // ─── SOULBOUND: block all transfers except minting/burning/game ───
    function _update(
        address from,
        address to,
        uint256 amount
    ) internal override {
        require(
            from == address(0) ||           // minting
            to == address(0) ||             // burning
            from == gameContract ||          // game paying player
            to == gameContract,             // player spending in game
            "FABLE: non-transferable"
        );
        super._update(from, to, amount);
    }

    // Called by game server (Privy session signer) to reward players
    function mintReward(address player, uint256 amount)
        external
    {
        require(msg.sender == gameContract, "FABLE: only game contract");
        require(totalSupply() + amount <= MAX_SUPPLY, "FABLE: max supply");
        _mint(player, amount);
    }

    // Called when player spends FABLE in-game (NFT mint, upgrades, etc.)
    function burnFrom(address player, uint256 amount)
        external
    {
        require(msg.sender == gameContract, "FABLE: only game contract");
        _burn(player, amount);
    }
}
```

### Contract 2 — FableGameSession.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./FableToken.sol";
import "./FableLeaderboard.sol";

contract FableGameSession {

    FableToken public fable;
    FableLeaderboard public leaderboard;
    address public gameServer;    // Privy server wallet

    mapping(uint256 => uint256) public zoneCosts;  // zone entry FABLE cost

    struct Session {
        address player;
        uint256 zoneId;
        uint256 startTime;
        uint256 earned;
        uint256 checkpointProgress; // 0-100
        bool active;
    }

    mapping(bytes32 => Session) public sessions;

    event SessionStarted(bytes32 indexed sessionId, address player, uint256 zoneId);
    event Checkpoint(bytes32 indexed sessionId, uint256 progress, uint256 earned);
    event ZoneCleared(bytes32 indexed sessionId, address player, uint256 fableEarned);
    event SessionAborted(bytes32 indexed sessionId, address player, uint256 fableSaved);

    modifier onlyGameServer() {
        require(msg.sender == gameServer, "only game server");
        _;
    }

    constructor(address _fable, address _leaderboard, address _gameServer) {
        fable = FableToken(_fable);
        leaderboard = FableLeaderboard(_leaderboard);
        gameServer = _gameServer;
        zoneCosts[1] = 0;          // Ember Fields (Lv1-2): free entry
        zoneCosts[2] = 10 * 10**18; // Elite zones cost FABLE
    }

    // ── USER SIGNS: Starting a zone (burns entry fee if applicable) ──
    function enterZone(uint256 zoneId) external returns (bytes32) {
        uint256 cost = zoneCosts[zoneId];
        if (cost > 0) {
            fable.burnFrom(msg.sender, cost);
        }

        bytes32 sessionId = keccak256(
            abi.encodePacked(msg.sender, zoneId, block.timestamp)
        );

        sessions[sessionId] = Session({
            player: msg.sender,
            zoneId: zoneId,
            startTime: block.timestamp,
            earned: 0,
            checkpointProgress: 0,
            active: true
        });

        emit SessionStarted(sessionId, msg.sender, zoneId);
        return sessionId;
    }

    // ── GAME SERVER SIGNS: Mid-session checkpoints (no user popup) ──
    function checkpoint(
        bytes32 sessionId,
        uint256 progress,
        uint256 totalEarned
    ) external onlyGameServer {
        Session storage s = sessions[sessionId];
        require(s.active, "session not active");
        require(progress > s.checkpointProgress, "progress must increase");
        require(progress <= 100, "progress max 100");

        s.earned = totalEarned;
        s.checkpointProgress = progress;

        emit Checkpoint(sessionId, progress, totalEarned);
    }

    // ── USER SIGNS: Zone cleared — mints earned FABLE ──
    function clearZone(bytes32 sessionId) external {
        Session storage s = sessions[sessionId];
        require(s.player == msg.sender, "not your session");
        require(s.active, "session not active");
        require(s.checkpointProgress >= 75, "zone not cleared");

        s.active = false;
        fable.mintReward(msg.sender, s.earned);
        leaderboard.submitScore(msg.sender, s.earned, s.zoneId);

        emit ZoneCleared(sessionId, msg.sender, s.earned);
    }

    // ── USER SIGNS: On death — saves 50% of earned FABLE ──
    function sessionAborted(bytes32 sessionId) external {
        Session storage s = sessions[sessionId];
        require(s.player == msg.sender, "not your session");
        require(s.active, "session not active");

        s.active = false;
        uint256 saved = s.earned / 2;

        if (saved > 0) {
            fable.mintReward(msg.sender, saved);
        }

        emit SessionAborted(sessionId, msg.sender, saved);
    }
}
```

### Contract 3 — FableNFT.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./FableToken.sol";

contract FableNFT is ERC721, Ownable {

    FableToken public fable;
    address public gameContract;

    uint256 public nextTokenId = 1;

    enum Rarity { COMMON, RARE, EPIC, LEGENDARY }

    struct Weapon {
        string name;
        Rarity rarity;
        uint256 damage;
        uint256 dps;
        string weaponType;
    }

    // Mint costs in FABLE (burned on mint)
    mapping(Rarity => uint256) public mintCosts;

    mapping(uint256 => Weapon) public weapons;

    event WeaponMinted(
        address indexed player,
        uint256 indexed tokenId,
        string name,
        Rarity rarity,
        uint256 fableBurned
    );

    constructor(address _fable) ERC721("Fable Weapons", "FWEAP") Ownable(msg.sender) {
        fable = FableToken(_fable);
        mintCosts[Rarity.COMMON]    = 50  * 10**18;
        mintCosts[Rarity.RARE]      = 150 * 10**18;
        mintCosts[Rarity.EPIC]      = 400 * 10**18;
        mintCosts[Rarity.LEGENDARY] = 1000 * 10**18;
    }

    // Player pays FABLE → NFT minted to their wallet
    function mintWeapon(
        string calldata name,
        Rarity rarity,
        uint256 damage,
        uint256 dps,
        string calldata weaponType
    ) external returns (uint256) {
        uint256 cost = mintCosts[rarity];
        fable.burnFrom(msg.sender, cost);  // burn FABLE permanently

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);

        weapons[tokenId] = Weapon({
            name: name,
            rarity: rarity,
            damage: damage,
            dps: dps,
            weaponType: weaponType
        });

        emit WeaponMinted(msg.sender, tokenId, name, rarity, cost);
        return tokenId;
    }

    // NFTs are fully tradeable (unlike FABLE token)
    // Players can list on Joepegs or in the Fable in-game market
}
```

### Contract 4 — FableMarket.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract FableMarket is ReentrancyGuard {

    IERC721 public fableNFT;
    address public royaltyRecipient;    // Fable treasury wallet
    uint256 public royaltyPercent = 5;  // 5% on every sale

    struct Listing {
        address seller;
        uint256 tokenId;
        uint256 priceInAvax;    // price in AVAX wei
        bool active;
    }

    mapping(uint256 => Listing) public listings;

    event Listed(address indexed seller, uint256 tokenId, uint256 priceInAvax);
    event Sold(address indexed buyer, address indexed seller, uint256 tokenId, uint256 priceInAvax);
    event Unlisted(uint256 tokenId);

    constructor(address _fableNFT, address _royaltyRecipient) {
        fableNFT = IERC721(_fableNFT);
        royaltyRecipient = _royaltyRecipient;
    }

    // Seller lists NFT — NFT moves to escrow (this contract)
    function listNFT(uint256 tokenId, uint256 priceInAvax) external {
        require(priceInAvax > 0, "price must be > 0");
        fableNFT.transferFrom(msg.sender, address(this), tokenId);
        listings[tokenId] = Listing({
            seller: msg.sender,
            tokenId: tokenId,
            priceInAvax: priceInAvax,
            active: true
        });
        emit Listed(msg.sender, tokenId, priceInAvax);
    }

    // Buyer pays AVAX — seller receives 95%, treasury gets 5%
    function buyNFT(uint256 tokenId) external payable nonReentrant {
        Listing storage l = listings[tokenId];
        require(l.active, "not listed");
        require(msg.value == l.priceInAvax, "wrong AVAX amount");

        uint256 royalty = (msg.value * royaltyPercent) / 100;
        uint256 sellerAmount = msg.value - royalty;

        l.active = false;

        payable(l.seller).transfer(sellerAmount);
        payable(royaltyRecipient).transfer(royalty);
        fableNFT.transferFrom(address(this), msg.sender, tokenId);

        emit Sold(msg.sender, l.seller, tokenId, msg.value);
    }

    // Seller can unlist and reclaim their NFT
    function unlistNFT(uint256 tokenId) external {
        Listing storage l = listings[tokenId];
        require(l.seller == msg.sender, "not your listing");
        require(l.active, "not listed");
        l.active = false;
        fableNFT.transferFrom(address(this), msg.sender, tokenId);
        emit Unlisted(tokenId);
    }

    function getListings() external view returns (Listing[] memory) {
        // Returns active listings — used by in-game market UI
    }
}
```

### Contract 5 — FableLeaderboard.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract FableLeaderboard {

    address public gameContract;
    address public owner;

    struct Entry {
        address player;
        uint256 score;
        uint256 timestamp;
    }

    uint256 public currentWeek;
    mapping(uint256 => Entry[]) public weeklyScores; // week → scores
    mapping(uint256 => mapping(address => uint256)) public playerBestScore;

    // AVAX prize distribution for top 20
    uint256[20] public prizeShares = [
        1200, 800, 600, 400, 400,   // Rank 1-5
        200, 200, 200, 200, 200,    // Rank 6-10
        50, 50, 50, 50, 50,         // Rank 11-15
        50, 50, 50, 50, 50          // Rank 16-20
    ]; // basis points out of 10000

    event ScoreSubmitted(address player, uint256 score, uint256 week);
    event WeeklyPayout(uint256 week, uint256 totalAvax);

    modifier onlyGameContract() {
        require(msg.sender == gameContract, "only game contract");
        _;
    }

    constructor() {
        owner = msg.sender;
        currentWeek = block.timestamp / 7 days;
    }

    function submitScore(
        address player,
        uint256 score,
        uint256 zoneId
    ) external onlyGameContract {
        uint256 week = block.timestamp / 7 days;

        if (score > playerBestScore[week][player]) {
            playerBestScore[week][player] = score;
            weeklyScores[week].push(Entry({
                player: player,
                score: score,
                timestamp: block.timestamp
            }));
            emit ScoreSubmitted(player, score, week);
        }
    }

    // Called by owner/multisig to distribute AVAX prizes each Monday
    function distributeWeeklyPrizes(uint256 week) external payable {
        require(msg.sender == owner, "only owner");
        require(msg.value > 0, "send AVAX for prizes");

        Entry[] memory scores = getSortedScores(week);
        uint256 count = scores.length < 20 ? scores.length : 20;

        for (uint256 i = 0; i < count; i++) {
            uint256 prize = (msg.value * prizeShares[i]) / 10000;
            payable(scores[i].player).transfer(prize);
        }

        emit WeeklyPayout(week, msg.value);
    }

    function getSortedScores(uint256 week)
        public view returns (Entry[] memory) {
        // Returns top 20 sorted by score descending
        // Sort logic implemented off-chain, verified on-chain
    }
}
```

### Deployment (Foundry)

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Deploy to Fuji Testnet first
forge create --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $PRIVATE_KEY \
  src/FableToken.sol:FableToken

forge create --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $PRIVATE_KEY \
  src/FableNFT.sol:FableNFT \
  --constructor-args $FABLE_TOKEN_ADDRESS

forge create --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $PRIVATE_KEY \
  src/FableGameSession.sol:FableGameSession \
  --constructor-args $FABLE_TOKEN_ADDRESS $LEADERBOARD_ADDRESS $GAME_SERVER_WALLET

forge create --rpc-url https://api.avax-test.network/ext/bc/C/rpc \
  --private-key $PRIVATE_KEY \
  src/FableMarket.sol:FableMarket \
  --constructor-args $NFT_ADDRESS $TREASURY_WALLET

# Verify on Snowtrace Testnet
forge verify-contract $CONTRACT_ADDRESS \
  src/FableToken.sol:FableToken \
  --chain-id 43113 \
  --etherscan-api-key $SNOWTRACE_API_KEY
```

---

## 5. Game Mechanic Changes

### Gold Coins → FABLE Coins

**Visual:** The gold coin sprite stays identical. The label changes
from `🪙 50` to `◈ 50 FABLE`. No art changes required.

**Backend:** The Supabase `gold` column becomes a local UI cache only.
Real FABLE balance is always fetched from the chain via the
`FableToken.balanceOf(playerAddress)` call on session start.

```typescript
// Before — reading off-chain gold
const gold = await supabase
  .from('players')
  .select('gold')
  .eq('address', playerAddress)

// After — reading on-chain FABLE balance
import { createPublicClient, http } from 'viem'
import { avalanche } from 'viem/chains'
import { FABLE_TOKEN_ABI } from '@/lib/abis'

const client = createPublicClient({
  chain: avalanche,
  transport: http('https://api.avax.network/ext/bc/C/rpc'),
})

const balance = await client.readContract({
  address: FABLE_TOKEN_ADDRESS,
  abi: FABLE_TOKEN_ABI,
  functionName: 'balanceOf',
  args: [playerAddress],
})
```

### Kill Reward Flow Change

```
BEFORE:
Enemy dies → local gold counter +2 → saved to Supabase

AFTER:
Enemy dies → local FABLE counter +2 (off-chain cache, instant UI)
           → game server queues a batch checkpoint TX every 25 kills
           → checkpoint recorded on-chain by game server (no popup)
           → on zone clear: user signs → FABLE minted to wallet
```

The in-game FABLE counter the player sees updates instantly (off-chain)
for smooth UX. On-chain minting only happens at zone clear or death.

### Zone Entry Change

```
BEFORE:
Enter zone → no cost

AFTER:
Ember Fields (Lv 1-2): FREE — starter zone, no barrier
Elite zones (future):  10 FABLE burned on entry
                       User signs this transaction
                       In-game modal: "Enter Elite Zone? (10 FABLE)"
```

### Death Mechanic Change

```
BEFORE:
Player dies → respawn at town, progress lost, no transaction

AFTER:
Player dies → death screen appears
             "You earned 18 FABLE this run — save your progress?"
             User signs ONE transaction
             50% of earned FABLE minted to wallet (9 FABLE)
             "Play again? Enter Ember Fields"
             User signs entry transaction
             Back in zone
```

Two transactions per death cycle. Natural signing moment — player
is already at a pause point, not mid-combat.

---

## 6. Transaction Signing — Privy Session Model

### Session Setup (Once Per Login)

```typescript
// hooks/useGameSession.ts
import { usePrivy, useDelegatedActions } from '@privy-io/react-auth'

export function useGameSession() {
  const { user } = usePrivy()
  const { delegateWallet } = useDelegatedActions()

  async function initSession() {
    // Delegate signing to game server for this session
    await delegateWallet({
      address: user.wallet.address,
      chainType: 'ethereum',
    })
    // Game server can now sign checkpoint TXs without popup
  }
}
```

### What Signs What

| In-Game Action | Signed By | User Sees |
|---|---|---|
| Kill imp → earn FABLE | Game server (silent) | FABLE counter ticks |
| Zone checkpoint | Game server (silent) | Nothing |
| Zone clear → mint FABLE | **User signs** | In-game modal |
| Player death → save progress | **User signs** | Death screen modal |
| Enter elite zone | **User signs** | In-game modal |
| Mint weapon NFT | **User signs** | Forge confirmation modal |
| Stat upgrade | **User signs** | Upgrade confirmation modal |
| List NFT on market | Game server (silent) | Nothing |
| Buy NFT from market | **User signs** | Purchase modal |
| Send AVAX to external wallet | **User signs + re-auth** | Bank modal |
| Claim leaderboard AVAX prize | **User signs** | Prize claim modal |

### Privy Server Wallet Setup (Game Server)

```typescript
// server/privy.ts
import { PrivyClient } from '@privy-io/server-auth'

const privy = new PrivyClient(
  process.env.PRIVY_APP_ID!,
  process.env.PRIVY_APP_SECRET!,
)

// Game server signs checkpoint on behalf of player
export async function signCheckpoint(
  playerAddress: string,
  sessionId: string,
  progress: number,
  earned: bigint,
) {
  const { hash } = await privy.walletApi.ethereum.sendTransaction({
    walletAddress: process.env.GAME_SERVER_WALLET!,
    caip2: 'eip155:43114',   // Avalanche mainnet
    transaction: {
      to: GAME_SESSION_CONTRACT,
      data: encodeCheckpoint(sessionId, progress, earned),
      value: '0x0',
    },
  })
  return hash
}
```

---

## 7. In-Game UI Changes

### HUD — Top Bar

```
BEFORE:   [← TOWN]    🪙 50 G$    [AVATAR · Lv 1]
AFTER:    [← TOWN]   ◈ 50 FABLE   [AVATAR · Lv 1]
```

Only the currency label and icon change. Layout identical.

### Tavern — New Tabs

The Tavern building now contains four sections, accessed by tapping
`Enter TAVERN`:

```
TAVERN
├── SHOP      → Buy gear with FABLE (sinks)
├── MARKET    → Buy/sell weapon NFTs for AVAX
├── BANK      → Send/receive AVAX, view wallet address
└── FORGE     → Mint new weapon NFTs (burn FABLE)
```

### Bottom Navigation Change

```
BEFORE:  Bag | Friends | Codex | Journey | Map | More
AFTER:   Bag | Loadout | Stats | Codex   | Journey | Wallet
```

`Wallet` tab replaces `More`. Opens the in-game wallet panel
(balance, recent transactions, leaderboard rank).

### In-Game Modal — Zone Clear

```
┌────────────────────────────────┐
│  ✅ ZONE CLEARED                │
│  Ember Fields                  │
│                                │
│  FABLE Earned:    +45 ◈        │
│  Boss Bonus:      +25 ◈        │
│  Total:           +70 ◈        │
│                                │
│  This will be minted to your   │
│  wallet on Avalanche.          │
│                                │
│  [ CANCEL ]    [ CLAIM FABLE ] │
└────────────────────────────────┘
```

### In-Game Modal — Death Screen

```
┌────────────────────────────────┐
│  💀 YOU DIED                   │
│                                │
│  FABLE earned this run: 18 ◈   │
│  Saved (50%):            9 ◈   │
│                                │
│  Sign to save your progress    │
│                                │
│  [ ABANDON RUN ] [ SAVE + EXIT ]│
│                                │
│  ──────────────────────────    │
│  [ PLAY AGAIN — Enter Zone ]   │
└────────────────────────────────┘
```

### In-Game Modal — Weapon Forge

```
┌────────────────────────────────┐
│  ⚒️  FORGE WEAPON              │
│                                │
│  Ember Sword                   │
│  Rarity: EPIC                  │
│  DMG: 80-120 · DPS: 95.0       │
│  Type: Fire · Sword            │
│                                │
│  Cost: 400 ◈ FABLE             │
│  (tokens burned permanently)   │
│                                │
│  Balance: 847 ◈                │
│  After: 447 ◈                  │
│                                │
│  [ CANCEL ]    [ FORGE ]       │
└────────────────────────────────┘
```

---

## 8. In-Game Marketplace

The marketplace lives inside the Tavern. No external marketplace
(Joepegs) integration needed — all NFT trading happens in-game,
priced in AVAX.

### Marketplace UI

```
TAVERN → MARKET

┌──────────────────────────────────────────────┐
│  🗡️  MARKET                    [SELL WEAPON] │
│                                              │
│  FILTER: All | Common | Rare | Epic | Legend │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Bamboo   │  │ Ember    │  │ Void     │  │
│  │ Stick    │  │ Sword    │  │ Reaper   │  │
│  │ COMMON   │  │ EPIC     │  │ LEGEND   │  │
│  │ 0.1 AVAX │  │ 2.0 AVAX │  │ 8.0 AVAX │  │
│  │  [BUY]   │  │  [BUY]   │  │  [BUY]   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                              │
│  5% of every sale goes to weekly prizes      │
└──────────────────────────────────────────────┘
```

### Buy Flow

```
Player taps BUY on an NFT
        ↓
In-game confirmation modal:
"Buy Ember Sword for 2 AVAX?
 Seller receives 1.90 AVAX
 Prize pool receives 0.10 AVAX"
        ↓
User taps CONFIRM
        ↓
Privy triggers wallet signing
(in-game modal, no browser popup)
        ↓
FableMarket.buyNFT() executes on-chain:
- 1.90 AVAX → seller wallet
- 0.10 AVAX → Fable treasury (prize pool)
- NFT transferred to buyer
        ↓
NFT appears in buyer's bag/loadout
```

### Sell Flow

```
Player opens Loadout
Taps weapon → "LIST FOR SALE"
        ↓
In-game modal: "List price in AVAX?"
Player enters: 2.0
        ↓
Game server signs listing TX (silent)
NFT moves to FableMarket escrow
        ↓
Appears in marketplace for all players
```

---

## 9. In-Game Bank

Accessible via `Tavern → BANK`. Handles all real AVAX movement
to and from external wallets.

```
TAVERN → BANK

┌───────────────────────────────────────────┐
│  🏦  BANK                                  │
│                                           │
│  AVAX Balance:  12.40 AVAX ($82.58)       │
│  FABLE Balance: 847 ◈                     │
│                                           │
│  ─────────── SEND AVAX ─────────────      │
│                                           │
│  To: [ wallet address or scan QR ]  [📷] │
│  Amount: [ 5 AVAX              ]          │
│                                           │
│  Fee: ~0.001 AVAX                         │
│  Total deducted: 5.001 AVAX               │
│                                           │
│  [         SEND AVAX          ]           │
│                                           │
│  ─────────── RECEIVE ───────────          │
│                                           │
│  Your address: 0x742d...f44e   [COPY]     │
│  [        SHOW QR CODE        ]           │
│                                           │
│  ─────── TRANSACTION HISTORY ───────      │
│  +12 AVAX  Leaderboard prize  Jul 14      │
│  -0.5 AVAX NFT purchase       Jul 12      │
└───────────────────────────────────────────┘
```

### Send Flow (Security)

```
Player fills address + amount → taps SEND
        ↓
Confirmation modal:
┌────────────────────────────────┐
│  ⚠️  SENDING REAL AVAX         │
│                                │
│  To:   0x742d...f44e           │
│  Amt:  5 AVAX ($33.30)         │
│                                │
│  This cannot be undone         │
│                                │
│  [ CANCEL ]    [ CONFIRM ]     │
└────────────────────────────────┘
        ↓
Privy requires re-authentication
(Google prompt or passkey tap)
        ↓
Transaction broadcast
AVAX sent to external address
```

Re-authentication on withdrawal protects users who leave their
device unlocked. Privy supports this natively via `withMfaAction`.

---

## 10. Weekly Leaderboard

### How Rankings Work

Score = total FABLE earned during the week from zone clears.
Daily login bonuses and NFT mints do NOT count toward score.
Only combat performance (kills + zone clears) counts.

### Prize Distribution (50 AVAX Pool)

```
Rank 1      → 12.0 AVAX  ($79.92 at $6.66)
Rank 2      →  8.0 AVAX  ($53.28)
Rank 3      →  6.0 AVAX  ($39.96)
Rank 4-5    →  4.0 AVAX  ($26.64) each
Rank 6-10   →  2.0 AVAX  ($13.32) each
Rank 11-20  →  0.5 AVAX  ($3.33)  each
─────────────────────────────────────────
Total:        50.0 AVAX  ($333)
```

### Prize Pool Sources

```
Source 1: 5% royalty on every NFT market sale
          (auto-accumulated in FableMarket contract)

Source 2: Team1 Mini Grant allocation
          (initial seeding for first 8 weeks)

Source 3 (future): Tournament entry fee (5 FABLE → sold for AVAX)
```

### Claiming Prizes (In-Game)

```
Player opens Wallet tab
Sees: "🏆 Rank 3 this week — 6 AVAX prize!"
Taps CLAIM
        ↓
In-game modal:
"Claim 6 AVAX weekly prize?
 Sent to your in-game wallet."
        ↓
User taps CONFIRM → signs TX
        ↓
FableLeaderboard.distributeWeeklyPrizes()
sends 6 AVAX to player wallet
        ↓
Player can then BANK → SEND OUT
to send their AVAX to any external address
```

---

## 11. Gas Sponsorship — Paymaster

Players never pay gas. The game pays gas on behalf of every player
using ERC-4337 account abstraction and a Privy-integrated paymaster.

```typescript
// lib/paymaster.ts
// Privy supports Biconomy and Pimlico paymasters out of the box

import { createSmartAccountClient } from 'permissionless'
import { avalanche } from 'viem/chains'

export const paymasterClient = createSmartAccountClient({
  chain: avalanche,
  bundlerTransport: http(process.env.BUNDLER_RPC_URL!),
  paymaster: {
    // Game server pays gas for all player transactions
    getPaymasterData: async (userOperation) => {
      return {
        paymaster: PAYMASTER_CONTRACT_ADDRESS,
        paymasterData: '0x',
      }
    },
  },
})
```

**Cost per session:** ~10 transactions × $0.003 avg gas = $0.03 per
session. At 500 daily active players doing 2 sessions each:
$0.03 × 1000 = $30/day in gas. Well within grant budget.

Gas for **AVAX withdrawals and NFT purchases** is paid by the player
(deducted from their AVAX balance). Only gameplay transactions
are sponsored.

---

## 12. Environment Variables

```env
# ─── Chain ───────────────────────────────────────────
NEXT_PUBLIC_CHAIN_ID=43114
NEXT_PUBLIC_RPC_URL=https://api.avax.network/ext/bc/C/rpc
NEXT_PUBLIC_RPC_WSS=wss://api.avax.network/ext/bc/C/ws
NEXT_PUBLIC_EXPLORER=https://snowtrace.io

# ─── Privy ───────────────────────────────────────────
NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
PRIVY_APP_SECRET=your_privy_secret

# ─── Contracts (set after deployment) ────────────────
NEXT_PUBLIC_FABLE_TOKEN=0x...
NEXT_PUBLIC_FABLE_NFT=0x...
NEXT_PUBLIC_FABLE_GAME_SESSION=0x...
NEXT_PUBLIC_FABLE_MARKET=0x...
NEXT_PUBLIC_FABLE_LEADERBOARD=0x...

# ─── Game Server ─────────────────────────────────────
GAME_SERVER_WALLET=0x...         # Privy server wallet for checkpoints
GAME_SERVER_PRIVATE_KEY=0x...   # Only on server, never in frontend

# ─── Paymaster ───────────────────────────────────────
PAYMASTER_RPC_URL=your_bundler_url
PAYMASTER_CONTRACT_ADDRESS=0x...

# ─── Supabase (player profiles, off-chain cache) ─────
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# ─── AvaCloud (optional — for Glacier API access) ────
GLACIER_API_KEY=your_avacloud_api_key
```

---

## 13. Removed Features

The following Celo/GoodDollar-specific features are removed entirely
and have no Avalanche equivalent:

| Removed Feature | Reason |
|---|---|
| Daily G$ UBI claim | GoodDollar protocol is Celo-only |
| `UBIScheme.claim()` integration | Celo contract |
| MiniPay SDK | Celo-specific wallet |
| G$ ERC-20 references | Replaced by FABLE token |
| Celo forno RPC | Replaced by Avalanche RPC |
| GoodDollar contract addresses | Not applicable on Avalanche |
| Superfluid streaming reference | GoodBuilders S4 context only |
| Tavern "Claim Daily G$" button | Replaced by FORGE + MARKET |

---

## 14. Implementation Order

Build in this exact sequence to avoid dependency issues:

```
DAY 1
─────
□ Swap chain config (Celo → Avalanche Fuji)
□ Install wagmi Avalanche chain + update PrivyProvider config
□ Remove MiniPay SDK, test wallet connect with Core/MetaMask on Fuji

DAY 2
─────
□ Write and deploy FableToken.sol to Fuji
□ Write and deploy FableLeaderboard.sol to Fuji
□ Verify both on testnet.snowtrace.io

DAY 3
─────
□ Write and deploy FableGameSession.sol to Fuji
□ Write and deploy FableNFT.sol to Fuji
□ Set game contract on FableToken (setGameContract)
□ Test: enter zone → checkpoint → clear zone → check FABLE balance

DAY 4
─────
□ Write and deploy FableMarket.sol to Fuji
□ Replace gold counter component with FABLE on-chain balance fetch
□ Update HUD label: G$ → FABLE

DAY 5-6
────────
□ Implement Privy session signers (delegate wallet to game server)
□ Implement game server checkpoint signing
□ Test full session: enter → 3 checkpoints → clear → FABLE minted

DAY 7
─────
□ Build Tavern FORGE tab (NFT mint UI)
□ Build Tavern MARKET tab (listing + buying UI)
□ Build Tavern BANK tab (send/receive AVAX)

DAY 8
─────
□ Implement paymaster (gas sponsorship for gameplay TXs)
□ Record demo video on Fuji testnet
□ Update README with Avalanche contract addresses
□ Submit Team1 Mini Grant application
```

---

## 15. Contract Deployment Checklist

```
PRE-DEPLOYMENT
□ All contracts compiled without warnings (forge build)
□ All unit tests passing (forge test)
□ Contracts audited by at least one peer reviewer
□ Constructor arguments documented and verified

FUJI TESTNET
□ FableToken deployed and verified on testnet.snowtrace.io
□ FableLeaderboard deployed and verified
□ FableGameSession deployed and verified
□ FableNFT deployed and verified
□ FableMarket deployed and verified
□ setGameContract() called on FableToken with FableGameSession address
□ Full gameplay loop tested end-to-end on Fuji
□ Zone entry → kill → checkpoint → clear → FABLE minted ✓
□ Death → 50% FABLE saved ✓
□ NFT forge working ✓
□ Market list + buy + royalty working ✓
□ Leaderboard score submission working ✓

MAINNET
□ All Fuji tests green
□ Deploy sequence: Token → Leaderboard → GameSession → NFT → Market
□ setGameContract() called on mainnet FableToken
□ All addresses updated in .env.production
□ All contracts verified on snowtrace.io
□ Smoke test with real wallet on mainnet
□ Paymaster funded and active
□ Game server wallet funded with AVAX for gas
```

---

*Fable on Avalanche — same game, new chain, real economy.*
*Built for Team1 Builder Grants, Season 1.*
