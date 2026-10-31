import { describe, expect, it } from 'vitest';
import { nextTarget } from '../src/gameplay/targetCycle';

const near = [
  { id: 7, distance: 12 },
  { id: 3, distance: 4 },
  { id: 9, distance: 30 },
];

describe('nextTarget', () => {
  it('has nobody to pick from nothing', () => {
    expect(nextTarget([], null, 1)).toBeNull();
  });

  it('starts at the nearest going forward and the farthest going back', () => {
    expect(nextTarget(near, null, 1)).toBe(3);
    expect(nextTarget(near, null, -1)).toBe(9);
  });

  it('walks outward by distance and wraps round', () => {
    expect(nextTarget(near, 3, 1)).toBe(7);
    expect(nextTarget(near, 7, 1)).toBe(9);
    expect(nextTarget(near, 9, 1)).toBe(3);
  });

  it('walks inward going back, and wraps', () => {
    expect(nextTarget(near, 7, -1)).toBe(3);
    expect(nextTarget(near, 3, -1)).toBe(9);
  });

  it('starts again when the selection is no longer in the list', () => {
    expect(nextTarget(near, 99, 1)).toBe(3);
  });

  it('keeps a single candidate selected', () => {
    expect(nextTarget([{ id: 5, distance: 1 }], 5, 1)).toBe(5);
  });

  it('orders equal distances by id so the walk is stable', () => {
    const tied = [
      { id: 8, distance: 5 },
      { id: 2, distance: 5 },
    ];
    expect(nextTarget(tied, null, 1)).toBe(2);
    expect(nextTarget(tied, 2, 1)).toBe(8);
  });
});
