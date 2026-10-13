import type { ZoneInfo } from '../assets/types';

/**
 * `priority` values that mark the zones a map divides into. Everything else
 * is a detail zone inside one of them, or a placeholder.
 */
export const TOP_ZONE_PRIORITIES: ReadonlySet<number> = new Set([1, 2]);

/** Ground area of a zone's bounds, in square world units. */
export function zoneArea(z: ZoneInfo): number {
  const [minX, minZ, maxX, maxZ] = z.bounds;
  return Math.abs(maxX - minX) * Math.abs(maxZ - minZ);
}

/** What `?zone=` asked for: an id, a name, or neither. */
export interface ZoneWish {
  id: number | null;
  name: string | null;
}

export interface StartingZone {
  zone: ZoneInfo;
  /** Why the zone asked for could not be opened, or null when nothing went wrong. */
  problem: string | null;
}

/**
 * The zone to open offline: an id wins over a name; names are not unique,
 * so the largest exact match, else a partial one. Otherwise a top zone with
 * scenery on the most finely divided map. `zones` must not be empty.
 */
export function startingZone(zones: readonly ZoneInfo[], wish: ZoneWish): StartingZone {
  const fallback = busiestTopZone(zones) ?? zones.find(z => z.hasScenery) ?? zones[0]!;

  if (wish.id !== null) {
    const byId = zones.find(z => z.id === wish.id);
    if (byId) return { zone: byId, problem: null };
    return { zone: fallback, problem: `zone id ${wish.id} not found; opened ${fallback.name}` };
  }

  if (wish.name === null) return { zone: fallback, problem: null };

  const wanted = wish.name.toLowerCase();
  const largestOf = (found: ZoneInfo[]): ZoneInfo | undefined =>
    found.sort((a, b) => zoneArea(b) - zoneArea(a))[0];
  const named =
    largestOf(zones.filter(z => z.name.toLowerCase() === wanted)) ??
    largestOf(zones.filter(z => z.name.toLowerCase().includes(wanted)));
  if (named) return { zone: named, problem: null };
  return { zone: fallback, problem: `zone "${wish.name}" not found; opened ${fallback.name}` };
}

/** The first top-level zone with scenery on the map holding the most zones. */
function busiestTopZone(zones: readonly ZoneInfo[]): ZoneInfo | undefined {
  const perMap = new Map<number, number>();
  for (const z of zones) perMap.set(z.mapId, (perMap.get(z.mapId) ?? 0) + 1);
  let best: ZoneInfo | undefined;
  for (const z of zones) {
    if (!TOP_ZONE_PRIORITIES.has(z.priority) || !z.hasScenery) continue;
    if (!best || perMap.get(z.mapId)! > perMap.get(best.mapId)!) best = z;
  }
  return best;
}

/** Where the server put the hero: a map, and a point on it. */
export interface ArrivalSpawn {
  mapId: number;
  position: [number, number, number];
}

/**
 * The zone to load for an arrival, with what is worth saying about the
 * choice, in order. Many zones share one map, so the spawn point picks
 * between them: the smallest whose bounds contain it, else the largest on
 * that map. A map the data has no zone for falls back to the wish.
 */
export function zoneForArrival(
  zones: readonly ZoneInfo[],
  spawn: ArrivalSpawn | null,
  wish: ZoneWish,
): { zone: ZoneInfo; problems: string[] } {
  const problems: string[] = [];
  if (spawn !== null) {
    const [sx, , sz] = spawn.position;
    const onMap = zones.filter(z => z.mapId === spawn.mapId);

    if (onMap.length === 0) {
      problems.push(`server put us on map ${spawn.mapId}, which the mounted data has no zone for`);
    } else {
      const containing = onMap
        .filter(
          z => sx >= z.bounds[0] && sz >= z.bounds[1] && sx <= z.bounds[2] && sz <= z.bounds[3],
        )
        .sort((a, b) => zoneArea(a) - zoneArea(b));
      if (containing.length > 0) return { zone: containing[0]!, problems };

      const largest = onMap.sort((a, b) => zoneArea(b) - zoneArea(a))[0]!;
      problems.push(
        `position (${sx.toFixed(0)}, ${sz.toFixed(0)}) is outside every zone on map ` +
          `${spawn.mapId}; opened ${largest.name}`,
      );
      return { zone: largest, problems };
    }
  }

  const picked = startingZone(zones, wish);
  if (picked.problem) problems.push(picked.problem);
  return { zone: picked.zone, problems };
}
