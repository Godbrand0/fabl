import { TAVERN_WEAPONS } from '../components/TavernShop';

// Single source of truth for weapon/damage/cooldown math — used by CombatScene for the
// local player AND for every remote party member in multiplayer, so a player's real
// single-player gear/stats always compute identically wherever they're rendered.

export function getWeaponCombatStats(weaponId: string): { attack: number; textureKey: string } {
  const w = TAVERN_WEAPONS.find(w => w.id === weaponId) ?? TAVERN_WEAPONS[0];
  return { attack: w.attack, textureKey: w.textureKey };
}

export function computePlayerDamage(strength: number, equippedWeapon: string): number {
  return 32 + strength * 2 + getWeaponCombatStats(equippedWeapon).attack;
}

export function computeShootCooldown(agility: number): number {
  return Math.max(150, 600 - agility * 30);
}
