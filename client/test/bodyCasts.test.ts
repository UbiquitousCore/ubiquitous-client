/**
 * What somebody else is casting, as the target frame shows it.
 *
 * The server tells every session nearby when a body starts a cast, lets
 * it go, is refused or stops short. Between those messages the bar is
 * run here off the clock, so it moves smoothly.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  LINGER_MS,
  bodyCastShare,
  bodyCasts,
  endBodyCast,
  forgetBodyCasts,
  startBodyCast,
} from '../src/gameplay/bodyCasts';

afterEach(() => forgetBodyCasts());

const share = (networkId: number, now: number): number | null =>
  bodyCastShare(bodyCasts.value.get(networkId), now);

describe('another body’s cast', () => {
  it('fills from empty to full over the cast, then stops at full', () => {
    startBodyCast(7, 5, 2_000, 1_000);
    expect(share(7, 1_000)).toBe(0);
    expect(share(7, 2_000)).toBe(0.5);
    expect(share(7, 3_000)).toBe(1);
    expect(share(7, 3_000 + LINGER_MS - 1)).toBe(1);
  });

  it('is gone once the cast goes off, is refused or is stopped short', () => {
    startBodyCast(7, 5, 2_000, 1_000);
    endBodyCast(7);
    expect(share(7, 1_500)).toBeNull();
  });

  it('is gone a while after it should have ended, if no end ever comes', () => {
    startBodyCast(7, 5, 2_000, 1_000);
    expect(share(7, 3_000 + LINGER_MS)).toBeNull();
  });

  it('shows nothing for an instant spell', () => {
    startBodyCast(7, 5, 0, 1_000);
    expect(bodyCasts.value.has(7)).toBe(false);
  });

  it('keeps each body’s cast apart', () => {
    startBodyCast(7, 5, 2_000, 1_000);
    startBodyCast(8, 6, 1_000, 1_000);
    endBodyCast(8);
    expect(share(7, 2_000)).toBe(0.5);
    expect(share(8, 2_000)).toBeNull();
  });
});
