import Phaser from 'phaser';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    const { width, height } = this.scale;
    const loadingText = this.add
      .text(width / 2, height / 2, 'Loading Fable...', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#FFFFFF',
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: loadingText,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
  }

  create() {
    this.createTextures();
    const target = this.game.registry.get('startZone') || 'SunfallDunesScene';
    this.scene.start(target);
  }

  private createTextures() {
    const draw = (
      key: string,
      w: number,
      h: number,
      fn: (g: Phaser.GameObjects.Graphics) => void
    ) => {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      fn(g);
      g.generateTexture(key, w, h);
      g.destroy();
    };

    // ─── PLAYER BASE FUNCTION ───
    const drawPlayer = (g: Phaser.GameObjects.Graphics) => {
      const skin = 0xA05C28;
      const headwrap = 0xCCCCBB;
      const shirt = 0xE8D8C8;
      const pants = 0x5C6840;
      const boot = 0x2A1608;

      // Headwrap
      g.fillStyle(headwrap);
      g.fillRect(9, 0, 14, 5);
      g.fillRect(7, 3, 18, 4);
      // Face
      g.fillStyle(skin);
      g.fillRect(9, 5, 14, 9);
      // Eyes
      g.fillStyle(0x1A0800);
      g.fillRect(11, 8, 3, 2);
      g.fillRect(18, 8, 3, 2);
      // Neck
      g.fillStyle(skin);
      g.fillRect(14, 14, 4, 3);
      // Shirt / torso
      g.fillStyle(shirt);
      g.fillRect(7, 17, 18, 12);
      // Arms (skin)
      g.fillStyle(skin);
      g.fillRect(2, 17, 7, 10);
      g.fillRect(23, 17, 7, 10);
      // Wrists
      g.fillStyle(shirt);
      g.fillRect(2, 27, 5, 2);
      g.fillRect(25, 27, 5, 2);
      // Pants / legs
      g.fillStyle(pants);
      g.fillRect(7, 29, 8, 13);
      g.fillRect(17, 29, 8, 13);
      // Boots
      g.fillStyle(boot);
      g.fillRect(6, 42, 9, 6);
      g.fillRect(17, 42, 9, 6);
    };

    // ─── PLAYER (BAMBOO STICK) ───
    draw('player_bamboo', 32, 48, (g) => {
      drawPlayer(g);
      const bamboo = 0x4A8A1A;
      g.fillStyle(bamboo);
      g.fillRect(25, 6, 4, 26);
      g.fillStyle(0x3A6A0A);
      g.fillRect(25, 12, 4, 2);
      g.fillRect(25, 20, 4, 2);
      g.fillStyle(0x6AB830);
      g.fillRect(26, 7, 1, 24);
    });

    // ─── PLAYER (IRON SWORD) ───
    draw('player_iron_sword', 32, 48, (g) => {
      drawPlayer(g);
      // Blade
      g.fillStyle(0xB0B8C0);
      g.fillRect(26, 2, 2, 28);
      // Edge highlight
      g.fillStyle(0xE8EEF0);
      g.fillRect(27, 2, 1, 14);
      // Crossguard
      g.fillStyle(0x707880);
      g.fillRect(23, 16, 8, 2);
      // Grip
      g.fillStyle(0x5C3A1E);
      g.fillRect(26, 18, 2, 8);
    });

    // ─── PLAYER (EMBER BLADE) ───
    draw('player_ember_blade', 32, 48, (g) => {
      drawPlayer(g);
      // Blade base & mid
      g.fillStyle(0x8B2200);
      g.fillRect(26, 2, 2, 14);
      g.fillStyle(0xD45000);
      g.fillRect(26, 8, 2, 8);
      // Hot edge
      g.fillStyle(0xFFAA00);
      g.fillRect(27, 2, 1, 14);
      // Tip accent
      g.fillStyle(0xFFEE44);
      g.fillRect(26, 2, 2, 2);
      // Crossguard
      g.fillStyle(0x6E3010);
      g.fillRect(23, 16, 8, 2);
      // Grip
      g.fillStyle(0x3A1A08);
      g.fillRect(26, 18, 2, 8);
    });

    // ─── PLAYER (OBSIDIAN GREATSWORD) ───
    draw('player_obsidian_gs', 32, 48, (g) => {
      drawPlayer(g);
      // Blade
      g.fillStyle(0x1A1020);
      g.fillRect(25, 0, 3, 20);
      // Edge shimmer
      g.fillStyle(0x6644AA);
      g.fillRect(27, 0, 1, 20);
      // Blade face crack
      g.fillStyle(0x3A2060);
      g.fillRect(26, 6, 1, 6);
      // Crossguard
      g.fillStyle(0x0E0A14);
      g.fillRect(22, 20, 10, 3);
      // Grip wrap
      g.fillStyle(0x2A1808);
      g.fillRect(26, 23, 2, 10);
      // Gemstone hint
      g.fillStyle(0x6644AA);
      g.fillRect(26, 27, 1, 1);
    });

    // Alias 'player' to 'player_bamboo' for compatibility
    draw('player', 32, 48, (g) => {
      drawPlayer(g);
      g.fillStyle(0x4A8A1A);
      g.fillRect(25, 6, 4, 26);
      g.fillStyle(0x3A6A0A);
      g.fillRect(25, 12, 4, 2);
      g.fillRect(25, 20, 4, 2);
      g.fillStyle(0x6AB830);
      g.fillRect(26, 7, 1, 24);
    });

    // ─── IMP (24×32) ─── Crimson demon, ember wings, glowing orange eyes ───
    draw('imp', 24, 32, (g) => {
      // Wings (dark ember-brown behind body)
      g.fillStyle(0x4A1800);
      g.fillTriangle(0, 6, 6, 2, 6, 18);
      g.fillTriangle(24, 6, 18, 2, 18, 18);

      // Wing membrane lighter
      g.fillStyle(0x6E2800);
      g.fillTriangle(0, 8, 5, 4, 5, 16);
      g.fillTriangle(24, 8, 19, 4, 19, 16);

      // Body
      g.fillStyle(0xAA1010);
      g.fillRect(5, 8, 14, 18);

      // Chest highlight
      g.fillStyle(0xCC2020);
      g.fillRect(7, 10, 10, 10);

      // Head
      g.fillStyle(0xAA1010);
      g.fillRect(6, 2, 12, 10);

      // Horns
      g.fillStyle(0x550000);
      g.fillRect(6, 0, 3, 3);
      g.fillRect(15, 0, 3, 3);

      // Glowing orange eyes
      g.fillStyle(0xFF6600);
      g.fillRect(8, 5, 3, 3);
      g.fillRect(13, 5, 3, 3);
      // Eye glow cores
      g.fillStyle(0xFFCC00);
      g.fillRect(9, 6, 1, 1);
      g.fillRect(14, 6, 1, 1);

      // Legs
      g.fillStyle(0x880E0E);
      g.fillRect(6, 26, 5, 6);
      g.fillRect(13, 26, 5, 6);

      // Claws
      g.fillStyle(0x333333);
      g.fillRect(5, 31, 3, 1);
      g.fillRect(13, 31, 3, 1);
    });

    // ─── SAND WRAITH BOSS (80×80) ─── Swirling desert spirit, bone-white core, sandstorm shroud ───
    draw('sand_wraith', 80, 80, (g) => {
      // Outer sand shroud (translucent swirling robe)
      g.fillStyle(0xC8A86B, 0.55);
      g.fillTriangle(40, 4, 4, 76, 76, 76);
      g.fillStyle(0xDCBE82, 0.4);
      g.fillTriangle(40, 14, 14, 70, 66, 70);

      // Tattered hem streaks
      g.fillStyle(0xB89458, 0.6);
      g.fillRect(10, 66, 6, 12);
      g.fillRect(24, 70, 5, 10);
      g.fillRect(38, 72, 5, 10);
      g.fillRect(52, 70, 5, 10);
      g.fillRect(64, 66, 6, 12);

      // Bone-white inner core
      g.fillStyle(0xEFE6D0);
      g.fillRect(30, 24, 20, 34);

      // Ribcage detail
      g.fillStyle(0xC8BFA0);
      g.fillRect(32, 30, 16, 2);
      g.fillRect(32, 36, 16, 2);
      g.fillRect(32, 42, 16, 2);

      // Hood shadow
      g.fillStyle(0x2A2416);
      g.fillCircle(40, 22, 13);

      // Glowing sand-yellow eyes
      g.fillStyle(0xFFCC44);
      g.fillRect(34, 18, 5, 5);
      g.fillRect(45, 18, 5, 5);
      g.fillStyle(0xFFEE99);
      g.fillRect(35, 19, 2, 2);
      g.fillRect(46, 19, 2, 2);

      // Wispy arms trailing into sand
      g.fillStyle(0xC8A86B, 0.5);
      g.fillTriangle(28, 30, 2, 46, 24, 54);
      g.fillTriangle(52, 30, 78, 46, 56, 54);
    });

    // ─── LAVA PUMPKIN BOSS (96×96) ─── Dark stone + lava cracks + carved face + claws ───
    draw('lava_pumpkin', 96, 96, (g) => {
      // Stone claw arms
      g.fillStyle(0x2A2A2A);
      g.fillRect(0, 28, 18, 40);
      g.fillRect(78, 28, 18, 40);
      // Claw tips
      g.fillStyle(0x1A1A1A);
      g.fillRect(0, 24, 8, 8);
      g.fillRect(78, 24, 8, 8);
      g.fillRect(0, 60, 8, 8);
      g.fillRect(88, 60, 8, 8);

      // Main body circle - dark stone
      g.fillStyle(0x333333);
      g.fillCircle(48, 50, 40);

      // Lava crack network
      g.fillStyle(0xFF4500);
      g.fillRect(30, 18, 3, 12);
      g.fillRect(60, 22, 3, 10);
      g.fillRect(20, 44, 10, 3);
      g.fillRect(64, 52, 10, 3);
      g.fillRect(42, 72, 3, 14);
      g.fillRect(24, 62, 8, 3);
      g.fillRect(62, 38, 8, 3);

      // Inner orange glow in cracks
      g.fillStyle(0xFF6A00);
      g.fillRect(31, 19, 1, 10);
      g.fillRect(21, 45, 8, 1);
      g.fillRect(65, 53, 8, 1);
      g.fillRect(43, 73, 1, 12);

      // Pumpkin face - slightly orange-tinted stone
      g.fillStyle(0x4A2800);
      g.fillCircle(48, 50, 30);

      // Triangle eyes (glowing orange-yellow)
      g.fillStyle(0xFF8C00);
      g.fillTriangle(28, 40, 40, 40, 34, 50);
      g.fillTriangle(56, 40, 68, 40, 62, 50);

      // Eye glow
      g.fillStyle(0xFFCC00);
      g.fillTriangle(30, 41, 38, 41, 34, 48);
      g.fillTriangle(58, 41, 66, 41, 62, 48);

      // Jagged mouth
      g.fillStyle(0xFF5500);
      g.fillRect(26, 60, 44, 6);
      g.fillStyle(0x1A1A1A);
      g.fillRect(30, 60, 4, 5);
      g.fillRect(40, 60, 4, 5);
      g.fillRect(50, 60, 4, 5);
      g.fillRect(60, 60, 4, 5);

      // Inner mouth glow
      g.fillStyle(0xFF6600);
      g.fillRect(27, 61, 42, 4);

      // Stone stem on top
      g.fillStyle(0x2A4A1A);
      g.fillRect(44, 4, 8, 14);
      g.fillStyle(0x1E3A12);
      g.fillRect(46, 6, 4, 10);
    });

    // ─── POISON SLIME (24×24) ───
    draw('poison_slime', 24, 24, (g) => {
      g.fillStyle(0x5C3B7A);
      g.fillEllipse(12, 15, 22, 17);
      g.fillStyle(0x7A52A0);
      g.fillEllipse(10, 11, 14, 9);
      g.fillStyle(0x9B72C0);
      g.fillEllipse(9, 9, 7, 5);
      // Poison eyes
      g.fillStyle(0x8AE234);
      g.fillCircle(7, 13, 2);
      g.fillCircle(17, 13, 2);
      g.fillStyle(0xCCFF44);
      g.fillCircle(7, 13, 1);
      g.fillCircle(17, 13, 1);
    });

    // ─── SWAMP HYDRA BOSS (80×80) ───
    draw('swamp_hydra', 80, 80, (g) => {
      // Body mass
      g.fillStyle(0x1A3C1A);
      g.fillRect(16, 28, 48, 44);
      g.fillStyle(0x264A26);
      g.fillRect(20, 32, 40, 36);

      // Neck segments
      g.fillStyle(0x1A3C1A);
      g.fillRect(12, 14, 10, 18);
      g.fillRect(35, 8, 10, 22);
      g.fillRect(58, 14, 10, 18);

      // Heads
      const drawHead = (hx: number, hy: number) => {
        g.fillStyle(0x2D6A2D);
        g.fillRect(hx, hy, 16, 14);
        // Eyes
        g.fillStyle(0xE63946);
        g.fillRect(hx + 2, hy + 3, 3, 3);
        g.fillRect(hx + 11, hy + 3, 3, 3);
        // Mouth slit
        g.fillStyle(0x0D1F0D);
        g.fillRect(hx + 2, hy + 9, 12, 2);
        // Fangs
        g.fillStyle(0xEEEECC);
        g.fillRect(hx + 4, hy + 10, 2, 3);
        g.fillRect(hx + 10, hy + 10, 2, 3);
      };

      drawHead(4, 2);
      drawHead(32, 0);
      drawHead(60, 2);

      // Moss/algae detail
      g.fillStyle(0x4A8A4A, 0.7);
      g.fillRect(22, 40, 8, 6);
      g.fillRect(46, 48, 10, 6);
      g.fillRect(30, 56, 6, 8);
    });

    // ─── OBSIDIAN GOLEM (36×36) ───
    draw('obsidian_golem', 36, 36, (g) => {
      g.fillStyle(0x1E1E2A);
      g.fillRect(4, 2, 28, 32);

      // Stone facets
      g.fillStyle(0x2A2A3C);
      g.fillRect(6, 4, 12, 12);
      g.fillRect(20, 16, 12, 12);
      g.fillRect(6, 20, 10, 10);

      // Blue runic veins
      g.fillStyle(0x4466CC);
      g.fillRect(10, 16, 16, 2);
      g.fillRect(17, 8, 2, 18);
      g.fillRect(8, 26, 20, 1);

      // Glowing blue eyes
      g.fillStyle(0x88AAFF);
      g.fillRect(8, 8, 4, 4);
      g.fillRect(24, 8, 4, 4);
      g.fillStyle(0xCCDDFF);
      g.fillRect(9, 9, 2, 2);
      g.fillRect(25, 9, 2, 2);

      // Blocky fists
      g.fillStyle(0x1A1A26);
      g.fillRect(0, 20, 6, 8);
      g.fillRect(30, 20, 6, 8);
    });

    // ─── FIRE DEMON BOSS (80×80) ───
    draw('fire_demon', 80, 80, (g) => {
      // Wings
      g.fillStyle(0x1A0A00);
      g.fillTriangle(12, 16, 0, 0, 12, 44);
      g.fillTriangle(68, 16, 80, 0, 68, 44);
      g.fillStyle(0x550000);
      g.fillTriangle(12, 18, 2, 4, 12, 40);
      g.fillTriangle(68, 18, 78, 4, 68, 40);

      // Body - dark core
      g.fillStyle(0x1A0000);
      g.fillRect(14, 10, 52, 60);

      // Inner fire layers
      g.fillStyle(0xAA0000);
      g.fillRect(18, 14, 44, 52);
      g.fillStyle(0xDD2200);
      g.fillRect(22, 18, 36, 44);
      g.fillStyle(0xFF4400);
      g.fillRect(26, 22, 28, 36);
      g.fillStyle(0xFF8800);
      g.fillRect(30, 26, 20, 28);
      g.fillStyle(0xFFCC00);
      g.fillRect(34, 30, 12, 20);

      // Face
      g.fillStyle(0x220000);
      g.fillRect(24, 20, 32, 24);

      // Horns
      g.fillStyle(0xDD2200);
      g.fillRect(18, 4, 8, 14);
      g.fillRect(54, 4, 8, 14);

      // Eyes (lava-bright)
      g.fillStyle(0xFF6600);
      g.fillRect(28, 26, 8, 8);
      g.fillRect(44, 26, 8, 8);
      g.fillStyle(0xFFFF00);
      g.fillRect(30, 28, 4, 4);
      g.fillRect(46, 28, 4, 4);

      // Mouth line
      g.fillStyle(0xFF4400);
      g.fillRect(28, 38, 24, 3);
    });

    // ─── CHICKEN (16×14) ───
    draw('chicken', 16, 14, (g) => {
      g.fillStyle(0xEEEEEE);
      g.fillEllipse(7, 8, 12, 9);
      // Head
      g.fillStyle(0xDDDDDD);
      g.fillCircle(12, 4, 4);
      // Beak
      g.fillStyle(0xFFAA00);
      g.fillRect(15, 4, 3, 2);
      // Eye
      g.fillStyle(0x111111);
      g.fillRect(13, 3, 1, 1);
      // Comb
      g.fillStyle(0xEE2222);
      g.fillRect(11, 1, 2, 2);
      // Feet
      g.fillStyle(0xFFAA00);
      g.fillRect(5, 12, 2, 2);
      g.fillRect(9, 12, 2, 2);
    });

    // ─── PROJECTILE (8×8) ───
    draw('projectile', 8, 8, (g) => {
      g.fillStyle(0x4488FF);
      g.fillCircle(4, 4, 3);
      g.fillStyle(0xAADDFF);
      g.fillCircle(3, 3, 1);
    });

    // ─── PROJECTILE NOVA (14×14) ───
    draw('projectile_nova', 14, 14, (g) => {
      g.fillStyle(0xFF6600);
      g.fillCircle(7, 7, 6);
      g.fillStyle(0xFFCC00);
      g.fillCircle(6, 6, 2);
    });

    // ─── ENEMY PROJECTILE (8×8) ───
    draw('enemy_projectile', 8, 8, (g) => {
      g.fillStyle(0xFF4400);
      g.fillCircle(4, 4, 3);
      g.fillStyle(0xFFAA00);
      g.fillCircle(3, 3, 1);
    });

    // ─── COIN (8×8) ───
    draw('coin', 8, 8, (g) => {
      g.fillStyle(0xFFCC00);
      g.fillCircle(4, 4, 3);
      g.fillStyle(0xFFEE66);
      g.fillCircle(3, 3, 1);
      g.lineStyle(1, 0xCC9900);
      g.strokeCircle(4, 4, 3);
    });

    // ─── CHEST (24×20) ───
    draw('chest', 24, 20, (g) => {
      g.fillStyle(0x6B4010);
      g.fillRect(0, 4, 24, 16);
      // Lid
      g.fillStyle(0x8B5C20);
      g.fillRect(0, 0, 24, 8);
      // Gold bands
      g.fillStyle(0xFFCC00);
      g.fillRect(0, 8, 24, 2);
      g.fillRect(10, 0, 4, 20);
      // Lock
      g.fillStyle(0xFFAA00);
      g.fillCircle(12, 10, 2);
    });

    // ═══════════════════════════════════════════════
    // GROUND TILES (32×32)
    // ═══════════════════════════════════════════════

    // Sandy ochre - town ground  (#C8A86B palette)
    draw('tile_sandy', 32, 32, (g) => {
      g.fillStyle(0xC8A86B);
      g.fillRect(0, 0, 32, 32);
      // Pebble details
      g.fillStyle(0xB89458);
      g.fillRect(4, 10, 3, 2);
      g.fillRect(14, 22, 2, 3);
      g.fillRect(22, 6, 4, 2);
      g.fillRect(26, 18, 2, 4);
      g.fillStyle(0xDCBE82);
      g.fillRect(8, 4, 2, 2);
      g.fillRect(18, 28, 3, 2);
    });

    // Alias tile_desert → tile_sandy for legacy references
    draw('tile_desert', 32, 32, (g) => {
      g.fillStyle(0xC8A86B);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0xB89458);
      g.fillRect(4, 12, 3, 2);
      g.fillRect(20, 22, 4, 2);
    });

    // Muted olive grass  (#4A6741)
    draw('tile_grass', 32, 32, (g) => {
      g.fillStyle(0x4A6741);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x5A7A50);
      g.fillRect(2, 6, 2, 4);
      g.fillRect(8, 20, 3, 4);
      g.fillRect(18, 10, 2, 5);
      g.fillRect(26, 24, 3, 4);
      g.fillStyle(0x3A5432);
      g.fillRect(12, 2, 3, 3);
      g.fillRect(22, 16, 4, 3);
    });

    // Stone cobblestone path  (#8A7A6A grey)
    draw('tile_stone', 32, 32, (g) => {
      g.fillStyle(0x8A7A6A);
      g.fillRect(0, 0, 32, 32);
      // Cobble joint lines
      g.fillStyle(0x6A5A50);
      g.fillRect(0, 10, 32, 1);
      g.fillRect(0, 22, 32, 1);
      g.fillRect(8, 0, 1, 10);
      g.fillRect(20, 10, 1, 12);
      g.fillRect(12, 22, 1, 10);
      // Cobble highlights
      g.fillStyle(0xA08A78);
      g.fillRect(1, 1, 6, 8);
      g.fillRect(10, 1, 9, 8);
      g.fillRect(22, 1, 9, 8);
      g.fillRect(1, 12, 18, 9);
      g.fillRect(22, 12, 9, 9);
      g.fillRect(1, 24, 10, 7);
      g.fillRect(14, 24, 17, 7);
    });

    // Scorched earth (EmberFields primary)  (#3D2B1F dark)
    draw('tile_scorched', 32, 32, (g) => {
      g.fillStyle(0x3D2B1F);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x4E3828);
      g.fillRect(3, 3, 8, 6);
      g.fillRect(16, 14, 10, 7);
      g.fillRect(5, 20, 7, 8);
      g.fillStyle(0x2A1A10);
      g.fillRect(12, 8, 5, 4);
      g.fillRect(24, 22, 6, 6);
      // Tiny ember sparks
      g.fillStyle(0xFF6600, 0.5);
      g.fillRect(6, 14, 1, 1);
      g.fillRect(20, 26, 1, 1);
      g.fillRect(28, 8, 1, 1);
    });

    // Lava flow river  (#FF4500 animated-look)
    draw('tile_lava_flow', 32, 32, (g) => {
      g.fillStyle(0xCC2200);
      g.fillRect(0, 0, 32, 32);
      // Flow bands
      g.fillStyle(0xFF4500);
      g.fillRect(0, 4, 32, 6);
      g.fillRect(0, 16, 32, 8);
      // Bright hot spots
      g.fillStyle(0xFF8C00);
      g.fillRect(4, 5, 8, 4);
      g.fillRect(18, 18, 10, 4);
      g.fillStyle(0xFFCC00);
      g.fillRect(6, 6, 4, 2);
      g.fillRect(22, 20, 4, 2);
      // Dark cooling crust edges
      g.fillStyle(0x661100);
      g.fillRect(0, 0, 32, 2);
      g.fillRect(0, 30, 32, 2);
    });

    // Lava border / cracked rock (town bottom edge)
    draw('tile_lava_border', 32, 32, (g) => {
      g.fillStyle(0x8B1A00);
      g.fillRect(0, 0, 32, 32);
      // Cracks
      g.fillStyle(0xFF5500);
      g.fillRect(4, 0, 2, 14);
      g.fillRect(14, 6, 2, 26);
      g.fillRect(22, 0, 1, 18);
      g.fillRect(28, 10, 2, 22);
      g.fillRect(0, 20, 10, 2);
      g.fillRect(18, 26, 14, 2);
      // Glow cores
      g.fillStyle(0xFF8800);
      g.fillRect(5, 2, 1, 10);
      g.fillRect(15, 8, 1, 20);
    });

    // Swamp tile
    draw('tile_swamp', 32, 32, (g) => {
      g.fillStyle(0x1E2A1E);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x2A3E2A);
      g.fillRect(0, 0, 32, 10);
      g.fillRect(8, 14, 16, 10);
      // Murky water patches
      g.fillStyle(0x1A3020);
      g.fillEllipse(10, 22, 12, 6);
      g.fillEllipse(24, 12, 8, 5);
      // Algae
      g.fillStyle(0x4A6A20);
      g.fillRect(2, 24, 4, 3);
      g.fillRect(22, 6, 5, 3);
    });

    // Obsidian tile
    draw('tile_obsidian', 32, 32, (g) => {
      g.fillStyle(0x111118);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x1E1E2A);
      g.fillRect(2, 2, 28, 28);
      // Purple quartz veins
      g.fillStyle(0x4A2A8A);
      g.fillRect(4, 8, 24, 1);
      g.fillRect(10, 4, 1, 20);
      g.fillRect(20, 16, 10, 1);
      g.fillStyle(0x7744AA);
      g.fillRect(5, 8, 12, 1);
      g.fillRect(10, 5, 1, 10);
    });

    // Oasis water tile
    draw('tile_oasis', 32, 32, (g) => {
      g.fillStyle(0x1A4A7A);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x2266AA);
      g.fillRect(2, 4, 14, 2);
      g.fillRect(18, 16, 12, 2);
      g.fillRect(6, 24, 8, 2);
      g.fillStyle(0x3388CC);
      g.fillRect(4, 5, 8, 1);
      g.fillRect(20, 17, 6, 1);
    });

    // Wall / boundary tile
    draw('tile_wall', 32, 32, (g) => {
      g.fillStyle(0x2A2A2A);
      g.fillRect(0, 0, 32, 32);
      g.fillStyle(0x404040);
      g.fillRect(2, 2, 28, 28);
      g.fillStyle(0x555555);
      g.fillRect(4, 4, 10, 10);
      g.fillRect(18, 16, 10, 10);
      g.fillStyle(0x333333);
      g.fillRect(4, 16, 12, 10);
      g.fillRect(18, 4, 10, 10);
    });

    // ═══════════════════════════════════════════════
    // PROPS
    // ═══════════════════════════════════════════════

    // Palm tree (32×80)
    draw('palm_tree', 32, 80, (g) => {
      // Trunk
      g.fillStyle(0x8B6914);
      g.fillRect(13, 24, 6, 56);
      g.fillStyle(0xAA8820);
      g.fillRect(14, 24, 3, 54);
      // Trunk texture nodes
      g.fillStyle(0x6B4F10);
      g.fillRect(13, 32, 6, 2);
      g.fillRect(13, 44, 6, 2);
      g.fillRect(13, 56, 6, 2);
      g.fillRect(13, 68, 6, 2);

      // Palm fronds (5 fronds)
      g.fillStyle(0x3A7A22);
      g.fillTriangle(16, 24, 0, 8, 16, 16);
      g.fillTriangle(16, 24, 32, 8, 16, 16);
      g.fillTriangle(16, 24, 4, 0, 14, 14);
      g.fillTriangle(16, 24, 28, 0, 18, 14);
      g.fillTriangle(16, 24, 16, 0, 16, 12);
      // Frond highlights
      g.fillStyle(0x5A9A38);
      g.fillTriangle(16, 24, 1, 10, 15, 17);
      g.fillTriangle(16, 24, 31, 10, 17, 17);
    });

    // Cactus (16×36)
    draw('cactus', 16, 36, (g) => {
      // Main trunk
      g.fillStyle(0x4A7A2A);
      g.fillRect(5, 6, 6, 30);
      // Left arm
      g.fillRect(1, 12, 6, 4);
      g.fillRect(1, 10, 4, 6);
      // Right arm
      g.fillRect(9, 18, 6, 4);
      g.fillRect(11, 16, 4, 6);
      // Highlights
      g.fillStyle(0x6A9A42);
      g.fillRect(6, 7, 2, 28);
      g.fillRect(2, 13, 2, 2);
      g.fillRect(11, 19, 2, 2);
      // Spines
      g.fillStyle(0xEEEECC);
      g.fillRect(4, 10, 1, 1);
      g.fillRect(11, 10, 1, 1);
      g.fillRect(4, 22, 1, 1);
      g.fillRect(11, 22, 1, 1);
    });

    // Dead tree (24×64) — bare black silhouette
    draw('dead_tree', 24, 64, (g) => {
      // Main trunk
      g.fillStyle(0x1E1008);
      g.fillRect(10, 16, 5, 48);
      // Thick base
      g.fillRect(8, 40, 8, 24);
      // Main branches
      g.fillRect(0, 20, 12, 3);
      g.fillRect(12, 28, 12, 3);
      g.fillRect(2, 32, 10, 2);
      // Smaller branches
      g.fillRect(0, 18, 5, 2);
      g.fillRect(20, 26, 4, 2);
      g.fillRect(4, 34, 6, 1);
      g.fillRect(16, 36, 6, 1);
      // Branch color slightly lighter
      g.fillStyle(0x2E1A0A);
      g.fillRect(1, 21, 10, 1);
      g.fillRect(13, 29, 10, 1);
    });

    // Barrel (16×24)
    draw('barrel', 16, 24, (g) => {
      g.fillStyle(0x6B3C14);
      g.fillRect(2, 0, 12, 24);
      // Metal bands
      g.fillStyle(0x5A5A5A);
      g.fillRect(0, 4, 16, 2);
      g.fillRect(0, 18, 16, 2);
      g.fillRect(0, 11, 16, 2);
      // Wood grain
      g.fillStyle(0x5A3010);
      g.fillRect(4, 0, 1, 24);
      g.fillRect(8, 0, 1, 24);
      g.fillRect(12, 0, 1, 24);
      // Highlight
      g.fillStyle(0x8B5220);
      g.fillRect(2, 0, 2, 24);
    });

    // Large rock (48×32)
    draw('rock_large', 48, 32, (g) => {
      g.fillStyle(0x3A3430);
      g.fillRect(4, 8, 40, 22);
      g.fillRect(10, 4, 28, 6);
      g.fillRect(14, 2, 20, 4);
      // Facets
      g.fillStyle(0x4E4844);
      g.fillRect(8, 10, 14, 10);
      g.fillRect(28, 12, 12, 8);
      g.fillStyle(0x2A2420);
      g.fillRect(20, 16, 10, 14);
      // Highlight edge
      g.fillStyle(0x666058);
      g.fillRect(6, 8, 4, 16);
    });

    // Medium rock (28×20)
    draw('rock_medium', 28, 20, (g) => {
      g.fillStyle(0x3A3430);
      g.fillRect(2, 4, 24, 14);
      g.fillRect(6, 2, 16, 4);
      g.fillStyle(0x4E4844);
      g.fillRect(4, 6, 10, 8);
      g.fillStyle(0x666058);
      g.fillRect(3, 5, 3, 10);
    });

    // Oasis pool decoration (64×40) — shimmer surface
    draw('oasis_pool', 64, 40, (g) => {
      g.fillStyle(0x1A5A8A);
      g.fillEllipse(32, 20, 62, 38);
      g.fillStyle(0x2A7AAA);
      g.fillEllipse(32, 18, 48, 24);
      g.fillStyle(0x3A99CC);
      g.fillRect(10, 14, 20, 2);
      g.fillRect(34, 20, 18, 2);
      g.fillRect(16, 26, 12, 1);
      g.fillStyle(0x88CCEE);
      g.fillRect(12, 15, 6, 1);
      g.fillRect(38, 21, 6, 1);
    });

    // Wrecked boat (64×28) — for EmberFields
    draw('boat_wreck', 64, 28, (g) => {
      // Hull - dark charred wood
      g.fillStyle(0x2A1808);
      g.fillRect(4, 10, 56, 16);
      g.fillRect(0, 14, 64, 10);
      // Burnt planks
      g.fillStyle(0x3C2810);
      g.fillRect(6, 12, 4, 14);
      g.fillRect(14, 10, 4, 16);
      g.fillRect(24, 12, 4, 14);
      g.fillRect(38, 10, 4, 16);
      g.fillRect(50, 12, 4, 14);
      // Charred highlights
      g.fillStyle(0x1A0C04);
      g.fillRect(0, 14, 64, 2);
      // Broken mast stub
      g.fillStyle(0x2A1808);
      g.fillRect(28, 0, 4, 12);
      g.fillRect(22, 4, 16, 2);
      // Ember glow on wood
      g.fillStyle(0xFF4400, 0.4);
      g.fillRect(10, 16, 3, 3);
      g.fillRect(44, 18, 3, 2);
    });

    // Lava glow overlay (64×64) — circular radial glow
    draw('lava_glow', 64, 64, (g) => {
      g.fillStyle(0xFF6600, 0.3);
      g.fillCircle(32, 32, 30);
      g.fillStyle(0xFF8800, 0.2);
      g.fillCircle(32, 32, 22);
      g.fillStyle(0xFFAA00, 0.1);
      g.fillCircle(32, 32, 14);
    });
  }
}
