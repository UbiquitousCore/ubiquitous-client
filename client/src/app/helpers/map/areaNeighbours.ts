import type { MapDirection, MapRegion } from '../../../ui/mapModel';

/** Adjoining regions in area.cnfg order (sub-areas deliberately not steps). */
export function neighbourRegions(
  neighbourIds: readonly number[] | undefined,
  byId: ReadonlyMap<number, Pick<MapRegion, 'id' | 'name'>>,
): Array<{ direction: MapDirection; region: MapRegion }> {
  const out: Array<{ direction: MapDirection; region: MapRegion }> = [];
  const order: MapDirection[] = ['up', 'down', 'left', 'right'];
  for (const [index, direction] of order.entries()) {
    const id = neighbourIds?.[index] ?? 0;
    const zone = id ? byId.get(id) : null;
    if (zone) out.push({ direction, region: { id: zone.id, name: zone.name } });
  }
  return out;
}
