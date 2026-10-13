import { describe, expect, it } from 'vitest';

import { drawnRect } from '../src/world/mapArt';

/** A texture with a drawing in the corner and white padding around it. */
function padded(
  width: number,
  height: number,
  drawn: { w: number; h: number },
  dirtyLastRow = false,
): (x: number, y: number) => { r: number; g: number; b: number; a: number } {
  return (x, y) => {
    const inside = x < drawn.w && y < drawn.h;
    // Some map textures have one unclean row at the very bottom.
    const dirty = dirtyLastRow && y === height - 1 && x < width * 0.2;
    return inside || dirty ? { r: 120, g: 100, b: 60, a: 255 } : { r: 255, g: 254, b: 251, a: 255 };
  };
}

describe('drawnRect', () => {
  it('finds the drawing inside a padded texture', () => {
    // An area map: 3:2 in the corner of a square, white below and right.
    const rect = drawnRect(1024, 1024, padded(1024, 1024, { w: 964, h: 644 }));
    expect(rect).toEqual({ left: 0, top: 0, width: 964, height: 644 });
    expect(rect.width / rect.height).toBeCloseTo(1.5, 2);
  });

  it('survives a dirty row at the very edge', () => {
    // This is the bug. The outermost row of a decoded map is not clean, so
    // trimming inwards stops on it and reports no padding at all -- which
    // left the picture one third white and every marker a third out.
    const rect = drawnRect(1024, 1024, padded(1024, 1024, { w: 964, h: 644 }, true));
    expect(rect.height).toBe(644);
    expect(rect.width).toBe(964);
  });

  it('finds a drawing whose own middle is padding', () => {
    // The world map is the top-left 720 x 480 of a 1024 square, so the centre
    // of the texture is white. Growing a region outwards from the middle
    // finds nothing at all here and the map comes up blank.
    const rect = drawnRect(1024, 1024, padded(1024, 1024, { w: 720, h: 480 }));
    expect(rect).toEqual({ left: 0, top: 0, width: 720, height: 480 });
    expect(rect.width / rect.height).toBeCloseTo(1.5, 2);
  });

  it('leaves a texture with no padding alone', () => {
    const rect = drawnRect(256, 256, padded(256, 256, { w: 256, h: 256 }));
    expect(rect).toEqual({ left: 0, top: 0, width: 256, height: 256 });
  });

  it('tolerates a torn edge that reaches the border', () => {
    // Nine tenths, not wholly: the parchment's edge pokes into the margin.
    const base = padded(600, 400, { w: 600, h: 300 });
    const torn = (x: number, y: number): { r: number; g: number; b: number; a: number } =>
      y >= 300 && x % 97 === 0 ? { r: 120, g: 100, b: 60, a: 255 } : base(x, y);
    expect(drawnRect(600, 400, torn).height).toBe(300);
  });
});
