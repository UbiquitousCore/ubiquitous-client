/** What a cast, swing and shot look like: the server names who cast what at
 * whom; this picks particles, clips and projectiles. A cast moves through
 * moments (wind-up on the caster, release and projectiles, the impact on
 * arrival at the target, an aura held on a body); `spellShow.ts` says what
 * each moment shows, and this puts it in the scene, with the sound each
 * moment names. Camera shake is read and ignored.
 */
import * as THREE from 'three';

import { logger } from '../core/log';
import type { MissileFlight, SpellVisualData, SpellVisualEffect } from '../assets/formats/tables';
import type { EffectInstance } from '../renderer/EffectFactory';
import type { EntityId } from '../world/World';
import { LOOT_GLOW_EFFECT } from './loot';
import { planFor, shotClip } from './spellShow';
import type { CastMoment, ParticlePlan, ParticleSpot, ShowPlan } from './spellShow';

const log = logger('combat');

type Vec3 = [number, number, number];

/** What `CombatVisuals` needs from the resource layer. */
export interface VisualTables {
  spellVisual(spellVisualId: number): Promise<SpellVisualData | null>;
  /** The spell visual that shows an effect file, or null when none does. */
  visualWithEffect(effectPath: string): Promise<number | null>;
}

/** What it needs from the renderer. Narrow on purpose: this is the seam. */
export interface VisualScene {
  spawnTempEffect(
    path: string,
    pos: Vec3,
    scale?: number,
    hideModels?: boolean,
    inFlight?: boolean,
  ): Promise<EffectInstance | null>;
  attachEffectToEntity(
    entityId: EntityId,
    path: string,
    nodeId: string,
    scale?: number,
  ): Promise<EffectInstance | null>;
  moveTempEffect(instance: EffectInstance, pos: Vec3, rotation?: THREE.Quaternion): void;
  setEffectPaused(instance: EffectInstance, paused: boolean): void;
  /** Stop an effect's endless emitters and let what they made live out its life. */
  windDownEffect(instance: EffectInstance): void;
  /** A projectile arrived: it goes, and the trail it left fades where it lies. */
  landEffect(instance: EffectInstance): void;
  removeTempEffect(instance: EffectInstance): void;
  spawnWeaponStripe(entityId: EntityId, stripeIndex: number): void;
  entityNodePosition(entityId: EntityId, nodeId: string): Vec3 | null;
  entityBounds(entityId: EntityId): { size: THREE.Vector3; centreY: number } | null;
  cameraPosition(): Vec3;
}

/** A sound a moment started, which the show stops if it loops. */
export interface VisualSound {
  readonly loop: boolean;
  stop(): void;
}

/** What it needs to be heard: a `c_sound` id played at a body. */
export interface VisualSounds {
  playAt(cueId: number, networkId: number): VisualSound | null;
}

/** Combat clip options: hold (chant vs release), allBody (whole-body cast). */
export interface PlayClipOptions {
  hold: boolean;
  allBody: boolean;
}

/** What it needs from the world: who is where, and how to pose them. */
export interface VisualBodies {
  /** The local entity behind a server id, or undefined if it is not resident. */
  localIdOf(networkId: number): EntityId | undefined;
  /** Where that body's feet are, or null. */
  worldPosition(networkId: number): Vec3 | null;
  /** Play one clip; see `PlayClipOptions`. */
  playClip(networkId: number, clip: string, options: PlayClipOptions): void;
  /** Stop a looping action clip and fall back to the body's own posture. */
  stopClip(networkId: number): void;
}

/** Bodies up to this tall, in world units, play effects at their own size. */
const EFFECT_GROWTH_FROM = 1.8;
/** Bodies this tall and taller play effects at `EFFECT_GROWTH_MAX`. */
const EFFECT_GROWTH_TO = 7;
/** The largest an effect is enlarged, for the biggest bodies. */
const EFFECT_GROWTH_MAX = 2.4;

