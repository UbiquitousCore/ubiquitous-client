/** Smallest width used to scale a drag, so a collapsed canvas cannot divide by zero. */
const MIN_WIDTH_PX = 1;

/** Own choice: a swipe this long is one full turn however wide the preview is. */
const FULL_TURN_PX = 360;

/**
 * Radians a horizontal drag turns the character preview. Scaled by the
 * preview's on-screen width, capped at a phone-sized swipe: a wide preview
 * would otherwise need a swipe longer than a phone screen to turn.
 */
export function previewTurn(dragPx: number, canvasWidthPx: number): number {
  const reach = Math.min(Math.max(canvasWidthPx, MIN_WIDTH_PX), FULL_TURN_PX);
  return (dragPx / reach) * Math.PI * 2;
}
