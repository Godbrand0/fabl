import CombatScene, { EnemyConfig } from './CombatScene';

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
    // Obsidian rock clusters tinted violet to match the rift theme — reuses the
    // existing rock textures (no new art needed) rather than duplicating geometry.
    const rockPositions = [
      { x: 200, y: 260 }, { x: 1200, y: 300 }, { x: 300, y: 1100 },
      { x: 1150, y: 1050 }, { x: 720, y: 190 }, { x: 720, y: 1250 },
      { x: 90, y: 720 }, { x: 1350, y: 720 },
    ];
    rockPositions.forEach(({ x, y }) => {
      this.add.image(x, y, 'rock_large').setTint(0x5533AA).setDepth(4);
      this.add.image(x + 18, y + 16, 'rock_medium').setTint(0x7744CC).setDepth(4);
    });
  }
}
