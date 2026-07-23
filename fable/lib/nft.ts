import { parseAbi } from 'viem';

// FableNFT — ERC-721 weapon NFTs, sold for native AVAX by rarity tier
// (Tavern Shop primary sale) and resold peer-to-peer for AVAX on FableMarket.
export const FABLE_NFT_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_NFT_ADDRESS || ''
) as `0x${string}`;

export const FABLE_NFT_ABI = parseAbi([
  // ── Read ──────────────────────────────────────────────────────────────────
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function getApproved(uint256 tokenId) view returns (address)',
  'function isApprovedForAll(address owner, address operator) view returns (bool)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
  'function admin() view returns (address)',
  'function treasury() view returns (address)',
  'function fable() view returns (address)',
  'function nextTokenId() view returns (uint256)',
  'function mintCosts(uint8 rarity) view returns (uint256)',
  'function mintCostsAvax(uint8 rarity) view returns (uint256)',
  'function weapons(uint256 tokenId) view returns (string name, uint8 rarity, uint256 damage, uint256 dps, string weaponType)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  // ── Write (user) ──────────────────────────────────────────────────────────
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function mintWeapon(string weaponName, uint8 rarity, uint256 damage, uint256 dps, string weaponType) returns (uint256)',
  'function mintWeaponWithAvax(string weaponName, uint8 rarity, uint256 damage, uint256 dps, string weaponType) payable returns (uint256)',
  // ── Events ────────────────────────────────────────────────────────────────
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event WeaponMinted(address indexed player, uint256 indexed tokenId, string name, uint8 rarity, uint256 fableBurned)',
  'event WeaponPurchased(address indexed player, uint256 indexed tokenId, string name, uint8 rarity, uint256 avaxPaid)',
]);

// FableToken — soulbound FABLE ERC-20, earned by playing (zone clears,
// daily login) and minted server-side once the game server verifies a run.
export const FABLE_TOKEN_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_TOKEN_ADDRESS || ''
) as `0x${string}`;

export const FABLE_TOKEN_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  // Server-only write (called by the ADMIN_PRIVATE_KEY game-contract signer)
  'function mintReward(address player, uint256 amount)',
]);

// Zone scene name → level ID (used for on-chain reward tracking)
export const ZONE_LEVEL_IDS: Record<string, number> = {
  EmberFieldsScene:   1,
  AshwaterMarshScene: 2,
  ObsidianPeakScene:  3,
  SunfallDunesScene:  4,
};

// FABLE reward per level (matches the game server's mintReward calls)
export const ZONE_LEVEL_REWARDS: Record<string, number> = {
  SunfallDunesScene:  500,
  EmberFieldsScene:   500,
  AshwaterMarshScene: 1000,
  ObsidianPeakScene:  2000,
};

// Item slug → rarity tier's Solidity enum index on FableNFT (COMMON=0, RARE=1, EPIC=2, LEGENDARY=3)
export enum Rarity { COMMON = 0, RARE = 1, EPIC = 2, LEGENDARY = 3 }

export const RARITY_LABEL: Record<Rarity, string> = {
  [Rarity.COMMON]:    'Common',
  [Rarity.RARE]:      'Rare',
  [Rarity.EPIC]:      'Epic',
  [Rarity.LEGENDARY]: 'Legendary',
};

// Tavern Shop AVAX prices by rarity — must match FableNFT's mintCostsAvax
export const RARITY_AVAX_COST: Record<Rarity, number> = {
  [Rarity.COMMON]:    0.05,
  [Rarity.RARE]:      0.2,
  [Rarity.EPIC]:      0.75,
  [Rarity.LEGENDARY]: 3,
};

export interface NftItem {
  itemId: string;   // e.g. 'ember_blade'
  tokenId: number;  // ERC-721 token ID assigned at mint
  txHash: string;   // mintWeaponWithAvax tx hash (or 'mock_...' in dev)
  mintedAt: string; // ISO timestamp
}

