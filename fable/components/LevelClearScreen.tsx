'use client';

import React, { useState } from 'react';
import gameBridge from '../game/systems/GameBridge';
import { Heart, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { ZONE_LEVEL_IDS, ZONE_LEVEL_REWARDS, ZONE_ENTRY_FEE, FABLE_ITEMS } from '../lib/nft';
import { avalancheService } from '../lib/avalanche';
import { dbService } from '../lib/supabaseClient';

const ZONE_PROGRESSION: Record<string, string> = {
  SunfallDunesScene: 'EmberFieldsScene',
  EmberFieldsScene: 'AshwaterMarshScene',
  AshwaterMarshScene: 'ObsidianPeakScene',
};

const ZONE_NAMES: Record<string, string> = {
  SunfallDunesScene: 'Sunfall Dunes',
  EmberFieldsScene: 'Ember Fields',
  AshwaterMarshScene: 'Ashwater Marsh',
  ObsidianPeakScene: 'Obsidian Peak',
};

const POTIONS = FABLE_ITEMS.filter(i => i.heal || i.fullHeal);

interface Props {
  clearedZone: string;
  runScore: number;
  playerData: any;
  setPlayerData: React.Dispatch<React.SetStateAction<any>>;
  walletAddress?: string;
  walletConnected: boolean;
  connectWallet: () => Promise<void>;
  fableBalance: string;
  refreshBalance: () => Promise<void>;
  onContinue: () => void;
}

export default function LevelClearScreen({
  clearedZone, runScore, playerData, setPlayerData,
  walletAddress, walletConnected, connectWallet, fableBalance, refreshBalance,
  onContinue,
}: Props) {
  const [selected, setSelected]     = useState<string | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);
  const [buyingPotion, setBuyingPotion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [entering, setEntering]     = useState(false);

  const nextScene    = ZONE_PROGRESSION[clearedZone];
  const nextZoneName = nextScene ? ZONE_NAMES[nextScene] : '';
  const isFinalZone  = clearedZone === 'ObsidianPeakScene';
  const zoneReward   = ZONE_LEVEL_REWARDS[clearedZone] ?? 0;

  const selectedPotion = POTIONS.find(p => p.id === selected) ?? null;
  const canAfford = selectedPotion ? parseFloat(fableBalance) >= selectedPotion.fableCost : false;

  // Player-signed: spend FABLE on a potion via FableShop.buyItem — real burn, real tx.
  const buySelected = async () => {
    if (!selectedPotion || !canAfford || buyingPotion) return;
    setBuyingPotion(true);
    try {
      let addr = walletAddress;
      if (!walletConnected || !addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) return;

      const success = await avalancheService.buyShopItem(addr, selectedPotion.itemId);
      if (!success) return;

      await refreshBalance();
      setPlayerData((prev: any) => {
        const newHP = selectedPotion.fullHeal ? prev.maxHp : Math.min(prev.maxHp, prev.hp + (selectedPotion.heal ?? 0));
        const updated = { ...prev, hp: newHP };
        dbService.savePlayer(updated);
        return updated;
      });
      setJustBought(selectedPotion.id);
      setSelected(null);
    } catch (err) {
      console.error('buySelected failed:', err);
    } finally {
      setBuyingPotion(false);
    }
  };

  // Player-signed: submit this run's score using a game-server attestation.
  // Repeatable every clear — the zone's fixed FABLE reward only mints the
  // first time this player clears this zone (enforced on-chain, not here).
  // Falls back to `pendingRewards` (claimable later from the Bank) if the
  // tx fails or is skipped — that fallback only ever covers the FABLE side.
  const submitScore = async () => {
    if (submitting || submitted) return;
    setSubmitting(true);
    try {
      let addr = walletAddress;
      if (!walletConnected || !addr) {
        await connectWallet();
        addr = (await avalancheService.getConnectedAddress()) ?? '';
      }
      if (!addr) throw new Error('No wallet connected');

      const res = await fetch('/api/attest-zone-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addr, zone: clearedZone, score: runScore }),
      });
      const attestation = await res.json();
      if (!res.ok) throw new Error(attestation.error || 'Attestation failed');

      const zoneId = ZONE_LEVEL_IDS[clearedZone];
      const success = await avalancheService.clearZone(
        addr, zoneId, attestation.score, attestation.deadline, attestation.signature,
      );
      if (!success) throw new Error('Submit tx failed');

      setSubmitted(true);
      await refreshBalance();
    } catch (err) {
      console.error('submitScore failed, deferring FABLE claim to Bank:', err);
      // Fall back to the deferred claim path so a first-clear reward isn't lost.
      setPlayerData((prev: any) => {
        const pending = [...(prev.pendingRewards || [])];
        if (!pending.includes(clearedZone)) pending.push(clearedZone);
        return { ...prev, pendingRewards: pending };
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (nextScene) {
      // Player-signed: enter the next zone. Best-effort — never block progression on it.
      setEntering(true);
      try {
        let addr = walletAddress;
        if (!walletConnected || !addr) {
          await connectWallet();
          addr = (await avalancheService.getConnectedAddress()) ?? '';
        }
        if (addr) await avalancheService.enterZone(addr, ZONE_LEVEL_IDS[nextScene]);
      } catch (err) {
        console.error('enterZone failed (continuing anyway):', err);
      } finally {
        setEntering(false);
      }
      gameBridge.emit('proceed_to_next_zone', { targetScene: nextScene });
    } else {
      // Final zone cleared — nothing left to fight, send the player to the menu.
      gameBridge.emit('open_menu');
    }
    onContinue();
  };

  const hpPct = Math.min(100, (playerData.hp / playerData.maxHp) * 100);

  return (
    <div className="absolute inset-0 z-50 bg-black/92 flex flex-col items-center justify-center font-mono pointer-events-auto">
      <div className="w-full max-w-sm max-h-full overflow-y-auto flex flex-col gap-4 px-6 py-6">

        {/* Header */}
        <div className="text-center flex flex-col gap-1">
          <div className="flex items-center justify-center gap-2">
            <CheckCircle2 size={22} className="text-yellow-400" />
            <h2 className="text-xl font-extrabold text-yellow-400 tracking-widest">ZONE CLEARED!</h2>
          </div>
          <p className="text-zinc-400 text-xs">{ZONE_NAMES[clearedZone] ?? clearedZone} conquered</p>
        </div>

        {/* Score / FABLE Reward Banner */}
        <div className="rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-all border-emerald-500 bg-emerald-950/40">
          <span className="text-2xl shrink-0">🏆</span>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-extrabold text-emerald-400">{runScore.toLocaleString()} points earned!</p>
            <p className="text-[10px] text-zinc-400">
              {submitted
                ? `Submitted to the leaderboard${zoneReward > 0 ? ' — FABLE claimed if this was your first clear.' : '.'}`
                : `Sign to post your score${zoneReward > 0 ? ` (+${zoneReward.toLocaleString()} FABLE on your first clear)` : ''}, or skip and claim any FABLE later from the Bank.`}
            </p>
          </div>
          {!submitted && (
            <button
              onClick={submitScore}
              disabled={submitting}
              className="shrink-0 flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-[10px] font-bold px-3 py-2 rounded-lg active:scale-95 transition-all"
            >
              {submitting ? <Loader2 size={12} className="animate-spin" /> : 'Submit'}
            </button>
          )}
        </div>

        {/* HP status */}
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="flex items-center gap-1.5 text-zinc-400 font-bold">
              <Heart size={12} className="text-red-400" /> HP Remaining
            </span>
            <span className="font-bold text-white">{playerData.hp} / {playerData.maxHp}</span>
          </div>
          <div className="w-full bg-zinc-800 h-2 rounded overflow-hidden">
            <div className="bg-red-500 h-full transition-all" style={{ width: `${hpPct}%` }} />
          </div>
        </div>

        {/* Potion Shop */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">Potion Shop</p>
            <span className="text-[10px] text-purple-300 font-bold">{parseFloat(fableBalance).toFixed(2)} FABLE</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {POTIONS.map(p => {
              const affordable  = parseFloat(fableBalance) >= p.fableCost;
              const isSelected  = selected === p.id;
              const wasBought   = justBought === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(isSelected ? null : p.id)}
                  disabled={!affordable}
                  className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-center transition-all select-none
                    ${isSelected ? 'bg-purple-950/60 border-purple-500 scale-105 shadow-lg' : affordable ? 'bg-zinc-900 border-zinc-700 hover:border-zinc-500' : 'bg-zinc-900/50 border-zinc-800 opacity-40 cursor-not-allowed'}
                  `}
                >
                  <Heart size={18} className={isSelected ? 'text-white' : 'text-zinc-400'} />
                  <span className={`text-[9px] font-bold leading-tight ${isSelected ? 'text-white' : 'text-zinc-300'}`}>{p.name}</span>
                  <span className={`text-[8px] ${isSelected ? 'text-zinc-200' : 'text-zinc-500'}`}>{p.effect}</span>
                  <span className={`text-[9px] font-bold ${affordable ? 'text-purple-400' : 'text-red-400'}`}>{p.fableCost} FABLE</span>
                  {wasBought && <span className="text-[8px] text-green-400 font-bold">✓ Used</span>}
                </button>
              );
            })}
          </div>

          <div className={`transition-all overflow-hidden ${selectedPotion ? 'max-h-16 opacity-100' : 'max-h-0 opacity-0'}`}>
            {selectedPotion && (
              <button
                onClick={buySelected}
                disabled={!canAfford || buyingPotion}
                className={`w-full py-2.5 rounded-lg text-sm font-extrabold tracking-wider transition-all active:scale-95 mt-1 flex items-center justify-center gap-2
                  ${canAfford
                    ? 'bg-linear-to-r from-purple-600 to-purple-700 hover:brightness-110 text-white shadow-lg shadow-purple-900/30'
                    : 'bg-zinc-800 text-red-400 border border-red-900/40 cursor-not-allowed'
                  }`}
              >
                {buyingPotion
                  ? <><Loader2 size={14} className="animate-spin" /> Signing…</>
                  : canAfford ? `Buy ${selectedPotion.name} — ${selectedPotion.fableCost} FABLE` : `Need ${selectedPotion.fableCost} FABLE`
                }
              </button>
            )}
          </div>
        </div>

        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={entering}
          className="w-full bg-linear-to-r from-yellow-500 to-amber-600 hover:brightness-110 disabled:opacity-60 text-black font-extrabold py-3.5 rounded-xl text-sm tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-amber-900/30"
        >
          {entering
            ? <><Loader2 size={15} className="animate-spin" /> <span>Signing…</span></>
            : isFinalZone
              ? '🏆 Return to Menu'
              : <><span>Enter {nextZoneName}</span><ArrowRight size={15} /></>
          }
        </button>
        {!isFinalZone && !entering && (
          <p className="text-center text-[9px] text-zinc-600 -mt-2">First entry costs {ZONE_ENTRY_FEE} FABLE — free every time after</p>
        )}
      </div>
    </div>
  );
}