/** 1 up to person height, then a smooth S-curve to `EFFECT_GROWTH_MAX`. */
export function scaleForHeight(height: number): number {
  const span = EFFECT_GROWTH_TO - EFFECT_GROWTH_FROM;
  const t = Math.min(1, Math.max(0, (height - EFFECT_GROWTH_FROM) / span));
  const eased = t * t * (3 - 2 * t);
  return 1 + (EFFECT_GROWTH_MAX - 1) * eased;
}

/** The server's visual, else the spell row's; 0 is none. */
export function castVisualId(fromServer: number, fromSpellRow: number): number {
  return fromServer !== 0 ? fromServer : fromSpellRow;
}

/**
 * The visual `aura.ended` removes, or null. 0 means every aura, so a named
 * spell must never resolve to it: one that resolves to no visual removes nothing.
 */
export function auraRemovalVisual(spellId: number, visualId: number): number | null {
  if (visualId !== 0) return visualId;
  return spellId === 0 ? 0 : null;
}

/** Effects placed on the ground sit this far above it, so they never flicker into it. */
const GROUND_LIFT = 0.06;

/** Share of the body's size an impact moves toward the camera, clearing its near surface. */
const HIT_CLEARANCE = 0.6;

/** Ms a projectile waits in the hand, so it leaves as the arm finishes. */
const MISSILE_LAUNCH_DELAY = 90;

/**
 * Strike height as a share of box height: an upright body high on the chest
 * (observed in play by the owner), a squat one in the middle (own choice).
 */
const STRIKE_SHARE = { upright: 0.7, squat: 0.5 } as const;

/** The shape of a draining missile's swirl up out of its victim. */
interface DrainSwirl {
  /** Seconds spent swirling before it breaks away toward the caster. */
  seconds: number;
  /** Full turns around the victim per second. */
  turnsPerSecond: number;
  /** How far above the victim's chest the swirl tops out. */
  rise: number;
  /** How wide the swirl has opened by the time it breaks away. */
  width: number;
}

/** Own choice, by eye: the first drain a quick tight twist, the second slow and lingering. */
const DRAIN_SWIRLS: Readonly<Partial<Record<MissileFlight, DrainSwirl>>> = {
  drain1: { seconds: 0.5, turnsPerSecond: 2, rise: 1.8, width: 1.2 },
  drain2: { seconds: 1.4, turnsPerSecond: 0.7, rise: 2.4, width: 1.8 },
};

/** One spell visual on one body, carrying out each moment's `ShowPlan`. */
class BodyShow {
  private particles: EffectInstance[] = [];
  /** Particles placed in the world rather than on a bone, kept on their body each frame. */
  private placed: Array<{
    instance: EffectInstance;
    spot: Exclude<ParticleSpot, { kind: 'ride' }>;
  }> = [];
  /** Bumped on every change of plan; a file loaded for an older one is dropped. */
  private ticket = 0;
  /** Particle files still loading. */
  private pending = 0;
  private moment: CastMoment | null = null;
  private lasts: ShowPlan['lasts'] = 'held';
  /** Milliseconds the particles stay frozen, and what happens when it ends. */
  private waitMs = 0;
  private afterWait: 'start' | 'clear' = 'start';
  /** Milliseconds until the particles are wound down; Infinity for never. */
  private windDownInMs = Infinity;
  private woundDown = false;
  /** Milliseconds left on a lasting effect. */
  private remainingMs = Infinity;
  /** Whether this show left a looping clip on the body. */
  private looping = false;
  private over = false;
  private areaPoint: Vec3 | null = null;
  /** The sound the current moment started, while it may still need stopping. */
  private voice: VisualSound | null = null;

  constructor(
    readonly unitId: number,
    readonly visual: SpellVisualData,
    private readonly scene: VisualScene,
    private readonly bodies: VisualBodies,
    private readonly sounds: VisualSounds | null,
  ) {}

  get visualId(): number {
    return this.visual.id;
  }

