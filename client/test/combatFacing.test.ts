/**
 * Where a server-owned body looks, and how fast it gets there.
 *
 * Three rules. Break any one and NPCs look the wrong way in a fight or fail
 * to turn back afterwards.
 *
 * 1. A body turns at a **rate**, not by easing a fraction of the error. It
 *    rotates toward its wanted direction at a fixed angular speed and
 *    stops when what is left is smaller than one frame of it.
 * 2. A unit that has a target and is not travelling faces that target, from
 *    the target's live position, every frame.
 * 3. With nobody to look at it goes back to the direction it spawned facing,
 *    after a fixed delay.
 *
 * `World` is the right seam for all three: it owns facing and touches no GPU.
 */

import { describe, expect, it } from 'vitest';
import { FACE_HOME_DELAY, TURN_RATE, World } from '../src/world/World';
import type { Entity } from '../src/world/World';

function world(): World {
  return new World({} as ConstructorParameters<typeof World>[0]);
}

/** A standing body at `at`, facing `yaw`, with no motion of its own. */
function body(w: World, at: [number, number, number], yaw = 0): Entity {
  const entity = w.add({
    kind: 'creature',
    model: 'x.bdae',
    entry: 0,
    position: at,
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  w.setYaw(entity, yaw);
  return entity;
}

/** The body's facing, in the same convention `setYaw` stores. */
function yawOf(entity: Entity): number {
  return Math.atan2(
    2 * entity.rotation[3] * entity.rotation[1],
    1 - 2 * entity.rotation[1] * entity.rotation[1],
  );
}

describe('turning', () => {
  it('covers its fixed degrees a second and no more', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0);
    // A quarter turn away, which is more than an eighth of a second buys.
    const foe = body(w, [10, 0, 0], 0);
    w.setFaceTarget(me, foe.id);

    w.updateNetwork(0.125);
    expect(yawOf(me)).toBeCloseTo(TURN_RATE * 0.125, 5);
    // And not a proportion of what is left: a second step is the same size.
    w.updateNetwork(0.125);
    expect(yawOf(me)).toBeCloseTo(TURN_RATE * 0.25, 5);
  });

  it('arrives instead of overshooting, and then stops', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0);
    const foe = body(w, [10, 0, 0], 0);
    w.setFaceTarget(me, foe.id);

    // Far longer than a quarter turn needs; it lands on it rather than past.
    w.updateNetwork(1);
    expect(yawOf(me)).toBeCloseTo(Math.PI / 2, 6);
    w.updateNetwork(1);
    expect(yawOf(me)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('takes the short way round a corner', () => {
    const w = world();
    const me = body(w, [0, 0, 0], Math.PI - 0.1);
    const foe = body(w, [0, 0, -10], 0);
    // Directly behind: `atan2(0, -10)` is pi, a tenth of a radian away.
    w.setFaceTarget(me, foe.id);
    w.updateNetwork(1);
    expect(Math.abs(yawOf(me))).toBeCloseTo(Math.PI, 5);
  });
});

describe('facing what it is fighting', () => {
  it('turns to the target and keeps up as the target moves', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0);
    const foe = body(w, [10, 0, 0], 0);
    w.setFaceTarget(me, foe.id);

    // A full second is more than a quarter turn needs.
    w.updateNetwork(1);
    expect(yawOf(me)).toBeCloseTo(Math.atan2(10, 0), 4);

    // The target walks round behind. The body re-points from the live
    // position every frame, so the body follows rather than holding the
    // heading it took when the fight started.
    w.setPosition(foe, -10, 0, 0);
    w.updateNetwork(1);
    expect(yawOf(me)).toBeCloseTo(Math.atan2(-10, 0), 4);
  });

  it('does not go home while it still has something to look at', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0);
    me.networkHomeYaw = 0;
    const foe = body(w, [10, 0, 0], 0);
    w.setFaceTarget(me, foe.id);
    // Long past the delay: the target wins for as long as there is one.
    for (let i = 0; i < 10; i++) w.updateNetwork(FACE_HOME_DELAY / 1000);
    expect(yawOf(me)).toBeCloseTo(Math.atan2(10, 0), 4);
  });

  it('ignores a target that is no longer in the world', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0.5);
    me.networkHomeYaw = 0.5;
    w.setFaceTarget(me, 9999);
    w.updateNetwork(0.1);
    expect(yawOf(me)).toBeCloseTo(0.5, 6);
  });
});

describe('going home', () => {
  it('waits out the delay before turning back', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0);
    me.networkHomeYaw = Math.PI / 2;
    w.setFaceTarget(me, null);

    // Just short of the delay: nothing has moved.
    w.updateNetwork(FACE_HOME_DELAY / 1000 - 0.1);
    expect(yawOf(me)).toBeCloseTo(0, 6);

    // Past it, and long enough to complete the quarter turn.
    w.updateNetwork(0.2);
    w.updateNetwork(1);
    expect(yawOf(me)).toBeCloseTo(Math.PI / 2, 4);
  });

  it('restarts the wait when a new fight starts', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 0);
    me.networkHomeYaw = Math.PI / 2;
    w.setFaceTarget(me, null);
    w.updateNetwork(FACE_HOME_DELAY / 1000 - 0.1);

    const foe = body(w, [10, 0, 0], 0);
    w.setFaceTarget(me, foe.id);
    w.setFaceTarget(me, null);
    // The countdown started again, so the same short step no longer arrives.
    w.updateNetwork(0.2);
    expect(yawOf(me)).toBeCloseTo(0, 6);
  });

  it('leaves a body with no spawn facing exactly where it is', () => {
    const w = world();
    const me = body(w, [0, 0, 0], 1.2);
    w.setFaceTarget(me, null);
    for (let i = 0; i < 10; i++) w.updateNetwork(1);
    expect(yawOf(me)).toBeCloseTo(1.2, 6);
  });
});
