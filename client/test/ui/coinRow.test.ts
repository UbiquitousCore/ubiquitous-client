/**
 * What a letter writes for the money riding with it: the exact sum in every
 * coin it has, capped only where the gold runs past the most figures a
 * letter writes.
 */

import { describe, expect, it } from 'vitest';

import { fitCoins } from '../../src/ui/art/WornSum';

describe('fitCoins', () => {
  it('writes every coin the sum has, exactly', () => {
    expect(fitCoins({ gold: '1', silver: '34', copper: '5' })).toEqual({
      gold: '1',
      silver: '34',
      copper: '5',
    });
    expect(fitCoins({ gold: '1', copper: '5' })).toEqual({ gold: '1', copper: '5' });
    expect(fitCoins({ silver: '12', copper: '34' })).toEqual({ silver: '12', copper: '34' });
  });

  it('writes a large sum in full, with no mark for the smaller coins', () => {
    expect(fitCoins({ gold: '1234', silver: '56', copper: '34' })).toEqual({
      gold: '1234',
      silver: '56',
      copper: '34',
    });
    const sevenNines = '9'.repeat(7);
    expect(fitCoins({ gold: sevenNines, silver: '99', copper: '99' })).toEqual({
      gold: sevenNines,
      silver: '99',
      copper: '99',
    });
  });

  it('caps gold that runs past seven figures at 9,999,999, and keeps the rest', () => {
    expect(fitCoins({ gold: '12345678', silver: '1', copper: '2' })).toEqual({
      gold: '9'.repeat(7),
      silver: '1',
      copper: '2',
    });
  });

  it('writes nothing for no coins', () => {
    expect(fitCoins({})).toEqual({});
  });
});
