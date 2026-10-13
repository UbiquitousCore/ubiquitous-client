/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ItemSocket } from '../../src/ui/components/ItemSocket';
import { itemDrag } from '../../src/ui/components/dragItem';
import type { StorageSlot } from '../../src/net/GameConnection';

/**
 * The socket, and the gesture that moves what is in it.
 *
 * Dragging is driven by pointer events on the window rather than by HTML5
 * drag-and-drop, so it can be exercised here as a browser would drive
 * it: a press, a wait, a move, a release. The one thing a test environment
 * cannot do for itself is hit-test a point, so `elementFromPoint` is stubbed
 * to answer whatever the case is about.
 */

const ITEM = { id: 'sword-1', name: 'Sample Sword', quality: 4, count: 1 };
const SLOT: StorageSlot = { area: 'bag', index: 3 };

/** What the pointer is over, for the hit test the drag performs on release. */
let under: Element | null = null;

beforeEach(() => {
  under = null;
  document.elementFromPoint = () => under;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  itemDrag.value = null;
  cleanup();
});

function press(element: Element, x = 10, y = 10): void {
  fireEvent.pointerDown(element, { clientX: x, clientY: y, button: 0, pointerId: 1 });
}

function move(x: number, y: number): void {
  fireEvent.pointerMove(window, { clientX: x, clientY: y, button: 0, pointerId: 1 });
}

function release(x: number, y: number): void {
  fireEvent.pointerUp(window, { clientX: x, clientY: y, button: 0, pointerId: 1 });
}

/** A stand-in for another socket, so the hit test has something to find. */
function target(slot: string): HTMLElement {
  const element = document.createElement('div');
  element.dataset.dropSlot = slot;
  document.body.append(element);
  return element;
}

describe('ItemSocket', () => {
  it('names what is in it, and what it is worth', () => {
    // The quality colours only exist on the dark material, so on parchment
    // the rank has to be said in words or it is not said at all.
    const { container } = render(<ItemSocket slot={SLOT} item={{ ...ITEM, count: 12 }} />);

    expect(container.querySelector('[aria-label]')?.getAttribute('aria-label')).toBe(
      'Sample Sword, Rare, 12',
    );
  });

  it('names an empty equipment socket by what belongs in it', () => {
    const { container } = render(
      <ItemSocket slot={{ area: 'equipment', index: 13 }} placeholder="Main hand" />,
    );

    expect(container.querySelector('[aria-label="Main hand, empty"]')).toBeTruthy();
  });

  it('is a drop target whether or not anything is in it', () => {
    // An empty socket is exactly where things get dropped. One that opted out
    // would leave the only useful destination unreachable.
    const { container } = render(<ItemSocket slot={SLOT} />);

    expect(container.querySelector('[data-drop-slot="bag:3"]')).toBeTruthy();
  });

  it('reports where a drag ended', () => {
    const onMove = vi.fn();
    const { container } = render(<ItemSocket slot={SLOT} item={ITEM} onMove={onMove} />);
    under = target('bag:7');

    press(container.querySelector('button')!);
    vi.advanceTimersByTime(250);
    move(80, 80);
    release(80, 80);

    expect(onMove).toHaveBeenCalledWith(SLOT, { area: 'bag', index: 7 });
  });

  it('reports a null destination when the drag ended over nothing', () => {
    // Not a cancelled drag: releasing an item over open ground is how the
    // game throws it away, so this has to be distinguishable from a drop.
    const onMove = vi.fn();
    const { container } = render(<ItemSocket slot={SLOT} item={ITEM} onMove={onMove} />);
    under = null;

    press(container.querySelector('button')!);
    vi.advanceTimersByTime(250);
    move(400, 400);
    release(400, 400);

    expect(onMove).toHaveBeenCalledWith(SLOT, null);
  });

  it('does not start a drag from a press that moved straight away', () => {
    // On a touch screen the same gesture starts a page swipe. A quick
    // sideways movement is the page; a slow one is the item.
    const onMove = vi.fn();
    const { container } = render(<ItemSocket slot={SLOT} item={ITEM} onMove={onMove} />);
    under = target('bag:7');

    press(container.querySelector('button')!);
    move(90, 10);
    vi.advanceTimersByTime(250);
    release(90, 10);

    expect(onMove).not.toHaveBeenCalled();
    expect(itemDrag.value).toBeNull();
  });

  it('leaves a tap alone, so one socket can be both looked at and moved', () => {
    const onInspect = vi.fn();
    const onMove = vi.fn();
    const { container } = render(
      <ItemSocket slot={SLOT} item={ITEM} onInspect={onInspect} onMove={onMove} />,
    );

    const socket = container.querySelector('button')!;
    press(socket);
    release(10, 10);
    fireEvent.click(socket);

    expect(onMove).not.toHaveBeenCalled();
    // With where the card should open: the socket's own bottom-right corner.
    expect(onInspect).toHaveBeenCalledWith(ITEM, SLOT, {
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });

  it('does not pick anything up with a right-click', () => {
    const onMove = vi.fn();
    const { container } = render(<ItemSocket slot={SLOT} item={ITEM} onMove={onMove} />);

    fireEvent.pointerDown(container.querySelector('button')!, {
      clientX: 10,
      clientY: 10,
      button: 2,
      pointerId: 1,
    });
    vi.advanceTimersByTime(250);
    release(80, 80);

    expect(itemDrag.value).toBeNull();
    expect(onMove).not.toHaveBeenCalled();
  });
});
