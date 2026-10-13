/**
 * Bars drawn as a run of a clip's faces: where the runs of a clip are, and
 * which face a share of a bar wears.
 */

import { describe, expect, it } from 'vitest';

import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { barRun, faceFor, runsOf, shareOf } from '../../src/ui/art/faceRuns';

const still = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
const put = (depth: number, characterId: number | null, clipDepth?: number): UiSkinPlaced => ({
  depth,
  characterId,
  matrix: still,
  name: null,
  opacity: 1,
  ...(clipDepth ? { clipDepth } : {}),
});

/** A clip of `count` faces that places art at depth 3 on the given faces. */
function clip(count: number, fills: Record<number, number>, extra: UiSkinData['sprites'] = []) {
  const frames: UiSkinPlaced[][] = Array.from({ length: count }, (_, at) => [
    // The mask turns every face; it is not the fill.
    at === 0 ? put(1, 90, 4) : put(1, null),
    ...(fills[at] !== undefined ? [put(3, fills[at]!)] : []),
  ]);
  return {
    shapes: [],
    sprites: [{ id: 10, frameCount: count, frames }, ...extra],
  } as unknown as UiSkinData;
}

describe('runsOf', () => {
  it('reads a clip that places its fill once as one run over every face', () => {
    expect(runsOf(clip(51, { 0: 70 }), 10)).toEqual([{ first: 0, last: 50 }]);
  });

  it('starts a new run wherever the clip places different art for its fill', () => {
    expect(runsOf(clip(12, { 0: 70, 4: 71, 8: 72 }), 10)).toEqual([
      { first: 0, last: 3 },
      { first: 4, last: 7 },
      { first: 8, last: 11 },
    ]);
  });

  it('keeps one run where the clip places the same art again, however it is wrapped', () => {
    // A one-face clip holding a single shape is that shape.
    const wrappers = [
      { id: 80, frameCount: 1, frames: [[put(1, 71)]] },
      { id: 81, frameCount: 1, frames: [[put(1, 71)]] },
    ];
    expect(runsOf(clip(12, { 0: 70, 4: 80, 7: 81, 8: 72 }, wrappers), 10)).toEqual([
      { first: 0, last: 3 },
      { first: 4, last: 7 },
      { first: 8, last: 11 },
    ]);
  });

  it('keeps a single face of different art on the end of the run before it', () => {
    // The empty face wearing a cap of its own is still the same bar.
    expect(runsOf(clip(8, { 0: 70, 7: 71 }), 10)).toEqual([{ first: 0, last: 7 }]);
  });

  it('has no runs for art that is not a clip of more than one face', () => {
    expect(runsOf(clip(1, { 0: 70 }), 10)).toEqual([]);
    expect(runsOf(clip(8, { 0: 70 }), 99)).toEqual([]);
  });
});

describe('faceFor', () => {
  const run = { first: 0, last: 50 };

  it('wears the full end for a full bar and the other end for an empty one', () => {
    expect(faceFor(1, run)).toBe(0);
    expect(faceFor(0, run)).toBe(50);
    expect(faceFor(1, run, 'last')).toBe(50);
    expect(faceFor(0, run, 'last')).toBe(0);
  });

  it('rounds a share to the nearest face', () => {
    expect(faceFor(0.51, run)).toBe(24);
    expect(faceFor(0.5, { first: 0, last: 49 }, 'last')).toBe(25);
  });

  it('keeps a bar with anything in it off its empty face, and one short of full off its full face', () => {
    expect(faceFor(0.001, run)).toBe(49);
    expect(faceFor(0.99, run)).toBe(1);
    expect(faceFor(0.001, run, 'last')).toBe(1);
  });

  it('counts within its own run of a longer clip', () => {
    const second = { first: 60, last: 100 };
    expect(faceFor(1, second)).toBe(60);
    expect(faceFor(0, second)).toBe(100);
    expect(faceFor(0.5, second)).toBe(80);
  });

  it('reads a share that is not a number as empty, and holds any other inside the bar', () => {
    expect(faceFor(Number.NaN, run)).toBe(50);
    expect(faceFor(3, run)).toBe(0);
    expect(faceFor(-1, run)).toBe(50);
  });
});

describe('shareOf', () => {
  it('is how much of the most there is, held between none and all', () => {
    expect(shareOf(30, 40)).toBe(0.75);
    expect(shareOf(50, 40)).toBe(1);
    expect(shareOf(-5, 40)).toBe(0);
  });

  it('is none where there is nothing to measure against', () => {
    expect(shareOf(5, 0)).toBe(0);
    expect(shareOf(5, Number.NaN)).toBe(0);
  });
});

describe('barRun', () => {
  const bars = {
    frames: 50,
    of: {},
    runs: {
      'row/hp': [
        { first: 0, last: 50 },
        { first: 60, last: 100 },
      ],
    },
  };

  it('finds a bar by its path, and one of its runs by number', () => {
    expect(barRun(bars, 'row/hp')).toEqual({ first: 0, last: 50 });
    expect(barRun(bars, 'row/hp', 1)).toEqual({ first: 60, last: 100 });
  });

  it('falls back to the first run, and to the shared length where the clip was not read', () => {
    expect(barRun(bars, 'row/hp', 7)).toEqual({ first: 0, last: 50 });
    expect(barRun(bars, 'row/mp')).toEqual({ first: 0, last: 50 });
  });
});
