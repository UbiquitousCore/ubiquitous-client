import { afterEach, describe, expect, it } from 'vitest';
import { WhoIs, type WhoIsSession } from '../src/app/WhoIs';
import type { NetworkBodies } from '../src/gameplay/NetworkBodies';
import type { Entity, World } from '../src/world/World';
import { clearTarget, setTarget } from '../src/ui/hudStore';
import { duelOpponent, duelPhase } from '../src/ui/pvpStore';

/** Local entity 10 is network 100 ("Wolf"); 11 is nameless (network 110); 12 is the hero (network 1). */
function setup(session: Partial<WhoIsSession> = {}) {
  const entities = new Map<number, Partial<Entity>>([
    [10, { id: 10, kind: 'creature', networkName: 'Wolf', position: [1, 2, 3], networkFaction: 5 }],
    [11, { id: 11, kind: 'creature', networkName: '', position: [4, 5, 6] }],
    [12, { id: 12, kind: 'player', networkName: 'Hero', position: [0, 0, 0] }],
  ]);
  const network = new Map([
    [100, 10],
    [110, 11],
    [1, 12],
    [900, 99], // a body the world no longer holds
  ]);
  const bodies = {
    networkIdOf: (local: number) => [...network].find(([, l]) => l === local)?.[0],
    localIdOf: (networkId: number) => network.get(networkId),
    worldPosition: (networkId: number) => {
      const local = network.get(networkId);
      const entity = local === undefined ? undefined : entities.get(local);
      return entity ? ([...entity.position!] as [number, number, number]) : null;
    },
  };
  const world = { entities, player: { id: 12 } };
  const fighting = new Set<number>();
  const state = { selfNetworkId: 1, playerFaction: 1 };
  const who = new WhoIs(bodies as unknown as NetworkBodies, world as unknown as World, {
    selfNetworkId: () => state.selfNetworkId,
    playerFaction: () => state.playerFaction,
    isFightingMe: id => fighting.has(id),
    ...session,
  });
  return { who, fighting, state, entities, network };
}

afterEach(() => {
  clearTarget();
  duelPhase.value = 'idle';
  duelOpponent.value = null;
});

describe('WhoIs.isSelf', () => {
  it('is true for the hero’s own network id', () => {
    expect(setup().who.isSelf(1)).toBe(true);
  });

  it('is false for anybody else', () => {
    expect(setup().who.isSelf(100)).toBe(false);
  });

  it('is false for 0 even before the server has said who the hero is', () => {
    const { who, state } = setup();
    state.selfNetworkId = 0;
    expect(who.isSelf(0)).toBe(false);
  });

  it('follows the id as it changes', () => {
    const { who, state } = setup();
    state.selfNetworkId = 100;
    expect(who.isSelf(100)).toBe(true);
    expect(who.isSelf(1)).toBe(false);
  });
});

describe('WhoIs.selfNetworkId', () => {
  it('reads the hero’s id as the session holds it now', () => {
    const { who, state } = setup();
    expect(who.selfNetworkId()).toBe(1);
    state.selfNetworkId = 0;
    expect(who.selfNetworkId()).toBe(0);
  });
});

describe('WhoIs.networkName', () => {
  it('gives the name of a body in the world', () => {
    expect(setup().who.networkName(100)).toBe('Wolf');
  });

  it('is null for an unknown id', () => {
    expect(setup().who.networkName(555)).toBeNull();
  });

  it('is null for a body without a name', () => {
    expect(setup().who.networkName(110)).toBeNull();
  });

  it('is null once the body has despawned from the world', () => {
    const { who, entities } = setup();
    entities.delete(10);
    expect(who.networkName(100)).toBeNull();
  });

  it('is null for an id that maps to an entity the world no longer holds', () => {
    expect(setup().who.networkName(900)).toBeNull();
  });
});

describe('WhoIs.positionOf and localIdOf', () => {
  it('gives a copy of the position, and the local id', () => {
    const { who, entities } = setup();
    const at = who.positionOf(100);
    expect(at).toEqual([1, 2, 3]);
    at![0] = 99;
    expect(entities.get(10)!.position).toEqual([1, 2, 3]);
    expect(who.localIdOf(100)).toBe(10);
  });

  it('say nothing for an unknown id', () => {
    const { who } = setup();
    expect(who.positionOf(555)).toBeNull();
    expect(who.localIdOf(555)).toBeUndefined();
  });

  it('has no position for a despawned body', () => {
    expect(setup().who.positionOf(900)).toBeNull();
  });
});

