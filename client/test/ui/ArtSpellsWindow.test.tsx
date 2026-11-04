/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:spells', width: 240, height: 320 }),
}));

import { ArtSpellsWindow } from '../../src/ui/components/ArtSpellsWindow';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import {
  initSpells,
  setMountSpells,
  setSpellName,
  setSpellStats,
  spellStats,
  wantedSpellStats,
} from '../../src/gameplay/SpellBook';
import { setSpellText, spellTexts } from '../../src/ui/inventoryStore';
import { SCREEN_MEANINGS } from '../../src/ui/art/screenMeanings';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  initSpells([], []);
  setMountSpells([]);
  spellStats.value = new Map();
  wantedSpellStats.value = [];
  spellTexts.value = new Map();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** A book with a plate and four rows, each a plate with a field for a name. */
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
    shapes: [bar(11, 240, 320), bar(12, 100, 18)],
    sprites: [
      { id: 20, frameCount: 1, frames: [[place(12, 0, 0, 'text01')]] },
      {
        id: 21,
        frameCount: 1,
        frames: [[0, 1, 2, 3].map(n => place(20, 0, n * 20, `item0${n + 1}`))],
      },
      {
        id: 24,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'btnempty'),
            place(21, 10, 10, 'group'),
            place(12, 0, 200, 'btnSpells'),
            place(12, 100, 200, 'btnMounts'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(24, 0, 0, 'dlgBook')]],
  };
}

