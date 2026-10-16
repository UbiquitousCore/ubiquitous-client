/**
 * World.groundPoint — the height+normal query the blob shadows stand on.
 *
 * The rule it must preserve: terrain and collision
 * are both candidates, the higher walkable one wins, and the normal comes
 * from whichever surface won. A shadow under a character on a bridge deck
 * must sit on the deck with the deck's slope, not on the riverbed below.
 */

import { describe, expect, it } from 'vitest';
import { gameYaw, NODE_SNAP_DISTANCE, World } from '../src/world/World';
import { Terrain } from '../src/world/Terrain';
import type { TerrainTileData } from '../src/assets/types';
import type {
  CollisionData,
  CollisionGeom,
  CollisionItem,
  Placement,
  TileData,
} from '../src/assets/types';

function tile(heights: number[]): TerrainTileData {
  return {
    tile: [0, 0],
    origin: [0, 0],
    side: 3,
    tileSize: 64,
    heights: Float32Array.from(heights),
    colours: null,
    visible: [],
    // Empty rather than absent: the type says an empty list is a tile that
    // carries none, which is what these fixtures are.
    water: [],
    chunkTextures: [],
    baseTexture: null,
    maskTexture: null,
  };
}

const NO_ROT: [number, number, number, number] = [0, 0, 0, 1];
const UNIT: [number, number, number] = [1, 1, 1];

/** A flat rectangle at height y, as two triangles. */
function slabAt(y: number, x0 = 0, z0 = 0, x1 = 10, z1 = 10): CollisionGeom {
  return {
    type: 'mesh',
    position: [0, 0, 0],
    vertices: [
      [x0, y, z0],
      [x1, y, z0],
      [x1, y, z1],
      [x0, y, z1],
    ],
    faces: [
      [0, 1, 2, 0],
      [0, 2, 3, 0],
    ],
  };
}

function slab(y: number): CollisionGeom {
  return slabAt(y);
}

function worldWith(tiles: TerrainTileData[], items: CollisionItem[] = []): World {
  const world = new World({} as ConstructorParameters<typeof World>[0]);
  world.terrain = new Terrain(tiles);
  if (items.length > 0) {
    const data: CollisionData = { items };
    world.collision.load(data);
  }
  return world;
}

/**
 * A resource layer with one zone and a controllable tile source.
 *
 * `release(tx, tz)` lands one tile; anything not released stays in flight,
 * which is how a test can prove `loadZone` did not wait for it.
 */
function stubResources(): {
  resources: ConstructorParameters<typeof World>[0];
  release(tx: number, tz: number): void;
  releaseAll(): void;
  requested: string[];
} {
  const held = new Map<string, () => void>();
  const requested: string[] = [];
  const info = {
    id: 1,
    name: 'test',
    mapId: 7,
    mapName: 'test-map',
    centre: [32, 32] as [number, number],
    bounds: [0, 0, 1024, 1024] as [number, number, number, number],
    hasScenery: false,
    parentId: -1,
    atmosphere: {
      fogColor: [0, 0, 0] as [number, number, number],
      fogNear: 1,
      fogFar: 2,
      skybox: null,
    },
  };
  const resources = {
    async zone() {
      return { info, spawn: [32, 32] as [number, number] };
    },
    async zoneIndex() {
      return { zones: [info] };
    },
    tile(_mapId: number, tx: number, tz: number) {
      const key = `${tx},${tz}`;
      requested.push(key);
      return new Promise(resolve => {
        held.set(key, () =>
          resolve({
            mapId: 7,
            tile: [tx, tz] as [number, number],
            // Flat ground, addressed to its own tile — `Terrain` keys on the
            // tile coords, so a shared fixture would collapse to one entry.
            terrain: {
              ...tile([0, 0, 0, 0, 0, 0, 0, 0, 0]),
              tile: [tx, tz] as [number, number],
              origin: [tx * 64, tz * 64] as [number, number],
            },
            placements: [],
            collision: [],
          }),
        );
      });
    },
  };
  return {
    resources: resources as unknown as ConstructorParameters<typeof World>[0],
    release: (tx, tz) => held.get(`${tx},${tz}`)?.(),
    releaseAll: () => {
      for (const r of held.values()) r();
    },
    requested,
  };
}

