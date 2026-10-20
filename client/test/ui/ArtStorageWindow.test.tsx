/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

// There is no canvas here to draw on, and what is drawn is not what this
// is about: where the screen puts things, and what it asks the game for.
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:storage', width: 200, height: 200 }),
}));

import { ArtStorageWindow, storageMoveAllowed } from '../../src/ui/components/ArtStorageWindow';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { inventory, setInventoryActions } from '../../src/ui/inventoryStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
  inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx,
  ty,
});
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

/**
 * The smallest strongbox: a backdrop, two slots on each side, and a pair
 * of page controls for one of them.
 */
function skin(): UiSkinData {
  const slots = (prefix: string, left: number): UiSkinPlaced[] =>
    [0, 1].map((n, i) => place(11, at(left + i * 30, 20), `${prefix}0${n + 1}`));
  return {
    movie: 'TEST',
    width: 400,
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
        bounds: { x: 0, y: 0, w: 200, h: 100 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 100L0 100Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            ...slots('leftSlot', 10),
            ...slots('rightSlot', 110),
            place(11, at(10, 70), 'back'),
            place(11, at(40, 70), 'on'),
            place(11, at(160, 5), 'shut'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, at(0, 0), 'theBox')]],
  };
}

const spec = {
  screens: {
    storage: {
      dialog: 'theBox',
      frame: 'back',
      close: 'shut',
      grids: {
        bank: { slot: 'leftSlot', pageBack: 'back', pageOn: 'on' },
        bag: { slot: 'rightSlot' },
      },
    },
  },
};

function item(id: string, area: 'bag' | 'bank', index: number, entry = 5) {
  return { id, entry, count: 1, slot: { area, index } } as never;
}

