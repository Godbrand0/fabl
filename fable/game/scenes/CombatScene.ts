import Phaser from 'phaser';
import gameBridge from '../systems/GameBridge';
import { audioManager } from '../../lib/audio';

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

const WEAPON_ATK: Record<string, number> = {
  bamboo_stick:         5,
  iron_sword:          12,
  ember_blade:         15,
  obsidian_greatsword: 60,
};

const WEAPON_TEXTURE: Record<string, string> = {
  bamboo_stick:         'player_bamboo',
  iron_sword:           'player_iron_sword',
  ember_blade:          'player_ember_blade',
  obsidian_greatsword:  'player_obsidian_gs',
};

export default abstract class CombatScene extends Phaser.Scene {
  protected player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  protected enemies!: Phaser.Physics.Arcade.Group;
  protected playerProjectiles!: Phaser.Physics.Arcade.Group;
  protected enemyProjectiles!: Phaser.Physics.Arcade.Group;
  protected coins!: Phaser.Physics.Arcade.Group;
  protected lootItems!: Phaser.Physics.Arcade.Group;

  // Player Stats
  protected playerHP = 100;
  protected playerMaxHP = 100;
  protected playerXP = 0;
  protected playerGold = 50;
  protected playerLevel = 1;
  protected playerDmg = 32;
  private playerDefense = 0;

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
  protected equippedWeaponAtk = 5;

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
        this.playerGold = data.gold ?? 50;
        this.playerLevel = data.level ?? 1;
        const str = data.stats?.strength || 0;
        const agi = data.stats?.agility || 0;
        const def = data.stats?.defense || 0;
        const weaponAtk = WEAPON_ATK[data.equippedWeapon ?? 'bamboo_stick'] ?? 5;
        this.equippedWeaponAtk = weaponAtk;
        this.playerDmg = 32 + (str * 2) + weaponAtk;
        this.playerDefense = def;
        this.shootCooldown = Math.max(150, 600 - (agi * 30));
        this.activeAbility = data.activeAbility ?? null;
        // Apply equipped weapon texture on load
        const textureKey = WEAPON_TEXTURE[data.equippedWeapon ?? 'bamboo_stick'] ?? 'player_bamboo';
        if (this.player?.active) this.player.setTexture(textureKey);

