'use client';

import React from 'react';
import { SKIN_PALETTES, SkinPalette, SkinShape } from '../lib/skins';

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

function renderShape(s: SkinShape, i: number) {
  return s.type === 'rect' ? (
    <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} fill={hex(s.color)} />
  ) : (
    <polygon key={i} points={`${s.x1},${s.y1} ${s.x2},${s.y2} ${s.x3},${s.y3}`} fill={hex(s.color)} />
  );
}

// Redraws the exact same shape/coordinates as BootScene's drawPlayer(), just as SVG
// rects instead of Phaser Graphics — no game instance exists yet at character-creation
// time, but sharing SKIN_PALETTES as the single color source keeps this pixel-for-pixel
// consistent with what the player will actually look like in-game.
function SkinPreview({ palette }: { palette: SkinPalette }) {
  return (
    <svg viewBox="0 0 32 48" width={56} height={84} style={{ imageRendering: 'pixelated' }}>
      {palette.backShapes?.map(renderShape)}
      {!palette.hideHeadwrap ? (
        <>
          <rect x={9} y={0} width={14} height={5} fill={hex(palette.headwrap)} />
          <rect x={7} y={3} width={18} height={4} fill={hex(palette.headwrap)} />
        </>
      ) : (
        <rect x={9} y={1} width={14} height={4} fill={hex(palette.skin)} />
      )}
      <rect x={9} y={5} width={14} height={9} fill={hex(palette.skin)} />
      <rect x={11} y={8} width={3} height={2} fill={hex(palette.eye)} />
      <rect x={18} y={8} width={3} height={2} fill={hex(palette.eye)} />
      {palette.eyeGlow && (
        <>
          <rect x={12} y={8} width={1} height={1} fill={hex(palette.eyeGlow)} />
          <rect x={19} y={8} width={1} height={1} fill={hex(palette.eyeGlow)} />
        </>
      )}
      <rect x={14} y={14} width={4} height={3} fill={hex(palette.skin)} />
      <rect x={7} y={17} width={18} height={12} fill={hex(palette.shirt)} />
      <rect x={2} y={17} width={7} height={10} fill={hex(palette.skin)} />
      <rect x={23} y={17} width={7} height={10} fill={hex(palette.skin)} />
      <rect x={2} y={27} width={5} height={2} fill={hex(palette.shirt)} />
      <rect x={25} y={27} width={5} height={2} fill={hex(palette.shirt)} />
      {!palette.hideLegs && (
        <>
          <rect x={7} y={29} width={8} height={13} fill={hex(palette.pants)} />
          <rect x={17} y={29} width={8} height={13} fill={hex(palette.pants)} />
          <rect x={6} y={42} width={9} height={6} fill={hex(palette.boot)} />
          <rect x={17} y={42} width={9} height={6} fill={hex(palette.boot)} />
        </>
      )}
      {palette.accents?.map((a, i) => (
        <rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} fill={hex(a.color)} />
      ))}
      {palette.extraShapes?.map(renderShape)}
    </svg>
  );
}

interface SkinPickerProps {
  selected: string;
  onSelect: (skinId: string) => void;
}

export default function SkinPicker({ selected, onSelect }: SkinPickerProps) {
  const activePalette = SKIN_PALETTES[selected];

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">Choose Your Look</label>
      <div className="grid grid-cols-3 gap-2">
        {Object.values(SKIN_PALETTES).map((p) => {
          const isSelected = selected === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`flex flex-col items-center gap-1 py-2 rounded-xl border-2 transition-all active:scale-95 ${
                isSelected ? 'border-yellow-500 bg-yellow-950/20' : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-700'
              }`}
            >
              <div className="bg-black/40 rounded-lg p-1">
                <SkinPreview palette={p} />
              </div>
              <span className={`text-[9px] font-bold ${isSelected ? 'text-yellow-400' : 'text-zinc-300'}`}>{p.name}</span>
            </button>
          );
        })}
      </div>
      {activePalette && <p className="text-[9px] text-zinc-600 text-center">{activePalette.desc}</p>}
    </div>
  );
}
