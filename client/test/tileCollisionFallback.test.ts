/**
 * Walk-through scenery: a model with no `.phy` (the Silence windmill) and an
 * effect-placed model (a fountain basin) must still block. Reaches
 * `buildTile` with stub packs and tables, then asks the real `CollisionWorld`
 * whether the wall is there.
 */

import { describe, expect, it } from 'vitest';

import type { Library } from '../src/assets/vfs/Library';
import type { WorldTables } from '../src/assets/formats/tables';
import { MapSpawns, buildTile, fallbackGeom } from '../src/assets/providers/localTile';
import { CollisionWorld } from '../src/world/CollisionWorld';

const WINDMILL = 'model/windmill.bdae';
const FOUNTAIN = 'Effects/fountain.beff';
const BASIN = 'model/basin.bdae';

function tables(): WorldTables {
  const rows = [
    [0, 7001, 1, 10, 0, 10, 0, 0, 0, 0, 0, 1],
    [0, 7002, 1, 20, 0, 20, 0, 0, 0, 0, 0, 1],
  ];
  return {
    maps: () => [{ id: 1, world: 'world/silence.wld' }],
    rowsOf: (name: string) => (name === 'staticobject_spawns' ? rows : []),
    staticModel: (entry: number) =>
      entry === 7001
        ? { path: WINDMILL, scale: 1, type: 0 }
        : entry === 7002
          ? { path: FOUNTAIN, scale: 1, type: 0 }
          : { path: null, scale: 1, type: 0 },
    staticEffects: () => [],
    creatureModel: () => ({ path: '', scale: 1, skin: null }),
  } as unknown as WorldTables;
}

/** No packs at all: every `.phy` lookup misses, so only the fallback can stand anything in. */
function packlessLib(): Library {
  return { hasPack: () => false } as unknown as Library;
}

const boundsQueries = {
  meshNames: async () => [],
  attachOffsets: async () => new Map(),
  effectModels: async (path: string) => (path === FOUNTAIN ? [BASIN] : []),
  modelBounds: async (path: string) => {
    if (path === WINDMILL)
      return {
        min: [-5, 0, -5] as [number, number, number],
        max: [5, 15, 5] as [number, number, number],
      };
    if (path === BASIN)
      return {
        min: [-2, 0, -2] as [number, number, number],
        max: [2, 1.2, 2] as [number, number, number],
      };
    return null;
  },
};

describe('walk-through scenery', () => {
  it('stands bounds in for a model with no .phy', async () => {
    const data = await buildTile(
      packlessLib(),
      tables(),
      1,
      0,
      0,
      MapSpawns.build(tables(), 1),
      boundsQueries,
    );
    const paths = data.collision.map(c => c.path);
    expect(paths).toContain('model/windmill.phy');

    const world = new CollisionWorld();
    world.addGroup('0,0', data.collision);
    expect(world.wallsNear(16.5, 10, 0, 2, 2).length).toBeGreaterThan(0);
    expect(world.wallsNear(60, 60, 0, 2, 2)).toHaveLength(0);
  });

  it('blocks with an effect-embedded model at the effect’s spot', async () => {
    const data = await buildTile(
      packlessLib(),
      tables(),
      1,
      0,
      0,
      MapSpawns.build(tables(), 1),
      boundsQueries,
    );
    const basin = data.collision.find(c => c.path === 'model/basin.phy');
    expect(basin, 'the fountain basin stands collision in').toBeTruthy();
    expect(basin!.pos).toEqual([20, 0, 20]);

    const world = new CollisionWorld();
    world.addGroup('0,0', data.collision);
    expect(world.wallsNear(23.5, 20, 0, 2, 2).length).toBeGreaterThan(0);
  });

  it('prefers a shipped .phy over the bounds stand-in', async () => {
    const bytes = new Uint8Array(40);
    const view = new DataView(bytes.buffer);
    view.setInt32(0, 1, true);
    view.setInt32(4, 3, true);
    view.setFloat32(20, 2, true);
    view.setFloat32(24, 2, true);
    view.setFloat32(28, 2, true);
    const reader = {
      get: (name: string) => (name.toLowerCase() === 'model/windmill.phy' ? {} : undefined),
      read: async () => bytes,
    };
    const lib = {
      hasPack: (name: string) => name === 'model_phy.bin',
      pack: async () => reader,
    } as unknown as Library;
    const data = await buildTile(
      lib,
      tables(),
      1,
      0,
      0,
      MapSpawns.build(tables(), 1),
      boundsQueries,
    );
    const windmill = data.collision.find(c => c.path === 'model/windmill.phy');
    expect(windmill!.geoms).toHaveLength(1);
    expect(windmill!.geoms[0]!.shape).toBe('box');
  });
});

describe('fallbackGeom', () => {
  it('leaves small decor walk-through', () => {
    expect(
      fallbackGeom({ min: [-0.2, 0, -0.2], max: [0.2, 0.6, 0.2] }),
      'a grass tuft blocks nothing',
    ).toBeNull();
  });

  it('cylinders the round and boxes the elongated', () => {
    expect(
      fallbackGeom({ min: [-5, 0, -5], max: [5, 15, 5] })!.shape,
      'the windmill reads round',
    ).toBe('cylinder');
    expect(
      fallbackGeom({ min: [-4, 0, -1], max: [4, 2, 1] })!.shape,
      'a long wall reads as its box',
    ).toBe('box');
  });
});
