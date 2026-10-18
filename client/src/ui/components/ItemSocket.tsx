/** An item inside a socket: icon, stack count, tap-to-describe and
 * press-and-drag to move (see `dragItem.ts`). Empty sockets stay enabled —
 * they are where things get dropped. */

import type { ComponentChildren, JSX } from 'preact';
import { createPortal } from 'preact/compat';
import type { StorageSlot } from '../../net/GameConnection';
import { iconUrl } from '../iconUrl';
import { qualityName } from '../items';
import { cx } from './cx';
import { Slot } from './Slot';
import type { SlotSize, SlotTone } from './Slot';
import {
  dragOver,
  isDragOver,
  itemDrag,
  sameSlot,
  startItemDrag,
  dropSlotAttribute,
} from './dragItem';

/** An item as a socket needs it: enough to draw it and to name it. */
export interface SocketItem {
  id: string;
  name: string;
  /** Item quality (`ITEM_QUALITY`). Named in the socket's label, since parchment has no tint. */
  quality: number;
  /** How many are stacked here. One is not drawn. */
  count: number;
  icon?: ImageBitmap | null;
}

/** Where a tapped socket's card should open: the socket's bottom-right corner, in viewport pixels. */
export interface CardAnchor {
  x: number;
  y: number;
}

/** `socket`: the recessed square of a named equipment slot. `disc`: the bag's plinth, no outline. */
export type SocketShape = 'socket' | 'disc';

export interface ItemSocketProps {
  slot: StorageSlot;
  item?: SocketItem;
  /** What belongs here when it is empty — "Head", "Main hand". */
  placeholder?: string;
  shape?: SocketShape;
  size?: SlotSize;
  tone?: SlotTone;
  selected?: boolean;
  /** A tap on the item: say what it is, in a card opening at `anchor`. */
  onInspect?(item: SocketItem, slot: StorageSlot, anchor: CardAnchor): void;
  /**
   * A drag ended. `to` is null when it ended over nothing — which is how the
   * game asks whether you meant to throw the item away.
   */
  onMove?(from: StorageSlot, to: StorageSlot | null): void;
}

/** The picture, or a legible stand-in while the pack is still being read. */
function ItemArt({
  item,
  placeholder,
}: {
  item?: SocketItem;
  placeholder?: string;
}): ComponentChildren {
  if (item?.icon) {
    // Contained, not stretched: a socket's box is square and a plinth's is
    // not, and the same icon has to keep its shape in both.
    return (
      <img
        className="max-h-full max-w-full rounded-chrome-sm object-contain"
        src={iconUrl(item.icon)}
        alt=""
        draggable={false}
      />
    );
  }
  if (item?.name) {
    // The name, clipped, for unshipped art; also what the drag ghost draws, so it must exist.
    return (
      <span className="pointer-events-none px-0.5 text-center text-micro leading-tight break-all text-ink-900">
        {item.name.slice(0, 12)}
      </span>
    );
  }
  return placeholder ? (
    <span className="pointer-events-none px-0.5 text-center text-micro leading-tight text-ink-700">
      {placeholder}
    </span>
  ) : null;
}

/** An inventory row in socket shape: rows name an entry, and handing one to the drag broke every drag. */
export function socketItemOf(
  item: { id: string; entry: number; count: number; quality?: number },
  name: string,
  icon: ImageBitmap | null,
): SocketItem {
  return { id: item.id, name, quality: item.quality ?? 0, count: item.count, icon };
}

/**
 * The low disc an item stands on: a flat ellipse, a third as tall as it is
 * wide, pinned to the bottom of its cell so a row of them lines up however
 * tall the cells turn out to be.
 */
export function Plinth({ lit = false }: { lit?: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      data-socket="plinth"
      className={cx(
        'pointer-events-none absolute inset-x-0 bottom-0 aspect-[10/3] rounded-[50%]',
        'border border-brass-600 bg-parchment-300 transition-[filter]',
        lit && 'brightness-110 drop-shadow-glow',
      )}
    />
  );
}

