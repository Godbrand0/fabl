'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { Copy, Users, Play, LogOut, CheckCircle2, Skull } from 'lucide-react';
import { mpService, MpParty, MpError, PartyPresence } from '../../lib/multiplayer';
import PartyMemberCard from './PartyMemberCard';
import MultiplayerMission from './MultiplayerMission';

const ARENA_SCENE_KEY = 'MultiplayerArenaScene';

interface MultiplayerLobbyProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  avaxBalance: string;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  showMessage: (msg: string) => void;
}

type Stage = 'menu' | 'lobby' | 'mission';

export default function MultiplayerLobby({
  playerData, setPlayerData, walletAddress, walletConnected, connectWallet, avaxBalance, fableBalance, refreshBalance, showMessage,
}: MultiplayerLobbyProps) {
  const [stage, setStage] = useState<Stage>('menu');
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [party, setParty] = useState<MpParty | null>(null);
  const [roster, setRoster] = useState<PartyPresence[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const wallet = (walletAddress || playerData?.wallet_address || '').toLowerCase();
  // Stable across re-renders (unlike a plain Date.now() call in myPresence below) so a
  // client's join-order position doesn't drift every time this component re-renders —
  // that stability is what host migration's "earliest joiner" tie-break depends on.
  const joinedAtRef = useRef(Date.now());

  const myPresence: PartyPresence = {
    wallet,
    name: playerData?.name ?? 'Hero',
    level: playerData?.level ?? 1,
    maxUnlockedZone: playerData?.maxUnlockedZone ?? 1,
    ready: false,
    joinedAt: joinedAtRef.current,
  };

  const teardownChannel = useCallback(async () => {
    if (channelRef.current) {
      const ch = channelRef.current;
      channelRef.current = null;
      // removeChannel (not just unsubscribe) so a quick leave-then-rejoin of the same
      // party — or, on starting a mission, NetworkBridge opening its own channel for
      // this same topic right after — doesn't trip Supabase's "cannot add callbacks
      // after subscribe()" on the fresh channel object. Returns a promise so callers
      // that need the old channel *fully* gone before opening a new one can await it.
      await mpService.removeChannel(ch);
    }
  }, []);

  useEffect(() => () => { teardownChannel(); }, [teardownChannel]);

  const openChannel = useCallback((partyId: string, ready: boolean) => {
    teardownChannel();
    const ch = mpService.channel(partyId, wallet);
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState<PartyPresence>();
      // Each connection key can hold multiple metas (every track() call appends
      // rather than replaces) — the last one is always the most recent, which is
      // what re-tracking on ready-toggle relies on to actually update the roster.
      const members = Object.values(state).map(entries => entries[entries.length - 1]).filter(Boolean);
      members.sort((a, b) => a.wallet.localeCompare(b.wallet));
      setRoster(members);
    });
    // The host is the only one who calls startMission() — everyone else only finds out
    // the mission actually began via this broadcast. Without it, non-host members just
    // sit in the lobby forever while the host plays alone.
    ch.on('broadcast', { event: 'mission_started' }, async () => {
      await teardownChannel();
      setStage('mission');
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await ch.track({ ...myPresence, ready });
      }
    });
    channelRef.current = ch;
  }, [teardownChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    if (!wallet) { showMessage('Connect your wallet to play multiplayer.'); return; }
    setBusy(true);
    try {
      const p = await mpService.createParty(wallet, 3);
      await mpService.setZone(p.id, ARENA_SCENE_KEY);
      setParty({ ...p, zone: ARENA_SCENE_KEY });
      setStage('lobby');
      openChannel(p.id, false);
    } catch (err: any) {
      console.error('createParty failed:', err);
      showMessage(err instanceof MpError ? err.message : 'Could not create party. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!wallet) { showMessage('Connect your wallet to play multiplayer.'); return; }
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const p = await mpService.joinByCode(joinCode, wallet);
      setParty(p);
      setStage('lobby');
      openChannel(p.id, false);
    } catch (err: any) {
      console.error('joinByCode failed:', err);
      showMessage(err instanceof MpError ? err.message : 'Could not join that party. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (party) await mpService.leaveParty(party.id, wallet);
    teardownChannel();
    setParty(null);
    setRoster([]);
    setStage('menu');
    setJoinCode('');
  };

  const toggleReady = async () => {
    if (!party || !channelRef.current) return;
    const me = roster.find(m => m.wallet === wallet);
    const nextReady = !me?.ready;
    await channelRef.current.track({ ...myPresence, ready: nextReady });
    await mpService.setReady(party.id, wallet, nextReady);
  };

  const isHost = !!party && wallet === party.host_wallet;
  const allReady = roster.length >= 2 && roster.every(m => m.ready);

  const startMission = async () => {
    if (!party || !isHost || !allReady) return;
    setBusy(true);
    try {
      await mpService.startMission(party, roster.map(m => m.wallet));
      // Tell the rest of the party the mission actually began — without this only the
      // host (who called this function) would ever leave the lobby screen.
      channelRef.current?.send({ type: 'broadcast', event: 'mission_started', payload: {} });
      // Hand the party:${partyId} topic off cleanly to NetworkBridge's own mission-long
      // channel — leaving the lobby's channel open here is what caused the "cannot add
      // presence callbacks after subscribe()" crash the first time this shipped.
      await teardownChannel();
      setStage('mission');
    } catch (err: any) {
      console.error('startMission failed:', err);
      showMessage(err instanceof MpError ? err.message : 'Could not start the mission. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!mpService.isAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-zinc-500">
        <span className="text-4xl">🌐</span>
        <span className="text-sm font-bold text-zinc-300">Multiplayer Unavailable</span>
        <p className="text-xs max-w-xs">Multiplayer requires the game to be connected to Supabase.</p>
      </div>
    );
  }

  if (stage === 'mission' && party) {
    return (
      <MultiplayerMission
        playerData={playerData}
        setPlayerData={setPlayerData}
        wallet={wallet}
        partyId={party.id}
        isHost={isHost}
        joinedAt={joinedAtRef.current}
        roster={roster}
        walletConnected={walletConnected}
        connectWallet={connectWallet}
        avaxBalance={avaxBalance}
        fableBalance={fableBalance}
        refreshBalance={refreshBalance}
        onExit={() => setStage('lobby')}
      />
    );
  }

  if (stage === 'menu') {
    return (
      <div className="flex flex-col gap-5 w-full max-w-sm mx-auto">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-extrabold text-yellow-400 uppercase tracking-[0.18em] flex items-center gap-1.5">
            <Users size={12} /> Co-op Missions
          </span>
          <h2 className="text-2xl font-extrabold text-transparent bg-clip-text bg-linear-to-r from-yellow-300 to-amber-600 leading-tight">
            Multiplayer
          </h2>
          <span className="text-[11px] text-zinc-500">Team up with 1-2 other adventurers and take on The Shattered Rift together.</span>
        </div>

        <div className="flex items-center gap-2.5 bg-purple-950/25 border border-purple-800/40 rounded-xl px-3.5 py-2.5">
          <Skull size={16} className="text-purple-400 shrink-0" />
          <div className="flex flex-col">
            <span className="text-xs font-bold text-purple-200">The Shattered Rift</span>
            <span className="text-[10px] text-zinc-500">Void Imps swarm in force, and the Void Titan returns across 3 lives before it finally falls.</span>
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 disabled:opacity-40 text-black font-extrabold py-3 rounded-xl text-sm tracking-wider active:scale-95 transition-all"
        >
          Create Party
        </button>

        <div className="flex flex-col gap-2">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Have a party code?</span>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={5}
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm font-mono tracking-widest text-zinc-100 uppercase focus:outline-none focus:border-purple-600"
            />
            <button
              onClick={handleJoin}
              disabled={busy || !joinCode.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold px-4 rounded-lg text-xs"
            >
              Join
            </button>
          </div>
        </div>
      </div>
    );
  }

  // stage === 'lobby'
  return (
    <div className="flex flex-col gap-4 w-full max-w-lg mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Party Code</span>
          <div className="flex items-center gap-2">
            <span className="text-xl font-extrabold text-yellow-400 tracking-[0.25em]">{party?.code}</span>
            <button
              onClick={() => {
                if (party) { navigator.clipboard.writeText(party.code); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }
              }}
              className="text-zinc-500 hover:text-white"
            >
              <Copy size={13} />
            </button>
            {codeCopied && <span className="text-[9px] text-emerald-400 font-bold">Copied!</span>}
          </div>
        </div>
        <button onClick={handleLeave} className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-500 hover:text-red-400 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg">
          <LogOut size={11} /> Leave
        </button>
      </div>

      <div className="flex items-center gap-2.5 bg-purple-950/25 border border-purple-800/40 rounded-xl px-3.5 py-2.5">
        <Skull size={16} className="text-purple-400 shrink-0" />
        <span className="text-xs font-bold text-purple-200">Mission: The Shattered Rift</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[10px] text-zinc-400 font-semibold tracking-wider">Party ({roster.length}/{party?.max_players ?? 3})</span>
        <div className="flex flex-col gap-2">
          {roster.map(m => (
            <PartyMemberCard key={m.wallet} member={m} isHost={m.wallet === party?.host_wallet} isSelf={m.wallet === wallet} />
          ))}
          {roster.length === 0 && <span className="text-xs text-zinc-600 italic">Waiting for party members to connect…</span>}
        </div>
      </div>

      <div className="flex gap-2 mt-1">
        <button
          onClick={toggleReady}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl text-sm font-extrabold tracking-wider active:scale-95 transition-all ${
            roster.find(m => m.wallet === wallet)?.ready
              ? 'bg-emerald-900/50 border border-emerald-700 text-emerald-300'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          <CheckCircle2 size={15} /> {roster.find(m => m.wallet === wallet)?.ready ? 'Ready!' : 'Ready Up'}
        </button>

        {isHost && (
          <button
            onClick={startMission}
            disabled={busy || !allReady}
            className="flex-1 flex items-center justify-center gap-1.5 bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 disabled:opacity-30 text-black font-extrabold py-3 rounded-xl text-sm tracking-wider active:scale-95 transition-all"
          >
            <Play size={15} /> Start Mission
          </button>
        )}
      </div>
    </div>
  );
}
