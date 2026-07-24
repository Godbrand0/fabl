'use client';

import React, { useEffect, useState } from 'react';

/** When `target` is set, the step waits for the user to click the element
 *  marked with the matching `data-tour` attribute (no Next button shown);
 *  MenuPage advances the tour when that element is clicked. */
export interface TourStep {
  text: string;
  target: 'tavern' | 'bank' | 'stats' | 'loadout' | 'codex' | 'start' | null;
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: null,
    text: "Greetings, {name}! Welcome to the Vanguard. We've got a monster problem out there, and we need your sword. Before I let you loose, let me walk you through the guild hall — follow my arrows.",
  },
  {
    target: null,
    text: "Out in the zones, the LEFT joystick (or WASD) moves you and the RIGHT joystick (or SPACE) aims and fires. Watch the mini-map in the top corner: every red dot is a monster, and the kill counter shows how many more you need to slay before the zone BOSS appears.",
  },
  {
    target: 'tavern',
    text: "First stop — the TAVERN, where your loot gets spent. Click the glowing Tavern tab on the left.",
  },
  {
    target: null,
    text: "Two shelves here. Spend FABLE on Items — a Minor Potion (+30 HP), a Greater Potion (+75 HP), the Mega Elixir (full heal) and temporary buffs. The AVAX Shop is where the real treasures are — weapons and combat abilities that mint straight to your wallet as NFTs you truly own.",
  },
  {
    target: 'bank',
    text: "Next — the BANK. Click the glowing Bank tab.",
  },
  {
    target: null,
    text: "Defeat a zone BOSS and your FABLE reward lands here as a pending reward. Claim it any time, and send real AVAX to an external wallet whenever you're ready to cash out.",
  },
  {
    target: 'stats',
    text: "Time to shape your hero. Click the glowing STATS tab.",
  },
  {
    target: null,
    text: "Four stats build your character: STRENGTH adds +2 damage per point, AGILITY fires 30ms faster per point, DEFENSE blocks 3 damage per point, and VITALITY adds +10 max HP per point. Points cost FABLE — cheaper for your very first point, flat after — and your cap grows by 5 with every zone you unlock. Spend wisely.",
  },
  {
    target: 'loadout',
    text: "Onward — click the glowing LOADOUT tab.",
  },
  {
    target: null,
    text: "Your armoury. Equip any weapon in your arsenal, slot one special ability into the ABILITY button you'll see in combat, and check your bag for loot and NFTs. Remember: only what's EQUIPPED counts out in the field.",
  },
  {
    target: 'codex',
    text: "One last stop — click the glowing CODEX / MAP tab.",
  },
  {
    target: null,
    text: "The world map. Four zones await, each with its own beasts and boss: Sunfall Dunes, Ember Fields, Ashwater Marsh and Obsidian Peak. Clear a boss to unlock the next zone. Study your enemies here before you march.",
  },
  {
    target: 'start',
    text: "That's the tour, {name}. You know the Tavern, the Bank, your Stats, your Loadout and the Codex. Now hit the glowing START GAME button — and give those monsters hell!",
  },
];

interface Props {
  playerName: string;
  stepIndex: number;
  onNext: () => void;
}

export default function GuidedTour({ playerName, stepIndex, onNext }: Props) {
  const step = TOUR_STEPS[stepIndex];
  const [arrowPos, setArrowPos] = useState<{ top: number; left: number } | null>(null);

  // Track the highlighted element so the arrow follows it across resizes/layout shifts
  useEffect(() => {
    if (!step?.target) { setArrowPos(null); return; }
    const compute = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) { setArrowPos(null); return; }
      const r = el.getBoundingClientRect();
      setArrowPos({ top: r.top + r.height / 2, left: r.right + 8 });
    };
    compute();
    window.addEventListener('resize', compute);
    const poll = setInterval(compute, 400);
    return () => { window.removeEventListener('resize', compute); clearInterval(poll); };
  }, [stepIndex, step?.target]);

  if (!step) return null;

  const displayText = step.text.replace(/\{name\}/g, playerName || 'Hero');

  return (
    <>
      {/* Bouncing arrow pointing at the required button */}
      {arrowPos && (
        <div
          className="fixed z-70 pointer-events-none"
          style={{ top: arrowPos.top, left: arrowPos.left, transform: 'translateY(-50%)' }}
        >
          <span className="tour-arrow inline-block text-yellow-400 text-2xl drop-shadow-[0_0_6px_rgba(250,204,21,0.8)]">◀</span>
        </div>
      )}

      {/* Guildmaster dialogue card — bottom center, leaves the sidebar clickable */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-60 w-[calc(100%-2rem)] max-w-md pointer-events-auto font-mono">
        <div className="bg-zinc-950/95 border-2 border-blue-900/60 rounded-xl p-4 shadow-2xl shadow-black/80 flex gap-4 items-start">
          <div className="w-14 h-14 bg-blue-950 border border-blue-800 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-2xl">🧙‍♂️</span>
          </div>

          <div className="flex-1 flex flex-col gap-2 min-w-0">
            <span className="text-blue-400 font-bold text-xs uppercase tracking-widest">Guildmaster Thorne</span>
            <p className="text-zinc-200 text-[13px] leading-relaxed">{displayText}</p>

            <div className="flex justify-between items-center mt-1">
              <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-wider">
                {stepIndex + 1} / {TOUR_STEPS.length}
              </span>
              {step.target ? (
                <span className="text-[10px] text-yellow-400 font-bold animate-pulse uppercase tracking-wider">
                  ◀ Click the glowing button
                </span>
              ) : (
                <button
                  onClick={onNext}
                  className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2 rounded shadow flex items-center gap-2 active:scale-95 transition-all"
                >
                  Next ⏭
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
