# Fable RPG

> A mobile-first action RPG powered by GoodDollar's daily UBI on Celo. Explore pixel-art worlds, battle enemies, loot gear — and earn real G$ as you play.

![Version](https://img.shields.io/badge/version-0.2.0-blueviolet)
![Chain](https://img.shields.io/badge/chain-Celo%20Mainnet-brightgreen)
![Token](https://img.shields.io/badge/token-G%24-orange)
![Platform](https://img.shields.io/badge/platform-Mobile%20Web-blue)
![Contract](https://img.shields.io/badge/contract-0x3939Fb4d-yellow)

---

## Table of Contents

- [Overview](#overview)
- [Onboarding Flow](#onboarding-flow)
- [Gameplay](#gameplay)
- [Game World](#game-world)
- [Controls](#controls)
- [Character & Progression](#character--progression)
- [G$ Integration](#g-integration)
- [NFT Items](#nft-items)
- [Level Rewards](#level-rewards)
- [Profile Tab](#profile-tab)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Smart Contract](#smart-contract)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Roadmap](#roadmap)

---

## Overview

**Fable** is a browser-based, mobile-first action RPG built on GoodDollar's UBI infrastructure on Celo. Players create a hero, explore hand-crafted pixel-art zones, fight enemies, collect loot, and level up — all while earning and spending real G$ on-chain.

G$ is not a cosmetic layer. It is the premium economic currency:
- **Earn** G$ by completing combat zones (server-verified, one-time per wallet per level)
- **Spend** G$ to buy NFT weapons and abilities as ERC-1155 tokens
- **Claim** daily UBI from GoodDollar to activate an in-game XP/Gold buff
- **Identity-gated** — only GoodDollar-verified humans can earn level rewards

The entire earn-and-spend loop runs on Celo mainnet through a single deployed contract.

---

## Onboarding Flow

```
Splash Screen (10s)
       ↓
   Auth Screen
   ┌──────────┬──────────────┐
   │  Wallet  │   Username   │
   └──────────┴──────────────┘
        │              │
   Connect Celo    Type hero name
   wallet          → Lookup in DB
        │              │
   Found?         Found? → Game ✅
   ├── Yes → Game ✅
   └── No  → Character Creation
                  │
            Enter name + class
            (saved to wallet address)
                  │
              Game ✅
```

### Wallet Sign-In
Connects to a Celo wallet (MetaMask, MiniPay, etc.). If a profile exists for that address in Supabase it loads immediately. If not, character creation is shown. The wallet auto-switches to Celo mainnet if the user is on the wrong network.

### Username Sign-In
For returning players on mobile or secondary devices who may not have their wallet extension available. Enter your hero's name — if a profile is found in the database the game loads directly. If no profile is found, a warning is shown to sign in with wallet first (username login only works for accounts that were created via wallet).

When signed in via username, the game uses the wallet address stored in the player's Supabase profile for all on-chain activity. This means a player can sign in with their username on mobile, clear a zone, and the G$ reward is automatically sent to the wallet address that was used to create the account on desktop — no wallet extension needed on mobile.

### Character Creation
Only reached after wallet connection. Wallet address is stored as the primary key — the profile is permanently linked to that address across all devices.

---

## Gameplay

Fable is a real-time action RPG with dual-stick controls.

**Core loop:**
```
Splash → Auth → Town Hub → Equip Gear → Enter Zone → Kill Enemies
                                ↑                          ↓
                         Spend G$ on NFTs         Gold + XP + Loot drops
                                ↑                          ↓
                         Claim Daily UBI ←── Level Up + Zone Clear → Earn G$
```

A full run from town to zone clear takes 5–10 minutes, compatible with the daily-claim retention model.

---

## Game World

### Town Hub
The central hub between runs. Contains the **Tavern** where players access the NFT item shop and claim daily UBI.

### Ember Fields (Zone 1)
Volcanic lava biome. Enemies: **Imps** (fast, low HP) and **Lava Pumpkin Boss** (100 HP, heavy damage). Reward: **500 G$** on first clear.

### Ashwater Marsh (Zone 2)
Swamp biome with poison mechanics. Enemies: **Poison Slimes** and **Swamp Hydra Boss**. Reward: **1,000 G$** on first clear.

### Obsidian Peak (Zone 3)
Summit volcanic zone — the hardest area. Enemies: **Obsidian Golems** and **Fire Demon Boss**. Reward: **2,000 G$** on first clear.

---

## Controls

Fable uses a **dual virtual joystick** layout for mobile.

| Control | Action |
|---|---|
| Left joystick | Move character |
| Right joystick | Aim / attack direction |
| Ability button | Trigger equipped active skill (cooldown) |
| Bottom tab bar | Open panels without pausing |
| Flee to Town | Exit zone and return to hub |

---

## Character & Progression

### Classes

| Class | HP | Strength | Agility | Defense |
|---|---|---|---|---|
| **Knight** | 130 | 12 | 8 | 12 |
| **Ranger** | 100 | 10 | 15 | 8 |
| **Berserker** | 160 | 16 | 6 | 10 |

### Stats
- **XP** — earned from kills, levels up character
- **Gold** — in-game soft currency, earned from kills, spent on potions
- **Stat Points** — allocated on level-up to Strength, Agility, Defense, Vitality (+15 Max HP per Vitality point)

### Zone Clear Screen
After beating a boss, a zone clear screen shows:
- G$ reward status (claiming / claimed / already claimed / not verified)
- Current HP and potion shop (buy with gold)
- Continue button to next zone

---

## G$ Integration

### Trustless Item Purchases
Users buy NFT items directly via `transferAndCall` on the G$ token — a single transaction that transfers G$ and mints the NFT atomically. No server middleman, no approval step.

```
gToken.transferAndCall(fableItemsAddress, price, abi.encode(tokenId))
  → G$ forwarded to treasury
  → NFT minted to buyer
```

### Level Rewards (Server-Verified)
When a player clears a zone, the frontend calls `/api/claim-level-reward`. The server verifies and calls `grantLevelReward(player, levelId)` on-chain using an admin key. The contract:
1. Checks the player hasn't already claimed this level (`levelClaimed` mapping)
2. Checks the player is GoodDollar-verified (`getWhitelistedRoot` on IdentityV2)
3. Transfers G$ from the reward pool to the player

New levels can be added at any time via `setLevelReward(levelId, amount)` — no redeployment needed.

### Daily UBI Claim
The Profile tab has a **Claim Daily G$ UBI** button that calls `UBIScheme.claim()` on Celo. Successfully claiming activates a 24-hour **+50% XP & Gold buff** in-game.

### GoodDollar Identity
Level rewards require GoodDollar face verification. Unverified players see an orange banner with a link to `wallet.gooddollar.org` to complete verification. Uses `getWhitelistedRoot()` which works for both primary and linked secondary wallets.

---

## NFT Items

All items are ERC-1155 tokens on Celo mainnet. Token ID is the item type — multiple players can own the same item.

| # | Item | Type | Effect | G$ Price |
|---|---|---|---|---|
| 1 | Iron Sword | Weapon | +12 ATK | 2,193 G$ |
| 2 | Ember Blade | Weapon | +15 ATK | 4,386 G$ |
| 3 | Obsidian Greatsword | Weapon | +60 ATK | 6,579 G$ |
| 4 | Fire Nova | Ability | AoE Blast | 8,772 G$ |
| 5 | Poison Cloak | Ability | 10s Slow | 13,158 G$ |
| 6 | Stone Shield | Ability | 20s +DEF | 17,544 G$ |

Metadata: `ipfs://bafybeianypngy35lzwcl6myqx6fzbghknu6iire3ezj4jwsieuy6jlbaxu/`

---

## Level Rewards

| Level | Zone | G$ Reward | USD Value |
|---|---|---|---|
| 1 | Ember Fields | 500 G$ | ~$0.50 |
| 2 | Ashwater Marsh | 1,000 G$ | ~$1.00 |
| 3 | Obsidian Peak | 2,000 G$ | ~$2.00 |

Rewards are claimable **once per wallet address per level**. Protected by both on-chain mapping and GoodDollar identity verification.

---

## Profile Tab

The in-game Profile tab (bottom nav) shows everything about the player in one place:

- **Wallet** — connected address with copy button, or Connect Wallet button
- **G$ Balance** — live on-chain balance with refresh
- **Gold** — in-game token balance
- **Level / Zones Cleared / NFTs Owned** — progress stats
- **Zones cleared** — badges for each cleared zone
- **Weapons** — full arsenal with equipped indicator and NFT gem icon
- **Abilities** — NFT abilities owned
- **Active Buffs** — UBI buff status
- **Claim Daily G$ UBI** — one-tap claim button

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TypeScript, Tailwind CSS v4 |
| Game Engine | Phaser 3 (WebGL, mobile input) |
| Blockchain | Viem, Celo Mainnet (chain ID 42220) |
| Token | GoodDollar G$ — ERC-20 + ERC-677 |
| NFTs | ERC-1155 (FableItems contract) |
| Identity | GoodDollar IdentityV2 (`getWhitelistedRoot`) |
| UBI | GoodDollar UBIScheme |
| Database | Supabase (player profiles, leaderboard, reward audit log) |
| Auth | Wallet address (primary) + username fallback |
| Hosting | Vercel |
| Contract tooling | Foundry (forge) |

---

## Project Structure

```
fable/
├── app/
│   ├── page.tsx                    # Splash → Auth → Character creation → Game
│   └── api/
│       ├── claim-level-reward/     # Server grants G$ after zone clear
│       └── mint-item/              # Deprecated (purchases now via transferAndCall)
├── components/
│   ├── HUD.tsx                     # In-game heads-up display
│   ├── TavernShop.tsx              # NFT item shop (buy with G$)
│   └── LevelClearScreen.tsx        # Zone clear + G$ reward + potion shop
├── game/                           # Phaser 3 scenes and systems
│   └── scenes/
│       ├── TownScene.ts
│       ├── EmberFieldsScene.ts
│       ├── AshwaterMarshScene.ts
│       └── ObsidianPeakScene.ts
├── lib/
│   ├── celo.ts                     # Viem client, buyItem, claimUBI, ensureCeloNetwork
│   ├── nft.ts                      # Contract address, ABI, item/zone definitions
│   └── supabaseClient.ts           # DB service, player CRUD, reward audit log
├── supabase_schema.sql             # Full DB schema (run in Supabase SQL editor)
└── contract/
    ├── src/FableItems.sol          # ERC-1155 + G$ earn/spend contract
    └── test/FableItems.t.sol       # 27 Foundry tests
```

---

## Smart Contract

**FableItems** — deployed on Celo mainnet

| Field | Value |
|---|---|
| Address | `0x3939Fb4dc682A25c3581AF101f47A9bA6032a5eb` |
| Admin | `0x5Ab64c56Df2d01A0c76534E01b6a06Cd3d79391C` |
| G$ Token | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |
| Treasury | `0x91487d8BC1B573f0BC6c23dE7BA23d50F49F627B` |
| Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` |
| Metadata | `ipfs://bafybeianypngy35lzwcl6myqx6fzbghknu6iire3ezj4jwsieuy6jlbaxu/` |

### Key Functions

| Function | Who | Purpose |
|---|---|---|
| `onTokenTransfer(from, value, data)` | G$ token (user-triggered) | Buy NFT item via transferAndCall |
| `grantLevelReward(player, levelId)` | Admin | Pay G$ reward after zone clear |
| `setLevelReward(levelId, amount)` | Admin | Set reward for a level (no redeploy) |
| `setPrice(tokenId, price)` | Admin | Set item price |
| `setIdentityContract(address)` | Admin | Enable/disable identity check |
| `withdrawRewardPool(amount)` | Admin | Reclaim unspent G$ from reward pool |

### Post-Deploy Setup
After deployment call these as admin:

```
setPrice(1, 2193000000000000000000)   // Iron Sword
setPrice(2, 4386000000000000000000)   // Ember Blade
setPrice(3, 6579000000000000000000)   // Obsidian Greatsword
setPrice(4, 8772000000000000000000)   // Fire Nova
setPrice(5, 13158000000000000000000)  // Poison Cloak
setPrice(6, 17544000000000000000000)  // Stone Shield

setLevelReward(1, 500000000000000000000)   // Ember Fields: 500 G$
setLevelReward(2, 1000000000000000000000)  // Ashwater Marsh: 1000 G$
setLevelReward(3, 2000000000000000000000)  // Obsidian Peak: 2000 G$
```

Then send G$ directly to the contract address to fund the reward pool.

---

## Getting Started

### Prerequisites
- Node.js `>=18`
- pnpm
- A Celo wallet with G$ (MetaMask with Celo mainnet, or MiniPay)
- Supabase project
- Foundry (`curl -L https://foundry.paradigm.xyz | bash`)

### Install & Run

```bash
git clone https://github.com/Godbrand0/fable.git
cd fable/fable
pnpm install
pnpm dev
```

Open `http://localhost:3000` — use Chrome DevTools mobile emulation at 480px width.

### Run Contract Tests

```bash
cd contract
forge test
```

---

## Environment Variables

```env
# Celo RPC
NEXT_PUBLIC_CELO_RPC_URL=https://forno.celo.org

# Contracts
NEXT_PUBLIC_FABLE_ITEMS_ADDRESS=0x3939Fb4dc682A25c3581AF101f47A9bA6032a5eb
NEXT_PUBLIC_GOODDOLLAR_ADDRESS=0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A
NEXT_PUBLIC_UBISCHEME_ADDRESS=0x43d72Ff17701B2DA814620735C39C620Ce0ea4A1
NEXT_PUBLIC_IDENTITY_ADDRESS=0xC361A6E67822a0EDc17D899227dd9FC50BD62F42

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# Server-side (Vercel env, never commit)
ADMIN_PRIVATE_KEY=your_deployer_private_key
```

---

## Roadmap

### Done
- [x] Three combat zones (Ember Fields, Ashwater Marsh, Obsidian Peak)
- [x] Dual joystick controls, boss fights, terrain obstacles
- [x] ERC-1155 NFT contract deployed on Celo mainnet
- [x] Trustless item purchases via G$ `transferAndCall`
- [x] Level rewards — earn G$ on zone clear (GoodDollar identity gated)
- [x] GoodDollar identity verification (`getWhitelistedRoot`)
- [x] Daily UBI claim → +50% XP/Gold buff
- [x] Wallet + username onboarding with Supabase persistence
- [x] Profile tab (balance, NFTs, zones, weapons, buffs)
- [x] Auto-switch wallet to Celo mainnet

### Next
- [ ] Leaderboard (weekly zone clears, G$ prize pool)
- [ ] MiniPay deep integration
- [ ] Additional zones beyond Obsidian Peak
- [ ] Item crafting (combine loot materials, G$ fee)
- [ ] PvP arena (stake G$, winner takes pool)

---

## License

MIT © Godbrand — Built on GoodDollar & Celo.

---

> *Fable is live on Celo. Claim your G$. Enter the world.*
