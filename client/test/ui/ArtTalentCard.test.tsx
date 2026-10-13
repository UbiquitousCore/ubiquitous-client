/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
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

import { ArtTalentCard } from '../../src/ui/components/ArtTalentCard';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';
import { setTalentPlaces, setTalentWord, talentWords } from '../../src/gameplay/SpellBook';
import { SCREEN_MEANINGS } from '../../src/ui/art/screenMeanings';
import { setUiWords } from '../../src/ui/art/pieceStore';
import { setSpellText, spellTexts } from '../../src/ui/inventoryStore';
import { applyTalentState, setTalentActions, talentStaged } from '../../src/gameplay/talents';
import type { TalentRow, UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies, clearUiWords } from '../helpers/stores';

const learned = vi.fn();

afterEach(() => {
  cleanup();
  clearMovies();
  clearUiWords();
  talentWords.value = new Map();
  spellTexts.value = new Map();
  uiSpec.value = null;
  setTalentPlaces([]);
  setTalentActions(null);
  applyTalentState(0, []);
  talentStaged.value = new Map();
  learned.mockReset();
  drawn.length = 0;
  vi.restoreAllMocks();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string | null): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});
const box = (id: number, w: number, h: number, css: string) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid' as const, css, opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});
const field = (id: number, w: number, h: number) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  varName: '',
  sampleHtml: '',
  sizePx: 10,
  color: null,
  face: null,
});

const MARK = 'rgb(4, 4, 4)';
const ADD_LIT = 'rgb(0, 200, 0)';
const ADD_DIM = 'rgb(90, 90, 90)';
const CONFIRM = 'rgb(150, 91, 40)';
const PLATE = 'rgb(30, 20, 10)';

/** A card: its sheet, the words, the marks that say they run on, and the controls under them. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      box(21, 160, 280, 'rgb(200, 190, 150)'),
      box(22, 50, 20, 'rgb(150, 90, 40)'),
      box(23, 10, 10, ADD_LIT),
      box(24, 20, 10, MARK),
      box(27, 10, 10, ADD_DIM),
      box(28, 50, 20, CONFIRM),
      box(30, 160, 40, PLATE),
    ],
    sprites: [
      { id: 40, frameCount: 1, frames: [[place(22, 0, 0, null)]] },
      {
        id: 42,
        frameCount: 1,
        frames: [[place(22, 0, 0, null), place(26, 2, 2, 'text')]],
      },
      {
        id: 41,
        frameCount: 1,
        frames: [[place(28, 0, 0, null), place(42, 0, 0, 'disable'), place(26, 2, 2, 'text1')]],
      },
      { id: 43, frameCount: 1, frames: [[place(25, 0, 0, 'text')]] },
      {
        id: 44,
        frameCount: 1,
        frames: [
          [
            place(40, 10, 200, 'btnAdd'),
            place(40, 80, 200, 'btnSub'),
            place(23, 20, 205, 'iconAddEn'),
            place(27, 20, 205, 'iconAddDis'),
            place(23, 90, 205, 'iconSubEn'),
            place(27, 90, 205, 'iconSubDis'),
          ],
        ],
      },
      // The confirm stands on a plate of its own, drawn beside the button
      // rather than inside it.
      {
        id: 45,
        frameCount: 1,
        frames: [[place(30, 0, 240, null), place(41, 10, 240, 'btnConfirm')]],
      },
      {
        id: 46,
        frameCount: 1,
        frames: [[place(44, 0, 0, 'panelAdd'), place(45, 0, 0, 'panelConfirm')]],
      },
      {
        id: 50,
        frameCount: 1,
        frames: [
          [
            place(21, 0, 0, 'btnempty'),
            place(43, 5, 40, 'group'),
            place(24, 130, 45, 'lineTop'),
            place(24, 130, 150, 'lineBottom'),
            place(24, 150, 60, 'scrollBar'),
            place(46, 0, 0, 'panelAddPoint'),
          ],
        ],
      },
    ],
    edits: [field(25, 140, 100), field(26, 46, 16)],
    root: [[place(50, 0, 0, SPEC.dialog)]],
  };
}

/** The card as play wears it: the table's own entry, not a stand-in for it. */
const SPEC = SCREEN_MEANINGS.talentCard as ScreenSpec;
/** The build's own word for confirm, at the number the entry quotes. */
const WORDS: string[] = [];
WORDS[Number(/^@(\d+)/.exec(SPEC.words?.confirm ?? '')?.[1])] = 'Confirm';

const PLACE: TalentRow = {
  id: 1,
  tier: 1,
  column: 1,
  classId: 7,
  requires: 0,
  after: 0,
  ranks: 2,
  spells: [0],
  icon: '',
  says: 0,
};

/** Where the pressed place is on the page. */
const PRESSED = { left: 20, top: 20, right: 60, bottom: 60 };

function mount(points: number, beside = PRESSED, place = PLACE) {
  uiSpec.value = { screens: { talentCard: SPEC } };
  setUiWords(WORDS);
  setMovie({ skin: skin(), art: new Map() });
  setTalentPlaces([place]);
  applyTalentState(points, []);
  setTalentActions({ learn: learned });
  return render(<ArtTalentCard place={place} beside={beside} onClose={() => {}} />);
}

