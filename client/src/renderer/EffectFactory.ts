/**
 * Drawing a particle effect: a per-frame CPU simulation per emitter, drawn
 * through one InstancedMesh (or one ribbon strip) per emitter. Durations in
 * the data are frames at 30 per second.
 */

import * as THREE from 'three';
import type {
  EffectAffector,
  EffectCurve,
  EffectData,
  EffectEmitter,
  EffectModel,
  EffectParticle,
} from '../assets/types';
import { curveAt, curveVec3At } from './effectCurves';
import {
  jittered,
  launchDirection,
  radialDirection,
  seededRandom,
  spawnPosition,
  type Random,
} from './emitterSpawn';
import { makeSection, RibbonGeometry, widenPath, type RibbonSection } from './ribbonStrip';

/** The rate every frame count in the effect data is authored at. */
const FPS = 30;

/** Per emitter; the data can ask for unbounded particles, so the oldest is recycled. */
const MAX_PARTICLES = 128;

/** A quad, built once and cloned per emitter. */
const QUAD = makeParticleQuad();

/** Speed kept over `steps` frames; own choice: the factor is what is kept per second, and 0 leaves it alone. */
export function keptSpeed(factor: number, steps: number): number {
  if (factor <= 0 || factor === 1) return 1;
  return Math.pow(factor, steps / FPS);
}

/** The quad's own normal, and the axis a sprite's spin turns about. */
const FORWARD = new THREE.Vector3(0, 0, 1);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_X = new THREE.Vector3(1, 0, 0);

/** A quarter turn about X lays a free quad flat, face up, before its own tilt. */
const FLAT = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

/** A unit XY quad with `v = 0` at +Y, since textures upload with `flipY = false`. */
function makeParticleQuad(): THREE.PlaneGeometry {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  uv.needsUpdate = true;
  return geometry;
}

function orientQuadUvs(geometry: THREE.BufferGeometry, p: EffectParticle): void {
  const turns = (p.uvQuarterTurns ?? 0) & 3;
  if (!turns && !p.mirrorU && !p.mirrorV) return;
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    let u = uv.getX(i) - 0.5;
    let v = uv.getY(i) - 0.5;
    for (let t = 0; t < turns; t++) [u, v] = [-v, u];
    if (p.mirrorU) u = -u;
    if (p.mirrorV) v = -v;
    uv.setXY(i, u + 0.5, v + 0.5);
  }
  uv.needsUpdate = true;
}

/** Name of the per-instance alpha attribute; `patchEffectShader` reads it. */
export const INSTANCE_ALPHA = 'instanceAlpha';

export const particleOptions = {
  /** Streaks along their velocity, or free quads; switchable to compare on screen. */
  streaksFollowVelocity: true,
};

interface Particle {
  /** Frames lived, and the frame count it retires at. */
  age: number;
  life: number;
  /** In the emitter's space when it follows the emitter, in world space otherwise. */
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  /** Size multiplier and starting tilt, rolled once at birth. */
  sizeScale: number;
  tilt: [number, number, number];
  /** Per-axis multiplier on the spin tracks, and on the grow tracks. */
  spinScale: [number, number, number];
  growScale: number;
  /** Frames until a wander affector pushes this particle again. */
  wanderWait: number;
}

const isRibbon = (p: EffectParticle): boolean => p.shape === 'ribbon' || p.shape === 'facingRibbon';

/**
 * Whether particles follow a moving emitter; how the two masks combine is
 * unknown. In flight the particle's mask decides (a projectile's trailing
 * emitters leave it clear); elsewhere either mask carries them.
 */
export function particlesFollow(def: EffectEmitter, inFlight: boolean): boolean {
  const p = def.particle;
  const own = p.movesWithEmitter || p.turnsWithEmitter;
  return inFlight ? own : own || def.movesWithEmitter || def.turnsWithEmitter;
}