// AVAX-priced weapon/ability items, sold in the Tavern Shop
export interface AvaxItemDef {
  id: string;
  name: string;
  category: 'weapon' | 'ability';
  icon: string;
  desc: string;
  effect: string;
  attack?: number;
  rarity: Rarity;
  avaxCost: number; // must equal RARITY_AVAX_COST[rarity]
  row: number;
  col: number;
}

export const AVAX_ITEMS: AvaxItemDef[] = [
  // Weapons (col 0) — ordered weakest to strongest (rows 0→2)
  { id: 'iron_sword',          name: 'Iron Sword',    category: 'weapon',  icon: '⚔️',  desc: 'Basic but reliable blade.',          effect: '+12 ATK', attack: 12, rarity: Rarity.COMMON, avaxCost: RARITY_AVAX_COST[Rarity.COMMON], col: 0, row: 0 },
  { id: 'ember_blade',         name: 'Ember Blade',   category: 'weapon',  icon: '🔥',  desc: 'Forged deep in the lava fields.',     effect: '+15 ATK', attack: 15, rarity: Rarity.RARE,   avaxCost: RARITY_AVAX_COST[Rarity.RARE],   col: 0, row: 1 },
  { id: 'obsidian_greatsword', name: 'Obsidian GS',   category: 'weapon',  icon: '🗡️',  desc: 'Heaviest volcanic steel known.',      effect: '+60 ATK', attack: 60, rarity: Rarity.EPIC,   avaxCost: RARITY_AVAX_COST[Rarity.EPIC],   col: 0, row: 2 },
  // Abilities (col 1) — ordered weakest to strongest (rows 0→2)
  { id: 'fire_nova',    name: 'Fire Nova',     category: 'ability', icon: '💥', desc: 'AoE fire burst around the hero.',     effect: 'AoE Blast',  rarity: Rarity.RARE,      avaxCost: RARITY_AVAX_COST[Rarity.RARE],      col: 1, row: 0 },
  { id: 'poison_cloak', name: 'Poison Cloak',  category: 'ability', icon: '☠️', desc: 'Release toxins that slow enemies.',   effect: '10s Slow',   rarity: Rarity.EPIC,      avaxCost: RARITY_AVAX_COST[Rarity.EPIC],      col: 1, row: 1 },
  { id: 'stone_shield', name: 'Stone Shield',  category: 'ability', icon: '🛡️', desc: 'Volcanic armour surge, +DEF.',        effect: '20s +DEF',   rarity: Rarity.LEGENDARY, avaxCost: RARITY_AVAX_COST[Rarity.LEGENDARY], col: 1, row: 2 },
];

// Gold (🪙) consumable items — no signing required
export interface GoldItemDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  effect: string;
  goldCost: number;
  heal?: number;
  fullHeal?: boolean;
  tempBuff?: 'damage' | 'defense';
  row: number;
  col: number;
}

export const GOLD_ITEMS: GoldItemDef[] = [
  // Potions (col 0)
  { id: 'minor_potion',  name: 'Minor Potion',  icon: '🧪', desc: 'Restores 30 HP.',          effect: '+30 HP',   goldCost: 15, heal: 30,   col: 0, row: 0 },
  { id: 'greater_potion',name: 'Greater Potion',icon: '⚗️', desc: 'Restores 75 HP.',          effect: '+75 HP',   goldCost: 30, heal: 75,   col: 0, row: 1 },
  { id: 'mega_elixir',   name: 'Mega Elixir',   icon: '✨', desc: 'Fully restores all HP.',    effect: 'Full HP',  goldCost: 60, fullHeal: true, col: 0, row: 2 },
  // Temp Buffs (col 1)
  { id: 'power_surge',   name: 'Power Surge',   icon: '⚡', desc: '+10% damage this zone.',   effect: '+10% DMG', goldCost: 40, tempBuff: 'damage',  col: 1, row: 0 },
  { id: 'iron_ward',     name: 'Iron Ward',      icon: '🪨', desc: '-15% damage taken.',       effect: '-15% DMG', goldCost: 35, tempBuff: 'defense', col: 1, row: 1 },
];
