/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptsDrops, startItemDrag, takerAt } from '../../src/ui/components/dragItem';
import type { DragHandlers } from '../../src/ui/components/dragItem';
import type { StorageSlot } from '../../src/ui/inventoryStore';

/** What is dragged here: an id is enough for a drop to be identified by. */
interface Thing {
  id: string;
}

/**
 * A drag, from press to release, without waiting for the hold to elapse:
 * the hold is the drag's own business and is covered where it is set.
 */
function drag(from: StorageSlot, handlers: DragHandlers<Thing>): void {
  vi.useFakeTimers();
  startItemDrag(
    new PointerEvent('pointerdown', { button: 0, clientX: 0, clientY: 0 }),
    { id: 'thing' },
    from,
    handlers,
  );
  vi.advanceTimersByTime(300);
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 50 }));
  window.dispatchEvent(new PointerEvent('pointerup', { clientX: 50, clientY: 50 }));
  vi.useRealTimers();
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const bag: StorageSlot = { area: 'bag', index: 0 };

describe('somewhere other than a socket that takes a drop', () => {
  it('reads the name off whatever is under the point', () => {
    const table = document.createElement('div');
    table.dataset.dropTarget = 'trade';
    const inside = document.createElement('span');
    table.append(inside);
    document.body.append(table);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(inside);
    expect(takerAt(1, 1)).toBe('trade');
  });

  it('hands a drop to the window that said it would take one', () => {
    const took = vi.fn();
    const stop = acceptsDrops('trade', took);
    const table = document.createElement('div');
    table.dataset.dropTarget = 'trade';
    document.body.append(table);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(table);
    const onDrop = vi.fn<DragHandlers<Thing>['onDrop']>();
    drag(bag, { onDrop });
    expect(took).toHaveBeenCalledWith({ id: 'thing' }, bag);
    // And the socket's own handler is not called as well, which would
    // both move the thing and put it on the table.
    expect(onDrop).not.toHaveBeenCalled();
    stop();
  });

  it('gives a socket the drop even where a window would take one', () => {
    // A table drawn over a bag must not swallow a move between two of
    // the bag's own sockets.
    const took = vi.fn();
    const stop = acceptsDrops('trade', took);
    const socket = document.createElement('div');
    socket.dataset.dropSlot = 'bank:3';
    socket.dataset.dropTarget = 'trade';
    document.body.append(socket);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(socket);
    const onDrop = vi.fn<DragHandlers<Thing>['onDrop']>();
    drag(bag, { onDrop });
    expect(onDrop).toHaveBeenCalledWith({ id: 'thing' }, bag, { area: 'bank', index: 3 });
    expect(took).not.toHaveBeenCalled();
    stop();
  });

  it('stops taking drops once the window that took them has gone', () => {
    const took = vi.fn();
    acceptsDrops('trade', took)();
    const table = document.createElement('div');
    table.dataset.dropTarget = 'trade';
    document.body.append(table);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(table);
    const onDrop = vi.fn<DragHandlers<Thing>['onDrop']>();
    drag(bag, { onDrop });
    expect(took).not.toHaveBeenCalled();
    expect(onDrop).toHaveBeenCalledWith({ id: 'thing' }, bag, null);
  });
});
