/** Smallest width used to scale a drag, so a collapsed canvas cannot divide by zero. */
const MIN_WIDTH_PX = 1;

/**
 * Radians a horizontal drag turns the character preview. Scaled by the
 * canvas width, so a swipe across the preview is one full turn on a phone as
 * on a desktop; a fixed radians-per-pixel turned a narrow screen barely at all.
 */
export function previewTurn(dragPx: number, canvasWidthPx: number): number {
  return (dragPx / Math.max(canvasWidthPx, MIN_WIDTH_PX)) * Math.PI * 2;
}
