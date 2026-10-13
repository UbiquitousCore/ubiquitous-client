/** Once a blend settles exactly one action has full weight; an untracked outgoing action would stay at 1. */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

/** A one-track clip that just translates, enough to drive a mixer. */
function clip(name: string, to: number): THREE.AnimationClip {
  return new THREE.AnimationClip(name, 1, [
    new THREE.VectorKeyframeTrack('.position', [0, 1], [0, 0, 0, to, to, to]),
  ]);
}

const FADE = 0.12;

function totalWeight(mixer: THREE.AnimationMixer): number {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mixer as any)._actions.reduce(
    (sum: number, a: THREE.AnimationAction) => sum + a.getEffectiveWeight(),
    0,
  );
}

describe('clip crossfade', () => {
  it('settles on exactly one action at full weight', () => {
    const object = new THREE.Object3D();
    const mixer = new THREE.AnimationMixer(object);

    // What attach() does: start the prototype clip and remember the action.
    let current = mixer.clipAction(clip('idle', 1));
    current.play();
    expect(totalWeight(mixer)).toBeCloseTo(1, 5);

    // What setEntityClip() does: start the next and fade the previous into it.
    const next = mixer.clipAction(clip('run_normal', 2));
    next.reset();
    next.setEffectiveWeight(1);
    next.play();
    current.crossFadeTo(next, FADE, true);
    current = next;

    // Mid-blend both contribute, and together they still sum to one -- that is
    // what makes it a blend rather than two poses fighting.
    mixer.update(FADE / 2);
    expect(totalWeight(mixer)).toBeCloseTo(1, 2);

    // Once the fade completes the outgoing action is done.
    mixer.update(FADE);
    expect(next.getEffectiveWeight()).toBeCloseTo(1, 5);
    expect(totalWeight(mixer)).toBeCloseTo(1, 5);
  });

  it('would double up if the previous action were not tracked', () => {
    // The regression, written down: start a second clip without fading the
    // first and the mixer carries two full-weight poses at once.
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    mixer.clipAction(clip('idle', 1)).play();
    const second = mixer.clipAction(clip('run_normal', 2));
    second.setEffectiveWeight(1);
    second.play();
    mixer.update(0.1);
    expect(totalWeight(mixer)).toBeCloseTo(2, 5);
  });
});

/**
 * A zero-duration hold pose (14 mounts' `jump_air`): a warped crossfade
 * divides by zero and NaNs the mixer for good, so `setEntityClip` warps only
 * when both clips have a duration.
 */
describe('crossfading into a zero-duration hold pose', () => {
  const hold = (name: string) =>
    new THREE.AnimationClip(name, 0, [new THREE.VectorKeyframeTrack('.position', [0], [1, 1, 1])]);

  it('NaNs the mixer when warped -- the bug', () => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const idle = mixer.clipAction(clip('idle', 1));
    idle.play();
    const air = mixer.clipAction(hold('jump_air'));
    air.reset().setEffectiveWeight(1).play();
    idle.crossFadeTo(air, FADE, true);

    mixer.update(FADE / 2);
    mixer.update(FADE / 2);
    expect(Number.isNaN(idle.time)).toBe(true);
  });

  it('survives when the warp is skipped -- the fix', () => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const idle = mixer.clipAction(clip('idle', 1));
    idle.play();
    const air = mixer.clipAction(hold('jump_air'));
    air.reset().setEffectiveWeight(1);
    // What `setEntityClip` now does for a hold pose: clamp rather than wrap,
    // and skip the warp.
    air.loop = THREE.LoopOnce;
    air.clampWhenFinished = true;
    air.play();
    idle.crossFadeTo(air, FADE, false);

    mixer.update(FADE / 2);
    mixer.update(FADE / 2);
    expect(Number.isNaN(idle.time)).toBe(false);
    expect(Number.isNaN(air.time)).toBe(false);
    expect(air.getEffectiveWeight()).toBeCloseTo(1, 5);

    // And the mixer keeps working afterwards: this is the part that was lost.
    const run = mixer.clipAction(clip('run_normal', 2));
    run.reset().setEffectiveWeight(1).play();
    air.crossFadeTo(run, FADE, false);
    mixer.update(FADE);
    expect(Number.isNaN(run.time)).toBe(false);
    expect(run.getEffectiveWeight()).toBeCloseTo(1, 5);
  });
});
