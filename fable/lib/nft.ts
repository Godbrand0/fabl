import { parseAbi } from 'viem';

// FableNFT — ERC-721 weapon NFTs. Each weapon is its own catalog entry with
// its own individual AVAX price — there are no rarity tiers. AVAX-only:
// FABLE is never spent on an NFT.
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
  'function nextTokenId() view returns (uint256)',
  'function catalog(uint256 weaponId) view returns (string name, string weaponType, uint256 damage, uint256 dps, uint256 avaxCost, bool active)',
  'function weaponOf(uint256 tokenId) view returns (uint256)',
  'function weapons(uint256 tokenId) view returns (string weaponName, string weaponType, uint256 damage, uint256 dps)',
  'function tokenURI(uint256 tokenId) view returns (string)',
  // ── Write (user) ──────────────────────────────────────────────────────────
  'function approve(address to, uint256 tokenId)',
  'function setApprovalForAll(address operator, bool approved)',
  'function transferFrom(address from, address to, uint256 tokenId)',
  'function safeTransferFrom(address from, address to, uint256 tokenId)',
  'function mintWeaponWithAvax(uint256 weaponId) payable returns (uint256)',
  // ── Events ────────────────────────────────────────────────────────────────
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event WeaponPurchased(address indexed player, uint256 indexed tokenId, uint256 indexed weaponId, uint256 avaxPaid)',
]);

// FableToken — soulbound FABLE ERC-20, the game's sole in-game currency.
// Earned by clearing zones (server-verified), spent on zone entry and
// FableShop consumables/buffs/stats.
export const FABLE_TOKEN_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_TOKEN_ADDRESS || ''
) as `0x${string}`;

export const FABLE_TOKEN_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  // Server-only write (called by the ADMIN_PRIVATE_KEY game-contract signer)
  'function mintReward(address player, uint256 amount)',
]);

// FableGameSession — one player-signed tx to enter a zone (burns the flat
// entry fee, once ever — free on replays), one to submit the run's score on
// clear (repeatable; the zone's fixed FABLE reward only mints the first time).
export const FABLE_GAME_SESSION_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_GAME_SESSION_ADDRESS || ''
) as `0x${string}`;

export const FABLE_GAME_SESSION_ABI = parseAbi([
  'function entered(address player, uint256 zoneId) view returns (bool)',
  'function claimed(address player, uint256 zoneId) view returns (bool)',
  'function zoneCosts(uint256 zoneId) view returns (uint256)',
  'function zoneRewards(uint256 zoneId) view returns (uint256)',
  'function enterZone(uint256 zoneId)',
  'function clearZone(uint256 zoneId, uint256 score, uint256 deadline, bytes signature)',
  'event ZoneEntered(address indexed player, uint256 indexed zoneId)',
  'event ZoneCleared(address indexed player, uint256 indexed zoneId, uint256 score, uint256 fableEarned)',
]);

// FableShop — spend FABLE on consumables, buffs, and stat points. Purely
// player-signed burns against a fixed on-chain price; no server involved.
export const FABLE_SHOP_ADDRESS = (
  process.env.NEXT_PUBLIC_FABLE_SHOP_ADDRESS || ''
) as `0x${string}`;

export const FABLE_SHOP_ABI = parseAbi([
  'function itemPrices(uint256 itemId) view returns (uint256)',
  'function statPointFirstCost() view returns (uint256)',
  'function statPointCost() view returns (uint256)',
  'function statPointsBought(address player) view returns (uint256)',
  'function buyItem(uint256 itemId)',
  'function buyStatPoint()',
  'event ItemPurchased(address indexed player, uint256 indexed itemId, uint256 cost)',
  'event StatPointBought(address indexed player, uint256 cost, uint256 totalBought)',
]);

// Zone scene name → level ID (used for on-chain reward/entry-fee tracking)
export const ZONE_LEVEL_IDS: Record<string, number> = {
  EmberFieldsScene:   1,
  AshwaterMarshScene: 2,
  ObsidianPeakScene:  3,
  SunfallDunesScene:  4,
};

// FABLE reward per level, in play order (Sunfall → Ember → Ashwater →
// Obsidian): 300, 500, 700, 900 — +200 per level.
export const ZONE_LEVEL_REWARDS: Record<string, number> = {
  SunfallDunesScene:  300,
  EmberFieldsScene:   500,
  AshwaterMarshScene: 700,
  ObsidianPeakScene:  900,
};

// Flat FABLE entry fee, every zone — must match FableGameSession.zoneCosts
export const ZONE_ENTRY_FEE = 50;

