'use client';

import React, { useEffect, useState } from 'react';
import gameBridge from '../game/systems/GameBridge';

interface MinimapData {
  world: { w: number; h: number };
  player: { x: number; y: number };
  enemies: { x: number; y: number; isBoss: boolean }[];
  /** Multiplayer only — other party members' live positions. */
  party?: { x: number; y: number; ghosted: boolean }[];
  defeated: number;
  required: number;
  bossSpawned: boolean;
  bossAlive: boolean;
}

/** Radar-style overview of the current zone: player (green), enemies (red),
 *  boss (orange), plus a kill counter tracking progress toward the boss spawn. */
export default function MiniMap() {
  const [data, setData] = useState<MinimapData | null>(null);

  useEffect(() => gameBridge.on('minimap_update', (d: MinimapData) => setData(d), true), []);

  if (!data) return null;

  const pct = (v: number, max: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  const remaining = Math.max(0, data.required - data.defeated);

  return (
    <div className="flex flex-col gap-1 pointer-events-none">
      {/* Kill counter / boss status */}
      <div className="bg-black/60 border border-zinc-800 rounded-lg px-2 py-1 backdrop-blur-md flex items-center gap-1.5 text-[9px] font-bold w-fit">
        {data.bossSpawned ? (
          data.bossAlive
            ? <span className="text-red-400 animate-pulse">⚠ BOSS FIGHT</span>
            : <span className="text-emerald-400">ZONE CLEAR</span>
        ) : (
          <>
            <span className="text-red-400">☠ {data.defeated}/{data.required}</span>
            <span className="text-zinc-500">· {remaining} to boss</span>
          </>
        )}
      </div>

      {/* Map */}
      <div className="relative w-24 h-24 bg-black/60 border border-zinc-700 rounded-lg backdrop-blur-md overflow-hidden">
        {data.enemies.map((e, i) => (
          <div
            key={i}
            className={`absolute rounded-full ${e.isBoss
              ? 'w-2.5 h-2.5 bg-orange-500 ring-1 ring-orange-300 animate-pulse'
              : 'w-1.5 h-1.5 bg-red-500'}`}
            style={{ left: pct(e.x, data.world.w), top: pct(e.y, data.world.h), transform: 'translate(-50%, -50%)' }}
          />
        ))}
        {data.party?.map((p, i) => (
          <div
            key={i}
            className={`absolute w-2 h-2 bg-yellow-400 rounded-full ring-1 ring-yellow-100 ${p.ghosted ? 'opacity-35' : ''}`}
            style={{ left: pct(p.x, data.world.w), top: pct(p.y, data.world.h), transform: 'translate(-50%, -50%)' }}
          />
        ))}
        <div
          className="absolute w-2 h-2 bg-emerald-400 rounded-full ring-1 ring-white"
          style={{ left: pct(data.player.x, data.world.w), top: pct(data.player.y, data.world.h), transform: 'translate(-50%, -50%)' }}
        />
        <span className="absolute bottom-0.5 right-1 text-[7px] text-zinc-600 font-bold tracking-wider">MAP</span>
      </div>
    </div>
  );
}