describe('World.loadZone', () => {
  it('stands the player up on the ground around them, not on the whole window', async () => {
    // The window is 25 tiles here (49 by default). Waiting for all of them
    // means waiting on corners past the fog wall before the player exists,
    // which is most of "the player takes a long time to appear".
    const { resources, release, releaseAll, requested } = stubResources();
    const world = new World(resources, {}, { blockSize: 5 });

    const stages: string[] = [];
    const loading = world.loadZone(1, 'model/player.bdae', undefined, s => stages.push(s));

    // Let the zone row resolve and the window be requested.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(requested).toHaveLength(25);

    // Only the 3x3 the player stands on.
    for (let tx = -1; tx <= 1; tx++) for (let tz = -1; tz <= 1; tz++) release(tx, tz);
    await loading;

    expect(stages).toEqual(['zone', 'tiles']);
    expect(world.player).not.toBeNull();
    // Placed on real ground: the fixture tile is flat at 0, and the player
    // starts at y = 0 before `loadZone` resolves a resting height, so what
    // this proves is that the load completed at all with 16 tiles still out.
    expect(world.pendingTiles).toBe(16);
    expect(world.terrain.tileCount).toBe(9);

    releaseAll();
  });

  it('keeps streaming the rest of the window after the load returns', async () => {
    const { resources, release, releaseAll } = stubResources();
    const world = new World(resources, {}, { blockSize: 5 });
    const loading = world.loadZone(1, 'model/player.bdae');
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let tx = -1; tx <= 1; tx++) for (let tz = -1; tz <= 1; tz++) release(tx, tz);
    await loading;

    releaseAll();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Nothing was cancelled; the outer ring simply arrives later.
    expect(world.terrain.tileCount).toBe(25);
    expect(world.pendingTiles).toBe(0);
  });
});

describe('World.groundPoint', () => {
  it('returns the heightmap and its slope when there is no collision', () => {
    const world = worldWith([tile([0, 0, 0, 10, 10, 10, 20, 20, 20])]);
    const point = world.groundPoint(32, 32, 10);
    expect(point.y).toBeCloseTo(10, 5);
    expect(point.normal[1]).toBeGreaterThan(0.9);
    expect(point.normal[2]).toBeLessThan(0); // ramp rises along +Z
  });

  it('picks the bridge deck over the riverbed, with the deck normal', () => {
    const item: CollisionItem = {
      path: 'bridge.phy',
      pos: [0, 0, 0],
      rot: [...NO_ROT],
      scale: [...UNIT],
      geoms: [slab(8)],
    };
    const world = worldWith([tile(new Array(9).fill(0))], [item]);

    // Standing on the deck.
    const onDeck = world.groundPoint(5, 5, 8);
    expect(onDeck.y).toBeCloseTo(8, 5);
    expect(onDeck.normal[0]).toBeCloseTo(0, 5);
    expect(onDeck.normal[1]).toBeCloseTo(1, 5);
    expect(onDeck.normal[2]).toBeCloseTo(0, 5);

    // Under the deck: the ground wins, and so does its normal.
    const beneath = world.groundPoint(5, 5, 0);
    expect(beneath.y).toBeCloseTo(0, 5);

    // Both answers come through the same call the height path uses.
    expect(world.groundHeight(5, 5, 8)).toBeCloseTo(8, 5);
    expect(world.groundHeight(5, 5, 0)).toBeCloseTo(0, 5);
  });

  it('falls back to flat-up where no tile covers the position', () => {
    const world = worldWith([]);
    const point = world.groundPoint(100, 100, 0);
    expect(point.y).toBe(0);
    expect(point.normal).toEqual([0, 1, 0]);
  });

  describe('tunnels', () => {
    // Terrain that climbs 0.375 per unit of Z: a hillside a tunnel runs
    // through. The tunnel floor is collision geometry at y=5 under it.
    const HILL = [0, 0, 0, 12, 12, 12, 24, 24, 24];

    function tunnelWorld(): World {
      return worldWith(
        [tile(HILL)],
        [
          {
            path: 'tunnel.phy',
            pos: [0, 0, 0],
            rot: [...NO_ROT],
            scale: [...UNIT],
            geoms: [slabAt(5, 0, 40, 10, 50)],
          },
        ],
      );
    }

    it('keeps a body on the tunnel floor instead of popping it onto the hill', () => {
      const world = tunnelWorld();
      // Under the hill the heightmap reads ~16.9 — the ceiling of the
      // tunnel. The floor at 5 must win over it.
      expect(world.groundHeight(5, 45, 5)).toBeCloseTo(5, 4);
      const point = world.groundPoint(5, 45, 5);
      expect(point.normal[1]).toBeGreaterThan(0.9);
    });

    it('still walks on the hillside at the mouth, where it is within reach', () => {
      const world = tunnelWorld();
      // z=14: terrain 5.25, within one step of the body at 5 — stand on it.
      expect(world.groundHeight(5, 14, 5)).toBeCloseTo(5.25, 3);
      // And walking OVER the tunnel along the hill keeps the hill: the
      // tunnel floor is far below, never a candidate from up here.
      expect(world.groundHeight(5, 45, 17)).toBeCloseTo(16.875, 3);
    });

    it('answers with terrain when neither surface qualifies (data hole)', () => {
      // Body far below a hill it has no collision for: legacy behaviour.
      const world = tunnelWorld();
      expect(world.groundHeight(5, 45, -30)).toBeCloseTo(16.875, 3);
    });
  });
});

