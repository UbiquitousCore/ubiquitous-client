import type { ZoneInfo } from '../../../assets/types';
import { withinBounds } from './zoneBounds';

/**
 * The name of the named place a position stands in, or empty where it is in
 * none of them (open ground between places, or on another map).
 */
export function placeNameAt(
  places: readonly Pick<ZoneInfo, 'name' | 'mapId' | 'bounds'>[],
  mapId: number | undefined,
  position: readonly [number, number, number],
): string {
  const home = places.find(place => place.mapId === mapId && withinBounds(place.bounds, position));
  return home?.name ?? '';
}
