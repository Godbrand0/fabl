'use client';

// Frequency table (Hz)
const F: Record<string, number> = {
  C3:130.81, D3:146.83, Eb3:155.56, E3:164.81, F3:174.61, G3:196.00,
  Ab3:207.65, A3:220.00, Bb3:233.08, B3:246.94,
  C4:261.63, D4:293.66, Eb4:311.13, E4:329.63, F4:349.23, G4:392.00,
  Ab4:415.30, A4:440.00, Bb4:466.16, B4:493.88,
  C5:523.25, D5:587.33, Eb5:622.25, E5:659.25, F5:698.46,
  G5:783.99, A5:880.00, C6:1046.50,
};

type Beat = [string | null, number]; // [note name | null for rest, beat count]
type TrackName = 'town' | 'combat' | 'boss';

// ─── TRACK DATA ──────────────────────────────────────────────────────────────

const TRACKS: Record<TrackName, {
  bpm: number;
  melody: Beat[]; melodyWave: OscillatorType; melodyVol: number;
  bass:   Beat[]; bassWave:   OscillatorType; bassVol:   number;
}> = {
  // Peaceful village: G major, triangle/sine
  town: {
    bpm: 80, melodyWave: 'triangle', melodyVol: 0.45, bassWave: 'sine', bassVol: 0.25,
    melody: [
      ['G4',1],['B4',0.5],['D5',0.5],['G5',1],['D5',0.5],['B4',0.5],
      ['A4',0.5],['G4',0.5],['E4',1],['D4',0.5],['E4',0.5],['G4',2],
      ['D5',0.5],['C5',0.5],['B4',1],['A4',0.5],['G4',0.5],['A4',0.5],['B4',0.5],
      ['G4',0.5],['E4',0.5],['D4',1],['E4',0.5],['G4',0.5],['G4',2],
    ],
    bass: [
      ['G3',2],['D3',2], ['A3',2],['E3',2],
      ['C3',2],['G3',2], ['D3',2],['G3',2],
    ],
  },
  // Battle fury: D minor, square/sawtooth
  combat: {
    bpm: 148, melodyWave: 'square', melodyVol: 0.2, bassWave: 'sawtooth', bassVol: 0.3,
    melody: [
      ['D4',0.25],['F4',0.25],['A4',0.25],['D4',0.25],
      ['C4',0.5],['A3',0.5],
      ['D4',0.25],['F4',0.25],['G4',0.25],['Ab4',0.25],['A4',1],
      ['G4',0.25],['F4',0.25],['Eb4',0.25],['D4',0.25],
      ['C4',0.5],['Bb3',0.5],
      ['A3',0.5],['D4',0.5],['F4',0.5],[null,0.5],
    ],
    bass: [
      ['D3',0.5],[null,0.5],['D3',0.5],[null,0.5],
      ['F3',0.5],[null,0.5],['C3',0.5],[null,0.5],
      ['D3',0.5],[null,0.5],['D3',0.5],[null,0.5],
      ['Bb3',0.5],[null,0.5],['A3',0.5],[null,0.5],
    ],
  },
  // Dark overlord: D Phrygian, sawtooth
  boss: {
    bpm: 108, melodyWave: 'sawtooth', melodyVol: 0.28, bassWave: 'sawtooth', bassVol: 0.35,
    melody: [
      ['D3',1],['F3',0.5],['Ab3',0.5],
      ['G3',1],['F3',0.5],['E3',0.5],
      ['F3',1],['Ab3',0.5],['C4',0.5],
      ['Bb3',1.5],[null,0.5],
      ['D4',0.5],['C4',0.5],['Bb3',0.5],['Ab3',0.5],
      ['G3',1],['F3',0.5],['E3',0.5],
      ['D3',1],[null,0.5],['D3',0.25],['F3',0.25],
      ['A3',2],
    ],
    bass: [
      ['D3',0.5],[null,0.25],['D3',0.25],['D3',0.5],[null,0.5],
      ['F3',0.5],[null,0.25],['F3',0.25],['Eb3',0.5],[null,0.5],
      ['D3',0.5],[null,0.25],['D3',0.25],['C3',0.5],[null,0.5],
      ['G3',0.5],[null,0.5],['A3',0.5],[null,0.5],
    ],
  },
};

