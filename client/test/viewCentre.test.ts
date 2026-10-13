/**
 * Where the hero sits on screen while a window covers part of the viewport.
 */

import { describe, expect, it } from 'vitest';
import { uncoveredCentre } from '../src/renderer/viewCentre';

const W = 1000;
const H = 600;

describe('uncoveredCentre', () => {
  it('is the viewport centre when nothing is covered', () => {
    expect(uncoveredCentre(null, W, H)).toEqual({ x: 500, y: 300 });
  });

  it('moves to the middle of what a left-hand window leaves', () => {
    // The character window: full height, 400 wide, on the left.
    const centre = uncoveredCentre({ left: 0, top: 0, right: 400, bottom: H }, W, H);
    expect(centre).toEqual({ x: 700, y: 300 });
  });

  it('works for a window on the right, or along the bottom', () => {
    expect(uncoveredCentre({ left: 600, top: 0, right: W, bottom: H }, W, H)).toEqual({
      x: 300,
      y: 300,
    });
    expect(uncoveredCentre({ left: 0, top: 400, right: W, bottom: H }, W, H)).toEqual({
      x: 500,
      y: 200,
    });
  });

  it('stays put when a window covers everything', () => {
    expect(uncoveredCentre({ left: 0, top: 0, right: W, bottom: H }, W, H)).toEqual({
      x: 500,
      y: 300,
    });
  });

  it('still shifts on a tablet, where the window leaves only a quarter', () => {
    expect(uncoveredCentre({ left: 0, top: 0, right: 768, bottom: 768 }, 1024, 768)).toEqual({
      x: 896,
      y: 384,
    });
  });

  it('shifts into whatever is left, however narrow', () => {
    expect(uncoveredCentre({ left: 0, top: 0, right: 900, bottom: H }, W, H)).toEqual({
      x: 950,
      y: 300,
    });
  });

  it('picks the larger band when a window floats away from every edge', () => {
    const centre = uncoveredCentre({ left: 100, top: 0, right: 500, bottom: H }, W, H);
    expect(centre).toEqual({ x: 750, y: 300 });
  });
});