/**
 * The world as a tile sink.
 *
 * A tile brings ground, things standing on it and the collision for them, and
 * takes all three away again when it is evicted. Getting the eviction wrong is
 * not subtle: scenery from a tile you walked away from stays floating in the
 * distance, and its collision keeps blocking a road you are nowhere near.
 */
function tileData(tx: number, tz: number, models: string[]): TileData {
  return {
    mapId: 1,
    tile: [tx, tz],
    terrain: {
      ...tile([0, 0, 0, 0, 0, 0, 0, 0, 0]),
      tile: [tx, tz],
      origin: [tx * 64, tz * 64],
    },
    placements: models.map(model => ({
      model,
      position: [tx * 64 + 1, 0, tz * 64 + 1] as [number, number, number],
      rotation: [...NO_ROT] as [number, number, number, number],
      scale: [...UNIT] as [number, number, number],
      entry: 0,
      kind: 'scenery' as const,
    })),
    collision: [
      {
        path: 'test.phy',
        pos: [tx * 64, 0, tz * 64],
        rot: [...NO_ROT] as [number, number, number, number],
        scale: [...UNIT] as [number, number, number],
        geoms: [slabAt(3, 0, 0, 60, 60)],
      },
    ],
  };
}

function networkEntity(world: World) {
  return world.add({
    kind: 'creature',
    model: 'wolf.bdae',
    position: [0, 0, 0],
    rotation: [...NO_ROT],
    scale: [...UNIT],
    entry: 77,
  });
}

function creatureTile(): TileData {
  return {
    ...tileData(0, 0, ['tree.bdae']),
    placements: [
      ...tileData(0, 0, ['tree.bdae']).placements,
      {
        model: 'wolf.bdae',
        position: [2, 0, 2],
        rotation: [...NO_ROT],
        scale: [...UNIT],
        entry: 77,
        kind: 'creature',
      },
    ],
  };
}

describe('the yaw convention the wire and spawn tables store', () => {
  it('mirrors a stored yaw into a rendered one, and back', () => {
    // A stored yaw of 2.7053 (155.0°) draws at 25.0°. Left unmirrored it
    // would draw at 155°, the raw value.
    expect(gameYaw(2.7053)).toBeCloseTo(0.4363, 3);
    expect((gameYaw(2.7053) * 180) / Math.PI).toBeCloseTo(25.0, 1);

    // Self-inverse, which is what lets one function serve both directions.
    for (const yaw of [0, 1.25, -2.5, Math.PI, -Math.PI + 0.01]) {
      expect(gameYaw(gameYaw(yaw))).toBeCloseTo(yaw, 6);
    }
  });

  it('keeps the result in the range every other yaw here uses', () => {
    for (const yaw of [-3.14, -1, 0, 1, 3.14, Math.PI]) {
      const out = gameYaw(yaw);
      expect(out).toBeGreaterThan(-Math.PI - 1e-9);
      expect(out).toBeLessThanOrEqual(Math.PI + 1e-9);
    }
  });
});