  /** Move to a moment of the cast: drop what was showing and show its plan. */
  show(moment: CastMoment, instant: boolean, areaPoint: Vec3 | null): void {
    const plan = planFor(this.visual, moment, instant);
    this.ticket++;
    this.clearParticles();
    this.moment = moment;
    this.areaPoint = areaPoint;
    this.waitMs = plan?.waitMs ?? 0;
    this.afterWait = 'start';
    this.windDownInMs = Infinity;
    this.woundDown = false;
    this.lasts = plan?.lasts ?? 'held';
    if (!plan) return;

    // A wind-up's charging hum loops until the spell goes off; a one-shot
    // is left to finish on its own.
    this.silenceLoop();
    const sound = plan.phase ? (this.visual.phases[plan.phase]?.sound ?? 0) : 0;
    if (sound && this.sounds) this.voice = this.sounds.playAt(sound, this.unitId);

    if (plan.clip) {
      this.bodies.playClip(this.unitId, plan.clip.name, {
        hold: plan.clip.loop,
        allBody: plan.clip.wholeBody,
      });
      this.looping = plan.clip.loop;
    } else if (plan.endsWindUp && this.looping) {
      this.bodies.stopClip(this.unitId);
      this.looping = false;
    }

    const local = this.bodies.localIdOf(this.unitId);
    if (local === undefined) return;
    if (plan.streak > 0) this.scene.spawnWeaponStripe(local, plan.streak);
    for (const particle of plan.particles) void this.load(particle, local, this.ticket);
  }

  /** Freeze then remove after `ms`; a release does this when its projectile leaves. */
  retireAfter(ms: number): void {
    this.waitMs = ms;
    this.afterWait = 'clear';
    this.freeze(true);
  }

  /** Stop emitting in `ms` and let particles fade; a release's hand glow emits forever otherwise. */
  windDownAfter(ms: number): void {
    this.windDownInMs = Math.max(0, ms);
  }

  /** How long a lasting effect stays; zero or less means until it is removed. */
  keepFor(durationMs: number): void {
    this.remainingMs = durationMs > 0 ? durationMs : Infinity;
  }

  /** Advance the clocks. False once the show is over. */
  tick(dt: number): boolean {
    if (this.over) return false;
    const ms = dt * 1000;
    this.follow();

    if (this.waitMs > 0) {
      this.waitMs -= ms;
      if (this.waitMs > 0) return true;
      this.waitMs = 0;
      if (this.afterWait === 'start') {
        this.freeze(false);
      } else {
        this.ticket++;
        this.clearParticles();
      }
      return true;
    }

    if (!this.woundDown && this.windDownInMs !== Infinity && (this.windDownInMs -= ms) <= 0) {
      this.woundDown = true;
      for (const p of this.particles) this.scene.windDownEffect(p);
    }

    const burntOut = this.pending === 0 && this.particles.every(p => p.finished);
    const gone =
      this.moment === 'lasting' &&
      (this.bodies.localIdOf(this.unitId) === undefined || (this.remainingMs -= ms) <= 0);
    if ((this.lasts === 'spent' && burntOut) || gone) {
      this.end();
      return false;
    }
    return true;
  }

  /** Take everything down, and let go of any clip this left looping. */
  end(): void {
    if (this.over) return;
    this.over = true;
    this.ticket++;
    this.clearParticles();
    this.silenceLoop();
    if (this.looping) {
      this.bodies.stopClip(this.unitId);
      this.looping = false;
    }
  }

  private async load(particle: ParticlePlan, local: EntityId, ticket: number): Promise<void> {
    const scale = particle.scale * bodyScale(this.scene, local);
    const { spot } = particle;
    let made: Promise<EffectInstance | null>;
    if (spot.kind === 'ride') {
      made = this.scene.attachEffectToEntity(local, particle.path, spot.node, scale);
    } else {
      const at = this.placeOf(spot, local);
      if (!at) return;
      made = this.scene.spawnTempEffect(particle.path, at, scale);
    }

    this.pending++;
    let instance: EffectInstance | null;
    try {
      instance = await made;
    } finally {
      this.pending--;
    }
    if (!instance) return;
    // The plan changed, or the show ended, while the file was loading. Kept,
    // it would play on at wherever it was put for the rest of the session.
    if (ticket !== this.ticket || this.over) {
      this.scene.removeTempEffect(instance);
      return;
    }
    this.particles.push(instance);
    if (spot.kind !== 'ride') this.placed.push({ instance, spot });
    // Arriving during a wait, it waits with the rest.
    if (this.waitMs > 0) this.scene.setEffectPaused(instance, true);
    // Arriving after the wind-down, it winds down with the rest.
    if (this.woundDown) this.scene.windDownEffect(instance);
  }