describe('ArtSpellsWindow', () => {
  it('sorts the spells under the side tabs by kind, with GM spells on a tab of their own', () => {
    const book = skin();
    book.sprites[2]!.frames[0]!.push(
      place(12, 200, 0, 'btnPage01'),
      place(12, 200, 40, 'btnPage02'),
    );
    uiSpec.value = {
      screens: {
        spells: {
          dialog: 'dlgBook',
          frame: 'btnempty',
          faces: { btnPage01: 1, btnPage02: 1 },
          lists: { spells: { view: 'group', row: 'group/item', fields: { name: 'text01' } } },
        },
      },
    };
    setMovie({ skin: book, art: new Map() });
    const stats = (skillSet: number) => ({
      powerCost: 0,
      castMs: 0,
      cooldownMs: 0,
      range: 0,
      mount: false,
      skillSet,
      skillSetIcon: null,
    });
    setSpellName(1, 'Fireball');
    setSpellName(40, 'Test Stun');
    setSpellStats(1, stats(11));
    setSpellStats(40, stats(0));
    initSpells([1, 40], []);
    const { getByLabelText, queryByLabelText } = render(
      <ArtSpellsWindow onClose={() => {}} onCast={() => {}} />,
    );

    expect(getByLabelText('Fireball')).toBeTruthy();
    expect(queryByLabelText('Test Stun')).toBeNull();
    fireEvent.click(getByLabelText('GM'));
    expect(getByLabelText('Test Stun')).toBeTruthy();
    expect(queryByLabelText('Fireball')).toBeNull();
  });

  it('lists every spell on one page where the book keeps no pages of its own', () => {
    uiSpec.value = {
      screens: {
        spells: {
          dialog: 'dlgBook',
          frame: 'btnempty',
          lists: { spells: { view: 'group', row: 'group/item', fields: { name: 'text01' } } },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    for (const [id, name] of [
      [1, 'Strike'],
      [2, 'Guard'],
    ] as const) {
      setSpellName(id, name);
    }
    initSpells([1, 2], []);
    const { getByLabelText } = render(<ArtSpellsWindow onClose={() => {}} onCast={() => {}} />);
    expect(getByLabelText('Strike')).toBeTruthy();
    expect(getByLabelText('Guard')).toBeTruthy();
  });
});

describe('the mounts tab', () => {
  it('opens the mounts the player has, in the rows the spells wear', () => {
    uiSpec.value = {
      screens: {
        spells: {
          dialog: 'dlgBook',
          frame: 'btnempty',
          tabs: [
            { control: 'btnSpells', panel: 'spells', caption: 'Spells' },
            { control: 'btnMounts', panel: 'mounts', caption: 'Mount' },
          ],
          sides: [{ control: '', panel: 'mounts', caption: 'Mount' }],
          panels: { spells: 'group', mounts: 'group' },
          lists: { spells: { view: 'group', row: 'group/item', fields: { name: 'text01' } } },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    setSpellName(1, 'Strike');
    setSpellName(9, 'Brown horse');
    initSpells([1], []);
    setMountSpells([9]);
    const { getByLabelText, queryByLabelText } = render(
      <ArtSpellsWindow onClose={() => {}} onCast={() => {}} />,
    );
    expect(queryByLabelText('Brown horse')).toBeNull();
    fireEvent.click(getByLabelText('Mount'));
    expect(getByLabelText('Brown horse')).toBeTruthy();
    expect(queryByLabelText('Strike')).toBeNull();
  });
});

/** The book above, and beside it the card a spell opens, laid out as the build lays its own. */
function withCard(): UiSkinData {
  const book = skin();
  const card = SCREEN_MEANINGS.spellCard as ScreenSpec;
  const field = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w, h },
    varName: '',
    sampleHtml: '',
    sizePx: 10,
    color: null,
    face: null,
  });
  book.shapes.push({
    id: 10,
    bounds: { x: 0, y: 0, w: 200, h: 200 },
    fills: [{ kind: 'solid' as const, css: 'rgb(9, 9, 9)', opacity: 1 }],
    paths: [{ fill: 1, d: 'M0 0L200 0L200 200L0 200Z' }],
  });
  book.edits.push(field(30, 150, 16), field(31, 100, 12), field(32, 180, 80));
  book.sprites.push(
    {
      id: 40,
      frameCount: 1,
      frames: [[1, 2, 3, 4].map(n => place(31, 60, n * 16, `text0${n}`))],
    },
    {
      id: 50,
      frameCount: 1,
      frames: [[place(40, 0, 0, 'groupIcon'), place(32, 0, 70, 'textDesc')]],
    },
    {
      id: 60,
      frameCount: 1,
      frames: [
        [
          place(10, 0, 0, 'btnempty'),
          place(30, 10, 5, 'textTitle'),
          place(50, 10, 30, 'group'),
          place(12, 50, 180, 'btnUse'),
          place(31, 60, 182, 'textUse'),
        ],
      ],
    },
  );
  book.root[0]!.push(place(60, 250, 0, card.dialog));
  return book;
}

describe("a spell's card", () => {
  it('opens on a tap on its row, saying its cost, reach, cast time and cooldown', () => {
    uiSpec.value = {
      screens: {
        spells: {
          dialog: 'dlgBook',
          frame: 'btnempty',
          lists: { spells: { view: 'group', row: 'group/item', fields: { name: 'text01' } } },
        },
        spellCard: {
          ...(SCREEN_MEANINGS.spellCard as ScreenSpec),
          formats: { range: 'Range:' },
        },
      },
    };
    setMovie({ skin: withCard(), art: new Map() });
    setSpellName(1, 'Strike');
    initSpells([1], []);
    const { getByLabelText, queryByRole, getByRole } = render(
      <ArtSpellsWindow onClose={() => {}} onCast={() => {}} />,
    );
    expect(queryByRole('dialog', { name: 'Strike' })).toBeNull();

    // What the game has read for the spell by the time the card is opened.
    setSpellStats(1, {
      powerCost: 40,
      castMs: 2000,
      cooldownMs: 60_000,
      range: 30,
      mount: false,
      skillSet: 11,
      skillSetIcon: null,
    });
    setSpellText(1, 'Hits hard.');
    fireEvent.click(getByLabelText('Strike'));

    const card = getByRole('dialog', { name: 'Strike' });
    // Each on the line whose picture says what it is.
    const line = (which: string) =>
      card.querySelector(`[data-spell-card-line="${which}"]`)?.textContent;
    expect(line('cost')).toBe('40');
    expect(line('range')).toBe('Range: 30');
    expect(line('cast')).toBe('2s cast');
    expect(line('cooldown')).toBe('1 min cooldown');
    expect(card.textContent).toContain('Hits hard.');
  });

  it('summons a mount from its card, the same cast its bar slot sends', () => {
    uiSpec.value = {
      screens: {
        spells: {
          dialog: 'dlgBook',
          frame: 'btnempty',
          tabs: [
            { control: 'btnSpells', panel: 'spells', caption: 'Spells' },
            { control: 'btnMounts', panel: 'mounts', caption: 'Mount' },
          ],
          sides: [{ control: '', panel: 'mounts', caption: 'Mount' }],
          panels: { spells: 'group', mounts: 'group' },
          lists: { spells: { view: 'group', row: 'group/item', fields: { name: 'text01' } } },
        },
        spellCard: { ...(SCREEN_MEANINGS.spellCard as ScreenSpec), captions: { textUse: 'Use' } },
      },
    };
    setMovie({ skin: withCard(), art: new Map() });
    setSpellName(7, 'Brown Horse');
    initSpells([7], []);
    setMountSpells([7]);
    const cast = vi.fn();
    const { getByLabelText, getByRole } = render(
      <ArtSpellsWindow onClose={() => {}} onCast={cast} />,
    );
    fireEvent.click(getByLabelText('Mount'));
    fireEvent.click(getByLabelText('Brown Horse'));

    const card = getByRole('dialog', { name: 'Brown Horse' });
    expect(card.textContent).toContain('Use');
    fireEvent.click(card.querySelector('button[aria-label="Use"]')!);
    expect(cast).toHaveBeenCalledWith(7);
  });

  it('asks the game for the figures of a spell it has none for', () => {
    uiSpec.value = {
      screens: {
        spells: {
          dialog: 'dlgBook',
          frame: 'btnempty',
          lists: { spells: { view: 'group', row: 'group/item', fields: { name: 'text01' } } },
        },
        spellCard: SCREEN_MEANINGS.spellCard as ScreenSpec,
      },
    };
    setMovie({ skin: withCard(), art: new Map() });
    setSpellName(1, 'Strike');
    initSpells([1], []);
    const { getByLabelText } = render(<ArtSpellsWindow onClose={() => {}} onCast={() => {}} />);
    fireEvent.click(getByLabelText('Strike'));
    expect(wantedSpellStats.value).toContain(1);
  });
});
