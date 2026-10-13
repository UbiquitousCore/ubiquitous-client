/**
 * Which queued entity gets built next: the nearest.
 *
 * The attach queue is drained with `pop()`, which takes the *end* of the
 * array, so it is sorted farthest-first. Sorted the other way, every frame
 * would serve the sixteen *farthest* queued entities, and the player, at the
 * front, would be built last — after every other candidate inside the
 * 240-unit radius, which in a dense area is tens of thousands of entities.
 */

import { describe, expect, it } from 'vitest';

import { fillCandidates, orderForPop } from '../src/renderer/attachOrder';
import type { Positioned } from '../src/renderer/attachOrder';

const EYE = { x: 0, y: 0, z: 0 };

/** An entity `d` units away, named so the order can be read back. */
const at = (name: string, d: number): Positioned & { name: string } => ({
  name,
  position: [d, 0, 0],
});

/** Drain the queue the way `drainAttachQueue` does. */
function drain<T extends Positioned & { name: string }>(queue: T[]): string[] {
  const out: string[] = [];
  while (queue.length > 0) out.push(queue.pop()!.name);
  return out;
}

describe('orderForPop', () => {
  it('serves the nearest first when the queue is popped', () => {
    const queue = [at('far', 100), at('near', 1), at('mid', 50)];
    orderForPop(queue, EYE);
    expect(drain(queue)).toEqual(['near', 'mid', 'far']);
  });

  it('serves the player before anything else in a full queue', () => {
    // The player at the origin, claimed first, with a window's worth of
    // scenery behind it.
    const queue: Array<Positioned & { name: string }> = [at('player', 0)];
    for (let i = 1; i <= 200; i++) queue.push(at(`scenery${i}`, i));
    orderForPop(queue, EYE);

    expect(queue.pop()!.name).toBe('player');
  });

  it('measures from the eye, not from the origin', () => {
    // Standing at (100, 0, 0): what was farthest from the origin is nearest.
    const queue = [at('a', 0), at('b', 90), at('c', 40)];
    orderForPop(queue, { x: 100, y: 0, z: 0 });
    expect(drain(queue)).toEqual(['b', 'c', 'a']);
  });

  it('measures in three dimensions, not along the ground', () => {
    const queue: Array<Positioned & { name: string }> = [
      { name: 'overhead', position: [0, 30, 0] },
      { name: 'beside', position: [3, 0, 4] },
    ];
    orderForPop(queue, EYE);
    expect(drain(queue)).toEqual(['beside', 'overhead']);
  });

  it('handles an empty or single-item queue', () => {
    const empty: Positioned[] = [];
    orderForPop(empty, EYE);
    expect(empty).toEqual([]);

    const one = [at('only', 5)];
    orderForPop(one, EYE);
    expect(drain(one)).toEqual(['only']);
  });
});

describe('fillCandidates', () => {
  it('takes only what is unbuilt and within reach, nearest popped first', () => {
    const out = [at('stale', 1)];
    const built = new Set(['built']);
    fillCandidates(
      out,
      [at('far', 90), at('built', 2), at('beyond', 101), at('near', 3)],
      item => built.has(item.name),
      EYE,
      100,
    );
    expect(drain(out)).toEqual(['near', 'far']);
  });

  it('measures reach in three dimensions, as the draw distance does', () => {
    const out: Array<Positioned & { name: string }> = [];
    const high = { name: 'high', position: [60, 90, 0] as [number, number, number] };
    fillCandidates(out, [high], () => false, EYE, 100);
    expect(out).toEqual([]);
  });
});
