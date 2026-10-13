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

import { ArtItemCard, HELD_CARD } from '../../src/ui/components/ArtItemCard';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';
import { SCREEN_MEANINGS } from '../../src/ui/art/screenMeanings';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  drawn.length = 0;
  vi.restoreAllMocks();
});

const place = (characterId: number, x: number, y: number, name: string | null): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y },
  name,
  opacity: 1,
});
const box = (id: number, w: number, h: number, css: string) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid' as const, css, opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});

/** The colour the marks and the bar are drawn in, and nothing else is. */
const MARK = 'rgb(4, 4, 4)';

/** The card as play wears it, with what it says in a box of its own. */
const SPEC = SCREEN_MEANINGS[HELD_CARD] as ScreenSpec;

function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [
      box(20, 200, 300, 'rgb(90, 60, 30)'),
      box(40, 180, 200, 'rgb(1, 2, 3)'),
      box(24, 10, 10, MARK),
    ],
    sprites: [
      { id: 30, frameCount: 1, frames: [[place(40, 0, 0, 'text')]] },
      {
        id: 50,
        frameCount: 1,
        frames: [
          [
            place(20, 0, 0, 'winbackground'),
            place(30, 10, 40, 'group'),
            place(24, 180, 40, 'lineTop'),
            place(24, 180, 230, 'lineBottom'),
            place(24, 190, 60, 'scrollBar'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(50, 0, 0, SPEC.dialog)]],
  };
}

function mount() {
  uiSpec.value = { screens: { [HELD_CARD]: SPEC } };
  setMovie({ skin: skin(), art: new Map() });
  return render(
    <ArtItemCard
      listing={{
        id: 'one',
        sellerName: '',
        itemEntry: 1,
        itemCount: 1,
        name: 'A thing',
        startPrice: 0,
        listedAt: 0,
        expiresAt: 0,
        currentBid: 0,
      }}
      actions={[]}
      wears={HELD_CARD}
      onClose={() => undefined}
    />,
  );
}

const paints = (plan: PiecePlan | undefined, css: string): boolean =>
  Boolean(plan?.ops.some(op => op.fill.kind === 'solid' && op.fill.css === css));

describe('an item card whose words fit', () => {
  it('draws neither the marks nor the bar that say they run on, and scrolls nothing', () => {
    const { getByRole } = mount();
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.some(plan => paints(plan, MARK))).toBe(false);
    const scrolled = [...getByRole('dialog').querySelectorAll('div')].filter(
      div => div.style.overflowY === 'auto',
    );
    expect(scrolled).toEqual([]);
  });
});

describe('an item card whose words run on', () => {
  it('draws the marks and the bar, and scrolls', () => {
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    const { getByRole } = mount();
    expect(paints(drawn.at(-1), MARK)).toBe(true);
    const scrolled = [...getByRole('dialog').querySelectorAll('div')].filter(
      div => div.style.overflowY === 'auto',
    );
    expect(scrolled).toHaveLength(1);
  });
});
