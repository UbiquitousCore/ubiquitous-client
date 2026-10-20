/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The paths of the last picture drawn, so a test can see what was left out of it. */
const drawn = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: (plan: { parts: { path: string }[] }) => {
    drawn.paths = plan.parts.map(part => part.path);
    return { url: 'blob:bag', width: 200, height: 200 };
  },
}));

vi.mock('../../src/ui/iconUrl', () => ({ iconUrl: () => 'data:icon' }));

import { ArtBagWindow, bagDrop } from '../../src/ui/components/ArtBagWindow';
import { setEmblems, setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { inventory, setInventoryActions, setStorageUpgrades } from '../../src/ui/inventoryStore';
import { money } from '../../src/ui/hudStore';
import type { InventoryItem } from '../../src/ui/inventoryStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
  inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
  money.value = 0;
  setStorageUpgrades([]);
  setInventoryActions(ACTIONS);
  vi.clearAllMocks();
});

const ACTIONS = {
  move: vi.fn(),
  equip: vi.fn(),
  unequip: vi.fn(),
  use: vi.fn(),
  destroy: vi.fn(),
  sell: vi.fn(),
  sort: vi.fn(),
  split: vi.fn(),
  upgrade: vi.fn(),
};

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

/** The smallest bag: a backdrop, two slots, and a pair of page controls. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 40, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 20L0 20Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 200, h: 200 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 200L0 200Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(11, at(0, 0), 'item01'),
            place(11, at(50, 0), 'item02'),
            place(11, at(0, 60), 'btnleft'),
            place(11, at(50, 60), 'btnright'),
            place(11, at(0, 100), 'shut'),
            place(21, at(0, 140), 'purse'),
          ],
        ],
      },
      {
        // The row the purse is written along: a figure, then its coin.
        id: 21,
        frameCount: 1,
        frames: [
          [
            place(40, at(0, 0), 'textGold'),
            place(11, at(40, 0), 'iconGold'),
            place(40, at(60, 0), 'textSilver'),
            place(11, at(100, 0), 'iconSilver'),
            place(40, at(120, 0), 'textIron'),
            place(11, at(160, 0), 'iconIron'),
          ],
        ],
      },
    ],
    edits: [
      { id: 40, bounds: { x: 0, y: 0, w: 40, h: 20 }, words: '', sizePx: 10, align: 'right' },
    ],
    root: [[place(20, at(0, 0), 'theBag')]],
  } as unknown as UiSkinData;
}

const spec = {
  screens: {
    bag: {
      dialog: 'theBag',
      frame: 'back',
      close: 'shut',
      grids: { bag: { slot: 'item', pageBack: 'btnleft', pageOn: 'btnright' } },
      purse: { gold: 'purse/textGold', silver: 'purse/textSilver', copper: 'purse/textIron' },
      coins: { gold: 'purse/iconGold', silver: 'purse/iconSilver', copper: 'purse/iconIron' },
    },
  },
};

const item = (id: string, index: number, entry: number): InventoryItem =>
  ({ id, entry, count: 1, slot: { area: 'bag', index } }) as InventoryItem;

describe('ArtBagWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtBagWindow onClose={() => undefined} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('shows the page of the bag that is turned to, not the first', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = {
      bagSlotCount: 4,
      bankSlotCount: 0,
      items: [item('first', 0, 5), item('later', 2, 7)],
    };
    const { container, getByLabelText } = render(<ArtBagWindow onClose={() => undefined} />);
    const shown = () =>
      Array.from(container.querySelectorAll('[data-drop-slot]')).map(one =>
        one.getAttribute('data-drop-slot'),
      );
    expect(shown()).toEqual(['bag:0', 'bag:1']);
    fireEvent.click(getByLabelText('next page'));
    expect(shown()).toEqual(['bag:2', 'bag:3']);
  });

  it('draws no slot past the room the bag actually has', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 3, bankSlotCount: 0, items: [] };
    const { container, getByLabelText } = render(<ArtBagWindow onClose={() => undefined} />);
    fireEvent.click(getByLabelText('next page'));
    expect(
      Array.from(container.querySelectorAll('[data-drop-slot]')).map(one =>
        one.getAttribute('data-drop-slot'),
      ),
    ).toEqual(['bag:2']);
  });

  it('draws a bag that has not said how big it is yet', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
    const { container } = render(<ArtBagWindow onClose={() => undefined} />);
    expect(container.querySelectorAll('[data-drop-slot]')).toHaveLength(2);
  });

  it('closes when the control the spec names is pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onClose = vi.fn();
    const { getByLabelText } = render(<ArtBagWindow onClose={onClose} />);
    fireEvent.click(getByLabelText(/close the bag/i));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the purse along the bottom of the bag', () => {
  const written = (container: Element): string[] =>
    Array.from(container.querySelectorAll('span'))
      .map(one => one.textContent ?? '')
      .filter(text => /^\d+$/.test(text));

  it('writes what the player is carrying beside the coins it is in', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    money.value = 12_345;
    const { container } = render(<ArtBagWindow onClose={() => undefined} />);
    expect(written(container)).toEqual(['1', '23', '45']);
    expect(drawn.paths).toEqual(
      expect.arrayContaining(['purse/iconGold', 'purse/iconSilver', 'purse/iconIron']),
    );
  });

  it('follows the purse as it changes', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    money.value = 5_000;
    const { container, rerender } = render(<ArtBagWindow onClose={() => undefined} />);
    expect(written(container)).toEqual(['50', '0']);
    money.value = 5_010;
    rerender(<ArtBagWindow onClose={() => undefined} />);
    expect(written(container)).toEqual(['50', '10']);
  });

  it('draws no coin with nothing written beside it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    money.value = 5_000;
    render(<ArtBagWindow onClose={() => undefined} />);
    expect(drawn.paths).not.toContain('purse/iconGold');
    expect(drawn.paths).toEqual(expect.arrayContaining(['purse/iconSilver', 'purse/iconIron']));
  });

  it('says an empty purse is empty rather than leaving the coins bare', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    money.value = 0;
    const { container } = render(<ArtBagWindow onClose={() => undefined} />);
    expect(written(container)).toEqual(['0']);
    expect(drawn.paths).toContain('purse/iconIron');
    expect(drawn.paths).not.toContain('purse/iconGold');
    expect(drawn.paths).not.toContain('purse/iconSilver');
  });
});

describe('the offer to make the bag bigger', () => {
  /**
   * The bag with its offer parked at the movie's top level, the way a
   * build that keeps no numbered pages parks it: a plate with the places
   * it adds, its price and one coin.
   */
  function withOffer(): UiSkinData {
    const movie = skin();
    movie.sprites.push({
      id: 50,
      frameCount: 1,
      frames: [
        [
          place(11, at(0, 0), 'plate'),
          place(40, at(0, 0), 'info'),
          place(40, at(0, 20), 'price'),
          place(11, at(40, 20), 'moneyIcon'),
        ],
      ],
    } as never);
    movie.sprites[0]!.frames[0]!.push(place(50, at(300, 300), 'btnupgrade'));
    return movie;
  }

  const offering = {
    screens: {
      bag: {
        ...spec.screens.bag,
        panels: { upgrade: 'btnupgrade' },
        values: { slots: 'btnupgrade/info', price: 'btnupgrade/price' },
        formats: { slots: '+%d slots' },
      },
    },
  };

  it('stands on the first page the bag has no room on, priced in every coin it costs', () => {
    uiSpec.value = offering;
    setMovie({ skin: withOffer(), art: new Map() });
    setStorageUpgrades([
      { storage: 0, slots: 4, currency: 0, price: 102, item: 0, requires: 2 },
    ] as never);
    inventory.value = { bagSlotCount: 2, bankSlotCount: 0, items: [] };
    const { getByLabelText, queryByLabelText, container } = render(
      <ArtBagWindow onClose={() => undefined} />,
    );
    // The bag's own two places fill the first page; the offer is on the next.
    expect(queryByLabelText(/slots/)).toBeNull();
    fireEvent.click(getByLabelText('next page'));
    expect(getByLabelText('+2 slots: 1 silver 2 copper')).toBeTruthy();
    const price = container.querySelector<HTMLElement>('[data-price]')!;
    expect(price.textContent).toBe('12');
    expect(
      Array.from(price.querySelectorAll('[data-coin]')).map(one => one.getAttribute('data-coin')),
    ).toEqual(['silver', 'copper']);
  });
});