describe('World tile streaming', () => {
  it('takes ground, entities and collision from one tile', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, ['a.bdae', 'b.bdae']));

    expect(world.terrain.tileCount).toBe(1);
    expect(world.entities.size).toBe(2);
    expect(world.collision.triangleCount()).toBeGreaterThan(0);
    expect(world.groundHeight(10, 10, 3)).toBeCloseTo(3, 5);
  });

  it('does not duplicate table creatures in an online world', () => {
    const world = new World(
      {} as ConstructorParameters<typeof World>[0],
      {},
      {
        includeLocalCreatures: false,
      },
    );
    world.addTile(creatureTile());
    expect([...world.entities.values()].map(entity => entity.model)).toEqual(['tree.bdae']);
  });

  /**
   * A table creature's Y is not the ground.
   *
   * `creature_spawns` holds an authored Y that does not always agree with the
   * heightmap the client builds, so a local placement left at it can stand a
   * visible gap off the floor. A ground pass runs after creating a unit,
   * which is what `NetworkBodies.settle` does for the server's own bodies.
   */
  it('puts a table creature down on the ground it was placed over', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const data = creatureTile();
    // Terrain is flat at 0 across this tile; float the wolf 40cm over it,
    // inside a step so the ground pass can see the floor beneath it.
    const wolf = data.placements.find(p => p.kind === 'creature')!;
    wolf.position = [2, 0.4, 2];
    world.addTile(data);

    const placed = [...world.entities.values()].find(e => e.kind === 'creature')!;
    expect(placed.position[1]).toBeCloseTo(0, 5);
  });

  it('leaves scenery exactly where it was authored', () => {
    // Buildings, bridges and roadbeds are placed in world space on purpose. A
    // ground pass over them would drag every raised deck down onto the dirt.
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const data = creatureTile();
    const tree = data.placements.find(p => p.kind === 'scenery')!;
    tree.position = [4, 2.5, 4];
    world.addTile(data);

    const placed = [...world.entities.values()].find(e => e.kind === 'scenery')!;
    expect(placed.position[1]).toBeCloseTo(2.5, 5);
  });

  it('smooths network positions toward the latest server target', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    world.setNetworkMotion(entity, {
      kind: 'reported',
      target: [10, 0, 0],
      path: [],
      speed: 0,
      moving: true,
    });
    world.updateNetwork(1 / 60);
    expect(entity.position[0]).toBeGreaterThan(0);
    expect(entity.position[0]).toBeLessThan(10);
    world.updateNetwork(1);
    expect(entity.position[0]).toBeCloseTo(10, 3);
    // Nothing arrived to say it stopped, so it has not.
    expect(entity.networkMoving).toBe(true);
  });

  it('counts the movers past the distance a gated pass would skip', () => {
    // `ubiquitous.inspect()` reads this over the live world; the count is only
    // useful if it sees the same movers `updateNetwork` walks.
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    expect(world.distantMovers(60)).toBe(0);
    world.player = world.add({
      kind: 'player',
      model: 'hero.bdae',
      position: [0, 0, 0],
      rotation: [...NO_ROT],
      scale: [...UNIT],
      entry: 0,
    });
    const near = networkEntity(world);
    const far = networkEntity(world);
    world.setPosition(far, 100, 0, 0);
    expect(world.movers.has(near)).toBe(true);
    expect(world.distantMovers(60)).toBe(1);
    world.setPosition(far, 10, 0, 0);
    expect(world.distantMovers(60)).toBe(0);
  });

  it('extrapolates sparse player updates using the last reported velocity', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    world.setNetworkMotion(entity, {
      kind: 'reported',
      target: [0, 0, 0],
      path: [],
      speed: 6,
      moving: true,
      velocity: [1, 0, 0],
      extrapolate: true,
    });
    world.updateNetwork(0.5);

    expect(entity.position).toEqual([3, 0, 0]);
    expect(entity.networkMoving).toBe(true);
  });

  it('keeps full player updates moving continuously instead of chasing stale targets', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    world.setNetworkMotion(entity, {
      target: [1, 0, 0],
      path: [],
      speed: 6,
      moving: true,
      velocity: [1, 0, 0],
      extrapolate: true,
      correction: [1, 0, 0],
    });
    world.updateNetwork(0.5);

    expect(entity.position[0]).toBeGreaterThan(2);
    expect(entity.networkMoving).toBe(true);
  });

  it('walks a path node by node at the speed the server gave', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    world.setNetworkMotion(entity, {
      kind: 'route',
      target: [0, 0, 20],
      path: [
        [0, 0, 10],
        [0, 0, 20],
      ],
      speed: 5,
      moving: true,
    });

    world.updateNetwork(1);
    // One second at five a second: still on the first leg, not at its end.
    expect(entity.position[2]).toBeCloseTo(5, 3);
    expect(entity.networkMoving).toBe(true);

    // Long enough to walk the rest of both legs, and no further.
    world.updateNetwork(10);
    expect(entity.position[2]).toBeCloseTo(20, 3);
    expect(entity.networkMoving).toBe(false);
  });

  it('steps onto a node a frame falls just short of, and no further off than that', () => {
    const walk = (nodeAt: number): number[] => {
      const world = new World({} as ConstructorParameters<typeof World>[0]);
      const entity = networkEntity(world);
      world.setNetworkMotion(entity, {
        kind: 'route',
        target: [0, 0, 10],
        path: [
          [0, 0, nodeAt],
          [0, 0, 10],
        ],
        speed: 1,
        moving: true,
      });
      // A millisecond at one unit a second: a step far shorter than either gap.
      world.updateNetwork(0.001);
      return [...entity.position];
    };
    expect(walk(NODE_SNAP_DISTANCE * 0.8)[2]).toBeCloseTo(NODE_SNAP_DISTANCE * 0.8, 6);
    expect(walk(NODE_SNAP_DISTANCE * 2)[2]).toBeCloseTo(0.001, 6);
  });

  it('walks the whole path and stays at the end of it', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    // The message's own position is where the body WAS when the server sent
    // it. Using that as the ease target dragged every NPC back to its starting
    // point the moment it finished its route — walk out, snap back, walk out
    // again. The target has to be the end of the path.
    world.setNetworkMotion(entity, {
      kind: 'route',
      target: [0, 0, 10],
      path: [[0, 0, 10]],
      speed: 5,
      moving: true,
    });

    for (let frame = 0; frame < 300; frame++) world.updateNetwork(1 / 60);
    expect(entity.position[2]).toBeCloseTo(10, 3);
    expect(entity.networkMoving).toBe(false);

    // And it stays there rather than drifting back once the path is spent.
    for (let frame = 0; frame < 300; frame++) world.updateNetwork(1 / 60);
    expect(entity.position[2]).toBeCloseTo(10, 3);
  });

  it('never teleports along a path it was given no speed for', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    // Speed zero must not mean an unbounded step: the body would walk the
    // whole route in one frame and appear at the far end of it.
    world.setNetworkMotion(entity, {
      kind: 'route',
      target: [0, 0, 40],
      path: [
        [0, 0, 20],
        [0, 0, 40],
      ],
      speed: 0,
      moving: true,
    });

    world.updateNetwork(1 / 60);
    expect(entity.position[2]).toBeGreaterThan(0);
    expect(entity.position[2]).toBeLessThan(10);
    expect(entity.networkMoving).toBe(true);

    // And it still gets there, and still knows when it has.
    for (let frame = 0; frame < 240; frame++) world.updateNetwork(1 / 60);
    expect(entity.position[2]).toBeCloseTo(40, 2);
    expect(entity.networkMoving).toBe(false);
  });

  it('stops at the end of a path rather than running on the spot', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    world.setNetworkMotion(entity, {
      kind: 'route',
      target: [3, 0, 0],
      path: [[3, 0, 0]],
      speed: 100,
      moving: true,
    });
    expect(entity.networkMoving).toBe(true);
    world.updateNetwork(1);

    expect(entity.position[0]).toBeCloseTo(3, 3);
    expect(entity.networkMoving).toBe(false);
  });

  it('keeps a player walking after it catches up to their last position', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    // A segment is one leg of a walk that has not finished. Arriving at where
    // the player was a tenth of a second ago says nothing about whether they
    // stopped — only their next message does — so the server's flag stands.
    world.setNetworkMotion(entity, {
      kind: 'segment',
      target: [0, 0, 2],
      path: [[0, 0, 2]],
      speed: 20,
      moving: true,
    });

    world.updateNetwork(1);
    expect(entity.position[2]).toBeCloseTo(2, 3);
    expect(entity.networkMoving).toBe(true);
  });

  it('treats arriving as the stop only for a route collapsed to its end', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    world.setNetworkMotion(entity, {
      kind: 'collapsed',
      target: [0, 0, 5],
      path: [],
      speed: 0,
      moving: true,
    });

    world.updateNetwork(1 / 60);
    expect(entity.networkMoving).toBe(true);
    world.updateNetwork(5);
    expect(entity.position[2]).toBeCloseTo(5, 3);

    // The flag is read off the distance at the START of a frame, so it clears
    // on the frame after the one that closed the gap. One frame of a body
    // standing on its destination still marked as moving is not worth a
    // second distance check per entity per frame.
    world.updateNetwork(1 / 60);
    expect(entity.networkMoving).toBe(false);
  });

  it('cuts rather than glides when a reported position is far away', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = networkEntity(world);

    // A teleport or a respawn. Easing across that gap is a visible glide.
    world.setNetworkMotion(entity, {
      kind: 'reported',
      target: [0, 0, 500],
      path: [],
      speed: 0,
      moving: false,
    });
    world.updateNetwork(1 / 60);
    expect(entity.position[2]).toBeCloseTo(500, 3);
  });

  it('takes all three away again when the tile is evicted', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, ['a.bdae']));
    world.addTile(tileData(1, 0, ['b.bdae']));
    world.dropTile(0, 0);

    expect(world.terrain.tileCount).toBe(1);
    expect([...world.entities.values()].map(e => e.model)).toEqual(['b.bdae']);
    // The evicted tile's ground and collision are both gone; the surviving
    // tile's still answer.
    expect(world.terrain.heightAt(10, 10)).toBeNull();
    expect(world.groundHeight(74, 10, 3)).toBeCloseTo(3, 5);
  });

  it('never reuses an entity id, so a stale renderer view cannot be adopted', () => {
    // Were ids to restart at 1 per zone, the new zone's entity 5 would find
    // the old zone's view for id 5 with a matching version. With tiles coming
    // and going continuously that would happen constantly.
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, ['a.bdae']));
    const first = [...world.entities.keys()];
    world.dropTile(0, 0);
    world.addTile(tileData(0, 0, ['a.bdae']));
    const second = [...world.entities.keys()];
    expect(second.some(id => first.includes(id))).toBe(false);
  });

  it('walks only what can move each frame, never the scenery around it', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(creatureTile());
    const [tree, wolf] = [...world.entities.values()];
    expect([...world.movers]).toEqual([wolf]);

    // An object the server hands a facing or a route joins them.
    world.setHomeYaw(tree!, 1);
    expect(world.movers.has(tree!)).toBe(true);

    world.dropTile(0, 0);
    expect(world.movers.size).toBe(0);
  });

  it('says the set changed when one tile replaces another of the same size', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, ['a.bdae']));
    const before = world.membership;
    world.dropTile(0, 0);
    world.addTile(tileData(1, 0, ['b.bdae']));
    expect(world.entities.size).toBe(1);
    expect(world.membership).not.toBe(before);
  });

  it('turns an object back to the facing the server gave it', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, ['door.bdae']));
    const door = [...world.entities.values()][0]!;
    world.setHomeYaw(door, Math.PI / 2);
    world.setFaceTarget(door, null);
    for (let i = 0; i < 10; i++) world.updateNetwork(1);
    expect(
      Math.atan2(2 * door.rotation[3] * door.rotation[1], 1 - 2 * door.rotation[1] ** 2),
    ).toBeCloseTo(Math.PI / 2, 4);
  });

  it('replaces rather than doubles a tile that arrives twice', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, ['a.bdae']));
    world.addTile(tileData(0, 0, ['a.bdae']));
    expect(world.entities.size).toBe(1);
    expect(world.terrain.tileCount).toBe(1);
  });

  it('holds a body where it is over ground that has not arrived', () => {
    // The floor of the world is a very long way down, and a player walking
    // briskly reaches the next tile before it has finished loading.
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(tileData(0, 0, []));
    expect(world.groundHeight(10_000, 10_000, 42)).toBe(42);
  });
});

