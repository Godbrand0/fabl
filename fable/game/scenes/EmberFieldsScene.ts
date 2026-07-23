import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';

const WORLD_W = 1440;
const WORLD_H = 1440;
const TILE = 32;

export default class EmberFieldsScene extends CombatScene {
  protected zoneName = 'Ember Fields';
  protected minLevel = 1;
  protected maxLevel = 2;
  protected tileKey = 'tile_scorched'; // dry dark earth as base

  protected regularEnemyConfig: EnemyConfig = {
    key: 'imp',
    name: 'Imp',
    hp: 60,
    speed: 65,
    damage: 22,
    points: 11,
  };

  protected bossConfig: EnemyConfig = {
    key: 'lava_pumpkin',
    name: 'Lava Pumpkin',
    hp: 1800,
    speed: 0,
    damage: 35,
    points: 50,
    isBoss: true,
  };

  constructor() {
    super('EmberFieldsScene');
  }

  protected createBiomeLayout(): void {
    // ── Lava rivers (3 horizontal bands with navigable gaps) ─────────────────
    const lavaWalls = this.physics.add.staticGroup();

    const riverYs = [380, 700, 1020];

    riverYs.forEach((ry) => {
      for (let x = 0; x < WORLD_W; x += TILE) {
        const pct = x / WORLD_W;
        // Two gaps per river so player can navigate through
        const inGap =
          (pct >= 0.22 && pct <= 0.30) ||
          (pct >= 0.62 && pct <= 0.70);
        if (inGap) continue;

        // Render 2-tile-wide lava river (visible)
        for (let row = 0; row < 2; row++) {
          const ly = ry + row * TILE;
          this.add.image(x + TILE / 2, ly + TILE / 2, 'tile_lava_flow').setDepth(1);

          // Invisible static physics body aligned with visual
          const wall = this.physics.add.staticImage(x + TILE / 2, ly + TILE / 2, 'tile_lava_flow');
          wall.setAlpha(0);
          wall.refreshBody();
          lavaWalls.add(wall);
        }

        // Lava glow on top of river (every 3 tiles for performance)
        if (x % (TILE * 3) === 0) {
          this.add.image(x + TILE / 2, ry + TILE, 'lava_glow').setDepth(2).setAlpha(0.5);
        }
      }

      // Collide player + enemies with the lava walls
      this.physics.add.collider(this.player, lavaWalls);
      this.physics.add.collider(this.enemies, lavaWalls);
    });

    // ── Scorched earth patches overlaid on base ───────────────────────────────
    // Dense clusters to break up the monotone base tile
    const scorchedAreas = [
      { x: 200, y: 200, w: 6, h: 5 },
      { x: 700, y: 150, w: 5, h: 4 },
      { x: 1100, y: 250, w: 7, h: 4 },
      { x: 300, y: 520, w: 4, h: 6 },
      { x: 950, y: 540, w: 6, h: 5 },
      { x: 200, y: 800, w: 5, h: 5 },
      { x: 800, y: 870, w: 8, h: 4 },
      { x: 1200, y: 780, w: 5, h: 6 },
      { x: 400, y: 1100, w: 6, h: 4 },
      { x: 1000, y: 1150, w: 5, h: 5 },
    ];
    scorchedAreas.forEach(({ x, y, w, h }) => {
      for (let tx = 0; tx < w; tx++) {
        for (let ty = 0; ty < h; ty++) {
          // Base scorched already is the tileKey; add lava-border variation for contrast
          if ((tx + ty) % 3 === 0) {
            this.add.image(x + tx * TILE, y + ty * TILE, 'tile_lava_border').setDepth(0.5).setAlpha(0.6);
          }
        }
      }
    });

    // ── Dead trees ────────────────────────────────────────────────────────────
    const treePositions = [
      { x: 180, y: 160 }, { x: 580, y: 130 }, { x: 940, y: 200 },
      { x: 1300, y: 180 }, { x: 260, y: 480 }, { x: 820, y: 470 },
      { x: 1200, y: 510 }, { x: 140, y: 820 }, { x: 660, y: 840 },
      { x: 1050, y: 820 }, { x: 350, y: 1120 }, { x: 1180, y: 1100 },
    ];
    treePositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'dead_tree').setDepth(3).setOrigin(0.5, 1);
    });

    // ── Rock formations ────────────────────────────────────────────────────────
    const rockClusters = [
      { x: 100, y: 100 }, { x: 450, y: 80 }, { x: 900, y: 90 },
      { x: 1340, y: 120 }, { x: 80, y: 600 }, { x: 1350, y: 580 },
      { x: 200, y: 1050 }, { x: 750, y: 1000 }, { x: 1300, y: 1050 },
      { x: 500, y: 300 }, { x: 1000, y: 320 }, { x: 640, y: 760 },
    ];
    rockClusters.forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setDepth(3);
      this.add.image(x + 26, y + 14, 'rock_medium').setDepth(3);
    });

    // ── Wrecked boat (landmark near lava river) ───────────────────────────────
    this.add.image(500, 330, 'boat_wreck').setDepth(3);
    this.add.image(900, 650, 'boat_wreck').setDepth(3).setFlipX(true);

    // ── Lava glow pools (scattered bubbling spots) ────────────────────────────
    const glowSpots = [
      { x: 320, y: 240 }, { x: 720, y: 280 }, { x: 1100, y: 170 },
      { x: 180, y: 560 }, { x: 1250, y: 620 }, { x: 600, y: 620 },
      { x: 380, y: 940 }, { x: 980, y: 950 }, { x: 1350, y: 300 },
    ];
    glowSpots.forEach(({ x, y }) => {
      const glow = this.add.image(x, y, 'lava_glow').setDepth(2).setAlpha(0.7);
      // Subtle pulsing tween
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.4, to: 0.8 },
        scaleX: { from: 0.9, to: 1.1 },
        scaleY: { from: 0.9, to: 1.1 },
        duration: 1200 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // ── Zone-edge lava border (bottom 3 rows) ─────────────────────────────────
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      for (let row = 0; row < 3; row++) {
        const ly = WORLD_H - (row + 1) * TILE;
        this.add.image(tx * TILE + TILE / 2, ly + TILE / 2, row === 0 ? 'tile_lava_flow' : 'tile_lava_border').setDepth(1);
      }
    }
  }
}
