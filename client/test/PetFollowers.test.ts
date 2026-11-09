/** A pet's body: spawned beside its owner, walked after them, gone with them. Fakes only. */

import { describe, expect, it } from 'vitest';

import { FOLLOW_GAP, LOST_AT, PetFollowers, heelSpot } from '../src/gameplay/PetFollowers';
import type { PendingEntityEvent } from '../src/gameplay/NetworkBodies';
import type { Entity } from '../src/world/World';
import { isPickableEntity } from '../src/renderer/picking';

const OWNER = 7;

function rig() {
  const events: PendingEntityEvent[] = [];
  const entities = new Map<number, Entity>();
  const owner = { position: [0, 5, 0] } as unknown as Entity;
  const seen = { owner: owner as Entity | undefined };
  const pets = new PetFollowers(
    { entities } as never,
    {
      take: event => events.push(event),
      localIdOf: id => (entities.has(id) ? id : undefined),
    },
    () => seen.owner,
  );
  const tick = () => pets.update(1);
  /** The pet's body comes to exist where its spawn asked. */
  const build = () => {
    const spawned = events.find(event => event.kind === 'spawned');
    if (spawned?.kind !== 'spawned') throw new Error('nothing spawned');
    const body = { position: [...spawned.snapshot.position] } as unknown as Entity;
    entities.set(spawned.snapshot.networkId, body);
    return body;
  };
  return { events, owner, seen, pets, tick, build };
}

describe('PetFollowers', () => {
  it('spawns the entry the server named beside its owner, as a companion', () => {
    const { events, pets, tick } = rig();
    pets.setPet(OWNER, 2508);
    tick();
    const spawned = events[0];
    expect(spawned?.kind).toBe('spawned');
    if (spawned?.kind !== 'spawned') return;
    expect(spawned.snapshot.entry).toBe(2508);
    expect(spawned.snapshot.companion).toBe(true);
    expect(spawned.snapshot.networkId).toBeLessThan(0);
    expect(spawned.snapshot.position).toEqual([FOLLOW_GAP, 5, 0]);
  });

  it('waits for an owner whose body is not built yet', () => {
    const { events, seen, pets, tick } = rig();
    seen.owner = undefined;
    pets.setPet(OWNER, 2508);
    tick();
    expect(events).toEqual([]);
  });

  it('walks to its owner, stopping short of them, then stops', () => {
    const { events, owner, pets, tick, build } = rig();
    pets.setPet(OWNER, 2508);
    tick();
    const body = build();
    events.length = 0;

    owner.position[0] = 20;
    tick();
    const walk = events[0];
    if (walk?.kind !== 'moved') throw new Error('expected a move');
    expect(walk.move.moving).toBe(true);
    expect(walk.move.target).toEqual([20 - FOLLOW_GAP, 5, 0]);

    events.length = 0;
    body.position[0] = 20 - FOLLOW_GAP;
    tick();
    const stop = events[0];
    if (stop?.kind !== 'moved') throw new Error('expected a stop');
    expect(stop.move.moving).toBe(false);
  });

  it('is put back beside an owner it has lost', () => {
    const { events, owner, pets, tick, build } = rig();
    pets.setPet(OWNER, 2508);
    tick();
    build();
    events.length = 0;
    owner.position[0] = LOST_AT + 50;
    tick();
    const moved = events[0];
    if (moved?.kind !== 'moved') throw new Error('expected a move');
    expect(moved.move.position).toEqual([LOST_AT + 50 + FOLLOW_GAP, 5, 0]);
    expect(moved.move.target).toBeUndefined();
  });

  it('keeps one pet per owner: a new one replaces the last, 0 sends it away', () => {
    const { events, pets, tick } = rig();
    pets.setPet(OWNER, 2508);
    tick();
    pets.setPet(OWNER, 2509);
    expect(events.at(-1)?.kind).toBe('removed');
    tick();
    const next = events.at(-1);
    expect(next?.kind === 'spawned' && next.snapshot.entry).toBe(2509);
    pets.setPet(OWNER, 0);
    expect(events.at(-1)?.kind).toBe('removed');
  });

  it('goes when its owner leaves sight', () => {
    const { events, seen, pets, tick } = rig();
    pets.setPet(OWNER, 2508);
    tick();
    seen.owner = undefined;
    tick();
    expect(events.at(-1)?.kind).toBe('removed');
  });

  it('heels on the near side of its owner', () => {
    expect(heelSpot([10, 0, 0], [0, 0, 0])).toEqual([10 - FOLLOW_GAP, 0, 0]);
  });

  it('can be clicked, like any creature', () => {
    expect(isPickableEntity({ kind: 'creature', companion: true } as Entity)).toBe(true);
  });

  it('stops for good at a route end a hair past its place, with no more walking', () => {
    const { events, owner, pets, tick, build } = rig();
    pets.setPet(OWNER, 2508);
    tick();
    const body = build();
    owner.position[0] = 20;
    tick();
    events.length = 0;

    body.position[0] = 20 - FOLLOW_GAP - 1e-6;
    tick();
    tick();
    tick();

    expect(events).toHaveLength(1);
    const only = events[0];
    if (only?.kind !== 'moved') throw new Error('expected a stop');
    expect(only.move.moving).toBe(false);
  });
});
