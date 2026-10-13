/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:trade', width: 200, height: 200 }),
}));

import { ArtTradeWindow } from '../../src/ui/components/ArtTradeWindow';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { inventory } from '../../src/ui/inventoryStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
  inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix,
  name,
  opacity: 1,
});

/** A table with two slots a side, a purse each, and one control. */
function skin(): UiSkinData {
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
        bounds: { x: 0, y: 0, w: 160, h: 160 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L160 0L160 160L0 160Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(11, at(10, 20), 'up01'),
            place(11, at(40, 20), 'up02'),
            place(11, at(10, 80), 'down01'),
            place(11, at(40, 80), 'down02'),
            place(11, at(10, 120), 'confirm'),
            place(11, at(120, 0), 'shut'),
            place(11, at(10, 140), 'waiting'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, at(0, 0), 'theTable')]],
  };
}

const spec = {
  screens: {
    trade: {
      dialog: 'theTable',
      frame: 'back',
      close: 'shut',
      grids: { mine: { slot: 'up' }, theirs: { slot: 'down' } },
      actions: { confirm: 'confirm' },
      groups: { waiting: 'waiting' },
      captions: { waiting: 'Please confirm.' },
    },
  },
};

const nothing = {
  mine: { itemIds: [], gold: 0 },
  theirs: { items: [], gold: 0 },
  peerName: 'Someone',
  iConfirmed: false,
  theyConfirmed: false,
  notice: null,
  onOffer: vi.fn(),
  onConfirm: vi.fn(),
  onClose: vi.fn(),
};

function bagItem(id: string, index: number, entry = 5) {
  return { id, entry, count: 1, slot: { area: 'bag', index } } as never;
}

describe('ArtTradeWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtTradeWindow {...nothing} />);
    expect(queryByRole('dialog', { name: /trade/i })).toBeNull();
  });

  it('asks for whichever screen the spec says it wears', () => {
    uiSpec.value = { screens: { trade: { dialog: 'someScreen' } } };
    render(<ArtTradeWindow {...nothing} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('someScreen');
  });

  it('shows each side its own things, in its own run of slots', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 8, bankSlotCount: 0, items: [bagItem('x', 0, 5)] };
    const { queryByTitle } = render(
      <ArtTradeWindow
        {...nothing}
        mine={{ itemIds: ['x'], gold: 0 }}
        theirs={{ items: [{ id: 't', entry: 9, count: 2 }], gold: 0 }}
      />,
    );
    expect(queryByTitle('Item 5')).toBeTruthy();
    expect(queryByTitle('Item 9')).toBeTruthy();
  });

  it('takes one of this side’s own things back off the table', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = {
      bagSlotCount: 8,
      bankSlotCount: 0,
      items: [bagItem('x', 0, 5), bagItem('y', 1, 6)],
    };
    const onOffer = vi.fn();
    const { getByTitle } = render(
      <ArtTradeWindow {...nothing} onOffer={onOffer} mine={{ itemIds: ['x', 'y'], gold: 400 }} />,
    );
    fireEvent.click(getByTitle('Item 5'));
    // The offer is replaced whole, and the purse rides along unchanged.
    expect(onOffer).toHaveBeenCalledWith(['y'], 400);
  });

  it('leaves the other side’s things where they are', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onOffer = vi.fn();
    const { getByTitle } = render(
      <ArtTradeWindow
        {...nothing}
        onOffer={onOffer}
        theirs={{ items: [{ id: 't', entry: 9, count: 1 }], gold: 0 }}
      />,
    );
    fireEvent.click(getByTitle('Item 9'));
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('will not change what is on the table once a side has confirmed', () => {
    // The server cancels a trade whose offer changes after a confirm, so
    // the window does not offer the change at all.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 8, bankSlotCount: 0, items: [bagItem('x', 0, 5)] };
    const onOffer = vi.fn();
    const { getByTitle } = render(
      <ArtTradeWindow
        {...nothing}
        onOffer={onOffer}
        iConfirmed
        mine={{ itemIds: ['x'], gold: 0 }}
      />,
    );
    fireEvent.click(getByTitle('Item 5'));
    expect(onOffer).not.toHaveBeenCalled();
  });

  it('says to check the table once either side has confirmed, and not before', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const quiet = render(<ArtTradeWindow {...nothing} />);
    expect(quiet.queryByText('Please confirm.')).toBeNull();
    quiet.unmount();
    // Either side is enough: the line is about the table, not about who
    // was happy with it first.
    const theirs = render(<ArtTradeWindow {...nothing} theyConfirmed />);
    expect(theirs.queryByText('Please confirm.')).toBeTruthy();
    theirs.unmount();
    const mine = render(<ArtTradeWindow {...nothing} iConfirmed />);
    expect(mine.queryByText('Please confirm.')).toBeTruthy();
  });

  it('turns a confirmation on and off rather than only on', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onConfirm = vi.fn();
    const off = render(<ArtTradeWindow {...nothing} onConfirm={onConfirm} />);
    fireEvent.click(off.getByLabelText('confirm'));
    expect(onConfirm).toHaveBeenLastCalledWith(true);
    off.unmount();
    const on = render(<ArtTradeWindow {...nothing} onConfirm={onConfirm} iConfirmed />);
    fireEvent.click(on.getByLabelText('confirm'));
    expect(onConfirm).toHaveBeenLastCalledWith(false);
  });
});