describe('asking before the bag is made bigger', () => {
  /** The bag with its offer on the first page, and the message box beside it. */
  function withBox(): UiSkinData {
    const movie = skin();
    movie.sprites.push(
      {
        id: 50,
        frameCount: 1,
        frames: [[place(11, at(0, 0), 'plate')]],
      } as never,
      {
        id: 51,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'background'),
            place(11, at(0, 40), 'textMsg'),
            place(11, at(0, 80), 'btnYes'),
            place(11, at(80, 80), 'btnNo'),
            place(11, at(80, 80), 'btnRight'),
            place(11, at(0, 80), 'textYes'),
            place(11, at(80, 80), 'textNo'),
            place(11, at(60, 0), 'displayCallback'),
          ],
        ],
      } as never,
    );
    movie.sprites[0]!.frames[0]!.push(place(50, at(300, 300), 'btnupgrade'));
    movie.root[0]!.push(place(51, at(0, 0), 'theBox'));
    return movie;
  }

  const box = {
    dialog: 'theBox',
    frame: 'background',
    values: { message: 'textMsg' },
    emblems: { mark: { at: 'displayCallback', icon: 'box/ask.png', size: 20 } },
  };
  const asking = {
    screens: {
      bag: { ...spec.screens.bag, panels: { upgrade: 'btnupgrade' }, formats: { slots: '+%d' } },
      bagUpgradeAsk: {
        ...box,
        actions: { btnYes: 'accept', btnNo: 'decline' },
        captions: { textYes: 'Sure', textNo: 'Nope' },
        words: { gold: 'Pay %d gold for more room?' },
        hidden: ['btnRight'],
      },
      bagUpgradeShort: {
        ...box,
        actions: { btnRight: 'accept' },
        captions: { textYes: 'Fine' },
        words: { prompt: 'You are short.' },
        hidden: ['btnYes', 'btnNo', 'textNo'],
      },
    },
  };

  function open(price: number, purse: number) {
    uiSpec.value = asking;
    setMovie({ skin: withBox(), art: new Map() });
    setStorageUpgrades([
      { storage: 0, slots: 4, currency: 0, price, item: 0, requires: 2 },
    ] as never);
    inventory.value = { bagSlotCount: 2, bankSlotCount: 0, items: [] };
    money.value = purse;
    const view = render(<ArtBagWindow onClose={() => undefined} />);
    fireEvent.click(view.getByLabelText('next page'));
    fireEvent.click(view.getByLabelText(/^\+2/));
    return view;
  }

  it('asks what it costs before anything is bought, under the mark the box wears', () => {
    setEmblems(new Map([['box/ask.png', {} as ImageBitmap]]));
    const { getByRole } = open(30_000, 50_000);
    const question = getByRole('alertdialog');
    expect(question.textContent).toContain('Pay 3 gold for more room?');
    expect(question.querySelector('img[src="data:icon"]')).not.toBeNull();
    expect(ACTIONS.upgrade).not.toHaveBeenCalled();
  });

  it('asks a price that is not whole gold at the gold above it, the build having no other words', () => {
    const { getByRole } = open(15_000, 50_000);
    expect(getByRole('alertdialog').textContent).toContain('Pay 2 gold for more room?');
  });

  it('buys the room on a yes the purse can pay for, and asks no more', () => {
    const { getByRole, queryByRole } = open(30_000, 50_000);
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(ACTIONS.upgrade).toHaveBeenCalledWith('bag', 4);
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('says the purse is short on a yes it cannot pay for, and buys nothing', () => {
    const { getByRole, queryByRole } = open(30_000, 20_000);
    fireEvent.click(getByRole('button', { name: 'Accept' }));
    expect(ACTIONS.upgrade).not.toHaveBeenCalled();
    expect(getByRole('alertdialog').textContent).toContain('You are short.');
    expect(queryByRole('button', { name: 'Decline' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'OK' }));
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('buys nothing on a no', () => {
    const { getByRole, queryByRole } = open(30_000, 50_000);
    fireEvent.click(getByRole('button', { name: 'Decline' }));
    expect(ACTIONS.upgrade).not.toHaveBeenCalled();
    expect(queryByRole('alertdialog')).toBeNull();
  });
});

describe('the bag beside a trade', () => {
  it('puts a thing on the table when it is pressed, rather than describing it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 4, bankSlotCount: 0, items: [item('ore', 0, 5)] };
    const offer = vi.fn();
    const { container, queryByLabelText } = render(
      <ArtBagWindow onClose={() => undefined} trading={{ offered: [], offer }} />,
    );
    fireEvent.click(container.querySelector('[data-drop-slot="bag:0"]') as HTMLElement);
    expect(offer).toHaveBeenCalledWith(expect.objectContaining({ id: 'ore' }));
    // It goes with the table, so it has no close of its own.
    expect(queryByLabelText(/close the bag/i)).toBeNull();
  });

  it('does not offer the same thing twice', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 4, bankSlotCount: 0, items: [item('ore', 0, 5)] };
    const offer = vi.fn();
    const { container } = render(
      <ArtBagWindow onClose={() => undefined} trading={{ offered: ['ore'], offer }} />,
    );
    fireEvent.click(container.querySelector('[data-drop-slot="bag:0"]') as HTMLElement);
    expect(offer).not.toHaveBeenCalled();
  });
});

