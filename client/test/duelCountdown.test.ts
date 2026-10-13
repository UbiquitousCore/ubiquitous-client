import { describe, expect, it } from 'vitest';
import { duelCountdown } from '../src/app/features/social/duelCountdown';

describe('duelCountdown', () => {
  it('counts the last three seconds down, then says start', () => {
    expect(duelCountdown(5, 'Start!')).toEqual([
      { afterMs: 2000, text: '3' },
      { afterMs: 3000, text: '2' },
      { afterMs: 4000, text: '1' },
      { afterMs: 5000, text: 'Start!' },
    ]);
  });

  it('opens at the shorter number when the wait is short', () => {
    expect(duelCountdown(2, 'Go')).toEqual([
      { afterMs: 0, text: '2' },
      { afterMs: 1000, text: '1' },
      { afterMs: 2000, text: 'Go' },
    ]);
  });

  it('only says start for no wait', () => {
    expect(duelCountdown(0, 'Start!')).toEqual([{ afterMs: 0, text: 'Start!' }]);
  });
});
