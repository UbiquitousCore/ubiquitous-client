/**
 * Closed shell or open card, from the edges alone.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { OPEN_MESH_FRACTION, isOpenGroup, openEdgeFraction } from '../src/renderer/meshOpenness';

/** A closed shell with every edge shared by two triangles, welded by position. */
function welded(g: THREE.BufferGeometry): ArrayLike<number> {
  // Three's primitives have seams (a face's own vertices), so weld by position.
  const pos = g.getAttribute('position');
  const ids = new Map<string, number>();
  const remap: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!ids.has(key)) ids.set(key, ids.size);
    remap.push(ids.get(key)!);
  }
  return Array.from(g.getIndex()!.array, i => remap[i]!);
}

const box = () => welded(new THREE.BoxGeometry(1, 1, 1));
const sphere = () => welded(new THREE.SphereGeometry(1, 16, 12));

describe('openEdgeFraction', () => {
  it('is zero for a closed shell', () => {
    expect(openEdgeFraction(box())).toBe(0);
  });

  it('is high for a lone strip, which is what a bow string or a hair card is', () => {
    // One quad, two triangles: four boundary edges, one shared.
    const strip = [0, 1, 2, 0, 2, 3];
    expect(openEdgeFraction(strip)).toBe(4 / 5);
    expect(isOpenGroup(strip, 0, 6)).toBe(true);
  });

  it('judges only the group it is asked about', () => {
    const closed = box();
    const strip = [100, 101, 102, 100, 102, 103];
    const all = [...Array.from(closed), ...strip];
    expect(isOpenGroup(all, 0, closed.length)).toBe(false);
    expect(isOpenGroup(all, closed.length, 6)).toBe(true);
  });

  it('leaves a sealed mesh with one stray gap culled', () => {
    // A sphere less one triangle: three more boundary edges among hundreds.
    // Three's sphere is not quite sealed at the poles even welded, which is
    // the point: a real mesh with a few stray gaps must stay culled.
    const whole = sphere();
    expect(openEdgeFraction(whole)).toBeLessThan(OPEN_MESH_FRACTION);
    const missing = Array.from(whole).slice(3);
    expect(openEdgeFraction(missing)).toBeGreaterThan(openEdgeFraction(whole));
    expect(openEdgeFraction(missing)).toBeLessThan(OPEN_MESH_FRACTION);
    expect(isOpenGroup(missing, 0, missing.length)).toBe(false);
  });
});
