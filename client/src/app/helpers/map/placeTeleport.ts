import type { ZoneInfo } from '../../../assets/types';
import { BUS_STOP_TYPE, type TeleportStop } from '../../../gameplay/TravelNetwork';
import { withinBounds } from './zoneBounds';

/** The bus stop, if any, that makes this place a reachable teleport destination. */
export function reachableStopForPlace(
  place: ZoneInfo,
  gatewayRegion: ZoneInfo | null,
  topMapId: number,
  fares: ReadonlyMap<number, number>,
  stops: readonly TeleportStop[],
): TeleportStop | undefined {
  return stops.find(
    candidate =>
      candidate.type === BUS_STOP_TYPE &&
      fares.has(candidate.id) &&
      (gatewayRegion
        ? candidate.mapId === gatewayRegion.mapId &&
          withinBounds(gatewayRegion.bounds, candidate.position)
        : candidate.mapId === topMapId && withinBounds(place.bounds, candidate.position)),
  );
}