/** Every value an emitter track holds at `frame`, as the vectors the spawn code takes. */
function vec3Of(
  curves: [EffectCurve<number>, EffectCurve<number>, EffectCurve<number>],
  frame: number,
  out: THREE.Vector3,
  fallback = 0,
): THREE.Vector3 {
  return out.set(
    curveAt(curves[0], frame, fallback),
    curveAt(curves[1], frame, fallback),
    curveAt(curves[2], frame, fallback),
  );
}

/** One emitter's live particles and the mesh that draws them. */
class EmitterRun {
  readonly mesh: THREE.InstancedMesh;
  readonly ribbon: THREE.Mesh | null;
  private readonly strip: RibbonGeometry | null;
  private readonly sections: RibbonSection[] = [];
  private readonly particles: Particle[] = [];
  private frame = 0;
  /** Set to now, not advanced: a late frame bursts once rather than catching up. */
  private lastBurst = -Infinity;
  /** The fraction of a particle a fractional burst size carries to the next burst. */
  private owed = 0;
  /** Particles live in the emitter's space and move with it; otherwise in world space. */
  private readonly follows: boolean;
  /** Set by `windDown` or `land`: an emitter that has been told to stop. */
  private woundDown = false;

  private readonly matrix = new THREE.Matrix4();
  private readonly basis = new THREE.Matrix4();
  private readonly toLocal = new THREE.Matrix4();
  private readonly toWorld = new THREE.Matrix4();
  private readonly linear = new THREE.Matrix3();
  private readonly dir = new THREE.Vector3();
  private readonly across = new THREE.Vector3();
  private readonly along = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly spinQuat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly worldQuat = new THREE.Quaternion();
  /** Inverse of the world rotation, so an instance can be given a world orientation. */
  private readonly parentQuat = new THREE.Quaternion();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly spawn = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  private readonly launch = new THREE.Vector3();
  private readonly radial = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly pull = new THREE.Vector3();
  /** Per-instance alpha, the fourth channel `instanceColor` has no room for. */
  private readonly alpha: THREE.InstancedBufferAttribute;
  /** Distance fade, folded into per-instance alpha because materials are shared. */
  private fade = 1;

  /** The model node this emitter hangs off, or '' for the effect's origin. */
  get attachPoint(): string {
    return this.def.attachPoint;
  }

