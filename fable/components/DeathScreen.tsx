'use client';

import React, { useState } from 'react';
import gameBridge from '../game/systems/GameBridge';
import { Skull, Loader2, Play, Home } from 'lucide-react';
import { ZONE_LEVEL_IDS, CONTINUE_FEE } from '../lib/nft';
import { avalancheService } from '../lib/avalanche';
import { dbService } from '../lib/supabaseClient';

const ZONE_NAMES: Record<string, string> = {
  SunfallDunesScene: 'Sunfall Dunes',
  EmberFieldsScene: 'Ember Fields',
  AshwaterMarshScene: 'Ashwater Marsh',
  ObsidianPeakScene: 'Obsidian Peak',
};

interface Props {
  zone: string;
  runScore: number;
  enemiesDefeated: number;
  requiredDefeatsToBoss: number;
  bossSpawned: boolean;
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress?: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onQuit: () => void;
  onContinue: () => void;
}

export default function DeathScreen({
  zone, runScore, enemiesDefeated, requiredDefeatsToBoss, bossSpawned,
  playerData, setPlayerData,
  walletAddress, walletConnected, connectWallet, fableBalance, refreshBalance,
  onQuit, onContinue,
}: Props) {
  const [busy, setBusy] = useState<'quit' | 'continue' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canAffordContinue = parseFloat(fableBalance) >= CONTINUE_FEE;

  const getAttestation = async (addr: string, action: 'checkpoint' | 'continue') => {
    const res = await fetch('/api/attest-zone-clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ walletAddress: addr, zone, score: runScore, action }),
    });
    const attestation = await res.json();
    if (!res.ok) throw new Error(attestation.error || 'Attestation failed');
    return attestation;
  };

  const ensureWallet = async (): Promise<string> => {
    let addr = walletAddress;
    if (!walletConnected || !addr) {
      await connectWallet();
      addr = (await avalancheService.getConnectedAddress()) ?? '';
    }
    if (!addr) throw new Error('No wallet connected');
    return addr;
  };

  // Quit: sign a checkpoint (score banked, no FABLE), reset this zone's
  // kill/score progress for next time, return to the menu.
  const handleQuit = async () => {
    if (busy) return;
    setBusy('quit');
    setError(null);
    try {
      const addr = await ensureWallet();
      const attestation = await getAttestation(addr, 'checkpoint');
      const zoneId = ZONE_LEVEL_IDS[zone];
      const success = await avalancheService.submitCheckpoint(
        addr, zoneId, attestation.score, attestation.deadline, attestation.signature,
      );
      if (!success) throw new Error('Submit failed');

      setPlayerData((prev: any) => {
        const zoneProgress = { ...(prev.zoneProgress || {}) };
        delete zoneProgress[zone];
        const updated = { ...prev, zoneProgress, hp: prev.maxHp };
        dbService.savePlayer(updated);
        return updated;
      });

      gameBridge.emit('quit_run');
      gameBridge.emit('open_menu');
      onQuit();
    } catch (err) {
      console.error('handleQuit failed:', err);
      setError('Could not save your score. Try again.');
    } finally {
      setBusy(null);
    }
  };

  // Continue: sign + burn the flat continue fee, banking the score so far,
  // then revive the same scene in place — kill count and score untouched.
  const handleContinue = async () => {
    if (busy || !canAffordContinue) return;
    setBusy('continue');
    setError(null);
    try {
      const addr = await ensureWallet();
      const attestation = await getAttestation(addr, 'continue');
      const zoneId = ZONE_LEVEL_IDS[zone];
      const success = await avalancheService.continueRun(
        addr, zoneId, attestation.score, attestation.deadline, attestation.signature,
      );
      if (!success) throw new Error('Continue failed');

      await refreshBalance();
      setPlayerData((prev: any) => ({ ...prev, hp: prev.maxHp }));
      gameBridge.emit('continue_run');
      onContinue();
    } catch (err) {
      console.error('handleContinue failed:', err);
      setError('Could not process payment. Try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 bg-black/95 flex flex-col items-center justify-center font-mono pointer-events-auto">
      <div className="w-full max-w-sm flex flex-col gap-4 px-6 py-6">

        {/* Header */}
        <div className="text-center flex flex-col gap-1">
          <div className="flex items-center justify-center gap-2">
            <Skull size={22} className="text-red-500" />
            <h2 className="text-xl font-extrabold text-red-500 tracking-widest">YOU DIED</h2>
          </div>
          <p className="text-zinc-400 text-xs">{ZONE_NAMES[zone] ?? zone}</p>
        </div>

        {/* Run summary */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-bold">Score this run</span>
            <span className="font-bold text-emerald-400">{runScore.toLocaleString()} pts</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-zinc-400 font-bold">Progress</span>
            <span className="font-bold text-white">
              {bossSpawned ? 'Boss fight' : `${enemiesDefeated} / ${requiredDefeatsToBoss} imps`}
            </span>
          </div>
        </div>

        {error && (
          <p className="text-center text-[10px] text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg py-2">{error}</p>
        )}

        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={!!busy || !canAffordContinue}
          className={`w-full py-3.5 rounded-xl text-sm font-extrabold tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg ${
            canAffordContinue
              ? 'bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 text-black shadow-amber-900/30'
              : 'bg-zinc-800 text-red-400 border border-red-900/40 cursor-not-allowed'
          }`}
        >
          {busy === 'continue'
            ? <><Loader2 size={16} className="animate-spin" /> Signing…</>
            : <><Play size={15} /> {canAffordContinue ? `Continue — ${CONTINUE_FEE} FABLE` : `Need ${CONTINUE_FEE} FABLE`}</>
          }
        </button>
        <p className="text-center text-[9px] text-zinc-600 -mt-2">Resumes right where you fell — kills and score intact</p>

        {/* Quit */}
        <button
          onClick={handleQuit}
          disabled={!!busy}
          className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 active:scale-95 transition-all border border-zinc-700"
        >
          {busy === 'quit'
            ? <><Loader2 size={16} className="animate-spin" /> Signing…</>
            : <><Home size={15} /> Quit to Menu</>
          }
        </button>
        <p className="text-center text-[9px] text-zinc-600 -mt-2">Signs your score to the leaderboard — this zone resets to 0 kills next time</p>
      </div>
    </div>
  );
}
