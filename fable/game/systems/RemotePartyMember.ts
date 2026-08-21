import Phaser from 'phaser';
import { getPlayerTextureKey } from '../../lib/combatFormulas';

const STALE_AFTER_MS = 2000; // no pos update in this long -> fade to a "reconnecting" ghost
const FULL_ALPHA = 1;
const GHOST_ALPHA = 0.35;
const TEAMMATE_TINT = 0xAACCFF; // subtle blue — distinguishes teammates from the local player
const DOWNED_TINT = 0x555753;   // matches the local player's own death tint in single-player

// A lightweight, non-physics-driven stand-in for another party member's avatar.
// Position comes entirely from network broadcasts (see CombatScene's `mp_in_pos`
// listener) and is smoothed with a simple lerp so a laggy sender looks choppy only
// on the receiving end — it never blocks or slows the local player's own simulation.
export default class RemotePartyMember {
  private sprite: Phaser.GameObjects.Sprite;
  private nameLabel: Phaser.GameObjects.Text;
  private name: string;
  private targetX: number;
  private targetY: number;
  private lastUpdateAt: number;
  private disconnected = false;
  private downed = false;
  private skin: string;

  constructor(scene: Phaser.Scene, wallet: string, name: string, skin: string, equippedWeapon: string, x: number, y: number) {
    const textureKey = getPlayerTextureKey(skin, equippedWeapon);
    this.name = name;
    this.skin = skin;
    this.sprite = scene.add.sprite(x, y, textureKey);
    this.sprite.setDepth(6);
    this.sprite.setTint(TEAMMATE_TINT);
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
    this.sprite.setTexture(getPlayerTextureKey(this.skin, equippedWeapon));
  }

  /** Current rendered position — used by enemy AI to pick a chase/attack target
   *  (see CombatScene.nearestTarget), so aggro isn't blind to anyone but the local player,
   *  and by the minimap to draw teammate markers. */
  getPosition(): { x: number; y: number } {
    return { x: this.sprite.x, y: this.sprite.y };
  }

  /** A downed or disconnected teammate shouldn't attract enemy aggro — nothing to gain
   *  chasing someone who can't be damaged further or isn't really there. */
  isTargetable(): boolean {
    return !this.disconnected && !this.downed;
  }

  /** Dimmed on the minimap when either true — disconnected and downed are visually
   *  distinct in-world (ghost-fade vs. grey tint + skull) but both read as "not really
   *  in the fight" at a glance on the small map. */
  isGhosted(): boolean {
    return this.disconnected || this.downed;
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

  /** Presence told us this player's HP hit 0 — distinct from a dropped connection: they're
   *  still here, just out of the fight. Grey tint (matching the local player's own death
   *  visual) at full opacity, vs. disconnected's faded-but-normal-colored ghost. */
  markDowned() {
    this.downed = true;
    this.sprite.setTint(DOWNED_TINT);
    this.nameLabel.setText(`${this.name} \u{1F480}`); // skull
    this.nameLabel.setColor('#CC8888');
  }

  markRevived() {
    this.downed = false;
    this.sprite.setTint(TEAMMATE_TINT);
    this.nameLabel.setText(this.name);
    this.nameLabel.setColor(this.disconnected ? '#886699' : '#AACCFF');
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
