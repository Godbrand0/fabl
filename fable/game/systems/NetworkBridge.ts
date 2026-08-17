import { RealtimeChannel } from '@supabase/supabase-js';
import gameBridge from './GameBridge';
import { mpService } from '../../lib/multiplayer';

interface MissionPresence {
  wallet: string;
  joinedAt: number;
}

// Owns the single Supabase Realtime channel for an active mission and translates
// between it and the local (in-tab, non-networked) GameBridge. Phaser scenes never
// touch Supabase directly — they just emit/listen on GameBridge as usual, which is
// what keeps CombatScene usable with or without multiplayer wired up.
//
// Also owns host migration: every client tracks {wallet, joinedAt} Presence on this
// channel, and independently (no coordinator) computes "am I the earliest joiner still
// connected?" on every Presence sync. If the answer flips to yes, CombatScene is told
// to take over spawn authority; if the previous authority's wallet disappears from
// Presence, that's exactly the case that triggers the flip on whoever's next in line.
class NetworkBridge {
  private channel: RealtimeChannel | null = null;
  private unsubs: Array<() => void> = [];
  private knownWallets: Set<string> = new Set();
  private amIAuthority = false;
  // Guards against React effects double-firing in dev (Strict Mode intentionally
  // mounts twice) or any other rapid start/stop/start: without this, a slower-to-settle
  // earlier start() could finish its work after a newer one and clobber it, or a fresh
  // channel could get subscribed before the previous one for the same topic finished
  // unsubscribing — Supabase then rejects new `.on('presence', ...)` registrations on
  // it with "cannot add callbacks after subscribe()".
  private generation = 0;

  async start(partyId: string, wallet: string, joinedAt: number) {
    const myGeneration = ++this.generation;
    await this.stop();
    if (myGeneration !== this.generation) return; // superseded by a newer start() already

    // Never let a missing/misconfigured Supabase client take down the mission mount —
    // local play (movement, combat, the host's own enemy simulation) still works fine
    // standalone; it just won't have anyone to sync with.
    if (!mpService.isAvailable) {
      console.warn('NetworkBridge: Supabase not configured, running without multiplayer sync.');
      return;
    }

    const ch = mpService.channel(partyId, wallet);

    ch.on('broadcast', { event: 'pos' }, ({ payload }: any) => {
      if (payload?.wallet === wallet) return;
      gameBridge.emit('mp_in_pos', payload);
    });
    ch.on('broadcast', { event: 'boss_phase_defeat' }, ({ payload }: any) => {
      gameBridge.emit('mp_boss_phase_defeat', payload);
    });
    ch.on('broadcast', { event: 'enemy_spawn' }, ({ payload }: any) => {
      gameBridge.emit('mp_in_enemy_spawn', payload);
    });
    ch.on('broadcast', { event: 'enemy_snapshot' }, ({ payload }: any) => {
      gameBridge.emit('mp_in_enemy_snapshot', payload);
    });
    ch.on('broadcast', { event: 'enemy_damage' }, ({ payload }: any) => {
      gameBridge.emit('mp_in_enemy_damage', payload);
    });
    ch.on('broadcast', { event: 'enemy_removed' }, ({ payload }: any) => {
      gameBridge.emit('mp_in_enemy_removed', payload);
    });
    ch.on('broadcast', { event: 'enemy_shot' }, ({ payload }: any) => {
      gameBridge.emit('mp_in_enemy_shot', payload);
    });
    ch.on('broadcast', { event: 'request_state' }, ({ payload }: any) => {
      if (payload?.wallet === wallet) return;
      gameBridge.emit('mp_in_request_state', payload);
    });
    ch.on('broadcast', { event: 'state_snapshot' }, ({ payload }: any) => {
      if (payload?.wallet === wallet) return;
      gameBridge.emit('mp_in_state_snapshot', payload);
    });

    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<MissionPresence>();
      // Same "last meta per key wins" rule as the lobby roster — see MultiplayerLobby.
      const members = Object.values(state).map(entries => entries[entries.length - 1]).filter(Boolean);
      const presentWallets = new Set(members.map(m => m.wallet));

      // Anyone who was here and now isn't just disconnected — ghost their sprite
      // immediately rather than waiting out RemotePartyMember's staleness timer.
      this.knownWallets.forEach(w => {
        if (w !== wallet && !presentWallets.has(w)) gameBridge.emit('mp_member_left', { wallet: w });
      });
      this.knownWallets = presentWallets;

      // Deterministic, coordinator-free host pick: earliest joiner still connected.
      // Every remaining client computes this the same way from the same Presence
      // state, so exactly one of them concludes "that's me" on any given sync.
      if (members.length > 0) {
        const earliest = [...members].sort((a, b) => a.joinedAt - b.joinedAt)[0];
        const shouldBeAuthority = earliest.wallet === wallet;
        if (shouldBeAuthority !== this.amIAuthority) {
          this.amIAuthority = shouldBeAuthority;
          gameBridge.emit('mp_local_role_changed', { isHost: shouldBeAuthority });
        }
      }
    });

    ch.subscribe(async (status) => {
      if (myGeneration !== this.generation) return; // this channel was already superseded/stopped
      if (status === 'SUBSCRIBED') {
        await ch.track({ wallet, joinedAt });
        // Catch up on anything already in progress (enemies spawned, boss phase) —
        // a no-op if nobody with authority is listening yet, e.g. we're the first here.
        ch.send({ type: 'broadcast', event: 'request_state', payload: { wallet } });
      }
    });
    this.channel = ch;

    // Outbound: local scene state -> network. Fire-and-forget sends — a slow local
    // socket only delays this client's own outgoing updates, it never blocks Supabase
    // from relaying other clients' messages to everyone else.
    const relay = (out: string, event: string) =>
      gameBridge.on(out, (payload: any) => {
        this.channel?.send({ type: 'broadcast', event, payload });
      });

    this.unsubs = [
      gameBridge.on('mp_out_pos', (payload: any) => {
        this.channel?.send({ type: 'broadcast', event: 'pos', payload: { ...payload, wallet } });
      }),
      relay('mp_out_boss_phase_defeat', 'boss_phase_defeat'),
      relay('mp_out_enemy_spawn', 'enemy_spawn'),
      relay('mp_out_enemy_snapshot', 'enemy_snapshot'),
      relay('mp_out_enemy_damage', 'enemy_damage'),
      relay('mp_out_enemy_removed', 'enemy_removed'),
      relay('mp_out_enemy_shot', 'enemy_shot'),
      gameBridge.on('mp_out_state_snapshot', (payload: any) => {
        this.channel?.send({ type: 'broadcast', event: 'state_snapshot', payload: { ...payload, wallet } });
      }),
    ];
  }

  async stop() {
    this.unsubs.forEach(unsub => unsub());
    this.unsubs = [];
    this.knownWallets.clear();
    this.amIAuthority = false;
    if (this.channel) {
      const ch = this.channel;
      this.channel = null;
      // Wait for the teardown to actually complete before any caller (e.g. a follow-up
      // start() for the same topic) proceeds — see the `generation` comment.
      try { await mpService.removeChannel(ch); } catch { /* already gone, nothing to do */ }
    }
  }
}

export const networkBridge = new NetworkBridge();
export default networkBridge;
