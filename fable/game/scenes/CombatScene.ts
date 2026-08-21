import Phaser from 'phaser';
import gameBridge from '../systems/GameBridge';
import { audioManager } from '../../lib/audio';
import { computePlayerDamage, computeShootCooldown, getPlayerTextureKey } from '../../lib/combatFormulas';
import { DEFAULT_SKIN } from '../../lib/skins';
import RemotePartyMember from '../systems/RemotePartyMember';

export interface EnemyConfig {
  key: string;
  name: string;
  hp: number;
  speed: number;
  damage: number;
  points: number;
  isBoss?: boolean;
}

const WORLD_W = 1440;
const WORLD_H = 1440;
const TILE = 32;

export default abstract class CombatScene extends Phaser.Scene {
  protected player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  protected enemies!: Phaser.Physics.Arcade.Group;
  protected playerProjectiles!: Phaser.Physics.Arcade.Group;
  protected enemyProjectiles!: Phaser.Physics.Arcade.Group;
  protected lootItems!: Phaser.Physics.Arcade.Group;

  // Player Stats
  protected playerHP = 100;
  protected playerMaxHP = 100;
  protected playerXP = 0;
  protected playerLevel = 1;
  protected playerDmg = 32;
  private playerDefense = 0;
  // Stored so weapon_changed (which only carries a weapon id, not the full PlayerData)
  // can still recompute the correct skin-combined texture key.
  private playerSkin: string = DEFAULT_SKIN;

  // Joystick
  private joystickMoveDir = { x: 0, y: 0 };
  private joystickAimDir = { x: 0, y: 0 };
  private lastShootTime = 0;
  private shootCooldown = 600;

  // Ability
  private abilityCooldownActive = false;
  private activeAbility: string | null = null;
  private shieldActive = false;
  private shieldCircle: Phaser.GameObjects.Arc | null = null;

