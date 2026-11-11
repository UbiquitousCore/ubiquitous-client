import { describe, expect, it } from 'vitest';

import { buildDifferenceLine } from '../src/app/features/frontEnd/buildDifference';

describe('a game file of another build', () => {
  it('is not remarked on when no table differs', () => {
    expect(buildDifferenceLine('1.1.4', [])).toBeNull();
  });

  it('is told which version the server runs and which tables differ', () => {
    expect(buildDifferenceLine('1.1.4', ['items', 'zones'])).toBe(
      'This server runs game version 1.1.4; your game file differs from it in items, zones. ' +
        'Some things may be missing or wrong.',
    );
  });

  it('names the first few tables and counts the rest', () => {
    const line = buildDifferenceLine(null, ['a', 'b', 'c', 'd', 'e'])!;
    expect(line).toContain('another game version');
    expect(line).toContain('a, b, c and 2 more');
  });
});
