/**
 * A textured strip through cross-sections (two points and an opacity each),
 * from a swept weapon pair or a widened centre line (`widenPath`).
 */

import * as THREE from 'three';

export interface RibbonSection {
  a: THREE.Vector3;
  b: THREE.Vector3;
  alpha: number;
}

/** A ribbon section with its own vectors, for pooling. */
export function makeSection(): RibbonSection {
  return { a: new THREE.Vector3(), b: new THREE.Vector3(), alpha: 1 };
}

/** Default name of the per-vertex opacity attribute. */
export const RIBBON_ALPHA = 'ribbonAlpha';

/**
 * The strip geometry, sized once for `capacity` sections. `write` fills it and
 * sets the draw range; the buffers are reused from frame to frame.
 */
export class RibbonGeometry {
  readonly geometry = new THREE.BufferGeometry();
  private readonly position: THREE.BufferAttribute;
  private readonly uv: THREE.BufferAttribute;
  private readonly alpha: THREE.BufferAttribute;

  constructor(
    readonly capacity: number,
    alphaName = RIBBON_ALPHA,
  ) {
    const vertices = capacity * 2;
    this.position = new THREE.BufferAttribute(new Float32Array(vertices * 3), 3);
    this.uv = new THREE.BufferAttribute(new Float32Array(vertices * 2), 2);
    this.alpha = new THREE.BufferAttribute(new Float32Array(vertices), 1);
    for (const a of [this.position, this.uv, this.alpha]) a.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('uv', this.uv);
    this.geometry.setAttribute(alphaName, this.alpha);

    const quads = Math.max(0, capacity - 1);
    const index = new Uint32Array(quads * 6);
    for (let i = 0; i < quads; i++) {
      const v = i * 2;
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
    this.geometry.setIndex(new THREE.BufferAttribute(index, 1));
    this.geometry.setDrawRange(0, 0);
  }

  /** Writes the first `count` sections (at most `capacity`); returns quads drawn. */
  write(sections: readonly RibbonSection[], count = sections.length): number {
    const n = Math.min(count, this.capacity, sections.length);
    const pos = this.position.array as Float32Array;
    const uv = this.uv.array as Float32Array;
    const alp = this.alpha.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const s = sections[i]!;
      const u = n > 1 ? i / (n - 1) : 0;
      const v = i * 2;
      s.a.toArray(pos, v * 3);
      s.b.toArray(pos, v * 3 + 3);
      uv.set([u, 0, u, 1], v * 2);
      alp[v] = s.alpha;
      alp[v + 1] = s.alpha;
    }
    for (const a of [this.position, this.uv, this.alpha]) a.needsUpdate = true;
    const quads = n > 1 ? n - 1 : 0;
    this.geometry.setDrawRange(0, quads * 6);
    if (quads > 0) this.geometry.computeBoundingSphere();
    return quads;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const tangent = new THREE.Vector3();
const across = new THREE.Vector3();
const view = new THREE.Vector3();

/** Widen a centre line into sections; with `eye` they face it, else they lie in the plane holding `normal`. */
export function widenPath(
  points: readonly THREE.Vector3[],
  halfWidth: (i: number) => number,
  eye: THREE.Vector3 | null,
  normal: THREE.Vector3,
  out: RibbonSection[],
): void {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(n - 1, i + 1)]!;
    tangent.subVectors(next, prev);
    if (tangent.lengthSq() < 1e-12) tangent.set(1, 0, 0);
    if (eye) view.subVectors(eye, p);
    else view.copy(normal);
    across.crossVectors(tangent, view);
    if (across.lengthSq() < 1e-12)
      across.crossVectors(tangent, Math.abs(tangent.y) < 0.9 ? UP : RIGHT);
    across.normalize().multiplyScalar(halfWidth(i));
    out[i]!.a.copy(p).sub(across);
    out[i]!.b.copy(p).add(across);
  }
}
