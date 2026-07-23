import { createClient } from '@supabase/supabase-js';
import { NftItem } from './nft';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const isConfigured    = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;

const LOCAL_KEY       = 'fable_local_players';
const LEADERBOARD_KEY = 'fable_local_leaderboard';

export interface PlayerData {
  wallet_address: string;
  name: string;
  class: string;
  level: number;
  xp: number;
  gold: number;
  maxHp: number;
  hp: number;
  stats: {
    strength: number;
    agility: number;
    defense: number;
    vitality: number;
  };
  statPoints: number;
  maxUnlockedZone: number;
  equippedWeapon: string;
  arsenal: string[];          // weapon IDs owned (includes free starter + G$ purchases)
  abilities: string[];        // ability IDs owned via G$ purchase
  inventory: Array<{ item: string; count: number }>;
  nftItems: NftItem[];        // on-chain NFT records
  ubiBuffActive: boolean;
  ubiBuffExpiresAt: number | null;
  activeAbility: string | null;
  pendingRewards: string[];
  onboarded: boolean;          // has the player completed the Guildmaster tutorial?
  zoneProgress: Record<string, { enemiesDefeated: number }>;  // mid-zone kill progress, keyed by scene key
  currentZone: string | null;  // which zone scene "Continue" should resume into
  lastProgressSync?: {        // last "Commit Progress" on-chain sync
    level: number;
    gold: number;
    txHash: string;
    syncedAt: string;
  };
}

export interface LeaderboardEntry {
  wallet_address: string;
  player_name: string;
  zone_clears: number;
  score: number;
}

// Normalise a row from either Supabase (lowercase keys) or localStorage (camelCase).
function withDefaults(p: any): PlayerData {
  return {
    wallet_address:   p.wallet_address   ?? 'local_player',
    name:             p.name             ?? 'Hero',
    class:            p.hero_class       ?? p.class        ?? 'knight',
    level:            p.level            ?? 1,
    xp:               p.xp               ?? 0,
    gold:             p.gold             ?? 100,
    maxHp:            p.maxHp            ?? p.maxhp        ?? 100,
    hp:               p.hp               ?? 100,
    stats:            p.stats            ?? { strength: 0, agility: 0, defense: 0, vitality: 0 },
    statPoints:       p.statPoints       ?? p.statpoints   ?? 0,
    maxUnlockedZone:  p.maxUnlockedZone  ?? p.maxunlockedzone  ?? 1,
    equippedWeapon:   p.equippedWeapon   ?? p.equippedweapon   ?? 'bamboo_stick',
    arsenal:          p.arsenal          ?? ['bamboo_stick'],
    abilities:        p.abilities        ?? [],
    inventory:        p.inventory        ?? [],
    nftItems:         p.nftItems         ?? p.nftitems     ?? [],
    ubiBuffActive:    p.ubiBuffActive     ?? p.ubibuffactive    ?? false,
    ubiBuffExpiresAt: p.ubiBuffExpiresAt  ?? p.ubibuffexpiresat ?? null,
    activeAbility:    p.activeAbility     ?? p.activeability    ?? null,
    pendingRewards:   p.pendingRewards    ?? p.pendingrewards   ?? [],
    onboarded:        p.onboarded         ?? false,
    zoneProgress:     p.zoneProgress      ?? p.zone_progress ?? {},
    currentZone:      p.currentZone       ?? p.current_zone  ?? null,
    lastProgressSync: p.lastProgressSync  ?? p.lastprogresssync ?? undefined,
  };
}

// Map camelCase PlayerData to the snake_case columns Supabase expects
function toDbRow(player: PlayerData) {
  return {
    wallet_address:   player.wallet_address,
    name:             player.name,
    hero_class:       player.class,
    level:            player.level,
    xp:               player.xp,
    gold:             player.gold,
    maxhp:            player.maxHp,
    hp:               player.hp,
    stats:            player.stats,
    statpoints:       player.statPoints,
    maxunlockedzone:  player.maxUnlockedZone,
    equippedweapon:   player.equippedWeapon,
    arsenal:          player.arsenal,
    abilities:        player.abilities,
    inventory:        player.inventory,
    nftitems:         player.nftItems,
    ubibuffactive:    player.ubiBuffActive,
    ubibuffexpiresat: player.ubiBuffExpiresAt,
    activeability:    player.activeAbility ?? null,
    pendingrewards:   player.pendingRewards ?? [],
    onboarded:        player.onboarded ?? false,
    zone_progress:    player.zoneProgress ?? {},
    current_zone:     player.currentZone ?? null,
    lastprogresssync: player.lastProgressSync ?? null,
  };
}

