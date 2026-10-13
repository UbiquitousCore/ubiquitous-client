/**
 * Where a clip's feet come down: the rule over a foot's height through the
 * cycle, and the measurement on a body.
 */

import { existsSync, openAsBlob, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { animationId, modelId, skeletonId } from '../src/assets/ids';
import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import type { ResourceSystem } from '../src/assets/ResourceSystem';
import { footfallPhases, strikeAt } from '../src/renderer/footfalls';
import { MaterialCache } from '../src/renderer/MaterialCache';
import { buildSkinnedModel, toThreeClip } from '../src/renderer/SkinnedModelFactory';

describe('strikeAt', () => {
  it('is where the foot first gets down near its lowest, not where it is flattest', () => {
    // Ten poses: high, coming down, down from the fourth to the sixth, lowest at the fifth.
    const heights = [1, 0.8, 0.5, 0.05, 0, 0.02, 0.3, 0.7, 0.9, 1];
    expect(strikeAt(heights)).toBeCloseTo(0.3, 5);
  });

  it('finds a strike that falls across the end of the loop', () => {
    const heights = [0, 0.3, 0.7, 1, 0.9, 0.7, 0.5, 0.3, 0.05, 0.03];
    expect(strikeAt(heights)).toBeCloseTo(0.8, 5);
  });
});

describe('footfallPhases', () => {
  /** A body with two feet that bob out of step, over a clip of `duration`. */
  function runner(travel: number) {
    const root = new THREE.Group();
    const left = new THREE.Object3D();
    left.name = 'Bip01_L_Foot-node';
    const right = new THREE.Object3D();
    right.name = 'Bip01_R_Foot-node';
    root.add(left, right);
    const times = [0, 0.2, 0.4, 0.6, 0.8];
    // Left down at 0.2 s, right down at 0.6 s, of a 0.8 s loop.
    const leftY = [travel, 0, travel, travel, travel];
    const rightY = [travel, travel, travel, 0, travel];
    const track = (name: string, ys: number[]) =>
      new THREE.VectorKeyframeTrack(
        `${name}.position`,
        times,
        ys.flatMap(y => [0, y, 0]),
      );
    const clip = new THREE.AnimationClip('run', 0.8, [
      track(left.name, leftY),
      track(right.name, rightY),
    ]);
    return { root, clip };
  }

  it('finds each foot’s strike, earliest first', () => {
    const { root, clip } = runner(0.5);
    const phases = footfallPhases(root, clip);
    expect(phases).toHaveLength(2);
    expect(phases[0]).toBeGreaterThan(0.1);
    expect(phases[0]).toBeLessThan(0.25);
    expect(phases[1]).toBeGreaterThan(0.6);
    expect(phases[1]).toBeLessThan(0.75);
  });

  it('finds no steps in a clip whose feet barely move', () => {
    const { root, clip } = runner(0.05);
    expect(footfallPhases(root, clip)).toEqual([]);
  });
});

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE = join(ROOT, '.cache');
const BUILDS = existsSync(CACHE)
  ? readdirSync(CACHE).filter(dir => existsSync(join(CACHE, dir, 'res.bin')))
  : [];

describe.skipIf(!BUILDS.length)('the playable bodies’ runs, in the player’s builds', () => {
  it('bring each foot down once a run, about half a run apart', async () => {
    for (const build of BUILDS) {
      const provider = new PackAssetProvider();
      const file = new File([await openAsBlob(join(CACHE, build, 'res.bin'))], 'res.bin');
      await provider.useSource(provider.offer([file]).id);
      for (const [who, name] of [
        ['human/male', 'human_m_h'],
        ['orc/female', 'orc_f_h'],
      ]) {
        const path = `model/npc/character/${who}/${name}.bdae`;
        const model = await provider.load(modelId(path)).catch(() => null);
        const skeleton = await provider.load(skeletonId(path)).catch(() => null);
        const run = await provider
          .load(animationId(`model/npc/character/${who}/anim/run_normal.bdae`, path))
          .catch(() => null);
        if (!model || !skeleton || !run) continue;
        const built = buildSkinnedModel(
          model,
          skeleton,
          new MaterialCache({ texture: async () => null } as unknown as ResourceSystem),
        )!;
        const phases = footfallPhases(built.object, toThreeClip(run));
        expect(phases, `${build} ${who}`).toHaveLength(2);
        expect(phases[1]! - phases[0]!, `${build} ${who}`).toBeGreaterThan(0.4);
        expect(phases[1]! - phases[0]!, `${build} ${who}`).toBeLessThan(0.6);
      }
    }
  }, 120_000);
});
