/**
 * The three fetches behind one character, and whether they overlap.
 *
 * Each is a round trip to the asset worker. Chaining them made a character's
 * time-to-visible the sum of all three, with the worker idle between every
 * answer and the next question — which is most of why a mob a few metres away
 * took a noticeable moment to appear. The model does not depend on the
 * skeleton, so it has no business waiting behind it.
 *
 * What cannot overlap is the clip: only a character has a sibling `anim/`
 * directory, and asking unconditionally puts a failed lookup against every
 * piece of scenery in a zone. So the skeleton's answer gates it, and the test
 * for scenery below is what keeps that honest.
 */

import { describe, expect, it } from 'vitest';

import { isSkinned, loadModelSources } from '../src/renderer/modelSources';
import type { AnimationClipData, ModelData, SkeletonData } from '../src/assets/types';

/** A resource layer that records overlap rather than resolving immediately. */
function recorder(opts: { skinned: boolean }) {
  const started: string[] = [];
  const release = new Map<string, () => void>();
  /** Highest number of requests in flight at once. */
  let live = 0;
  let peak = 0;

  const gate = <T>(name: string, value: T): Promise<T> => {
    started.push(name);
    live++;
    peak = Math.max(peak, live);
    return new Promise<T>(resolve => {
      release.set(name, () => {
        live--;
        resolve(value);
      });
    });
  };

  const model = { path: 'model/x.bdae', meshes: [], defaultMeshes: [] } as unknown as ModelData;
  const skeleton = {
    path: 'model/x.bdae',
    bones: [],
    skins: opts.skinned ? [{ mesh: 'body' }] : [],
  } as unknown as SkeletonData;
  const clip = { name: 'idle', duration: 1, tracks: [] } as AnimationClipData;

  return {
    started,
    peak: () => peak,
    /**
     * Drain until nothing new starts. The clip is only requested once the
     * skeleton has answered, so one pass would leave it pending for ever.
     */
    releaseAll: async (): Promise<void> => {
      for (let pass = 0; pass < 5 && release.size > 0; pass++) {
        for (const [name, r] of [...release.entries()]) {
          release.delete(name);
          r();
        }
        await settle();
      }
    },
    resources: {
      model: () => gate('model', model),
      skeleton: () => gate('skeleton', skeleton),
      animation: () => gate('animation', clip as AnimationClipData | null),
    } as unknown as Parameters<typeof loadModelSources>[0],
  };
}

/** Let queued microtasks run so anything startable has started. */
const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('loadModelSources', () => {
  it('has the model in flight while the skeleton is still unanswered', async () => {
    const r = recorder({ skinned: true });
    const work = loadModelSources(r.resources, 'model/x.bdae');
    await settle();

    // Both out before either has come back. Chained, `started` would hold
    // only 'skeleton' here and the model would cost a second round trip.
    expect(r.started).toEqual(['model', 'skeleton']);
    expect(r.peak()).toBe(2);

    await r.releaseAll();
    await work;
  });

  it('starts the clip as soon as the skeleton says this is a character', async () => {
    const r = recorder({ skinned: true });
    const work = loadModelSources(r.resources, 'model/x.bdae');
    await settle();
    await r.releaseAll();
    await work;

    expect(r.started).toEqual(['model', 'skeleton', 'animation']);
  });

  it('never asks scenery for an animation it does not ship', async () => {
    const r = recorder({ skinned: false });
    const work = loadModelSources(r.resources, 'model/rock.bdae');
    await settle();
    await r.releaseAll();
    const sources = await work;

    // One failed lookup per piece of scenery in a zone is what this avoids.
    expect(r.started).toEqual(['model', 'skeleton']);
    expect(sources.clipData).toBeNull();
  });

  it('asks for no animation at all when animation is switched off', async () => {
    const r = recorder({ skinned: true });
    const work = loadModelSources(r.resources, 'model/x.bdae', false);
    await settle();
    await r.releaseAll();
    const sources = await work;

    expect(r.started).toEqual(['model', 'skeleton']);
    expect(sources.clipData).toBeNull();
  });

  it('returns all three once they land', async () => {
    const r = recorder({ skinned: true });
    const work = loadModelSources(r.resources, 'model/x.bdae');
    await settle();
    await r.releaseAll();
    const sources = await work;

    expect(sources.model.path).toBe('model/x.bdae');
    expect(isSkinned(sources.skeleton)).toBe(true);
    expect(sources.clipData?.name).toBe('idle');
  });
});

describe('isSkinned', () => {
  it('is false for a model whose skeleton binds no mesh', () => {
    expect(isSkinned(null)).toBe(false);
    expect(isSkinned({ skins: [] } as unknown as SkeletonData)).toBe(false);
    expect(isSkinned({ skins: [{}] } as unknown as SkeletonData)).toBe(true);
  });
});
