/**
 * Zone fog: the numbers, not the drawing.
 *
 * A zone that specifies no fog must never become a fog whose near equals its
 * far, which fogs everything past the camera solid.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  HAZE_MIN_FAR,
  SUBMERGE_BLEND_MS,
  UNDERWATER_FAR,
  UNDERWATER_NEAR,
  ZONE_BLEND_MS,
  ZoneFog,
  reachFor,
} from '../src/renderer/ZoneFog';

const DRAW_DISTANCE = 300;

function atmos(fogNear: number, fogFar: number, rgb: [number, number, number] = [0.5, 0.6, 0.7]) {
  return { fogColor: rgb, fogNear, fogFar, skybox: null };
}

describe('how far a zone fog reaches', () => {
  it('pushes haze most of the way to the draw distance, never all of it', () => {
    const far = reachFor(40, 90, DRAW_DISTANCE, 0);
    expect(far).toBeGreaterThan(90);
    expect(far).toBeLessThan(DRAW_DISTANCE);
  });

  it('reaches further as more is drawn', () => {
    expect(reachFor(40, 90, 240, 0.5)).toBeLessThan(reachFor(40, 90, DRAW_DISTANCE, 0.5));
  });

  it('leaves the far ground of a forest mostly hazed, so its peaks read as far off', () => {
    // Arcadian Forest's own fog, at a 240-unit draw distance:
    // the ranges round it stand 155 units and more from the road.
    const far = reachFor(25, 90, 240);
    expect((155 - 25) / (far - 25)).toBeGreaterThan(0.85);
  });

  it('keeps the zone’s own distances at the heaviest fog, and reaches further as it lightens', () => {
    expect(reachFor(25, 90, 240, 1)).toBe(90);
    expect(reachFor(25, 90, 240, 0)).toBeGreaterThan(reachFor(25, 90, 240, 0.5));
    // Never all the way: the last stretch before models stop is fogged.
    expect(reachFor(25, 90, 240, 0)).toBeLessThan(240);
  });

  it('keeps murk at the zone’s own distances', () => {
    expect(reachFor(4, HAZE_MIN_FAR - 1, DRAW_DISTANCE)).toBe(HAZE_MIN_FAR - 1);
  });

  it('ends a fog that reaches past the draw distance before the cutoff', () => {
    expect(reachFor(50, DRAW_DISTANCE + 50, DRAW_DISTANCE)).toBeLessThan(DRAW_DISTANCE);
  });
});

describe('adopting a zone', () => {
  it('leaves the current fog alone when the zone specifies none', () => {
    const fog = new ZoneFog();
    fog.adopt(atmos(45, 260), DRAW_DISTANCE);
    const before = fog.current;

    expect(fog.adopt(atmos(0, 0), DRAW_DISTANCE)).toBeNull();
    expect(fog.current).toEqual(before);
  });

  it('shows the first zone at once', () => {
    const fog = new ZoneFog();
    expect(fog.ready).toBe(false);

    fog.adopt(atmos(45, 260, [0.25, 0.5, 0.75]), DRAW_DISTANCE);

    expect(fog.ready).toBe(true);
    expect(fog.current.near).toBe(45);
    expect(fog.current.far).toBe(reachFor(45, 260, DRAW_DISTANCE));
    expect(fog.current.color.getHex()).toBe(
      new THREE.Color().setRGB(0.25, 0.5, 0.75, THREE.SRGBColorSpace).getHex(),
    );
  });

  it('puts the zone’s colour on screen as written, not as linear light', () => {
    const fog = new ZoneFog();
    fog.adopt(atmos(45, 260, [0x40 / 255, 0x80 / 255, 0xbf / 255]), DRAW_DISTANCE);
    expect(fog.current.color.getHexString(THREE.SRGBColorSpace)).toBe('4080bf');
  });

  it('blends into every zone after the first, from what is on screen', () => {
    const fog = new ZoneFog();
    fog.adopt(atmos(45, 260), DRAW_DISTANCE);

    fog.adopt(atmos(10, 40, [0, 0, 0]), DRAW_DISTANCE);
    // Adopting does not change what is shown; the steps do.
    expect(fog.current.near).toBe(45);

    const halfway = fog.step(ZONE_BLEND_MS / 2 / 1000, false)!;
    expect(halfway.near).toBeCloseTo((45 + 10) / 2, 6);

    const early = new ZoneFog();
    early.adopt(atmos(45, 260), DRAW_DISTANCE);
    early.adopt(atmos(10, 40, [0, 0, 0]), DRAW_DISTANCE);
    // Eased: the first tenth of the time covers much less than a tenth of the way.
    const tenth = early.step(ZONE_BLEND_MS / 10 / 1000, false)!;
    expect(45 - tenth.near).toBeLessThan((45 - 10) / 10);

    const done = fog.step(ZONE_BLEND_MS / 1000, false)!;
    expect(done.near).toBeCloseTo(10, 6);
    expect(done.far).toBeCloseTo(40, 6);
    expect(done.color.getHex()).toBe(0x000000);
  });

  it('restarts from wherever a blend had got to', () => {
    const fog = new ZoneFog();
    fog.adopt(atmos(45, 260), DRAW_DISTANCE);
    fog.adopt(atmos(10, 40), DRAW_DISTANCE);
    const midway = fog.step(ZONE_BLEND_MS / 2 / 1000, false)!.near;

    // Crossing back before the blend ends must not jump.
    fog.adopt(atmos(45, 260), DRAW_DISTANCE);
    const next = fog.step(1 / 60, false)!.near;
    expect(Math.abs(next - midway)).toBeLessThan(0.5);
  });
});

describe('going under water and back', () => {
  it('closes in quickly under water and opens out on the zone’s blend', () => {
    const fog = new ZoneFog();
    fog.adopt(atmos(45, 260), DRAW_DISTANCE);
    const zoneFar = fog.current.far;

    const under = fog.step(SUBMERGE_BLEND_MS / 1000, true)!;
    expect(under.near).toBeCloseTo(UNDERWATER_NEAR, 6);
    expect(under.far).toBeCloseTo(UNDERWATER_FAR, 6);

    // The same time out of the water is only part of the way back.
    const surfacing = fog.step(SUBMERGE_BLEND_MS / 1000, false)!;
    expect(surfacing.far).toBeGreaterThan(UNDERWATER_FAR);
    expect(surfacing.far).toBeLessThan(zoneFar);

    const settled = fog.step(ZONE_BLEND_MS / 1000, false)!;
    expect(settled.near).toBeCloseTo(45, 6);
    expect(settled.far).toBeCloseTo(zoneFar, 6);
  });

  it('holds a zone crossed under water until the camera surfaces', () => {
    const fog = new ZoneFog();
    fog.adopt(atmos(45, 260), DRAW_DISTANCE);
    fog.step(1, true);

    fog.adopt(atmos(10, 40), DRAW_DISTANCE);
    expect(fog.step(1, true)!.far).toBeCloseTo(UNDERWATER_FAR, 6);

    fog.step(0, false);
    expect(fog.step(ZONE_BLEND_MS / 1000, false)!.far).toBeCloseTo(40, 6);
  });

  it('says nothing until a zone has been adopted', () => {
    expect(new ZoneFog().step(1 / 60, false)).toBeNull();
  });
});

describe('the values it hands back', () => {
  it('are copies, so a caller cannot write into the blend', () => {
    const fog = new ZoneFog();
    const adopted = fog.adopt(atmos(45, 260, [0.25, 0.5, 0.75]), DRAW_DISTANCE);

    adopted!.color.setRGB(1, 0, 0);
    fog.current.color.setRGB(1, 0, 0);

    expect(fog.current.color.getHex()).toBe(
      new THREE.Color().setRGB(0.25, 0.5, 0.75, THREE.SRGBColorSpace).getHex(),
    );
  });
});
