/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PiecePlan } from '../../src/ui/art/piecePlan';

/** Every plan drawn, by the colours it paints. */
const drawn: PiecePlan[] = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: (plan: PiecePlan) => {
    drawn.push(plan);
    return { url: `blob:${drawn.length}`, width: plan.box.w, height: plan.box.h };
  },
}));
vi.mock('../../src/ui/iconUrl', () => ({ iconUrl: () => 'data:icon' }));

import { ArtTalentTree } from '../../src/ui/components/ArtTalentTree';
import { setEmblems, setMovie } from '../../src/ui/art/pieceStore';
import { setTalentPlaces } from '../../src/gameplay/SpellBook';
import { talentStaged } from '../../src/gameplay/talents';
import type { TalentRow, UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  setTalentPlaces([]);
  talentStaged.value = new Map();
  drawn.length = 0;
});

const at = (tx: number, ty: number, s = 1): UiSkinPlaced['matrix'] => ({
  a: s,
  b: 0,
  c: 0,
  d: s,
  tx,
  ty,
});
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string | null,
): UiSkinPlaced => ({ depth: 1, characterId, matrix, name, opacity: 1 });
const box = (id: number, w: number, h: number, css: string) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid' as const, css, opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});

const BACKDROP = 'rgb(9, 9, 9)';
const RING = 'rgb(1, 2, 3)';

/**
 * A tree of one place: a page with its own sheet, a group on it reaching
 * into the far corner, and one socket — a ring, and the spot the picture goes in, authored as a box
 * inset in the ring.
 */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      box(15, 200, 100, BACKDROP),
      box(12, 40, 40, RING),
      box(63, 64, 64, 'rgb(255, 255, 255)'),
      box(64, 10, 10, 'rgb(7, 7, 7)'),
    ],
    sprites: [
      { id: 31, frameCount: 1, frames: [[place(63, at(0, 0), null)]] },
      {
        id: 30,
        frameCount: 1,
        frames: [[place(12, at(0, 0), 'btn'), place(31, at(6, 5, 0.5), 'displayCallback')]],
      },
      {
        id: 40,
        frameCount: 1,
        frames: [[place(30, at(20, 20), 'talent01'), place(64, at(190, 90), null)]],
      },
      {
        id: 50,
        frameCount: 1,
        frames: [[place(15, at(0, 0), null), place(40, at(0, 0), 'group')]],
      },
    ],
    edits: [],
    root: [[place(50, at(0, 0), 'dlgTree')]],
  };
}

const PLACE: TalentRow = {
  id: 1,
  tier: 1,
  column: 1,
  classId: 7,
  requires: 0,
  after: 0,
  ranks: 3,
  spells: [10],
  icon: 'place.png',
  says: 0,
};

function mount(onPick: (place: TalentRow, beside: unknown) => void = () => {}) {
  setMovie({ skin: skin(), art: new Map() });
  setTalentPlaces([PLACE]);
  setEmblems(new Map([['place.png', {} as ImageBitmap]]));
  return render(
    <ArtTalentTree
      dialog="dlgTree"
      part="group"
      tree={7}
      at={{ x: 0, y: 0 }}
      room={{ w: 200, h: 100 }}
      onSize={() => {}}
      onPick={onPick}
    />,
  );
}

const paints = (plan: PiecePlan, css: string): boolean =>
  plan.ops.some(op => op.fill.kind === 'solid' && op.fill.css === css);

describe('ArtTalentTree', () => {
  it('draws each place without the page sheet under it', () => {
    mount();
    // The socket, drawn on its own: the ring and nothing of the sheet
    // under it, which laid over the page reads as a second page. (The
    // tree's own picture, drawn for the band along its foot, is wider.)
    const socket = drawn.filter(plan => paints(plan, RING) && plan.box.w < 100);
    expect(socket.length).toBeGreaterThan(0);
    expect(socket.some(plan => paints(plan, BACKDROP))).toBe(false);
  });

  it('fills the spot the socket keeps for its picture, exactly', () => {
    const { container } = mount();
    const picture = container.querySelector<HTMLImageElement>('img[src="data:icon"]');
    // The spot sits 6 across and 5 down inside a socket at 20, 20 and is
    // 32 wide; the tree's own picture runs from 20, 20 to 200, 100.
    expect(picture?.style.left).toBe(`${(6 / 180) * 100}%`);
    expect(picture?.style.top).toBe(`${(5 / 80) * 100}%`);
    expect(picture?.style.width).toBe(`${(32 / 180) * 100}%`);
    expect(picture?.style.height).toBe(`${(32 / 80) * 100}%`);
  });

  it('says where on the page the pressed place is, so its card can stand beside it', () => {
    const picked = vi.fn();
    const { getByRole } = mount(picked);
    const socket = getByRole('button', { name: '3 ranks' });
    vi.spyOn(socket, 'getBoundingClientRect').mockReturnValue({
      left: 40,
      top: 50,
      right: 80,
      bottom: 90,
      width: 40,
      height: 40,
      x: 40,
      y: 50,
      toJSON: () => ({}),
    });
    fireEvent.click(socket, { clientX: 60, clientY: 70 });
    expect(picked).toHaveBeenCalledWith(PLACE, { left: 40, top: 50, right: 80, bottom: 90 });
  });

  it('greys a place with nothing learned or staged, and not one with a staged point', () => {
    const idle = mount();
    expect(
      idle.container.querySelector<HTMLImageElement>('img[src="data:icon"]')?.style.filter,
    ).toBe('grayscale(1)');
    idle.unmount();
    talentStaged.value = new Map([[1, 1]]);
    const { container } = mount();
    expect(container.querySelector<HTMLImageElement>('img[src="data:icon"]')?.style.filter).toBe(
      '',
    );
  });
});
