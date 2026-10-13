/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

// There is no canvas here to draw on, and what is drawn is not what this
// is about: where the screen puts things, and what a press asks for.
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:loot', width: 200, height: 200 }),
}));

import { ArtLootWindow } from '../../src/ui/components/ArtLootWindow';
import type { ArtLootWindowProps } from '../../src/ui/components/ArtLootWindow';
import type { LootEntry } from '../../src/ui/components/ArtLootWindow';
import { ITEM_QUALITY } from '../../src/ui/items';
import { LootWindowContainer } from '../../src/ui/LootWindowContainer';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { setUiSprites } from '../../src/ui/art/uiSprites';
import { itemFacts } from '../../src/ui/inventoryStore';
import { lootWindow, setLootActions } from '../../src/ui/lootStore';
import type { LootRow } from '../../src/ui/lootStore';
import type { ItemFacts, UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies, clearUiSprites } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  clearUiSprites();
  wantedDialogs.value = [];
  uiSpec.value = null;
  lootWindow.value = null;
  itemFacts.value = new Map();
  setLootActions({ take: () => {}, takeMoney: () => {}, close: () => {} });
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({ depth: 1, characterId, matrix, name, opacity: 1 });

/**
 * The smallest loot screen: a backdrop, a run of three rows shown through
 * a window two rows tall, each row a picture slot beside a plate with a
 * name field on it, a take-all control, a close mark and two arrows.
 */
function skin(): UiSkinData {
  const rows = [1, 2, 3].map(n => place(21, at(0, (n - 1) * 20), `row${n}`));
  return {
    movie: 'TEST',
    width: 200,
    height: 200,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 20, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L20 0L20 20L0 20Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 120, h: 120 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L120 0L120 120L0 120Z' }],
      },
      {
        id: 13,
        bounds: { x: 0, y: 0, w: 100, h: 40 },
        fills: [{ kind: 'solid', css: 'rgb(4, 4, 4)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L100 0L100 40L0 40Z' }],
      },
    ],
    sprites: [
      {
        id: 23,
        frameCount: 1,
        frames: [[place(11, at(0, 0), 'face'), place(30, at(0, 0), 'text')]],
      },
      {
        id: 21,
        frameCount: 1,
        frames: [
          [
            place(11, at(0, 0), 'pic'),
            place(23, at(25, 0), 'plate'),
            place(11, at(25, 0), 'selected'),
          ],
        ],
      },
      { id: 22, frameCount: 1, frames: [[...rows, place(13, at(0, 0), 'mask')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(22, at(0, 10), 'list'),
            place(11, at(100, 0), 'shut'),
            place(11, at(10, 90), 'all'),
            place(11, at(80, 10), 'up'),
            place(11, at(80, 40), 'down'),
          ],
        ],
      },
    ],
    edits: [
      {
        id: 30,
        bounds: { x: 0, y: 0, w: 60, h: 20 },
        varName: '',
        sampleHtml: '',
        sizePx: 12,
        color: '#000000',
        face: null,
      },
    ],
    root: [[place(20, at(0, 0), 'theLoot')]],
  };
}

const spec = {
  screens: {
    loot: {
      dialog: 'theLoot',
      frame: 'back',
      close: 'shut',
      actions: { all: 'takeAll' },
      lists: {
        rows: {
          view: 'list',
          viewport: 'list/mask',
          row: 'list/row',
          icon: 'pic',
          chosen: 'selected',
          fields: { name: 'plate/text' },
          scroll: { up: 'up', down: 'down' },
        },
      },
    },
  },
};

function entry(slot: number, quality = 2): LootEntry {
  return {
    slot,
    entry: 100 + slot,
    item: { id: `i${slot}`, name: `Thing ${slot}`, quality, count: 1, icon: null },
  };
}

function props(over: Partial<ArtLootWindowProps> = {}): ArtLootWindowProps {
  return {
    title: 'Loot',
    entries: [entry(4)],
    onTake: vi.fn(),
    onTakeMoney: vi.fn(),
    onTakeAll: vi.fn(),
    onClose: vi.fn(),
    ...over,
  };
}

function wearing(): void {
  uiSpec.value = spec;
  setMovie({ skin: skin(), art: new Map() });
}