        // Seed mid-zone kill progress once, from the player's last save
        if (!this.zoneProgressSeeded) {
          this.zoneProgressSeeded = true;
          const seeded = data.zoneProgress?.[this.scene.key]?.enemiesDefeated;
          if (typeof seeded === 'number') this.enemiesDefeated = seeded;
        }
      }
    });

    // Ground: single TileSprite fills the entire world — one draw call, no rt.stamp needed
    this.add.tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, this.tileKey).setDepth(0);

    // Physics groups
    this.enemies = this.physics.add.group();
    this.playerProjectiles = this.physics.add.group();
    this.enemyProjectiles = this.physics.add.group();
    this.coins = this.physics.add.group();
    this.lootItems = this.physics.add.group();

    // Player — setCollideWorldBounds uses physics.world.setBounds set above
    this.player = this.physics.add.sprite(WORLD_W / 2, WORLD_H - 200, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDepth(6);

    // Camera follows player tightly
    this.cameras.main.startFollow(this.player, true, 1, 1);

    // Overlaps / collisions
    this.physics.add.overlap(this.player, this.coins, this.collectCoin as any, undefined, this);
    this.physics.add.overlap(this.player, this.lootItems, this.collectLoot as any, undefined, this);
    this.physics.add.overlap(this.playerProjectiles, this.enemies, this.damageEnemy as any, undefined, this);
    this.physics.add.overlap(this.enemyProjectiles, this.player, this.damagePlayer as any, undefined, this);
    this.physics.add.overlap(this.enemies, this.player, this.collidePlayerEnemy as any, undefined, this);

    // Enemy spawn timer
    this.time.addEvent({
      delay: 2000,
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
    // On player death: fully restart this zone fresh (fresh enemies, HP already
    // restored by React before this fires)
    const unsubRestart = gameBridge.on('restart_zone', () => { this.scene.restart(); });
    this.events.on('destroy', () => {
      unsubL(); unsubR(); unsubA(); unsubSI(); unsubNext(); unsubW();
      unsubPause(); unsubResume(); unsubRestart();
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

    // ── Enemy AI ──────────────────────────────────────────────────────────────
    this.enemies.getChildren().forEach((enemy: any) => {
      if (!enemy.active) return;
      if (enemy.isBoss) this.runBossAI(enemy, time);
      else this.runRegularEnemyAI(enemy, time);
    });

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
    gameBridge.emit('minimap_update', {
      world: { w: WORLD_W, h: WORLD_H },
      player: { x: this.player.x, y: this.player.y },
      enemies,
      defeated: this.enemiesDefeated,
      required: this.requiredDefeatsToBoss,
      bossSpawned: this.bossSpawned,
      bossAlive: !!this.bossInstance?.active,
    });
  }

  private spawnRegularEnemy() {
    if (!this.player?.active || this.playerHP <= 0 || this.bossSpawned || this.levelCleared) return;
    if (this.enemies.getLength() >= 6) return;

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

    const enemy = this.enemies.create(rx, ry, this.regularEnemyConfig.key) as any;
    enemy.setCollideWorldBounds(true);
    enemy.setDepth(5);
    enemy.setData('hp', this.regularEnemyConfig.hp);
    enemy.setData('maxHp', this.regularEnemyConfig.hp);
    enemy.setData('damage', this.regularEnemyConfig.damage);
    enemy.setData('points', this.regularEnemyConfig.points);
    enemy.setData('lastShot', 0);
    enemy.setData('lastMeleeDmg', 0);
  }

  private spawnBoss() {
    if (this.bossSpawned) return;
    this.bossSpawned = true;

    // Boss spawns in the upper half of the world, center-right
    const bossX = WORLD_W * 0.65;
    const bossY = WORLD_H * 0.25;
    const boss = this.enemies.create(bossX, bossY, this.bossConfig.key) as any;
    boss.setCollideWorldBounds(true);
    boss.isBoss = true;
    boss.setDepth(5);
    boss.setData('hp', this.bossConfig.hp);
    boss.setData('maxHp', this.bossConfig.hp);
    boss.setData('damage', this.bossConfig.damage);
    boss.setData('points', this.bossConfig.points);
    boss.setData('lastShot', 0);
    this.bossInstance = boss;

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

  private runRegularEnemyAI(enemy: any, time: number) {
    const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const aggroRadius = 180;

    if (dist > aggroRadius) {
      // Outside aggro range: idle in place
      enemy.setVelocity(0);
      return;
    }

    // Chase player
    const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
    const speed = enemy.getData('isSlowed') ? this.regularEnemyConfig.speed * 0.5 : this.regularEnemyConfig.speed;
    enemy.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );
    enemy.setFlipX(this.player.x < enemy.x);

    // Ranged attack when close enough
    const lastShot = enemy.getData('lastShot') || 0;
    if (time > lastShot + 2200 && dist < 200) {
      const proj = this.enemyProjectiles.create(enemy.x, enemy.y, 'enemy_projectile');
      proj.setVelocity(Math.cos(angle) * 160, Math.sin(angle) * 160);
      proj.setDepth(7);
      this.time.delayedCall(2000, () => { if (proj?.active) proj.destroy(); });
      enemy.setData('lastShot', time);
    }
  }

  private runBossAI(boss: any, time: number) {
    const angle = Phaser.Math.Angle.Between(boss.x, boss.y, this.player.x, this.player.y);
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

        const proj = this.enemyProjectiles.create(boss.x, boss.y, 'enemy_projectile');
        proj.setVelocity(Math.cos(a) * 200, Math.sin(a) * 200);
        proj.setDepth(7);
        this.time.delayedCall(2500, () => { if (proj?.active) proj.destroy(); });
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

    if (hp <= 0) this.defeatEnemy(enemy);
  }

  private defeatEnemy(enemy: any) {
    const isBoss = enemy.isBoss;
    const points = enemy.getData('points') || 10;

    const numCoins = isBoss ? 8 : Phaser.Math.Between(1, 3);
    for (let i = 0; i < numCoins; i++) {
      const coin = this.coins.create(enemy.x, enemy.y, 'coin') as any;
      coin.setVelocity(Phaser.Math.Between(-70, 70), Phaser.Math.Between(-70, 70));
      coin.setDrag(120);
      coin.setDepth(4);
    }

    if (isBoss || Math.random() < 0.25) {
      const lootKey = enemy.texture.key === 'poison_slime' ? 'scorpion' : 'fire_item';
      const loot = this.lootItems.create(enemy.x, enemy.y, 'coin') as any;
      loot.setTint(enemy.texture.key === 'poison_slime' ? 0x8AE234 : 0xEF2929);
      loot.setData('itemKey', lootKey);
      loot.setVelocity(Phaser.Math.Between(-40, 40), Phaser.Math.Between(-40, 40));
      loot.setDrag(80);
      loot.setDepth(4);
    }

    const xpGain = points * 2;
    audioManager.playSfx(isBoss ? 'bossDie' : 'enemyDie');
    this.showFloatingText(enemy.x, enemy.y - 28, `+${xpGain} XP`, '#8AE234');
    gameBridge.emit('player_xp_gained', xpGain);
    enemy.destroy();

    if (isBoss) {
      if (this.bossHpBar) this.bossHpBar.destroy();
      this.levelCleared = true;
      this.player.setVelocity(0);
      audioManager.playSfx('zoneClear');
      audioManager.stopMusic();
      gameBridge.emit('zone_cleared', { zone: this.scene.key, score: points * 10 });

      // Victory flash
      this.cameras.main.flash(800, 255, 220, 0);
    } else {
      this.enemiesDefeated++;
      gameBridge.emit('zone_progress_updated', { zone: this.scene.key, enemiesDefeated: this.enemiesDefeated });
      if (this.enemiesDefeated >= this.requiredDefeatsToBoss && !this.bossSpawned) {
        this.spawnBoss();
      }
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
    gameBridge.emit('player_died', { zone: this.scene.key });
  }

  private collectCoin(player: any, coin: any) {
    const gold = Phaser.Math.Between(2, 5);
    this.playerGold += gold;
    audioManager.playSfx('coin');
    this.showFloatingText(coin.x, coin.y - 8, `+${gold}G`, '#FFD700');
    gameBridge.emit('player_gold_changed', gold);
    coin.destroy();
  }

  private collectLoot(player: any, loot: any) {
    const heal = 10;
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