  /**
   * @param random Every draw this emitter makes, so a cast of the same effect
   *   replays the same particles.
   */
  constructor(
    private readonly def: EffectEmitter,
    material: THREE.Material,
    inFlight: boolean,
    private readonly random: Random,
  ) {
    const p = def.particle;
    this.follows = particlesFollow(def, inFlight);

    // A geometry per emitter, because each carries its own per-instance alpha
    // and its own texture turn.
    const geometry = QUAD.clone();
    orientQuadUvs(geometry, p);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PARTICLES), 1);
    this.alpha.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute(INSTANCE_ALPHA, this.alpha);

    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_PARTICLES);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_PARTICLES * 3),
      3,
    );
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

    if (isRibbon(p)) {
      this.strip = new RibbonGeometry(MAX_PARTICLES, INSTANCE_ALPHA);
      for (let i = 0; i < MAX_PARTICLES; i++) this.sections.push(makeSection());
      this.ribbon = new THREE.Mesh(this.strip.geometry, material);
      this.ribbon.frustumCulled = false;
      this.mesh.visible = false;
    } else {
      this.strip = null;
      this.ribbon = null;
    }
    this.placeNode(0, null);
  }

  /** Tells apart "nothing visible": no particles, zero-sized, or fully transparent. */
  report(): Record<string, unknown> {
    const p = this.def.particle;
    const first = this.particles[0];
    const t = first?.age ?? 0;
    const [w, h] = first ? this.sizeOf(first) : [0, 0];
    return {
      shape: this.def.shape,
      particleShape: p.shape,
      texture: p.texture || '(none)',
      blend: p.blend,
      alive: this.particles.length,
      drawn: this.mesh.count,
      frame: Math.round(this.frame),
      lifeFrames: p.lifeFrames,
      burstSpacing: this.def.burstSpacing,
      sizeX: Number(w.toFixed(3)),
      sizeY: Number(h.toFixed(3)),
      alpha: Math.round(curveAt(p.opacityCurve, t, 255)),
      hasMap: (this.mesh.material as THREE.MeshBasicMaterial).map !== null,
      visible: this.mesh.visible,
      follows: this.follows,
      velocity: first
        ? first.velocity
            .toArray()
            .map(n => Number(n.toFixed(3)))
            .join(', ')
        : '(none alive)',
      ...(this.ribbon
        ? {
            ribbonParticles: this.particles.length,
            ribbonQuads: this.ribbon.geometry.drawRange.count / 6,
          }
        : {}),
    };
  }

  /** Stopped and empty: how a one-shot cleans up. Endless or lifelong ones wait to be wound down. */
  get finished(): boolean {
    return !this.emitting && this.particles.length === 0;
  }

  /** Stop an endless emitter; what it made lives out its life, then `finished`. */
  windDown(): void {
    if (this.def.activeFrames < 0) this.woundDown = true;
  }

  /** At rest: nothing more is emitted; riders go at once, what was left behind lives out. */
  land(): void {
    this.woundDown = true;
    if (this.follows) this.particles.length = 0;
  }

  private get emitting(): boolean {
    if (this.woundDown) return false;
    return this.def.activeFrames < 0 || this.frame < this.def.activeFrames;
  }

  /** Advance by `dt` seconds. `camera` orients camera-facing particles. */
  update(dt: number, camera: THREE.Camera): void {
    const steps = dt * FPS;
    this.frame += steps;

    // The emitter's node follows its own tracks, on the emitter's clock.
    this.placeNode(this.frame, camera);
    this.mesh.updateWorldMatrix(true, false);

    if (this.emitting && this.frame >= this.def.firstBurstFrame) {
      // A lifelong particle restarts its life instead of retiring, so its
      // emitter bursts once and then holds what it made.
      const holding = this.def.particle.lifelong && this.particles.length > 0;
      // A spacing of 0 or less bursts every frame. The epsilon absorbs float
      // drift on a fractional clock that lands on a burst boundary.
      const spacing = Math.max(0, this.def.burstSpacing);
      if (!holding && this.frame - this.lastBurst >= spacing - 1e-6) {
        this.burst();
        this.lastBurst = this.frame;
      }
    }

    this.step(steps);
    if (this.ribbon) this.drawRibbon(camera);
    else this.draw(camera);
  }

  /** Place the emitter node from its tracks; a camera-facing emitter turns to the viewer. */
  private placeNode(frame: number, camera: THREE.Camera | null): void {
    const def = this.def;
    vec3Of(def.emitterOffset, frame, this.mesh.position);
    vec3Of(def.emitterScale, frame, this.mesh.scale, 1);
    if (def.faceCamera && camera) {
      const parent = this.mesh.parent;
      if (parent) parent.getWorldQuaternion(this.quat).invert();
      else this.quat.identity();
      this.mesh.quaternion.copy(this.quat).multiply(camera.quaternion);
    } else {
      // Own choice of order: X first, then Y, then Z, about the parent's axes.
      this.mesh.rotation.set(
        curveAt(def.emitterAngle[0], frame),
        curveAt(def.emitterAngle[1], frame),
        curveAt(def.emitterAngle[2], frame),
        'ZYX',
      );
    }
    if (this.ribbon) {
      this.ribbon.position.copy(this.mesh.position);
      this.ribbon.quaternion.copy(this.mesh.quaternion);
      this.ribbon.scale.copy(this.mesh.scale);
    }
  }

  private burst(): void {
    const def = this.def;
    const p = def.particle;
    // Own choice: the burst size and spacing jitters are not applied, so
    // emission stays steady; a fractional size carries over to later bursts.
    this.owed += Math.max(0, curveAt(def.burstSize, this.frame, 1));
    const count = Math.floor(this.owed + 1e-6);
    this.owed = Math.max(0, this.owed - count);
    if (count <= 0) return;

    vec3Of(def.spawnSize, this.frame, this.size);
    const hollow = curveAt(def.hollowPct, this.frame) / 100;
    const radialSpeed = curveAt(def.radialSpeed, this.frame);
    const aimSpeed = curveAt(def.aimSpeed, this.frame);
    const spread = (curveAt(def.spreadAngle, this.frame) * Math.PI) / 180;
    curveVec3At(def.aimAxis, this.frame, this.aim);

    if (!this.follows) {
      this.toWorld.copy(this.mesh.matrixWorld);
      this.linear.setFromMatrix4(this.mesh.matrixWorld);
    }

    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      spawnPosition(
        def.shape,
        this.size,
        hollow,
        { index: i, count },
        this.random,
        this.spawn,
        this.outward,
      );

      launchDirection(this.aim, spread, this.outward, this.random, this.launch);
      radialDirection(this.outward, this.random, this.radial);
      const velocity = new THREE.Vector3()
        .addScaledVector(this.radial, jittered(radialSpeed, def.radialSpeedJitter, this.random))
        .addScaledVector(this.launch, jittered(aimSpeed, def.aimSpeedJitter, this.random));
      const position = this.spawn.clone();
      if (!this.follows) {
        position.applyMatrix4(this.toWorld);
        velocity.applyMatrix3(this.linear);
      }

      // Own choice: a start-tilt jitter of 100 % adds up to a whole turn.
      const tilt = (axis: 0 | 1 | 2): number =>
        p.startTilt[axis] + (p.startTiltJitter[axis] / 100) * this.random() * Math.PI * 2;

      this.particles.push({
        age: 0,
        life: Math.max(1, jittered(p.lifeFrames, p.lifeJitter, this.random)),
        position,
        velocity,
        sizeScale: jittered(1, p.sizeJitter, this.random),
        tilt: [tilt(0), tilt(1), tilt(2)],
        spinScale: [
          jittered(1, p.spinJitter[0], this.random),
          jittered(1, p.spinJitter[1], this.random),
          jittered(1, p.spinJitter[2], this.random),
        ],
        growScale: jittered(1, p.growJitter, this.random),
        wanderWait: 0,
      });
    }
  }

  private step(steps: number): void {
    const seconds = steps / FPS;
    if (this.follows) this.origin.set(0, 0, 0);
    else this.mesh.getWorldPosition(this.origin);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i]!;
      // Tested before the age advances, so a particle dies on the same frame
      // its replacement is born and a continuous effect never blinks.
      if (particle.age >= particle.life) {
        if (!this.def.particle.lifelong || this.woundDown) {
          this.particles.splice(i, 1);
          continue;
        }
        // A lifelong particle starts its life again, so its tracks cycle.
        particle.age = 0;
      }
      for (const affector of this.def.affectors) this.affect(affector, particle, steps);
      // Own choice: speeds are world units per second.
      particle.position.addScaledVector(particle.velocity, seconds);
      particle.age += steps;
    }
    if (this.particles.length && this.def.killParticlesWithEmitter && !this.emitting) {
      this.particles.length = 0;
    }
  }

  /** One affector on one particle; own choice: pull and swirl are per frame, scaled by frames stepped. */
  private affect(a: EffectAffector, p: Particle, steps: number): void {
    switch (a.kind) {
      case 'pull': {
        // The direction's length is part of the strength, so it is not normalised.
        const strength = curveAt(a.strength, p.age);
        curveVec3At(a.direction, p.age, this.pull);
        p.velocity.addScaledVector(this.pull, strength * steps);
        return;
      }
      case 'speedScale':
        p.velocity.multiplyScalar(keptSpeed(curveAt(a.factor, p.age), steps));
        return;
      case 'wander': {
        // A fresh push every `changeEveryFrames` frames (every frame at 0), added to the velocity.
        p.wanderWait -= steps;
        if (p.wanderWait > 0) return;
        p.wanderWait = Math.max(0, a.changeEveryFrames);
        p.velocity.x += (this.random() * 2 - 1) * a.amplitude[0];
        p.velocity.y += (this.random() * 2 - 1) * a.amplitude[1];
        p.velocity.z += (this.random() * 2 - 1) * a.amplitude[2];
        return;
      }
      case 'swirl': {
        // Turns the particle about an axis through the emitter; mode 1 also
        // draws it in towards that axis.
        curveVec3At(a.axis, p.age, this.pull);
        if (this.pull.lengthSq() < 1e-8) return;
        const strength = curveAt(a.strength, p.age);
        const axis = this.pull.normalize();
        const rel = this.offset.subVectors(p.position, this.origin);
        const tangent = this.dir.crossVectors(axis, rel);
        p.velocity.addScaledVector(tangent, strength * steps);
        if (a.swirlMode === 1) {
          const inward = rel.addScaledVector(axis, -rel.dot(axis)).negate();
          p.velocity.addScaledVector(inward, Math.abs(strength) * steps);
        }
      }
    }
  }

  setFade(f: number): void {
    this.fade = f;
  }

  /** Width and height a particle is drawn at, at its age. */
  private sizeOf(particle: Particle): [number, number] {
    const p = this.def.particle;
    const t = Math.min(particle.age, particle.life);
    const k = particle.sizeScale;
    const g = particle.growScale;
    return [
      curveAt(p.sizeX, t, 1) * curveAt(p.growX, t, 1) * k * g,
      curveAt(p.sizeY, t, 1) * curveAt(p.growY, t, 1) * k * g,
    ];
  }

  /** The particle's position in the mesh's space. */
  private localPosition(particle: Particle, out: THREE.Vector3): THREE.Vector3 {
    out.copy(particle.position);
    if (!this.follows) out.applyMatrix4(this.toLocal);
    return out;
  }

  /** The particle's velocity in world space. */
  private worldVelocity(particle: Particle, out: THREE.Vector3): THREE.Vector3 {
    out.copy(particle.velocity);
    if (this.follows) out.applyQuaternion(this.worldQuat);
    return out;
  }

  /** Write the live particles into the instance buffers. */
  private draw(camera: THREE.Camera): void {
    const p = this.def.particle;
    const mesh = this.mesh;
    const colours = mesh.instanceColor!;
    let n = 0;

    // Instance matrices are in the mesh's space, so a world orientation is
    // brought back into it through the inverse of the mesh's world rotation.
    mesh.getWorldQuaternion(this.worldQuat);
    this.parentQuat.copy(this.worldQuat).invert();
    this.toLocal.copy(mesh.matrixWorld).invert();
    camera.getWorldPosition(this.eye);
    const streak =
      particleOptions.streaksFollowVelocity && (p.shape === 'streak' || p.shape === 'facingStreak');

    for (const particle of this.particles) {
      const t = Math.min(particle.age, particle.life);
      const [sx, sy] = this.sizeOf(particle);
      if (sx <= 0 || sy <= 0) continue;
      const spinZ = particle.tilt[2] + curveAt(p.spinZ, t) * particle.spinScale[2];
      this.localPosition(particle, this.at);

      if (streak) {
        // The long side along travel; a facing streak rolls to face the viewer.
        const along = this.worldVelocity(particle, this.along);
        if (along.lengthSq() < 1e-12) along.copy(WORLD_UP);
        along.normalize();
        if (p.shape === 'facingStreak') {
          this.view.copy(this.at).applyMatrix4(mesh.matrixWorld).sub(this.eye);
          this.across.crossVectors(along, this.view);
        } else {
          this.across.crossVectors(along, WORLD_UP);
        }
        if (this.across.lengthSq() < 1e-12) this.across.crossVectors(along, WORLD_X);
        this.across.normalize();
        if (spinZ) {
          this.spinQuat.setFromAxisAngle(along, spinZ);
          this.across.applyQuaternion(this.spinQuat);
        }
        this.normal.crossVectors(this.across, along).normalize();
        this.quat
          .setFromRotationMatrix(this.basis.makeBasis(this.across, along, this.normal))
          .premultiply(this.parentQuat);
      } else if (p.shape === 'freeQuad' || p.shape === 'streak' || p.shape === 'facingStreak') {
        // A quad with its own orientation in the emitter's space: flat on the
        // ground by default, then turned by its tilt and spin on all three axes.
        this.euler.set(
          particle.tilt[0] + curveAt(p.spinX, t) * particle.spinScale[0],
          particle.tilt[1] + curveAt(p.spinY, t) * particle.spinScale[1],
          spinZ,
          'ZYX',
        );
        this.quat.setFromEuler(this.euler).multiply(FLAT);
      } else {
        // A sprite faces the camera and turns only in its own plane.
        this.quat.copy(this.parentQuat).multiply(camera.quaternion);
        if (spinZ) this.quat.multiply(this.spinQuat.setFromAxisAngle(FORWARD, spinZ));
      }

      this.scale.set(sx, sy, 1);
      // Own choice: column 1 anchors the left edge, 2 the right; row 1 the
      // bottom, 2 the top, so a row-2 streak trails behind its particle.
      const ox = p.anchorColumn === 'start' ? sx / 2 : p.anchorColumn === 'end' ? -sx / 2 : 0;
      const oy = p.anchorRow === 'start' ? sy / 2 : p.anchorRow === 'end' ? -sy / 2 : 0;
      if (ox || oy) this.at.add(this.offset.set(ox, oy, 0).applyQuaternion(this.quat));
      this.matrix.compose(this.at, this.quat, this.scale);
      mesh.setMatrixAt(n, this.matrix);

      // Alpha stays out of colour: folding it in fades alpha-blended sprites to black.
      colours.setXYZ(
        n,
        curveAt(p.tintR, t, 255) / 255,
        curveAt(p.tintG, t, 255) / 255,
        curveAt(p.tintB, t, 255) / 255,
      );
      this.alpha.setX(n, (curveAt(p.opacityCurve, t, 255) / 255) * this.fade);
      n++;
    }

    mesh.count = n;
    if (n > 0) {
      mesh.instanceMatrix.needsUpdate = true;
      colours.needsUpdate = true;
      this.alpha.needsUpdate = true;
    }
  }

  /**
   * Own choice: a ribbon through the emitter's live particles, newest first,
   * each point as wide and opaque as its particle. A weapon trail uses the
   * two weapon ends each particle recorded at birth.
   */
  private drawRibbon(camera: THREE.Camera): void {
    const p = this.def.particle;
    const strip = this.strip!;
    const points: THREE.Vector3[] = [];
    const live: Particle[] = [];
    for (let i = this.particles.length - 1; i >= 0 && live.length < MAX_PARTICLES; i--) {
      const particle = this.particles[i]!;
      live.push(particle);
    }

    this.toLocal.copy(this.mesh.matrixWorld).invert();
    for (const particle of live) points.push(this.localPosition(particle, new THREE.Vector3()));
    // A facing ribbon turns towards the camera, expressed in the strip's space.
    const eye =
      p.shape === 'facingRibbon'
        ? camera.getWorldPosition(this.eye).applyMatrix4(this.toLocal)
        : null;
    widenPath(points, i => this.sizeOf(live[i]!)[0] / 2, eye, WORLD_UP, this.sections);
    live.forEach((particle, i) => {
      const t = Math.min(particle.age, particle.life);
      this.sections[i]!.alpha = (curveAt(p.opacityCurve, t, 255) / 255) * this.fade;
    });
    strip.write(this.sections, live.length);
  }

  dispose(): void {
    this.mesh.dispose();
    // The geometry is a per-emitter clone, not the shared QUAD.
    this.mesh.geometry.dispose();
    this.mesh.removeFromParent();
    if (this.ribbon) {
      this.strip!.dispose();
      this.ribbon.removeFromParent();
    }
  }
}

