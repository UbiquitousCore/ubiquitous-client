/**
 * Pressing jump on a mount, which mostly is not a jump.
 *
 * A standing mount plays its in-place flourish rather than leaving the
 * ground, which is easy to lose in a refactor because it looks like "nothing
 * happened". A moving mount, reversing included, really jumps: nothing
 * refuses a jump.
 *
 * The arc is the same as a character's: a mount hops, it does not float.
 */

import { describe, expect, it } from 'vitest';
import { PlayerMovement } from '../src/gameplay/PlayerMovement';
import { STEP_UP } from '../src/world/CollisionWorld';
import type { InputState } from '../src/gameplay/Input';
import type { CameraRig } from '../src/renderer/CameraRig';
import type { World } from '../src/world/World';

const GROUND = 10;

function input(over: Partial<InputState> = {}): InputState {
  return {
    castSlots: [],
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    deselect: false,
    ascend: false,
    descend: false,
    dragX: 0,
    dragY: 0,
    wheel: 0,
    ...over,
  };
}

/** Flat ground at `GROUND`, no water, no walls — only height matters here. */
function harness(): { movement: PlayerMovement; y: () => number } {
  const player = { id: 1, position: [0, GROUND, 0] as [number, number, number] };
  const world = {
    player,
    collision: { isLoaded: () => false, segmentHit: () => null },
    groundHeight: () => GROUND,
    restingHeight: () => ({ y: GROUND, swimming: false }),
    waterAt: () => ({ state: 'dry', surface: null, swimLine: null }),
    setPosition: (_p: unknown, x: number, y: number, z: number) => {
      player.position = [x, y, z];
    },
    setYaw: () => {},
  } as unknown as World;

  const rig = {
    forward: () => ({ x: 0, y: 1 }),
    right: () => ({ x: 1, y: 0 }),
    orbit: () => {},
    zoom: () => {},
    elevation: () => 0,
    target: { set: () => {} },
  } as unknown as CameraRig;

  return { movement: new PlayerMovement(world, rig), y: () => player.position[1] };
}

/** Highest point reached over `frames` at 60Hz, starting from the jump press. */
function peak(movement: PlayerMovement, y: () => number, held: Partial<InputState>): number {
  let high = y();
  movement.update(input({ ...held, jump: true }), 1 / 60);
  for (let i = 0; i < 240; i++) {
    movement.update(input(held), 1 / 60);
    high = Math.max(high, y());
  }
  return high;
}

describe('how high and how long a jump goes', () => {
  /** Jump from flat ground and follow it through `PlayerMovement` itself. */
  function arc(mounted: boolean, held: Partial<InputState>): { apex: number; airtime: number } {
    const { movement, y } = harness();
    if (mounted) movement.setMounted(true);
    const dt = 1 / 240;
    movement.update(input({ ...held, jump: true }), dt);
    let apex = y();
    let airtime = dt;
    while (movement.locomotion === 'air' && airtime < 5) {
      movement.update(input(held), dt);
      apex = Math.max(apex, y());
      airtime += dt;
    }
    return { apex: apex - GROUND, airtime };
  }

  it('is a short, quick hop on foot: 0.8 units up, 0.6 s in the air', () => {
    const { apex, airtime } = arc(false, {});
    expect(apex).toBeGreaterThan(0.78);
    expect(apex).toBeLessThan(0.81);
    expect(airtime).toBeGreaterThan(0.59);
    expect(airtime).toBeLessThan(0.61);
  });

  it('clears a ledge a step cannot climb', () => {
    expect(arc(false, {}).apex).toBeGreaterThan(STEP_UP);
  });

  it('is the same hop on a moving mount, not a floaty one', () => {
    const onFoot = arc(false, { forward: true });
    const onMount = arc(true, { forward: true });
    expect(onMount.apex).toBeCloseTo(onFoot.apex, 2);
    expect(onMount.airtime).toBeCloseTo(onFoot.airtime, 2);
  });

  it('keeps a mount airborne no longer than a character', () => {
    const character = harness();
    const airborne = (h: ReturnType<typeof harness>, mounted: boolean): number => {
      if (mounted) h.movement.setMounted(true);
      h.movement.update(input({ forward: true, jump: true }), 1 / 60);
      let frames = 0;
      while (h.movement.locomotion === 'air' && frames < 600) {
        h.movement.update(input({ forward: true }), 1 / 60);
        frames++;
      }
      return frames;
    };
    const onFoot = airborne(character, false);
    const onMount = airborne(harness(), true);
    expect(onMount).toBe(onFoot);
  });
});

describe('pressing jump on a standing mount', () => {
  it('does not leave the ground', () => {
    const { movement, y } = harness();
    movement.setMounted(true);
    expect(peak(movement, y, {})).toBeCloseTo(GROUND, 5);
  });

  it('plays the flourish instead, and stops on its own', () => {
    const { movement, y } = harness();
    movement.setMounted(true);
    expect(movement.isFlourishing()).toBe(false);

    movement.update(input({ jump: true }), 1 / 60);
    expect(movement.isFlourishing()).toBe(true);
    expect(y()).toBeCloseTo(GROUND, 5);

    // Still ground locomotion throughout -- nothing about movement changed.
    expect(movement.locomotion).toBe('ground');

    for (let i = 0; i < 130; i++) movement.update(input(), 1 / 60);
    expect(movement.isFlourishing()).toBe(false);
  });

  it('is not a flourish when unmounted -- that is a real jump', () => {
    const { movement, y } = harness();
    expect(peak(movement, y, {})).toBeGreaterThan(GROUND + 0.5);
    expect(movement.isFlourishing()).toBe(false);
  });
});

describe('pressing jump on a moving mount', () => {
  it('really jumps while reversing', () => {
    const { movement, y } = harness();
    movement.setMounted(true);
    expect(peak(movement, y, { back: true })).toBeGreaterThan(GROUND + 0.5);
    expect(movement.isFlourishing()).toBe(false);
  });

  it('really jumps when moving forward', () => {
    const { movement, y } = harness();
    movement.setMounted(true);
    expect(peak(movement, y, { forward: true })).toBeGreaterThan(GROUND + 0.5);
  });

  it('really jumps when strafing', () => {
    const { movement, y } = harness();
    movement.setMounted(true);
    expect(peak(movement, y, { left: true })).toBeGreaterThan(GROUND + 0.5);
  });
});