describe('WhoIs.isOwnBody', () => {
  it('knows the world’s player', () => {
    expect(setup().who.isOwnBody(12)).toBe(true);
  });

  it('knows the body the server calls the hero, before the world has a player', () => {
    const { who } = setup();
    (who as unknown as { world: { player: undefined } }).world.player = undefined;
    expect(who.isOwnBody(12)).toBe(true);
  });

  it('is false for anyone else, and for an id that has no network id', () => {
    const { who } = setup();
    expect(who.isOwnBody(10)).toBe(false);
    expect(who.isOwnBody(777)).toBe(false);
  });
});

describe('WhoIs.relationTo and standingTo', () => {
  const wolf = { id: 10, kind: 'creature', networkFaction: 5 };

  it('reads the hero’s faction as it is now', () => {
    const { who, state } = setup();
    expect(who.relationTo(wolf as Entity)).toBe('enemy');
    state.playerFaction = 5;
    expect(who.relationTo(wolf as Entity)).toBe('ally');
  });

  it('makes a body that is fighting the hero an enemy, unless the fight is not counted', () => {
    const { who, fighting, state } = setup();
    state.playerFaction = 5;
    fighting.add(100);
    expect(who.relationTo(wolf as Entity)).toBe('enemy');
    expect(who.relationTo(wolf as Entity, false)).toBe('ally');
    expect(who.standingTo(wolf as Entity)).toBe('enemy');
    expect(who.standingTo(wolf as Entity, false)).toBe('ally');
  });

  it('makes the duel opponent an enemy', () => {
    const { who, state } = setup();
    state.playerFaction = 5;
    duelPhase.value = 'duelling';
    duelOpponent.value = 100;
    expect(who.relationTo(wolf as Entity)).toBe('enemy');
  });

  it('does not take an entity with no network id to be fighting anyone', () => {
    const { who, fighting, state } = setup();
    state.playerFaction = 5;
    fighting.add(0);
    expect(who.relationTo({ id: 777, kind: 'creature', networkFaction: 5 } as Entity)).toBe('ally');
  });
});

describe('WhoIs.targetNetworkId', () => {
  it('is undefined with nothing targeted', () => {
    expect(setup().who.targetNetworkId()).toBeUndefined();
  });

  it('gives the wire id of the HUD’s target', () => {
    setTarget('10');
    expect(setup().who.targetNetworkId()).toBe(100);
  });

  it('is undefined for a target the server has no id for', () => {
    setTarget('777');
    expect(setup().who.targetNetworkId()).toBeUndefined();
  });
});

describe('WhoIs.entityOf, entity, networkIdOf and heroPosition', () => {
  it('finds the entity a network id stands for, if the world still holds it', () => {
    const { who, entities } = setup();
    expect(who.entityOf(100)?.id).toBe(10);
    expect(who.entityOf(555)).toBeUndefined();
    expect(who.entityOf(900)).toBeUndefined();
    entities.delete(10);
    expect(who.entityOf(100)).toBeUndefined();
  });

  it('finds an entity by its local id, and the network id of one', () => {
    const { who } = setup();
    expect(who.entity(10)?.networkName).toBe('Wolf');
    expect(who.entity(777)).toBeUndefined();
    expect(who.networkIdOf(10)).toBe(100);
    expect(who.networkIdOf(777)).toBeUndefined();
  });

  it('says where the hero is, a copy that can be changed freely, or nowhere', () => {
    const { who, entities } = setup();
    entities.get(12)!.position = [3, 4, 5];
    (who as unknown as { world: { player: unknown } }).world.player = entities.get(12);
    const at = who.heroPosition();
    expect(at).toEqual([3, 4, 5]);
    at![0] = 99;
    expect(who.heroPosition()).toEqual([3, 4, 5]);
    (who as unknown as { world: { player: unknown } }).world.player = undefined;
    expect(who.heroPosition()).toBeNull();
  });
});
