# FableItems Contract

ERC-1155 NFT items + G$ level rewards for Fable RPG, deployed on **Celo mainnet**.

## Deployment

| Field | Value |
|---|---|
| Address | `0x3939Fb4dc682A25c3581AF101f47A9bA6032a5eb` |
| Admin | `0x5Ab64c56Df2d01A0c76534E01b6a06Cd3d79391C` |
| G$ Token | `0x62B8B11039FcfE5aB0C56E502b1C372A3d2a9c7A` |
| Treasury | `0x91487d8BC1B573f0BC6c23dE7BA23d50F49F627B` |
| Identity | `0xC361A6E67822a0EDc17D899227dd9FC50BD62F42` |
| Metadata | `ipfs://bafybeianypngy35lzwcl6myqx6fzbghknu6iire3ezj4jwsieuy6jlbaxu/` |

## Architecture

**Buying items (trustless):**
User calls `gToken.transferAndCall(fableItemsAddress, price, abi.encode(tokenId))` — G$ is forwarded to treasury and NFT is minted in one atomic transaction. No server required.

**Earning G$ (server-verified):**
Admin calls `grantLevelReward(player, levelId)` after the game server confirms zone completion. The contract checks:
1. `levelClaimed[player][levelId]` — prevents double-claiming
2. `IIdentity.getWhitelistedRoot(player) != address(0)` — requires GoodDollar face verification

New levels can be added at any time with `setLevelReward(levelId, amount)` — no redeployment needed.

## Items

| Token ID | Item | Type | G$ Price |
|---|---|---|---|
| 1 | Iron Sword | Weapon | 2,193 G$ |
| 2 | Ember Blade | Weapon | 4,386 G$ |
| 3 | Obsidian Greatsword | Weapon | 6,579 G$ |
| 4 | Fire Nova | Ability | 8,772 G$ |
| 5 | Poison Cloak | Ability | 13,158 G$ |
| 6 | Stone Shield | Ability | 17,544 G$ |

## Level Rewards

| Level ID | Zone | Reward |
|---|---|---|
| 1 | Ember Fields | 500 G$ |
| 2 | Ashwater Marsh | 1,000 G$ |
| 3 | Obsidian Peak | 2,000 G$ |

## Development

**Build:**
```bash
forge build
```

**Test (27 tests):**
```bash
forge test -vv
```

**Deploy:**
```bash
forge script script/DeployFableItems.s.sol \
  --rpc-url https://forno.celo.org \
  --private-key $PRIVATE_KEY \
  --broadcast
```

## Post-Deploy Setup

Call as admin on Celoscan → Write Contract:

```
setPrice(1, 2193000000000000000000)
setPrice(2, 4386000000000000000000)
setPrice(3, 6579000000000000000000)
setPrice(4, 8772000000000000000000)
setPrice(5, 13158000000000000000000)
setPrice(6, 17544000000000000000000)

setLevelReward(1, 500000000000000000000)
setLevelReward(2, 1000000000000000000000)
setLevelReward(3, 2000000000000000000000)
```

Then transfer G$ directly to the contract address to fund the reward pool.
