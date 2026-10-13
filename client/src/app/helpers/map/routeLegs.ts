import type { BusLeg } from '../../../gameplay/busRoutes';
import type { TeleportStop } from '../../../gameplay/TravelNetwork';
import type { MapRouteLeg } from '../../../ui/mapModel';
import { withinBounds } from './zoneBounds';

const BUS_STOP_TYPE = 0;

/** Bus legs drawn across the region (both ends on the map, resolved to stop zones). */
export function routeLegsForTopMap(
  topMapId: number,
  detailZones: ReadonlyArray<{
    bounds: [number, number, number, number];
    centre: [number, number];
  }>,
  stops: readonly TeleportStop[],
  routes: readonly BusLeg[],
): MapRouteLeg[] {
  const centres = new Map<number, [number, number, number]>();
  for (const stop of stops) {
    if (stop.type !== BUS_STOP_TYPE || stop.mapId !== topMapId) continue;
    const home = detailZones.find(zone => withinBounds(zone.bounds, stop.position));
    if (home) centres.set(stop.id, [home.centre[0], 0, home.centre[1]]);
  }
  const out: MapRouteLeg[] = [];
  for (const leg of routes) {
    const from = centres.get(leg.from);
    const to = centres.get(leg.to);
    if (from && to) out.push({ id: `${leg.from}-${leg.to}`, from, to });
  }
  return out;
}