/** Fades a model node by its opacity track; materials are cloned so sharers do not fade. */
class MeshFade {
  private readonly targets: Array<{ mesh: THREE.Mesh; material: THREE.Material }> = [];
  private frame = 0;

  constructor(
    private readonly opacity: EffectCurve<number>,
    host: THREE.Object3D,
  ) {
    host.traverse(child => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material) || !mesh.material) return;
      const material = mesh.material.clone();
      mesh.material = material;
      this.targets.push({ mesh, material });
    });
  }

  update(dt: number): void {
    if (!this.targets.length) return;
    this.frame += dt * FPS;
    const alpha = THREE.MathUtils.clamp(curveAt(this.opacity, this.frame, 255) / 255, 0, 1);
    for (const { mesh, material } of this.targets) {
      // Fully opaque draws as solid geometry again; fully faded is not drawn.
      material.transparent = alpha < 1;
      material.opacity = alpha;
      material.depthWrite = alpha >= 1;
      mesh.visible = alpha > 0.002;
    }
  }

  dispose(): void {
    for (const { material } of this.targets) material.dispose();
    this.targets.length = 0;
  }
}

/** Whether a curve holds one value the whole time. */
function isConstant(curve: EffectCurve<number>, value: number): boolean {
  return curve.keys.every(key => key.value === value);
}

