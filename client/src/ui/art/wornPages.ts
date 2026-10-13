/**
 * Turning the pages of a strip that slides under a window: a swipe across
 * it, or a press on one of the dots under it.
 */

/** How far a press must travel across the window, in pixels, to turn a page. */
export const SWIPE_PX = 24;

/**
 * The page a swipe lands on. Dragging leftwards brings in the page to the
 * right, as a finger pulls paper; a drag shorter than `SWIPE_PX` stays put,
 * and there is no page before the first or after the last.
 */
export function pageAfterSwipe(page: number, count: number, dragged: number): number {
  if (Math.abs(dragged) < SWIPE_PX) return page;
  const next = dragged < 0 ? page + 1 : page - 1;
  return Math.min(Math.max(next, 0), Math.max(count - 1, 0));
}

/** A path inside the strip, as the strip's own picture names it. */
export function insideStrip(path: string, strip: string | undefined): string {
  return strip && path.startsWith(`${strip}/`) ? path.slice(strip.length + 1) : path;
}
