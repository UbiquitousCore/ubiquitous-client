import { describe, expect, it } from 'vitest';

import { onPictureGrid } from '../../src/ui/art/onPictureGrid';
import type { PiecePart } from '../../src/ui/art/piecePlan';

const part = (path: string, x: number, y: number, w = 10, h = 10): PiecePart =>
  ({ path, name: path.split('/').pop()!, box: { x, y, w, h } }) as PiecePart;

describe('onPictureGrid', () => {
  it('places a part from the full plan by the frame both share', () => {
    const at = onPictureGrid(
      {
        parts: [part('back', 0, 0, 100, 100)],
        whole: [part('back', 8, 5, 100, 100), part('letter', 160, 30)],
      },
      'letter',
      'back',
    );
    expect(at?.box).toEqual({ x: 152, y: 25, w: 10, h: 10 });
  });

  it('keeps a lit control at its resting box, by any other part both hold', () => {
    const at = onPictureGrid(
      {
        parts: [part('title', 10, 10), part('btnwrite', 20.5, 269.6, 126, 36)],
        whole: [part('title', 10, 10), part('btnwrite', 24, 272.8, 120, 30)],
      },
      'btnwrite',
      undefined,
    );
    expect(at?.box).toEqual({ x: 24, y: 272.8, w: 120, h: 30 });
  });
});
