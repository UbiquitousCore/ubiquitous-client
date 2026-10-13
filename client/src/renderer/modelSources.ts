/** Model prototype asset needs, in fetch order (pinned by test; sequential
 * awaits cost the sum — overlap where dependencies allow). */

import type { ResourceSystem } from '../assets/ResourceSystem';
import type { AnimationClipData, ModelData, SkeletonData } from '../assets/types';

/** The three resources a prototype is built from. */
export interface ModelSources {
  model: ModelData;
  /** Null for scenery, and for anything whose model ships no skin binding. */
  skeleton: SkeletonData | null;
  /**
   * The model's `idle`, for a skinned model that has one — from the sibling
   * `anim/` directory, or failing that from the clips inside the model file.
   *
   * Null for unskinned scenery — which animates from `model.nodeClip`
   * instead, already inside the model data — and null when animation is
   * switched off.
   */
  clipData: AnimationClipData | null;
}

/** Does this skeleton actually bind any of the model's meshes? */
export function isSkinned(skeleton: SkeletonData | null): skeleton is SkeletonData {
  return skeleton !== null && skeleton.skins.length > 0;
}

/** Fetch a model's sources overlapped by dependency: model fires first
 * (unwaited); skeleton awaited (decides character vs scenery); clip starts
 * on skeleton-yes. Unconditional clip asks would log a failed lookup per
 * scenery piece. */
export async function loadModelSources(
  resources: Pick<ResourceSystem, 'model' | 'skeleton' | 'animation'>,
  path: string,
  animate = true,
): Promise<ModelSources> {
  const modelWork = resources.model(path);
  const skeleton = await resources.skeleton(path);
  const clipWork = isSkinned(skeleton) && animate ? resources.animation(path) : null;
  const model = await modelWork;
  return { model, skeleton, clipData: clipWork === null ? null : await clipWork };
}
