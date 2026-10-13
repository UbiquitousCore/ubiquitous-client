/** Hero screen placement with a covering window (asymmetric frustum, not a
 * moved canvas). */

/** Edges of the covered rectangle, in CSS pixels of the viewport. */
export interface ViewCover {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The centre of the largest uncovered band beside, above or below the cover,
 * however narrow, or the viewport's own centre when
 * nothing covers it, or when the cover leaves nothing at all.
 */
export function uncoveredCentre(
  cover: ViewCover | null,
  width: number,
  height: number,
): { x: number; y: number } {
  const whole = { x: width / 2, y: height / 2 };
  if (!cover || width <= 0 || height <= 0) return whole;

  const bands = [
    { area: Math.max(0, cover.left) * height, x: cover.left / 2, y: height / 2 },
    {
      area: Math.max(0, width - cover.right) * height,
      x: (cover.right + width) / 2,
      y: height / 2,
    },
    { area: Math.max(0, cover.top) * width, x: width / 2, y: cover.top / 2 },
    {
      area: Math.max(0, height - cover.bottom) * width,
      x: width / 2,
      y: (cover.bottom + height) / 2,
    },
  ];
  let best = bands[0]!;
  for (const band of bands) if (band.area > best.area) best = band;
  if (best.area <= 0) return whole;
  return { x: best.x, y: best.y };
}
