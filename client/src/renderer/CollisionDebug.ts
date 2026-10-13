/** Collision wireframe overlay (green floor / red wall / yellow other).
 * Reads plain arrays from world/; builds Three objects here only. */

import * as THREE from 'three';
import type { CollisionWorld, SurfaceKind } from '../world/CollisionWorld';

const COLOURS: Record<SurfaceKind, [number, number, number]> = {
  floor: [0.25, 1.0, 0.35],
  wall: [1.0, 0.25, 0.25],
  other: [1.0, 0.85, 0.2],
};

export interface CollisionDebugStats {
  triangles: number;
}

/**
 * Build the wireframe. Returns null when there is no collision geometry.
 *
 * Every triangle contributes its three edges as line segments, coloured per
 * vertex, so one draw call covers the whole zone.
 */
export function buildCollisionWireframe(collision: CollisionWorld): {
  object: THREE.LineSegments;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  stats: CollisionDebugStats;
} | null {
  const { positions, kinds } = collision.debugTriangles();
  const count = kinds.length;
  if (count === 0) return null;

  // Three edges per triangle, two endpoints each.
  const verts = new Float32Array(count * 18);
  const colours = new Float32Array(count * 18);
  const edges = [0, 1, 1, 2, 2, 0];

  let o = 0;
  for (let t = 0; t < count; t++) {
    const base = t * 9;
    const [r, g, b] = COLOURS[kinds[t]];
    for (const corner of edges) {
      const p = base + corner * 3;
      verts[o] = positions[p];
      verts[o + 1] = positions[p + 1];
      verts[o + 2] = positions[p + 2];
      colours[o] = r;
      colours[o + 1] = g;
      colours[o + 2] = b;
      o += 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));

  // Depth-tested but not depth-written, so the wireframe reads as an overlay
  // on the models it is meant to be checked against rather than fighting them.
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    fog: false,
  });

  const object = new THREE.LineSegments(geometry, material);
  object.frustumCulled = false;
  object.renderOrder = 999;
  object.name = 'collision-debug';

  return { object, geometry, material, stats: { triangles: count } };
}
