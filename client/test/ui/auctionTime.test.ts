/**
 * How long a listing has left.
 *
 * The wire counts in seconds; the browser's clock counts in thousandths.
 * Subtracted as they come, every listing is a thousand times further in
 * the past than it really is — which reads on screen as every row having
 * expired, however long it actually has left.
 */

import { describe, expect, it, vi } from 'vitest';

import { remainingTime } from '../../src/ui/components/ArtAuctionWindow';

describe('how long a listing has left', () => {
  it('reads the wire in the unit the wire uses', () => {
    const now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockReturnValue(now);

    expect(remainingTime(now / 1000 + 2 * 3600 + 30 * 60)).toBe('2H30M');
    expect(remainingTime(now / 1000 + 59 * 60)).toBe('59M');
  });

  it('says nothing rather than counting backwards for one already gone', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
    expect(remainingTime(1_700_000_000)).toBe('0M');
  });
});
