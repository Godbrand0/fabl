import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export type PartyStatus = 'forming' | 'ready_check' | 'in_mission' | 'completed' | 'abandoned';

// Thrown for expected, user-facing failures (bad code, full party, ...) so callers can
// show the message directly. Anything else (network errors, etc.) should fall back to a
// generic message instead of leaking raw exception text into the UI.
export class MpError extends Error {}

export interface MpParty {
  id: string;
  code: string;
  host_wallet: string;
  zone: string | null;
  max_players: number;
  status: PartyStatus;
}

export interface PartyPresence {
  wallet: string;
  name: string;
  level: number;
  maxUnlockedZone: number;
  ready: boolean;
  /** Date.now() when this client first tracked presence — used to pick a deterministic
   *  fallback host (earliest joiner still connected) if the original host disconnects. */
  joinedAt: number;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

export const mpService = {
  get isAvailable(): boolean {
    return !!supabase;
  },

  async createParty(hostWallet: string, maxPlayers: 2 | 3 = 3): Promise<MpParty> {
    if (!supabase) throw new MpError('Multiplayer requires Supabase to be configured.');
    // Retry a few times on the unlikely event of a code collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { data, error } = await supabase
        .from('mp_parties')
        .insert({ code, host_wallet: hostWallet.toLowerCase(), max_players: maxPlayers })
        .select()
        .single();
      if (!error && data) {
        await this.joinParty(data.id, hostWallet);
        return data as MpParty;
      }
      if (error && error.code !== '23505') throw error; // not a unique-violation, bail
    }
    throw new MpError('Could not allocate a unique party code, please try again.');
  },

  async joinByCode(code: string, wallet: string): Promise<MpParty> {
    if (!supabase) throw new MpError('Multiplayer requires Supabase to be configured.');
    const { data: party, error } = await supabase
      .from('mp_parties')
      .select('*')
      .eq('code', code.trim().toUpperCase())
      .maybeSingle();
    if (error || !party) throw new MpError('No party found with that code.');
    if (party.status !== 'forming') throw new MpError('That party has already started.');

    const { count } = await supabase
      .from('mp_party_members')
      .select('*', { count: 'exact', head: true })
      .eq('party_id', party.id)
      .is('left_at', null);
    if ((count ?? 0) >= party.max_players) throw new MpError('That party is full.');

    await this.joinParty(party.id, wallet);
    return party as MpParty;
  },

  async joinParty(partyId: string, wallet: string): Promise<void> {
    if (!supabase) return;
    await supabase
      .from('mp_party_members')
      .upsert(
        { party_id: partyId, wallet_address: wallet.toLowerCase(), left_at: null },
        { onConflict: 'party_id,wallet_address' }
      );
  },

  async leaveParty(partyId: string, wallet: string): Promise<void> {
    if (!supabase) return;
    await supabase
      .from('mp_party_members')
      .update({ left_at: new Date().toISOString() })
      .eq('party_id', partyId)
      .eq('wallet_address', wallet.toLowerCase());
  },

  async setZone(partyId: string, zone: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('mp_parties').update({ zone }).eq('id', partyId);
  },

  async setReady(partyId: string, wallet: string, ready: boolean): Promise<void> {
    if (!supabase) return;
    await supabase
      .from('mp_party_members')
      .update({ is_ready: ready })
      .eq('party_id', partyId)
      .eq('wallet_address', wallet.toLowerCase());
  },

  async startMission(party: MpParty, participantWallets: string[]): Promise<string> {
    if (!supabase) throw new MpError('Multiplayer requires Supabase to be configured.');
    await supabase.from('mp_parties').update({ status: 'in_mission' }).eq('id', party.id);
    const { data, error } = await supabase
      .from('mp_missions')
      .insert({
        party_id: party.id,
        zone: party.zone,
        participant_wallets: participantWallets.map(w => w.toLowerCase()),
      })
      .select()
      .single();
    if (error || !data) throw error ?? new Error('Failed to start mission');
    return data.id as string;
  },

  /**
   * Opens a Realtime channel for a party's lobby + mission lifetime. Presence is keyed
   * by wallet address (not left to an auto-generated per-socket id) so every client's
   * roster entry lands under one stable key regardless of which channel instance —
   * lobby's or the mission's separate NetworkBridge one — happens to be tracking it.
   */
  channel(partyId: string, presenceKey: string): RealtimeChannel {
    if (!supabase) throw new MpError('Multiplayer requires Supabase to be configured.');
    return supabase.channel(`party:${partyId}`, { config: { presence: { key: presenceKey } } });
  },

  /**
   * Fully tears down a channel — unlike `channel.unsubscribe()` alone, this also drops
   * it from the client's internal channel registry. Skipping this leaves stale
   * bookkeeping for the topic name behind, which makes a fresh `channel()` call for the
   * same topic (e.g. a quick start/stop/start from a React effect re-running) throw
   * "cannot add callbacks after subscribe()" even though it's a brand new object.
   */
  async removeChannel(ch: RealtimeChannel): Promise<void> {
    if (!supabase) return;
    await supabase.removeChannel(ch);
  },
};
