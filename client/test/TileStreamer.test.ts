/**
 * The streaming window, and the rules it keeps.
 *
 * These are the ones that decide whether you can walk across the map: which
 * tiles are resident, when the window moves, and what is dropped when it does.
 * A synthetic source stands in for the packs so each case names exactly the
 * tiles it expects, with no game data involved.
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_TILE_WINDOW, FOLLOW_SLACK, TileStreamer, tileOf } from '../src/world/TileStreamer';
import type { TileData } from '../src/assets/types';
import { TILE_SIZE } from '../src/world/Terrain';

/** Records what the streamer asked for and what it handed over. */
function harness(opts: { blockSize?: number; slack?: number } = {}) {
  const requested: string[] = [];
  const added: string[] = [];
  const dropped: string[] = [];
  const resident = new Set<string>();

  const streamer = new TileStreamer(
    {
      async tile(mapId, tx, tz): Promise<TileData> {
        requested.push(`${mapId}:${tx},${tz}`);
        return { mapId, tile: [tx, tz], terrain: null, placements: [], collision: [] };
      },
    },
    {
      addTile(data) {
        const key = `${data.tile[0]},${data.tile[1]}`;
        added.push(key);
        resident.add(key);
      },
      dropTile(tx, tz) {
        const key = `${tx},${tz}`;
        dropped.push(key);
        resident.delete(key);
      },
    },
    opts,
  );
  return { streamer, requested, added, dropped, resident };
}

/** Centre of tile (tx, tz) in world units. */
const at = (tx: number, tz: number): [number, number] => [
  tx * TILE_SIZE + TILE_SIZE / 2,
  tz * TILE_SIZE + TILE_SIZE / 2,
];

describe('tileOf', () => {
  it('is floor(x / 64), negatives included', () => {
    expect(tileOf(0, 0)).toEqual([0, 0]);
    expect(tileOf(63.9, 63.9)).toEqual([0, 0]);
    expect(tileOf(64, 64)).toEqual([1, 1]);
    // The bug this pins: truncation toward zero would put -1 in tile 0 and
    // leave the whole western half of every map one tile out.
    expect(tileOf(-1, -1)).toEqual([-1, -1]);
    expect(tileOf(-64, -64)).toEqual([-1, -1]);
    expect(tileOf(-65, -65)).toEqual([-2, -2]);
  });
});

