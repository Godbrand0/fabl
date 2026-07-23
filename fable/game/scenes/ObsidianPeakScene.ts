import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';
import gameBridge from '../systems/GameBridge';

const WORLD_W = 1440;
const WORLD_H = 1440;
const TILE = 32;

export default class ObsidianPeakScene extends CombatScene {
  protected zoneName = 'Obsidian Peak';
  protected minLevel = 6;
  protected maxLevel = 8;
  protected tileKey = 'tile_obsidian';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'obsidian_golem',
    name: 'Obsidian Golem',
    hp: 250,
    speed: 30,
    damage: 55,
    points: 35,
  };

  protected bossConfig: EnemyConfig = {
    key: 'fire_demon',
    name: 'Fire Demon',
    hp: 5500,
    speed: 25,
    damage: 80,
    points: 200,
    isBoss: true,
  };

  private meteors!: Phaser.Physics.Arcade.Group;

  constructor() {
    super('ObsidianPeakScene');
  }

  create() {
    super.create();

    this.meteors = this.physics.add.group();
    this.physics.add.overlap(this.player, this.meteors, this.hitByMeteor as any, undefined, this);

    this.time.addEvent({
      delay: 2800,
      callback: this.spawnMeteor,
      callbackScope: this,
      loop: true,
    });
  }

  protected createBiomeLayout(): void {
    const ridgeWalls = this.physics.add.staticGroup();

    // ── Three obsidian ridges blocking passage ────────────────────────────────
    // Gap positions shifted again so each zone feels distinct
    const ridgeYs = [380, 740, 1080];

    ridgeYs.forEach((ry) => {
      for (let x = 0; x < WORLD_W; x += TILE) {
        const pct = x / WORLD_W;
        const inGap =
          (pct >= 0.30 && pct <= 0.40) ||
          (pct >= 0.70 && pct <= 0.80);
        if (inGap) continue;

        // 3-tile-wide ridge (thicker than lava rivers — harder zone)
        for (let row = 0; row < 3; row++) {
          const ly = ry + row * TILE;

          this.add.image(x + TILE / 2, ly + TILE / 2, row === 1 ? 'tile_wall' : 'tile_obsidian')
            .setDepth(1);

          const wall = this.physics.add.staticImage(x + TILE / 2, ly + TILE / 2, 'tile_wall');
          wall.setAlpha(0);
          wall.refreshBody();
          ridgeWalls.add(wall);
        }

        // Lava glow seeping through ridge cracks every 4 tiles
        if (x % (TILE * 4) === 0) {
          this.add.image(x + TILE / 2, ry + TILE, 'lava_glow')
            .setDepth(2)
            .setAlpha(0.3)
            .setTint(0xFF4400);
        }
      }

      this.physics.add.collider(this.player, ridgeWalls);
      this.physics.add.collider(this.enemies, ridgeWalls);
    });

    // ── Lava glow vents (pulsing orange/red circles along the ridges) ─────────
    ridgeYs.forEach((ry) => {
      [200, 480, 760, 1040, 1280].forEach((vx) => {
        const vent = this.add.circle(vx, ry + TILE, 14, 0xFF4400, 0.4).setDepth(3);
        this.tweens.add({
          targets: vent,
          alpha: { from: 0.2, to: 0.65 },
          scaleX: { from: 0.8, to: 1.2 },
          scaleY: { from: 0.8, to: 1.2 },
          duration: 900 + Math.random() * 500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      });
    });

    // ── Rock formations ───────────────────────────────────────────────────────
    const rockClusters = [
      { x: 90,   y: 90   }, { x: 380,  y: 70   }, { x: 820,  y: 100  },
      { x: 1300, y: 80   }, { x: 70,   y: 580  }, { x: 1340, y: 560  },
      { x: 160,  y: 1050 }, { x: 720,  y: 1020 }, { x: 1260, y: 1080 },
      { x: 560,  y: 280  }, { x: 980,  y: 300  }, { x: 700,  y: 820  },
      { x: 260,  y: 640  }, { x: 1100, y: 660  },
    ];
    rockClusters.forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setDepth(3).setTint(0x1A1A28);
      this.add.image(x + 30, y + 14, 'rock_medium').setDepth(3).setTint(0x1A1A28);
    });

    // ── Dead trees (charred black, no leaves survive the peak) ────────────────
    const treePositions = [
      { x: 160,  y: 160  }, { x: 560,  y: 140  }, { x: 940,  y: 190  },
      { x: 1280, y: 160  }, { x: 240,  y: 500  }, { x: 800,  y: 490  },
      { x: 1180, y: 520  }, { x: 120,  y: 870  }, { x: 660,  y: 860  },
      { x: 1040, y: 880  }, { x: 340,  y: 1120 }, { x: 1160, y: 1130 },
    ];
    treePositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'dead_tree').setDepth(3).setOrigin(0.5, 1).setTint(0x111118);
    });

    // ── Zone-edge obsidian border (bottom 3 rows) ─────────────────────────────
    for (let tx = 0; tx < WORLD_W / TILE; tx++) {
      for (let row = 0; row < 3; row++) {
        const ly = WORLD_H - (row + 1) * TILE;
        this.add.image(tx * TILE + TILE / 2, ly + TILE / 2, row === 0 ? 'tile_lava_flow' : 'tile_obsidian')
          .setDepth(1);
      }
    }
  }

  private spawnMeteor() {
    if (this.playerHP <= 0 || this.levelCleared) return;

    const spread = 280;
    const targetX = Phaser.Math.Clamp(
      this.player.x + Phaser.Math.Between(-spread, spread),
      80, WORLD_W - 80
    );
    const targetY = Phaser.Math.Clamp(
      this.player.y + Phaser.Math.Between(-spread, spread),
      80, WORLD_H - 80
    );

    const indicator = this.add.circle(targetX, targetY, 22, 0xEF2929, 0.22).setDepth(8);
    indicator.setStrokeStyle(2, 0xCC0000);

    this.time.delayedCall(1400, () => {
      indicator.destroy();
      if (this.playerHP <= 0 || this.levelCleared) return;

      const meteor = this.meteors.create(targetX, targetY - 60, 'enemy_projectile') as any;
      meteor.setScale(3);
      meteor.setVelocity(0, 340);
      meteor.setDepth(9);

      this.time.delayedCall(180, () => {
        if (!meteor?.active) return;

        const exp = this.add.circle(meteor.x, meteor.y, 40, 0xEF2929, 0.45).setDepth(10);
        this.tweens.add({
          targets: exp,
          scaleX: 1.6,
          scaleY: 1.6,
          alpha: 0,
          duration: 350,
          onComplete: () => exp.destroy(),
        });

        const dist = Phaser.Math.Distance.Between(
          this.player.x, this.player.y, meteor.x, meteor.y
        );
        if (dist < 55) {
          this.playerHP = Math.max(0, this.playerHP - 25);
          this.cameras.main.shake(160, 0.015);
          this.cameras.main.flash(100, 150, 0, 0);
          this.showFloatingText(this.player.x, this.player.y - 12, '-25 METEOR', '#EF2929');
          gameBridge.emit('player_health_changed', { hp: this.playerHP });
          if (this.playerHP <= 0) this.playerDied();
        }

        meteor.destroy();
      });
    });
  }

  private hitByMeteor(player: any, meteor: any) {
    meteor.destroy();
    this.playerHP = Math.max(0, this.playerHP - 20);
    this.cameras.main.shake(100, 0.01);
    this.cameras.main.flash(100, 150, 0, 0);
    gameBridge.emit('player_health_changed', { hp: this.playerHP });
    if (this.playerHP <= 0) this.playerDied();
  }
}
