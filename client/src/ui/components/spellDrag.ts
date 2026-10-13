/** Dragging a spell to the bar, with the item drag's hold-then-move rules; targets carry `data-spell-slot`. */

import { signal } from '@preact/signals';

const HOLD_MS = 200;
const SLACK_PX = 10;

export interface SpellDrag {
  spellId: number;
  x: number;
  y: number;
}

/** The spell in the air, or null. The ghost reads it. */
export const spellDrag = signal<SpellDrag | null>(null);
/** The bar button the pointer is over right now, for highlighting it. */
export const spellDragOver = signal<number | null>(null);

/** The bar button under a point, or null when the point is over nothing droppable. */
export function spellSlotAt(x: number, y: number): number | null {
  const element = document.elementFromPoint(x, y);
  const target = element?.closest<HTMLElement>('[data-spell-slot]');
  const value = Number(target?.dataset.spellSlot);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Begin watching a press to see whether it becomes a drag. Call from
 * `onPointerDown`. `onDrop` gets the bar button the spell landed on, or null
 * for nowhere.
 */
export function startSpellDrag(
  event: PointerEvent,
  spellId: number,
  onDrop: (spellId: number, slot: number | null) => void,
): void {
  if (event.button !== 0) return;
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;

  const begin = (x: number, y: number): void => {
    dragging = true;
    spellDrag.value = { spellId, x, y };
    spellDragOver.value = spellSlotAt(x, y);
  };
  const hold = window.setTimeout(() => {
    if (!dragging) begin(startX, startY);
  }, HOLD_MS);

  const move = (moved: PointerEvent): void => {
    if (dragging) {
      spellDrag.value = { spellId, x: moved.clientX, y: moved.clientY };
      spellDragOver.value = spellSlotAt(moved.clientX, moved.clientY);
      return;
    }
    if (Math.hypot(moved.clientX - startX, moved.clientY - startY) > SLACK_PX) finish(null);
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
    spellDrag.value = null;
    spellDragOver.value = null;
    if (wasDragging && at) onDrop(spellId, spellSlotAt(at.x, at.y));
  }

  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
