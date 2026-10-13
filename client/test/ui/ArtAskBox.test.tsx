/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PiecePlan } from '../../src/ui/art/piecePlan';

/** Every plan drawn, newest last. */
const drawn: PiecePlan[] = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: (plan: PiecePlan) => {
    drawn.push(plan);
    return { url: `blob:${drawn.length}`, width: plan.box.w, height: plan.box.h };
  },
}));

import { ArtAskBox } from '../../src/ui/components/ArtAskBox';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  drawn.length = 0;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string | null): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});
const sheet = (id: number, w: number, h: number, css: string, opacity = 1) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid' as const, css, opacity }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});

const RING = 'rgb(9, 9, 9)';
const SHEET = 'rgb(0, 0, 0)';

/**
 * A message box: its backdrop, the ring its mark sits in standing half
 * above the backdrop's top edge, the spot for the mark in the middle of
 * the ring, and a sheet the size of the whole view behind it all.
 */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      sheet(21, 200, 100, 'rgb(40, 40, 40)'),
      sheet(22, 40, 40, RING),
      sheet(23, 480, 320, SHEET, 0.5),
      sheet(24, 60, 20, 'rgb(90, 90, 90)'),
    ],
    sprites: [
      { id: 30, frameCount: 1, frames: [[]] },
      {
        id: 50,
        frameCount: 1,
        frames: [
          [
            place(23, -140, -110, 'btnempty'),
            place(21, 0, 20, 'background'),
            place(22, 80, 0, null),
            place(30, 100, 20, 'displayCallback'),
            place(24, 20, 90, 'btnYes'),
            place(24, 120, 90, 'btnNo'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(50, 140, 110, 'askSheet')]],
  };
}

const SPEC: ScreenSpec = {
  dialog: 'askSheet',
  frame: 'background',
  actions: { btnYes: 'accept', btnNo: 'decline' },
  panels: { sheet: 'btnempty' },
};

const paints = (plan: PiecePlan, css: string): boolean =>
  plan.ops.some(op => op.fill.kind === 'solid' && op.fill.css === css);

function mount() {
  uiSpec.value = { screens: { someAsk: SPEC } };
  setMovie({ skin: skin(), art: new Map() });
  return render(
    <ArtAskBox screen="someAsk" label="A question" onAccept={() => {}} onDecline={() => {}} />,
  );
}

describe('ArtAskBox', () => {
  it('frames the box on everything drawn around its backdrop: the ring above the top edge, not the sheet behind', () => {
    mount();
    const plan = drawn.filter(one => paints(one, RING)).at(-1)!;
    // The ring is 40 across from 80 in, from the top of the dialog; the
    // backdrop 200 by 100 from 20 down.
    expect(plan.box).toEqual({ x: 140, y: 110, w: 200, h: 120 });
    const ring = plan.ops.find(op => op.fill.kind === 'solid' && op.fill.css === RING);
    expect(ring?.matrix.ty).toBe(0);
  });

  it('lays the sheet behind the box across the whole view, not as a dark square under it', () => {
    const { getByRole } = mount();
    const box = drawn.filter(one => paints(one, RING)).at(-1)!;
    expect(paints(box, SHEET)).toBe(false);
    const sheet = drawn.find(one => paints(one, SHEET) && !paints(one, RING));
    expect(sheet?.box).toEqual({ x: 0, y: 0, w: 480, h: 320 });
    const pictures = [...getByRole('alertdialog').querySelectorAll<HTMLImageElement>('img')];
    const across = pictures.find(one => one.style.inset === '0px' || one.style.inset === '0');
    expect(across?.style.width).toBe('100%');
    expect(across?.style.height).toBe('100%');
  });
});
