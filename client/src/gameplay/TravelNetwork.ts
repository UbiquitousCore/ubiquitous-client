/**
 * The teleport network from the build's tables: stops, and fares as the
 * cheapest chain of legs. Decides what to offer only; the server prices
 * the journey and ignores unreachable pairs.
 */

import { busFaresFrom } from './busRoutes';
import type { BusLeg } from './busRoutes';

/** One place on the network, as its row carries it. */
export interface TeleportStop {
  id: number;
  name: string;
  mapId: number;
  position: [number, number, number];
  type: number;
}

/**
 * Stop type 0 is a bus stop — somewhere a journey can start. The others are
 * destinations only, and standing on one buys nothing.
 */
export const BUS_STOP_TYPE = 0;

/** Squared distance on the ground plane. Height is deliberately ignored:
 *  reach to a stop is measured the way the player walks to it. */
function flatDistance2(a: [number, number, number], b: [number, number, number]): number {
  return (a[0] - b[0]) ** 2 + (a[2] - b[2]) ** 2;
}

export class TravelNetwork {
  private stopList: readonly TeleportStop[] = [];
  private legs: readonly BusLeg[] = [];

  /**
   * @param reach How close a player must stand to a stop to depart from it.
   *   The server's own interaction reach, because the server applies it to
   *   the *departure* stop and answers nothing when it fails.
   */
  constructor(private readonly reach: number) {}

  load(stops: readonly TeleportStop[], legs: readonly BusLeg[]): void {
    this.stopList = stops;
    this.legs = legs;
  }

  get stops(): readonly TeleportStop[] {
    return this.stopList;
  }

  stopById(id: number): TeleportStop | undefined {
    return this.stopList.find(stop => stop.id === id);
  }

  /**
   * The bus stop a player at this position could depart from, or null.
   *
   * The nearest one within reach on the same map. Nearest rather than first,
   * because two stops can overlap and the server picks by distance.
   */
  stopAt(position: [number, number, number], mapId: number): number | null {
    let best: { id: number; d2: number } | null = null;
    for (const stop of this.stopList) {
      if (stop.type !== BUS_STOP_TYPE || stop.mapId !== mapId) continue;
      const d2 = flatDistance2(stop.position, position);
      if (d2 > this.reach * this.reach) continue;
      if (!best || d2 < best.d2) best = { id: stop.id, d2 };
    }
    return best?.id ?? null;
  }

  /** What every stop reachable from here costs. Empty when nowhere is. */
  faresFrom(stopId: number | null): Map<number, number> {
    if (stopId === null) return new Map();
    return busFaresFrom(this.legs, stopId);
  }

  /** Every leg, for drawing the network on a map. */
  get routes(): readonly BusLeg[] {
    return this.legs;
  }
}
