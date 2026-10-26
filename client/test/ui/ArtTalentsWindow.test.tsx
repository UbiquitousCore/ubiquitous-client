/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:talents', width: 240, height: 320 }),
}));
vi.mock('../../src/ui/iconUrl', () => ({ iconUrl: () => 'data:icon' }));

import { ArtTalentsWindow } from '../../src/ui/components/ArtTalentsWindow';
import { setEmblems, setMovie, setUiWords } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { heroClass } from '../../src/ui/hudStore';
import { setClassTrees } from '../../src/gameplay/SpellBook';
import { applyTalentState, talentStaged } from '../../src/gameplay/talents';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies, clearUiWords } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  clearUiWords();
  uiSpec.value = null;
  heroClass.value = 0;
  setClassTrees(new Map());
  applyTalentState(0, []);
  talentStaged.value = new Map();
  setEmblems(new Map());
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** A page with one tab on it, its picture socket a box inside the tab. */
function skin(): UiSkinData {
  const bar = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w, h },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
  });
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [bar(11, 240, 320), bar(12, 60, 30), bar(14, 20, 20)],
    sprites: [
      {
        id: 30,
        frameCount: 1,
        frames: [[place(12, 0, 0, 'btn'), place(14, 5, 5, 'displayCallback')]],
      },
      {
        id: 24,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'btnempty'),
            place(30, 10, 10, 'btnTab01'),
            place(13, 100, 280, 'textPoint'),
          ],
        ],
      },
    ],
    edits: [
      {
        id: 13,
        bounds: { x: 0, y: 0, w: 120, h: 20 },
        varName: '',
        sampleHtml: '',
        sizePx: 12,
        color: null,
        face: null,
      },
    ],
    root: [[place(24, 0, 0, 'dlgPage')]],
  };
}

function mount(talents: ScreenSpec) {
  uiSpec.value = { screens: { talents } };
  setMovie({ skin: skin(), art: new Map() });
  setUiWords(['Nought', 'One', 'Two', 'Three']);
  setEmblems(new Map([['mark0.png', {} as ImageBitmap]]));
  heroClass.value = 1;
  setClassTrees(new Map([[1, [2]]]));
  return render(<ArtTalentsWindow onClose={() => {}} />);
}

const page: ScreenSpec = {
  dialog: 'dlgPage',
  frame: 'btnempty',
  tabs: [{ control: 'btnTab01', panel: 'first', caption: 'first' }],
};

describe('ArtTalentsWindow', () => {
  it('names a tree by the word that far along from its number', () => {
    const { getByLabelText } = mount({ ...page, rows: { treeWords: 1 } });
    expect(getByLabelText('Three')).toBeTruthy();
  });

  it('names no tree where the build carries no words for its trees', () => {
    const { getByLabelText } = mount(page);
    expect(getByLabelText('Tree 1')).toBeTruthy();
  });

  it('writes the points left with the staged ones counted against them', () => {
    applyTalentState(5, []);
    talentStaged.value = new Map([[9, 2]]);
    const { getByText } = mount({
      ...page,
      values: { points: 'textPoint' },
      formats: { points: 'Usable points: %d' },
    });
    expect(getByText('Usable points: 3')).toBeTruthy();
  });

  it('offers no reset: resetting is done with an item, not on this page', () => {
    const { queryByRole } = mount(page);
    expect(queryByRole('button', { name: 'Reset' })).toBeNull();
  });

  it('keeps the tree mark inside the ring, above its name', () => {
    const { container } = mount({ ...page, pictures: { 1: ['mark0.png', 'mark1.png'] } });
    const picture = container.querySelector<HTMLImageElement>('img[src="data:icon"]');
    expect(picture?.style.left).toBe(`${(11 / 240) * 100}%`);
    expect(picture?.style.top).toBe(`${(11 / 320) * 100}%`);
    expect(picture?.style.width).toBe(`${(28 / 240) * 100}%`);
    expect(picture?.style.height).toBe(`${(28 / 320) * 100}%`);
  });
});