/**
 * Walking a route, and why the height is not in the distance.
 *
 * A path node counts as reached on ground-plane distance, within 0.02; height
 * is the ground's business. Measuring in three dimensions instead would make
 * three separate failures out of one mistake, because the ground pass — which
 * puts a body on the terrain the client actually has — recreates the Y error it
 * trips on every single frame.
 */
describe('walking a server route', () => {
  /** A body at the origin with a route to walk. Nothing else is loaded. */
  function walker(path: Array<[number, number, number]>, speed = 4) {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = world.add({
      kind: 'creature',
      model: 'wolf.bdae',
      position: [0, 0, 0],
      rotation: NO_ROT,
      scale: UNIT,
      entry: 1,
    });
    world.setNetworkMotion(entity, {
      target: [...path[path.length - 1]!],
      kind: 'route',
      path: path.map(node => [...node] as [number, number, number]),
      speed,
      moving: true,
    });
    return { world, entity };
  }

  it('reaches a node whose height the client disagrees with', () => {
    // The server says the node is two units up; the client's ground puts the
    // body at zero and keeps putting it there. Measured in 3D that node is
    // never closer than two units, and at 4/s with a 60th-of-a-second step
    // the body stops dead a stride away and stays there.
    const { world, entity } = walker([[0, 2, 6]]);
    for (let frame = 0; frame < 120; frame++) {
      world.updateNetwork(1 / 60);
      // The ground pass, standing in for `NetworkBodies.settle`.
      entity.position[1] = 0;
    }
    expect(entity.position[2]).toBeCloseTo(6, 3);
    expect(entity.network!.path).toHaveLength(0);
    expect(entity.networkMoving).toBe(false);
  });

  it('covers ground at the speed it was given, not a fraction of it', () => {
    // Scaling the step by 3D distance spends the budget on a Y the ground
    // pass immediately undoes, and the closer the node the more of the budget
    // that Y takes: three up and five along is a sixth of the travel lost.
    // Over a second at 2/s the body should cover 2.
    const { world, entity } = walker([[0, 3, 5]], 2);
    for (let frame = 0; frame < 60; frame++) {
      world.updateNetwork(1 / 60);
      entity.position[1] = 0;
    }
    expect(entity.position[2]).toBeCloseTo(2, 1);
  });

  it('walks every node of a route in order', () => {
    const { world, entity } = walker([
      [4, 1, 0],
      [4, 1, 4],
      [0, 1, 4],
    ]);
    for (let frame = 0; frame < 300; frame++) {
      world.updateNetwork(1 / 60);
      entity.position[1] = 0;
    }
    expect(entity.position[0]).toBeCloseTo(0, 3);
    expect(entity.position[2]).toBeCloseTo(4, 3);
    expect(entity.network!.path).toHaveLength(0);
  });

  it('still lets height track the route for a body in the air', () => {
    // Nothing grounds a jumping body, so the route is all it has. The Y does
    // not decide progress, but it is still followed.
    const { world, entity } = walker([[0, 5, 4]]);
    for (let frame = 0; frame < 120; frame++) world.updateNetwork(1 / 60);
    expect(entity.position[2]).toBeCloseTo(4, 3);
    expect(entity.position[1]).toBeCloseTo(5, 3);
  });

  it('counts a collapsed route as arrived on the ground it covered', () => {
    // A route with no usable speed degrades to an ease, and arriving is the
    // stop. With the height in the test it never arrives and the body runs on
    // the spot for ever.
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const entity = world.add({
      kind: 'creature',
      model: 'wolf.bdae',
      position: [0, 0, 0],
      rotation: NO_ROT,
      scale: UNIT,
      entry: 1,
    });
    world.setNetworkMotion(entity, {
      target: [0, 2, 3],
      kind: 'collapsed',
      path: [],
      speed: 0,
      moving: true,
    });
    for (let frame = 0; frame < 600; frame++) {
      world.updateNetwork(1 / 60);
      entity.position[1] = 0;
    }
    expect(entity.networkMoving).toBe(false);
  });
});

