/** Open-card vs closed-shell test from boundary-edge share (culling is wrong
 * for cards: hair/capes/banners/strings). */

/** Share of a group's edges used by one triangle only, above which it is a card. */
export const OPEN_MESH_FRACTION = 0.1;

/**
 * The share of edges in an index range that belong to exactly one triangle.
 * 0 for a closed shell, up toward 1 for a lone strip.
 */
export function openEdgeFraction(
  indices: ArrayLike<number>,
  start = 0,
  count = indices.length,
): number {
  const uses = new Map<number, number>();
  const end = Math.min(indices.length, start + count);
  let edges = 0;
  for (let i = start; i + 2 < end; i += 3) {
    const a = indices[i]!,
      b = indices[i + 1]!,
      c = indices[i + 2]!;
    for (const [p, q] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      if (p === q) continue;
      // One number per unordered pair: the smaller index in the high bits.
      const key = p < q ? p * 4294967296 + q : q * 4294967296 + p;
      const seen = uses.get(key) ?? 0;
      if (seen === 0) edges++;
      uses.set(key, seen + 1);
    }
  }
  if (edges === 0) return 0;
  let open = 0;
  for (const n of uses.values()) if (n === 1) open++;
  return open / edges;
}

/** Whether a draw group is open enough that culling it would show holes. */
export function isOpenGroup(indices: ArrayLike<number>, start: number, count: number): boolean {
  return openEdgeFraction(indices, start, count) >= OPEN_MESH_FRACTION;
}
