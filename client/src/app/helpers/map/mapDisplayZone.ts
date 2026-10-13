import { withinBounds } from './zoneBounds';

interface DisplayZone {
  mapId: number;
  bounds: [number, number, number, number];
}

/** Whether the map can stay on its current displayed region. */
export function containsMapDisplayZone(
  current: DisplayZone | null,
  mapId: number,
  at: [number, number, number],
): boolean {
  return !!current && current.mapId === mapId && withinBounds(current.bounds, at);
}
