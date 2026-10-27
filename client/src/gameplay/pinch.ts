/**
 * Wheel units a pinch is worth per pixel the fingers travel apart or
 * together. Own choice: a hand's span of roughly 100 px lands near one mouse
 * wheel notch, so a pinch zooms about as far as flicking the wheel.
 */
export const PINCH_WHEEL_PER_PIXEL = 1;

/**
 * The wheel delta for two fingers whose distance went from `before` to
 * `after`. Fingers spreading zoom in, which is a negative wheel delta.
 */
export function pinchWheel(before: number, after: number): number {
  return (before - after) * PINCH_WHEEL_PER_PIXEL;
}