export function ItemSocket({
  slot,
  item,
  placeholder,
  shape = 'socket',
  size = 'xl',
  tone = 'light',
  selected = false,
  onInspect,
  onMove,
}: ItemSocketProps): JSX.Element {
  const drag = itemDrag.value;
  const over = isDragOver(slot, dragOver.value);
  // The socket an item was lifted out of stays visible but goes quiet —
  // without it, a long drag looks like
  // the item is in two places.
  const lifted = drag !== null && sameSlot(drag.from, slot);

  const label = item
    ? `${item.name}, ${qualityName(item.quality)}${item.count > 1 ? `, ${item.count}` : ''}`
    : placeholder
      ? `${placeholder}, empty`
      : `Empty slot ${slot.index + 1}`;

  const press =
    item && onMove
      ? (event: PointerEvent) =>
          startItemDrag(event, item, slot, { onDrop: (_payload, from, to) => onMove(from, to) })
      : undefined;
  // The card opens off the socket's own corner, so it reads as this item's.
  const tap =
    item && onInspect
      ? (event: MouseEvent) => {
          const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
          onInspect(item, slot, { x: rect.right, y: rect.bottom });
        }
      : undefined;

  if (shape === 'disc') {
    return (
      <button
        type="button"
        data-drop-slot={dropSlotAttribute(slot)}
        title={item ? item.name : undefined}
        aria-label={label}
        onPointerDown={press}
        onClick={tap}
        className={cx(
          'relative flex size-full cursor-pointer flex-col items-center justify-end',
          // No border, no face, no recess: the plinth is the whole socket.
          'touch-none border-0 bg-transparent p-0 select-none',
          'rounded-chrome focus-visible:outline-2 focus-visible:outline-brass-300',
          lifted && 'opacity-40',
        )}
      >
        {/* The plinth. Its own aspect, pinned to the bottom of the cell, so a
            row of them lines up however tall the cell turns out to be. */}
        <Plinth lit={over || selected} />
        {/* The item stands ON the plinth: its foot sits at the ellipse's own
            centre line, which is a seventh of the cell up from the bottom. */}
        <span className="pointer-events-none relative mb-[7%] flex h-[62%] w-[62%] items-end justify-center">
          <ItemArt item={item} />
        </span>
        {item !== undefined && item.count > 1 && (
          // On the plinth's own face rather than beside the item: the item is
          // art of unknown size and the plinth is always exactly here.
          <span className="pointer-events-none absolute right-[16%] bottom-[4%] text-micro font-bold text-parchment-50 text-shadow-world">
            {item.count}
          </span>
        )}
      </button>
    );
  }

  return (
    <Slot
      size={size}
      tone={tone}
      selected={selected}
      // A styling class would be the wrong thing to hang the drop contract
      // off: the next restyle is entitled to change it, and hit-testing is
      // not styling.
      data-drop-slot={dropSlotAttribute(slot)}
      className={cx(
        over && 'border-brass-300 shadow-selected',
        lifted && 'opacity-40',
        // Otherwise a press-and-hold on a touch screen selects the label or
        // opens the browser's own menu instead of picking the item up.
        'touch-none select-none',
      )}
      title={item ? item.name : placeholder}
      aria-label={label}
      onPointerDown={press}
      onClick={tap}
    >
      <ItemArt item={item} placeholder={placeholder} />
      {item !== undefined && item.count > 1 && (
        <span className="pointer-events-none absolute right-0.5 bottom-0 text-micro font-bold text-parchment-50 text-shadow-world">
          {item.count}
        </span>
      )}
    </Slot>
  );
}

/**
 * Drawn once near the root: a socket clips and scrolls, so the ghost could not leave it.
 * Portalled to the body because a transformed ancestor (the trade row is scaled to fit)
 * becomes the containing block of a `fixed` child, offsetting it from the pointer.
 */
export function ItemDragGhost(): JSX.Element | null {
  const drag = itemDrag.value;
  if (!drag) return null;
  const item = drag.payload as SocketItem;
  return createPortal(
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-dialog size-12 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-chrome-sm border border-brass-300 surface-slot opacity-90 shadow-frame"
      style={{ left: `${drag.x}px`, top: `${drag.y}px` }}
    >
      <div className="flex size-full items-center justify-center">
        <ItemArt item={item} />
      </div>
    </div>,
    document.body,
  );
}