describe('the table and the bag beside it', () => {
  /** The table's movie, with a bag half its size standing in it as well. */
  function withBag(): UiSkinData {
    const movie = skin();
    movie.sprites.push({
      id: 30,
      frameCount: 1,
      frames: [
        [
          place(11, { a: 4, b: 0, c: 0, d: 4, tx: 0, ty: 0 }, 'bagBack'),
          place(11, at(20, 40), 'slot01'),
          place(11, at(50, 40), 'slot02'),
        ],
      ],
    } as never);
    movie.root[0]!.push(place(30, at(0, 0), 'theBag'));
    return movie;
  }

  /** A length in a style, in pixels. */
  const px = (value: string | undefined): number => Number(String(value).replace('px', ''));

  it('draws both at the one scale, and puts each slot where the picture has it', async () => {
    const { TradeWindowContainer } = await import('../../src/ui/TradeWindowContainer');
    const { applyTradeStarted, resetTrade } = await import('../../src/ui/tradeStore');
    uiSpec.value = {
      screens: {
        ...spec.screens,
        bag: { dialog: 'theBag', frame: 'bagBack', grids: { bag: { slot: 'slot' } } },
      },
    };
    setMovie({ skin: withBag(), art: new Map() });
    inventory.value = { bagSlotCount: 2, bankSlotCount: 0, items: [] };
    applyTradeStarted(3, 'Bram');
    const { getByRole, container } = render(<TradeWindowContainer />);
    const table = getByRole('dialog', { name: 'Trade' }).querySelector('img')!;
    const bag = getByRole('dialog', { name: 'Bag' }).querySelector('img')!;
    // The table is 160 units across and the bag 80: one scale for both
    // is the bag drawn half the table's size, not stretched to its height.
    const perUnit = px(table.style.width) / 160;
    expect(perUnit).toBeGreaterThan(0);
    expect(px(table.style.height)).toBeCloseTo(160 * perUnit);
    expect(px(bag.style.width)).toBeCloseTo(80 * perUnit);
    expect(px(bag.style.height)).toBeCloseTo(80 * perUnit);
    // A slot is placed as a share of the bag, and the bag is exactly its
    // picture — so the second slot, 50 units in, starts 50 units in.
    const second = container.querySelector<HTMLElement>('[data-drop-slot="bag:1"]')!;
    expect((parseFloat(second.style.left) / 100) * px(bag.style.width)).toBeCloseTo(50 * perUnit);
    expect((parseFloat(second.style.top) / 100) * px(bag.style.height)).toBeCloseTo(40 * perUnit);
    resetTrade();
  });
});

describe('the trade, with a game behind it', () => {
  it('stands the bag beside the table, and leaves nothing up once the trade is over', async () => {
    const { TradeWindowContainer } = await import('../../src/ui/TradeWindowContainer');
    const { applyTradeCompleted, applyTradeStarted, resetTrade } = await import(
      '../../src/ui/tradeStore'
    );
    uiSpec.value = {
      screens: {
        ...spec.screens,
        bag: { dialog: 'theTable', frame: 'back', grids: { bag: { slot: 'btnOwner' } } },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    applyTradeStarted(3, 'Bram');
    const { container, getByRole, rerender } = render(<TradeWindowContainer />);
    expect(getByRole('dialog', { name: 'Trade' })).toBeTruthy();
    expect(getByRole('dialog', { name: 'Bag' })).toBeTruthy();
    applyTradeCompleted();
    rerender(<TradeWindowContainer />);
    expect(container.firstChild).toBeNull();
    resetTrade();
  });
});
