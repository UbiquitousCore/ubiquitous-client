import { describe, expect, it } from 'vitest';

import { keptSpeed } from '../src/renderer/EffectFactory';

describe('a speed scale affector', () => {
  it('keeps its own share of the speed each second', () => {
    expect(keptSpeed(0.94, 30)).toBeCloseTo(0.94, 6);
    expect(keptSpeed(1.36, 30)).toBeCloseTo(1.36, 6);
  });

  it('slows a particle over its life where the factor is under one', () => {
    // A marsh fog's own 0.94, over the two hundred frames its particles
    // live: drifting, not tearing across the marsh.
    expect(keptSpeed(0.94, 200)).toBeLessThan(0.7);
    expect(keptSpeed(0.94, 200)).toBeGreaterThan(0.6);
  });

  it('leaves a particle alone at one, and where there is no affector at all', () => {
    expect(keptSpeed(1, 40)).toBe(1);
    expect(keptSpeed(0, 40)).toBe(1);
  });
});
