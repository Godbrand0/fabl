import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';

const WORLD_W = 1440;
const WORLD_H = 1440;
const TILE = 32;

export default class AshwaterMarshScene extends CombatScene {
  protected zoneName = 'Ashwater Marsh';
  protected minLevel = 3;
  protected maxLevel = 5;
  protected tileKey = 'tile_swamp';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'poison_slime',
    name: 'Poison Slime',
    hp: 120,
    speed: 40,
    damage: 35,
    points: 20
  };

  protected bossConfig: EnemyConfig = {
    key: 'swamp_hydra',
    name: 'Swamp Hydra',
    hp: 3200,
    speed: 0,
    damage: 55,
    points: 100,
    isBoss: true
  };

  constructor() {
    super('AshwaterMarshScene');
  }

  create() {
    super.create();

    // Swamp atmosphere: brief green flash on player every 500ms
    this.time.addEvent({
      delay: 500,
      callback: () => {
        if (this.player?.active) {
          this.player.setTint(0x8AE234);
          this.time.delayedCall(150, () => {
            if (this.player?.active) this.player.clearTint();
          });
        }
      },
      loop: true,
    });
  }

  protected createBiomeLayout(): void {
    const riverWalls = this.physics.add.staticGroup();

    // ── Three ashwater channels (same structure as EmberFields lava rivers) ──
    // Gaps shifted so routes are different from EmberFields
    const riverYs = [360, 720, 1060];

    riverYs.forEach((ry) => {
      for (let x = 0; x < WORLD_W; x += TILE) {
        const pct = x / WORLD_W;
        const inGap =
          (pct >= 0.18 && pct <= 0.27) ||
          (pct >= 0.60 && pct <= 0.70);
        if (inGap) continue;

        // 2-tile-wide water channel using oasis tile (dark blue water)
        for (let row = 0; row < 2; row++) {
          const ly = ry + row * TILE;

          // Visual — tinted blue-grey to feel like ashy murky water
          this.add.image(x + TILE / 2, ly + TILE / 2, 'tile_oasis')
            .setDepth(1)
            .setTint(0x4A7070);

          // Invisible physics body
          const wall = this.physics.add.staticImage(x + TILE / 2, ly + TILE / 2, 'tile_oasis');
          wall.setAlpha(0);
          wall.refreshBody();
          riverWalls.add(wall);
        }

        // Algae/foam edge highlights every 3 tiles
        if (x % (TILE * 3) === 0) {
          this.add.image(x + TILE / 2, ry + TILE / 2, 'tile_oasis')
            .setDepth(2)
            .setTint(0x2A4A30)
            .setAlpha(0.4);
        }
      }

      this.physics.add.collider(this.player, riverWalls);
      this.physics.add.collider(this.enemies, riverWalls);
    });

    // ── Swamp gas pools (pulsing green circles) ───────────────────────────────
    const gasSpots = [
      { x: 280, y: 220 }, { x: 700, y: 160 }, { x: 1150, y: 200 },
      { x: 140, y: 560 }, { x: 900, y: 530 }, { x: 1300, y: 580 },
      { x: 360, y: 900 }, { x: 840, y: 920 }, { x: 1100, y: 980 },
      { x: 480, y: 1200 }, { x: 1000, y: 1180 },
    ];
    gasSpots.forEach(({ x, y }) => {
      const pool = this.add.circle(x, y, 18, 0x3A8A20, 0.35).setDepth(2);
      this.tweens.add({
        targets: pool,
        alpha: { from: 0.18, to: 0.5 },
        scaleX: { from: 0.85, to: 1.1 },
        scaleY: { from: 0.85, to: 1.1 },
        duration: 1400 + Math.random() * 700,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });

    // ── Dead trees ────────────────────────────────────────────────────────────
    const treePositions = [
      { x: 100, y: 150 }, { x: 500, y: 120 }, { x: 900, y: 180 },
      { x: 1320, y: 140 }, { x: 220, y: 490 }, { x: 780, y: 460 },
      { x: 1200, y: 510 }, { x: 130, y: 850 }, { x: 640, y: 830 },
      { x: 1060, y: 860 }, { x: 300, y: 1130 }, { x: 1150, y: 1110 },
    ];
    treePositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'dead_tree').setDepth(3).setOrigin(0.5, 1).setTint(0x3A4A3A);
    });

    // ── Rock clusters ─────────────────────────────────────────────────────────
    const rockClusters = [
      { x: 80,   y: 80   }, { x: 420,  y: 70   }, { x: 860, y: 90   },
      { x: 1350, y: 100  }, { x: 60,   y: 600  }, { x: 1360, y: 620 },
      { x: 180,  y: 1080 }, { x: 760,  y: 1050 }, { x: 1280, y: 1060 },
      { x: 520,  y: 310  }, { x: 1020, y: 340  }, { x: 680,  y: 800 },
    ];
    rockClusters.forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setDepth(3).setTint(0x2E3A2E);
      this.add.image(x + 28, y + 12, 'rock_medium').setDepth(3).setTint(0x2E3A2E);
    });

    // ── Sunken wreckage (re-use boat_wreck, tinted dark) ─────────────────────
    this.add.image(460, 310, 'boat_wreck').setDepth(3).setTint(0x2A3A2A);
    this.add.image(920, 660, 'boat_wreck').setDepth(3).setFlipX(true).setTint(0x2A3A2A);

    // ── Zone-edge bog border (bottom 3 rows, dark water) ─────────────────────
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      for (let row = 0; row < 3; row++) {
        const ly = WORLD_H - (row + 1) * TILE;
        this.add.image(tx * TILE + TILE / 2, ly + TILE / 2, row === 0 ? 'tile_oasis' : 'tile_swamp')
          .setDepth(1)
          .setTint(0x1A2A1A);
      }
    }
  }
}
