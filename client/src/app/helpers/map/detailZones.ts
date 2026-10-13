import type { ZoneInfo } from '../../../assets/types';

/** Named places inside a top zone — the zone table marks them with one priority. */
export function detailZonesInTop(
  zones: readonly ZoneInfo[],
  topZoneId: number,
  detailPriority: number,
): ZoneInfo[] {
  return zones.filter(zone => zone.parentId === topZoneId && zone.priority === detailPriority);
}
