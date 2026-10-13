/**
 * Blade ribbons: the last few samples of a weapon's two dummy nodes strung
 * into an additive strip, brightest at the newest edge. Owns and frees its
 * meshes (on age, body loss and teardown).
 */

import * as THREE from 'three';

import type { EntityId } from '../world/World';

/** How long one ribbon lives from the swing, in seconds. */
export const STRIPE_LIFETIME = 0.4;

/** The fraction of its life, at the end, over which a ribbon fades out. */
export const STRIPE_FADE_SHARE = 0.5;

/** How many blade samples a ribbon strings together, newest included. */
export const TRAIL_SAMPLES = 7;

/** How bright the newest edge of a ribbon draws, 0 to 1. */
export const STRIPE_BRIGHTNESS = 0.7;

/** The blade textures the packs hold, selected by the swing's low byte. */
export const STRIPE_TEXTURE_COUNT = 10;

/** The two ends of a blade, in world space. */
export type BladePair = [THREE.Vector3, THREE.Vector3];

/**
 * How bright each sample's edge draws, oldest first, for a ribbon holding
 * `filled` samples at a given age.
 */
export function ribbonShade(filled: number, age: number): number[] {
  const fadeFrom = STRIPE_LIFETIME * (1 - STRIPE_FADE_SHARE);
  const life =
    age <= fadeFrom ? 1 : Math.max(0, 1 - (age - fadeFrom) / (STRIPE_LIFETIME - fadeFrom));
  const out: number[] = [];
  for (let i = 0; i < filled; i++) {
    const along = filled > 1 ? i / (filled - 1) : 1;
    out.push(STRIPE_BRIGHTNESS * life * along);
  }
  return out;
}

interface Ribbon {
  object: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshBasicMaterial;
  entityId: EntityId;
  /** Blade samples, oldest first, at most `TRAIL_SAMPLES` of them. */
  samples: BladePair[];
  age: number;
}

export interface WeaponStripeDeps {
  /** Where the meshes go. */
  parent: THREE.Object3D;
  /** The blade's two ends for one body now, or null when it cannot be sampled. */
  bladeOf: (entityId: EntityId) => BladePair | null;
  /** Loads a blade texture, or resolves null when the build ships none. */
  texture: (path: string) => Promise<THREE.Texture | null>;
}

/** A strip of `TRAIL_SAMPLES - 1` quads, two vertices per sample. */
function ribbonGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices = TRAIL_SAMPLES * 2;
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices * 3, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(vertices * 3, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(vertices * 2, 2));
  const index: number[] = [];
  for (let s = 0; s < TRAIL_SAMPLES - 1; s++) {
    const a = s * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  geometry.setIndex(index);
  geometry.setDrawRange(0, 0);
  return geometry;
}

export class WeaponStripes {
  private readonly ribbons: Ribbon[] = [];

  constructor(private readonly deps: WeaponStripeDeps) {}

  get count(): number {
    return this.ribbons.length;
  }

  /** Start the ribbon for one swing. Index 0 or below means no ribbon. */
  spawn(entityId: EntityId, stripeIndex: number): void {
    if (stripeIndex <= 0) return;
    if (!this.deps.bladeOf(entityId)) return;

    const geometry = ribbonGeometry();
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const object = new THREE.Mesh(geometry, material);
    object.frustumCulled = false;
    this.deps.parent.add(object);

    const ribbon: Ribbon = { object, geometry, material, entityId, samples: [], age: 0 };
    this.ribbons.push(ribbon);

    // A missing texture keeps the plain additive ribbon rather than dropping
    // the swing.
    void this.deps
      .texture(`texture/blade${Math.min(stripeIndex, STRIPE_TEXTURE_COUNT)}.tga`)
      .then(texture => {
        if (!texture || !this.ribbons.includes(ribbon)) return;
        material.map = texture;
        material.needsUpdate = true;
      })
      .catch(() => undefined);
  }

  /**
   * Sample every live ribbon's blade, rebuild its strip, and retire the ones
   * that are done. A ribbon with one sample draws nothing: it starts once the
   * blade has moved.
   */
  advance(dt: number): void {
    for (let i = this.ribbons.length - 1; i >= 0; i--) {
      const ribbon = this.ribbons[i]!;
      ribbon.age += dt;
      const now = this.deps.bladeOf(ribbon.entityId);
      if (!now || ribbon.age >= STRIPE_LIFETIME) {
        this.free(ribbon);
        this.ribbons.splice(i, 1);
        continue;
      }
      ribbon.samples.push([now[0].clone(), now[1].clone()]);
      if (ribbon.samples.length > TRAIL_SAMPLES) ribbon.samples.shift();
      this.rebuild(ribbon);
    }
  }

  dispose(): void {
    for (const ribbon of this.ribbons) this.free(ribbon);
    this.ribbons.length = 0;
  }

  private rebuild(ribbon: Ribbon): void {
    const { geometry, samples } = ribbon;
    const position = geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = geometry.getAttribute('color') as THREE.BufferAttribute;
    const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    const shade = ribbonShade(samples.length, ribbon.age);
    samples.forEach(([start, end], s) => {
      const along = samples.length > 1 ? s / (samples.length - 1) : 1;
      position.setXYZ(s * 2, start.x, start.y, start.z);
      position.setXYZ(s * 2 + 1, end.x, end.y, end.z);
      colour.setXYZ(s * 2, shade[s]!, shade[s]!, shade[s]!);
      colour.setXYZ(s * 2 + 1, shade[s]!, shade[s]!, shade[s]!);
      uv.setXY(s * 2, along, 0);
      uv.setXY(s * 2 + 1, along, 1);
    });
    position.needsUpdate = true;
    colour.needsUpdate = true;
    uv.needsUpdate = true;
    geometry.setDrawRange(0, Math.max(0, samples.length - 1) * 6);
    geometry.computeBoundingSphere();
  }

  private free(ribbon: Ribbon): void {
    ribbon.geometry.dispose();
    ribbon.material.dispose();
    ribbon.object.removeFromParent();
  }
}
