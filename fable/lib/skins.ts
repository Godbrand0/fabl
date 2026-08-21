// Shared palette source of truth for character skins — used both by BootScene.ts
// (to procedurally draw the actual in-game Phaser textures) and by SkinPicker.tsx (to
// render a matching inline-SVG preview during onboarding), so what a player picks is
// guaranteed to match what they see in-game rather than drifting out of sync.

export interface SkinAccent {
  x: number; y: number; w: number; h: number; color: number;
}

// A non-rectangular extra body part (horn, tail, ...) — rect and triangle are the two
// primitives both Phaser Graphics (BootScene) and SVG (SkinPicker) can render identically.
export type SkinShape =
  | { type: 'rect'; color: number; x: number; y: number; w: number; h: number }
  | { type: 'triangle'; color: number; x1: number; y1: number; x2: number; y2: number; x3: number; y3: number };

export interface SkinPalette {
  id: string;
  name: string;
  desc: string;
  skin: number;      // face/neck/arms
  headwrap: number;  // headwrap/hood
  shirt: number;     // torso + wrist cuffs
  pants: number;
  boot: number;
  eye: number;
  eyeGlow?: number;  // inner highlight pixel — omitted for the plain human eye
  // Extra decorative pixels drawn on top of the base body (rune-cracks, ember veins, a
  // glowing core, ...) — coordinates are in the same 32×48 grid as the body itself.
  // Without these a non-human skin is just a recolored human; this is what actually
  // makes Stone-kin read as carved rock and Ember-kin as something on fire.
  accents?: SkinAccent[];
  // Skip the cloth headwrap entirely (a bare skin-colored head-cap is drawn instead) —
  // used by non-humanoid skins that replace it with horns via extraShapes.
  hideHeadwrap?: boolean;
  // Skip pants + boots entirely — used by skins whose lower body is replaced by a tail
  // (via extraShapes) instead of legs.
  hideLegs?: boolean;
  // Extra geometry drawn BEHIND the body (wings tucked behind the shoulders, ...) —
  // same technique the game's imp enemies already use for their wings.
  backShapes?: SkinShape[];
  // Extra geometry beyond the shared human silhouette, drawn last/in front — horns,
  // a tail, etc.
  extraShapes?: SkinShape[];
}

export const DEFAULT_SKIN = 'human';

export const SKIN_PALETTES: Record<string, SkinPalette> = {
  human: {
    id: 'human',
    name: 'Human',
    desc: 'The classic Fable adventurer.',
    skin: 0xA05C28,
    headwrap: 0xCCCCBB,
    shirt: 0xE8D8C8,
    pants: 0x5C6840,
    boot: 0x2A1608,
    eye: 0x1A0800,
  },
  obsidian: {
    id: 'obsidian',
    name: 'Stone-kin',
    desc: 'Obsidian-forged, born of Obsidian Peak.',
    skin: 0x2A3C2A,
    headwrap: 0x1E2A1E,
    shirt: 0x3A4C3A,
    pants: 0x1E2A1E,
    boot: 0x141C14,
    eye: 0x44CC66,
    eyeGlow: 0x88FFAA,
    accents: [
      { x: 15, y: 17, w: 1, h: 11, color: 0x44CC66 },  // vertical rune line down the chest
      { x: 10, y: 21, w: 9, h: 1, color: 0x44CC66 },   // crossing horizontal rune line
      { x: 14, y: 20, w: 3, h: 3, color: 0x88FFAA },   // glowing rune core, matches the eyes
      { x: 3, y: 19, w: 1, h: 6, color: 0x44CC66 },    // arm veins
      { x: 28, y: 19, w: 1, h: 6, color: 0x44CC66 },
    ],
    // Not human — a bare stone head with two horns instead of a headwrap, and no legs
    // at all: a single tapering stone tail takes their place, naga-style.
    hideHeadwrap: true,
    hideLegs: true,
    extraShapes: [
      { type: 'triangle', color: 0x1E2A1E, x1: 7, y1: 4, x2: 12, y2: 4, x3: 8, y3: 0 },   // left horn
      { type: 'triangle', color: 0x1E2A1E, x1: 20, y1: 4, x2: 25, y2: 4, x3: 24, y3: 0 }, // right horn
      { type: 'rect', color: 0x2A3C2A, x: 8, y: 29, w: 16, h: 7 },   // tail — upper (full torso width)
      { type: 'rect', color: 0x2A3C2A, x: 10, y: 36, w: 12, h: 6 },  // tail — mid taper
      { type: 'rect', color: 0x1E2A1E, x: 12, y: 42, w: 8, h: 4 },   // tail — lower taper
      { type: 'triangle', color: 0x1E2A1E, x1: 12, y1: 46, x2: 20, y2: 46, x3: 16, y3: 48 }, // tail tip
      { type: 'rect', color: 0x44CC66, x: 15, y: 30, w: 2, h: 15 }, // glowing spine stripe, drawn last so it sits on top of the tail
    ],
  },
  ember: {
    id: 'ember',
    name: 'Ember-kin',
    desc: 'Forged in the fires of Ember Fields.',
    skin: 0xAA1010,
    headwrap: 0x6E2800,
    shirt: 0xCC2020,
    pants: 0x4A1800,
    boot: 0x2A0A00,
    eye: 0xFF6600,
    eyeGlow: 0xFFCC00,
    accents: [
      { x: 15, y: 17, w: 1, h: 11, color: 0xFF6600 },  // vertical ember crack down the chest
      { x: 10, y: 21, w: 9, h: 1, color: 0xFF6600 },   // crossing horizontal crack
      { x: 14, y: 20, w: 3, h: 3, color: 0xFFCC00 },   // glowing core, matches the eyes
      { x: 4, y: 19, w: 1, h: 6, color: 0xFF6600 },    // arm veins
      { x: 27, y: 19, w: 1, h: 6, color: 0xFF6600 },
      { x: 8, y: 33, w: 1, h: 5, color: 0xFF6600 },    // leg veins
      { x: 22, y: 33, w: 1, h: 5, color: 0xFF6600 },
    ],
    // A pair of thick wings tucked behind the shoulders — drawn behind the body (same
    // technique the game's imp enemies already use) so they read as attached, not
    // pasted on top. Each wing is two overlapping triangles (a wide upper lobe + a
    // lower lobe reaching further into the body) rather than one thin blade, so the
    // silhouette actually reads as a wing instead of a sliver.
    backShapes: [
      { type: 'triangle', color: 0x2A0A00, x1: 2, y1: 16, x2: 0, y2: 6, x3: 7, y3: 15 },   // left wing — upper lobe
      { type: 'triangle', color: 0x2A0A00, x1: 2, y1: 16, x2: 7, y2: 15, x3: 6, y3: 23 },  // left wing — lower lobe
      { type: 'triangle', color: 0x6E2800, x1: 2, y1: 16, x2: 1, y2: 9, x3: 5, y3: 15 },   // left membrane
      { type: 'triangle', color: 0x2A0A00, x1: 30, y1: 16, x2: 32, y2: 6, x3: 25, y3: 15 }, // right wing — upper lobe
      { type: 'triangle', color: 0x2A0A00, x1: 30, y1: 16, x2: 25, y2: 15, x3: 26, y3: 23 }, // right wing — lower lobe
      { type: 'triangle', color: 0x6E2800, x1: 30, y1: 16, x2: 31, y2: 9, x3: 27, y3: 15 }, // right membrane
    ],
  },
};

export const SKIN_IDS = Object.keys(SKIN_PALETTES);

export function isValidSkin(skin: string | undefined | null): boolean {
  return !!skin && skin in SKIN_PALETTES;
}
