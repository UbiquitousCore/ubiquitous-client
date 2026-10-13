/**
 * Bus fares, client-side: `t_bus_route` legs form an undirected graph, fare =
 * cheapest chain (unreachable = no fare, server answers nothing). Only
 * reachable stops are offered; the server remains the charge authority.
 */

/** One leg of the network. Undirected, however it is written in the table. */
export interface BusLeg {
  from: number;
  to: number;
  price: number;
}

/** The cheapest fare from one stop to every stop reachable from it. */
export function busFaresFrom(legs: readonly BusLeg[], start: number): Map<number, number> {
  const neighbours = new Map<number, Array<{ to: number; price: number }>>();
  for (const leg of legs) {
    // Prices are never negative, so a plain Dijkstra from the one stop
    // asked about gives every cheapest fare.
    if (!neighbours.has(leg.from)) neighbours.set(leg.from, []);
    if (!neighbours.has(leg.to)) neighbours.set(leg.to, []);
    neighbours.get(leg.from)!.push({ to: leg.to, price: leg.price });
    neighbours.get(leg.to)!.push({ to: leg.from, price: leg.price });
  }

  const best = new Map<number, number>();
  if (!neighbours.has(start)) return best;
  best.set(start, 0);
  const settled = new Set<number>();
  // The network is 67 stops; a linear scan for the next nearest is cheaper
  // than a heap and much easier to be sure of.
  for (;;) {
    let next = -1;
    let nextCost = Infinity;
    for (const [stop, cost] of best) {
      if (!settled.has(stop) && cost < nextCost) {
        next = stop;
        nextCost = cost;
      }
    }
    if (next === -1) break;
    settled.add(next);
    for (const edge of neighbours.get(next) ?? []) {
      const through = nextCost + edge.price;
      const known = best.get(edge.to);
      if (known === undefined || through < known) best.set(edge.to, through);
    }
  }
  // The stop you are standing at is not a destination.
  best.delete(start);
  return best;
}
