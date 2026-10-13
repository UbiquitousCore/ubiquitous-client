/**
 * Where each foot strikes in a clip: within a tenth of its travel of its
 * lowest, coming down, measured on the `L_Foot`/`R_Foot` bones. A 1.1.4 run
 * lasts 0.73-0.87 s with one strike per foot.
 */

import * as THREE from 'three';

/** How many poses a clip is sampled at to find its footfalls. */
const SAMPLES = 60;

/** How close to its lowest a foot is when it counts as down, as a share of its travel. */
const DOWN = 0.1;

/**
 * How far a foot must rise and fall in a clip, in world units, to be taking
 * steps: a standing clip shifts its feet a little, and that is not walking.
 * The run's feet travel 0.4 to 0.65 across the playable bodies of 1.1.4.
 * Own choice.
 */
const STEPPING = 0.15;

/** The bones that carry the feet. */
const FOOT = /[LR]_Foot(-node)?$/;

/**
 * Where a foot strikes, as a share of the cycle, from its height at evenly
 * spaced poses through one loop of the clip.
 */
export function strikeAt(heights: readonly number[]): number {
  const n = heights.length;
  if (n === 0) return 0;
  const low = Math.min(...heights);
  const high = Math.max(...heights);
  const lowest = heights.indexOf(low);
  const near = low + DOWN * (high - low);
  // Back from the lowest pose to the last one still clear of the ground.
  for (let back = 1; back < n; back++) {
    const at = (lowest - back + n) % n;
    if (heights[at]! > near) return ((at + 1) % n) / n;
  }
  return lowest / n;
}

/** Footfalls as cycle shares, earliest first, posed on a mixer of its own; empty without feet. */
export function footfallPhases(root: THREE.Object3D, clip: THREE.AnimationClip): number[] {
  const feet: THREE.Object3D[] = [];
  root.traverse(node => {
    if (FOOT.test(node.name)) feet.push(node);
  });
  if (!feet.length || clip.duration <= 0) return [];
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const heights = feet.map(() => [] as number[]);
  const at = new THREE.Vector3();
  for (let i = 0; i < SAMPLES; i++) {
    mixer.setTime((clip.duration * i) / SAMPLES);
    root.updateMatrixWorld(true);
    feet.forEach((foot, k) => heights[k]!.push(foot.getWorldPosition(at).y));
  }
  action.stop();
  mixer.uncacheRoot(root);
  return heights
    .filter(foot => Math.max(...foot) - Math.min(...foot) >= STEPPING)
    .map(strikeAt)
    .sort((a, b) => a - b);
}
