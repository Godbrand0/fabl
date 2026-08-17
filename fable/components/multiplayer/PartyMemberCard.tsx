'use client';

import React, { useState } from 'react';
import { Info, Crown, CheckCircle2 } from 'lucide-react';
import PlayerDetailPopover from './PlayerDetailPopover';
import type { PartyPresence } from '../../lib/multiplayer';

interface PartyMemberCardProps {
  member: PartyPresence;
  isHost: boolean;
  isSelf: boolean;
}

export default function PartyMemberCard({ member, isHost, isSelf }: PartyMemberCardProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <div
        className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border ${
          member.ready ? 'bg-emerald-950/25 border-emerald-800/50' : 'bg-zinc-900/60 border-zinc-800'
        }`}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-xs font-bold text-zinc-200 truncate flex items-center gap-1.5">
            {member.name}
            {isSelf && <span className="text-purple-400 font-extrabold">(You)</span>}
            {isHost && <Crown size={11} className="text-yellow-400 shrink-0" />}
          </span>
          <span className="text-[9px] text-zinc-500">Lv {member.level}</span>
        </div>

        <button
          onClick={() => setShowDetail(true)}
          className="text-zinc-500 hover:text-white bg-black/40 rounded-full p-1 shrink-0"
          title="View player details"
        >
          <Info size={13} />
        </button>

        {member.ready ? (
          <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 px-2 py-1 rounded-full shrink-0">
            <CheckCircle2 size={10} /> READY
          </span>
        ) : (
          <span className="text-[9px] font-bold text-zinc-500 bg-zinc-800/60 border border-zinc-700 px-2 py-1 rounded-full shrink-0">
            WAITING
          </span>
        )}
      </div>

      {showDetail && (
        <PlayerDetailPopover
          walletAddress={member.wallet}
          fallbackName={member.name}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