/**
 * Moves an effect's model along its carrier's offset, angle and scale
 * tracks, on top of wherever the model was placed.
 */
class MeshMotion {
  private readonly basePosition: THREE.Vector3;
  private readonly baseQuaternion: THREE.Quaternion;
  private readonly baseScale: THREE.Vector3;
  private readonly offset = new THREE.Vector3();
  private readonly grow = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private frame = 0;

  constructor(
    private readonly carrier: EffectEmitter,
    private readonly target: THREE.Object3D,
  ) {
    this.basePosition = target.position.clone();
    this.baseQuaternion = target.quaternion.clone();
    this.baseScale = target.scale.clone();
  }

  /** True when the tracks would leave the model exactly where it is. */
  static still(carrier: EffectEmitter): boolean {
    return (
      carrier.emitterOffset.every(c => isConstant(c, 0)) &&
      carrier.emitterAngle.every(c => isConstant(c, 0)) &&
      carrier.emitterScale.every(c => isConstant(c, 1))
    );
  }

  update(dt: number): void {
    this.frame += dt * FPS;
    const t = this.target;
    vec3Of(this.carrier.emitterOffset, this.frame, this.offset);
    vec3Of(this.carrier.emitterScale, this.frame, this.grow, 1);
    this.euler.set(
      curveAt(this.carrier.emitterAngle[0], this.frame),
      curveAt(this.carrier.emitterAngle[1], this.frame),
      curveAt(this.carrier.emitterAngle[2], this.frame),
      'ZYX',
    );
    t.position.copy(this.basePosition).add(this.offset);
    t.quaternion.copy(this.baseQuaternion).multiply(this.turn.setFromEuler(this.euler));
    t.scale.copy(this.baseScale).multiply(this.grow);
    if (!t.matrixAutoUpdate) t.updateMatrix();
  }
}