  /** The world point for a particle that is placed once. Null if the body is gone. */
  private placeOf(spot: Exclude<ParticleSpot, { kind: 'ride' }>, local: EntityId): Vec3 | null {
    const feet = this.bodies.worldPosition(this.unitId);
    if (!feet) return null;
    const lifted = (p: Vec3): Vec3 => [p[0], p[1] + GROUND_LIFT, p[2]];

    switch (spot.kind) {
      case 'front': {
        const node = this.scene.entityNodePosition(local, spot.node);
        return node ? this.towardCamera(node, local) : lifted(feet);
      }
      case 'node': {
        const node = this.scene.entityNodePosition(local, spot.node);
        return lifted(node ?? feet);
      }
      case 'area':
        return lifted(this.areaPoint ?? feet);
      case 'feet':
        return lifted(feet);
    }
  }

  /** Moved toward the camera, or a burst on a bone plays half inside the body. */
  private towardCamera(node: Vec3, local: EntityId): Vec3 {
    const bounds = this.scene.entityBounds(local);
    const eye = this.scene.cameraPosition();
    const dx = eye[0] - node[0];
    const dy = eye[1] - node[1];
    const dz = eye[2] - node[2];
    const length = Math.hypot(dx, dy, dz);
    if (!bounds || length < 1e-4) return node;
    const t = (Math.max(bounds.size.x, bounds.size.z) * HIT_CLEARANCE) / length;
    return [node[0] + dx * t, node[1] + dy * t, node[2] + dz * t];
  }

  /** Move each placed particle to where its spot on the body now is; an area point stays put. */
  private follow(): void {
    const local = this.bodies.localIdOf(this.unitId);
    if (local === undefined) return;
    for (const { instance, spot } of this.placed) {
      if (spot.kind === 'area') continue;
      const at = this.placeOf(spot, local);
      if (at) this.scene.moveTempEffect(instance, at);
    }
  }

  private silenceLoop(): void {
    if (this.voice?.loop) this.voice.stop();
    this.voice = null;
  }

  private freeze(paused: boolean): void {
    for (const p of this.particles) this.scene.setEffectPaused(p, paused);
  }

  private clearParticles(): void {
    for (const p of this.particles) this.scene.removeTempEffect(p);
    this.particles = [];
    this.placed = [];
  }
}

/** Effects grow with the body they play on. */
function bodyScale(scene: VisualScene, local: EntityId): number {
  const bounds = scene.entityBounds(local);
  return bounds ? scaleForHeight(bounds.size.y) : 1;
}

/**
 * A flying `.beff` from caster to target. A draining missile flies the other
 * way, swirling up out of the victim and across; its impact still plays on
 * the victim when it reaches the caster.
 */
class Missile {
  private readonly pos: THREE.Vector3;
  private readonly aim = new THREE.Vector3();
  private readonly step = new THREE.Vector3();
  private readonly facing = new THREE.Quaternion();
  private readonly forward = new THREE.Vector3(0, 0, -1);
  /** The body it flies to: the target, or the caster for a drain. */
  private readonly destinationId: number;
  /** Set once the projectile reaches its destination, or gives up on it. */
  private landed = false;
  /** How long until this is allowed to move. */
  private holdMs: number;
  /** The swirl still to fly, for a draining missile; null once it streams. */
  private swirl: {
    shape: DrainSwirl;
    /** The victim's chest when the swirl began. The swirl stays put. */
    anchor: THREE.Vector3;
    /** Seconds into the swirl. */
    age: number;
    /** Starting angle, so a volley fans out rather than flying as one. */
    phase: number;
    /** This mote's share of the swirl's width. */
    widthScale: number;
  } | null = null;