describe('what a drag out of the bag asks for', () => {
  it('asks for nothing on a drop back onto the slot it came from', () => {
    expect(bagDrop({ area: 'bag', index: 2 }, { area: 'bag', index: 2 })).toBeNull();
  });

  it('splits a stack held and let go on its own slot in the bag, and nothing else', () => {
    expect(bagDrop({ area: 'bag', index: 2 }, { area: 'bag', index: 2 }, 5)).toBe('split');
    expect(bagDrop({ area: 'bag', index: 2 }, { area: 'bag', index: 2 }, 1)).toBeNull();
    expect(bagDrop({ area: 'bank', index: 2 }, { area: 'bank', index: 2 }, 5)).toBeNull();
  });

  it('throws a thing from the bag away on a drop over nothing, and nothing worn', () => {
    expect(bagDrop({ area: 'bag', index: 2 }, null)).toBe('discard');
    expect(bagDrop({ area: 'equipment', index: 2 }, null)).toBeNull();
  });

  it('moves a thing between the stores the game keeps', () => {
    expect(bagDrop({ area: 'bag', index: 2 }, { area: 'bank', index: 0 })).toBe('move');
    expect(bagDrop({ area: 'bag', index: 2 }, { area: 'bag', index: 3 })).toBe('move');
  });

  it('wears a thing dropped on a place on the body', () => {
    // A different request from a move: the server checks what the thing
    // is and where it would go, and refuses a plain move onto the body
    // without saying anything.
    expect(bagDrop({ area: 'bag', index: 2 }, { area: 'equipment', index: 4 })).toBe('wear');
  });
});

