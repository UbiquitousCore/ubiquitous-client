/** `[minX, minZ, maxX, maxZ]` contains this position, on the ground plane. */
export function withinBounds(
  bounds: readonly [number, number, number, number],
  at: readonly [number, number, number],
): boolean {
  return (
    at[0] >= Math.min(bounds[0], bounds[2]) &&
    at[0] <= Math.max(bounds[0], bounds[2]) &&
    at[2] >= Math.min(bounds[1], bounds[3]) &&
    at[2] <= Math.max(bounds[1], bounds[3])
  );
}

export function boundsArea(bounds: readonly [number, number, number, number]): number {
  return Math.abs(bounds[2] - bounds[0]) * Math.abs(bounds[3] - bounds[1]);
}