  constructor(
    readonly casterId: number,
    readonly targetId: number,
    readonly spellVisualId: number,
    effect: SpellVisualEffect,
    private readonly speed: number,
    start: Vec3,
    holdMs: number,
    private readonly scene: VisualScene,
    private readonly bodies: VisualBodies,
    private instance: EffectInstance | null,
  ) {
    this.pos = new THREE.Vector3(start[0], start[1], start[2]);
    this.holdMs = holdMs;
    this.destinationId = targetId;

    const shape = DRAIN_SWIRLS[effect.flight];
    const victim = shape ? this.centreOf(targetId) : null;
    if (shape && victim) {
      this.destinationId = casterId;
      this.pos.copy(victim);
      this.swirl = {
        shape,
        anchor: victim,
        age: 0,
        phase: Math.random() * Math.PI * 2,
        widthScale: 0.8 + Math.random() * 0.4,
      };
    }
    if (this.instance) this.scene.moveTempEffect(this.instance, this.position);
  }

  get hit(): boolean {
    return this.landed;
  }

  /** Where the missile is now. */
  get position(): Vec3 {
    return [this.pos.x, this.pos.y, this.pos.z];
  }

  adopt(instance: EffectInstance): void {
    this.instance = instance;
    // A held shot stays hidden until it launches, so it is never seen parked
    // in the caster's hand, and the async load cannot show a half-placed one.
    this.scene.setEffectPaused(instance, this.holdMs > 0);
    this.scene.moveTempEffect(instance, this.position);
  }

  /** The point on a body a projectile aims at, or null if it is gone. */
  private centreOf(networkId: number): THREE.Vector3 | null {
    const feet = this.bodies.worldPosition(networkId);
    if (!feet) return null;
    const local = this.bodies.localIdOf(networkId);
    const bounds = local === undefined ? null : this.scene.entityBounds(local);
    if (!bounds) return new THREE.Vector3(feet[0], feet[1] + 1, feet[2]);
    const { size, centreY } = bounds;
    const upright = size.y > Math.max(size.x, size.z);
    const share = upright ? STRIKE_SHARE.upright : STRIKE_SHARE.squat;
    return new THREE.Vector3(feet[0], centreY + (share - 0.5) * size.y, feet[2]);
  }

  update(dt: number): void {
    if (this.landed) return;

    // Whether it is flying yet or not, a destination that has gone ends it.
    const destination = this.centreOf(this.destinationId);
    if (!destination) {
      this.landed = true;
      return;
    }

    if (this.holdMs > 0) {
      this.holdMs -= dt * 1000;
      if (this.holdMs > 0) return;
      // Launched: it becomes visible on the frame it starts moving.
      if (this.instance) this.scene.setEffectPaused(this.instance, false);
    }

    if (this.swirl) {
      // Aim at the next point on the swirl; the move below faces along it.
      this.swirlPoint(dt, this.aim);
      this.step.subVectors(this.aim, this.pos);
      this.pos.copy(this.aim);
    } else {
      this.step.subVectors(destination, this.pos);
      const distance = this.step.length();
      const travel = this.speed * dt;
      if (distance <= travel || distance < 1e-4) {
        this.pos.copy(destination);
        this.landed = true;
      } else {
        this.step.multiplyScalar(travel / distance);
        this.pos.add(this.step);
      }
    }

    if (!this.instance) return;
    // A missile effect points down its own -Z; turn that onto the direction
    // of travel so an arrow points where it is going.
    if (this.step.lengthSq() > 1e-8) {
      this.facing.setFromUnitVectors(this.forward, this.step.normalize());
      this.scene.moveTempEffect(this.instance, this.position, this.facing);
    } else {
      this.scene.moveTempEffect(this.instance, this.position);
    }
  }

  /** Advance the swirl, easing out in height and width, then fly straight at the spell's speed. */
  private swirlPoint(dt: number, out: THREE.Vector3): void {
    const swirl = this.swirl!;
    swirl.age += dt;
    const { shape } = swirl;
    const progress = Math.min(1, swirl.age / shape.seconds);
    const eased = 1 - (1 - progress) * (1 - progress);
    const angle = swirl.phase + swirl.age * shape.turnsPerSecond * Math.PI * 2;
    const width = shape.width * swirl.widthScale * eased;
    out.set(
      swirl.anchor.x + width * Math.cos(angle),
      swirl.anchor.y + shape.rise * eased,
      swirl.anchor.z + width * Math.sin(angle),
    );
    if (progress >= 1) this.swirl = null;
  }

