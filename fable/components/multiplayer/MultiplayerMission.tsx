'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Heart, Skull, Trophy, LogOut, Loader2, Swords } from 'lucide-react';
import gameBridge from '../../game/systems/GameBridge';
import { avalancheService } from '../../lib/avalanche';
import { dbService } from '../../lib/supabaseClient';
import { ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS } from '../../lib/nft';
import type { PartyPresence } from '../../lib/multiplayer';

// Phaser (imported by MultiplayerGameContainer) touches browser globals at module load
// time, so — same as single-player's GameContainer in app/page.tsx — this must be
// loaded client-only, not through MenuPage's normal (server-rendered) import graph.
const MultiplayerGameContainer = dynamic(() => import('../MultiplayerGameContainer'), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center w-full h-full bg-zinc-950 text-zinc-400 font-mono gap-3">
      <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
      <span>Loading Fable Game Engine...</span>
    </div>
  ),
});

const ZONE_KEY = 'MultiplayerArenaScene';
const zoneReward = ZONE_LEVEL_REWARDS[ZONE_KEY] ?? 0;

interface MultiplayerMissionProps {
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  wallet: string;
  partyId: string;
  isHost: boolean;
  joinedAt: number;
  roster: PartyPresence[];
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onExit: () => void;
}

export default function MultiplayerMission({
  playerData, setPlayerData, wallet, partyId, isHost, joinedAt, roster,
  walletConnected, connectWallet, fableBalance, refreshBalance, onExit,
}: MultiplayerMissionProps) {
  const [hp, setHp] = useState(playerData?.hp ?? 100);
  const [zoneTitle, setZoneTitle] = useState('The Shattered Rift');
  const [cleared, setCleared] = useState<{ score: number; kills: number } | null>(null);
  const [died, setDied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const otherWallets = roster.map(m => m.wallet).filter(w => w !== wallet);

  useEffect(() => {
    const unsubHp = gameBridge.on('player_health_changed', (data: any) => setHp(data.hp));
    const unsubScene = gameBridge.on('scene_changed', (data: any) => setZoneTitle(data.title), true);
    const unsubCleared = gameBridge.on('mp_mission_cleared', (data: any) => setCleared({ score: data?.score ?? 0, kills: data?.kills ?? 0 }));
    const unsubDied = gameBridge.on('player_died', () => setDied(true));
    // Same XP/level-up bookkeeping single-player's HUD does on every kill — without
    // this, co-op kills would earn score/FABLE but never actually level the character,
    // breaking the "everything a player has carries over" premise in the other direction.
    const unsubXP = gameBridge.on('player_xp_gained', (gained: number) => {
      setPlayerData((prev: any) => {
        let newXP = prev.xp + gained;
        let newLevel = prev.level;
        let statPoints = prev.statPoints || 0;
        const xpNeeded = newLevel * 100;
        if (newXP >= xpNeeded) {
          newXP -= xpNeeded;
          newLevel += 1;
          statPoints += 5;
        }
        const updated = { ...prev, xp: newXP, level: newLevel, statPoints };
        dbService.savePlayer(updated);
        return updated;
      });
    });
    return () => { unsubHp(); unsubScene(); unsubCleared(); unsubDied(); unsubXP(); };
  }, []);

  // Player-signed: submit this run's score using a game-server attestation, via the
  // exact same attest-zone-clear route and FableGameSession.clearZone call every
  // single-player zone already uses — MultiplayerArenaScene is just another zoneId
  // (see lib/nft.ts ZONE_LEVEL_IDS), so no new contract or route was needed. FABLE only
  // actually mints once the contract admin configures zoneRewards for this zoneId; the
  // score still submits either way.
  const claimReward = async () => {
    if (submitting || submitted || !cleared) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let addr = wallet;
      if (!walletConnected || !addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) throw new Error('No wallet connected');

      const res = await fetch('/api/attest-zone-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addr, zone: ZONE_KEY, score: cleared.score, action: 'clear' }),
      });
      const attestation = await res.json();
      if (!res.ok) throw new Error(attestation.error || 'Attestation failed');

      const zoneId = ZONE_LEVEL_IDS[ZONE_KEY];
      const { success, hash } = await avalancheService.clearZone(
        addr, zoneId, attestation.score, attestation.deadline, attestation.signature,
      );
      if (!success) throw new Error('Submit tx failed');

      try {
        if (hash) await dbService.recordLevelRewardClaim(addr, zoneId, ZONE_KEY, zoneReward, hash);
        await dbService.updateLeaderboard(addr, playerData.name, cleared.score, 0);
      } catch (mirrorErr) {
        console.error('Supabase mission-clear mirror failed (chain tx already succeeded):', mirrorErr);
      }

      setSubmitted(true);
      await refreshBalance();
    } catch (err) {
      console.error('claimReward failed:', err);
      setSubmitError('Could not submit your score. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 bg-black">
      <MultiplayerGameContainer
        playerData={playerData}
        partyId={partyId}
        wallet={wallet}
        partySize={roster.length || 1}
        isHost={isHost}
        joinedAt={joinedAt}
        otherWallets={otherWallets}
      />

      {/* Minimal in-mission HUD strip */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-black/60 font-mono pointer-events-none">
        <div className="flex items-center gap-2">
          <Heart size={14} className="text-red-400" />
          <span className="text-sm font-bold text-red-300">{Math.max(0, hp)} HP</span>
        </div>
        <span className="text-[11px] text-purple-300 font-bold uppercase tracking-widest">{zoneTitle}</span>
        <span className="text-[10px] text-zinc-400">{roster.length} in party</span>
      </div>

      {died && !cleared && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 font-mono text-center px-4">
          <Skull size={40} className="text-red-500" />
          <span className="text-xl font-extrabold text-red-400">You were downed</span>
          <p className="text-xs text-zinc-400 max-w-xs">Your party can keep fighting without you — co-op revives are coming in a future update.</p>
          <button
            onClick={onExit}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-bold px-5 py-2.5 rounded-xl text-sm"
          >
            <LogOut size={14} /> Exit to Lobby
          </button>
        </div>
      )}

      {cleared && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/85 font-mono text-center px-4">
          <Trophy size={40} className="text-yellow-400" />
          <span className="text-xl font-extrabold text-yellow-300">The Void Titan has fallen!</span>

          <div className="flex gap-3">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex flex-col items-center">
              <span className="text-lg font-extrabold text-yellow-400">{cleared.score.toLocaleString()}</span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Your Score</span>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2 flex flex-col items-center">
              <span className="text-lg font-extrabold text-red-400 flex items-center gap-1"><Swords size={14} /> {cleared.kills}</span>
              <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Your Kills</span>
            </div>
          </div>

          {!submitted ? (
            <>
              <p className="text-xs text-zinc-500 max-w-xs">
                Submit your score to bank it on the leaderboard{zoneReward > 0 ? ` and claim your first-clear ${zoneReward} FABLE reward` : ''}.
              </p>
              {submitError && <p className="text-xs text-red-400">{submitError}</p>}
              <button
                onClick={claimReward}
                disabled={submitting}
                className="flex items-center gap-2 bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 disabled:opacity-50 text-black font-extrabold px-5 py-2.5 rounded-xl text-sm active:scale-95 transition-all"
              >
                {submitting ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : <>Claim & Submit Score</>}
              </button>
            </>
          ) : (
            <>
              <span className="text-xs text-emerald-400 font-bold">Score submitted — balance: {parseFloat(fableBalance).toFixed(2)} FABLE</span>
              <button
                onClick={onExit}
                className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 font-bold px-5 py-2.5 rounded-xl text-sm"
              >
                <LogOut size={14} /> Exit to Lobby
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
