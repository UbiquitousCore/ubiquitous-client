import type { MapRegion } from '../../../ui/mapModel';

/** The regions the world map can open, in area.cnfg order. */
export function listedWorldRegions(
  regionIds: readonly number[],
  mapped: ReadonlySet<number>,
  resolve: (id: number) => MapRegion | null,
): MapRegion[] {
  const seen = new Set<number>();
  const out: MapRegion[] = [];
  for (const id of regionIds) {
    if (!id || seen.has(id) || !mapped.has(id)) continue;
    const region = resolve(id);
    if (!region) continue;
    seen.add(id);
    out.push(region);
  }
  return out;
}
