/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:shop', width: 200, height: 200 }),
}));

import { ArtShopWindow } from '../../src/ui/components/ArtShopWindow';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { ShopItem } from '../../src/ui/hudStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number | null,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({ depth: 1, characterId: characterId as number, matrix, name, opacity: 1 });

/**
 * The smallest shop: one card with its picture point, its price field,
 * the three coins stacked at one spot, and a control asking what it is.
 */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 200, h: 200 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 200L0 200Z' }],
      },
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 20, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L20 0L20 20L0 20Z' }],
      },
    ],
    sprites: [
      {
        id: 30,
        frameCount: 1,
        frames: [
          [
            place(11, { a: 4, b: 0, c: 0, d: 4, tx: 0, ty: 0 }, 'btn'),
            place(null, at(40, 20), 'displaycallback'),
            place(40, at(10, 60), 'money'),
            place(11, at(60, 60), 'icongold'),
            place(11, at(60, 60), 'iconsliver'),
            place(11, at(60, 60), 'iconcopper'),
            place(11, at(0, 60), 'btninfo'),
          ],
        ],
      },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(30, at(10, 10), 'buyelement01'),
            place(11, at(170, 0), 'shut'),
          ],
        ],
      },
    ],
    edits: [
      { id: 40, bounds: { x: 0, y: 0, w: 50, h: 20 }, words: '', sizePx: 12, align: 'right' },
    ],
    root: [[place(20, at(0, 0), 'theShop')]],
  } as unknown as UiSkinData;
}

const spec = {
  screens: {
    shop: {
      dialog: 'theShop',
      frame: 'back',
      close: 'shut',
      grids: {
        goods: { slot: 'buyelement', face: 'displaycallback', size: { w: 40, h: 40 } },
      },
      lists: {
        goods: {
          view: '',
          row: 'buyelement',
          fields: { name: 'name', price: 'money' },
          coins: { gold: 'icongold', silver: 'iconsliver', copper: 'iconcopper' },
          does: { inspect: 'btninfo' },
        },
      },
    },
    goods: { dialog: 'theCard' },
  },
};

const vest = (price: number): ShopItem => ({ id: 7, slot: 0, name: 'Vest', price, stock: null });

const shop = (items: ShopItem[], onBuy = vi.fn()) =>
  render(
    <ArtShopWindow
      vendorName="Vendor"
      balance={0}
      items={items}
      onBuy={onBuy}
      onSell={() => undefined}
      onClose={() => undefined}
    />,
  );

describe('ArtShopWindow', () => {
  it('writes a price in every coin it has: a hundred and two copper is a silver and two', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container } = shop([vest(102)]);
    const price = container.querySelector<HTMLElement>('[data-price]')!;
    expect(price.textContent).toBe('12');
    expect(
      Array.from(price.querySelectorAll('[data-coin]')).map(one => one.getAttribute('data-coin')),
    ).toEqual(['silver', 'copper']);
  });

  it('names no coin a price has nothing in', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container } = shop([vest(40_000)]);
    const price = container.querySelector<HTMLElement>('[data-price]')!;
    expect(price.textContent).toBe('4');
    expect(
      Array.from(price.querySelectorAll('[data-coin]')).map(one => one.getAttribute('data-coin')),
    ).toEqual(['gold']);
  });

  it('opens the card offering to buy a thing when the thing is pressed, rather than buying it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onBuy = vi.fn();
    const { getByLabelText } = shop([vest(102)], onBuy);
    fireEvent.click(getByLabelText('Vest'));
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('theCard');
    expect(onBuy).not.toHaveBeenCalled();
  });

  it('opens the card describing a thing when its own control is pressed, and does not buy it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onBuy = vi.fn();
    const { getByLabelText } = shop([vest(102)], onBuy);
    fireEvent.click(getByLabelText('About Vest'));
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('theCard');
    expect(onBuy).not.toHaveBeenCalled();
  });
});
