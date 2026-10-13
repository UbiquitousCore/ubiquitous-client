/** Bodies, and the half an action plays on: clips split at the spine so casts play over walking. */

import * as THREE from 'three';

import { findAttachmentNode } from './attachPoints';

/** The bone the upper body hangs off (`Bip01_Spine` carries torso/arms/head). */
export const UPPER_BODY_ROOT = 'Bip01_Spine';

/** Every bone name from the spine up, or null for non-spine models. */
export function upperBodyBones(object: THREE.Object3D): ReadonlySet<string> | null {
  const spine = findAttachmentNode(object, UPPER_BODY_ROOT);
  if (!spine) return null;
  const names = new Set<string>();
  spine.traverse(child => {
    if (child.name) names.add(child.name);
  });
  return names.size > 0 ? names : null;
}

/** Clip half-split: upper-body tracks vs the rest (disjoint bones combine
 * instead of blending). */
export function splitClip(
  clip: THREE.AnimationClip,
  upperBones: ReadonlySet<string>,
  keep: 'upper' | 'lower',
): THREE.AnimationClip {
  const wantUpper = keep === 'upper';
  const tracks = clip.tracks.filter(track => {
    const bone = track.name.slice(0, track.name.lastIndexOf('.'));
    return upperBones.has(bone) === wantUpper;
  });
  return new THREE.AnimationClip(`${clip.name}#${keep}`, clip.duration, tracks);
}

/** A body's size without sprites or empty nodes, relative to its origin; measured once (live, spells grow per cast). */
export function measureBody(
  object: THREE.Object3D,
): { size: THREE.Vector3; centreOffsetY: number } | undefined {
  const box = bodyBox(object);
  if (box.isEmpty()) return undefined;
  const size = box.getSize(new THREE.Vector3());
  if (!(size.y > 0)) return undefined;
  return {
    size,
    centreOffsetY: (box.min.y + box.max.y) / 2 - object.position.y,
  };
}

/** The body's own world-space box; see `measureBody` for what is left out. */
export function bodyBox(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  /* The body's own model box only — no equipment, no spell attachments
   * (this measurement scales spell effects, and attachments would inflate it
   * past the scale-curve step). Walked with a stack so marked subtrees prune
   * whole. */
  const stack: THREE.Object3D[] = [object];
  while (stack.length > 0) {
    const child = stack.pop()!;
    if (child !== object && child.userData.notBody === true) continue;
    if (!(child as THREE.Sprite).isSprite) {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) box.expandByObject(mesh);
    }
    for (const grandchild of child.children) stack.push(grandchild);
  }
  return box;
}

/** Exclude a subtree (equipment, its effects) from body measurement, so gear never resizes spells. */
export function markNotBody(object: THREE.Object3D): void {
  object.userData.notBody = true;
}

/**
 * How much body an action takes: `armsOnly` (moving, with a spine),
 * `wholeWhileStill` (until the body moves), `wholeByRequest` (the base
 * waits), `wholeNoSpine` (creatures; posture changes must not cancel it).
 */
export type ActionSpan = 'armsOnly' | 'wholeWhileStill' | 'wholeByRequest' | 'wholeNoSpine';

/** Base clips a body plays while its feet stay put, the settle after stopping or landing included. */
const STILL_BASE_CLIPS: ReadonlySet<string> = new Set([
  'idle',
  'combat_ready',
  'combat_aim',
  'combat_load',
  'run_idle',
  'move_left_idle',
  'move_right_idle',
  'jump_land',
  'jump_land_left',
  'jump_land_right',
]);

const isStill = (clip: string | undefined): boolean =>
  clip !== undefined && STILL_BASE_CLIPS.has(clip);

/** What a new base clip does during an action: `wait`, `giveBack`, `legsOnly`, or `wholeBody` with none running. */
export type BaseClipTurn = 'wait' | 'giveBack' | 'legsOnly' | 'wholeBody';

const SPANS: Record<ActionSpan, { wholeBody: boolean; newBase: BaseClipTurn }> = {
  armsOnly: { wholeBody: false, newBase: 'legsOnly' },
  wholeWhileStill: { wholeBody: true, newBase: 'giveBack' },
  wholeByRequest: { wholeBody: true, newBase: 'wait' },
  wholeNoSpine: { wholeBody: true, newBase: 'legsOnly' },
};

/** The span an action gets, from what was asked and the body it lands on. */
export function actionSpan(ask: {
  wholeBody: boolean;
  hasSpine: boolean;
  baseClip: string | undefined;
}): ActionSpan {
  if (ask.wholeBody) return 'wholeByRequest';
  if (!ask.hasSpine) return 'wholeNoSpine';
  return isStill(ask.baseClip) ? 'wholeWhileStill' : 'armsOnly';
}

export function spanCoversWholeBody(span: ActionSpan): boolean {
  return SPANS[span].wholeBody;
}

/** What a new base clip does to the action running now, if any; settling from one still clip into another keeps a still body's action whole. */
export function onNewBaseClip(
  span: ActionSpan | undefined,
  newBase: string | undefined,
): BaseClipTurn {
  if (span === undefined) return 'wholeBody';
  if (span === 'wholeWhileStill' && isStill(newBase)) return 'wait';
  return SPANS[span].newBase;
}
