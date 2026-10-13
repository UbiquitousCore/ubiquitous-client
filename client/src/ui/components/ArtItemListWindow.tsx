/** What could go in an empty body place, listed beside it; pressing a row wears it. */

import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornChevrons } from '../art/WornChevrons';
import { WornRow } from '../art/WornRow';
import { WornSlot } from '../art/WornSlot';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import { itemIcons, itemName } from '../inventoryStore';
import { qualityTextClass } from '../items';
import type { InventoryItem } from '../inventoryStore';

/** Our name for this screen. The spec says which dialog wears it. */
export const ITEM_LIST_SCREEN = 'itemList';

export interface ArtItemListWindowProps {
  /** What could go in the place that was pressed, in bag order. */
  choices: readonly InventoryItem[];
  /**
   * What is worn there now, which the list shows above the rest.
   *
   * The screen keeps a section of its own for it: what is in the place
   * you pressed, over a rule, with what else could go there below.
   */
  wearing?: InventoryItem | null;
  /** Pressing what is worn there, and where on screen it was pressed. */
  onRemove?(item: InventoryItem, at: { x: number; y: number }): void;
  /** Where on screen the place was, so the list stands beside it. */
  beside?: { x: number; y: number } | null;
  /** Pressing a thing, and where on screen it was pressed. */
  onPick(item: InventoryItem, at: { x: number; y: number }): void;
  onClose(): void;
}

export function ArtItemListWindow(props: ArtItemListWindowProps): JSX.Element | null {
  const spec = useWornScreen(ITEM_LIST_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  choices,
  wearing,
  beside,
  onPick,
  onRemove,
  onClose,
  spec,
}: ArtItemListWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  const held = useRef<HTMLDivElement>(null);
  const list = spec.lists?.choices;
  const slice = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: choices, scroll: scroll.at });

  // Stands beside the place that was pressed rather than on the stage,
  // so it must not stretch the stage the sheet is standing on.
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => ({
      withoutArt: slice(whole).marks,
      hidden: [
        ...(spec.hidden ?? []),
        ...slice(whole).hidden,
        // Every row carries the mark the screen lights the chosen one
        // with. Drawn as shipped, every row reads as the chosen one, and
        // nothing is chosen here until something is pressed.
        ...(list?.chosen ? slice(whole).keptRows.map(path => `${path}/${list.chosen}`) : []),
      ],
    }),
    { floats: true, spills: true },
  );
  const shown = slice(worn.whole);
  const rows = rowsIn(worn.parts, shown);

  if (!worn.image || !worn.frame || !list) return null;

  /** How big it comes out on screen, which is not how big it was drawn. */
  const shownWide = parseFloat(String(worn.sized.width ?? '0'));
  const shownTall = parseFloat(String(worn.sized.height ?? '0'));
  /** How much of that the view has room for. */
  const fits = Math.min(
    1,
    (window.innerWidth * 0.9) / (shownWide || 1),
    (window.innerHeight * 0.9) / (shownTall || 1),
  );

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';

  /** Where a row was pressed, so what it opens stands beside that row. */
  const corner = (event: MouseEvent): { x: number; y: number } => {
    const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: on.right, y: on.top };
  };

  return (
    <div
      ref={held}
      role="dialog"
      aria-modal="false"
      aria-label="Choose what to wear"
      className="z-card pointer-events-auto fixed touch-none overflow-hidden"
      style={{
        // Beside the place that was pressed, and never off the view —
        // nor bigger than it: on a short screen the list is brought down
        // to fit rather than running past the edges.
        left: `${Math.max(0, Math.min(beside?.x ?? 0, window.innerWidth - shownWide * fits))}px`,
        top: `${Math.max(0, Math.min(beside?.y ?? 0, window.innerHeight - shownTall * fits))}px`,
        ...(fits < 1 ? { transform: `scale(${fits})`, transformOrigin: 'top left' } : {}),
      }}
      {...listGestures(worn, list, shown, scroll)}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block"
        style={worn.sized}
        draggable={false}
      />

      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

      {/* What is worn there now, in the screen's own section for it. */}
      {(() => {
        const grid = spec.grids?.equipped;
        const place = grid ? worn.find(grid.slot) : undefined;
        const field = worn.fieldOf(worn.find(spec.values?.equipped));
        if (!place || !wearing) return null;
        return (
          <Fragmentish key="wearing">
            <button
              type="button"
              aria-label={itemName(wearing)}
              onClick={(event: MouseEvent) => onRemove?.(wearing, corner(event))}
              style={worn.box(place)}
              className={hit}
            />
            <WornSlot
              worn={worn}
              slot={place}
              face={worn.parts.find(one => one.path === `${place.path}/${grid?.face}`)}
              icon={itemIcons.value.get(wearing.entry) ?? null}
              name={itemName(wearing)}
              count={wearing.count}
            />
            {field ? (
              <span
                className={qualityTextClass(wearing.quality ?? 0)}
                style={{ ...worn.words(field), color: undefined }}
              >
                {itemName(wearing)}
              </span>
            ) : null}
          </Fragmentish>
        );
      })()}

      {rows.map(({ row, fields, item }) => (
        <Fragmentish key={row.path}>
          <button
            type="button"
            aria-label={itemName(item)}
            onClick={(event: MouseEvent) => onPick(item, corner(event))}
            style={worn.box(row)}
            className={hit}
          />
          <WornRow
            worn={worn}
            fields={fields}
            list={list}
            values={{ name: itemName(item) }}
            icon={itemIcons.value.get(item.entry) ?? null}
            // The field was authored in a dark colour for a light plate
            // and this list is drawn on a dark one, so the name is given
            // a colour rather than left the one it came with. Names in
            // this interface are written in the colour of what the thing
            // is, which is exactly what this styling carries.
            styleOf={() => qualityTextClass(item.quality ?? 0)}
          />
        </Fragmentish>
      ))}

      {/* The marks that say the list runs on, each sliding the way it
          points, and each a control on this screen as well. */}
      <WornChevrons
        worn={worn}
        list={list}
        slice={shown}
        onStep={way => scroll.step(way === 'up' ? -1 : 1, shown.furthest)}
      />

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the list"
            onClick={onClose}
            style={worn.box(part)}
            className={hit}
          />
        ) : null;
      })()}
    </div>
  );
}

/** A fragment that takes a key, which `preact`'s own shorthand cannot. */
function Fragmentish({ children }: { children: (JSX.Element | null)[] }): JSX.Element {
  return <>{children}</>;
}
