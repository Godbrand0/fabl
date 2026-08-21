import { TAVERN_WEAPONS } from '../components/TavernShop';
import { DEFAULT_SKIN } from './skins';

// Single source of truth for weapon/damage/cooldown math — used by CombatScene for the
// local player AND for every remote party member in multiplayer, so a player's real
// single-player gear/stats always compute identically wherever they're rendered.

export function getWeaponCombatStats(weaponId: string): { attack: number; textureKey: string } {
  const w = TAVERN_WEAPONS.find(w => w.id === weaponId) ?? TAVERN_WEAPONS[0];
  return { attack: w.attack, textureKey: w.textureKey };
}

// Combines skin + weapon into the actual texture key to render. The 'human' skin keeps
// the original 'player_<weapon>' keys unchanged (BootScene generates those exact keys
// for it) — every other skin's textures are keyed '<skin>_<weapon suffix>', where the
// suffix is just the weapon's own textureKey with the 'player_' prefix stripped, so
// there's no separate weapon-suffix table to keep in sync with BootScene's.
export function getPlayerTextureKey(skin: string | undefined | null, weaponId: string): string {
  const { textureKey } = getWeaponCombatStats(weaponId);
  if (!skin || skin === DEFAULT_SKIN) return textureKey;
  const suffix = textureKey.replace(/^player_/, '');
  return `${skin}_${suffix}`;
}

export function computePlayerDamage(strength: number, equippedWeapon: string): number {
  return 32 + strength * 2 + getWeaponCombatStats(equippedWeapon).attack;
}

export function computeShootCooldown(agility: number): number {
  return Math.max(150, 600 - agility * 30);
}
