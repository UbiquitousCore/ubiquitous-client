/** A run of numbered slots and its pages (market bag, strongbox, trade); contents and presses stay with the screen. */

import type { PiecePart } from './piecePlan';

export interface SlotRun {
  /** The name every slot in the run carries, before its number. */
  slot: string;
  /** Laid out as points: a slot that draws nothing is still a slot. */
  driven?: boolean;
  /** The name's number is the slot (a run round a body); otherwise reading order decides. */
  numbered?: boolean;
  /** The part the run sits in, where the same name is used twice over. */
  within?: string;
  /** Parts holding slots of the same name that are not this run. */
  except?: readonly string[];
}

/** The number a slot's name ends in, which is which slot it is. */
function numberIn(path: string): number {
  const said = /(\d+)$/.exec(path);
  return said ? Number(said[1]) : 0;
}

/** A run's slots in reading order by position: authored numbering need not match the layout. */
export function slotsOf(parts: readonly PiecePart[], run: SlotRun): PiecePart[] {
  const numbered = new RegExp(`/${run.slot}\\d+$|^${run.slot}\\d+$`);
  return parts
    .filter(
      part =>
        (part.draws || run.driven) &&
        numbered.test(part.path) &&
        (!run.within || part.path.startsWith(`${run.within}/`)) &&
        !(run.except ?? []).some(other => part.path.includes(`/${other}/`)),
    )
    .sort((a, b) =>
      run.numbered ? numberIn(a.path) - numberIn(b.path) : a.box.y - b.box.y || a.box.x - b.box.x,
    );
}

/** Pages a store fills; an empty store is still one page, not none. */
export function pagesFor(capacity: number, perPage: number): number {
  if (perPage <= 0) return 1;
  return capacity > 0 ? Math.floor((capacity - 1) / perPage) + 1 : 1;
}

/** How the screen writes which page of how many is showing. */
export function pageLabel(page: number, pages: number): string {
  return `${page + 1} / ${pages}`;
}
