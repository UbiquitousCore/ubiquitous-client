import type { ZoneInfo } from '../../../assets/types';
import { boundsArea, withinBounds } from './zoneBounds';

/** The smallest matching zone on the map, or the map's largest zone. */
export function pickZoneAt(
  zones: readonly ZoneInfo[],
  mapId: number,
  position: [number, number, number],
): ZoneInfo | null {
  const onMap = zones.filter(zone => zone.mapId === mapId);
  if (!onMap.length) return null;
  const containing = onMap
    .filter(zone => withinBounds(zone.bounds, position))
    .sort((a, b) => boundsArea(a.bounds) - boundsArea(b.bounds));
  return (
    containing[0] ?? onMap.sort((a, b) => boundsArea(b.bounds) - boundsArea(a.bounds))[0] ?? null
  );
}
