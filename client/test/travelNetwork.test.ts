/**
 * The teleport network: departing, and what is reachable.
 *
 * Tables in, answers out. No world, no renderer, no socket.
 */

import { describe, expect, it } from 'vitest';

import { TravelNetwork } from '../src/gameplay/TravelNetwork';
import type { TeleportStop } from '../src/gameplay/TravelNetwork';

const REACH = 10;

function stop(over: Partial<TeleportStop> & { id: number }): TeleportStop {
  return {
    name: `stop ${over.id}`,
    mapId: 1,
    position: [0, 0, 0],
    type: 0,
    ...over,
  };
}

describe('the stop a player can depart from', () => {
  it('is the one they are standing within reach of', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 7, position: [100, 0, 0] })], []);

    expect(net.stopAt([100, 0, 0], 1)).toBe(7);
    expect(net.stopAt([100 + REACH - 1, 0, 0], 1)).toBe(7);
  });

  it('is none at all once they step out of reach', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 7, position: [100, 0, 0] })], []);

    expect(net.stopAt([100 + REACH + 1, 0, 0], 1)).toBeNull();
  });

  it('is the nearest when two overlap, not the first written down', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 1, position: [0, 0, 0] }), stop({ id: 2, position: [3, 0, 0] })], []);

    // Standing nearer the second: the second is the departure.
    expect(net.stopAt([3, 0, 0], 1)).toBe(2);
    expect(net.stopAt([0, 0, 0], 1)).toBe(1);
  });

  it('ignores a stop on another map, however close the coordinates look', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 7, mapId: 2, position: [0, 0, 0] })], []);

    expect(net.stopAt([0, 0, 0], 1)).toBeNull();
    expect(net.stopAt([0, 0, 0], 2)).toBe(7);
  });

  it('ignores a destination-only stop, which buys nothing to stand on', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 7, type: 1, position: [0, 0, 0] })], []);

    expect(net.stopAt([0, 0, 0], 1)).toBeNull();
  });

  it('measures on the ground plane, so height does not put a stop out of reach', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 7, position: [0, 0, 0] })], []);

    // Standing on a bridge over the stop still departs from it, which is how
    // the player walks to it and how the server measures it.
    expect(net.stopAt([0, REACH + 100, 0], 1)).toBe(7);
  });
});

describe('what a journey costs from here', () => {
  it('is the cheapest chain, not the direct leg', () => {
    const net = new TravelNetwork(REACH);
    net.load(
      [],
      [
        { from: 1, to: 2, price: 100 },
        { from: 1, to: 3, price: 10 },
        { from: 3, to: 2, price: 10 },
      ],
    );

    // Round through 3 is cheaper than the one-hop price.
    expect(net.faresFrom(1).get(2)).toBe(20);
  });

  it('offers nothing when the player is at no stop', () => {
    const net = new TravelNetwork(REACH);
    net.load([], [{ from: 1, to: 2, price: 10 }]);

    expect(net.faresFrom(null).size).toBe(0);
  });

  it('leaves an unreachable stop out entirely, the way the server answers nothing', () => {
    const net = new TravelNetwork(REACH);
    net.load(
      [],
      [
        { from: 1, to: 2, price: 10 },
        { from: 8, to: 9, price: 10 },
      ],
    );

    const fares = net.faresFrom(1);
    expect(fares.has(2)).toBe(true);
    expect(fares.has(9)).toBe(false);
  });
});

describe('looking a stop up', () => {
  it('finds it by id, and says so when there is none', () => {
    const net = new TravelNetwork(REACH);
    net.load([stop({ id: 7, name: 'Test Vale' })], []);

    expect(net.stopById(7)?.name).toBe('Test Vale');
    expect(net.stopById(8)).toBeUndefined();
  });

  it('holds nothing before the tables are loaded', () => {
    const net = new TravelNetwork(REACH);

    expect(net.stops).toEqual([]);
    expect(net.routes).toEqual([]);
    expect(net.stopAt([0, 0, 0], 1)).toBeNull();
  });
});