/** A placed effect: its particle emitters, live. */
export class EffectInstance {
  /** Emitters with no named parent. Ones that have a parent live in the model. */
  readonly object = new THREE.Group();
  private readonly runs: EmitterRun[] = [];
  private readonly fades: MeshFade[] = [];
  private readonly motions: MeshMotion[] = [];
  /** Seconds left before the effect starts, picked from its start delay range. */
  private wait: number;

  /**
   * @param attach finds an emitter's node, preferring the effect's own attach points.
   * @param findDrawable finds a named drawable subtree for a mesh fade.
   * @param modelRoots each of `data.models` as drawn (null if unbuilt), faded and moved by its tracks.
   * @param inFlight a projectile (`particlesFollow`).
   * @param seed the effect path for a spell, `placementSeed` for a placed one.
   */
  constructor(
    data: EffectData,
    material: (e: EffectEmitter) => THREE.Material,
    attach?: (uid: string) => THREE.Object3D | null,
    findDrawable?: (uid: string) => THREE.Object3D | null,
    hideModels = false,
    private readonly modelRoots: ReadonlyArray<THREE.Object3D | null> = [],
    inFlight = false,
    seed: string = data.path,
  ) {
    const low = Math.max(0, data.delayMin);
    const high = Math.max(low, data.delayMax);
    this.wait = (low + seededRandom(`${seed}#wait`)() * (high - low)) / 1000;

    // Each emitter's draws are keyed by the seed and its place in the
    // effect, children counted in the order they are reached.
    let place = 0;
    const add = (def: EffectEmitter): void => {
      const random = seededRandom(`${seed}#${place++}`);
      // A carrier moves a mesh and draws nothing of its own.
      if (def.shape !== 'carrier') {
        const run = new EmitterRun(def, material(def), inFlight, random);
        this.runs.push(run);
        const host = def.attachPoint ? (attach?.(def.attachPoint) ?? null) : null;
        (host ?? this.object).add(run.mesh);
        if (run.ribbon) (host ?? this.object).add(run.ribbon);
      }
      for (const child of def.children) add(child);
    };
    for (const emitter of data.emitters) add(emitter);
    if (!hideModels) {
      data.models.forEach((model, i) =>
        this.addMesh(model, modelRoots[i] ?? null, attach, findDrawable),
      );
    }
  }

