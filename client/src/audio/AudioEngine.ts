/**
 * The user's sounds through Web Audio: music (`MusicPlan`), one ambient loop,
 * and everything else; rules in `cues.ts` and `musicPlan.ts`. Nothing plays
 * before a click or key press; music and ambience start once allowed.
 */
import { logger } from '../core/log';
import type { SoundCatalogue, SoundCue } from '../assets/formats/tables';
import type { SoundClipData } from '../assets/types';
import {
  bankIsFull,
  cueFiles,
  indexCatalogue,
  pitchFor,
  pannerFalloff,
  soundName,
  withExtension,
  withinEarshot,
} from './cues';
import type { CueIndex } from './cues';
import { EASE_MS as FADE_MS, MusicPlan } from './musicPlan';
import type { MusicCommand } from './musicPlan';

const log = logger('audio');

type Vec3 = readonly [number, number, number];

/** What the engine needs from the resource layer. */
export interface SoundSource {
  soundCatalogue(): Promise<SoundCatalogue>;
  soundClip(path: string): Promise<SoundClipData>;
}

/** A sound that was started, and can be stopped. */
export interface SoundHandle {
  /** Whether it goes on until stopped. */
  readonly loop: boolean;
  stop(fadeMs?: number): void;
}

/** How often the music timetable is advanced, in ms. */
const TICK_MS = 250;
/** How often to look for the page's first click or key press, in ms. */
const GESTURE_POLL_MS = 250;
/** A sound effect fades in and out over this long when stopped or started gently, in ms. */
const SHORT_FADE_MS = 150;
/**
 * Decoded sound effects kept for reuse, by the bytes their samples take.
 * Music is never kept: one piece runs to tens of megabytes.
 */
const EFFECT_CACHE_BYTES = 64 << 20;

interface Voice {
  source: AudioBufferSourceNode;
  gain: GainNode;
  bank: number;
  ended: boolean;
}

export class AudioEngine {
  private readonly ctx: AudioContext | null;
  private readonly music: GainNode | null;
  private readonly effects: GainNode | null;
  private index: CueIndex | null = null;
  private indexTask: Promise<CueIndex | null> | null = null;

  /** Decoded effects, oldest use first, for eviction. */
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private readonly bufferBytes = new Map<string, number>();
  private cachedBytes = 0;
  /** Files waiting to be decoded ahead of their first play, and whether that is under way. */
  private readonly preloadQueue: string[] = [];
  private preloading = false;
  /** Files known to be missing, so each is asked for once. */
  private readonly missing = new Set<string>();
  /** Playing voices per bank, oldest first. */
  private readonly banks = new Map<number, Voice[]>();

  private readonly plan = new MusicPlan();
  private musicVoice: Voice | null = null;
  /** The last piece of music decoded, kept so its second play needs no decode. */
  private musicBuffer: { path: string; buffer: AudioBuffer } | null = null;
  /** The piece the plan last asked for, so enabling music can start it. */
  private musicPath: string | null = null;
  private musicTicket = 0;

  private ambienceCue = 0;
  private ambienceVoice: SoundHandle | null = null;

  private musicOn = true;
  private startedCount = 0;
  private lastTick = 0;
  private clock = 0;
  private effectsOn = true;
  private listener: Vec3 = [0, 0, 0];

  constructor(private readonly sounds: SoundSource) {
    const Context: typeof AudioContext | undefined =
      typeof AudioContext !== 'undefined' ? AudioContext : undefined;
    this.ctx = Context ? new Context() : null;
    if (!this.ctx) {
      this.music = null;
      this.effects = null;
      log.warn('this browser has no Web Audio; the game is silent');
      return;
    }
    this.music = this.ctx.createGain();
    this.effects = this.ctx.createGain();
    this.music.connect(this.ctx.destination);
    this.effects.connect(this.ctx.destination);
    this.waitForGesture();
    this.silenceWhileHidden();
    if (typeof window !== 'undefined') this.clock = window.setInterval(() => this.tick(), TICK_MS);
  }