  /** Arrived or gave up; hands back its effect, trail still fading, for the caller to remove. */
  land(): EffectInstance | null {
    const instance = this.instance;
    this.instance = null;
    if (instance) this.scene.landEffect(instance);
    return instance;
  }

  dispose(): void {
    if (this.instance) this.scene.removeTempEffect(this.instance);
    this.instance = null;
  }
}

/** Own choice: catches a trail whose particles never retire (the files give a second or less). */
export const TRAIL_LINGER_MAX_MS = 3000;

export class CombatVisuals {
  /** One cast per body; a second replaces the first. */
  private readonly casting = new Map<number, BodyShow>();
  /** Hits and area effects. Short-lived, many at once, not keyed by anything. */
  private readonly transient: BodyShow[] = [];
  /** Held buffs and debuffs, deduplicated by body and visual. */
  private readonly auras: BodyShow[] = [];
  private readonly missiles: Missile[] = [];
  /** What landed projectiles left behind, fading, with the time they have left. */
  private readonly trails: Array<{ instance: EffectInstance; leftMs: number }> = [];

  constructor(
    private readonly tables: VisualTables,
    private readonly scene: VisualScene,
    private readonly bodies: VisualBodies,
    private readonly sounds: VisualSounds | null = null,
  ) {}

  // — events --------------------------------------------------------------

  /** A cast has begun: play the wind-up on the caster. `spell.casting`. */
  beginCast(casterId: number, spellVisualId: number): void {
    void this.castMoment(casterId, spellVisualId, 'windUp', false);
  }

  /** The release on the caster, then a projectile per target, or the impact at once; `castMs` 0 is instant. */
  async release(
    casterId: number,
    spellVisualId: number,
    castMs: number,
    speed: number,
    targets: number[],
  ): Promise<void> {
    const visual = await this.visualFor(spellVisualId);
    if (!visual) return;

    const show = await this.castMoment(casterId, spellVisualId, 'release', castMs === 0);
    // A projectile that has no speed never flies: the spell goes off as if
    // it had no projectile at all, straight onto its targets.
    const flies = visual.missile !== null && speed > 0;
    if (!flies || targets.length === 0) {
      // Nothing leaves the hand, so the release stands down once the blow
      // has landed.
      show?.windDownAfter(visual.impactDelayMs);
    }
    if (targets.length === 0) return;

    if (!flies) {
      // Melee-shaped: the impact plays on each target, after the swing.
      for (const targetId of targets) this.playHit(targetId, spellVisualId);
      return;
    }
    const missile = visual.missile!;

    // A missile leaves the caster's weapon hand, not their feet.
    const from = this.launchPointOf(casterId);
    if (!from) return;
    for (const targetId of targets) {
      for (let i = 0; i < missile.count; i++) {
        this.launch(casterId, targetId, visual, speed, from, MISSILE_LAUNCH_DELAY);
      }
    }
    // The caster's own release particles stand down once the shot leaves:
    // what they were showing is now flying across the field on its own.
    show?.retireAfter(MISSILE_LAUNCH_DELAY);
  }

  /** `attack.shotFired`: the arrow leaves at once; returns the shot's clip. */
  async rangeLaunch(
    attackerId: number,
    targetId: number,
    spellVisualId: number,
    speed: number,
    rangedSubclass?: number,
  ): Promise<string | null> {
    const visual = await this.visualFor(spellVisualId);
    if (visual && visual.weaponStreak > 0) {
      const local = this.bodies.localIdOf(attackerId);
      if (local !== undefined) this.scene.spawnWeaponStripe(local, visual.weaponStreak);
    }
    const from = this.launchPointOf(attackerId);
    if (visual?.missile && from) {
      for (let i = 0; i < visual.missile.count; i++) {
        this.launch(attackerId, targetId, visual, speed, from, 0, rangedSubclass === 20);
      }
    }
    return visual ? shotClip(visual) : null;
  }

