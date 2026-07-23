import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';

const WORLD_W = 1440;
const WORLD_H = 1440;

export default class SunfallDunesScene extends CombatScene {
  protected zoneName = 'Sunfall Dunes';
  protected minLevel = 1;
  protected maxLevel = 1;
  protected tileKey = 'tile_sandy'; // sun-baked desert as base

  protected regularEnemyConfig: EnemyConfig = {
    key: 'imp',
    name: 'Imp',
    hp: 40,
    speed: 60,
    damage: 15,
    points: 8,
  };

  protected bossConfig: EnemyConfig = {
    key: 'sand_wraith',
    name: 'Sand Wraith',
    hp: 1200,
    speed: 0,
    damage: 28,
    points: 40,
    isBoss: true,
  };

  constructor() {
    super('SunfallDunesScene');
  }

  protected createBiomeLayout(): void {
    // ── Oasis pool (left-center) ───────────────────────────────────────────────
    const oasisW = 6 * 32, oasisH = 7 * 32;
    this.add.tileSprite(4 * 32 + oasisW / 2, 15 * 32 + oasisH / 2, oasisW, oasisH, 'tile_oasis').setDepth(0.1);

    // ── Palm trees around the oasis and scattered through the dunes ───────────
    const palmPositions = [
      { x: 160, y: 460 }, { x: 240, y: 500 }, { x: 200, y: 560 },
      { x: 560, y: 380 }, { x: 900, y: 320 }, { x: 1100, y: 900 },
      { x: 300, y: 1000 }, { x: 1250, y: 400 },
    ];
    palmPositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'palm_tree').setDepth(5).setOrigin(0.5, 1);
    });

    // ── Cacti clusters ──────────────────────────────────────────────────────────
    const cactusPositions = [
      { x: 680, y: 900 }, { x: 820, y: 820 }, { x: 1100, y: 760 },
      { x: 340, y: 860 }, { x: 1200, y: 900 }, { x: 500, y: 1150 },
    ];
    cactusPositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'cactus').setDepth(4).setOrigin(0.5, 1);
    });

    // ── Rocky outcroppings at the edges ─────────────────────────────────────────
    const rockPositions = [
      { x: 60, y: 300 }, { x: 60, y: 500 }, { x: 60, y: 700 },
      { x: 1360, y: 280 }, { x: 1370, y: 520 }, { x: 1350, y: 740 },
      { x: 400, y: 1100 }, { x: 1000, y: 1080 },
    ];
    rockPositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setDepth(4);
      this.add.image(x + 20, y + 18, 'rock_medium').setDepth(4);
    });

    // ── Faint dune ripples using the sandy base tile at low alpha ──────────────
    for (let i = 0; i < 40; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      this.add.image(x, y, 'tile_sandy').setDepth(0.05).setAlpha(0.3).setScale(1.5);
    }
  }
}
