'use client';

import React, { useState, useEffect } from 'react';
import { Flame } from 'lucide-react';
import gameBridge from '../game/systems/GameBridge';
import Joystick from './Joystick';

// The on-screen mobile controls (move/aim joysticks + ability button) — purely
// gameBridge-driven, so it works identically whether it's mounted under single-player's
// HUD or the multiplayer mission HUD without needing any props from either.
export default function GameControls() {
  const [cooldownRemaining, setCooldownRemaining] = useState(0); // seconds

  useEffect(() => {
    const unsubCD = gameBridge.on('ability_cooldown_started', (data: any) => {
      const duration = data.duration; // ms
      const start = Date.now();

      const interval = setInterval(() => {
        const elapsed = Date.now() - start;
        const rem = Math.max(0, Math.ceil((duration - elapsed) / 1000));
        setCooldownRemaining(rem);

        if (elapsed >= duration) {
          clearInterval(interval);
          setCooldownRemaining(0);
        }
      }, 50);
    });
    return unsubCD;
  }, []);

  return (
    <div className="w-full flex flex-col gap-4 pointer-events-auto bg-linear-to-t from-black via-black/85 to-transparent absolute bottom-0 left-0 right-0 z-40">
      <div className="flex justify-between items-end px-6 pb-6 pt-2 select-none pointer-events-none">
        {/* Left Joystick: Move */}
        <div className="pointer-events-auto">
          <Joystick type="left" label="Move" />
        </div>

        {/* Center Ability */}
        <div className="flex flex-col items-center gap-4 pointer-events-auto">
          <div className="relative">
            <button
              onClick={() => gameBridge.emit('ability_trigger')}
              disabled={cooldownRemaining > 0}
              className={`w-14 h-14 rounded-full border-2 border-purple-500 flex flex-col items-center justify-center bg-black/60 shadow-lg shadow-black/60 hover:border-purple-400 active:scale-95 transition-all select-none duration-100 ${cooldownRemaining > 0 ? 'opacity-40' : ''}`}
            >
              <Flame size={20} className={cooldownRemaining > 0 ? 'text-zinc-500' : 'text-purple-400'} />
              <span className="text-[8px] font-bold text-purple-300 mt-0.5">ABILITY</span>
            </button>

            {cooldownRemaining > 0 && (
              <div className="absolute inset-0 rounded-full bg-black/70 flex items-center justify-center border-2 border-zinc-700 pointer-events-none">
                <span className="text-xs font-bold text-zinc-300 font-mono">{cooldownRemaining}s</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Joystick: Aim */}
        <div className="pointer-events-auto">
          <Joystick type="right" label="Aim/Shoot" />
        </div>
      </div>
    </div>
  );
}