describe('TileStreamer window', () => {
  it('forces the block size odd and at least 3', () => {
    expect(harness({ blockSize: 6 }).streamer.blockSize).toBe(7);
    expect(harness({ blockSize: 1 }).streamer.blockSize).toBe(3);
    expect(harness({ blockSize: 5 }).streamer.blockSize).toBe(5);
    expect(harness().streamer.blockSize).toBe(DEFAULT_TILE_WINDOW);
  });

  it('loads exactly the block around the player and nothing else', async () => {
    const h = harness({ blockSize: 5 });
    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();

    expect(h.added).toHaveLength(25);
    expect(h.resident.has('10,10')).toBe(true);
    expect(h.resident.has('8,8')).toBe(true);
    expect(h.resident.has('12,12')).toBe(true);
    // One outside the block in each axis.
    expect(h.resident.has('7,10')).toBe(false);
    expect(h.resident.has('10,13')).toBe(false);
  });

  it('asks for every tile again when told the map it already has', async () => {
    // A zone load empties the world before naming its map. Naming the same
    // map left the window believing the old tiles were still in it, so the
    // second load of a zone on that map stood on nothing.
    const h = harness({ blockSize: 3 });
    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();
    h.resident.clear();
    h.requested.length = 0;

    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();

    expect(h.requested).toHaveLength(9);
    expect(h.resident.size).toBe(9);
  });

  it('settles on the ground underfoot without waiting for the far corners', async () => {
    // Nearest-first ordering does not help a caller that waits for *all* of
    // it — and `loadZone` did, so arriving somewhere meant waiting on tiles
    // 224 units out, past the fog wall, before the player was put on the
    // ground. This is the gate it uses instead.
    const held = new Map<string, () => void>();
    const added: string[] = [];
    const streamer = new TileStreamer(
      {
        tile(mapId, tx, tz): Promise<TileData> {
          const key = `${tx},${tz}`;
          return new Promise(resolve => {
            held.set(key, () =>
              resolve({ mapId, tile: [tx, tz], terrain: null, placements: [], collision: [] }),
            );
          });
        },
      },
      {
        addTile: d => {
          added.push(`${d.tile[0]},${d.tile[1]}`);
        },
        dropTile: () => undefined,
      },
      { blockSize: 5, slack: 0 },
    );
    streamer.setMap(1);
    streamer.update(...at(0, 0));
    expect(streamer.pending).toBe(25);

    // Land only the 3x3 the player actually stands on. The ring beyond it is
    // still in flight and must not be waited on.
    for (let tx = -1; tx <= 1; tx++) {
      for (let tz = -1; tz <= 1; tz++) held.get(`${tx},${tz}`)!();
    }
    await streamer.whenSettled(1);

    expect(added.sort()).toEqual([
      '-1,-1',
      '-1,0',
      '-1,1',
      '0,-1',
      '0,0',
      '0,1',
      '1,-1',
      '1,0',
      '1,1',
    ]);
    // The outer ring is still coming, which is the whole point.
    expect(streamer.pending).toBe(16);

    for (const release of held.values()) release();
    await streamer.whenSettled();
    expect(added).toHaveLength(25);
  });

  it('picks up a near tile requested while an earlier one was in flight', async () => {
    // The radius gate re-checks after each wait; a tile inside it that only
    // starts once another finishes must still be waited for.
    const held = new Map<string, () => void>();
    const streamer = new TileStreamer(
      {
        tile(mapId, tx, tz): Promise<TileData> {
          return new Promise(resolve => {
            held.set(`${tx},${tz}`, () =>
              resolve({ mapId, tile: [tx, tz], terrain: null, placements: [], collision: [] }),
            );
          });
        },
      },
      { addTile: () => undefined, dropTile: () => undefined },
      { blockSize: 3, slack: 0 },
    );
    streamer.setMap(1);
    streamer.update(...at(0, 0));

    let settled = false;
    const waiting = streamer.whenSettled(1).then(() => {
      settled = true;
    });

    // Everything but the centre.
    for (const [key, release] of held) if (key !== '0,0') release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    held.get('0,0')!();
    await waiting;
    expect(settled).toBe(true);
  });

  it('asks for the tile underfoot before the corners of the window', async () => {
    const h = harness({ blockSize: 5 });
    h.streamer.setMap(3);
    h.streamer.update(...at(0, 0));
    expect(h.requested[0]).toBe('3:0,0');
    expect(h.requested.at(-1)).toMatch(/3:(-2|2),(-2|2)/);
    await h.streamer.whenSettled();
  });
});

describe('TileStreamer resizing', () => {
  it('grows in place, asking for the new outer ring and keeping the rest', async () => {
    const h = harness({ blockSize: 5 });
    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();
    h.requested.length = 0;

    h.streamer.setBlockSize(7);
    await h.streamer.whenSettled();

    expect(h.streamer.blockSize).toBe(7);
    expect(h.requested).toHaveLength(49 - 25);
    expect(h.dropped).toHaveLength(0);
    expect(h.resident.size).toBe(49);
    expect(h.resident.has('7,7')).toBe(true);
    expect(h.resident.has('13,13')).toBe(true);
  });

  it('shrinks in place, dropping the ring that no longer fits', async () => {
    const h = harness({ blockSize: 7 });
    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();

    h.streamer.setBlockSize(5);

    expect(h.dropped).toHaveLength(49 - 25);
    expect(h.resident.size).toBe(25);
    expect(h.resident.has('7,7')).toBe(false);
    expect(h.resident.has('8,8')).toBe(true);
  });

  it('forces the new size odd and does nothing for the same size', async () => {
    const h = harness({ blockSize: 5 });
    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();
    h.requested.length = 0;

    h.streamer.setBlockSize(5);
    expect(h.requested).toHaveLength(0);

    h.streamer.setBlockSize(6);
    expect(h.streamer.blockSize).toBe(7);
  });

  it('remembers a size set before the first update', async () => {
    const h = harness({ blockSize: 5 });
    h.streamer.setBlockSize(3);
    h.streamer.setMap(3);
    h.streamer.update(...at(10, 10));
    await h.streamer.whenSettled();

    expect(h.added).toHaveLength(9);
  });
});

