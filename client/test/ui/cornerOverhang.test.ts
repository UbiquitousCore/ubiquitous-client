import { describe, expect, it } from 'vitest';

import { cornerOverhang } from '../../src/ui/art/cornerOverhang';

const stage = { w: 480, h: 320 };

describe('cornerOverhang', () => {
  it('hangs the hero frame off the left and top as far as the movie does', () => {
    expect(cornerOverhang({ x: -7.5, y: -3.3, w: 70, h: 70 }, stage, 'left')).toEqual({
      x: -7.5,
      y: -3.3,
    });
  });

  it('hangs a right-hand piece off the right edge by what runs past it', () => {
    expect(cornerOverhang({ x: 400, y: -2.6, w: 90, h: 100 }, stage, 'right')).toEqual({
      x: 10,
      y: -2.6,
    });
  });

  it('never pulls a piece standing inside the screen inwards', () => {
    expect(cornerOverhang({ x: 4, y: 2, w: 70, h: 70 }, stage, 'left')).toEqual({ x: 0, y: 0 });
    expect(cornerOverhang({ x: 381.75, y: 0, w: 98, h: 100 }, stage, 'right')).toEqual({
      x: 0,
      y: 0,
    });
    expect(cornerOverhang(null, stage, 'left')).toEqual({ x: 0, y: 0 });
  });
});
