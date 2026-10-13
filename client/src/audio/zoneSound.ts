/** Music and ambience for a spot: own choice, the innermost zone with each decides, looked up separately. */

import type { ZoneInfo } from '../assets/types';

export interface ZoneSoundChoice {
  /** The innermost zone around the spot, which a fight's music is looked up by. */
  zoneId: number;
  /** `c_sound` ids, 0 for silence. */
  music: number;
  ambience: number;
}

function contains(zone: ZoneInfo, x: number, z: number): boolean {
  const [x1, z1, x2, z2] = zone.bounds;
  return (
    x >= Math.min(x1, x2) && x <= Math.max(x1, x2) && z >= Math.min(z1, z2) && z <= Math.max(z1, z2)
  );
}

function area(zone: ZoneInfo): number {
  const [x1, z1, x2, z2] = zone.bounds;
  return Math.abs((x2 - x1) * (z2 - z1));
}

/** The music and ambience at (x, z) on `mapId`, or null outside every zone. */
export function zoneSoundAt(
  zones: readonly ZoneInfo[],
  mapId: number,
  x: number,
  z: number,
): ZoneSoundChoice | null {
  // Innermost first: a zone inside another is smaller than it.
  const around = zones
    .filter(zone => zone.mapId === mapId && contains(zone, x, z))
    .sort((a, b) => area(a) - area(b));
  if (!around.length) return null;

  // A place's parent may not contain the spot on its own bounds; the parent
  // chain still says whose music a place borrows.
  const byId = new Map(zones.map(zone => [zone.id, zone]));
  const outwards: ZoneInfo[] = [];
  const seen = new Set<number>();
  for (let zone: ZoneInfo | undefined = around[0]; zone && !seen.has(zone.id); ) {
    seen.add(zone.id);
    outwards.push(zone);
    zone = byId.get(zone.parentId);
  }
  // Anything else around the spot the chain missed comes after, innermost first.
  for (const zone of around) if (!seen.has(zone.id)) outwards.push(zone);

  return {
    zoneId: around[0].id,
    music: outwards.find(zone => zone.sound.music)?.sound.music ?? 0,
    ambience: outwards.find(zone => zone.sound.ambience)?.sound.ambience ?? 0,
  };
}
