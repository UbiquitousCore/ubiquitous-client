import type { ZoneInfo } from '../../../assets/types';
import { withinBounds } from './zoneBounds';

/**
 * Which top zone owns a position on a map.
 *
 * A "top zone" is not "a zone with no parent" — the table has several
 * rootless placeholders with nonsense bounds that would swallow half a
 * continent. `topPriorities` names the rows that actually divide a map.
 */
export function pickTopZoneAt(
  zones: readonly ZoneInfo[],
  mapId: number,
  at: readonly [number, number, number],
  topPriorities: ReadonlySet<number>,
): ZoneInfo | null {
  let best: ZoneInfo | null = null;
  for (const zone of zones) {
    if (zone.mapId !== mapId || !topPriorities.has(zone.priority)) continue;
    if (!withinBounds(zone.bounds, at)) continue;
    if (!best || best.priority <= zone.priority) best = zone;
  }
  return best;
}