describe('TileStreamer following the player', () => {
  /** A point `past` world units east of tile (tx, tz)'s eastern edge, mid-row. */
  const eastOf = (tx: number, tz: number, past: number): [number, number] => [
    (tx + 1) * TILE_SIZE + past,
    tz * TILE_SIZE + TILE_SIZE / 2,
  ];

  it('stays put while the player is inside the slack past the anchor tile', async () => {
    const h = harness({ blockSize: 3 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    await h.streamer.whenSettled();
    h.requested.length = 0;

    // On tile 1 already, but not yet the slack past the seam.
    h.streamer.update(...eastOf(0, 0, FOLLOW_SLACK));
    expect(h.streamer.centreTile).toEqual([0, 0]);
    expect(h.requested).toEqual([]);
  });

  it('follows as soon as the player is further than the slack past the anchor tile', async () => {
    const h = harness({ blockSize: 3 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    await h.streamer.whenSettled();
    h.added.length = 0;

    h.streamer.update(...eastOf(0, 0, FOLLOW_SLACK + 0.5));
    expect(h.streamer.centreTile).toEqual([1, 0]);
    await h.streamer.whenSettled();
    expect(h.added.sort()).toEqual(['2,-1', '2,0', '2,1']);
    expect(h.dropped.sort()).toEqual(['-1,-1', '-1,0', '-1,1']);
  });

  it('needs the slack past the new anchor to swing back, so a seam cannot thrash', async () => {
    const h = harness({ blockSize: 3 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    h.streamer.update(...eastOf(0, 0, FOLLOW_SLACK + 1));
    expect(h.streamer.centreTile).toEqual([1, 0]);

    // Back onto tile 0, but within the slack of tile 1's western edge.
    h.streamer.update(TILE_SIZE - FOLLOW_SLACK, TILE_SIZE / 2);
    expect(h.streamer.centreTile).toEqual([1, 0]);
    h.streamer.update(TILE_SIZE - FOLLOW_SLACK - 1, TILE_SIZE / 2);
    expect(h.streamer.centreTile).toEqual([0, 0]);
  });

  it('measures the slack on both axes, so a corner is no shortcut', () => {
    const h = harness({ blockSize: 3 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    // Diagonally past the corner, inside the slack on each axis.
    const inside = TILE_SIZE + FOLLOW_SLACK - 1;
    h.streamer.update(inside, inside);
    expect(h.streamer.centreTile).toEqual([0, 0]);
    // Past it on one axis only: the window follows onto the player's tile.
    h.streamer.update(inside, TILE_SIZE + FOLLOW_SLACK + 1);
    expect(h.streamer.centreTile).toEqual([1, 1]);
  });

  it('follows a jump of any length on the same update', async () => {
    const h = harness({ blockSize: 3 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    await h.streamer.whenSettled();

    h.streamer.update(...at(40, 40));
    expect(h.streamer.centreTile).toEqual([40, 40]);
    await h.streamer.whenSettled();
    expect(h.resident.has('40,40')).toBe(true);
    expect(h.resident.has('0,0')).toBe(false);
    expect(h.resident.size).toBe(9);
  });

  it('keeps the overlap rather than reloading it', async () => {
    const h = harness({ blockSize: 3, slack: 0 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    await h.streamer.whenSettled();
    h.requested.length = 0;

    h.streamer.update(...at(1, 0));
    await h.streamer.whenSettled();
    // Six of the nine tiles are shared with the previous window and must not
    // be asked for again: re-decoding them is the cost this whole design
    // exists to avoid.
    expect(h.requested).toHaveLength(3);
  });
});

describe('TileStreamer over a walk', () => {
  /** Runs `path` through a default-window streamer one point per frame; returns loads and drops. */
  async function walk(path: Array<[number, number]>, slack?: number) {
    const h = harness({ slack });
    h.streamer.setMap(1);
    for (const p of path) h.streamer.update(...p);
    await h.streamer.whenSettled();
    return { loads: h.requested.length, drops: h.dropped.length, resident: h.resident.size };
  }

  const window = DEFAULT_TILE_WINDOW;
  const full = window * window;
  /** A run-speed stride per frame, in world units. */
  const stride = 0.25;

  /** A straight line from `from` to `to`, one stride per frame. */
  function line(from: [number, number], to: [number, number]): Array<[number, number]> {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const steps = Math.ceil(length / stride);
    return Array.from({ length: steps + 1 }, (_, i) => [
      from[0] + ((to[0] - from[0]) * i) / steps,
      from[1] + ((to[1] - from[1]) * i) / steps,
    ]);
  }

  it('loads one new row per tile crossed on a straight walk', async () => {
    const tiles = 10;
    const run = await walk(line(at(0, 0), at(tiles, 0)));
    expect(run.loads).toBe(full + tiles * window);
    expect(run.drops).toBe(tiles * window);
    expect(run.resident).toBe(full);
  });

  it('loads an L-shaped row per tile crossed on a diagonal walk', async () => {
    const tiles = 6;
    const run = await walk(line(at(0, 0), at(tiles, tiles)));
    expect(run.loads).toBe(full + tiles * (2 * window - 1));
    expect(run.resident).toBe(full);
  });

  it('loads nothing more for pacing back and forth across a seam', async () => {
    const seam = TILE_SIZE;
    const mid = TILE_SIZE / 2;
    const path: Array<[number, number]> = [at(0, 0)];
    for (let lap = 0; lap < 50; lap++) {
      path.push(...line([seam - FOLLOW_SLACK, mid], [seam + FOLLOW_SLACK, mid]));
      path.push(...line([seam + FOLLOW_SLACK, mid], [seam - FOLLOW_SLACK, mid]));
    }
    const run = await walk(path);
    expect(run.loads).toBe(full);
    expect(run.drops).toBe(0);

    // The same pacing with no slack reloads a row on every crossing.
    const bare = await walk(path, 0);
    expect(bare.loads).toBe(full + 100 * window);
  });

  it('loads nothing more for circling a tile corner', async () => {
    const corner = TILE_SIZE;
    const radius = FOLLOW_SLACK * 0.9;
    const path: Array<[number, number]> = [at(0, 0)];
    path.push(...line(at(0, 0), [corner - radius, corner]));
    for (let i = 0; i <= 2000; i++) {
      const a = (i / 200) * Math.PI * 2;
      path.push([corner - radius * Math.cos(a), corner + radius * Math.sin(a)]);
    }
    const run = await walk(path);
    expect(run.loads).toBe(full);
  });
});

describe('TileStreamer map changes', () => {
  it('drops everything, because tile 0,0 means somewhere else on a new map', async () => {
    const h = harness({ blockSize: 3, slack: 0 });
    h.streamer.setMap(1);
    h.streamer.update(...at(0, 0));
    await h.streamer.whenSettled();
    expect(h.resident.size).toBe(9);

    h.streamer.setMap(2);
    expect(h.resident.size).toBe(0);
    expect(h.streamer.centreTile).toBeNull();

    h.streamer.update(...at(0, 0));
    await h.streamer.whenSettled();
    expect(h.requested.filter(r => r.startsWith('2:'))).toHaveLength(9);
  });

  it('discards a tile that arrives after its map is gone', async () => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const added: string[] = [];
    const streamer = new TileStreamer(
      {
        async tile(mapId, tx, tz): Promise<TileData> {
          await gate;
          return { mapId, tile: [tx, tz], terrain: null, placements: [], collision: [] };
        },
      },
      {
        addTile: d => {
          added.push(`${d.mapId}`);
        },
        dropTile: () => undefined,
      },
      { blockSize: 3, slack: 0 },
    );

    streamer.setMap(1);
    streamer.update(...at(0, 0));
    streamer.setMap(2);
    release!();
    await streamer.whenSettled();
    // Every one of those nine was for map 1 and must not land in map 2.
    expect(added).toEqual([]);
  });

  it('ignores updates before a map is set', () => {
    const h = harness();
    h.streamer.update(...at(0, 0));
    expect(h.requested).toEqual([]);
    expect(h.streamer.centreTile).toBeNull();
  });
});
