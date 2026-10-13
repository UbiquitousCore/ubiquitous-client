/**
 * The minimap's stitched picture: what it shows while the next one loads, and
 * which build wins when two overlap.
 *
 * The rules: the picture already showing stays up until its replacement
 * exists; a request that is superseded before it finishes is dropped and its
 * URL revoked; a URL is revoked only once something else has replaced it;
 * a patch with no thumbnails, or one whose load failed, is remembered as
 * blank rather than re-asked every frame.
 */

import { describe, expect, it } from 'vitest';
import { MinimapComposite } from '../src/app/MinimapComposite';
import { minimapPatch } from '../src/world/minimap';

type Tile = { id: string };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A tile source and encoder the test controls. Encoding waits on `release`. */
function harness(opts: { tiles?: boolean } = {}) {
  const encodes: Array<ReturnType<typeof deferred<string | null>>> = [];
  const revoked: string[] = [];
  let urls = 0;
  const composite = new MinimapComposite<Tile>({
    load: async (mapId, tx, tz) => (opts.tiles === false ? null : { id: `${mapId}:${tx},${tz}` }),
    encode: () => {
      const d = deferred<string | null>();
      encodes.push(d);
      return d.promise;
    },
    revoke: url => {
      revoked.push(url);
    },
  });
  const release = (index: number) => encodes[index]!.resolve(`blob:${++urls}`);
  return { composite, encodes, revoked, release };
}

/** A point far enough along to need a different patch. */
function elsewhere(x: number, z: number): [number, number] {
  const from = JSON.stringify(minimapPatch(x, z, 1));
  for (let dx = 0; dx < 10_000; dx += 50) {
    if (JSON.stringify(minimapPatch(x + dx, z, 1)) !== from) return [x + dx, z];
  }
  throw new Error('no other patch found');
}

const ZOOM_STEP = 2; // MINIMAP_ZOOMS[2] === 1

/** Let the tile loads settle so the encode has been asked for. */
const tick = () => new Promise(r => setTimeout(r, 0));

describe('MinimapComposite', () => {
  it('keeps the current picture up until the next one exists', async () => {
    const h = harness();
    const first = h.composite.ensure(1, 0, 0, ZOOM_STEP);
    await tick();
    h.release(0);
    expect(await first).toBe(true);
    expect(h.composite.url).toBe('blob:1');

    const [x2, z2] = elsewhere(0, 0);
    const second = h.composite.ensure(1, x2, z2, ZOOM_STEP);
    // Tiles loaded, encode pending: the old picture is still what shows.
    await tick();
    expect(h.composite.url).toBe('blob:1');
    expect(h.revoked).toEqual([]);

    h.release(1);
    expect(await second).toBe(true);
    expect(h.composite.url).toBe('blob:2');
    expect(h.revoked).toEqual(['blob:1']);
  });

  it('a newer request wins even when the older build finishes last', async () => {
    const h = harness();
    const [x2, z2] = elsewhere(0, 0);
    const older = h.composite.ensure(1, 0, 0, ZOOM_STEP);
    await tick();
    const newer = h.composite.ensure(1, x2, z2, ZOOM_STEP);
    await tick();
    expect(h.encodes).toHaveLength(2);

    h.release(1); // the newer picture lands first
    expect(await newer).toBe(true);
    expect(h.composite.url).toBe('blob:1');

    h.release(0); // the older one straggles in
    expect(await older).toBe(false);
    // Dropped, and its URL let go; the newer picture still stands.
    expect(h.composite.url).toBe('blob:1');
    expect(h.revoked).toEqual(['blob:2']);

    // And the window the player is actually in is not re-asked.
    expect(await h.composite.ensure(1, x2, z2, ZOOM_STEP)).toBe(false);
    expect(h.encodes).toHaveLength(2);
  });

  it('does not start a second build for the window already loading', async () => {
    const h = harness();
    const a = h.composite.ensure(1, 0, 0, ZOOM_STEP);
    const b = h.composite.ensure(1, 0, 0, ZOOM_STEP);
    await tick();
    expect(h.encodes).toHaveLength(1);
    h.release(0);
    expect(await a).toBe(true);
    expect(await b).toBe(false);
  });

  it('a window with no thumbnails goes blank and is remembered', async () => {
    const h = harness({ tiles: false });
    expect(await h.composite.ensure(1, 0, 0, ZOOM_STEP)).toBe(false);
    expect(h.composite.url).toBeNull();
    expect(h.encodes).toHaveLength(0);
    expect(await h.composite.ensure(1, 0, 0, ZOOM_STEP)).toBe(false);
  });

  it('a failed load goes blank, releases the old picture, and is remembered', async () => {
    let fail = false;
    const revoked: string[] = [];
    const composite = new MinimapComposite<Tile>({
      load: async () => {
        if (fail) throw new Error('no pack');
        return { id: 't' };
      },
      encode: async () => 'blob:ok',
      revoke: url => {
        revoked.push(url);
      },
    });
    expect(await composite.ensure(1, 0, 0, ZOOM_STEP)).toBe(true);
    fail = true;
    const [x2, z2] = elsewhere(0, 0);
    expect(await composite.ensure(1, x2, z2, ZOOM_STEP)).toBe(true);
    expect(composite.url).toBeNull();
    expect(revoked).toEqual(['blob:ok']);
    expect(await composite.ensure(1, x2, z2, ZOOM_STEP)).toBe(false);
  });

  it('dispose releases whatever is showing', async () => {
    const h = harness();
    const p = h.composite.ensure(1, 0, 0, ZOOM_STEP);
    await tick();
    h.release(0);
    await p;
    h.composite.dispose();
    expect(h.composite.url).toBeNull();
    expect(h.revoked).toEqual(['blob:1']);
  });
});

describe('the patch a picture is for', () => {
  it('is published with the picture, and cleared with it', async () => {
    const h = harness();
    expect(h.composite.patch).toBeNull();
    const p = h.composite.ensure(1, 10, 10, ZOOM_STEP);
    await tick();
    // Not while the picture is still being drawn.
    expect(h.composite.patch).toBeNull();
    h.release(0);
    await p;
    expect(h.composite.patch).toEqual(minimapPatch(10, 10, 1));
    h.composite.dispose();
    expect(h.composite.patch).toBeNull();
  });

  it('is not rebuilt for a step that stays inside it', async () => {
    const h = harness();
    const p = h.composite.ensure(1, 40, 40, ZOOM_STEP);
    await tick();
    h.release(0);
    await p;
    expect(await h.composite.ensure(1, 80, 80, ZOOM_STEP)).toBe(false);
    expect(h.encodes).toHaveLength(1);
  });

  it('asks for every tile of the patch, at its own cell', async () => {
    const asked: string[] = [];
    let drawn: Array<{ column: number; row: number }> = [];
    const composite = new MinimapComposite<Tile>({
      load: async (_map, tx, tz) => {
        asked.push(`${tx},${tz}`);
        return { id: `${tx},${tz}` };
      },
      encode: async tiles => {
        drawn = tiles.map(({ column, row }) => ({ column, row }));
        return 'blob:x';
      },
      revoke: () => {},
    });
    await composite.ensure(1, 1, 1, ZOOM_STEP);
    expect(asked.sort()).toEqual(['-1,-1', '-1,0', '0,-1', '0,0']);
    expect(drawn).toContainEqual({ column: 0, row: 0 });
    expect(drawn).toContainEqual({ column: 1, row: 1 });
  });
});
