import { describe, expect, it } from 'vitest';

import { SWIPE_PX, insideStrip, pageAfterSwipe } from '../../src/ui/art/wornPages';

describe('turning a strip of pages', () => {
  it('brings in the next page on a drag to the left, and the last on a drag to the right', () => {
    expect(pageAfterSwipe(1, 6, -SWIPE_PX)).toBe(2);
    expect(pageAfterSwipe(1, 6, SWIPE_PX)).toBe(0);
  });

  it('stays put on a drag too short to be a swipe', () => {
    expect(pageAfterSwipe(1, 6, SWIPE_PX - 1)).toBe(1);
    expect(pageAfterSwipe(1, 6, -(SWIPE_PX - 1))).toBe(1);
  });

  it('goes no further than the first or the last page', () => {
    expect(pageAfterSwipe(0, 6, 200)).toBe(0);
    expect(pageAfterSwipe(5, 6, -200)).toBe(5);
  });

  it('names a part inside the strip as the strip itself does', () => {
    expect(insideStrip('property/info/scroll/page2/title', 'property/info/scroll')).toBe(
      'page2/title',
    );
    expect(insideStrip('page2/title', 'property/info/scroll')).toBe('page2/title');
  });
});
