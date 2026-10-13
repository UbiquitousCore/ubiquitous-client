/** The strongbox on the shipped screen: stored and carried runs side by side, paged, moved by drag. Falls back without art. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { ArtItemCard, cardFor, HELD_CARD } from './ArtItemCard';
import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornSlot } from '../art/WornSlot';
import { pageLabel, pagesFor, slotsOf } from '../art/wornSlots';
import { money } from '../hudStore';
import { purseOf } from '../money';
import {
  equippedSlots,
  inventory,
  inventoryActions,
  itemFacts,
  itemIcons,
  itemName,
} from '../inventoryStore';
import type { InventoryItem, StorageArea, StorageSlot } from '../inventoryStore';
import { equipmentHomesFor } from '../items';
import { heldAction } from '../heldItem';
import {
  dragOver,
  dropSlotAttribute,
  isDragOver,
  itemDrag,
  sameSlot,
  startItemDrag,
} from './dragItem';
import { ItemDragGhost, socketItemOf } from './ItemSocket';

/** Our name for this screen. The spec says which dialog wears it. */
export const STORAGE_SCREEN = 'storage';

/** A drop worth asking for: not onto nothing (that throws away, from the bag only), not onto itself, never equipment. */
export function storageMoveAllowed(from: StorageSlot, to: StorageSlot | null): to is StorageSlot {
  if (to === null) return false;
  if (to.area === from.area && to.index === from.index) return false;
  return to.area !== 'equipment' && from.area !== 'equipment';
}

export interface ArtStorageWindowProps {
  onClose(): void;
}

