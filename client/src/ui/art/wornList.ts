/**
 * A run of rows shown through a mask, for any listing screen; the screen
 * owns row contents and presses. Rows never move: the same rows are
 * rewritten further down the list, so it steps a row at a time.
 */

import { useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';

import { isNamed } from './piecePlan';
import type { PiecePart } from './piecePlan';
import type { ListingSpec } from './uiSpec';
import type { Worn } from './useWorn';

/** One row on screen: the art it sits on, its fields, and what is in it. */
export interface WornListRow<T> {
  row: PiecePart;
  /** Everything inside the row, for finding a field or a picture slot. */
  fields: PiecePart[];
  item: T;
  /** Where in the whole list this row's thing is. */
  at: number;
}

/** What the list looks like at one scroll position. */
export interface ListSlice<T> {
  /** How many rows the window has room for, whatever the list holds. */
  roomFor: number;
  /** The first row of the list that is on screen. */
  from: number;
  /** The furthest the list can be scrolled and still fill its window. */
  furthest: number;
  /** What is on screen, in the order the rows are drawn. */
  shown: readonly T[];
  /** The rows a thing is written into, by path. */
  keptRows: readonly string[];
  /** Everything the picture must leave out for this to be what it shows. */
  hidden: readonly string[];
  /** Measured, never drawn here: marks slide, which a drawn picture cannot. */
  marks: readonly string[];
}

/** Every row of a run, in the order they are laid out. */
export function rowsOf(parts: readonly PiecePart[], row: string): PiecePart[] {
  const at = new RegExp(`${row}\\d+$`);
  return parts.filter(part => at.test(part.path)).sort((a, b) => a.box.y - b.box.y);
}

/** How far past its window's edge a row may run and still count as whole, in movie units. */
const EDGE = 1;

/** The rows whose middle falls inside the window the list shows through. */
export function rowsInView(rows: readonly PiecePart[], view: PiecePart | undefined): PiecePart[] {
  if (!view) return [...rows];
  return rows.filter(row => {
    const middle = row.box.y + row.box.h / 2;
    return middle >= view.box.y && middle <= view.box.y + view.box.h;
  });
}

export interface ListSliceOptions<T> {
  /** The part the list lives in, where a screen keeps more than one. */
  within?: string;
  list: ListingSpec | undefined;
  items: readonly T[];
  /** How far down the list has been scrolled, in rows. */
  scroll: number;
  /** What each field of a row reads, which decides which coins are drawn. */
  values?(item: T): Record<string, string>;
}

/** The window onto a list, from the fully shown screen, so visible and hidden rows cannot disagree. */
export function listSlice<T>(
  whole: readonly PiecePart[],
  { within, list, items, scroll, values }: ListSliceOptions<T>,
): ListSlice<T> {
  const mine = within ? whole.filter(part => part.path.startsWith(`${within}/`)) : whole;
  const view = list?.viewport ? mine.find(part => isNamed(part, list.viewport ?? '')) : undefined;
  const inWindow = list ? rowsInView(rowsOf(mine, list.row), view) : [];
  const roomFor = inWindow.length;
  // A window can end partway down its last row, which then shows only its
  // top. Scrolled right down, the last thing belongs in the last row that
  // fits whole, so the list scrolls one row further for each that does not.
  const fitWhole = view
    ? inWindow.filter(row => row.box.y + row.box.h <= view.box.y + view.box.h + EDGE).length
    : roomFor;
  const furthest = Math.max(0, items.length - (fitWhole || roomFor));
  const from = Math.min(Math.max(0, scroll), furthest);
  const shown = items.slice(from, from + roomFor);

  // Only as many rows as there is something to write into: a row kept
  // with nothing in it still draws its own rule and its own coins, and an
  // empty table ruled into rows reads as a table that failed to fill.
  const keptRows = inWindow.slice(0, shown.length).map(row => row.path);
  const hiddenRows = (list ? rowsOf(whole, list.row) : [])
    .map(row => row.path)
    .filter(path => !keptRows.includes(path));

  // The figure and the coin beside it go together: writing nothing where
  // the gold should be and leaving the gold piece there reads as a price
  // the screen failed to fill in.
  const hiddenCoins =
    list?.coins && values
      ? keptRows.flatMap((path, at) => {
          const item = shown[at];
          if (item === undefined) return [];
          const said = values(item);
          return Object.entries(list.coins ?? {}).flatMap(([field, coin]) =>
            said[field] ? [] : [`${path}/${coin}`],
          );
        })
      : [];

  // Run-on marks show only where there is more. Always cut out of the
  // picture (drawn marks cannot slide); `WornChevrons` draws the right ones.
  const marks = [
    list?.more?.above ?? '',
    list?.more?.below ?? '',
    list?.scroll?.up ?? '',
    list?.scroll?.down ?? '',
  ].filter(Boolean);

  return {
    roomFor,
    from,
    furthest,
    shown,
    keptRows,
    marks,
    hidden: [...hiddenRows, ...hiddenCoins, ...(list?.bar && furthest <= 0 ? [list.bar] : [])],
  };
}

/** Pair the drawn picture's own parts with what goes in each row. */
export function rowsIn<T>(parts: readonly PiecePart[], slice: ListSlice<T>): WornListRow<T>[] {
  return slice.keptRows.flatMap((path, at) => {
    const row = parts.find(part => part.path === path);
    const item = slice.shown[at];
    if (!row || item === undefined) return [];
    return [{ row, fields: parts.filter(part => part.path.startsWith(`${path}/`)), item, at }];
  });
}

/** How far a list has been scrolled, and the ways of changing it. */
export interface ListScroll {
  at: number;
  to(row: number): void;
  reset(): void;
  step(by: number, furthest: number): void;
  /** A wheel or trackpad moved this many pixels over rows this tall. */
  wheel(pixels: number, rowHeight: number, furthest: number): void;
  press(y: number): void;
  drag(y: number, rowHeight: number, furthest: number): void;
  release(): void;
}

export function useListScroll(): ListScroll {
  const [at, setAt] = useState(0);
  /** Where a finger went down, and where the list stood when it did. */
  const dragging = useRef<{ y: number; from: number } | null>(null);
  /** Wheel travel not yet worth a whole row. */
  const carried = useRef(0);
  return {
    at,
    to: row => setAt(Math.max(0, row)),
    reset: () => setAt(0),
    step: (by, furthest) => setAt(was => Math.max(0, Math.min(furthest, was + by))),
    wheel: (pixels, rowHeight, furthest) => {
      if (!rowHeight) {
        setAt(was => Math.max(0, Math.min(furthest, was + Math.sign(pixels))));
        return;
      }
      // A trackpad sends a stream of small movements and a mouse wheel a
      // few large ones. Adding them up and moving a row for each row's
      // height travelled makes both move the list as far as the hand
      // did. Turning back drops whatever was carried the other way.
      if (Math.sign(pixels) !== Math.sign(carried.current)) carried.current = 0;
      carried.current += pixels;
      const rows = Math.trunc(carried.current / rowHeight);
      if (!rows) return;
      carried.current -= rows * rowHeight;
      setAt(was => Math.max(0, Math.min(furthest, was + rows)));
    },
    press: y => (dragging.current = { y, from: at }),
    drag: (y, rowHeight, furthest) => {
      const held = dragging.current;
      // A press that has not travelled half a row is a press, not a
      // drag: moving the list under a finger that is only tapping takes
      // the row it was tapping out from under it.
      if (!held || !rowHeight || Math.abs(held.y - y) < rowHeight / 2) return;
      // A finger drags the list under it: the rows move the way the
      // finger does, so dragging up brings later rows into view.
      setAt(Math.max(0, Math.min(furthest, held.from + Math.round((held.y - y) / rowHeight))));
    },
    release: () => (dragging.current = null),
  };
}

/** List gestures, taken on the whole screen (rows would swallow an overlay) and tested against the list. */
export function listGestures<T>(
  worn: Worn,
  list: ListingSpec | undefined,
  slice: ListSlice<T>,
  scroll: ListScroll,
): Pick<
  JSX.HTMLAttributes<HTMLDivElement>,
  'onWheel' | 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
> {
  const view = worn.find(list?.viewport);
  const over = (at: { clientX: number; clientY: number }): boolean => {
    const on = worn.pictureRef.current?.getBoundingClientRect();
    const frame = worn.frame;
    if (!view || !on || !frame || slice.furthest <= 0) return false;
    // Parts are measured from the frame's own corner, so a point on the
    // picture is too.
    const x = ((at.clientX - on.left) / on.width) * frame.w;
    const y = ((at.clientY - on.top) / on.height) * frame.h;
    return (
      x >= view.box.x &&
      x <= view.box.x + view.box.w &&
      y >= view.box.y &&
      y <= view.box.y + view.box.h
    );
  };
  /** How tall a row is on screen, for turning a drag into rows. */
  const rowHeight = (): number => {
    const on = worn.pictureRef.current?.getBoundingClientRect();
    const first = worn.parts.find(part => part.path === slice.keptRows[0]);
    if (!first || !on || !worn.frame) return 0;
    return (first.box.h / worn.frame.h) * on.height;
  };
  return {
    onWheel: event => {
      if (!over(event)) return;
      event.preventDefault();
      const tall = rowHeight();
      // A wheel that reports in lines or pages moves a row per line and
      // a window's worth per page.
      const perLine = tall || 1;
      const pixels =
        event.deltaMode === 1
          ? event.deltaY * perLine
          : event.deltaMode === 2
            ? event.deltaY * perLine * slice.roomFor
            : event.deltaY;
      scroll.wheel(pixels, tall, slice.furthest);
    },
    onPointerDown: event => {
      // A mouse drags a list as readily as a finger does. A press that
      // does not travel a row is still a press: `drag` only moves the
      // list once the pointer has gone a whole row, so the button under
      // it still gets its click.
      if (!over(event)) return;
      scroll.press(event.clientY);
    },
    onPointerMove: event => {
      // A pointer moving with nothing held is not dragging. A press can be
      // let go where the list never hears it — a spell carried off to the
      // action bar is dropped there — and left held, the next move over the
      // list would drag it back to where that press began.
      if (event.buttons === 0) {
        scroll.release();
        return;
      }
      scroll.drag(event.clientY, rowHeight(), slice.furthest);
    },
    onPointerUp: () => scroll.release(),
    onPointerCancel: () => scroll.release(),
  };
}