export const dbService = {
  isMocked: !isConfigured,

  // Checks Supabase ONLY — used for wallet auth so localStorage can't ghost-login a player.
  async getPlayerFromDB(walletAddress: string): Promise<PlayerData | null> {
    const address = walletAddress.toLowerCase();
    if (!supabase) return null;
    const { data, error } = await supabase.from('players').select('*').eq('wallet_address', address).maybeSingle();
    if (error || !data) return null;
    return withDefaults(data);
  },

  async getPlayer(walletAddress: string): Promise<PlayerData | null> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      const { data, error } = await supabase.from('players').select('*').eq('wallet_address', address).maybeSingle();
      if (!error && data) return withDefaults(data);
    }
    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    return players[address] ? withDefaults(players[address]) : null;
  },

  async savePlayer(player: PlayerData): Promise<PlayerData> {
    const address     = player.wallet_address.toLowerCase();
    const cleanPlayer = withDefaults({ ...player, wallet_address: address });

    if (supabase) {
      const { data, error } = await supabase.from('players').upsert(toDbRow(cleanPlayer)).select().single();
      if (!error && data) return withDefaults(data);
      console.warn('Supabase save failed, falling back to localStorage', error);
    }

    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    players[address] = cleanPlayer;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(players));
    return cleanPlayer;
  },

  // Record an NFT mint against a player profile (appends to nftItems array)
  async recordNFTMint(walletAddress: string, nftItem: NftItem): Promise<void> {
    const address = walletAddress.toLowerCase();
    const player  = await this.getPlayer(address);
    if (!player) return;

    const alreadyRecorded = player.nftItems.some(n => n.itemId === nftItem.itemId);
    if (alreadyRecorded) return;

    const updated = { ...player, nftItems: [...player.nftItems, nftItem] };
    await this.savePlayer(updated);
  },

  // Log a G$ level reward claim to the audit table
  async recordLevelRewardClaim(walletAddress: string, levelId: number, zone: string, amountGd: number, txHash: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('level_reward_claims').upsert({
      wallet_address: walletAddress.toLowerCase(),
      level_id: levelId,
      zone,
      amount_gd: amountGd,
      tx_hash: txHash,
    }, { onConflict: 'wallet_address,level_id' });
  },

  // Save an on-chain progress sync record
  async recordProgressSync(walletAddress: string, level: number, gold: number, txHash: string): Promise<void> {
    const player = await this.getPlayer(walletAddress.toLowerCase());
    if (!player) return;
    const updated = {
      ...player,
      lastProgressSync: { level, gold, txHash, syncedAt: new Date().toISOString() },
    };
    await this.savePlayer(updated);
  },

  async getPlayerByName(name: string): Promise<PlayerData | null> {
    const trimmed = name.trim().toLowerCase();
    if (!trimmed) return null;
    if (supabase) {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .ilike('name', trimmed)
        .neq('wallet_address', 'local_player')
        .maybeSingle();
      if (!error && data) return withDefaults(data);
    }
    // localStorage fallback
    const players = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    const found = Object.values(players).find(
      (p: any) => p.name?.toLowerCase() === trimmed && p.wallet_address !== 'local_player'
    );
    return found ? withDefaults(found as any) : null;
  },

  async getLeaderboard(): Promise<LeaderboardEntry[]> {
    if (supabase) {
      const { data, error } = await supabase.from('leaderboard').select('*').order('score', { ascending: false }).limit(10);
      if (!error && data) return data as LeaderboardEntry[];
    }
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    return list.sort((a, b) => b.score - a.score).slice(0, 10);
  },

  async updateLeaderboard(walletAddress: string, name: string, score: number, clearIncrement = 0): Promise<void> {
    const address = walletAddress.toLowerCase();
    if (supabase) {
      const { data } = await supabase.from('leaderboard').select('*').eq('wallet_address', address).single();
      await supabase.from('leaderboard').upsert({
        wallet_address: address,
        player_name: name,
        score: Math.max(data?.score || 0, score),
        zone_clears: (data?.zone_clears || 0) + clearIncrement,
        updated_at: new Date().toISOString(),
      });
      return;
    }
    const list: LeaderboardEntry[] = JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]');
    const index = list.findIndex(e => e.wallet_address.toLowerCase() === address);
    if (index >= 0) {
      list[index].score      = Math.max(list[index].score, score);
      list[index].zone_clears += clearIncrement;
      list[index].player_name = name;
    } else {
      list.push({ wallet_address: address, player_name: name, zone_clears: clearIncrement, score });
    }
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list));
  },
};