describe('ArtLootWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtLootWindow {...props()} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('asks for whichever screen the spec says it wears', () => {
    uiSpec.value = { screens: { loot: { dialog: 'someScreen' } } };
    render(<ArtLootWindow {...props()} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('someScreen');
  });

  it('wears the shipped picture rather than the built page', () => {
    wearing();
    const { getByRole } = render(<ArtLootWindow {...props()} />);
    const dialog = getByRole('dialog', { name: 'Loot' });
    expect(dialog.querySelector('img[src="blob:loot"]')).toBeTruthy();
    // None of the built window's own materials: the art is the movie's.
    expect(dialog.querySelector('[class*="surface-"]')).toBeNull();
  });

  it('takes the coin from its own first row and each thing from its row', () => {
    wearing();
    const p = props({ money: '5 silver', copper: 500 });
    const { getByLabelText } = render(<ArtLootWindow {...p} />);
    fireEvent.click(getByLabelText('Take 5 silver'));
    expect(p.onTakeMoney).toHaveBeenCalledOnce();
    fireEvent.click(getByLabelText('Thing 4'));
    expect(p.onTake).toHaveBeenCalledWith(4);
  });

  it('opens the card for a thing when its picture is pressed, and takes it from the rest of the row', () => {
    uiSpec.value = { screens: { ...spec.screens, held: { dialog: 'theCard' } } };
    setMovie({ skin: skin(), art: new Map() });
    const p = props({ entries: [entry(4), entry(5)] });
    const { getByLabelText } = render(<ArtLootWindow {...p} />);
    fireEvent.click(getByLabelText('About Thing 4'));
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('theCard');
    expect(p.onTake).not.toHaveBeenCalled();
    fireEvent.click(getByLabelText('Thing 4'));
    expect(p.onTake).toHaveBeenCalledWith(4);
  });

  it('writes each name in the colour of how good the thing is', () => {
    wearing();
    const { getByText } = render(
      <ArtLootWindow {...props({ entries: [entry(1, ITEM_QUALITY.rare)] })} />,
    );
    expect(getByText('Thing 1').parentElement?.className).toContain('text-quality-rare');
  });

  it('offers take-all only while there is something to take', () => {
    wearing();
    const p = props();
    const { getByLabelText, unmount } = render(<ArtLootWindow {...p} />);
    fireEvent.click(getByLabelText('Take all'));
    expect(p.onTakeAll).toHaveBeenCalledOnce();
    unmount();
    const { queryByLabelText } = render(<ArtLootWindow {...props({ onTakeAll: undefined })} />);
    expect(queryByLabelText('Take all')).toBeNull();
  });

  it('closes on the mark the spec names', () => {
    wearing();
    const p = props();
    const { getByLabelText } = render(<ArtLootWindow {...p} />);
    fireEvent.click(getByLabelText('Close'));
    expect(p.onClose).toHaveBeenCalledOnce();
  });

  it('shows as many rows as the window has room for, and steps on to the rest', () => {
    // Coin and two things is three rows; the window shows two.
    wearing();
    const p = props({ money: '5 silver', copper: 500, entries: [entry(1), entry(2)] });
    const { getByLabelText, queryByLabelText } = render(<ArtLootWindow {...p} />);
    expect(queryByLabelText('Take 5 silver')).toBeTruthy();
    expect(queryByLabelText('Thing 2')).toBeNull();
    fireEvent.click(getByLabelText('Later'));
    expect(queryByLabelText('Take 5 silver')).toBeNull();
    expect(queryByLabelText('Thing 2')).toBeTruthy();
  });

  it('writes the money beside the coins cut from the build, and in words until then', async () => {
    wearing();
    const p = props({ money: '1 gold 5 copper', copper: 10_005 });
    const { container } = render(<ArtLootWindow {...p} />);
    const words = () => container.querySelector('[data-loot-money-words]');
    expect(words()?.textContent).toBe('1 gold 5 copper');
    // The coins arrive once the build's sheets are cut, while the window
    // may already be open.
    await act(() =>
      setUiSprites(
        new Map([
          ['coin-gold', 'blob:gold'],
          ['coin-silver', 'blob:silver'],
          ['coin-copper', 'blob:copper'],
        ]),
      ),
    );
    // Only the coins that are there: no silver in this sum.
    expect([...words()!.querySelectorAll('img')].map(img => img.getAttribute('src'))).toEqual([
      'blob:gold',
      'blob:copper',
    ]);
    expect(words()?.textContent).toBe('15');
  });
});

function lootRow(slot: number): LootRow {
  return {
    slot,
    itemId: `item-${slot}`,
    entry: 100 + slot,
    namePrefixId: 0,
    nameTextId: 0,
    prefixTextId: 0,
    itemClass: 0,
    subClass: 0,
    quality: 2,
    count: 1,
    displayInfoId: 0,
  };
}

describe('LootWindowContainer with the shipped screen', () => {
  it('shows the shipped screen where the build carries it', () => {
    wearing();
    lootWindow.value = { networkId: 3, money: 0, items: [] };
    const { container } = render(<LootWindowContainer />);
    expect(container.querySelector('[data-loot-worn]')).toBeTruthy();
  });

  it('draws nothing where it does not', () => {
    lootWindow.value = { networkId: 3, money: 0, items: [] };
    const { container } = render(<LootWindowContainer />);
    expect(container.innerHTML).toBe('');
  });

  it('names each row in the quality its own item row gives it', () => {
    wearing();
    itemFacts.value = new Map([[101, { quality: 4 } as ItemFacts]]);
    lootWindow.value = {
      networkId: 7,
      money: 0,
      items: [
        { ...lootRow(0), quality: 0 },
        { ...lootRow(1), quality: 0 },
      ],
    };
    const { container } = render(<LootWindowContainer />);
    const qualities = [...container.querySelectorAll('[data-loot-quality]')].map(name =>
      name.getAttribute('data-loot-quality'),
    );
    // The first row's item has no row of its own yet, so it keeps what the
    // wire said; the second is rare by its own row.
    expect(qualities).toEqual(['0', '4']);
  });

  it('takes every row on take all', () => {
    wearing();
    const take = vi.fn();
    setLootActions({ take, takeMoney: () => {}, close: () => {} });
    lootWindow.value = { networkId: 7, money: 0, items: [lootRow(0), lootRow(1)] };
    const { getByLabelText } = render(<LootWindowContainer />);
    fireEvent.click(getByLabelText('Take all'));
    expect(take.mock.calls).toEqual([
      [7, 0],
      [7, 1],
    ]);
  });
});
