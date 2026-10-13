import { describe, expect, it } from 'vitest';

import { busFaresFrom } from '../src/gameplay/busRoutes';

// 1 -10- 2 -20- 3, with a 45 leg straight from 1 to 3, and 7 -5- 8 off on their own.
const LEGS = [
  { from: 1, to: 2, price: 10 },
  { from: 2, to: 3, price: 20 },
  { from: 1, to: 3, price: 45 },
  { from: 7, to: 8, price: 5 },
];

describe('busFaresFrom', () => {
  it('charges the cheapest chain of legs, not the direct one', () => {
    // Two hops at 10 + 20 beat the single 45 leg, so the fare is 30.
    const fares = busFaresFrom(LEGS, 1);
    expect(fares.get(2)).toBe(10);
    expect(fares.get(3)).toBe(30);
  });

  it('is undirected, whichever way the row is written', () => {
    expect(busFaresFrom(LEGS, 3).get(1)).toBe(30);
  });

  it('never offers the stop you are standing at', () => {
    expect(busFaresFrom(LEGS, 1).has(1)).toBe(false);
  });

  it('leaves out anything with no chain to it', () => {
    // The other component is real but unreachable from here, and the server
    // answers a request for it with silence rather than a refusal.
    const fares = busFaresFrom(LEGS, 1);
    expect(fares.has(7)).toBe(false);
    expect(fares.has(8)).toBe(false);
  });

  it('offers nothing at all from a stop with no legs', () => {
    // Ten of 2.2.0's bus stops are like this.
    expect([...busFaresFrom(LEGS, 99).keys()]).toEqual([]);
  });
});
