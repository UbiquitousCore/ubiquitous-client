import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import type { EffectCurve, EffectVec3 } from '../src/assets/types';
import { curveAt, curveEnd, curveVec3At } from '../src/renderer/effectCurves';
import {
  jittered,
  launchDirection,
  radialDirection,
  seededRandom,
  spawnPosition,
  type Random,
} from '../src/renderer/emitterSpawn';
import { makeSection, RIBBON_ALPHA, RibbonGeometry, widenPath } from '../src/renderer/ribbonStrip';

const keys = (loop: boolean, ...k: Array<[number, number]>): EffectCurve<number> => ({
  loop,
  keys: k.map(([frame, value]) => ({ frame, value })),
});

/** A repeatable stand-in for Math.random. */
function seeded(seed = 1): Random {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('curve sampling', () => {
  it('blends in a straight line between keys, at fractional frames', () => {
    const c = keys(false, [0, 0], [10, 255]);
    expect(curveAt(c, 5)).toBeCloseTo(127.5, 6);
    expect(curveAt(c, 2.5)).toBeCloseTo(63.75, 6);
  });

  it('holds the first value before the first key and the last after the last', () => {
    const c = keys(false, [5, 2], [10, 4]);
    expect(curveAt(c, 0)).toBe(2);
    expect(curveAt(c, 99)).toBe(4);
  });

  it('lands exactly on each key', () => {
    const c = keys(false, [0, 1], [3, 7], [9, -2]);
    expect([0, 3, 9].map(f => curveAt(c, f))).toEqual([1, 7, -2]);
  });

  it('gives the fallback for a curve with no keys', () => {
    expect(curveAt({ loop: false, keys: [] }, 3, 1)).toBe(1);
  });

  it("repeats a looping curve with the last key as the next pass's first", () => {
    const c = keys(true, [0, 1], [2, 3]);
    expect(curveAt(c, 1)).toBe(2);
    expect(curveAt(c, 2)).toBe(1); // the next pass starts on the last key's frame
    expect(curveAt(c, 3)).toBe(2);
    expect(curveAt(c, 4)).toBe(1);
  });

  it('closes a loop that ends on its first value without a seam', () => {
    const c = keys(true, [0, 0], [4, 8], [8, 0]);
    expect(curveAt(c, 7)).toBe(2);
    expect(curveAt(c, 8)).toBe(0);
    expect(curveAt(c, 9)).toBe(2);
  });

  it('does not freeze a two-key loop on either value', () => {
    const c = keys(true, [0, 1], [4, 5]);
    expect(curveAt(c, 2)).toBe(3);
    expect(curveAt(c, 6)).toBe(3);
  });

  it('holds a loop whose keys all sit on one frame', () => {
    const c = keys(true, [3, 1], [3, 5]);
    expect(Number.isFinite(curveAt(c, 10))).toBe(true);
  });

  it('blends vectors per component', () => {
    const c: EffectCurve<EffectVec3> = {
      loop: false,
      keys: [
        { frame: 0, value: [0, 0, 0] },
        { frame: 4, value: [4, -8, 2] },
      ],
    };
    expect(curveVec3At(c, 1, new THREE.Vector3()).toArray()).toEqual([1, -2, 0.5]);
  });

  it('knows where a curve ends', () => {
    expect(curveEnd(keys(false, [0, 1], [30, 0]))).toBe(30);
    expect(curveEnd({ loop: false, keys: [] })).toBe(0);
  });
});

describe('spawn shapes', () => {
  const size = new THREE.Vector3(2, 3, 2);
  const pos = new THREE.Vector3();
  const out = new THREE.Vector3();
  const slot = { index: 0, count: 1 };

  it('puts every point-born particle at the origin, with no outward direction', () => {
    spawnPosition('point', size, 0, slot, seeded(), pos, out);
    expect(pos.length()).toBe(0);
    expect(out.length()).toBe(0);
  });

  it('keeps sphere births inside the ellipsoid and outside its hollow', () => {
    const random = seeded(7);
    for (let i = 0; i < 200; i++) {
      spawnPosition('sphere', size, 0.5, slot, random, pos, out);
      const r = Math.hypot(pos.x / size.x, pos.y / size.y, pos.z / size.z);
      expect(r).toBeLessThanOrEqual(1 + 1e-9);
      expect(r).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(out.length()).toBeCloseTo(1, 6);
    }
  });

  it('puts a fully hollow sphere on its surface', () => {
    spawnPosition('sphere', new THREE.Vector3(4, 4, 4), 1, slot, seeded(3), pos, out);
    expect(pos.length()).toBeCloseTo(4, 6);
  });

  it('lays a disc flat on the ground plane, ignoring its Y size', () => {
    const random = seeded(11);
    for (let i = 0; i < 100; i++) {
      spawnPosition('disc', size, 0, { index: i, count: 100 }, random, pos, out);
      expect(pos.y).toBe(0);
      expect(Math.hypot(pos.x / size.x, pos.z / size.z)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('turns a hollow disc into a ring', () => {
    const random = seeded(5);
    for (let i = 0; i < 50; i++) {
      spawnPosition(
        'disc',
        new THREE.Vector3(1, 0, 1),
        1,
        { index: i, count: 50 },
        random,
        pos,
        out,
      );
      expect(Math.hypot(pos.x, pos.z)).toBeCloseTo(1, 6);
    }
  });

  it('gives each particle of a burst its own sector of a disc, at a random bearing inside it', () => {
    const count = 6;
    const sector = 360 / count;
    const offsets: number[] = [];
    const random = seeded(7);
    for (let i = 0; i < count; i++) {
      spawnPosition('disc', new THREE.Vector3(1, 0, 1), 1, { index: i, count }, random, pos, out);
      const degrees = ((Math.atan2(pos.z, pos.x) * 180) / Math.PI + 360) % 360;
      expect(degrees).toBeGreaterThanOrEqual(i * sector - 1e-9);
      expect(degrees).toBeLessThan((i + 1) * sector);
      offsets.push(degrees - i * sector);
    }
    // Not fixed spokes: the place inside each sector varies.
    expect(new Set(offsets.map(o => o.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('fills a box and treats a zero-size box as a point', () => {
    const random = seeded(9);
    for (let i = 0; i < 50; i++) {
      spawnPosition('box', new THREE.Vector3(2, 4, 6), 0, slot, random, pos, out);
      expect(Math.abs(pos.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(pos.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(pos.z)).toBeLessThanOrEqual(3);
    }
    spawnPosition('box', new THREE.Vector3(), 0, slot, random, pos, out);
    expect(pos.length()).toBe(0);
    expect(out.length()).toBe(0);
  });
});

describe('launch direction', () => {
  const up = new THREE.Vector3(0, 1, 0);
  const none = new THREE.Vector3();

  it('goes straight along the aim with no spread', () => {
    const d = launchDirection(new THREE.Vector3(0, 5, 0), 0, none, seeded(), new THREE.Vector3());
    expect(d.toArray()).toEqual([0, 1, 0]);
  });

  it('falls back to straight up for a zero aim', () => {
    const d = launchDirection(new THREE.Vector3(), 0, none, seeded(), new THREE.Vector3());
    expect(d.toArray()).toEqual([0, 1, 0]);
  });

  it('stays inside the spread cone', () => {
    const random = seeded(21);
    const spread = (30 * Math.PI) / 180;
    for (let i = 0; i < 200; i++) {
      const d = launchDirection(up, spread, none, random, new THREE.Vector3());
      expect(d.length()).toBeCloseTo(1, 6);
      expect(d.angleTo(up)).toBeLessThanOrEqual(spread + 1e-6);
    }
  });

  it('reaches every direction at a spread of 180 degrees', () => {
    const random = seeded(4);
    let down = 0;
    for (let i = 0; i < 400; i++)
      if (launchDirection(up, Math.PI, none, random, new THREE.Vector3()).y < 0) down++;
    expect(down).toBeGreaterThan(120);
  });

  it('leans outward through the birth point', () => {
    const random = seeded(8);
    const outward = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < 50; i++) {
      const d = launchDirection(up, Math.PI / 4, outward, random, new THREE.Vector3());
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(Math.abs(d.z)).toBeLessThan(1e-9);
    }
  });

  it('launches radially along the outward direction, or at random from a point', () => {
    const r = radialDirection(new THREE.Vector3(0, 0, 1), seeded(), new THREE.Vector3());
    expect(r.toArray()).toEqual([0, 0, 1]);
    const p = radialDirection(new THREE.Vector3(), seeded(2), new THREE.Vector3());
    expect(p.length()).toBeCloseTo(1, 6);
  });
});

describe('jitter', () => {
  const draws = (base: number, percent: number, seed: number, n = 2000) => {
    const random = seeded(seed);
    return Array.from({ length: n }, () => jittered(base, percent, random));
  };

  it('spreads a value both ways, within the percentage of it', () => {
    const seen = draws(10, 20, 12);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...seen)).toBeLessThanOrEqual(12);
    expect(Math.min(...seen)).toBeLessThan(8.5);
    expect(Math.max(...seen)).toBeGreaterThan(11.5);
    const mean = seen.reduce((a, b) => a + b, 0) / seen.length;
    expect(mean).toBeCloseTo(10, 1);
  });

  it('reads the percentage by its size, whatever its sign', () => {
    expect(draws(10, -30, 3, 50)).toEqual(draws(10, 30, 3, 50));
  });

  it('keeps most values near the base, fewer toward the edges', () => {
    // Three in four inside the middle half of the band.
    const inner = draws(10, 40, 5).filter(v => Math.abs(v - 10) < 2).length / 2000;
    expect(inner).toBeGreaterThan(0.7);
    expect(inner).toBeLessThan(0.8);
  });

  it('never carries a value across zero', () => {
    expect(Math.min(...draws(10, 150, 7))).toBeGreaterThanOrEqual(0);
    expect(Math.max(...draws(-10, 150, 7))).toBeLessThanOrEqual(0);
  });

  it('leaves a value alone at zero', () => {
    expect(jittered(7, 0, () => 0.9)).toBe(7);
  });
});

describe('ribbon strip', () => {
  function sections(n: number) {
    return Array.from({ length: n }, (_, i) => {
      const s = makeSection();
      s.a.set(i, 0, 0);
      s.b.set(i, 1, 0);
      s.alpha = 1 - i / n;
      return s;
    });
  }

  it('joins neighbouring sections with one quad each', () => {
    const ribbon = new RibbonGeometry(8);
    expect(ribbon.write(sections(5))).toBe(4);
    expect(ribbon.geometry.drawRange.count).toBe(4 * 6);
    ribbon.dispose();
  });

  it('draws nothing from a single section', () => {
    const ribbon = new RibbonGeometry(8);
    expect(ribbon.write(sections(1))).toBe(0);
    expect(ribbon.geometry.drawRange.count).toBe(0);
    ribbon.dispose();
  });

  it('runs the texture along the strip and across it', () => {
    const ribbon = new RibbonGeometry(4);
    ribbon.write(sections(3));
    const uv = ribbon.geometry.getAttribute('uv');
    expect([uv.getX(0), uv.getY(0), uv.getY(1), uv.getX(2), uv.getX(4)]).toEqual([0, 0, 1, 0.5, 1]);
    ribbon.dispose();
  });

  it('carries each section opacity to both of its vertices', () => {
    const ribbon = new RibbonGeometry(4);
    ribbon.write(sections(2));
    const a = ribbon.geometry.getAttribute(RIBBON_ALPHA);
    expect([a.getX(0), a.getX(1), a.getX(2), a.getX(3)]).toEqual([1, 1, 0.5, 0.5]);
    ribbon.dispose();
  });

  it('never writes past its capacity', () => {
    const ribbon = new RibbonGeometry(3);
    expect(ribbon.write(sections(10))).toBe(2);
    ribbon.dispose();
  });

  it('widens a line to face the eye', () => {
    const points = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(2, 0, 0),
    ];
    const out = points.map(() => makeSection());
    widenPath(points, () => 0.5, new THREE.Vector3(1, 0, 10), new THREE.Vector3(0, 1, 0), out);
    for (const s of out) {
      // Across the line, perpendicular to the view: along Y here.
      expect(s.a.distanceTo(s.b)).toBeCloseTo(1, 6);
      expect(Math.abs(s.b.y - s.a.y)).toBeCloseTo(1, 6);
    }
  });

  it('keeps a fixed orientation without an eye', () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 1)];
    const out = points.map(() => makeSection());
    widenPath(points, i => i + 1, null, new THREE.Vector3(0, 1, 0), out);
    // A line along Z with the Y normal widens along X, by each half-width.
    expect(Math.abs(out[0]!.b.x - out[0]!.a.x)).toBeCloseTo(2, 6);
    expect(Math.abs(out[1]!.b.x - out[1]!.a.x)).toBeCloseTo(4, 6);
  });
});

describe('seeded draws', () => {
  it('replays the same sequence for the same key and a different one for another', () => {
    const run = (key: string) => {
      const random = seededRandom(key);
      return Array.from({ length: 8 }, () => random());
    };
    expect(run('fx.beff#0')).toEqual(run('fx.beff#0'));
    expect(run('fx.beff#1')).not.toEqual(run('fx.beff#0'));
    for (const v of run('fx.beff#0')) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