describe('ArtStorageWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtStorageWindow onClose={() => undefined} />);
    expect(queryByRole('dialog', { name: /storage/i })).toBeNull();
  });

  it('asks for whichever screen the spec says it wears', () => {
    // Which dialog this window wears is not something this repository
    // knows: the spec beside the game file says so, at runtime.
    uiSpec.value = { screens: { storage: { dialog: 'someScreen' } } };
    render(<ArtStorageWindow onClose={() => undefined} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('someScreen');
  });

  it('turns a page of the store the pages belong to, and only that one', () => {
    // Each run is paged on its own: a strongbox holds two stores side by
    // side and turning one over must not turn the other.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 4, bankSlotCount: 4, items: [] };
    const { getByLabelText } = render(<ArtStorageWindow onClose={() => undefined} />);
    const on = getByLabelText('bank: next page') as HTMLButtonElement;
    expect((getByLabelText('bank: previous page') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(on);
    expect((getByLabelText('bank: previous page') as HTMLButtonElement).disabled).toBe(false);
    // Two slots a page and four slots of room is two pages, so the far
    // end is reached in one turn.
    expect(on.disabled).toBe(true);
  });

  it('draws a store that has not said how big it is yet', () => {
    // The strongbox opens before the server has said how big it is — the room arrives with
    // the contents, a message later — and a room of none read as a store
    // whose every slot was past the end, drawing half of it blank.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 4, bankSlotCount: 0, items: [] };
    const { container } = render(<ArtStorageWindow onClose={() => undefined} />);
    expect(container.querySelectorAll('[data-drop-slot^="bank:"]')).toHaveLength(2);
  });

  it('draws no slot past the room the store actually has', () => {
    // The run is as long as a page, the store is not, and a slot the
    // store has no room for would take a drop the server refuses.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = { bagSlotCount: 4, bankSlotCount: 3, items: [] };
    const { container, getByLabelText } = render(<ArtStorageWindow onClose={() => undefined} />);
    const bankSlots = () =>
      Array.from(container.querySelectorAll('[data-drop-slot^="bank:"]')).map(slot =>
        slot.getAttribute('data-drop-slot'),
      );
    expect(bankSlots()).toEqual(['bank:0', 'bank:1']);
    fireEvent.click(getByLabelText('bank: next page'));
    // Three slots of room over pages two slots long: the last page is
    // one slot, and the second half of it is not somewhere to drop.
    expect(bankSlots()).toEqual(['bank:2']);
    // The other store is untouched by its neighbour's short page.
    expect(container.querySelectorAll('[data-drop-slot^="bag:"]')).toHaveLength(2);
  });

  it('shows the page of the store that is turned to, not the first', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = {
      bagSlotCount: 4,
      bankSlotCount: 4,
      items: [item('first', 'bank', 0, 5), item('later', 'bank', 2, 7)],
    };
    const { getByLabelText, queryByTitle } = render(<ArtStorageWindow onClose={() => undefined} />);
    // Two slots a page: the first page holds slots 0 and 1.
    expect(queryByTitle('Item 5')).toBeTruthy();
    expect(queryByTitle('Item 7')).toBeNull();
    fireEvent.click(getByLabelText('bank: next page'));
    // The run is a window onto the store, not all of it.
    expect(queryByTitle('Item 5')).toBeNull();
    expect(queryByTitle('Item 7')).toBeTruthy();
  });

  it('closes when the control the spec names is pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onClose = vi.fn();
    const { getByLabelText } = render(<ArtStorageWindow onClose={onClose} />);
    fireEvent.click(getByLabelText(/close the storage/i));
    expect(onClose).toHaveBeenCalled();
  });

  it('puts a store in order through the game, not by rearranging it here', () => {
    const sort = vi.fn();
    setInventoryActions({
      move: () => {},
      equip: () => {},
      unequip: () => {},
      use: () => {},
      destroy: () => {},
      sell: () => {},
      sort,
      split: () => {},
      upgrade: () => {},
    });
    uiSpec.value = {
      screens: {
        storage: {
          ...spec.screens.storage,
          grids: {
            bank: { ...spec.screens.storage.grids.bank, sort: 'back' },
            bag: { slot: 'rightSlot' },
          },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { getByLabelText } = render(<ArtStorageWindow onClose={() => undefined} />);
    fireEvent.click(getByLabelText(/put the bank in order/i));
    expect(sort).toHaveBeenCalledWith('bank');
  });
});

describe('what a drag inside the strongbox is allowed to do', () => {
  it('refuses a drop onto nothing, which would throw the thing away', () => {
    expect(storageMoveAllowed({ area: 'bag', index: 0 }, null)).toBe(false);
  });

  it('refuses a drop back onto the slot it came from', () => {
    expect(storageMoveAllowed({ area: 'bag', index: 0 }, { area: 'bag', index: 0 })).toBe(false);
  });

  it('refuses anything to do with what is worn, which is not on this window', () => {
    expect(storageMoveAllowed({ area: 'bag', index: 0 }, { area: 'equipment', index: 1 })).toBe(
      false,
    );
    expect(storageMoveAllowed({ area: 'equipment', index: 1 }, { area: 'bag', index: 0 })).toBe(
      false,
    );
  });

  it('allows a move between the two stores it shows', () => {
    expect(storageMoveAllowed({ area: 'bag', index: 0 }, { area: 'bank', index: 3 })).toBe(true);
    expect(storageMoveAllowed({ area: 'bank', index: 3 }, { area: 'bag', index: 0 })).toBe(true);
  });
});

describe('moving a thing between the two stores', () => {
  it('asks the game to move what was dragged from one slot onto another', () => {
    // The drag is the same press-and-hold the bag uses, so a slot has to
    // carry the attribute that says it will take one, and has to start
    // the drag on a press.
    const move = vi.fn();
    setInventoryActions({
      move,
      equip: () => {},
      unequip: () => {},
      use: () => {},
      destroy: () => {},
      sell: () => {},
      sort: () => {},
      split: () => {},
      upgrade: () => {},
    });
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    inventory.value = {
      bagSlotCount: 4,
      bankSlotCount: 4,
      items: [item('a', 'bank', 0, 5)],
    };
    const { container, getByTitle } = render(<ArtStorageWindow onClose={() => undefined} />);

    // Every slot says which socket it is, so a drop can land on it.
    expect(container.querySelector('[data-drop-slot="bank:0"]')).toBeTruthy();
    expect(container.querySelector('[data-drop-slot="bag:0"]')).toBeTruthy();

    const onto = container.querySelector('[data-drop-slot="bag:1"]') as HTMLElement;
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(onto);
    vi.useFakeTimers();
    fireEvent.pointerDown(getByTitle('Item 5'), { button: 0, clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(300);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 40 }));
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 40, clientY: 40 }));
    vi.useRealTimers();

    expect(move).toHaveBeenCalledWith({ area: 'bank', index: 0 }, { area: 'bag', index: 1 });
  });
});