  /** Fade and move one model, or the node its carrier names; constant full opacity keeps shared materials. */
  private addMesh(
    model: EffectModel,
    root: THREE.Object3D | null,
    attach?: (uid: string) => THREE.Object3D | null,
    findDrawable?: (uid: string) => THREE.Object3D | null,
  ): void {
    const carrier = model.animation;
    const uid = carrier?.attachPoint;
    const named = uid ? (findDrawable?.(uid) ?? attach?.(uid) ?? null) : null;
    const target = named ?? root;
    if (!target) return;
    if (!isConstant(model.alpha, 255)) this.fades.push(new MeshFade(model.alpha, target));
    if (carrier && !MeshMotion.still(carrier)) this.motions.push(new MeshMotion(carrier, target));
  }

  /** How many emitters found the node they named. For diagnosing placement. */
  countAttached(attach: (uid: string) => THREE.Object3D | null): [number, number] {
    let named = 0;
    let found = 0;
    for (const run of this.runs) {
      if (!run.attachPoint) continue;
      named++;
      if (attach(run.attachPoint)) found++;
    }
    return [found, named];
  }

  get emitterCount(): number {
    return this.runs.length;
  }

  /** What each emitter is actually doing, for when nothing is on screen. */
  report(): Array<Record<string, unknown>> {
    return this.runs.map(r => r.report());
  }