describe('World.setQuestStatus', () => {
  const GOSSIP = 1 << 0;

  function questGiver(npcFlags: number) {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    // `NetworkBodies` computes `baseInteractionIcon` from the flags with the
    // quest bit masked off — the icon this giver falls back to once no quest
    // is on offer. A quest giver with nothing else set falls back to nothing.
    const entity = world.add({
      kind: 'creature',
      model: 'npc.bdae',
      position: [0, 0, 0],
      rotation: NO_ROT,
      scale: UNIT,
      entry: 1,
      npcFlags,
      interactionIcon: 'ui/icons/head/ui_head_questavailable.png',
      baseInteractionIcon: npcFlags & GOSSIP ? 'ui/icons/head/ui_head_chat.png' : undefined,
    });
    return { world, entity };
  }

  it('shows the quest icon for a quest on offer and one ready to hand in', () => {
    const { world, entity } = questGiver(0);
    world.setQuestStatus(entity, 'available');
    expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_questavailable.png');
    world.setQuestStatus(entity, 'finished');
    expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_questfinished.png');
  });

  it('lets a giver that also offers gossip show the chat icon while its quest is under way', () => {
    const { world, entity } = questGiver(GOSSIP);
    world.setQuestStatus(entity, 'incomplete');
    expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_chat.png');
  });

  it('shows the quest icon over gossip once the quest can actually be picked up or handed in', () => {
    const { world, entity } = questGiver(GOSSIP);
    world.setQuestStatus(entity, 'available');
    expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_questavailable.png');
    world.setQuestStatus(entity, 'finished');
    expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_questfinished.png');
  });

  it('falls back to the giver’s base icon once no quest is available at all', () => {
    const { world, entity } = questGiver(GOSSIP);
    world.setQuestStatus(entity, 'available');
    world.setQuestStatus(entity, 'none');
    expect(entity.interactionIcon).toBe('ui/icons/head/ui_head_chat.png');
  });

  it('never lets a quest status override a static object’s own dedicated icon', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const mailbox = world.add({
      kind: 'static',
      model: 'mailbox.bdae',
      position: [0, 0, 0],
      rotation: NO_ROT,
      scale: UNIT,
      entry: 0,
      interactionIcon: 'ui/icons/head/ui_head_mail.png',
    });
    world.setQuestStatus(mailbox, 'available');
    expect(mailbox.interactionIcon).toBe('ui/icons/head/ui_head_mail.png');
  });

  it('applies quest status normally to a static object with no dedicated icon of its own', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    const questObject = world.add({
      kind: 'static',
      model: 'quest_object.bdae',
      position: [0, 0, 0],
      rotation: NO_ROT,
      scale: UNIT,
      entry: 0,
    });
    world.setQuestStatus(questObject, 'available');
    expect(questObject.interactionIcon).toBe('ui/icons/head/ui_head_questavailable.png');
  });
});

