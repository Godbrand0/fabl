'use client';

import React, { useEffect, useState } from 'react';
import { X, Sword, Gem } from 'lucide-react';
import { dbService, PlayerData } from '../../lib/supabaseClient';
import { TAVERN_WEAPONS } from '../TavernShop';

interface PlayerDetailPopoverProps {
  walletAddress: string;
  fallbackName: string;
  onClose: () => void;
}

// Live read of the same PlayerData every other screen uses — this is what
// guarantees the popover can never drift from what that player has actually
// equipped/allocated in single-player.
export default function PlayerDetailPopover({ walletAddress, fallbackName, onClose }: PlayerDetailPopoverProps) {
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    dbService.getPlayer(walletAddress)
      .then(p => { if (!cancelled) setPlayer(p); })
      .catch(err => console.error('PlayerDetailPopover getPlayer failed:', err))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [walletAddress]);

  const weapon = TAVERN_WEAPONS.find(w => w.id === player?.equippedWeapon) ?? TAVERN_WEAPONS[0];

  return (
    <div
      className="absolute inset-0 z-70 bg-black/85 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs bg-zinc-950 border border-purple-800/50 rounded-2xl shadow-2xl shadow-purple-950/40 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800 bg-zinc-900/60">
          <span className="text-sm font-extrabold text-purple-300">{player?.name ?? fallbackName}</span>
          <button onClick={onClose} className="text-zinc-400 hover:text-white bg-black/40 rounded-full p-1">
            <X size={14} />
          </button>
        </div>

        {loading ? (
          <div className="p-6 text-center text-xs text-zinc-500">Loading…</div>
        ) : !player ? (
          <div className="p-6 text-center text-xs text-zinc-500">Couldn't load this player's details.</div>
        ) : (
          <div className="p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">Level</span>
              <span className="text-sm font-extrabold text-zinc-100">{player.level}</span>
            </div>

            <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2">
              <Sword size={13} className="text-yellow-500 shrink-0" />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Equipped Weapon</span>
                <span className="text-xs font-bold text-zinc-200 truncate">{weapon.name}</span>
              </div>
              <span className="text-[10px] font-bold text-zinc-400">+{weapon.attack} ATK</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Strength', value: player.stats.strength, color: 'text-red-400' },
                { label: 'Agility',  value: player.stats.agility,  color: 'text-emerald-400' },
                { label: 'Defense',  value: player.stats.defense,  color: 'text-blue-400' },
                { label: 'Vitality', value: player.stats.vitality, color: 'text-yellow-400' },
              ].map(stat => (
                <div key={stat.label} className="bg-zinc-900/60 border border-zinc-800 rounded-lg px-2 py-1.5 flex flex-col items-center gap-0.5">
                  <span className={`text-sm font-extrabold ${stat.color}`}>{stat.value}</span>
                  <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">{stat.label}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>HP</span>
              <span className="font-bold text-zinc-300">{player.hp} / {player.maxHp}</span>
            </div>

            {player.nftItems && player.nftItems.length > 0 && (
              <div className="flex items-center gap-1.5 text-[9px] text-purple-400">
                <Gem size={10} /> {player.nftItems.length} NFT item{player.nftItems.length === 1 ? '' : 's'} owned
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
