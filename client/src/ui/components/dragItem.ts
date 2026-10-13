/**
 * Dragging an item between sockets via pointer events (not HTML5 DnD — no
 * touch support, and no "dropped on nothing" vs "refused" distinction).
 * A press becomes a drag after 200ms within 10px slack. Drop targets carry
 * `data-drop-slot="<area>:<index>"`, hit-tested up from the pointer.
 */

import { signal } from '@preact/signals';
import type { StorageArea, StorageSlot } from '../../net/GameConnection';
import { logger } from '../../core/log';

const log = logger('drag');

/** How long a press has to hold still before it becomes a drag. */
const HOLD_MS = 200;
/** How far the pointer may wander in that time and still count as a hold. */
const SLACK_PX = 10;

/** What is being dragged, and where the pointer is now. */
export interface ItemDrag<T> {
  payload: T;
  /** Where it came from, so a target can refuse a drop onto itself. */
  from: StorageSlot;
  /** Viewport coordinates, for drawing the thing under the pointer. */
  x: number;
  y: number;
}

/** The drag in progress; untyped, the payload goes back to the caller as given. */
export const itemDrag = signal<ItemDrag<unknown> | null>(null);

/** The socket the pointer is over right now, for highlighting it. */
export const dragOver = signal<StorageSlot | null>(null);

/** The attribute a socket carries to say it can be dropped on. */
export function dropSlotAttribute(slot: StorageSlot): string {
  return `${slot.area}:${slot.index}`;
}

function parseSlot(value: string | undefined): StorageSlot | null {
  if (!value) return null;
  const [area, index] = value.split(':');
  if (area !== 'equipment' && area !== 'bag' && area !== 'bank') return null;
  const parsed = Number(index);
  if (!Number.isInteger(parsed) || parsed < 0) return null;
  return { area: area as StorageArea, index: parsed };
}

/** The slot under a point, or null when the point is over nothing droppable. */
export function slotAt(x: number, y: number): StorageSlot | null {
  const element = document.elementFromPoint(x, y);
  const target = element?.closest<HTMLElement>('[data-drop-slot]');
  return parseSlot(target?.dataset.dropSlot);
}

export interface DragHandlers<T> {
  /** Where the drag ended, or null when it ended over nothing droppable. */
  onDrop(payload: T, from: StorageSlot, to: StorageSlot | null): void;
}

const takers = new Map<string, (payload: unknown, from: StorageSlot) => void>();

/** Register a non-slot drop target (a trade table) by name, matched by `data-drop-target`; returns the unregister. */
export function acceptsDrops<T>(
  name: string,
  take: (payload: T, from: StorageSlot) => void,
): () => void {
  takers.set(name, take as (payload: unknown, from: StorageSlot) => void);
  return () => {
    if (takers.get(name) === (take as unknown)) takers.delete(name);
  };
}

/** The named taker under a point, or null where there is none. */
export function takerAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  return element?.closest<HTMLElement>('[data-drop-target]')?.dataset.dropTarget ?? null;
}

/**
 * Watch a press to see whether it becomes a drag (call from `onPointerDown`).
 * Window listeners follow it off the socket; a press that never holds still
 * is abandoned, leaving the click alone, so a socket both taps and drags.
 */
export function startItemDrag<T>(
  event: PointerEvent,
  payload: T,
  from: StorageSlot,
  handlers: DragHandlers<T>,
): void {
  // Only the primary button, and never a right-click: those have their own
  // meaning and a drag started by one cannot be cancelled cleanly.
  if (event.button !== 0) return;

  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;

  const begin = (x: number, y: number): void => {
    dragging = true;
    itemDrag.value = { payload, from, x, y };
    dragOver.value = slotAt(x, y);
  };

  const hold = window.setTimeout(() => {
    if (!dragging) begin(startX, startY);
  }, HOLD_MS);

  const move = (moved: PointerEvent): void => {
    if (dragging) {
      itemDrag.value = { payload, from, x: moved.clientX, y: moved.clientY };
      dragOver.value = slotAt(moved.clientX, moved.clientY);
      return;
    }
    // Still deciding. Wandering off before the hold elapsed is a swipe, not a
    // drag, so the press is abandoned rather than promoted.
    const far = Math.hypot(moved.clientX - startX, moved.clientY - startY) > SLACK_PX;
    if (far) finish(null);
  };

  const up = (released: PointerEvent): void => {
    finish(dragging ? { x: released.clientX, y: released.clientY } : null);
  };

  const cancel = (): void => finish(null);

  function finish(at: { x: number; y: number } | null): void {
    window.clearTimeout(hold);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    const wasDragging = dragging;
    dragging = false;
    itemDrag.value = null;
    dragOver.value = null;
    // A press that never became a drag reports nothing: the click event that
    // follows it is the interaction, and calling back here as well would both
    // move the item and open its description.
    if (!wasDragging || !at) return;
    const slot = slotAt(at.x, at.y);
    // A socket wins over a window that takes drops, so a table drawn
    // over a bag does not swallow a move between two of its own sockets.
    const taker = slot ? null : takers.get(takerAt(at.x, at.y) ?? '');
    // Said out loud, because a drag that goes nowhere looks the same from
    // outside whatever the reason: the slot it landed on, the window that
    // took it, or nothing under the pointer at all. Reported at the level
    // a player can turn on rather than kept for a debug build.
    log.info(
      `drag: ${from.area}:${from.index} -> ` +
        (slot ? `${slot.area}:${slot.index}` : (takerAt(at.x, at.y) ?? 'nothing')),
    );
    if (taker) taker(payload, from);
    else handlers.onDrop(payload, from, slot);
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}

/** True while `slot` is the socket the pointer is over during a drag. */
export function isDragOver(slot: StorageSlot, over: StorageSlot | null): boolean {
  return over !== null && over.area === slot.area && over.index === slot.index;
}

/** True when two slots name the same socket. */
export function sameSlot(a: StorageSlot | null, b: StorageSlot | null): boolean {
  return a !== null && b !== null && a.area === b.area && a.index === b.index;
}
