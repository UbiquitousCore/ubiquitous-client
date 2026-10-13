/** @vitest-environment happy-dom */
/**
 * How a piece of shipped art is put on a canvas.
 *
 * The part worth holding is tiling. The frame around a dialog is not one
 * picture: each edge is a small piece of art repeated along its length, and
 * drawn once instead of repeated it leaves the rest of the edge bare — a
 * border with gaps in it, which is what the card had.
 */

import { describe, expect, it, vi } from 'vitest';

import { drawPiece } from '../../src/ui/art/pieceCanvas';
import type { PiecePlan } from '../../src/ui/art/piecePlan';
import type { UiSkinArt } from '../../src/assets/types';

// Neither of these exists outside a browser, and neither is what is
// being tested: one is a path, the other a matrix.
class FakePath {}
Object.assign(globalThis, {
  Path2D: FakePath,
  DOMMatrix: class {
    scale() {
      return this;
    }
  },
});

/** What the canvas was asked to do, rather than what it looks like. */
function spyCanvas(scales?: Array<[number, number]>) {
  const calls: string[] = [];
  const pattern = { setTransform: vi.fn() };
  const ctx = {
    save: () => calls.push('save'),
    restore: () => calls.push('restore'),
    scale: (x: number, y: number) => void scales?.push([x, y]),
    translate: () => undefined,
    getTransform: () => ({}),
    setTransform: () => undefined,
    transform: () => calls.push('transform'),
    clip: () => calls.push('clip'),
    fill: () => calls.push('fill'),
    drawImage: () => calls.push('drawImage'),
    createPattern: () => (calls.push('createPattern'), pattern),
    globalAlpha: 1,
    fillStyle: '' as unknown,
  };
  vi.spyOn(document, 'createElement').mockImplementation(
    () =>
      ({
        width: 0,
        height: 0,
        getContext: () => ctx,
        toDataURL: () => 'data:image/png;base64,x',
      }) as unknown as HTMLElement,
  );
  return calls;
}

const ART: UiSkinArt = {
  image: { width: 8, height: 8 } as unknown as ImageBitmap,
  scale: 1,
};

function planWith(repeating: boolean): PiecePlan {
  return {
    name: 'frame',
    box: { x: 0, y: 0, w: 40, h: 20 },
    ops: [
      {
        matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        path: 'M0 0L40 0L40 20L0 20Z',
        fill: {
          kind: 'bitmap',
          art: 'edge.png',
          matrix: { a: 20, b: 0, c: 0, d: 20, tx: 0, ty: 0 },
          repeating,
        },
        opacity: 1,
      },
    ],
    parts: [],
  } as unknown as PiecePlan;
}

/** One solid shape of the given size, filled rather than tiled. */
function solidOf(w: number, h: number): PiecePlan {
  return {
    name: 'sheet',
    box: { x: 0, y: 0, w, h },
    ops: [
      {
        matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        path: `M0 0L${w} 0L${w} ${h}L0 ${h}Z`,
        fill: { kind: 'solid', css: 'rgb(1,2,3)', opacity: 1 },
        opacity: 1,
      },
    ],
    parts: [],
  } as unknown as PiecePlan;
}

describe('laying regions edge to edge', () => {
  it('grows a wide shape a hair so neighbours overlap rather than meet', () => {
    // A sheet is several shapes side by side, each anti-aliased at its
    // own edge, so along a shared edge both cover half the boundary pixel
    // and neither covers all of it. What shows through the gap is a pale
    // hairline the height of the screen.
    const scales: Array<[number, number]> = [];
    spyCanvas(scales);
    drawPiece(solidOf(400, 300), new Map(), 1);

    // The draw scale itself, then the growth: both axes a shade over one.
    const grown = scales.filter(([x, y]) => x > 1 && x < 1.02 && y > 1 && y < 1.02);
    expect(grown).toHaveLength(1);
  });

  it('leaves a shape too thin to grow alone', () => {
    // A rule one pixel high grown by half a pixel comes out half again as
    // thick, which is a worse fault than the one being fixed.
    const scales: Array<[number, number]> = [];
    spyCanvas(scales);
    drawPiece(solidOf(400, 1), new Map(), 1);

    expect(scales.filter(([, y]) => y > 1 && y < 1.02)).toHaveLength(0);
  });
});

describe('drawPiece', () => {
  it('repeats a tiling fill along whatever it fills', () => {
    const calls = spyCanvas();
    drawPiece(planWith(true), new Map([['edge.png', ART]]), 1);
    expect(calls).toContain('createPattern');
    expect(calls).toContain('fill');
    expect(calls).not.toContain('drawImage');
  });

  it('draws a fill that does not tile exactly once, where it is put', () => {
    const calls = spyCanvas();
    drawPiece(planWith(false), new Map([['edge.png', ART]]), 1);
    expect(calls).toContain('drawImage');
    expect(calls).toContain('clip');
    expect(calls).not.toContain('createPattern');
  });
});