  /** The impact of a spell or a swing, on the body that took it. */
  playHit(unitId: number, spellVisualId: number): void {
    void this.playOnce(unitId, 'impact', spellVisualId, null);
  }

  /** An area effect centred on a point rather than on a body. */
  playAreaEffect(unitId: number, spellVisualId: number, at: Vec3 | null): void {
    void this.playOnce(unitId, 'area', spellVisualId, at);
  }

  /** Hold an aura's visual; deduplicated, since the server re-sends auras on every refresh. */
  async addAura(unitId: number, spellVisualId: number, durationMs: number): Promise<void> {
    const onBody = () => this.auras.find(a => a.unitId === unitId && a.visualId === spellVisualId);
    const existing = onBody();
    if (existing) {
      existing.keepFor(durationMs);
      return;
    }
    const visual = await this.visualFor(spellVisualId);
    if (!visual || !visual.phases.lasting) return;
    // Awaited above, so check again: two adds can race on the same visual.
    if (onBody()) return;

    const show = new BodyShow(unitId, visual, this.scene, this.bodies, this.sounds);
    show.keepFor(durationMs);
    show.show('lasting', false, null);
    this.auras.push(show);
  }

  /** Take a buff's visual away. A visual of 0 removes every aura on the body. */
  removeAura(unitId: number, spellVisualId: number): void {
    for (let i = this.auras.length - 1; i >= 0; i--) {
      const aura = this.auras[i];
      if (aura.unitId !== unitId) continue;
      if (spellVisualId && aura.visualId !== spellVisualId) continue;
      aura.end();
      this.auras.splice(i, 1);
    }
  }

  /** The glow over a body worth opening. */
  showLootGlow(networkId: number): void {
    this.withLootGlow(visual => void this.addAura(networkId, visual, 0));
  }

  hideLootGlow(networkId: number): void {
    this.withLootGlow(visual => this.removeAura(networkId, visual));
  }

  /** Act on the loot glow's visual once named; one cached answer keeps add and remove in order. */
  private withLootGlow(act: (visual: number) => void): void {
    void this.tables
      .visualWithEffect(LOOT_GLOW_EFFECT)
      .then(visual => {
        if (visual !== null) act(visual);
        else log.once('warn', 'loot-glow', 'no spell visual shows the loot glow effect');
      })
      .catch(() => {});
  }

  /** A cast was interrupted or refused: drop its visual and unfreeze the body. */
  stopCast(casterId: number): void {
    const show = this.casting.get(casterId);
    if (!show) return;
    show.end();
    this.casting.delete(casterId);
  }

  /** A body left the world. Everything hanging off it goes with it. */
  forget(networkId: number): void {
    this.stopCast(networkId);
    this.removeAura(networkId, 0);
    for (let i = this.transient.length - 1; i >= 0; i--) {
      if (this.transient[i].unitId !== networkId) continue;
      this.transient[i].end();
      this.transient.splice(i, 1);
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const missile = this.missiles[i];
      if (missile.casterId !== networkId && missile.targetId !== networkId) continue;
      missile.dispose();
      this.missiles.splice(i, 1);
    }
  }

  /** A zone change, or the connection going away. */
  clear(): void {
    for (const show of this.casting.values()) show.end();
    this.casting.clear();
    for (const show of this.transient) show.end();
    this.transient.length = 0;
    for (const show of this.auras) show.end();
    this.auras.length = 0;
    for (const missile of this.missiles) missile.dispose();
    this.missiles.length = 0;
    for (const trail of this.trails) this.scene.removeTempEffect(trail.instance);
    this.trails.length = 0;
  }

  // — the frame -----------------------------------------------------------

  update(dt: number): void {
    for (const [casterId, show] of this.casting) {
      if (!show.tick(dt)) this.casting.delete(casterId);
    }
    for (let i = this.transient.length - 1; i >= 0; i--) {
      if (!this.transient[i].tick(dt)) this.transient.splice(i, 1);
    }
    for (let i = this.auras.length - 1; i >= 0; i--) {
      if (!this.auras[i].tick(dt)) this.auras.splice(i, 1);
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const missile = this.missiles[i];
      missile.update(dt);
      if (!missile.hit) continue;
      // Arrival is what triggers the impact — not the message that started
      // the shot. This is the one ordering the whole file exists to get right.
      this.playHit(missile.targetId, missile.spellVisualId);
      const left = missile.land();
      if (left) this.trails.push({ instance: left, leftMs: TRAIL_LINGER_MAX_MS });
      this.missiles.splice(i, 1);
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const trail = this.trails[i];
      trail.leftMs -= dt * 1000;
      if (!trail.instance.finished && trail.leftMs > 0) continue;
      this.scene.removeTempEffect(trail.instance);
      this.trails.splice(i, 1);
    }
  }

