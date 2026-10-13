/**
 * The ring under the selected unit: its size, its selection pop, where it
 * sits and what colour it is. `placeRing` is arithmetic over a fake world;
 * no GPU is involved.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  POP_MS,
  POP_START,
  RELATIONS,
  RING_COLOURS,
  RING_FILL_OPACITY,
  RING_LINE_PX,
  RING_MIN_RADIUS,
  TargetRing,
  placeRing,
  popScale,
  ringRadius,
} from '../src/renderer/TargetRing';
import type { RingWorld } from '../src/renderer/TargetRing';
import { DECAL_LIFT } from '../src/renderer/groundFit';
import { NAME_COLOURS } from '../src/renderer/nameLabels';

function flat(height = 0, swimming = false): RingWorld {
  return {
    groundPoint: () => ({ y: height, normal: [0, 1, 0] }),
    waterStateAt: () => ({ state: swimming ? 'swimming' : 'dry' }),
  };
}

const unit = {
  position: [10, 4, -6] as [number, number, number],
  scale: [1, 1, 1] as [number, number, number],
};
const BODY: [number, number] = [0.5, 0.3];

describe('size', () => {
  it('is wider than the body along its longer side', () => {
    expect(ringRadius(0.5, 0.3)).toBeGreaterThan(0.5);
    expect(ringRadius(0.3, 0.5)).toBe(ringRadius(0.5, 0.3));
  });

  it('never shrinks below a readable ring for a tiny body', () => {
    expect(ringRadius(0.02, 0.02)).toBe(RING_MIN_RADIUS);
  });

  it('grows with the body', () => {
    const big = placeRing(flat(), { ...unit, scale: [4, 4, 4] }, BODY, 'enemy', POP_MS);
    const small = placeRing(flat(), unit, BODY, 'enemy', POP_MS);
    expect(big!.radius).toBeGreaterThan(small!.radius * 2);
  });
});

describe('the selection pop', () => {
  it('starts small and settles on its full size', () => {
    expect(popScale(0)).toBeCloseTo(POP_START, 6);
    expect(popScale(POP_MS)).toBe(1);
    expect(popScale(POP_MS * 5)).toBe(1);
  });

  it('springs a little past full size before it settles', () => {
    let peak = 0;
    for (let t = 0; t <= POP_MS; t += 2) peak = Math.max(peak, popScale(t));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1.1);
  });

  it('comes to rest without a jump', () => {
    expect(Math.abs(popScale(POP_MS - 1) - 1)).toBeLessThan(0.001);
  });

  it('is applied to the ring', () => {
    const fresh = placeRing(flat(), unit, BODY, 'enemy', 0);
    const settled = placeRing(flat(), unit, BODY, 'enemy', POP_MS);
    expect(fresh!.radius).toBeCloseTo(settled!.radius * POP_START, 6);
  });
});

describe('placement', () => {
  it('sits on the ground under the body, not at its height', () => {
    const ring = placeRing(flat(2.5), unit, BODY, 'bystander', POP_MS);
    expect(ring).toMatchObject({ x: 10, z: -6 });
    expect(ring!.y).toBeCloseTo(2.5 + DECAL_LIFT, 6);
  });

  it('searches for ground from the height it is given', () => {
    const from: Array<number | undefined> = [];
    const world: RingWorld = {
      groundPoint: (_x, _z, fromY) => {
        from.push(fromY);
        return { y: 0, normal: [0, 1, 0] };
      },
      waterStateAt: () => ({ state: 'dry' }),
    };
    placeRing(world, unit, BODY, 'corpse', POP_MS, 1.25);
    expect(from[0]).toBe(1.25);
  });

  it('draws nothing for a swimming body, no target, or no model', () => {
    expect(placeRing(flat(0, true), unit, BODY, 'bystander', POP_MS)).toBeNull();
    expect(placeRing(flat(), null, BODY, 'bystander', POP_MS)).toBeNull();
    expect(placeRing(flat(), unit, undefined, 'bystander', POP_MS)).toBeNull();
    expect(placeRing(flat(), unit, [0, 0], 'bystander', POP_MS)).toBeNull();
  });

  it('lies flat on ground too steep to follow', () => {
    const steep: RingWorld = {
      groundPoint: x => ({ y: 3 * x, normal: [0.95, 0.31, 0] }),
      waterStateAt: () => ({ state: 'dry' }),
    };
    expect(placeRing(steep, unit, BODY, 'bystander', POP_MS)!.corners).toEqual([0, 0, 0, 0]);
  });
});

describe('colour', () => {
  it('gives every relation a colour of its own', () => {
    const relations = RELATIONS;
    const colours = relations.map(r => placeRing(flat(), unit, BODY, r, POP_MS)!.colour);
    expect(new Set(colours).size).toBe(relations.length);
    relations.forEach((r, i) => expect(colours[i]).toBe(RING_COLOURS[r]));
  });

  it('reads hostile as red, friendly as green, and the dead as grey', () => {
    const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const [hr, hg, hb] = rgb(RING_COLOURS['enemy']);
    expect(hr).toBeGreaterThan(hg * 3);
    expect(hr).toBeGreaterThan(hb * 3);
    const [fr, fg, fb] = rgb(RING_COLOURS['ally']);
    expect(fg).toBeGreaterThan(fr * 3);
    expect(fg).toBeGreaterThan(fb * 3);
    const [dr, dg, db] = rgb(RING_COLOURS['corpse']);
    expect(Math.max(dr, dg, db) - Math.min(dr, dg, db)).toBeLessThan(8);
  });

  it('draws a neutral ring in the yellow its name is written in', () => {
    const hex = `#${RING_COLOURS['bystander'].toString(16).padStart(6, '0')}`;
    expect(hex).toBe(NAME_COLOURS['bystander']);
    expect(hex).toBe('#fafa32');
  });

  it('rings a quest giver with a quest to hand in in pale green-blue', () => {
    expect(placeRing(flat(), unit, BODY, 'questUnit', POP_MS)!.colour).toBe(0x93f1ce);
  });

  it('rings a capturable creature in the purple its name is written in', () => {
    const hex = `#${RING_COLOURS['catchable'].toString(16).padStart(6, '0')}`;
    expect(hex).toBe(NAME_COLOURS['catchable']);
    expect(hex).toBe('#b766ec');
  });
});

describe('TargetRing', () => {
  it('shows only while it has a placement, in that placement’s colour', () => {
    const ring = new TargetRing();
    const mesh = ring.object.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.ShaderMaterial;
    expect(mesh.visible).toBe(false);
    ring.set(placeRing(flat(), unit, BODY, 'enemy', POP_MS));
    expect(mesh.visible).toBe(true);
    expect((material.uniforms.uColour.value as THREE.Color).getHex(THREE.SRGBColorSpace)).toBe(
      RING_COLOURS['enemy'],
    );
    ring.set(null);
    expect(mesh.visible).toBe(false);
    ring.dispose();
  });

  it('is a thin solid outline round a disc of the same colour, mostly clear', () => {
    const ring = new TargetRing();
    const mesh = ring.object.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.ShaderMaterial;
    expect(material.uniforms.uDiscOpacity.value).toBe(RING_FILL_OPACITY);
    expect(RING_FILL_OPACITY).toBeCloseTo(0.4, 6);
    expect(material.uniforms.uLinePx.value).toBe(RING_LINE_PX);
    expect(RING_LINE_PX).toBeGreaterThanOrEqual(1);
    expect(RING_LINE_PX).toBeLessThanOrEqual(2);
    // One colour for both: the outline and the fill are the same uniform.
    expect(material.fragmentShader).toContain('vec4(uColour, a)');
    expect(material.fragmentShader).not.toContain('texture2D');
    // Blended over the ground and the unit's own shadow, and never hiding
    // what is drawn after it.
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    ring.dispose();
  });

  it('draws a square the ring fits inside, fitted to the ground by its corners', () => {
    const ring = new TargetRing();
    const mesh = ring.object.children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const round = (v: THREE.Vector3) => v.toArray().map(n => Math.round(n * 1e6) / 1e6 + 0);
    expect(round(box.min)).toEqual([-1, 0, -1]);
    expect(round(box.max)).toEqual([1, 0, 1]);
    ring.dispose();
  });

  it('frees its geometry and material on dispose', () => {
    const ring = new TargetRing();
    const mesh = ring.object.children[0] as THREE.Mesh;
    const freed: string[] = [];
    mesh.geometry.addEventListener('dispose', () => freed.push('geometry'));
    (mesh.material as THREE.Material).addEventListener('dispose', () => freed.push('material'));
    ring.dispose();
    expect(freed.sort()).toEqual(['geometry', 'material']);
  });
});