// ─── AUDIO MANAGER ───────────────────────────────────────────────────────────

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain!: GainNode;
  private musicGain!: GainNode;
  private sfxGain!: GainNode;

  musicEnabled = true;
  sfxEnabled = true;

  private currentTrack: TrackName | null = null;
  private musicGen = 0;
  private melodyStep = 0;
  private bassStep = 0;
  private nextMelodyTime = 0;
  private nextBassTime = 0;
  private musicTimerId: ReturnType<typeof setTimeout> | null = null;
  private paused = false;

  private readonly LOOKAHEAD = 0.12; // seconds to schedule ahead
  private readonly TICK_MS = 50;

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0;
      this.musicGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.6;
      this.sfxGain.connect(this.masterGain);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // Schedule a single oscillator note with envelope
  private osc(
    freq: number, startTime: number, dur: number,
    wave: OscillatorType, vol: number, dest: AudioNode,
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    const atk = Math.min(0.015, dur * 0.1);
    const rel = Math.min(0.04, dur * 0.2);
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + atk);
    g.gain.setValueAtTime(vol, startTime + dur - rel);
    g.gain.linearRampToValueAtTime(0, startTime + dur);
    o.connect(g);
    g.connect(dest);
    o.start(startTime);
    o.stop(startTime + dur + 0.01);
  }

  // ─── MUSIC ─────────────────────────────────────────────────────────────────

  private runScheduler(gen: number) {
    if (this.musicGen !== gen || !this.currentTrack || !this.ctx) return;
    const track = TRACKS[this.currentTrack];
    const bps = track.bpm / 60;
    const ahead = this.ctx.currentTime + this.LOOKAHEAD;

    while (this.nextMelodyTime < ahead) {
      const [note, beats] = track.melody[this.melodyStep % track.melody.length];
      const dur = beats / bps;
      if (note && F[note]) {
        this.osc(F[note], this.nextMelodyTime, dur * 0.85, track.melodyWave, track.melodyVol, this.musicGain);
      }
      this.nextMelodyTime += dur;
      this.melodyStep = (this.melodyStep + 1) % track.melody.length;
    }

    while (this.nextBassTime < ahead) {
      const [note, beats] = track.bass[this.bassStep % track.bass.length];
      const dur = beats / bps;
      if (note && F[note]) {
        this.osc(F[note], this.nextBassTime, dur * 0.9, track.bassWave, track.bassVol, this.musicGain);
      }
      this.nextBassTime += dur;
      this.bassStep = (this.bassStep + 1) % track.bass.length;
    }

    this.musicTimerId = setTimeout(() => this.runScheduler(gen), this.TICK_MS);
  }

  playMusic(name: TrackName) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    if (this.currentTrack === name) return;
    if (this.musicTimerId) clearTimeout(this.musicTimerId);

    this.currentTrack = name;
    this.musicGen++;
    this.melodyStep = 0;
    this.bassStep = 0;
    this.nextMelodyTime = ctx.currentTime + 0.15;
    this.nextBassTime   = ctx.currentTime + 0.15;

    const targetVol = this.musicEnabled ? 0.22 : 0;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(targetVol, ctx.currentTime + 1.2);

    this.runScheduler(this.musicGen);
  }

  stopMusic() {
    this.musicGen++;
    this.currentTrack = null;
    if (this.musicTimerId) clearTimeout(this.musicTimerId);
    if (this.ctx && this.musicGain) {
      this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
      this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, this.ctx.currentTime);
      this.musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.8);
    }
  }

  // Silences the currently playing track without forgetting it — unlike
  // stopMusic(), resumeMusic() picks the same track back up.
  pauseMusic() {
    if (this.paused || !this.ctx || !this.currentTrack) return;
    this.paused = true;
    if (this.musicTimerId) { clearTimeout(this.musicTimerId); this.musicTimerId = null; }
    const now = this.ctx.currentTime;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(0, now + 0.15);
  }

  resumeMusic() {
    if (!this.paused) return;
    this.paused = false;
    const ctx = this.ensureCtx();
    if (!ctx || !this.currentTrack) return;
    const now = ctx.currentTime;
    // Restart scheduling fresh rather than trying to resume mid-pattern —
    // avoids drift from however long the pause lasted.
    this.nextMelodyTime = now + 0.1;
    this.nextBassTime = now + 0.1;
    const targetVol = this.musicEnabled ? 0.22 : 0;
    this.musicGain.gain.cancelScheduledValues(now);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, now);
    this.musicGain.gain.linearRampToValueAtTime(targetVol, now + 0.3);
    this.musicGen++;
    this.runScheduler(this.musicGen);
  }

  setMusicEnabled(on: boolean) {
    this.musicEnabled = on;
    const ctx = this.ensureCtx();
    if (!ctx || !this.musicGain) return;
    const target = on && this.currentTrack ? 0.22 : 0;
    this.musicGain.gain.cancelScheduledValues(ctx.currentTime);
    this.musicGain.gain.setValueAtTime(this.musicGain.gain.value, ctx.currentTime);
    this.musicGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.3);
  }

  setSfxEnabled(on: boolean) {
    this.sfxEnabled = on;
    if (this.sfxGain) this.sfxGain.gain.value = on ? 0.6 : 0;
  }

  // ─── SFX ───────────────────────────────────────────────────────────────────

  playSfx(name: string) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.sfxEnabled) return;
    const now = ctx.currentTime;

    switch (name) {
      // Player fires a projectile
      case 'shoot': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(660, now);
        o.frequency.exponentialRampToValueAtTime(220, now + 0.09);
        g.gain.setValueAtTime(0.22, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.09);
        break;
      }

      // Projectile hits an enemy
      case 'hit': {
        const size = Math.floor(ctx.sampleRate * 0.07);
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filt = ctx.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 500; filt.Q.value = 0.6;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.55, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
        src.start(); src.stop(now + 0.07);
        break;
      }

      // Regular enemy defeated
      case 'enemyDie': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(320, now);
        o.frequency.exponentialRampToValueAtTime(55, now + 0.22);
        g.gain.setValueAtTime(0.38, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.22);
        break;
      }

      // Boss defeated — triumphant arpeggio
      case 'bossDie': {
        (['C5','E5','G5','C6'] as const).forEach((note, i) => {
          const t = now + i * 0.13;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = F[note];
          g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
          o.connect(g); g.connect(this.sfxGain);
          o.start(t); o.stop(t + 0.56);
        });
        break;
      }

      // Gold coin collected
      case 'coin': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1200, now);
        o.frequency.exponentialRampToValueAtTime(900, now + 0.14);
        g.gain.setValueAtTime(0.45, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.18);
        break;
      }

      // Loot/heal item collected
      case 'heal': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(420, now);
        o.frequency.exponentialRampToValueAtTime(840, now + 0.28);
        g.gain.setValueAtTime(0.38, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.3);
        break;
      }

      // Player takes damage
      case 'playerHurt': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(210, now);
        o.frequency.exponentialRampToValueAtTime(80, now + 0.14);
        g.gain.setValueAtTime(0.5, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.14);
        break;
      }

      // Player death — descending minor chord
      case 'playerDie': {
        (['A4','G4','Eb4','D4'] as const).forEach((note, i) => {
          const t = now + i * 0.22;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = F[note];
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.45, t + 0.04);
          g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
          o.connect(g); g.connect(this.sfxGain);
          o.start(t); o.stop(t + 0.72);
        });
        break;
      }

      // Boss spawns — ominous tremolo drone
      case 'bossSpawn': {
        const o = ctx.createOscillator();
        const lfo = ctx.createOscillator();
        const lfoG = ctx.createGain();
        const g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = F['D3'];
        lfo.type = 'sine'; lfo.frequency.value = 7;
        lfoG.gain.value = 0.25;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.5, now + 0.35);
        g.gain.setValueAtTime(0.5, now + 1.6);
        g.gain.exponentialRampToValueAtTime(0.001, now + 2.1);
        lfo.connect(lfoG); lfoG.connect(g.gain);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 2.1);
        lfo.start(now); lfo.stop(now + 2.1);
        break;
      }

      // Fire Nova ability
      case 'fireNova': {
        // Noise explosion
        const size = Math.floor(ctx.sampleRate * 0.3);
        const buf = ctx.createBuffer(1, size, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource(); src.buffer = buf;
        const filt = ctx.createBiquadFilter(); filt.type = 'lowpass';
        filt.frequency.setValueAtTime(3500, now);
        filt.frequency.exponentialRampToValueAtTime(180, now + 0.3);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.7, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
        src.start(); src.stop(now + 0.3);
        // Rising tone
        const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
        o2.type = 'sawtooth';
        o2.frequency.setValueAtTime(180, now);
        o2.frequency.exponentialRampToValueAtTime(900, now + 0.22);
        g2.gain.setValueAtTime(0.28, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        o2.connect(g2); g2.connect(this.sfxGain);
        o2.start(now); o2.stop(now + 0.25);
        break;
      }

      // Poison Cloak ability — bubbling shimmer
      case 'poison': {
        for (let i = 0; i < 5; i++) {
          const t = now + i * 0.055;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'sine'; o.frequency.value = 280 + Math.random() * 240;
          g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          o.connect(g); g.connect(this.sfxGain);
          o.start(t); o.stop(t + 0.14);
        }
        break;
      }

      // Stone Shield ability — rising whoosh
      case 'shield': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(F['C4'], now);
        o.frequency.exponentialRampToValueAtTime(F['G5'], now + 0.32);
        g.gain.setValueAtTime(0.42, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.38);
        break;
      }

      // Zone cleared — victory fanfare
      case 'zoneClear': {
        const fanfare: [string, number, number][] = [
          ['C5', 0,    0.3],
          ['E5', 0.15, 0.3],
          ['G5', 0.30, 0.3],
          ['C6', 0.45, 0.65],
          ['G5', 0.60, 0.4],
          ['C6', 0.82, 0.95],
        ];
        fanfare.forEach(([note, off, dur]) => {
          const t = now + off;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = F[note];
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.6, t + 0.03);
          g.gain.setValueAtTime(0.55, t + dur - 0.06);
          g.gain.exponentialRampToValueAtTime(0.001, t + dur);
          o.connect(g); g.connect(this.sfxGain);
          o.start(t); o.stop(t + dur + 0.01);
        });
        break;
      }

      // Level up — ascending 4-note arp
      case 'levelUp': {
        (['C4','E4','G4','C5'] as const).forEach((note, i) => {
          const t = now + i * 0.1;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = F[note];
          g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
          o.connect(g); g.connect(this.sfxGain);
          o.start(t); o.stop(t + 0.46);
        });
        break;
      }

      // UI button click
      case 'click': {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'square'; o.frequency.value = 780;
        g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        o.connect(g); g.connect(this.sfxGain);
        o.start(now); o.stop(now + 0.035);
        break;
      }

      // Purchase confirmed
      case 'purchase': {
        (['C5','E5','G5'] as const).forEach((note, i) => {
          const t = now + i * 0.07;
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.type = 'triangle'; o.frequency.value = F[note];
          g.gain.setValueAtTime(0.42, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          o.connect(g); g.connect(this.sfxGain);
          o.start(t); o.stop(t + 0.23);
        });
        break;
      }
    }
  }
}

export const audioManager = new AudioManager();
