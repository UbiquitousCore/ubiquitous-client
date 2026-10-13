/** Minimap marks as offsets from the fixed player, in disc radii. */

import type { MinimapWindow } from '../../world/minimap';
import type { MapMarkerKind } from '../mapModel';

/** How far out, in disc radii, an arrow for something off the disc stands. */
export const RIM_RADIUS = 0.86;

export interface MinimapMark {
  /** Offset from the disc's centre, in disc radii. East is positive. */
  x: number;
  /** South is positive, as the map is drawn. */
  y: number;
  /**
   * True where the thing is past the disc and this is an arrow on the rim
   * pointing at it, rather than the thing itself.
   */
  pointing: boolean;
  /** Turn, in radians clockwise from straight up, that points an upright arrow at the thing. */
  bearing: number;
}

/** A thing's mark, or null; only a quest location stays off-disc, as a rim arrow. */
export function minimapMark(
  kind: Exclude<MapMarkerKind, 'player'>,
  position: readonly [number, number, number],
  player: readonly [number, number, number],
  halfWorld: number,
): MinimapMark | null {
  const dx = position[0] - player[0];
  const dz = position[2] - player[2];
  const away = Math.hypot(dx, dz) / halfWorld;
  const bearing = Math.atan2(dx, -dz);
  if (away < RIM_RADIUS) return { x: dx / halfWorld, y: dz / halfWorld, pointing: false, bearing };
  if (kind !== 'quest')
    return away < 1 ? { x: dx / halfWorld, y: dz / halfWorld, pointing: false, bearing } : null;
  return {
    x: Math.sin(bearing) * RIM_RADIUS,
    y: -Math.cos(bearing) * RIM_RADIUS,
    pointing: true,
    bearing,
  };
}

/** The composite as a scaled, positioned CSS background, standing in for UVs; the patch always covers the window. */
export function minimapBackground(window: MinimapWindow): { size: string; position: string } {
  const scale = 1 / (2 * window.radius);
  const place = (centre: number): number => ((centre * scale - 0.5) / (scale - 1)) * 100;
  return {
    size: `${scale * 100}% ${scale * 100}%`,
    position: `${place(window.u)}% ${place(window.v)}%`,
  };
}

/**
 * The turn, in radians clockwise, that points an arrow drawn facing up the
 * way a body at `yaw` faces. A body at yaw faces (sin yaw, cos yaw) in
 * (east, south), so yaw zero is south and a quarter turn is east.
 */
export function arrowTurn(yaw: number): number {
  return Math.atan2(Math.sin(yaw), -Math.cos(yaw));
}