  /** A hidden page (another app, a locked phone) would otherwise keep playing; the context is paused and resumed only if this paused it. */
  private silenceWhileHidden(): void {
    const ctx = this.ctx;
    if (!ctx || typeof document === 'undefined') return;
    let pausedByHide = false;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        if (ctx.state !== 'running') return;
        pausedByHide = true;
        void ctx.suspend();
      } else if (pausedByHide) {
        pausedByHide = false;
        void ctx.resume();
      }
    });
  }

  // — switches and the listener ---------------------------------------------

  setMusicEnabled(on: boolean): void {
    if (on === this.musicOn) return;
    this.musicOn = on;
    if (!on) {
      this.stopMusicVoice(SHORT_FADE_MS);
    } else if (this.musicPath) {
      void this.startMusic(this.musicPath, FADE_MS);
    }
  }

  setEffectsEnabled(on: boolean): void {
    if (on === this.effectsOn) return;
    this.effectsOn = on;
    if (this.ctx && this.effects)
      this.effects.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
    if (on && this.ambienceCue) {
      const cue = this.ambienceCue;
      this.ambienceCue = 0;
      this.setAmbience(cue);
    }
  }

  /**
   * Where the ears are and which way they face. Distance is measured from
   * `position`; left and right are judged along `forward`.
   */
  setListener(position: Vec3, forward: Vec3): void {
    this.listener = position;
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      const t = this.ctx!.currentTime;
      l.positionX.setValueAtTime(position[0], t);
      l.positionY.setValueAtTime(position[1], t);
      l.positionZ.setValueAtTime(position[2], t);
      l.forwardX.setValueAtTime(forward[0], t);
      l.forwardY.setValueAtTime(forward[1], t);
      l.forwardZ.setValueAtTime(forward[2], t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(position[0], position[1], position[2]);
      l.setOrientation(forward[0], forward[1], forward[2], 0, 1, 0);
    }
  }

  // — cues -------------------------------------------------------------------

  /**
   * How many sounds `play` has started, ever. Compared either side of a
   * moment to tell whether anything else spoke in it.
   */
  get started(): number {
    return this.startedCount;
  }

  /** Whether the catalogue has loaded, so sounds can be found. */
  get loaded(): boolean {
    return this.index !== null;
  }

  /** The sound a `c_sound` id names, once the catalogue has loaded. */
  cue(id: number): SoundCue | undefined {
    return this.index?.byId.get(id);
  }

  /** The sound a file is called, without folder or extension: `sfx_mc_level_up`. */
  cueNamed(name: string): SoundCue | undefined {
    return this.index?.byName.get(name.toLowerCase());
  }

  /** The music a zone plays while a fight calls for it, or 0. */
  battleMusic(zoneId: number): number {
    return this.index?.battleMusic.get(zoneId) ?? 0;
  }

  /**
   * Load the catalogue. Everything else waits for it; calling again is free
   * once it has loaded, and tries again if it could not — before game data
   * is mounted there is nothing to load it from.
   */
  ready(): Promise<CueIndex | null> {
    this.indexTask ??= this.sounds
      .soundCatalogue()
      .then(catalogue => {
        this.index = indexCatalogue(catalogue);
        log.info(`${catalogue.cues.length} sounds in the catalogue`);
        return this.index;
      })
      .catch((err: unknown) => {
        log.debug(`no sound catalogue yet: ${String(err)}`);
        this.indexTask = null;
        return null;
      });
    return this.indexTask;
  }

  /** Play by `c_sound` id, name, or first of several names; positional with `at`. Null if not started. */
  play(which: number | string | readonly string[], at?: Vec3): SoundHandle | null {
    const cue =
      typeof which === 'number'
        ? this.cue(which)
        : typeof which === 'string'
          ? this.cueNamed(which)
          : which.map(name => this.cueNamed(name)).find(found => found !== undefined);
    if (!cue || !this.ctx || !this.effects || !this.effectsOn || cue.music) return null;
    if (this.ctx.state !== 'running') return null;

    const placed = cue.positional && at !== undefined;
    if (placed && !withinEarshot(distance(at, this.listener), cue)) return null;

    if (bankIsFull(this.index?.banks.get(cue.bank), this.playingIn(cue.bank))) {
      const oldest = this.banks.get(cue.bank)?.find(v => !v.ended);
      if (oldest) this.release(oldest, SHORT_FADE_MS);
    }

    let voice: Voice | null = null;
    let stopped = false;
    void this.firstBuffer(cueFiles(cue, Math.random())).then(buffer => {
      if (!buffer || stopped || !this.effectsOn) return;
      voice = this.voice(buffer, cue, placed ? at : undefined, this.effects!, 0);
    });
    this.startedCount++;
    return {
      loop: cue.loop,
      stop: (fadeMs = SHORT_FADE_MS) => {
        stopped = true;
        if (voice) this.release(voice, fadeMs);
      },
    };
  }

  /**
   * Decode a sound ahead of its first play, so that play starts at once.
   * Every numbered file of it is decoded, one file at a time behind whatever
   * is already waiting, so a burst of these never crowds out the world's own
   * loading. Music is not preloaded here; asking for it starts its decode.
   */
  preload(which: number | string | readonly (number | string)[]): void {
    const names = typeof which === 'number' || typeof which === 'string' ? [which] : which;
    for (const name of names) {
      const cue = typeof name === 'number' ? this.cue(name) : this.cueNamed(name);
      if (!cue || cue.music) continue;
      // `cueFiles` from the first variant is every variant, plus one past.
      for (const path of cueFiles(cue, 0)) {
        const key = path.toLowerCase();
        if (!this.buffers.has(key) && !this.missing.has(path)) this.preloadQueue.push(path);
      }
    }
    void this.drainPreloads();
  }

  private async drainPreloads(): Promise<void> {
    if (this.preloading) return;
    this.preloading = true;
    try {
      for (let path = this.preloadQueue.shift(); path; path = this.preloadQueue.shift()) {
        await this.buffer(path);
      }
    } finally {
      this.preloading = false;
    }
  }

  // — music and ambience -----------------------------------------------------

  /** Play this music (a `c_sound` id); 0 stops it. The same music again changes nothing. */
  setMusic(cueId: number): void {
    const cue = cueId ? this.cue(cueId) : undefined;
    this.run(cue ? this.plan.play(cue) : this.plan.stop());
  }

  /** Loop this ambience (a `c_sound` id) in place of the last; 0 for none. */
  setAmbience(cueId: number): void {
    if (cueId === this.ambienceCue) return;
    this.ambienceCue = cueId;
    this.ambienceVoice?.stop(FADE_MS);
    this.ambienceVoice = null;
    if (!cueId || !this.ctx || !this.effects || !this.effectsOn) return;
    const cue = this.cue(cueId);
    if (!cue) return;
    let voice: Voice | null = null;
    let stopped = false;
    void this.buffer(withExtension(cue.path)).then(buffer => {
      if (!buffer || stopped) return;
      voice = this.voice(buffer, { ...cue, loop: true }, undefined, this.effects!, FADE_MS);
    });
    this.ambienceVoice = {
      loop: true,
      stop: (fadeMs = FADE_MS) => {
        stopped = true;
        if (voice) this.release(voice, fadeMs);
      },
    };
  }

  /**
   * Time passes: the music moves along its timetable. Not while the browser
   * is holding sound back, since nothing is being heard then. Driven by the
   * engine's own clock, so the screens before the world, which have no
   * frame loop, keep their music going too.
   */
  private tick(): void {
    const now = this.ctx?.currentTime ?? 0;
    const dt = now - this.lastTick;
    this.lastTick = now;
    if (this.ctx?.state !== 'running' || dt <= 0) return;
    this.run(this.plan.tick(dt * 1000));
  }

  dispose(): void {
    if (typeof window !== 'undefined') window.clearInterval(this.clock);
    this.stopMusicVoice(0);
    this.ambienceVoice?.stop(0);
    for (const voices of this.banks.values()) for (const v of voices) this.release(v, 0);
    this.buffers.clear();
    void this.ctx?.close();
  }

  // — plumbing ---------------------------------------------------------------

  private run(commands: MusicCommand[]): void {
    for (const command of commands) {
      switch (command.kind) {
        case 'start':
          this.musicPath = command.path;
          if (this.musicOn) void this.startMusic(command.path, command.fadeMs);
          break;
        case 'fadeOut':
          this.stopMusicVoice(command.fadeMs);
          break;
        case 'stop':
          this.musicPath = null;
          this.stopMusicVoice(command.fadeMs);
          break;
      }
    }
  }

  private async startMusic(path: string, fadeMs: number): Promise<void> {
    if (!this.ctx || !this.music) return;
    const ticket = ++this.musicTicket;
    this.stopMusicVoice(fadeMs);
    let buffer = this.musicBuffer?.path === path ? this.musicBuffer.buffer : null;
    if (!buffer) {
      buffer = await this.decode(path);
      if (!buffer) return;
      this.musicBuffer = { path, buffer };
    }
    this.plan.setDuration(path, buffer.duration * 1000);
    // Something newer was asked for while this one decoded.
    if (ticket !== this.musicTicket || !this.musicOn) return;
    const cue = this.plan.current;
    this.musicVoice = this.voice(
      buffer,
      { volume: cue?.volume ?? 1, loop: false, pitched: false },
      undefined,
      this.music,
      fadeMs,
    );
  }

  private stopMusicVoice(fadeMs: number): void {
    if (this.musicVoice) this.release(this.musicVoice, fadeMs);
    this.musicVoice = null;
  }

  /** Start a buffer playing into `into`, fading in over `fadeMs`. */
  private voice(
    buffer: AudioBuffer,
    cue: Pick<SoundCue, 'volume' | 'loop' | 'pitched'> & { bank?: number; reach?: number },
    at: Vec3 | undefined,
    into: AudioNode,
    fadeMs: number,
  ): Voice {
    const ctx = this.ctx!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = cue.loop;
    source.playbackRate.value = pitchFor(cue as SoundCue, Math.random());
    const gain = ctx.createGain();
    const volume = Math.max(0, Math.min(1, cue.volume));
    if (fadeMs > 0) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + fadeMs / 1000);
    } else {
      gain.gain.value = volume;
    }
    source.connect(gain);
    if (at) {
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      Object.assign(panner, pannerFalloff({ reach: cue.reach ?? 0 }));
      if (panner.positionX) {
        panner.positionX.value = at[0];
        panner.positionY.value = at[1];
        panner.positionZ.value = at[2];
      } else {
        panner.setPosition(at[0], at[1], at[2]);
      }
      gain.connect(panner);
      panner.connect(into);
    } else {
      gain.connect(into);
    }

    const voice: Voice = { source, gain, bank: cue.bank ?? 0, ended: false };
    if (voice.bank) {
      const list = this.banks.get(voice.bank) ?? [];
      list.push(voice);
      this.banks.set(voice.bank, list);
    }
    source.onended = () => {
      voice.ended = true;
      source.disconnect();
      gain.disconnect();
      const list = this.banks.get(voice.bank);
      if (list) {
        const i = list.indexOf(voice);
        if (i >= 0) list.splice(i, 1);
      }
    };
    source.start();
    return voice;
  }

  /** Fade a voice out and stop it. */
  private release(voice: Voice, fadeMs: number): void {
    if (voice.ended || !this.ctx) return;
    const t = this.ctx.currentTime;
    const end = t + fadeMs / 1000;
    voice.gain.gain.cancelScheduledValues(t);
    voice.gain.gain.setValueAtTime(voice.gain.gain.value, t);
    voice.gain.gain.linearRampToValueAtTime(0, end);
    try {
      voice.source.stop(end);
    } catch {
      // Already stopped.
    }
    voice.ended = true;
  }

  private playingIn(bank: number): number {
    return (this.banks.get(bank) ?? []).filter(v => !v.ended).length;
  }

  /** The first of `paths` the pack has, decoded. */
  private async firstBuffer(paths: string[]): Promise<AudioBuffer | null> {
    for (const path of paths) {
      const buffer = await this.buffer(path);
      if (buffer) return buffer;
    }
    return null;
  }

  /** A sound effect's buffer, decoded once and kept while there is room. */
  private buffer(path: string): Promise<AudioBuffer | null> {
    const key = path.toLowerCase();
    const cached = this.buffers.get(key);
    if (cached) {
      // Most recently used goes last, so eviction takes the oldest.
      this.buffers.delete(key);
      this.buffers.set(key, cached);
      return cached;
    }
    const task = this.decode(path).then(buffer => {
      if (!buffer) {
        this.buffers.delete(key);
        return null;
      }
      const bytes = buffer.length * buffer.numberOfChannels * 4;
      this.bufferBytes.set(key, bytes);
      this.cachedBytes += bytes;
      this.evict();
      return buffer;
    });
    this.buffers.set(key, task);
    return task;
  }

  private evict(): void {
    for (const key of this.buffers.keys()) {
      if (this.cachedBytes <= EFFECT_CACHE_BYTES) return;
      const bytes = this.bufferBytes.get(key);
      if (bytes === undefined) continue; // still decoding
      this.buffers.delete(key);
      this.bufferBytes.delete(key);
      this.cachedBytes -= bytes;
    }
  }

  private async decode(path: string): Promise<AudioBuffer | null> {
    if (!this.ctx || this.missing.has(path)) return null;
    try {
      const clip = await this.sounds.soundClip(path);
      const frames = clip.channels[0]?.length ?? 0;
      if (!frames) return null;
      const buffer = this.ctx.createBuffer(clip.channels.length, frames, clip.sampleRate);
      clip.channels.forEach((samples, c) =>
        buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, c),
      );
      return buffer;
    } catch (err) {
      this.missing.add(path);
      log.once('warn', `sound:${soundName(path)}`, `could not play ${path}: ${String(err)}`);
      return null;
    }
  }

  /**
   * Resume the context on the first click or key press. Music and ambience
   * started before then were started into a held context, and are heard from
   * their beginning once it runs.
   */
  private waitForGesture(): void {
    if (typeof window === 'undefined' || !this.ctx) return;
    const ctx = this.ctx;
    const events = ['pointerdown', 'pointerup', 'mousedown', 'keydown', 'click', 'touchend'];
    let timer = 0;
    const done = (): void => {
      for (const name of events) window.removeEventListener(name, resume, true);
      window.clearInterval(timer);
    };
    const resume = (): void => {
      if (ctx.state === 'running' || ctx.state === 'closed') {
        done();
        return;
      }
      void ctx.resume().then(() => {
        if (ctx.state === 'running') done();
      });
    };
    for (const name of events) window.addEventListener(name, resume, true);
    // An event can reach the page before the browser counts it as the
    // gesture, and a resume asked for then is not honoured. The browser's
    // own record of it is watched as well, so the first one is never lost.
    timer = window.setInterval(() => {
      if (navigator.userActivation?.hasBeenActive ?? false) resume();
    }, GESTURE_POLL_MS);
  }
}

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
