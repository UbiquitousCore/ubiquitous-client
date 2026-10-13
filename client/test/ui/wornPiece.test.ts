import { describe, expect, it } from 'vitest';

import { besides } from '../../src/ui/art/WornPiece';
import type { PiecePart } from '../../src/ui/art/piecePlan';

const part = (path: string): PiecePart => ({
  name: path.split('/').pop()!,
  path,
  box: { x: 0, y: 0, w: 1, h: 1 },
  draws: true,
});

describe('besides', () => {
  const whole = [
    part('chevron'),
    part('tour'),
    part('tour/chevronHint'),
    part('purse'),
    part('purse/coin'),
  ];

  it('leaves out every other part at the top of the dialog, so a hint laid over the part is not drawn with it', () => {
    expect(besides(whole, 'chevron')).toEqual(['tour', 'purse']);
  });

  it('keeps whatever holds a part named only by its own name', () => {
    expect(besides(whole, 'coin')).toEqual(['chevron', 'tour']);
  });

  it('takes a part named by its whole path', () => {
    expect(besides(whole, 'purse/coin')).toEqual(['chevron', 'tour']);
  });

  it('keeps a stranger that shares its name with something inside the part', () => {
    const named = [...whole, part('chevron/label'), part('label')];
    expect(besides(named, 'chevron')).not.toContain('label');
  });

  it('leaves everything in where the dialog does not hold the part', () => {
    expect(besides(whole, 'missing')).toEqual([]);
  });
});