  /** Every emitter stopped and nothing left on screen; true at once without particle emitters. */
  get finished(): boolean {
    return this.runs.every(run => run.finished);
  }

  /** Stop endless emitters; one-shots still play in full, then `finished`. */
  windDown(): void {
    for (const run of this.runs) run.windDown();
  }

  /** A projectile arrived: models and riders go at once; the trail lives out its life. */
  land(): void {
    for (const run of this.runs) run.land();
    const own = new Set<THREE.Object3D>();
    for (const run of this.runs) {
      own.add(run.mesh);
      if (run.ribbon) own.add(run.ribbon);
    }
    for (const root of this.modelRoots) {
      root?.traverse(object => {
        // Taken off every layer rather than hidden: an emitter can hang off a
        // node of the model, and hiding a node hides what hangs off it.
        if ((object as THREE.Mesh).isMesh && !own.has(object)) object.layers.disableAll();
      });
    }
  }

  /** Distance fade for the whole effect, 0 (gone) to 1 (full). */
  setFade(f: number): void {
    for (const run of this.runs) run.setFade(f);
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait > 0) return;
      dt = -this.wait;
    }
    for (const run of this.runs) run.update(dt, camera);
    for (const fade of this.fades) fade.update(dt);
    for (const motion of this.motions) motion.update(dt);
  }

  dispose(): void {
    for (const run of this.runs) run.dispose();
    this.runs.length = 0;
    for (const fade of this.fades) fade.dispose();
    this.motions.length = 0;
    this.fades.length = 0;
  }
}
