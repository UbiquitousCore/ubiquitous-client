/**
 * Collision queries, on geometry small enough to reason about by hand.
 *
 * The cases here are the ones that were wrong in the grid-of-average-heights
 * implementation this replaced: a sloped face reading its true height rather
 * than its average, a surface above head height not being snapped to, and a
 * wall being solid from both sides.
 */

import { describe, expect, it } from 'vitest';
import { CollisionWorld, STEP_UP } from '../src/world/CollisionWorld';
import { resolveWalls, PLAYER_RADIUS } from '../src/gameplay/PlayerMovement';
import type { CollisionData, CollisionGeom, CollisionItem } from '../src/assets/types';

const NO_ROT: [number, number, number, number] = [0, 0, 0, 1];
const UNIT: [number, number, number] = [1, 1, 1];

function item(geoms: CollisionGeom[], pos: [number, number, number] = [0, 0, 0]): CollisionItem {
  return { path: 'test.phy', pos, rot: [...NO_ROT], scale: [...UNIT], geoms };
}

function mesh(
  vertices: [number, number, number][],
  faces: [number, number, number, number][],
): CollisionGeom {
  return { type: 'mesh', position: [0, 0, 0], vertices, faces };
}

function world(...items: CollisionItem[]): CollisionWorld {
  const data: CollisionData = { items };
  const w = new CollisionWorld();
  w.load(data);
  return w;
}

/** A flat 10x10 slab at height y, as two triangles. */
function slab(y: number): CollisionGeom {
  return mesh(
    [
      [0, y, 0],
      [10, y, 0],
      [10, y, 10],
      [0, y, 10],
    ],
    [
      [0, 1, 2, 0],
      [0, 2, 3, 0],
    ],
  );
}