  // Keyboard
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };

  // Scene config
  protected abstract zoneName: string;
  protected abstract minLevel: number;
  protected abstract maxLevel: number;
  protected abstract tileKey: string;
  protected abstract bossConfig: EnemyConfig;
  protected abstract regularEnemyConfig: EnemyConfig;

  // Boss state
  protected bossSpawned = false;
  protected bossInstance: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody | null = null;
  protected bossHpBar: Phaser.GameObjects.Graphics | null = null;
  protected enemiesDefeated = 0;
  protected requiredDefeatsToBoss = 8;
  protected levelCleared = false;
  private zoneProgressSeeded = false;

  // Multiplayer co-op — off by default so single-player zones are byte-for-byte unchanged.
  // Set from the `multiplayerContext` registry value by subclasses that opt in (see
  // MultiplayerArenaScene), read in init() so they're in place before create() uses them.
  protected isMultiplayer = false;
  protected maxConcurrentEnemies = 6;
  protected enemySpawnDelay = 2000;
  // How many times the boss must be "defeated" before the mission actually ends —
  // 1 (default) matches existing single-player behavior exactly. Multiplayer arenas
  // override this so the boss returns stronger each time until its final life.
  protected bossLives = 1;
  protected bossHpMultiplierPerPhase = 1;
  private bossLivesRemaining = 1;
  private bossPhaseIndex = 0;
  private remoteMembers: Map<string, RemotePartyMember> = new Map();
  private lastPosBroadcast = 0;

  // Shared enemy state — only meaningful in multiplayer. The spawn authority (party
  // host) runs the real spawn timers/AI and broadcasts everything; every other client
  // mirrors enemies purely from those broadcasts, so the whole party fights the exact
  // same swarm rather than each player's own private copy.
  protected isSpawnAuthority = false;
  private enemyIdCounter = 0;
  private enemyById: Map<string, any> = new Map();
  private resolvedEnemyIds: Set<string> = new Set();
  private lastEnemySnapshotBroadcast = 0;
  // Kills THIS client personally landed (as opposed to enemiesDefeated, which in
  // multiplayer is the host's shared party-wide count used to gate the boss spawn) —
  // feeds the mission-results screen's per-player kill stat.
  private personalKills = 0;

  // Leaderboard score — sum of every enemy's point value killed this run
  // (imps + boss). Resets each time the scene (re)starts, so replays score fresh.
  protected runScore = 0;

  // Death guard — prevents physics overlaps from calling playerDied multiple times
  private playerDead = false;

  // HUD visuals
  private playerHPLabel!: Phaser.GameObjects.Text;
  private enemyHPGraphics!: Phaser.GameObjects.Graphics;

  constructor(key: string) {
    super(key);
  }

  init() {
    this.bossSpawned = false;
    this.bossInstance = null;
    this.enemiesDefeated = 0;
    this.levelCleared = false;
    this.playerDead = false;
    this.runScore = 0;
    this.bossLivesRemaining = this.bossLives;
    this.bossPhaseIndex = 0;
    this.remoteMembers.forEach(rm => rm.destroy());
    this.remoteMembers.clear();
    this.enemyIdCounter = 0;
    this.enemyById.clear();
    this.resolvedEnemyIds.clear();
    this.personalKills = 0;
  }

  create() {
    // World & camera bounds
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setZoom(2);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    // Sync player stats from React
    gameBridge.on('sync_player_data', (data: any) => {
      if (data) {
        this.playerHP = data.hp ?? 100;
        this.playerMaxHP = data.maxHp ?? 100;
        this.playerXP = data.xp ?? 0;
        this.playerLevel = data.level ?? 1;
        const str = data.stats?.strength || 0;
        const agi = data.stats?.agility || 0;
        const def = data.stats?.defense || 0;
        this.playerSkin = data.skin || DEFAULT_SKIN;
        const weaponId = data.equippedWeapon ?? 'bamboo_stick';
        this.playerDmg = computePlayerDamage(str, weaponId);
        this.playerDefense = def;
        this.shootCooldown = computeShootCooldown(agi);
        this.activeAbility = data.activeAbility ?? null;
        // Apply skin + equipped weapon texture on load
        if (this.player?.active) this.player.setTexture(getPlayerTextureKey(this.playerSkin, weaponId));

        // Seed mid-zone kill/score progress once, from the player's last save
        if (!this.zoneProgressSeeded) {
          this.zoneProgressSeeded = true;
          const seededKills = data.zoneProgress?.[this.scene.key]?.enemiesDefeated;
          const seededScore = data.zoneProgress?.[this.scene.key]?.runScore;
          if (typeof seededKills === 'number') this.enemiesDefeated = seededKills;
          if (typeof seededScore === 'number') this.runScore = seededScore;
        }
      }
    });

    // Ground: single TileSprite fills the entire world — one draw call, no rt.stamp needed
    this.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, this.tileKey).setDepth(0);

    // Physics groups
    this.enemies = this.physics.add.group();
    this.playerProjectiles = this.physics.add.group();
    this.enemyProjectiles = this.physics.add.group();
    this.lootItems = this.physics.add.group();

    // Player — setCollideWorldBounds uses physics.world.setBounds set above
    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H - 200, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(6);

    // Camera follows player tightly
    this.cameras.main.startFollow(this.player, true, 1, 1);

    // Overlaps / collisions
    this.physics.add.overlap(this.player, this.lootItems, this.collectLoot as any, undefined, this);
    this.physics.add.overlap(this.playerProjectiles, this.enemies, this.damageEnemy as any, undefined, this);
    this.physics.add.overlap(this.enemyProjectiles, this.player, this.damagePlayer as any, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.collidePlayerEnemy as any, undefined, this);

    // Enemy spawn timer
    this.time.addEvent({
      delay: this.enemySpawnDelay,
      callback: this.spawnRegularEnemy,
      callbackScope: this,
      loop: true,
    });

    // Minimap feed for the React HUD
    this.time.addEvent({
      delay: 250,
      callback: this.emitMinimapUpdate,
      callbackScope: this,
      loop: true,
    });

    // Multiplayer self-heal: a non-authority client normally stays in sync purely from
    // the host's ~150ms position broadcasts, but a single dropped packet (a flaky
    // mobile connection is the common case) otherwise leaves an enemy frozen forever —
    // nothing was re-requesting state after the very first join. Periodically asking
    // again means a missed broadcast heals itself within a few seconds instead of
    // staying stuck for the rest of the mission.
    this.time.addEvent({
      delay: 4000,
      callback: () => {
        if (this.isMultiplayer && !this.isSpawnAuthority) gameBridge.emit('mp_out_request_state');
      },
      loop: true,
    });

    // Keyboard
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D') as any;
    }

    // Bridge events
    const unsubL = gameBridge.on('joystick_left', (dir: any) => { this.joystickMoveDir = dir; });
    const unsubR = gameBridge.on('joystick_right', (dir: any) => { this.joystickAimDir = dir; });
    const unsubA = gameBridge.on('ability_trigger', () => { this.triggerActiveAbility(); });
    const unsubSI = gameBridge.on('request_scene_info', () => {
      gameBridge.emit('scene_changed', { scene: this.scene.key, title: `${this.zoneName} (Lv ${this.minLevel}–${this.maxLevel})` });
    });
    const unsubNext = gameBridge.on('proceed_to_next_zone', (data: any) => {
      if (!this.levelCleared) return;
      if (!this.scene.isActive(this.scene.key) || !this.cameras?.main) return;
      const target = data?.targetScene ?? 'SunfallDunesScene';
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.time.delayedCall(400, () => { this.scene.start(target); });
    });
    const unsubW = gameBridge.on('weapon_changed', ({ textureKey }: any) => {
      this.player.setTexture(textureKey);
    });
    // Pause menu: freeze/resume the running scene without destroying it
    const unsubPause = gameBridge.on('game_pause', () => { this.scene.pause(); });
    const unsubResume = gameBridge.on('game_resume', () => { this.scene.resume(); });
    // On a paid continue after death: revive in place, kill count and score
    // intact — no scene restart, no enemies un-killed.
    const unsubContinue = gameBridge.on('continue_run', () => { this.reviveInPlace(); });
    // On "Quit to Menu" after death: the pause menu overlays the game without
    // unmounting it, so the dead player (grey tint, disabled body) would
    // otherwise sit frozen underneath forever. Restart the scene to match
    // handleQuit's zoneProgress reset — next visit starts this zone fresh.
    const unsubQuit = gameBridge.on('quit_run', () => { this.scene.restart(); });

    // ── Multiplayer: remote party members + shared boss-phase transitions ─────
    // Only wired when a subclass has actually opted into multiplayer (see
    // MultiplayerArenaScene) — single-player scenes never emit/receive these.
    const unsubPartyData = gameBridge.on('sync_party_member_data', ({ wallet, data }: any) => {
      if (!this.isMultiplayer || !data) return;
      const existing = this.remoteMembers.get(wallet);
      if (existing) { existing.updateGear(data.equippedWeapon); return; }
      const rm = new RemotePartyMember(
        this, wallet, data.name ?? 'Ally', data.skin || DEFAULT_SKIN, data.equippedWeapon ?? 'bamboo_stick',
        this.player.x, this.player.y,
      );
      this.remoteMembers.set(wallet, rm);
    });
    const unsubRemotePos = gameBridge.on('mp_in_pos', (payload: any) => {
      const rm = this.remoteMembers.get(payload.wallet);
      if (rm) rm.receivePos(payload.x, payload.y, payload.flipX);
    });
    // Boss-phase transitions are decided by whichever client's own hit brings its local
    // boss copy to 0 HP first (see resolveBossPhaseDefeat) — the phase-number guard here
    // makes duplicate/late broadcasts from other clients a no-op.
    const unsubBossPhase = gameBridge.on('mp_boss_phase_defeat', (data: any) => {
      if (!this.isMultiplayer || data?.phase !== this.bossPhaseIndex) return;
      this.resolveBossPhaseDefeat(true); // a teammate landed this blow, not us — no score/XP here
    });

    // ── Multiplayer: mirrored (non-authority) enemy state ──────────────────────
    // Everything below is only ever received on non-host clients — the host never
    // subscribes to its own broadcasts, so there's no risk of it double-applying them.
    const unsubEnemySpawn = gameBridge.on('mp_in_enemy_spawn', (data: any) => {
      if (!this.isMultiplayer || this.isSpawnAuthority || this.enemyById.has(data.id)) return;
      const config = data.isBoss ? this.bossConfig : this.regularEnemyConfig;
      const enemy = this.spawnEnemySprite(config, data.x, data.y, data.isBoss, data.id, data.hp);
      if (data.isBoss) {
        this.bossInstance = enemy;
        this.bossSpawned = true;
        if (this.bossHpBar) this.bossHpBar.destroy();
        this.bossHpBar = this.add.graphics().setDepth(14);
      }
    });
    const unsubEnemySnapshot = gameBridge.on('mp_in_enemy_snapshot', (snapshot: any[]) => {
      if (!this.isMultiplayer || this.isSpawnAuthority) return;
      snapshot.forEach(s => {
        const enemy = this.enemyById.get(s.id);
        if (!enemy?.active) return;
        enemy.x += (s.x - enemy.x) * 0.35;
        enemy.y += (s.y - enemy.y) * 0.35;
        enemy.setFlipX(s.flipX);
      });
    });
    const unsubEnemyDamage = gameBridge.on('mp_in_enemy_damage', (data: any) => {
      if (!this.isMultiplayer) return;
      const enemy = this.enemyById.get(data.id);
      if (!enemy?.active) return;
      const hp = (enemy.getData('hp') ?? 0) - data.dmg;
      enemy.setData('hp', hp);
      enemy.setTint(0xFFFFFF);
      this.time.delayedCall(80, () => { if (enemy?.active) enemy.clearTint(); });
      // Boss "death" is decided by the dedicated phase-defeat broadcast, not by HP
      // crossing zero here — this keeps its HP bar in sync without double-resolving.
      if (hp <= 0 && !enemy.isBoss) this.defeatEnemy(enemy, true);
    });
    const unsubEnemyRemoved = gameBridge.on('mp_in_enemy_removed', (data: any) => {
      if (!this.isMultiplayer) return;
      const enemy = this.enemyById.get(data.id);
      if (enemy) this.defeatEnemy(enemy, true);
    });
    const unsubEnemyShot = gameBridge.on('mp_in_enemy_shot', (data: any) => {
      if (!this.isMultiplayer || this.isSpawnAuthority) return;
      const proj = this.enemyProjectiles.create(data.x, data.y, 'enemy_projectile');
      proj.setVelocity(data.vx, data.vy);
      proj.setDepth(7);
      this.time.delayedCall(data.life ?? 2000, () => { if (proj?.active) proj.destroy(); });
    });

    // ── Multiplayer: reconnect / host migration (see NetworkBridge for the Presence
    // side of this — it decides WHO should be authority, this just reacts to that). ──
    const unsubRoleChanged = gameBridge.on('mp_local_role_changed', (data: { isHost: boolean }) => {
      if (!this.isMultiplayer || data.isHost === this.isSpawnAuthority) return;
      this.isSpawnAuthority = data.isHost;
      if (this.isSpawnAuthority) {
        // Just took over (host disconnected, we're the earliest joiner left). The
        // gated spawn timer/AI loop starts firing again on its own next tick — the
        // one thing worth doing explicitly is re-announcing everything we already
        // have tracked, so anyone who joins after this point (or is still catching
        // up) gets it without waiting on the next natural spawn/snapshot cycle.
        this.enemies.getChildren().forEach((enemy: any) => {
          const netId = enemy.getData('netId');
          if (!netId || !enemy.active) return;
          gameBridge.emit('mp_out_enemy_spawn', {
            id: netId, isBoss: !!enemy.isBoss, x: enemy.x, y: enemy.y, hp: enemy.getData('hp'),
          });
        });
      }
    });
    // Answer a catch-up request from a client that just (re)joined mid-mission — only
    // the current authority actually has anything meaningful to report.
    const unsubRequestState = gameBridge.on('mp_in_request_state', () => {
      if (!this.isMultiplayer || !this.isSpawnAuthority) return;
      const enemies = this.enemies.getChildren()
        .filter((e: any) => e.active && e.getData('netId'))
        .map((e: any) => ({ id: e.getData('netId'), isBoss: !!e.isBoss, x: e.x, y: e.y, hp: e.getData('hp') }));
      gameBridge.emit('mp_out_state_snapshot', { enemies, bossPhaseIndex: this.bossPhaseIndex });
    });
    const unsubStateSnapshot = gameBridge.on('mp_in_state_snapshot', (data: { enemies: any[]; bossPhaseIndex?: number }) => {
      if (!this.isMultiplayer || this.isSpawnAuthority) return;
      // Catch our own phase counter up to reality — otherwise the phase-number guard
      // on mp_boss_phase_defeat would never match again for a client that joined mid-fight.
      if (typeof data.bossPhaseIndex === 'number' && data.bossPhaseIndex > this.bossPhaseIndex) {
        this.bossPhaseIndex = data.bossPhaseIndex;
        this.bossLivesRemaining = this.bossLives - this.bossPhaseIndex;
      }

      // A stale enemy we're still tracking but the host no longer reports must have
      // been defeated while we were out of sync (its removal broadcast likely dropped
      // on the same flaky connection that dropped the position updates) — clean it up.
      const freshIds = new Set(data.enemies?.map(e => e.id) ?? []);
      this.enemyById.forEach((enemy, id) => {
        if (freshIds.has(id) || this.resolvedEnemyIds.has(id)) return;
        this.resolvedEnemyIds.add(id);
        this.enemyById.delete(id);
        if (enemy.active) enemy.destroy();
      });

      data.enemies?.forEach(e => {
        const existing = this.enemyById.get(e.id);
        if (existing) {
          // Re-sync position/hp for an enemy we already have but may have gone stale
          // on — this is what actually un-freezes enemies after a missed
          // mp_in_enemy_snapshot broadcast (e.g. a dropped packet on a mobile
          // connection); without this, a resync only ever spawned MISSING enemies and
          // silently ignored ones already tracked, so a frozen enemy stayed frozen.
          if (existing.active) {
            existing.x = e.x;
            existing.y = e.y;
            existing.setData('hp', e.hp);
          }
          return;
        }
        const config = e.isBoss ? this.bossConfig : this.regularEnemyConfig;
        const enemy = this.spawnEnemySprite(config, e.x, e.y, e.isBoss, e.id, e.hp);
        if (e.isBoss) {
          this.bossInstance = enemy;
          this.bossSpawned = true;
          if (this.bossHpBar) this.bossHpBar.destroy();
          this.bossHpBar = this.add.graphics().setDepth(14);
        }
      });
    });
    const unsubMemberLeft = gameBridge.on('mp_member_left', (data: { wallet: string }) => {
      this.remoteMembers.get(data.wallet)?.markDisconnected();
    });
    const unsubMemberDowned = gameBridge.on('mp_member_downed', (data: { wallet: string }) => {
      this.remoteMembers.get(data.wallet)?.markDowned();
    });
    const unsubMemberRevived = gameBridge.on('mp_member_revived', (data: { wallet: string }) => {
      this.remoteMembers.get(data.wallet)?.markRevived();
    });

    this.events.on('destroy', () => {
      unsubL(); unsubR(); unsubA(); unsubSI(); unsubNext(); unsubW();
      unsubPause(); unsubResume(); unsubContinue(); unsubQuit();
      unsubPartyData(); unsubRemotePos(); unsubBossPhase();
      unsubEnemySpawn(); unsubEnemySnapshot(); unsubEnemyDamage(); unsubEnemyRemoved(); unsubEnemyShot();
      unsubRoleChanged(); unsubRequestState(); unsubStateSnapshot(); unsubMemberLeft();
      unsubMemberDowned(); unsubMemberRevived();
      this.remoteMembers.forEach(rm => rm.destroy());
      this.remoteMembers.clear();
    });

    // Player HP label (world-space, updated per frame)
    this.playerHPLabel = this.add
      .text(0, 0, '', { fontFamily: 'monospace', fontSize: '9px', color: '#44FF44', fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5, 1)
      .setDepth(15);

    // Enemy HP bar graphics layer
    this.enemyHPGraphics = this.add.graphics().setDepth(14);

    // Zone title card (fixed to camera)
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const titleCard = this.add
      .text(camW / 2, camH / 2, this.zoneName.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#FFFFFF',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 4,
        backgroundColor: '#00000088',
        padding: { x: 16, y: 8 },
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(100);

    this.cameras.main.fadeIn(600, 0, 0, 0);
    this.tweens.add({
      targets: titleCard,
      alpha: 0,
      delay: 1400,
      duration: 600,
      onComplete: () => titleCard.destroy(),
    });

    // Announce zone
    gameBridge.emit('scene_changed', { scene: this.scene.key, title: `${this.zoneName} (Lv ${this.minLevel}–${this.maxLevel})` });

    audioManager.playMusic('combat');

    // Subclass biome decoration hook
    this.createBiomeLayout();

    gameBridge.emit('request_player_data');
  }

  /** Override in subclasses to add biome-specific decorations and hazards */
  protected createBiomeLayout(): void {
    // Base: no extras
  }

  update(time: number) {
    if (!this.player?.active || this.playerHP <= 0 || this.levelCleared) return;

    // ── Movement ──────────────────────────────────────────────────────────────
    this.player.setVelocity(0);
    const speed = 140;
    let dx = 0;
    let dy = 0;

    if (this.wasd) {
      if (this.wasd.A.isDown || this.cursors?.left?.isDown) dx = -1;
      else if (this.wasd.D.isDown || this.cursors?.right?.isDown) dx = 1;
      if (this.wasd.W.isDown || this.cursors?.up?.isDown) dy = -1;
      else if (this.wasd.S.isDown || this.cursors?.down?.isDown) dy = 1;
    }

    if (Math.abs(this.joystickMoveDir.x) > 0.1 || Math.abs(this.joystickMoveDir.y) > 0.1) {
      dx = this.joystickMoveDir.x;
      dy = this.joystickMoveDir.y;
    }

    if (dx !== 0 || dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      this.player.setVelocity((dx / len) * speed, (dy / len) * speed);
      if (dx < 0) this.player.setFlipX(true);
      if (dx > 0) this.player.setFlipX(false);
    }

    // ── Aiming + Shooting ─────────────────────────────────────────────────────
    let ax = this.joystickAimDir.x;
    let ay = this.joystickAimDir.y;
    if (this.cursors?.space?.isDown && ax === 0 && ay === 0) {
      ax = this.player.flipX ? -1 : 1;
    }
    if ((Math.abs(ax) > 0.3 || Math.abs(ay) > 0.3) && time > this.lastShootTime + this.shootCooldown) {
      this.shootProjectile(ax, ay);
      this.lastShootTime = time;
    }

    // ── Enemy AI — only the spawn authority (host) drives it; everyone else's
    //    enemies are positioned purely from mp_in_enemy_snapshot below ──────────
    if (!this.isMultiplayer || this.isSpawnAuthority) {
      this.enemies.getChildren().forEach((enemy: any) => {
        if (!enemy.active) return;
        if (enemy.isBoss) this.runBossAI(enemy, time);
        else this.runRegularEnemyAI(enemy, time);
      });
    }

    if (this.shieldCircle) {
      this.shieldCircle.setPosition(this.player.x, this.player.y);
    }

    // ── Boss HP bar ───────────────────────────────────────────────────────────
    if (this.bossSpawned && this.bossInstance?.active) {
      this.drawBossHpBar();
    }

    // ── Player HP label ───────────────────────────────────────────────────────
    this.playerHPLabel.setPosition(this.player.x, this.player.y - 20);
    this.playerHPLabel.setText(`♥ ${this.playerHP}`);

    // ── Multiplayer: interpolate remote party members, broadcast our own position ──
    if (this.isMultiplayer) {
      this.remoteMembers.forEach(rm => rm.tick());
      if (time - this.lastPosBroadcast > 100) {
        this.lastPosBroadcast = time;
        gameBridge.emit('mp_out_pos', { x: this.player.x, y: this.player.y, flipX: this.player.flipX });
      }
      // Host also broadcasts where every enemy actually is, so mirrored copies on
      // other clients track the real fight instead of drifting from independent AI.
      if (this.isSpawnAuthority && time - this.lastEnemySnapshotBroadcast > 150) {
        this.lastEnemySnapshotBroadcast = time;
        const snapshot = this.enemies.getChildren()
          .filter((e: any) => e.active && e.getData('netId'))
          .map((e: any) => ({ id: e.getData('netId'), x: e.x, y: e.y, flipX: e.flipX }));
        if (snapshot.length) gameBridge.emit('mp_out_enemy_snapshot', snapshot);
      }
    }

    // ── Enemy HP mini-bars ────────────────────────────────────────────────────
    this.enemyHPGraphics.clear();
    this.enemies.getChildren().forEach((enemy: any) => {
      if (!enemy.active) return;
      const hp = enemy.getData('hp');
      const maxHp = enemy.getData('maxHp');
      if (!hp || !maxHp) return;
      const pct = Math.max(0, hp / maxHp);
      const bw = enemy.isBoss ? 60 : 26;
      const bh = 3;
      const ex = enemy.x;
      const ey = enemy.y - enemy.displayHeight / 2 - 4;
      this.enemyHPGraphics.fillStyle(0x000000, 0.75);
      this.enemyHPGraphics.fillRect(ex - bw / 2, ey - bh, bw, bh);
      this.enemyHPGraphics.fillStyle(pct > 0.5 ? 0xF1C40F : 0xCC2200);
      this.enemyHPGraphics.fillRect(ex - bw / 2, ey - bh, bw * pct, bh);
    });
  }

  private shootProjectile(dx: number, dy: number) {
    const len = Math.sqrt(dx * dx + dy * dy);
    const proj = this.playerProjectiles.create(this.player.x, this.player.y, 'projectile');
    proj.setVelocity((dx / len) * 350, (dy / len) * 350);
    proj.setDepth(8);
    this.time.delayedCall(1500, () => { if (proj?.active) proj.destroy(); });
    audioManager.playSfx('shoot');
  }

  private triggerActiveAbility() {
    if (this.abilityCooldownActive || this.playerHP <= 0) return;

    switch (this.activeAbility) {
      case 'fire_nova':    this.useFireNova();    break;
      case 'poison_cloak': this.usePoisonCloak(); break;
      case 'stone_shield': this.useStoneShield(); break;
      default: return; // no ability equipped
    }
  }

  private useFireNova() {
    this.abilityCooldownActive = true;
    audioManager.playSfx('fireNova');
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const proj = this.playerProjectiles.create(this.player.x, this.player.y, 'projectile_nova');
      proj.setVelocity(Math.cos(angle) * 280, Math.sin(angle) * 280);
      proj.setDepth(8);
      this.time.delayedCall(1200, () => { if (proj?.active) proj.destroy(); });
    }

    const ring = this.add.circle(this.player.x, this.player.y, 10, 0xFF6600, 0.5).setDepth(9);
    this.tweens.add({ targets: ring, scaleX: 12, scaleY: 12, alpha: 0, duration: 500, onComplete: () => ring.destroy() });

    gameBridge.emit('ability_cooldown_started', { duration: 4000 });
    this.time.delayedCall(4000, () => { this.abilityCooldownActive = false; });
  }

  private usePoisonCloak() {
    this.abilityCooldownActive = true;
    audioManager.playSfx('poison');
    const ring = this.add.circle(this.player.x, this.player.y, 10, 0x44AA44, 0.45).setDepth(9);
    this.tweens.add({ targets: ring, scaleX: 12, scaleY: 12, alpha: 0, duration: 800, onComplete: () => ring.destroy() });

    const enemies = this.enemies.getChildren();
    enemies.forEach((enemy: any) => {
      if (enemy.active && Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) <= 100) {
        if (!enemy.getData('baseSpeed')) {
          enemy.setData('baseSpeed', enemy.isBoss ? this.bossConfig.speed : this.regularEnemyConfig.speed);
        }
        enemy.setData('isSlowed', true);
        enemy.setTint(0x9933CC);
        this.time.delayedCall(200, () => { if (enemy.active) enemy.clearTint(); });
      }
    });

    this.time.delayedCall(8000, () => {
      this.enemies.getChildren().forEach((enemy: any) => {
        if (enemy.active) enemy.setData('isSlowed', false);
      });
    });

    gameBridge.emit('ability_cooldown_started', { duration: 10000 });
    this.time.delayedCall(10000, () => { this.abilityCooldownActive = false; });
  }

  private useStoneShield() {
    this.abilityCooldownActive = true;
    this.shieldActive = true;
    audioManager.playSfx('shield');
    this.shieldCircle = this.add.circle(this.player.x, this.player.y, 20, 0x6B3A1F, 0.55).setDepth(5);

    this.time.delayedCall(5000, () => {
      this.shieldActive = false;
      this.shieldCircle?.destroy();
      this.shieldCircle = null;
    });

    gameBridge.emit('ability_cooldown_started', { duration: 15000 });
    this.time.delayedCall(15000, () => { this.abilityCooldownActive = false; });
  }

  private emitMinimapUpdate() {
    if (!this.player?.active) return;
    const enemies = this.enemies.getChildren()
      .filter((e: any) => e.active)
      .map((e: any) => ({ x: e.x, y: e.y, isBoss: !!e.isBoss }));
    const party = this.isMultiplayer
      ? Array.from(this.remoteMembers.values()).map(rm => ({ ...rm.getPosition(), ghosted: rm.isGhosted() }))
      : [];
    gameBridge.emit('minimap_update', {
      world: { w: WORLD_W, h: WORLD_H },
      player: { x: this.player.x, y: this.player.y },
      enemies,
      party,
      defeated: this.enemiesDefeated,
      required: this.requiredDefeatsToBoss,
      bossSpawned: this.bossSpawned,
      bossAlive: !!this.bossInstance?.active,
    });
  }

  // Creates a physics-enabled enemy sprite and (in multiplayer) registers it under a
  // shared network id so damage/position/removal broadcasts can find it again. Used
  // both by the spawn authority (real spawns) and by mirroring clients (spawns
  // replayed from mp_in_enemy_spawn) — the two paths must produce identical state.
  private spawnEnemySprite(config: EnemyConfig, x: number, y: number, isBoss: boolean, netId: string, hp?: number): any {
    const enemy = this.enemies.create(x, y, config.key) as any;
    enemy.setCollideWorldBounds(true);
    enemy.setDepth(5);
    if (isBoss) enemy.isBoss = true;
    const useHp = hp ?? config.hp;
    enemy.setData('hp', useHp);
    enemy.setData('maxHp', useHp);
    enemy.setData('damage', config.damage);
    enemy.setData('points', config.points);
    enemy.setData('lastShot', 0);
    enemy.setData('lastMeleeDmg', 0);
    if (netId) {
      enemy.setData('netId', netId);
      this.enemyById.set(netId, enemy);
    }
    return enemy;
  }

  private spawnRegularEnemy() {
    if (this.isMultiplayer && !this.isSpawnAuthority) return; // mirrored clients never self-spawn
    if (!this.player?.active || this.playerHP <= 0 || this.bossSpawned || this.levelCleared) return;
    if (this.enemies.getLength() >= this.maxConcurrentEnemies) return;

    // Spawn within world bounds but not too close to player
    let rx = 0, ry = 0;
    let attempts = 0;
    do {
      rx = Phaser.Math.Between(80, WORLD_W - 80);
      ry = Phaser.Math.Between(80, WORLD_H - 80);
      attempts++;
    } while (
      Phaser.Math.Distance.Between(rx, ry, this.player.x, this.player.y) < 240 &&
      attempts < 10
    );

    const netId = this.isMultiplayer ? `e${++this.enemyIdCounter}` : '';
    this.spawnEnemySprite(this.regularEnemyConfig, rx, ry, false, netId);
    if (this.isMultiplayer) {
      gameBridge.emit('mp_out_enemy_spawn', { id: netId, isBoss: false, x: rx, y: ry, hp: this.regularEnemyConfig.hp });
    }
  }

  private spawnBoss() {
    if (this.bossSpawned) return;
    if (this.isMultiplayer && !this.isSpawnAuthority) return; // only the host actually summons it
    this.bossSpawned = true;

    // Boss spawns in the upper half of the world, center-right
    const bossX = WORLD_W * 0.65;
    const bossY = WORLD_H * 0.25;
    // Each returning life comes back tougher (bossHpMultiplierPerPhase === 1 outside
    // multiplayer, so single-player HP is unaffected).
    const scaledHp = Math.round(this.bossConfig.hp * Math.pow(this.bossHpMultiplierPerPhase, this.bossPhaseIndex));
    // A fresh id per phase — the previous phase's id is already gone from enemyById
    // (see resolveBossPhaseDefeat), so this can't collide with a stale entry.
    const netId = this.isMultiplayer ? `boss${this.bossPhaseIndex}` : '';
    this.bossInstance = this.spawnEnemySprite(this.bossConfig, bossX, bossY, true, netId, scaledHp);
    if (this.isMultiplayer) {
      gameBridge.emit('mp_out_enemy_spawn', { id: netId, isBoss: true, x: bossX, y: bossY, hp: scaledHp });
    }

    this.bossHpBar = this.add.graphics().setDepth(14);
    this.cameras.main.flash(500, 200, 0, 0);
    audioManager.playSfx('bossSpawn');
    audioManager.playMusic('boss');
    // Boss warning text (camera-fixed)
    const camW = this.cameras.main.width;
    const camH = this.cameras.main.height;
    const warn = this.add
      .text(camW / 2, camH * 0.4, `⚠ ${this.bossConfig.name.toUpperCase()} ⚠`, {
        fontFamily: 'monospace',
        fontSize: '16px',
        color: '#FF2222',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setScrollFactor(0)
      .setOrigin(0.5)
      .setDepth(100);

    this.tweens.add({ targets: warn, alpha: 0, duration: 400, yoyo: true, repeat: 3, onComplete: () => warn.destroy() });
  }

  // In multiplayer, only the spawn authority runs this AI (see the isSpawnAuthority
  // gate in update()) — without this, enemies would only ever notice and chase that
  // one client's own local player, completely ignoring every other party member no
  // matter how close they walk. Picks whichever player (local or remote) is nearest.
  private nearestTarget(x: number, y: number): { x: number; y: number } {
    let best = { x: this.player.x, y: this.player.y };
    let bestDist = Phaser.Math.Distance.Between(x, y, best.x, best.y);
    this.remoteMembers.forEach(rm => {
      if (!rm.isTargetable()) return;
      const pos = rm.getPosition();
      const d = Phaser.Math.Distance.Between(x, y, pos.x, pos.y);
      if (d < bestDist) { bestDist = d; best = pos; }
    });
    return best;
  }

  private runRegularEnemyAI(enemy: any, time: number) {
    const target = this.isMultiplayer ? this.nearestTarget(enemy.x, enemy.y) : this.player;
    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, target.x, target.y);
    const aggroRadius = 180;

    if (dist > aggroRadius) {
      // Outside aggro range: idle in place
      enemy.setVelocity(0);
      return;
    }

    // Chase player
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, target.x, target.y);
    const speed = enemy.getData('isSlowed') ? this.regularEnemyConfig.speed * 0.5 : this.regularEnemyConfig.speed;
    enemy.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );
    enemy.setFlipX(target.x < enemy.x);

    // Ranged attack when close enough
    const lastShot = enemy.getData('lastShot') || 0;
    if (time > lastShot + 2200 && dist < 200) {
      this.fireEnemyProjectile(enemy.x, enemy.y, Math.cos(angle) * 160, Math.sin(angle) * 160);
      enemy.setData('lastShot', time);
    }
  }

  // Creates an enemy projectile locally and — in multiplayer — broadcasts it so every
  // other client's own player is actually at risk from it too, not just the host's.
  private fireEnemyProjectile(x: number, y: number, vx: number, vy: number, life = 2000) {
    const proj = this.enemyProjectiles.create(x, y, 'enemy_projectile');
    proj.setVelocity(vx, vy);
    proj.setDepth(7);
    this.time.delayedCall(life, () => { if (proj?.active) proj.destroy(); });
    if (this.isMultiplayer && this.isSpawnAuthority) {
      gameBridge.emit('mp_out_enemy_shot', { x, y, vx, vy, life });
    }
    return proj;
  }

  private runBossAI(boss: any, time: number) {
    const target = this.isMultiplayer ? this.nearestTarget(boss.x, boss.y) : this.player;
    const angle = Phaser.Math.Angle.Between(boss.x, boss.y, target.x, target.y);
    const speed = boss.getData('isSlowed') ? this.bossConfig.speed * 0.5 : this.bossConfig.speed;
    boss.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );

    const lastShot = boss.getData('lastShot') || 0;
    const interval = this.bossConfig.key === 'fire_demon' ? 1200 : 1800;

    if (time > lastShot + interval) {
      const numProj = this.bossConfig.key === 'swamp_hydra' ? 5 : 8;
      for (let i = 0; i < numProj; i++) {
        let a = this.bossConfig.key === 'swamp_hydra'
          ? angle + (i - (numProj - 1) / 2) * 0.3
          : (i / numProj) * Math.PI * 2;

        this.fireEnemyProjectile(boss.x, boss.y, Math.cos(a) * 200, Math.sin(a) * 200, 2500);
      }

      if (this.bossConfig.key === 'fire_demon' && Math.random() < 0.4) {
        this.cameras.main.shake(200, 0.01);
      }

      boss.setData('lastShot', time);
    }
  }

  private drawBossHpBar() {
    if (!this.bossHpBar || !this.bossInstance) return;
    this.bossHpBar.clear();

    const hp = this.bossInstance.getData('hp');
    const maxHp = this.bossInstance.getData('maxHp');
    const pct = Math.max(0, hp / maxHp);

    // Fixed to camera viewport
    const camW = this.cameras.main.width;
    const barW = 200;
    const barH = 10;
    const x = (camW - barW) / 2;
    const y = 42;

    this.bossHpBar.setScrollFactor(0);
    this.bossHpBar.fillStyle(0x000000, 0.7);
    this.bossHpBar.fillRect(x - 2, y - 2, barW + 4, barH + 4);
    this.bossHpBar.fillStyle(0xCC0000);
    this.bossHpBar.fillRect(x, y, barW * pct, barH);
    this.bossHpBar.lineStyle(1, 0xFF4444);
    this.bossHpBar.strokeRect(x, y, barW, barH);

    // Boss name label above bar — only draw once via text (positioned in camera space)
    // (the text is re-drawn each frame, but it's lightweight)
    const nameText = this.add
      .text(camW / 2, y - 6, this.bossConfig.name.toUpperCase(), {
        fontFamily: 'monospace',
        fontSize: '8px',
        color: '#FF4444',
        fontStyle: 'bold',
      })
      .setScrollFactor(0)
      .setOrigin(0.5, 1)
      .setDepth(14);

    // Immediately destroy and redraw next frame (cheap for short text)
    this.time.delayedCall(50, () => { if (nameText?.active) nameText.destroy(); });
  }

  private damageEnemy(proj: any, enemy: any) {
    proj.destroy();

    let hp = enemy.getData('hp');
    const maxHp = enemy.getData('maxHp');
    let dmg = this.playerDmg;
    if (enemy.texture.key === 'obsidian_golem') dmg = Math.floor(dmg * 0.8);
    hp -= dmg;
    enemy.setData('hp', hp);

    audioManager.playSfx('hit');
    this.showFloatingText(enemy.x, enemy.y - 12, `${dmg}`, '#FFFFFF');
    enemy.setTint(0xFFFFFF);
    this.time.delayedCall(80, () => { if (enemy?.active) enemy.clearTint(); });

    const netId = enemy.getData('netId');
    if (this.isMultiplayer && netId) {
      gameBridge.emit('mp_out_enemy_damage', { id: netId, dmg });
    }

    if (hp <= 0) {
      if (enemy.isBoss) {
        // In multiplayer, tell the rest of the party this phase is over (guarded by
        // phase number on the receiving end so duplicate/late broadcasts are ignored)
        // — then resolve locally right away so the player who landed the blow isn't
        // waiting on a network round-trip to see the result.
        if (this.isMultiplayer) {
          gameBridge.emit('mp_out_boss_phase_defeat', { phase: this.bossPhaseIndex });
        }
        this.resolveBossPhaseDefeat(false);
      } else {
        this.defeatEnemy(enemy);
      }
    }
  }

  // fromNetwork=true means another client already resolved this kill and we're just
  // being told to remove our mirrored copy — no XP/loot/score is (re-)awarded, since
  // that already happened once, on whichever client's own damage crossed zero first.
  private defeatEnemy(enemy: any, fromNetwork = false) {
    const netId = enemy.getData('netId');
    if (netId) {
      if (this.resolvedEnemyIds.has(netId)) { if (enemy.active) enemy.destroy(); return; }
      this.resolvedEnemyIds.add(netId);
    }

    const points = enemy.getData('points') || 10;

    if (!fromNetwork) {
      this.runScore += points;
      this.personalKills++;
      if (Math.random() < 0.25) {
        const lootKey = enemy.texture.key === 'poison_slime' ? 'scorpion' : 'fire_item';
        const loot = this.lootItems.create(enemy.x, enemy.y, 'coin') as any;
        loot.setTint(enemy.texture.key === 'poison_slime' ? 0x8AE234 : 0xEF2929);
        loot.setData('itemKey', lootKey);
        loot.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(-40, 40));
        loot.setDrag(80);
        loot.setDepth(4);
      }

      const xpGain = points * 2;
      audioManager.playSfx('enemyDie');
      this.showFloatingText(enemy.x, enemy.y - 28, `+${xpGain} XP`, '#8AE234');
      gameBridge.emit('player_xp_gained', xpGain);

      if (this.isMultiplayer && netId) {
        gameBridge.emit('mp_out_enemy_removed', { id: netId });
      }
    }

    if (netId) this.enemyById.delete(netId);
    if (enemy.active) enemy.destroy();

    // Shared kill count: increments once per enemy regardless of who actually landed
    // the blow, so the boss-spawn threshold reflects the whole party's progress, not
    // just whichever client happens to be resolving this call.
    if (!this.isMultiplayer || !fromNetwork || this.isSpawnAuthority) {
      this.enemiesDefeated++;
    }
    gameBridge.emit('zone_progress_updated', { zone: this.scene.key, enemiesDefeated: this.enemiesDefeated, runScore: this.runScore });

    if (this.enemiesDefeated >= this.requiredDefeatsToBoss && !this.bossSpawned && (!this.isMultiplayer || this.isSpawnAuthority)) {
      this.spawnBoss();
    }
  }

  // Handles both the single-player case (bossLives === 1, so this always takes the
  // "final" branch — identical to the old inline behavior) and the multiplayer case
  // where the boss returns for additional lives before the mission actually ends.
  // fromNetwork=false means OUR damage brought this boss life to 0 — we get the
  // score/XP/kill credit for it, same rule the regular-enemy path uses. fromNetwork=true
  // means a teammate's blow did it and we're just following the shared transition.
  private resolveBossPhaseDefeat(fromNetwork: boolean) {
    if (!this.bossInstance) return; // already resolved (e.g. a duplicate broadcast)
    const { x, y } = this.bossInstance;
    const points = this.bossInstance.getData('points') || this.bossConfig.points;
    const oldNetId = this.bossInstance.getData('netId');
    if (oldNetId) this.enemyById.delete(oldNetId);
    if (this.bossHpBar) { this.bossHpBar.destroy(); this.bossHpBar = null; }
    if (this.bossInstance.active) this.bossInstance.destroy();
    this.bossInstance = null;
    this.bossLivesRemaining--;
    this.bossPhaseIndex++;
    audioManager.playSfx('bossDie');

    if (!fromNetwork) {
      this.runScore += points;
      this.personalKills++;
      const xpGain = points * 2;
      this.showFloatingText(x, y - 56, `+${xpGain} XP`, '#8AE234');
      gameBridge.emit('player_xp_gained', xpGain);
    }

    if (this.bossLivesRemaining > 0) {
      this.bossSpawned = false;
      this.showFloatingText(x, y - 40, `${this.bossLivesRemaining} ${this.bossLivesRemaining === 1 ? 'LIFE' : 'LIVES'} LEFT!`, '#FFD700');
      this.cameras.main.flash(400, 200, 100, 255);
      this.time.delayedCall(3500, () => { if (!this.levelCleared) this.spawnBoss(); });
    } else {
      this.levelCleared = true;
      this.player.setVelocity(0);
      audioManager.playSfx('zoneClear');
      audioManager.stopMusic();
      gameBridge.emit(
        this.isMultiplayer ? 'mp_mission_cleared' : 'zone_cleared',
        { zone: this.scene.key, score: this.runScore, kills: this.personalKills },
      );
      // Share our own final tally with the rest of the party so everyone's results
      // screen can show a full kill/score breakdown, not just their own line.
      if (this.isMultiplayer) {
        gameBridge.emit('mp_out_final_stats', { kills: this.personalKills, score: this.runScore });
      }
      this.cameras.main.flash(800, 255, 220, 0);
    }
  }

  // overlap(enemyProjectiles, player, cb) → Phaser calls collideSpriteVsGroup(player, group, cb)
  // → callback fires as cb(player, groupMember). Player is always first arg.
  private damagePlayer(player: any, proj: any) {
    if (this.playerDead) { proj.destroy(); return; }
    proj.destroy();

    if (this.shieldActive) return;

    if (Math.random() < 0.15) {
      this.showFloatingText(player.x, player.y - 22, 'BLOCK', '#4488FF');
      return;
    }

    const rawDmg = this.bossSpawned ? this.bossConfig.damage : this.regularEnemyConfig.damage;
    const dmg = Math.max(1, rawDmg - (this.playerDefense * 3));
    this.playerHP = Math.max(0, this.playerHP - dmg);

    audioManager.playSfx('playerHurt');
    this.cameras.main.flash(100, 150, 0, 0);
    this.showFloatingText(player.x, player.y - 12, `-${dmg}`, '#EF2929');
    gameBridge.emit('player_health_changed', { hp: this.playerHP });

    if (this.playerHP <= 0) this.playerDied();
  }

  // overlap(enemies, player, cb) → same Phaser rule → cb(player, enemy)
  private collidePlayerEnemy(player: any, enemy: any) {
    if (this.playerDead) return;
    if (this.shieldActive) return;
    const lastDmgTime = enemy.getData('lastMeleeDmg') || 0;
    const now = this.time.now;
    if (now > lastDmgTime + 900) {
      const rawDmg = enemy.isBoss ? this.bossConfig.damage : this.regularEnemyConfig.damage;
      const dmg = Math.max(1, rawDmg - (this.playerDefense * 3));
      this.playerHP = Math.max(0, this.playerHP - dmg);
      audioManager.playSfx('playerHurt');
      this.cameras.main.flash(100, 150, 0, 0);
      this.showFloatingText(player.x, player.y - 12, `-${dmg}`, '#EF2929');
      gameBridge.emit('player_health_changed', { hp: this.playerHP });
      enemy.setData('lastMeleeDmg', now);
      if (this.playerHP <= 0) this.playerDied();
    }
  }

  protected playerDied() {
    if (this.playerDead) return;
    this.playerDead = true;
    this.player.setVelocity(0);
    this.player.setTint(0x555753);
    this.player.body?.setEnable(false);
    audioManager.playSfx('playerDie');
    audioManager.stopMusic();
    gameBridge.emit('player_died', {
      zone: this.scene.key,
      runScore: this.runScore,
      enemiesDefeated: this.enemiesDefeated,
      requiredDefeatsToBoss: this.requiredDefeatsToBoss,
      bossSpawned: this.bossSpawned,
    });
    // Tell the party we're down — NetworkBridge re-tracks our presence as not-alive,
    // which (a) ghosts our sprite on teammates' screens distinctly from a dropped
    // connection, and (b) hands spawn authority to a living teammate immediately if we
    // were the host, instead of freezing enemies for the rest of the party.
    if (this.isMultiplayer) gameBridge.emit('mp_out_player_died');
  }

  // Paid continue: revive exactly where the player fell — kill count, score,
  // and boss-spawn progress are untouched, only HP and player state reset.
  protected reviveInPlace() {
    this.playerDead = false;
    this.playerHP = this.playerMaxHP;
    this.player.clearTint();
    this.player.body?.setEnable(true);
    this.player.setPosition(WORLD_W / 2, WORLD_H - 200);
    gameBridge.emit('player_health_changed', { hp: this.playerHP });
    audioManager.playMusic(this.bossSpawned ? 'boss' : 'combat');
  }

  private collectLoot(player: any, loot: any) {
    const heal = Phaser.Math.Between(5, 8);
    this.playerHP = Math.min(this.playerMaxHP, this.playerHP + heal);
    audioManager.playSfx('heal');
    this.showFloatingText(loot.x, loot.y - 8, `+${heal} HP`, '#EF2929');
    gameBridge.emit('player_health_changed', { hp: this.playerHP });
    loot.destroy();
  }

  protected showFloatingText(x: number, y: number, text: string, color: string) {
    const ft = this.add
      .text(x, y, text, { fontFamily: 'monospace', fontSize: '12px', color, fontStyle: 'bold', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(16);
    this.tweens.add({ targets: ft, y: y - 32, alpha: 0, duration: 800, onComplete: () => ft.destroy() });
  }
}