describe('throwing a thing away', () => {
  const box = {
    dialog: 'theBox',
    frame: 'background',
    values: { message: 'textMsg' },
    actions: { btnYes: 'accept', btnNo: 'decline' },
    captions: { textYes: 'Yes', textNo: 'No' },
    words: { prompt: 'Throw away %s?' },
  };

  function withBox(): UiSkinData {
    const movie = skin();
    movie.sprites.push({
      id: 51,
      frameCount: 1,
      frames: [
        [
          place(12, at(0, 0), 'background'),
          place(11, at(0, 40), 'textMsg'),
          place(11, at(0, 80), 'btnYes'),
          place(11, at(80, 80), 'btnNo'),
          place(11, at(0, 80), 'textYes'),
          place(11, at(80, 80), 'textNo'),
        ],
      ],
    } as never);
    movie.root[0]!.push(place(51, at(0, 0), 'theBox'));
    return movie;
  }

  /** Lift the first thing in the bag and let it go over nothing. */
  function letGoOverNothing(container: Element) {
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.body);
    vi.useFakeTimers();
    fireEvent.pointerDown(container.querySelector('[data-drop-slot="bag:0"]') as HTMLElement, {
      button: 0,
      clientX: 0,
      clientY: 0,
    });
    vi.advanceTimersByTime(300);
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, clientY: 300 }));
      window.dispatchEvent(new PointerEvent('pointerup', { clientX: 300, clientY: 300 }));
    });
    vi.useRealTimers();
  }

  function open(withAsk: boolean) {
    uiSpec.value = { screens: { ...spec.screens, ...(withAsk ? { discardAsk: box } : {}) } };
    setMovie({ skin: withBox(), art: new Map() });
    inventory.value = { bagSlotCount: 2, bankSlotCount: 0, items: [item('ore', 0, 7)] };
    return render(<ArtBagWindow onClose={() => undefined} />);
  }

  it('asks in the build’s box, naming the thing, and throws it away only on yes', () => {
    const { container, getByRole, queryByRole } = open(true);
    letGoOverNothing(container);
    const question = getByRole('alertdialog', { name: 'Throw this away' });
    expect(question.textContent).toContain('Throw away Item 7?');
    expect(ACTIONS.destroy).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Yes' }));
    expect(ACTIONS.destroy).toHaveBeenCalledWith(expect.objectContaining({ id: 'ore' }));
    expect(queryByRole('alertdialog')).toBeNull();
  });

  it('keeps the thing when the answer is no', () => {
    const { container, getByRole } = open(true);
    letGoOverNothing(container);
    fireEvent.click(getByRole('button', { name: 'Decline' }));
    expect(ACTIONS.destroy).not.toHaveBeenCalled();
  });

  it('throws nothing away unasked where the build has no box to ask in', () => {
    const { container, queryByRole } = open(false);
    letGoOverNothing(container);
    expect(queryByRole('alertdialog')).toBeNull();
    expect(ACTIONS.destroy).not.toHaveBeenCalled();
  });
});