describe('CollisionWorld.groundAt', () => {
  it('does not make interior trigger geometry a solid wall', () => {
    const w = world(
      item([
        {
          type: 'primitive',
          shape: 'box',
          flags: 1,
          position: [0, 1, 0],
          halfSize: [2, 1, 0.1],
        },
      ]),
    );

    expect(w.wallsNear(0, 0, 0, 2, 1)).toHaveLength(0);
  });

  it('reads a sloped face at its true height, not its average', () => {
    // A ramp from y=0 at z=0 to y=8 at z=8, one triangle pair wide.
    const w = world(
      item([
        mesh(
          [
            [0, 0, 0],
            [8, 0, 0],
            [8, 8, 8],
            [0, 8, 8],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    );

    // Quarter of the way along is a quarter of the way up, not the face's
    // average of 4.
    const hit = w.groundAt(4, 2, 2);
    expect(hit).not.toBeNull();
    expect(hit!.y).toBeCloseTo(2, 5);

    expect(w.groundAt(4, 6, 6)!.y).toBeCloseTo(6, 5);
  });

  it('finds nothing outside the geometry footprint', () => {
    const w = world(item([slab(5)]));
    expect(w.groundAt(20, 20, 5)).toBeNull();
    // Just past the edge, in the same grid cell as the slab's last row.
    expect(w.groundAt(10.5, 5, 5)).toBeNull();
  });

  it('snaps up to a surface within one step, and ignores one further up', () => {
    const w = world(item([slab(5)]));
    expect(w.groundAt(5, 5, 5 - STEP_UP + 0.1)).not.toBeNull();
    expect(w.groundAt(5, 5, 5 - STEP_UP - 0.1)).toBeNull();
  });

  it('leaves you under a bridge rather than teleporting you onto it', () => {
    // Ground at 0, deck at 8: the highest surface is not the answer.
    const w = world(item([slab(0)]), item([slab(8)]));
    expect(w.groundAt(5, 5, 0)!.y).toBeCloseTo(0, 5);
    // Standing on the deck keeps you on the deck.
    expect(w.groundAt(5, 5, 8)!.y).toBeCloseTo(8, 5);
  });

  it('picks the highest of two surfaces that are both within reach', () => {
    const w = world(item([slab(0)]), item([slab(STEP_UP / 2)]));
    expect(w.groundAt(5, 5, 0)!.y).toBeCloseTo(STEP_UP / 2, 5);
  });

  it('does not step onto the furniture it should be stopped by', () => {
    // A stone bench in zone 471 is 0.81 units tall. If STEP_UP ever creeps
    // above that, you walk through benches instead of around them.
    expect(STEP_UP).toBeLessThan(0.81);
  });

  it('does not stand you on a wall', () => {
    // A vertical quad in the xz plane at z=5.
    const w = world(
      item([
        mesh(
          [
            [0, 0, 5],
            [10, 0, 5],
            [10, 10, 5],
            [0, 10, 5],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    );
    expect(w.groundAt(5, 5, 0)).toBeNull();
  });

  it('turns a primitive block into a floor you stand on and sides you do not', () => {
    const w = world(item([{ type: 'primitive', position: [0, 2, 0], halfSize: [4, 2, 4] }]));
    // Top face at y = 2 + 2.
    expect(w.groundAt(0, 0, 4)!.y).toBeCloseTo(4, 5);
    expect(w.wallsNear(4, 0, 0, 4, 0.5).length).toBeGreaterThan(0);
  });

  it('keeps a flat panel instead of discarding it as degenerate', () => {
    // One extent of exactly zero: how walls are stored as plane primitives.
    const w = world(item([{ type: 'primitive', position: [0, 3, 0], halfSize: [5, 3, 0] }]));
    expect(w.triangleCount()).toBeGreaterThan(0);
    expect(w.wallsNear(0, 0, 1, 5, 1).length).toBeGreaterThan(0);
  });

  it('collides a cylinder as a cylinder, not as its bounding box', () => {
    // A box would put solid corners at 1.41r; a cylinder must not.
    const cyl = world(
      item([{ type: 'primitive', shape: 'cylinder', position: [0, 2, 0], halfSize: [2, 2, 2] }]),
    );
    const box = world(
      item([{ type: 'primitive', shape: 'box', position: [0, 2, 0], halfSize: [2, 2, 2] }]),
    );
    // Straight out along an axis: both are solid.
    expect(cyl.groundAt(1.8, 0, 4)).not.toBeNull();
    expect(box.groundAt(1.8, 0, 4)).not.toBeNull();
    // Out at the diagonal corner: only the box reaches.
    expect(box.groundAt(1.9, 1.9, 4)).not.toBeNull();
    expect(cyl.groundAt(1.9, 1.9, 4)).toBeNull();
  });

  it('applies a primitive block rotY about the vertical axis', () => {
    const long: CollisionGeom = { type: 'primitive', position: [0, 0, 0], halfSize: [8, 1, 1] };
    const turned: CollisionGeom = { ...long, rotY: Math.PI / 2 };
    // Unturned the block reaches out along x; turned, it reaches along z.
    expect(world(item([long])).groundAt(6, 0, 1)).not.toBeNull();
    expect(world(item([long])).groundAt(0, 6, 1)).toBeNull();
    expect(world(item([turned])).groundAt(6, 0, 1)).toBeNull();
    expect(world(item([turned])).groundAt(0, 6, 1)).not.toBeNull();
  });
});

describe('CollisionWorld cells', () => {
  it('keeps every cell its own, either side of the origin', () => {
    // A slab in one cell west of the origin and north of it; every mirrored
    // cell must come back empty, or a slab is found where nothing stands.
    const w = world(item([slab(2)], [-10, 0, 20]));
    expect(w.groundAt(-5, 25, 2)?.y).toBeCloseTo(2, 5);
    for (const [x, z] of [
      [5, 25],
      [-5, -25],
      [5, -25],
      [25, -5],
      [-25, 5],
    ] as const) {
      expect(w.groundAt(x, z, 2)).toBeNull();
    }
  });

  it('finds the same walls when asked twice in a row', () => {
    const wall = mesh(
      [
        [0, 0, 0],
        [0, 0, 10],
        [0, 3, 10],
        [0, 3, 0],
      ],
      [
        [0, 1, 2, 0],
        [0, 2, 3, 0],
      ],
    );
    const w = world(item([wall]));
    const first = [...w.wallsNear(0.5, 5, 0.5, 2, 1)];
    expect(first.length).toBeGreaterThan(0);
    expect([...w.wallsNear(0.5, 5, 0.5, 2, 1)]).toEqual(first);
  });
});

describe('resolveWalls', () => {
  /** A vertical wall across x, standing at z = 0, from y=0 to y=6. */
  function wall(): CollisionWorld {
    return world(
      item([
        mesh(
          [
            [-10, 0, 0],
            [10, 0, 0],
            [10, 6, 0],
            [-10, 6, 0],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    );
  }

  /** A steep ramp rising 51 units over 20 in z, steep enough to count as a wall. */
  function ramp(): CollisionWorld {
    return world(
      item([
        mesh(
          [
            [-10, -41, -10],
            [10, -41, -10],
            [10, 10, 10],
            [-10, 10, 10],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    );
  }

  it('lets you stand over a steep slope whose range reaches you but whose surface here is far below', () => {
    const r = resolveWalls(ramp(), 0, -9.9, 0, -9.8, 7);
    expect(r.blocked).toBe(false);
  });

  it('still stops you at a slope that is at your height', () => {
    const r = resolveWalls(ramp(), 0, -9.9, 0, -9.8, -41.5);
    expect(r.blocked).toBe(true);
  });

  it('stops you at the player radius instead of letting you through', () => {
    const w = wall();
    const r = resolveWalls(w, 0, 0.2, 0, 1, 0);
    expect(r.blocked).toBe(true);
    expect(r.z).toBeCloseTo(PLAYER_RADIUS, 5);
  });

  it('blocks from the other side too', () => {
    const w = wall();
    const r = resolveWalls(w, 0, -0.2, 0, -1, 0);
    expect(r.blocked).toBe(true);
    expect(r.z).toBeCloseTo(-PLAYER_RADIUS, 5);
  });

  it('never pushes you out through the far face of a thin panel', () => {
    const w = wall();
    let z = 2;
    for (let i = 0; i < 40; i++) {
      z = resolveWalls(w, 0, z - 0.45, 0, z, 0).z;
    }
    expect(z).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-6);
  });

  it('lets you slide along a wall rather than sticking to it', () => {
    const w = wall();
    let x = 0;
    let z = 1;
    for (let i = 0; i < 20; i++) {
      const r = resolveWalls(w, x + 0.3, z - 0.3, x, z, 0);
      x = r.x;
      z = r.z;
    }
    // Pinned off the wall, but carried the full distance along it.
    expect(z).toBeCloseTo(PLAYER_RADIUS, 5);
    expect(x).toBeCloseTo(6, 5);
  });

  it('does not block on a wall you are stepping over', () => {
    // A kerb: solid, but its top is within one step of the feet.
    const w = world(
      item([
        mesh(
          [
            [-10, 0, 0],
            [10, 0, 0],
            [10, STEP_UP - 0.2, 0],
            [-10, STEP_UP - 0.2, 0],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    );
    expect(resolveWalls(w, 0, 0.2, 0, 1, 0).blocked).toBe(false);
  });

  it('does not block on a wall that is above your head', () => {
    const w = world(
      item([
        mesh(
          [
            [-10, 8, 0],
            [10, 8, 0],
            [10, 14, 0],
            [-10, 14, 0],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    );
    expect(resolveWalls(w, 0, 0.2, 0, 1, 0).blocked).toBe(false);
  });

  it('lets you walk past the end of a wall', () => {
    const w = wall();
    // x = 12 is clear of the wall's span, which stops at x = 10.
    const r = resolveWalls(w, 12, 0, 12, 1, 0);
    expect(r.blocked).toBe(false);
    expect(r.z).toBe(0);
  });

  it('is a no-op when nothing is loaded', () => {
    const empty = new CollisionWorld();
    expect(resolveWalls(empty, 3, 4, 0, 0, 0)).toEqual({ x: 3, z: 4, blocked: false });
  });
});

describe('CollisionWorld.debugTriangles', () => {
  it('emits three world-space vertices and a kind per triangle', () => {
    const w = world(item([slab(3)]));
    const { positions, kinds } = w.debugTriangles();
    expect(kinds).toHaveLength(w.triangleCount());
    expect(positions).toHaveLength(w.triangleCount() * 9);
    expect(kinds.every(k => k === 'floor')).toBe(true);
    // Every vertex of a flat slab sits at its height.
    for (let i = 1; i < positions.length; i += 3) expect(positions[i]).toBeCloseTo(3, 5);
  });
});

describe('CollisionWorld.segmentHit', () => {
  /** A vertical wall in the XY plane at z, spanning x 0..10 and y 0..10. */
  function wall(z: number): CollisionGeom {
    return mesh(
      [
        [0, 0, z],
        [10, 0, z],
        [10, 10, z],
        [0, 10, z],
      ],
      [
        [0, 1, 2, 0],
        [0, 2, 3, 0],
      ],
    );
  }

  it('reports the distance to a wall in the way', () => {
    const w = world(item([wall(5)]));
    const hit = w.segmentHit([5, 5, 0], [5, 5, 10]);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(5, 5);
  });

  it('finds nothing when the line misses', () => {
    const w = world(item([wall(5)]));
    // Passes beside the wall, which only spans x 0..10.
    expect(w.segmentHit([20, 5, 0], [20, 5, 10])).toBeNull();
  });

  it('stops at the segment end rather than continuing along the ray', () => {
    const w = world(item([wall(5)]));
    // The wall is at z=5; this segment stops at z=3 and must not see it.
    expect(w.segmentHit([5, 5, 0], [5, 5, 3])).toBeNull();
  });

  it('is solid from behind as well as in front', () => {
    // The camera can be on either side, so a back-facing hit counts.
    const w = world(item([wall(5)]));
    const hit = w.segmentHit([5, 5, 10], [5, 5, 0]);
    expect(hit).not.toBeNull();
    expect(hit!.distance).toBeCloseTo(5, 5);
  });

  it('returns the nearest of several hits', () => {
    const w = world(item([wall(3)]), item([wall(7)]));
    expect(w.segmentHit([5, 5, 0], [5, 5, 10])!.distance).toBeCloseTo(3, 5);
  });
});

/**
 * Collision streams with the tile that brought it.
 *
 * Two things must hold as a player walks: geometry from an evicted tile stops
 * blocking them, and geometry from every tile still resident keeps working.
 * The second is the one at risk: were the spatial index to hold indices into
 * one flat array, dropping a tile out of the middle of it would invalidate
 * every index after it.
 */
describe('CollisionWorld grouping', () => {
  it('has nothing to collide with until a group arrives', () => {
    const w = new CollisionWorld();
    expect(w.isLoaded()).toBe(false);
    w.addGroup('0,0', [item([slab(4)])]);
    expect(w.isLoaded()).toBe(true);
    expect(w.groundAt(5, 5, 4)?.y).toBeCloseTo(4, 5);
  });

  it('stops blocking once its group is dropped', () => {
    const w = new CollisionWorld();
    w.addGroup('0,0', [item([slab(4)])]);
    w.removeGroup('0,0');
    expect(w.groundAt(5, 5, 4)).toBeNull();
    expect(w.triangleCount()).toBe(0);
    expect(w.cellCount()).toBe(0);
  });

  it('leaves the neighbouring groups intact when one is evicted', () => {
    const w = new CollisionWorld();
    // Three slabs stacked in x, one per "tile", all landing in cells that
    // overlap so the index has to be unpicked rather than truncated.
    w.addGroup('a', [item([slab(4)], [0, 0, 0])]);
    w.addGroup('b', [item([slab(6)], [4, 0, 0])]);
    w.addGroup('c', [item([slab(8)], [8, 0, 0])]);

    w.removeGroup('b');

    // a still blocks, and c's triangles are still reachable: the index used
    // to be indices into one flat array, so dropping b out of the middle
    // would have left every reference past it pointing at the wrong triangle.
    expect(w.groundAt(2, 5, 4)?.y).toBeCloseTo(4, 5);
    expect(w.groundAt(16, 5, 8)?.y).toBeCloseTo(8, 5);
    // x = 6 sits under both a (0..10, y = 4) and b (4..14, y = 6). With b
    // gone, a body up at y = 6 falls through to a rather than standing on it.
    expect(w.groundAt(6, 5, 6)?.y).toBeCloseTo(4, 5);
  });

  it('unpicks a cell crowded by one group without disturbing its neighbour', () => {
    // The shape that made eviction quadratic: many triangles from the same
    // group landing in one 4-unit grid cell, sharing it with another group's.
    // Filtering the bucket once per doomed triangle costs O(k²) and allocates
    // a replacement array each time; one pass over the touched cells does not.
    // Both must reach the same answer, which is what this pins.
    const w = new CollisionWorld();
    const crowd: CollisionItem[] = [];
    for (let i = 0; i < 200; i++) {
      // A 1x1 patch inside cell (0,0), stacked so none is degenerate.
      crowd.push(
        item([
          mesh(
            [
              [0, i * 0.01, 0],
              [1, i * 0.01, 0],
              [1, i * 0.01, 1],
              [0, i * 0.01, 1],
            ],
            [
              [0, 1, 2, 0],
              [0, 2, 3, 0],
            ],
          ),
        ]),
      );
    }
    w.addGroup('crowded', crowd);
    w.addGroup('keeper', [
      item([
        mesh(
          [
            [0, 50, 0],
            [1, 50, 0],
            [1, 50, 1],
            [0, 50, 1],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    ]);

    const cellsBefore = w.cellCount();
    w.removeGroup('crowded');

    // Exactly the keeper's two triangles survive, and the cell they share
    // with the crowd must not have been deleted along with it.
    expect(w.triangleCount()).toBe(2);
    expect(w.cellCount()).toBe(cellsBefore);
    expect(w.groundAt(0.5, 0.5, 50)?.y).toBeCloseTo(50, 5);
    // Nothing of the crowd is reachable, at any height.
    expect(w.groundAt(0.5, 0.5, 0.5)).toBeNull();
  });

  it('deletes only the cells a dropped group had entirely to itself', () => {
    const w = new CollisionWorld();
    w.addGroup('shared', [
      item([
        mesh(
          [
            [0, 1, 0],
            [1, 1, 0],
            [1, 1, 1],
            [0, 1, 1],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    ]);
    // Far enough away to have cells of its own, plus one in the shared cell.
    w.addGroup('doomed', [
      item([
        mesh(
          [
            [0, 2, 0],
            [1, 2, 0],
            [1, 2, 1],
            [0, 2, 1],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
      item([
        mesh(
          [
            [40, 2, 40],
            [41, 2, 40],
            [41, 2, 41],
            [40, 2, 41],
          ],
          [
            [0, 1, 2, 0],
            [0, 2, 3, 0],
          ],
        ),
      ]),
    ]);
    expect(w.cellCount()).toBe(2);

    w.removeGroup('doomed');

    // The far cell goes; the one still holding `shared` stays.
    expect(w.cellCount()).toBe(1);
    expect(w.groundAt(0.5, 0.5, 1)?.y).toBeCloseTo(1, 5);
    expect(w.groundAt(40.5, 40.5, 2)).toBeNull();
  });

  it('replaces rather than doubles a group added twice', () => {
    const w = new CollisionWorld();
    w.addGroup('0,0', [item([slab(4)])]);
    const once = w.triangleCount();
    w.addGroup('0,0', [item([slab(4)])]);
    expect(w.triangleCount()).toBe(once);
  });

  it('ignores a group it never had', () => {
    const w = new CollisionWorld();
    w.addGroup('a', [item([slab(4)])]);
    w.removeGroup('nowhere');
    expect(w.triangleCount()).toBeGreaterThan(0);
  });

  it('reports every resident group in the debug view', () => {
    const w = new CollisionWorld();
    w.addGroup('a', [item([slab(4)])]);
    w.addGroup('b', [item([slab(6)], [40, 0, 0])]);
    const before = w.debugTriangles();
    expect(before.kinds).toHaveLength(w.triangleCount());
    expect(before.positions).toHaveLength(w.triangleCount() * 9);

    w.removeGroup('a');
    const after = w.debugTriangles();
    expect(after.kinds).toHaveLength(w.triangleCount());
    expect(after.kinds.length).toBeLessThan(before.kinds.length);
  });
});

describe('CollisionWorld open areas', () => {
  /** A wall panel standing across x=4, from z=0 to z=8. */
  function wall(): CollisionItem {
    return item([
      {
        type: 'primitive',
        shape: 'box',
        position: [4, 2, 4],
        halfSize: [0.1, 2, 4],
      },
    ]);
  }

  it('lets a named box stop a wall blocking', () => {
    const w = world(wall());
    expect(w.wallsNear(4, 4, 0, 4, 1).length).toBeGreaterThan(0);

    w.openArea('door', { minX: 3, maxX: 5, minZ: 0, maxZ: 8 });
    expect(w.wallsNear(4, 4, 0, 4, 1)).toHaveLength(0);

    // Every box goes at once on a map change; nothing shuts one by name.
    w.closeAllAreas();
    expect(w.wallsNear(4, 4, 0, 4, 1).length).toBeGreaterThan(0);
  });

  it('leaves walls outside the box alone', () => {
    const w = world(wall());

    // A box well clear of the panel opens nothing.
    w.openArea('elsewhere', { minX: 50, maxX: 60, minZ: 50, maxZ: 60 });

    expect(w.wallsNear(4, 4, 0, 4, 1).length).toBeGreaterThan(0);
  });

  it('opens geometry that streams in after the box was opened', () => {
    // A door can open while the tile holding it is still on its way.
    const w = new CollisionWorld();
    w.openArea('door', { minX: 3, maxX: 5, minZ: 0, maxZ: 8 });
    w.addGroup('tile', [wall()]);

    expect(w.wallsNear(4, 4, 0, 4, 1)).toHaveLength(0);
  });

  it('never opens the floor under a doorway', () => {
    const w = world(item([slab(0)]));
    w.openArea('door', { minX: -100, maxX: 100, minZ: -100, maxZ: 100 });

    // Something to stand on, however wide the box is.
    expect(w.groundAt(5, 5, 2)).not.toBeNull();
  });

  it('survives the geometry being replaced under it', () => {
    // The message that opens a way arrives before the zone load that brings
    // the geometry it applies to. Forgetting on clear lost the answer.
    const w = world(wall());
    w.openArea('door', { minX: 3, maxX: 5, minZ: 0, maxZ: 8 });

    w.load({ items: [wall()] });

    expect(w.wallsNear(4, 4, 0, 4, 1)).toHaveLength(0);
  });

  it('forgets every box only when told to', () => {
    const w = world(wall());
    w.openArea('door', { minX: 3, maxX: 5, minZ: 0, maxZ: 8 });

    w.closeAllAreas();

    expect(w.wallsNear(4, 4, 0, 4, 1).length).toBeGreaterThan(0);
    expect(w.openAreaList()).toHaveLength(0);
  });
});

describe('CollisionWorld open areas over large geometry', () => {
  it('opens a wall that spans far beyond the box it crosses', () => {
    // One triangle for a whole wall, every corner outside a doorway-sized
    // box. Requiring a corner inside would leave this solid.
    const w = world(
      item([
        mesh(
          [
            [-40, 0, 0],
            [40, 0, 0],
            [40, 6, 0],
          ],
          [[0, 1, 2, 0]],
        ),
      ]),
    );
    expect(w.wallsNear(0, 0, 0, 4, 1).length).toBeGreaterThan(0);

    w.openArea('door', { minX: -2, maxX: 2, minZ: -1, maxZ: 1 });

    expect(w.wallsNear(0, 0, 0, 4, 1)).toHaveLength(0);
  });

  it('still leaves geometry nowhere near the box alone', () => {
    const w = world(
      item([
        mesh(
          [
            [100, 0, 100],
            [140, 0, 100],
            [140, 6, 100],
          ],
          [[0, 1, 2, 0]],
        ),
      ]),
    );

    w.openArea('door', { minX: -2, maxX: 2, minZ: -1, maxZ: 1 });

    expect(w.wallsNear(120, 100, 0, 4, 40).length).toBeGreaterThan(0);
  });
});

describe('CollisionWorld.removeMatching', () => {
  /** A slab named `path`, at height y, spanning x/z 0..10. */
  function named(path: string, y: number): CollisionItem {
    return { path, pos: [0, 0, 0], rot: [...NO_ROT], scale: [...UNIT], geoms: [slab(y)] };
  }

  const WHOLE_SLAB = { minX: -1, maxX: 11, minZ: -1, maxZ: 11 };

  it('takes out the named object and leaves the floor under it', () => {
    const w = world(named('hall.phy', 1), named('door01.phy', 3));
    expect(w.triangleCount()).toBe(4);

    expect(w.removeMatching(WHOLE_SLAB, ['door01'])).toBe(2);

    // The door is gone from every query, standable surfaces included — a
    // door you have opened is not something to stand on.
    expect(w.triangleCount()).toBe(2);
    expect(w.groundAt(5, 10, 5)?.path).toBe('hall.phy');
  });

  it('leaves the same model alone where it stands outside the area', () => {
    const w = world(named('door01.phy', 3));
    expect(w.removeMatching({ minX: 100, maxX: 110, minZ: 100, maxZ: 110 }, ['door01'])).toBe(0);
    expect(w.triangleCount()).toBe(2);
  });

  it('names nothing and removes nothing', () => {
    const w = world(named('door01.phy', 3));
    expect(w.removeMatching(WHOLE_SLAB, [])).toBe(0);
    expect(w.triangleCount()).toBe(2);
  });
});

describe('what the ground underfoot is made of', () => {
  it('reports wood where the block carries the wood bit, and nothing else', () => {
    const deck: CollisionGeom = { ...slab(2), flags: 0x400 };
    const w = world(item([deck]), item([slab(1)], [20, 0, 0]));
    expect(w.groundAt(5, 5, 2)?.wood).toBe(true);
    expect(w.groundAt(25, 5, 1)?.wood).toBe(false);
  });
});