export function ArtStorageWindow(props: ArtStorageWindowProps): JSX.Element | null {
  const spec = useWornScreen(STORAGE_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({ onClose, spec }: ArtStorageWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  /** Which page each run is turned to, by our own name for the store. */
  const [pages, setPages] = useState<Record<string, number>>({});
  /** What is being read. Dragging is the shared pointer drag's business. */
  const [reading, setReading] = useState<string | null>(null);
  const [beside, setBeside] = useState<{ x: number; y: number } | null>(null);

  const state = inventory.value;
  /** A store's capacity, or null before the server says (it arrives a message later); zero would blank the half. */
  const capacityOf = (area: string): number | null => {
    const said = area === 'bank' ? state.bankSlotCount : state.bagSlotCount;
    return said > 0 ? said : null;
  };

  /** Slots past a store's end, hidden: the server silently refuses drops onto them. */
  const beyond = (whole: readonly PiecePart[]): string[] =>
    Object.entries(spec.grids ?? {}).flatMap(([area, grid]) => {
      const room = capacityOf(area);
      if (room === null) return [];
      const parts = slotsOf(whole, grid);
      const perPage = parts.length || 1;
      const page = Math.min(pages[area] ?? 0, pagesFor(room, perPage) - 1);
      return parts.filter((_part, index) => page * perPage + index >= room).map(part => part.path);
    });

  const worn = useWorn(spec.dialog, spec.frame, whole => ({
    hidden: [...(spec.hidden ?? []), ...beyond(whole)],
  }));
  const itemAt = (slot: StorageSlot): InventoryItem | undefined =>
    state.items.find(item => item.slot?.area === slot.area && item.slot.index === slot.index);

  /** Each run of slots, what it holds, and where it has been turned to. */
  const runs = Object.entries(spec.grids ?? {}).map(([area, grid]) => {
    const parts = slotsOf(worn.parts, grid);
    // A page is as long as the run is laid out, not as long as the part
    // of it this page draws: the short last page must not shorten every
    // page after it, or the run walks one slot at a time.
    const perPage = slotsOf(worn.whole, grid).length || 1;
    const count = pagesFor(capacityOf(area) ?? perPage, perPage);
    const page = Math.min(pages[area] ?? 0, count - 1);
    return { area: area as StorageArea, grid, parts, perPage, count, page };
  });

  const turn = (area: string, by: number, count: number): void =>
    setPages(was => ({
      ...was,
      [area]: Math.max(0, Math.min(count - 1, (was[area] ?? 0) + by)),
    }));

  const actions = inventoryActions();

  /** The drag ghost from a name and picture; an inventory row names only an entry, and threw. */
  const dragged = (item: InventoryItem) =>
    socketItemOf(item, itemName(item), itemIcons.value.get(item.entry) ?? null);
  /** What the card offers to do with the thing it describes. */
  const heldActions = (item: InventoryItem, done: () => void) => {
    const does = heldAction(item, itemFacts.value.get(item.entry));
    if (!does) return [];
    return [
      {
        key: does,
        onPick: () => {
          if (does === 'equip') actions.equip(item);
          else if (does === 'unequip') actions.unequip(item);
          else actions.use(item);
          done();
        },
      },
    ];
  };

  const move = (from: StorageSlot, to: StorageSlot | null): void => {
    if (storageMoveAllowed(from, to)) actions.move(from, to);
  };

  const readingItem = reading ? state.items.find(item => item.id === reading) : undefined;

  if (!worn.image || !worn.frame) return null;

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';

  return (
    <div className="pointer-events-auto fixed inset-0 z-window flex flex-col items-center justify-center gap-2 bg-black/65 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Storage"
        className="relative touch-none overflow-hidden"
      >
        <img
          ref={worn.pictureRef}
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="block h-auto max-h-[100dvh] w-full sm:max-h-[85vh] sm:w-auto"
          draggable={false}
        />

        {/* Captions. The places are the spec's, the words are the user's file's. */}
        <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

        {runs.map(({ area, grid, parts, perPage, count, page }) => (
          <Fragmentish key={area}>
            {parts.map((part, index) => {
              const at: StorageSlot = { area, index: page * perPage + index };
              // A slot the store does not have is not somewhere to drop.
              const room = capacityOf(area);
              if (room !== null && at.index >= room) return null;
              const item = itemAt(at);
              return (
                <WornSlot
                  key={part.path}
                  worn={worn}
                  slot={part}
                  face={worn.parts.find(inside => inside.path === `${part.path}/${grid.face}`)}
                  countAt={worn.parts.find(inside => inside.path === `${part.path}/${grid.count}`)}
                  icon={item ? (itemIcons.value.get(item.entry) ?? null) : null}
                  name={item ? itemName(item) : undefined}
                  count={item?.count}
                  lifted={sameSlot(itemDrag.value?.from ?? null, at)}
                  over={isDragOver(at, dragOver.value)}
                  // The same press-and-hold drag the bag uses, so a thing
                  // can be moved between this window and the character's
                  // own — and so it works under a finger.
                  data-drop-slot={dropSlotAttribute(at)}
                  onPointerDown={(event: PointerEvent) => {
                    if (item)
                      startItemDrag(event, dragged(item), at, {
                        onDrop: (_p, from, to) => move(from, to),
                      });
                  }}
                  onClick={(event: MouseEvent) => {
                    if (!item) return;
                    const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
                    setBeside({ x: on.right, y: on.top });
                    setReading(item.id);
                  }}
                  className={item ? 'cursor-grab' : undefined}
                />
              );
            })}
            {([grid.pageBack, grid.pageOn] as const).map((where, which) => {
              const part = worn.find(where);
              const beyond = which === 0 ? page <= 0 : page >= count - 1;
              return part ? (
                <button
                  key={`${area}.page.${which}`}
                  type="button"
                  aria-label={`${area}: ${which === 0 ? 'previous' : 'next'} page`}
                  disabled={beyond}
                  onClick={() => turn(area, which === 0 ? -1 : 1, count)}
                  style={worn.box(part)}
                  className={`${hit}${beyond ? 'cursor-default opacity-50' : ''}`}
                />
              ) : null;
            })}
            {(() => {
              const part = worn.find(grid.sort);
              return part ? (
                <button
                  key={`${area}.sort`}
                  type="button"
                  aria-label={`Put the ${area} in order`}
                  onClick={() => actions.sort(area)}
                  style={worn.box(part)}
                  className={hit}
                />
              ) : null;
            })()}
            {(() => {
              const part = worn.fieldOf(worn.find(grid.page));
              return part ? (
                <span key={`${area}.pages`} style={worn.words(part, LIGHT)}>
                  {pageLabel(page, count)}
                </span>
              ) : null;
            })()}
          </Fragmentish>
        ))}

        {/* What the player is carrying. */}
        {Object.entries(spec.purse ?? {}).map(([what, where]) => {
          const part = worn.fieldOf(worn.find(where));
          if (!part) return null;
          const said = purseOf(money.value)[what as 'gold' | 'silver' | 'copper'] ?? '';
          if (!said) return null;
          return (
            <span key={what} style={worn.words(part, LIGHT)}>
              {said}
            </span>
          );
        })}

        {(() => {
          const part = worn.find(spec.close);
          return part ? (
            <button
              type="button"
              aria-label="Close the storage box"
              onClick={onClose}
              style={worn.box(part)}
              className={hit}
            />
          ) : null;
        })()}

        {/* The thing under the pointer while it is being carried. Without
            it a drag shows nothing at all and reads as one that failed. */}
        <ItemDragGhost />

        {/* What a thing is, on the shipped item card. */}
        {readingItem && (
          <ArtItemCard
            listing={cardFor(readingItem)}
            wears={HELD_CARD}
            actions={heldActions(readingItem, () => setReading(null))}
            anchor={beside}
            canCompare={equipmentHomesFor(
              // Only worth offering where something of the same kind is
              // already worn to hold it up against.
              cardFor(readingItem).facts?.inventoryType ?? 0,
            ).some(slot => equippedSlots.value[slot])}
            onClose={() => setReading(null)}
          />
        )}
      </div>
    </div>
  );
}

/** A group with a key, which is all a fragment is short of. */
function Fragmentish({ children }: { children: preact.ComponentChildren }): JSX.Element {
  return <>{children}</>;
}