export interface NftItem {
  itemId: string;   // e.g. 'ember_blade'
  tokenId: number;  // ERC-721 token ID assigned at mint
  txHash: string;   // mintWeaponWithAvax/mintWeapon tx hash (or 'mock_...' in dev)
  mintedAt: string; // ISO timestamp
}

// Tavern Shop weapons/abilities — each individually priced, no rarity tiers.
// weaponId must match FableNFT's on-chain catalog order (see DeployFable.s.sol).
export interface AvaxItemDef {
  id: string;
  weaponId: number;
  name: string;
  category: 'weapon' | 'ability';
  icon: string;
  desc: string;
  effect: string;
  attack?: number;
  avaxCost: number;
  row: number;
  col: number;
}

export const AVAX_ITEMS: AvaxItemDef[] = [
  // Weapons (col 0) — ordered weakest to strongest (rows 0→2)
  { id: 'iron_sword',          weaponId: 1, name: 'Iron Sword',    category: 'weapon',  icon: '⚔️',  desc: 'Basic but reliable blade.',      effect: '+12 ATK', attack: 12, avaxCost: 0.05, col: 0, row: 0 },
  { id: 'ember_blade',         weaponId: 2, name: 'Ember Blade',   category: 'weapon',  icon: '🔥',  desc: 'Forged deep in the lava fields.', effect: '+15 ATK', attack: 15, avaxCost: 0.1,  col: 0, row: 1 },
  { id: 'obsidian_greatsword', weaponId: 3, name: 'Obsidian GS',   category: 'weapon',  icon: '🗡️',  desc: 'Heaviest volcanic steel known.',  effect: '+60 ATK', attack: 60, avaxCost: 0.3,  col: 0, row: 2 },
  // Abilities (col 1)
  { id: 'fire_nova',    weaponId: 4, name: 'Fire Nova',     category: 'ability', icon: '💥', desc: 'AoE fire burst around the hero.',   effect: 'AoE Blast', avaxCost: 0.6, col: 1, row: 0 },
  { id: 'poison_cloak', weaponId: 5, name: 'Poison Cloak',  category: 'ability', icon: '☠️', desc: 'Release toxins that slow enemies.', effect: '10s Slow',  avaxCost: 0.7, col: 1, row: 1 },
  { id: 'stone_shield', weaponId: 6, name: 'Stone Shield',  category: 'ability', icon: '🛡️', desc: 'Volcanic armour surge, +DEF.',      effect: '20s +DEF',  avaxCost: 0.9, col: 1, row: 2 },
];

// FableShop consumables/buffs — FABLE-priced, no purchase cap (player
// chooses whether to spend now or save toward gear). itemId must match
// FableShop's on-chain prices.
export interface FableItemDef {
  id: string;
  itemId: number;
  name: string;
  icon: string;
  desc: string;
  effect: string;
  fableCost: number;
  heal?: number;
  fullHeal?: boolean;
  tempBuff?: 'damage' | 'defense';
  row: number;
  col: number;
}

export const FABLE_ITEMS: FableItemDef[] = [
  // Potions (col 0)
  { id: 'minor_potion',   itemId: 1, name: 'Minor Potion',   icon: '🧪', desc: 'Restores 30 HP.',        effect: '+30 HP',   fableCost: 25,  heal: 30, col: 0, row: 0 },
  { id: 'greater_potion',  itemId: 2, name: 'Greater Potion', icon: '⚗️', desc: 'Restores 75 HP.',        effect: '+75 HP',   fableCost: 50,  heal: 75, col: 0, row: 1 },
  { id: 'mega_elixir',     itemId: 3, name: 'Mega Elixir',    icon: '✨', desc: 'Fully restores all HP.', effect: 'Full HP',  fableCost: 100, fullHeal: true, col: 0, row: 2 },
  // Temp Buffs (col 1)
  { id: 'power_surge', itemId: 4, name: 'Power Surge', icon: '⚡', desc: '+10% damage this zone.', effect: '+10% DMG', fableCost: 70, tempBuff: 'damage',  col: 1, row: 0 },
  { id: 'iron_ward',   itemId: 5, name: 'Iron Ward',   icon: '🪨', desc: '-15% damage taken.',      effect: '-15% DMG', fableCost: 60, tempBuff: 'defense', col: 1, row: 1 },
];

// Stat point pricing — first point a player ever buys is cheaper, every
// point after is flat. Must match FableShop.statPointFirstCost/statPointCost.
export const STAT_POINT_FIRST_COST = 15;
export const STAT_POINT_COST = 30;
