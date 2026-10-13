/** The selection ring: outline and faint disc in the relationship colour, ground-fitted, springing in on selection. */

import * as THREE from 'three';
import { DECAL_LIFT, fitCorners } from './groundFit';
import type { CornerHeights, GroundQuery } from './groundFit';

/**
 * How the hero stands with a unit: on its side, on neither, against it, dead,
 * part of a quest, or one the hero can catch.
 */
export type Relation = 'ally' | 'bystander' | 'enemy' | 'corpse' | 'questUnit' | 'catchable';

/** Every relation, in the order the ring review page lays them out. */
export const RELATIONS: readonly Relation[] = [
  'ally',
  'bystander',
  'enemy',
  'corpse',
  'questUnit',
  'catchable',
];

/** The ring's colour for each relation, as 0xRRGGBB in sRGB. */
export const RING_COLOURS: Readonly<Record<Relation, number>> = {
  ally: 0x1ee03c,
  bystander: 0xfafa32,
  enemy: 0xe02a1c,
  corpse: 0x5e5e5e,
  questUnit: 0x93f1ce,
  catchable: 0xb766ec,
};

/**
 * How opaque the disc inside the ring's outline is. Low enough that the
 * unit's feet show through it.
 */
export const RING_FILL_OPACITY = 0.4;

/** The width of the ring's solid outline, in screen pixels. */
export const RING_LINE_PX = 1.5;

/** How long the selection pop lasts, in milliseconds. */
export const POP_MS = 280;

/** The size the ring pops out from, as a share of its settled size. */
export const POP_START = 0.55;

/** How far past its settled size the pop springs before it settles. */
const POP_SPRING = 1.6;

/** The ring is this much wider than the larger half-width of its body. */
export const RING_PAD = 1.15;

/** The smallest ring drawn, so a rat's ring still reads as a ring. */
export const RING_MIN_RADIUS = 0.35;

/** Bodies with no footprint at all get no ring. */
const SMALLEST_BODY = 0.01;

/** What the ring reads from the world. */
export interface RingWorld extends GroundQuery {
  waterStateAt(x: number, z: number, groundY: number): { state: 'dry' | 'wading' | 'swimming' };
}

/** Where the ring goes this frame, how big, and in what colour. */
export interface RingPlacement {
  x: number;
  y: number;
  z: number;
  radius: number;
  corners: CornerHeights;
  colour: number;
}

/**
 * The pop's size factor `age` milliseconds after selection.
 *
 * Starts at `POP_START`, springs a little past 1 and eases back onto it at
 * `POP_MS`, then holds. The curve is a cubic with zero slope at the end, so
 * the ring comes to rest rather than stopping dead.
 */
export function popScale(age: number): number {
  if (age >= POP_MS) return 1;
  const t = Math.max(0, age) / POP_MS - 1;
  const eased = 1 + (POP_SPRING + 1) * t * t * t + POP_SPRING * t * t;
  return POP_START + (1 - POP_START) * eased;
}

/** The settled ring radius for a body with these scaled half-extents. */
export function ringRadius(reachX: number, reachZ: number): number {
  return Math.max(RING_MIN_RADIUS, Math.max(reachX, reachZ) * RING_PAD);
}

/**
 * Where to draw the ring, or null for nothing.
 *
 * `probeFrom` is the height to search down for ground from; a corpse passes
 * the middle of its body, which is lower than where it stood.
 */
export function placeRing(
  world: RingWorld,
  target: { position: [number, number, number]; scale: [number, number, number] } | null,
  extents: [number, number] | undefined,
  relation: Relation,
  age: number,
  probeFrom?: number,
): RingPlacement | null {
  if (!target || !extents) return null;
  const [x, y, z] = target.position;
  const reachX = extents[0] * target.scale[0];
  const reachZ = extents[1] * target.scale[0];
  if (Math.max(reachX, reachZ) < SMALLEST_BODY) return null;

  const ground = world.groundPoint(x, z, probeFrom ?? y);
  if (world.waterStateAt(x, z, ground.y).state === 'swimming') return null;

  const radius = ringRadius(reachX, reachZ) * popScale(age);
  return {
    x,
    y: ground.y + DECAL_LIFT,
    z,
    radius,
    corners: fitCorners(world, x, z, ground, radius),
    colour: RING_COLOURS[relation] ?? RING_COLOURS['bystander'],
  };
}

export class TargetRing {
  readonly object = new THREE.Group();

  private readonly geometry: THREE.PlaneGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;

  constructor() {
    this.geometry = new THREE.PlaneGeometry(2, 2);
    this.geometry.rotateX(-Math.PI / 2);
    this.material = createRingMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    // Over the blob shadows, so a ring reads on top of its own unit's shadow.
    this.mesh.renderOrder = -4;
    this.mesh.visible = false;
    this.object.add(this.mesh);
  }

  /** Draw the ring at this placement, or hide it for `null`. */
  set(placement: RingPlacement | null): void {
    this.mesh.visible = placement !== null;
    if (!placement) return;
    const u = this.material.uniforms;
    (u.uCentre.value as THREE.Vector3).set(placement.x, placement.y, placement.z);
    u.uRadius.value = placement.radius;
    (u.uCorners.value as THREE.Vector4).fromArray(placement.corners);
    (u.uColour.value as THREE.Color).setHex(placement.colour, THREE.SRGBColorSpace);
  }

  /** Hide the ring; nothing carries across a zone change. */
  clear(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

export function createRingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCentre: { value: new THREE.Vector3() },
      uRadius: { value: 1 },
      uCorners: { value: new THREE.Vector4() },
      uColour: { value: new THREE.Color(1, 1, 1) },
      uDiscOpacity: { value: RING_FILL_OPACITY },
      uLinePx: { value: RING_LINE_PX },
    },
    vertexShader: `
      uniform vec3 uCentre;
      uniform float uRadius;
      // Corner heights in QUAD_CORNERS order, blended across the square.
      uniform vec4 uCorners;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        float lift = mix(mix(uCorners.x, uCorners.y, uv.x),
                         mix(uCorners.z, uCorners.w, uv.x), uv.y);
        vec3 world = uCentre + vec3(position.x * uRadius, lift, position.z * uRadius);
        gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
      }
    `,
    fragmentShader: `
      precision mediump float;
      uniform vec3 uColour;
      uniform float uDiscOpacity;
      uniform float uLinePx;
      varying vec2 vUv;

      void main() {
        // 0 at the centre, 1 at the rim.
        float d = length(vUv - 0.5) * 2.0;
        // One screen pixel in the same units, so the outline keeps its width
        // however near or far the ring is and however the pop has sized it.
        float px = max(fwidth(d), 1e-4);
        float inside = 1.0 - smoothstep(1.0 - px, 1.0, d);
        float line = smoothstep(1.0 - (uLinePx + 1.0) * px, 1.0 - uLinePx * px, d);
        float a = inside * mix(uDiscOpacity, 1.0, line);
        gl_FragColor = vec4(uColour, a);
        // A raw ShaderMaterial must encode its own output colour space.
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
