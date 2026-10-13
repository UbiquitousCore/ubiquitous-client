/** Blob shadows as one instanced batch of ground-fitted squares; none under swimmers. */

import * as THREE from 'three';
import type { EntityId, GroundPoint } from '../world/World';
import { DECAL_LIFT, fitCorners } from './groundFit';
import type { CornerHeights, GroundQuery } from './groundFit';

/**
 * Bodies further than this from the hero, along the ground, cast no shadow.
 * Past it a disc is a few pixels wide and not worth its ground queries.
 */
export const SHADOW_RANGE = 20;

/** A shadow is this much wider than the average half-width of its body. */
export const SHADOW_SPREAD = 1.1;

/** Bodies smaller than this across cast nothing. */
const SMALLEST_BODY = 0.05;

/** The most discs drawn at once; the nearest win. */
export const SHADOW_CAP = 200;

/** What the shadow pass reads of one body. */
export interface ShadowBody {
  id: EntityId;
  /** Changes whenever the body's transform does; keys the ground cache. */
  version: number;
  kind: string;
  position: [number, number, number];
  scale: [number, number, number];
  /** A stealthed body casts no shadow; see `gameplay/auraState.ts`. */
  networkStealthed?: boolean;
}

/** What the shadow pass reads from the world. */
export interface ShadowWorld extends GroundQuery {
  /** Everything that might cast: the world's movers, never its scenery. */
  readonly movers: Iterable<ShadowBody>;
  /** Whether a body standing on ground at `groundY` is swimming. */
  waterStateAt(x: number, z: number, groundY: number): { state: 'dry' | 'wading' | 'swimming' };
}

/**
 * Where a body's shadow was fitted, kept until the body moves. Most creatures
 * stand still, so without this the same ground queries would run every frame.
 * `ground` is null for a body that is swimming.
 */
export interface GroundCacheEntry {
  version: number;
  ground: GroundPoint | null;
  corners: CornerHeights;
}

/** One disc to draw. */
export interface ShadowBlob {
  x: number;
  y: number;
  z: number;
  radius: number;
  corners: CornerHeights;
}

/** Only bodies cast: creatures and players, never scenery or objects. */
function castsShadow(kind: string): boolean {
  return kind === 'creature' || kind === 'player';
}

/**
 * The discs to draw this frame, nearest the hero first.
 *
 * `extentsOf` gives a body's unscaled horizontal half-extents, or undefined
 * when it has no model yet. `cache` is owned by the caller and emptied on a
 * zone change.
 */
export function collectShadows(
  world: ShadowWorld,
  hero: { x: number; z: number },
  extentsOf: (id: EntityId) => [number, number] | undefined,
  cache = new Map<EntityId, GroundCacheEntry>(),
): ShadowBlob[] {
  const near: Array<{ blob: ShadowBlob; distance: number }> = [];
  for (const body of world.movers) {
    if (!castsShadow(body.kind) || body.networkStealthed) continue;
    const [x, y, z] = body.position;
    const distance = Math.hypot(x - hero.x, z - hero.z);
    if (distance > SHADOW_RANGE) continue;

    const extents = extentsOf(body.id);
    if (!extents) continue;
    const size = body.scale[0];
    const radius = ((extents[0] + extents[1]) / 2) * size * SHADOW_SPREAD;
    if (radius < SMALLEST_BODY) continue;

    let fit = cache.get(body.id);
    if (!fit || fit.version !== body.version) {
      const ground = world.groundPoint(x, z, y);
      const swimming = world.waterStateAt(x, z, ground.y).state === 'swimming';
      fit = {
        version: body.version,
        ground: swimming ? null : ground,
        corners: swimming ? [0, 0, 0, 0] : fitCorners(world, x, z, ground, radius),
      };
      cache.set(body.id, fit);
    }
    if (!fit.ground) continue;

    near.push({
      blob: { x, y: fit.ground.y + DECAL_LIFT, z, radius, corners: fit.corners },
      distance,
    });
  }
  near.sort((a, b) => a.distance - b.distance);
  return near.slice(0, SHADOW_CAP).map(n => n.blob);
}

export class ObjectShadows {
  readonly object = new THREE.Group();

  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly centres = new Float32Array(SHADOW_CAP * 3);
  private readonly radii = new Float32Array(SHADOW_CAP);
  private readonly heights = new Float32Array(SHADOW_CAP * 4);

  constructor() {
    // A 2 x 2 square laid flat, so an instance's radius is its half-size and
    // its UVs cover the texture once.
    const square = new THREE.PlaneGeometry(2, 2);
    square.rotateX(-Math.PI / 2);

    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = square.index;
    this.geometry.attributes = square.attributes;
    this.geometry.instanceCount = 0;
    this.geometry.setAttribute('blobCentre', new THREE.InstancedBufferAttribute(this.centres, 3));
    this.geometry.setAttribute('blobRadius', new THREE.InstancedBufferAttribute(this.radii, 1));
    this.geometry.setAttribute('blobCorners', new THREE.InstancedBufferAttribute(this.heights, 4));

    this.material = createShadowMaterial();
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false;
    // After the ground, before water and every other transparent surface.
    mesh.renderOrder = -5;
    this.object.add(mesh);
  }

  /** Use the shadow texture from the user's files once it has loaded. */
  setTexture(texture: THREE.Texture): void {
    this.material.uniforms.uMap.value = texture;
    this.material.uniforms.uHasMap.value = 1;
  }

  /** Draw exactly these discs. */
  set(blobs: readonly ShadowBlob[]): void {
    const count = Math.min(blobs.length, SHADOW_CAP);
    for (let i = 0; i < count; i++) {
      const blob = blobs[i]!;
      this.centres.set([blob.x, blob.y, blob.z], i * 3);
      this.radii[i] = blob.radius;
      this.heights.set(blob.corners, i * 4);
    }
    this.geometry.instanceCount = count;
    if (count === 0) return;
    for (const name of ['blobCentre', 'blobRadius', 'blobCorners']) {
      (this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute).needsUpdate = true;
    }
  }

  /** Draw nothing, until the next `set`. */
  clear(): void {
    this.geometry.instanceCount = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function createShadowMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uHasMap: { value: 0 },
    },
    vertexShader: `
      attribute vec3 blobCentre;
      attribute float blobRadius;
      // Corner heights in QUAD_CORNERS order, blended across the square.
      attribute vec4 blobCorners;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        float lift = mix(mix(blobCorners.x, blobCorners.y, uv.x),
                         mix(blobCorners.z, blobCorners.w, uv.x), uv.y);
        vec3 world = blobCentre + vec3(position.x * blobRadius, lift, position.z * blobRadius);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform sampler2D uMap;
      uniform float uHasMap;
      varying vec2 vUv;

      void main() {
        // The shadow texture is black; its shape is all in the alpha. Until
        // it loads, a disc that fades from the middle out stands in.
        float d = length(vUv - 0.5) * 2.0;
        float a = uHasMap > 0.5 ? texture2D(uMap, vUv).a : clamp(1.0 - d * d, 0.0, 1.0);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
        // A raw ShaderMaterial must encode its own output colour space.
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
