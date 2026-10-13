import { describe, expect, it } from 'vitest';

import { settled } from '../../src/ui/art/useWorn';

describe('a measurement that is the same size again', () => {
  it('holds a difference under half a pixel', () => {
    expect(settled(320, 320.4)).toBe(true);
    expect(settled(320.4, 320)).toBe(true);
    expect(settled(320, 320)).toBe(true);
  });

  it('takes a difference of half a pixel or more', () => {
    expect(settled(320, 320.5)).toBe(false);
    expect(settled(320, 640)).toBe(false);
    expect(settled(0, 320)).toBe(false);
  });
});