const paints = (plan: PiecePlan | undefined, css: string): boolean =>
  Boolean(plan?.ops.some(op => op.fill.kind === 'solid' && op.fill.css === css));

describe('ArtTalentCard', () => {
  it('stages a point with plus and takes it back with minus, sending nothing', () => {
    const { getByRole } = mount(2);
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    expect(talentStaged.value.get(1) ?? 0).toBe(1);
    fireEvent.click(getByRole('button', { name: 'Take a point back' }));
    expect(talentStaged.value.get(1) ?? 0).toBe(0);
    expect(learned).not.toHaveBeenCalled();
  });

  it('sends the staged points on confirm, one learn a point', () => {
    const { getByRole } = mount(2);
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    fireEvent.click(getByRole('button', { name: 'Confirm' }));
    expect(learned.mock.calls).toEqual([[1], [1]]);
    expect(talentStaged.value.get(1) ?? 0).toBe(0);
  });

  it('offers confirm only once a point is staged, and puts it away when none is', () => {
    const { getByRole, queryByRole, queryByText } = mount(2);
    expect(queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(queryByText('Confirm')).toBeNull();
    expect(paints(drawn.at(-1), CONFIRM)).toBe(false);
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    expect(getByRole('button', { name: 'Confirm' })).toBeTruthy();
    expect(paints(drawn.at(-1), CONFIRM)).toBe(true);
    fireEvent.click(getByRole('button', { name: 'Take a point back' }));
    expect(queryByRole('button', { name: 'Confirm' })).toBeNull();
    expect(paints(drawn.at(-1), CONFIRM)).toBe(false);
  });

  it('puts the whole confirm away, its plate included, until a point is staged', () => {
    const { getByRole, container } = mount(2);
    const tall = container.querySelector('img')!.style.height;
    expect(paints(drawn.at(-1), PLATE)).toBe(false);
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    expect(paints(drawn.at(-1), PLATE)).toBe(true);
    // The card holds its size either way: nothing under the pointer moves.
    expect(container.querySelector('img')!.style.height).toBe(tall);
    expect(paints(drawn.at(-1), CONFIRM)).toBe(true);
    fireEvent.click(getByRole('button', { name: 'Take a point back' }));
    expect(paints(drawn.at(-1), PLATE)).toBe(false);
  });

  it('stands beside the place it was opened on, so a staged point shows on the tree', () => {
    const { getByRole } = mount(2);
    const card = getByRole('dialog');
    expect(parseFloat(card.style.left)).toBeGreaterThanOrEqual(PRESSED.right);
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    expect(parseFloat(card.style.left)).toBeGreaterThanOrEqual(PRESSED.right);
    // With no room on that side it stands on the other.
    cleanup();
    const edge = globalThis.innerWidth;
    const far = { left: edge - 40, top: 20, right: edge - 10, bottom: 50 };
    const again = mount(2, far);
    const wide = parseFloat(again.container.querySelector('img')!.style.width);
    expect(parseFloat(again.getByRole('dialog').style.left) + wide).toBeLessThanOrEqual(far.left);
  });

  it('reads no line for a place that carries none, and says what its spell does', () => {
    setTalentWord(1, 'A line about something else');
    setSpellText(5, 'What the spell does');
    const { getByText, queryByText } = mount(2, PRESSED, { ...PLACE, spells: [5], says: 0 });
    expect(getByText('What the spell does')).toBeTruthy();
    expect(queryByText('A line about something else')).toBeNull();
  });

  it('wears each control’s own face for when it can do nothing', () => {
    const { getByRole } = mount(0);
    expect((getByRole('button', { name: 'Add a point' }) as HTMLButtonElement).disabled).toBe(true);
    const last = drawn.at(-1);
    expect(paints(last, ADD_DIM)).toBe(true);
    expect(paints(last, ADD_LIT)).toBe(false);
  });

  it('keeps the whole card, its controls included, inside the view', () => {
    const low = globalThis.innerHeight - 4;
    const { getByRole, container } = mount(2, { left: 10, top: low, right: 20, bottom: low + 10 });
    fireEvent.click(getByRole('button', { name: 'Add a point' }));
    const card = getByRole('dialog');
    const picture = container.querySelector('img')!;
    const top = parseFloat(card.style.top);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + parseFloat(picture.style.height)).toBeLessThanOrEqual(globalThis.innerHeight);
    // And the controls are on the card, not hanging off it.
    const confirm = getByRole('button', { name: 'Confirm' });
    expect(parseFloat(confirm.style.top) + parseFloat(confirm.style.height)).toBeLessThanOrEqual(
      100,
    );
  });

  it('shows the marks and the bar that say the words run on only when they do', () => {
    mount(2);
    expect(paints(drawn.at(-1), MARK)).toBe(false);
    cleanup();
    drawn.length = 0;
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(500);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(100);
    mount(2);
    expect(paints(drawn.at(-1), MARK)).toBe(true);
  });
});
