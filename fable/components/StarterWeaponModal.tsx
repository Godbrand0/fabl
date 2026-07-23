'use client';

import React from 'react';
import Image from 'next/image';
import { X, Sword, Shield } from 'lucide-react';

interface Props {
  onClose: () => void;
}

/** Detail view for the free starting weapon — every hero begins with this,
 *  so unlike Tavern gear it has no mint price or on-chain link to show. */
export default function StarterWeaponModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-80 bg-black/85 flex items-center justify-center p-3 font-mono"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs max-h-[85vh] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative w-full h-36 bg-zinc-900 shrink-0">
          <Image src="/nft/bamboo_stick.svg" alt="Bamboo Stick" fill className="object-cover" />
          <button
            onClick={onClose}
            className="absolute top-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white rounded-full p-1.5"
          >
            <X size={14} />
          </button>
          <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-[8px] font-bold bg-emerald-950/80 border border-emerald-700/50 text-emerald-300 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            <Shield size={9} /> Starting Equipment
          </span>
        </div>

        <div className="p-3 flex flex-col gap-2.5">
          <div>
            <h2 className="text-base font-extrabold text-yellow-400">Bamboo Stick</h2>
            <span className="text-[9px] text-zinc-500 uppercase tracking-widest">Weapon · Free</span>
          </div>

          <p className="text-[11px] text-zinc-400 italic leading-relaxed">
            "Every hero starts somewhere. Humble bamboo, but it'll do until you can afford better steel."
          </p>

          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5">
            <Sword size={13} className="text-red-400 shrink-0" />
            <div className="flex flex-col">
              <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-wider">Combat Effect</span>
              <span className="text-xs font-bold text-zinc-200">+5 ATK</span>
            </div>
          </div>

          <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
            Visit the Tavern to buy a stronger weapon with G$ — those mint as real NFTs you own.
          </p>
        </div>
      </div>
    </div>
  );
}
