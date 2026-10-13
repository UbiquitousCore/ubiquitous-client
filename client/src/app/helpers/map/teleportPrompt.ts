import type { ZoneInfo } from '../../../assets/types';
import type { TeleportStop } from '../../../gameplay/TravelNetwork';
import { withinBounds } from './zoneBounds';

/** The name shown on a teleport-fare prompt for a destination stop. */
export function teleportDestinationName(
  stopId: number,
  stop: TeleportStop | undefined,
  zones: readonly ZoneInfo[],
  detailZonePriority: number,
): string {
  if (!stop) return `stop ${stopId}`;
  const home = zones.find(
    zone =>
      zone.priority === detailZonePriority &&
      zone.mapId === stop.mapId &&
      withinBounds(zone.bounds, stop.position),
  );
  return home?.name || stop.name;
}
