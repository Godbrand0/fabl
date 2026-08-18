import Phaser from 'phaser';
import CombatScene, { EnemyConfig } from './CombatScene';

const WORLD_W = 1440;
const WORLD_H = 1440;

// The one dedicated co-op mission — deliberately a different world from every
// single-player zone, not a reuse of them: its own enemy (Void Imp), its own boss
// (Void Titan) that returns across multiple lives before finally going down, and
// enemy counts that scale up with however many players are actually in the party.
export default class MultiplayerArenaScene extends CombatScene {
  protected zoneName = 'The Shattered Rift';
  protected minLevel = 1;
  protected maxLevel = 99;
  protected tileKey = 'tile_void';

  protected regularEnemyConfig: EnemyConfig = {
    key: 'void_imp',
    name: 'Void Imp',
    hp: 45,
    speed: 70,
    damage: 14,
    points: 8,
  };

  protected bossConfig: EnemyConfig = {
    key: 'void_titan',
    name: 'Void Titan',
    hp: 900,
    speed: 0,
    damage: 26,
    points: 60,
    isBoss: true,
  };

  // The Titan comes back tougher across 3 lives before it finally shatters.
  protected bossLives = 3;
  protected bossHpMultiplierPerPhase = 1.25;

  constructor() {
    super('MultiplayerArenaScene');
  }

  init() {
    super.init();
    this.isMultiplayer = true;

    // Read how many players are actually in the party (set by MultiplayerGameContainer)
    // and scale enemy pressure so a 3-player party isn't fighting a 1-player trickle.
    const ctx = this.game.registry.get('multiplayerContext') || {};
    const partySize = Math.max(1, ctx.partySize ?? 1);
    this.maxConcurrentEnemies = 6 + 4 * (partySize - 1);
    this.enemySpawnDelay = Math.max(900, 2000 - 350 * (partySize - 1));
    this.requiredDefeatsToBoss = 10 + 6 * (partySize - 1);

    // Only the party host actually spawns/drives enemies — everyone else mirrors them
    // from broadcasts, so the whole party fights the exact same swarm and boss.
    this.isSpawnAuthority = !!ctx.isHost;
  }

  protected createBiomeLayout(): void {
    const spawn = { x: WORLD_W / 2, y: WORLD_H - 200 };
    const farFromSpawn = (x: number, y: number) => Phaser.Math.Distance.Between(x, y, spawn.x, spawn.y) > 220;

    // Obsidian rock clusters tinted violet to match the rift theme — reuses the
    // existing rock textures (no new art needed) rather than duplicating geometry.
    const rockPositions = [
      { x: 200, y: 260 }, { x: 1200, y: 300 }, { x: 300, y: 1100 },
      { x: 1150, y: 1050 }, { x: 720, y: 190 }, { x: 720, y: 1250 },
      { x: 90, y: 720 }, { x: 1350, y: 720 }, { x: 480, y: 480 },
      { x: 960, y: 480 }, { x: 480, y: 960 }, { x: 960, y: 960 },
    ];
    rockPositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setTint(0x5533AA).setDepth(4);
      this.add.image(x + 18, y + 16, 'rock_medium').setTint(0x7744CC).setDepth(4);
    });

    // Rift crystal spikes — the arena's signature scenery piece, scattered widely so
    // the world reads as a real place rather than an empty tiled floor.
    for (let i = 0; i < 16; i++) {
      const x = Phaser.Math.Between(80, WORLD_W - 80);
      const y = Phaser.Math.Between(80, WORLD_H - 80);
      if (!farFromSpawn(x, y)) continue;
      this.add.image(x, y, 'rift_crystal')
        .setOrigin(0.5, 1)
        .setScale(Phaser.Math.FloatBetween(0.7, 1.4))
        .setDepth(4);
    }

    // Small glowing shard debris scattered across the ground — cheap, high-coverage
    // detail that reads immediately even at a glance, unlike a handful of big props.
    for (let i = 0; i < 45; i++) {
      const x = Phaser.Math.Between(40, WORLD_W - 40);
      const y = Phaser.Math.Between(40, WORLD_H - 40);
      this.add.image(x, y, 'rift_shard')
        .setAlpha(Phaser.Math.FloatBetween(0.4, 0.9))
        .setScale(Phaser.Math.FloatBetween(0.6, 1.1))
        .setDepth(3);
    }

    // Faint tinted ground-texture patches — same trick SunfallDunesScene uses for its
    // dune ripples, breaks up the otherwise perfectly repeating floor tile.
    for (let i = 0; i < 50; i++) {
      const x = Phaser.Math.Between(0, WORLD_W);
      const y = Phaser.Math.Between(0, WORLD_H);
      this.add.image(x, y, 'tile_obsidian')
        .setTint(0x6633AA)
        .setDepth(0.05)
        .setAlpha(0.18)
        .setScale(1.4);
    }
  }
}