  // — internals -----------------------------------------------------------

  private async visualFor(spellVisualId: number): Promise<SpellVisualData | null> {
    if (!spellVisualId) return null;
    try {
      return await this.tables.spellVisual(spellVisualId);
    } catch (err) {
      log.once(
        'warn',
        `visual:${spellVisualId}`,
        `could not read spell visual ${spellVisualId}: ${String(err)}`,
      );
      return null;
    }
  }

  /** Move a caster's show to a moment; the same visual carries on, another replaces it. */
  private async castMoment(
    casterId: number,
    spellVisualId: number,
    moment: CastMoment,
    instant: boolean,
  ): Promise<BodyShow | null> {
    let show = this.casting.get(casterId);
    if (show?.visualId !== spellVisualId) {
      const visual = await this.visualFor(spellVisualId);
      if (!visual) return null;
      // Re-read: the load above yielded, and a second cast may have landed.
      show = this.casting.get(casterId);
      if (show?.visualId !== spellVisualId) {
        show?.end();
        show = new BodyShow(casterId, visual, this.scene, this.bodies, this.sounds);
        this.casting.set(casterId, show);
      }
    }
    show.show(moment, instant, null);
    return show;
  }

  /** A show that plays once on a body: an impact, or an area effect. */
  private async playOnce(
    unitId: number,
    moment: CastMoment,
    spellVisualId: number,
    at: Vec3 | null,
  ): Promise<void> {
    const visual = await this.visualFor(spellVisualId);
    // Most visuals have no area effect, and some no impact: nothing to play.
    if (!visual || !planFor(visual, moment, false)) return;
    if (this.bodies.localIdOf(unitId) === undefined) return;

    const show = new BodyShow(unitId, visual, this.scene, this.bodies, this.sounds);
    show.show(moment, false, at);
    this.transient.push(show);
  }

  /** The right hand (observed in play by the owner), else a unit above the feet (own choice). */
  private launchPointOf(networkId: number): Vec3 | null {
    const local = this.bodies.localIdOf(networkId);
    if (local !== undefined) {
      const hand = this.scene.entityNodePosition(local, 'Bip01_R_Hand');
      if (hand) return hand;
    }
    const feet = this.bodies.worldPosition(networkId);
    return feet ? [feet[0], feet[1] + 1, feet[2]] : null;
  }

  private launch(
    casterId: number,
    targetId: number,
    visual: SpellVisualData,
    speed: number,
    from: Vec3,
    holdMs: number,
    hideModels = false,
  ): void {
    const effect = visual.missile;
    // Speed comes from the spell, and a spell with no speed has no flight.
    if (!effect || speed <= 0) return;

    const local = this.bodies.localIdOf(casterId);
    const bounds = local === undefined ? null : this.scene.entityBounds(local);
    const scale = effect.scale * (bounds ? scaleForHeight(bounds.size.y) : 1);

    const missile = new Missile(
      casterId,
      targetId,
      visual.id,
      effect,
      speed,
      from,
      holdMs,
      this.scene,
      this.bodies,
      null,
    );
    this.missiles.push(missile);

    // The missile owns its full effect, models and trail emitters: created
    // once and moved, so the trail is laid along the path it flies.
    void this.scene
      .spawnTempEffect(effect.pathname, missile.position, scale, hideModels, true)
      .then(instance => {
        if (!instance) return;
        if (!this.missiles.includes(missile)) {
          // It arrived, or the target vanished, before the file loaded.
          this.scene.removeTempEffect(instance);
          return;
        }
        missile.adopt(instance);
      });
  }
}