describe('settling a body onto the ground', () => {
  /**
   * A body that is already standing on something must stay where it is when
   * it is settled again. Settling searches upward from where the body is, so
   * a body settled every frame — which is what a chasing creature gets — can
   * climb its own step height each time and walk up into the air.
   */
  it('does not climb when the same body is settled over and over', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.collision.load({
      items: [
        {
          path: 'floor.phy',
          pos: [0, 0, 0],
          rot: [0, 0, 0, 1],
          scale: [1, 1, 1],
          geoms: [
            {
              type: 'mesh',
              position: [0, 0, 0],
              vertices: [
                [-10, 5, -10],
                [10, 5, -10],
                [10, 5, 10],
                [-10, 5, 10],
              ],
              faces: [
                [0, 1, 2, 0],
                [0, 2, 3, 0],
              ],
            },
          ],
        },
      ],
    });

    let y = world.restingFrom(0, 5, 0).y;
    const first = y;
    for (let i = 0; i < 20; i++) y = world.restingFrom(0, y, 0).y;

    expect(y).toBe(first);
  });
});

describe('hiding a festival placement', () => {
  const at = (
    model: string,
    position: [number, number, number],
    kind: Placement['kind'],
    entry: number,
  ): Placement => ({ model, position, rotation: [...NO_ROT], scale: [...UNIT], entry, kind });

  /** A wall placed at the hidden spot, spanning x = 10, z = 5..15, y = 0..4. */
  const wall = (path: string, entry?: number): CollisionItem => ({
    path,
    pos: [10, 2, 10],
    rot: [...NO_ROT],
    scale: [...UNIT],
    geoms: [
      {
        type: 'mesh',
        position: [0, 0, 0],
        vertices: [
          [0, -2, -5],
          [0, -2, 5],
          [0, 2, 5],
          [0, 2, -5],
        ],
        faces: [
          [0, 1, 2, 0],
          [0, 2, 3, 0],
        ],
      },
    ],
    ...(entry === undefined ? {} : { entry }),
  });

  function tileWith(placements: Placement[], collision: CollisionItem[] = []): TileData {
    return { mapId: 1, tile: [0, 0], terrain: null, placements, collision };
  }

  const models = (world: World): string[] => [...world.entities.values()].map(e => e.model).sort();
  const blockedAt = (world: World): boolean =>
    world.collision.wallsNear(10, 10, 0.5, 2, 1).length > 0;

  /**
   * What a thing carries does not sit at its feet. The stars on a festival
   * flag are their own placements at the top of the pole — so matched on
   * height as tightly as on the ground plane, the flag went and its stars
   * stayed, hanging in the air over nothing.
   */
  it('takes what a spawned object carries as well as the object itself', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.setHidden([[10, 2, 10]]);
    world.addTile(
      tileWith([
        at('flag.bdae', [10, 2, 10], 'static', 5),
        at('star.beff', [10, 9, 10], 'effect', 5),
      ]),
    );

    expect(models(world)).toEqual([]);
  });

  it('takes an effect by where its object stands, not where the effect sits', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.setHidden([[10, 2, 10]]);
    world.addTile(tileWith([{ ...at('star.beff', [13, 9, 11], 'effect', 5), owner: [10, 2, 10] }]));

    expect(models(world)).toEqual([]);
  });

  it('does not reach sideways to whatever stands beside it', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.setHidden([[10, 2, 10]]);
    world.addTile(tileWith([at('lamp.bdae', [14, 2, 10], 'static', 6)]));

    expect(models(world)).toEqual(['lamp.bdae']);
  });

  it('does not reach up through a floor above it', () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.setHidden([[10, 2, 10]]);
    world.addTile(tileWith([at('lamp.bdae', [10, 40, 10], 'static', 6)]));

    expect(models(world)).toEqual(['lamp.bdae']);
  });

  /**
   * The server lists objects its spawn tables place. The map's own scenery
   * is not among them, however close it stands: a railing whose origin is a
   * hand's width from a hidden festive lamp is still a railing.
   */
  it("leaves the map's own scenery standing on the same spot", () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.setHidden([[10, 2, 10]]);
    world.addTile(
      tileWith([
        at('lamp.bdae', [10, 2, 10], 'static', 5),
        at('railing.bdae', [10.4, 1.5, 10.1], 'scenery', 0),
        at('glow.beff', [10, 3, 10], 'effect', 0),
      ]),
    );

    expect(models(world)).toEqual(['glow.beff', 'railing.bdae']);
  });

  it("leaves the map's own scenery standing when the list arrives after it", () => {
    const world = new World({} as ConstructorParameters<typeof World>[0]);
    world.addTile(
      tileWith([
        at('lamp.bdae', [10, 2, 10], 'static', 5),
        at('railing.bdae', [10.4, 1.5, 10.1], 'scenery', 0),
      ]),
    );
    world.setHidden([[10, 2, 10]]);

    expect(models(world)).toEqual(['railing.bdae']);
  });

  it("keeps the map's own walls solid at a hidden spot", () => {
    const before = new World({} as ConstructorParameters<typeof World>[0]);
    before.setHidden([[10, 2, 10]]);
    before.addTile(tileWith([], [wall('railing.phy')]));
    expect(blockedAt(before)).toBe(true);

    const after = new World({} as ConstructorParameters<typeof World>[0]);
    after.addTile(tileWith([], [wall('railing.phy')]));
    after.setHidden([[10, 2, 10]]);
    expect(blockedAt(after)).toBe(true);
  });

  it("takes a hidden spawned object's own walls with it", () => {
    const before = new World({} as ConstructorParameters<typeof World>[0]);
    before.setHidden([[10, 2, 10]]);
    before.addTile(tileWith([at('fence.bdae', [10, 2, 10], 'static', 5)], [wall('fence.phy', 5)]));
    expect(blockedAt(before)).toBe(false);

    const after = new World({} as ConstructorParameters<typeof World>[0]);
    after.addTile(tileWith([at('fence.bdae', [10, 2, 10], 'static', 5)], [wall('fence.phy', 5)]));
    after.setHidden([[10, 2, 10]]);
    expect(blockedAt(after)).toBe(false);
  });
});
