'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Heart, Skull, Trophy, LogOut, Loader2, Swords, AlertTriangle } from 'lucide-react';
import gameBridge from '../../game/systems/GameBridge';
import { audioManager } from '../../lib/audio';
import { avalancheService } from '../../lib/avalanche';
import { dbService } from '../../lib/supabaseClient';
import { ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS } from '../../lib/nft';
import type { PartyPresence } from '../../lib/multiplayer';
import MiniMap from '../MiniMap';
import GameControls from '../GameControls';

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

// MenuPage is what renders this component's own ancestor chain (MenuPage ->
// MultiplayerLobby -> MultiplayerMission) — importing it statically here would be a
// circular import. Dynamic import breaks that cycle at bundle-eval time, the same
// trick used above for MultiplayerGameContainer.
const PauseMenu = dynamic(() => import('../MenuPage'), { ssr: false });

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
  avaxBalance: string;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onExit: () => void;
}

export default function MultiplayerMission({
  playerData, setPlayerData, wallet, partyId, isHost, joinedAt, roster,
  walletConnected, connectWallet, avaxBalance, fableBalance, refreshBalance, onExit,
}: MultiplayerMissionProps) {
  const [hp, setHp] = useState(playerData?.hp ?? 100);
  const [zoneTitle, setZoneTitle] = useState('The Shattered Rift');
  const [cleared, setCleared] = useState<{ score: number; kills: number } | null>(null);
  const [died, setDied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Seeded with our own line the moment we clear, then filled in as teammates' own
  // mp_out_final_stats broadcasts arrive — see CombatScene.resolveBossPhaseDefeat.
  const [partyStats, setPartyStats] = useState<Record<string, { kills: number; score: number }>>({});

  const otherWallets = roster.map(m => m.wallet).filter(w => w !== wallet);
  const nameFor = (w: string) => roster.find(m => m.wallet === w)?.name ?? 'A teammate';

  useEffect(() => {
    const unsubHp = gameBridge.on('player_health_changed', (data: any) => setHp(data.hp));
    const unsubScene = gameBridge.on('scene_changed', (data: any) => setZoneTitle(data.title), true);
    const unsubCleared = gameBridge.on('mp_mission_cleared', (data: any) => {
      const mine = { score: data?.score ?? 0, kills: data?.kills ?? 0 };
      setCleared(mine);
      setPartyStats(prev => ({ ...prev, [wallet]: mine }));
    });
    const unsubFinalStats = gameBridge.on('mp_in_final_stats', (data: { wallet: string; kills: number; score: number }) => {
      setPartyStats(prev => ({ ...prev, [data.wallet]: { kills: data.kills, score: data.score } }));
    });
    const unsubDied = gameBridge.on('player_died', () => setDied(true));
    const unsubMemberDowned = gameBridge.on('mp_member_downed', (data: { wallet: string }) => {
      const name = nameFor(data.wallet);
      setToast(`${name} was downed!`);
      setTimeout(() => setToast(null), 4000);
    });
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
    return () => {
      unsubHp(); unsubScene(); unsubCleared(); unsubFinalStats(); unsubDied();
      unsubMemberDowned(); unsubXP();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      {/* In-mission HUD strip — HP + minimap on the left (mirrors single-player's
          HUD.tsx layout), zone title centered, party count + pause menu on the right */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-start justify-between px-4 py-2 pointer-events-none bg-linear-to-b from-black/80 via-black/30 to-transparent">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-black/60 border border-zinc-800 px-2 py-1 rounded-lg backdrop-blur-md w-fit">
            <Heart size={14} className="text-red-400" />
            <span className="text-sm font-bold text-red-300">{Math.max(0, hp)} HP</span>
          </div>
          <MiniMap />
        </div>

        <span className="text-[11px] text-purple-300 font-bold uppercase tracking-widest mt-1">{zoneTitle}</span>

        <div className="flex flex-col items-end gap-1.5">
          <span className="text-[10px] text-zinc-400">{roster.length} in party</span>
          <button
            onClick={() => {
              audioManager.playSfx('click');
              gameBridge.emit('game_pause');
              audioManager.pauseMusic();
              setPaused(true);
            }}
            className="pointer-events-auto bg-zinc-900 border-2 border-zinc-700 px-3 py-1 text-[10px] font-bold text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors shadow-lg active:scale-95"
            style={{ imageRendering: 'pixelated', fontFamily: 'monospace' }}
          >
            MENU
          </button>
        </div>
      </div>

      {/* Mobile move/aim joysticks + ability button — identical to single-player's */}
      <GameControls />

      {/* "X was downed" toast — z-45 so it's readable over the joystick controls too */}
      {toast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-45 bg-black/85 border-2 border-red-700 text-red-300 px-4 py-2 rounded-lg text-center text-xs font-bold shadow-xl flex items-center gap-2">
          <AlertTriangle size={13} /> {toast}
        </div>
      )}

      {/* Death/victory overlays sit at z-45 — above GameControls' z-40 (the mobile
          joystick previously overlapped the Exit button here, making it hard to tap)
          and above the HUD strip, but below the pause menu (z-50) if both are somehow
          open at once. */}
      {died && !cleared && (
        <div className="absolute inset-0 z-45 flex flex-col items-center justify-center gap-4 bg-black/90 font-mono text-center px-4">
          <Skull size={40} className="text-red-500" />
          <span className="text-xl font-extrabold text-red-400">You were downed</span>
          <p className="text-xs text-zinc-400 max-w-xs">Your party can keep fighting without you — co-op revives are coming in a future update.</p>
          <button
            onClick={onExit}
            className="flex items-center gap-2 bg-linear-to-r from-red-600 to-red-700 hover:brightness-110 text-white font-extrabold px-8 py-3.5 rounded-xl text-base active:scale-95 transition-all shadow-lg shadow-red-950/50"
          >
            <LogOut size={18} /> Exit to Lobby
          </button>
        </div>
      )}

      {cleared && (
        <div className="absolute inset-0 z-45 flex flex-col items-center justify-center gap-4 bg-black/90 font-mono text-center px-4 overflow-y-auto py-8">
          <Trophy size={40} className="text-yellow-400" />
          <span className="text-xl font-extrabold text-yellow-300">The Void Titan has fallen!</span>

          {/* Party summary — everyone's final kills/score, filled in as each player's
              own mp_out_final_stats broadcast arrives (see CombatScene). */}
          <div className="flex flex-col gap-1.5 w-full max-w-xs">
            <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Party Results</span>
            {roster.map(m => {
              const stats = partyStats[m.wallet];
              const isMe = m.wallet === wallet;
              return (
                <div
                  key={m.wallet}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                    isMe ? 'bg-purple-950/40 border-purple-700' : 'bg-zinc-900 border-zinc-800'
                  }`}
                >
                  <span className={`font-bold truncate ${isMe ? 'text-purple-200' : 'text-zinc-300'}`}>
                    {m.name}{isMe && <span className="text-purple-400"> (You)</span>}
                  </span>
                  {stats ? (
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="flex items-center gap-1 text-red-400 font-bold"><Swords size={11} /> {stats.kills}</span>
                      <span className="text-yellow-400 font-bold">{stats.score.toLocaleString()}</span>
                    </span>
                  ) : (
                    <span className="text-zinc-600 italic shrink-0">waiting…</span>
                  )}
                </div>
              );
            })}
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
                className="flex items-center gap-2 bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black font-extrabold px-8 py-3.5 rounded-xl text-base active:scale-95 transition-all shadow-lg shadow-amber-950/50"
              >
                <LogOut size={18} /> Exit to Lobby
              </button>
            </>
          )}
        </div>
      )}

      {/* Pause menu — identical mechanism to single-player's (app/page.tsx): pauses the
          Phaser scene and shows the full menu as an overlay, resuming on close. Pausing
          only ever affects this client's own local scene (each player runs their own
          Phaser instance), so it never blocks or freezes teammates — except that if the
          pausing player is currently the party's spawn authority, enemy spawning for the
          whole party pauses along with their scene until they resume. */}
      {paused && (
        <PauseMenu
          playerData={playerData}
          setPlayerData={setPlayerData}
          walletConnected={walletConnected}
          walletAddress={wallet}
          connectWallet={connectWallet}
          avaxBalance={avaxBalance}
          fableBalance={fableBalance}
          refreshBalance={refreshBalance}
          onStartGame={() => {}} // unreachable — MenuPage only calls this when onClose is absent
          onClose={() => {
            gameBridge.emit('game_resume');
            audioManager.resumeMusic();
            setPaused(false);
          }}
        />
      )}
    </div>
  );
}
