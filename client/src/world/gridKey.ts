/**
 * One number for a grid cell, so a spatial lookup allocates nothing.
 *
 * Exact while `cz` stays within ±32,768 cells; past that two cells share a
 * key. At 4-unit collision cells that is ±131,072 units, far wider than any map.
 */
export function gridKey(cx: number, cz: number): number {
  return cx * 65536 + cz;
}
