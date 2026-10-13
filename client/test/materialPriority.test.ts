/**
 * Which texture gets decoded next.
 *
 * A material is shared by every mesh with the same spec, so its image is
 * fetched exactly once. Were the fetch to keep the priority of whoever
 * happened to ask first, and that asker be something across the zone,
 * everything beside the player that wanted the same image would wait behind
 * the entire backlog for it.
 *
 * The attach order (see `attachOrder.test.ts`) makes near things ask first
 * most of the time. This makes it true regardless: the nearest asker so far
 * sets the priority.
 */

import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import { MaterialCache } from '../src/renderer/MaterialCache';
import type { MaterialSpec } from '../src/renderer/MaterialCache';
import type { TextureData } from '../src/assets/types';

const OPAQUE = {
  blend: 'opaque' as const,
  doubleSided: false,
  unlit: true,
  shader: 'unlit_textured_solid',
};

/** A texture layer that records fetch order and resolves on demand. */
function textures() {
  const order: string[] = [];
  const release: Array<() => void> = [];
  const resources = {
    texture: (ref: string): Promise<TextureData | null> => {
      order.push(ref);
      return new Promise(resolve => release.push(() => resolve(null)));
    },
  };
  return {
    order,
    releaseAll: () => {
      for (const r of release.splice(0)) r();
    },
    resources,
  };
}

/** How many fetches `MaterialCache` runs at once; the tests fill exactly this many slots. */
const SLOTS = 2;

/** Let the queue pump run. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('MaterialCache.isPending', () => {
  it('is true from the moment a textured material is handed out', async () => {
    // The portrait pass reads this. Materials are created grey and gain their
    // image through the queue, so shooting one now would cache a grey
    // mannequin for the whole session.
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));

    const material = cache.get({ texture: 'skin.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    expect(cache.isPending(material)).toBe(true);

    await settle();
    // Still pending while the fetch is in flight, not just while queued.
    expect(t.order).toEqual(['skin.tga']);
    expect(cache.isPending(material)).toBe(true);

    t.releaseAll();
    await settle();
    expect(cache.isPending(material)).toBe(false);
  });

  it('is false for a material that never asked for a texture', () => {
    // `material.map === null` cannot tell this apart from "waiting", and a
    // mesh with no texture must not hold the portrait back for ever.
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));

    const material = cache.get({ texture: null, ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    expect(cache.isPending(material)).toBe(false);
  });

  it('stops being pending when the texture turns out not to exist', async () => {
    // The build ships models naming art it does not contain. Those materials
    // stay grey for ever; blocking on them would mean never drawing the
    // portrait at all.
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const material = cache.get({ texture: 'missing.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    expect(cache.isPending(material)).toBe(true);

    t.releaseAll(); // resolves null: no such texture
    await settle();

    expect(cache.isPending(material)).toBe(false);
    warn.mockRestore();
  });

  it('stops being pending when the fetch throws', async () => {
    const cache = new MaterialCache(
      { texture: () => Promise.reject(new Error('decode failed')) },
      new THREE.Vector3(0, 0, 0),
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const material = cache.get({ texture: 'broken.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    await settle();

    // A rejection must release it too, or one bad decode freezes a portrait.
    expect(cache.isPending(material)).toBe(false);
    warn.mockRestore();
  });

  it('reports a second material sharing one image independently', async () => {
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));

    // Same image, different blend: two materials, two entries.
    const opaque = cache.get({ texture: 'wall.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    const cutout = cache.get(
      { texture: 'wall.tga', ...OPAQUE, blend: 'cutout' } as MaterialSpec,
      [1, 0, 0],
    );
    expect(opaque).not.toBe(cutout);
    expect(cache.isPending(opaque)).toBe(true);
    expect(cache.isPending(cutout)).toBe(true);

    t.releaseAll();
    await settle();
    expect(cache.isPending(opaque)).toBe(false);
    expect(cache.isPending(cutout)).toBe(false);
  });
});

describe('MaterialCache texture priority', () => {
  it('drains its backlog nearest-first', async () => {
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));

    // The first fetches start on arrival -- there is no backlog to order yet,
    // and nothing to compare them against. Ordering is about what comes next.
    for (let i = 0; i < SLOTS; i++) {
      cache.get({ texture: `busy${i}.tga`, ...OPAQUE } as MaterialSpec, [500 + i, 0, 0]);
    }
    await settle();
    expect(t.order).toHaveLength(SLOTS);

    // Now a backlog, queued worst-first so arrival order and distance order
    // disagree completely.
    for (const [texture, d] of [
      ['far.tga', 200],
      ['mid.tga', 60],
      ['near.tga', 2],
    ] as Array<[string, number]>) {
      cache.get({ texture, ...OPAQUE } as MaterialSpec, [d, 0, 0]);
    }

    // Each release frees the slots, so the backlog drains a slot-full at a time.
    for (let i = 0; i < 2; i++) {
      t.releaseAll();
      await settle();
    }

    expect(t.order.slice(SLOTS)).toEqual(['near.tga', 'mid.tga', 'far.tga']);
  });

  it('lets a nearer asker promote a material someone far away queued', async () => {
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));

    // Fill every concurrent slot so nothing else can start.
    for (let i = 0; i < SLOTS; i++) {
      cache.get({ texture: `busy${i}.tga`, ...OPAQUE } as MaterialSpec, [500 + i, 0, 0]);
    }
    // Queued behind them, all from across the zone. `distant5` is the
    // *farthest* of them, so nothing but promotion can move it to the front.
    for (let i = 0; i < 6; i++) {
      cache.get({ texture: `distant${i}.tga`, ...OPAQUE } as MaterialSpec, [400 + i, 0, 0]);
    }
    // The wall beside the player happens to use `distant5.tga` too. The
    // material already exists, so nothing is fetched again -- but the fetch
    // that has not started yet is now urgent.
    cache.get({ texture: 'distant5.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);

    await settle();
    expect(t.order).toHaveLength(SLOTS); // still only the busy ones

    t.releaseAll();
    await settle();

    // The promoted one goes next, ahead of five that were queued before it.
    expect(t.order[SLOTS]).toBe('distant5.tga');
  });

  it('does not let a farther asker demote one', async () => {
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));

    for (let i = 0; i < SLOTS; i++) {
      cache.get({ texture: `busy${i}.tga`, ...OPAQUE } as MaterialSpec, [500 + i, 0, 0]);
    }
    cache.get({ texture: 'beside.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    cache.get({ texture: 'other.tga', ...OPAQUE } as MaterialSpec, [50, 0, 0]);
    // The same wall texture, seen again from far away.
    cache.get({ texture: 'beside.tga', ...OPAQUE } as MaterialSpec, [900, 0, 0]);

    await settle();
    t.releaseAll();
    await settle();

    expect(t.order[SLOTS]).toBe('beside.tga');
  });

  it('stops offering to reprioritise a job that has already started', async () => {
    const t = textures();
    const cache = new MaterialCache(t.resources, new THREE.Vector3(0, 0, 0));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    cache.get({ texture: 'a.tga', ...OPAQUE } as MaterialSpec, [300, 0, 0]);
    await settle();
    expect(t.order).toEqual(['a.tga']);

    // Asking again once it is in flight is a no-op, not a crash or a re-fetch.
    cache.get({ texture: 'a.tga', ...OPAQUE } as MaterialSpec, [1, 0, 0]);
    await settle();
    expect(t.order).toEqual(['a.tga']);

    t.releaseAll();
    await settle();
    warn.mockRestore();
  });
});
