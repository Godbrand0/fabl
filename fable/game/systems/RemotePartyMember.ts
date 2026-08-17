import Phaser from 'phaser';
import { getWeaponCombatStats } from '../../lib/combatFormulas';

const STALE_AFTER_MS = 2000; // no pos update in this long -> fade to a "reconnecting" ghost
const FULL_ALPHA = 1;
const GHOST_ALPHA = 0.35;

// A lightweight, non-physics-driven stand-in for another party member's avatar.
// Position comes entirely from network broadcasts (see CombatScene's `mp_in_pos`
// listener) and is smoothed with a simple lerp so a laggy sender looks choppy only
// on the receiving end — it never blocks or slows the local player's own simulation.
export default class RemotePartyMember {
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private targetX: number;
  private targetY: number;
  private lastUpdateAt: number;
  private disconnected = false;

  constructor(scene: Phaser.Scene, wallet: string, name: string, equippedWeapon: string, x: number, y: number) {
    const textureKey = getWeaponCombatStats(equippedWeapon).textureKey;
    this.sprite = scene.add.sprite(x, y, textureKey);
    this.sprite.setDepth(6);
    this.sprite.setTint(0xAACCFF); // subtle blue tint distinguishes teammates from the local player
    this.targetX = x;
    this.targetY = y;
    this.lastUpdateAt = Date.now();

    this.nameLabel = scene.add
      .text(x, y - 26, name, {
        fontFamily: 'monospace', fontSize: '8px', color: '#AACCFF',
        fontStyle: 'bold', stroke: '#000000', strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(15);
  }

  updateGear(equippedWeapon: string) {
    this.sprite.setTexture(getWeaponCombatStats(equippedWeapon).textureKey);
  }

  receivePos(x: number, y: number, flipX: boolean) {
    this.targetX = x;
    this.targetY = y;
    this.sprite.setFlipX(flipX);
    this.lastUpdateAt = Date.now();
    if (this.disconnected) {
      // A late-arriving pos after a presence `leave` (e.g. a brief drop, not a real
      // quit) — treat it as a reconnect rather than staying ghosted forever.
      this.disconnected = false;
      this.nameLabel.setColor('#AACCFF');
    }
  }

  /** Presence told us this player's connection is gone — ghost immediately rather
   *  than waiting out the staleness timer, and label it so it reads as intentional. */
  markDisconnected() {
    this.disconnected = true;
    this.nameLabel.setColor('#886699');
  }

  /** Called once per scene frame — smoothly moves the sprite toward the last-known
   *  position, and fades to a ghost if nothing's arrived in a while. */
  tick() {
    this.sprite.x += (this.targetX - this.sprite.x) * 0.25;
    this.sprite.y += (this.targetY - this.sprite.y) * 0.25;
    this.nameLabel.setPosition(this.sprite.x, this.sprite.y - 26);

    const stale = this.disconnected || (Date.now() - this.lastUpdateAt > STALE_AFTER_MS);
    const targetAlpha = stale ? GHOST_ALPHA : FULL_ALPHA;
    if (this.sprite.alpha !== targetAlpha) {
      this.sprite.setAlpha(targetAlpha);
      this.nameLabel.setAlpha(targetAlpha);
    }
  }

  destroy() {
    this.sprite.destroy();
    this.nameLabel.destroy();
  }
}
