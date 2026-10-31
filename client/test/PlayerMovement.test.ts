import { describe, expect, it } from 'vitest';

import {
  PlayerMovement,
  SLIDE_START_NORMAL_Y,
  SLIDE_STOP_NORMAL_Y,
  nextSlide,
} from '../src/gameplay/PlayerMovement';
import { SWIM_DEPTH } from '../src/world/Terrain';
import type { InputState } from '../src/gameplay/Input';
import type { World } from '../src/world/World';

/** Nothing pressed. Cases below turn on only what they are about. */
function idleInput(over: Partial<InputState> = {}): InputState {
  return {
    castSlots: [],
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    deselect: false,
    interact: false,
    targetStep: 0,
    padInUse: false,
    ascend: false,
    descend: false,
    dragX: 0,
    dragY: 0,
    wheel: 0,
    ...over,
  };
}

/**
 * A world flat enough to walk on and empty enough to walk through, so a case
 * about steering is not also a case about terrain.
 */
function flatWorld(start: [number, number, number]): {
  world: World;
  player: { position: [number, number, number] };
} {
  const player = { position: [...start] as [number, number, number] };
  const world = {
    player,
    collision: { isLoaded: () => false },
    setYaw: () => {},
    setPosition: (_p: unknown, x: number, y: number, z: number) => {
      player.position = [x, y, z];
    },
    waterAt: () => ({ state: 'dry', surface: null, swimLine: null }),
    restingHeight: (_x: number, _z: number, fromY: number) => ({
      y: fromY,
      swimming: false,
      normal: [0, 1, 0],
    }),
  } as unknown as World;
  return { world, player };
}

/** A camera looking down -Z, which is the direction `forward` means. */
const RIG = {
  orbit: () => {},
  zoom: () => {},
  forward: () => ({ x: 0, y: -1 }),
  right: () => ({ x: 1, y: 0 }),
  target: { set: () => {} },
} as never;

describe('PlayerMovement.easeTowards', () => {
  it('uses the target world position, caps a turn, and leaves a coincident target alone', () => {
    const player = { position: [2, 0, 3] as [number, number, number] };
    const yaws: number[] = [];
    const world = {
      player,
      setYaw: (_player: unknown, yaw: number) => yaws.push(yaw),
    } as unknown as World;
    const movement = new PlayerMovement(world, {} as never);

    movement.easeTowards([5, 99, 7], 0.1);
    expect(yaws).toHaveLength(1);
    expect(yaws[0]).toBeCloseTo(Math.atan2(3, 4));
    expect(movement.yaw).toBeCloseTo(Math.atan2(3, 4));

    movement.easeTowards([2, 10, 3], 0.1);
    expect(yaws).toHaveLength(1);
  });
});

/*
 * RUNNING SOMEWHERE UNDER THE CLIENT'S OWN POWER.
 *
 * The approach half of "double-click to interact". Two things have to be true
 * or it is worse than not having it: the run has to aim in WORLD space rather
 * than through the camera, and a player who touches the controls has to get
 * them back instantly.
 */
describe('PlayerMovement auto-run', () => {
  it('runs at the point in world space, not through the camera', () => {
    // The camera faces -Z here while the target is at +X. Steering through
    // the camera would send the hero away down -Z instead of toward it.
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);

    movement.autoRunTo = [10, 0, 0];
    movement.update(idleInput(), 0.1);

    expect(player.position[0]).toBeGreaterThan(0);
    expect(player.position[2]).toBeCloseTo(0);
    expect(movement.moving).toBe(true);
  });

  it('runs at full forward speed rather than filing itself as standing still', () => {
    // With no key down the direction would otherwise classify as idle, which
    // is no speed and the standing clip played while sliding along.
    const { world } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);

    movement.autoRunTo = [10, 0, 0];
    movement.update(idleInput(), 0.1);

    expect(movement.direction).toBe('forward');
    expect(Math.hypot(...movement.velocity)).toBeGreaterThan(0);
  });

  it('gives way to a key the player is holding', () => {
    // Held input steers instead. Whoever set the run is expected to drop it
    // outright on the same frame; this is the guarantee underneath that.
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);

    movement.autoRunTo = [10, 0, 0];
    movement.update(idleInput({ forward: true }), 0.1);

    // Down -Z, where the camera points — not +X, where the run was aimed.
    expect(player.position[2]).toBeLessThan(0);
    expect(player.position[0]).toBeCloseTo(0);
  });

  it('stands still when nothing is asking it to move', () => {
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);

    movement.update(idleInput(), 0.1);

    expect(player.position).toEqual([0, 0, 0]);
    expect(movement.moving).toBe(false);
  });

  it('does not jitter once it is standing on the point', () => {
    const { world, player } = flatWorld([5, 0, 5]);
    const movement = new PlayerMovement(world, RIG);

    movement.autoRunTo = [5, 0, 5];
    movement.update(idleInput(), 0.1);

    expect(player.position).toEqual([5, 0, 5]);
    expect(movement.moving).toBe(false);
  });
});

describe('PlayerMovement fly', () => {
  it('flies forward at the speed the admin panel is set to', () => {
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.setFlying(true);
    movement.setSpeed(30);

    movement.update(idleInput({ forward: true }), 1);

    // Camera faces -Z, so a second of forward flight is a second of speed.
    expect(player.position[2]).toBeCloseTo(-30);
    expect(Math.hypot(...movement.velocity)).toBeCloseTo(30);
  });

  it('rises at the same speed, so one number drives the whole of fly', () => {
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.setFlying(true);
    movement.setSpeed(7);

    movement.update(idleInput({ ascend: true }), 1);

    expect(player.position[1]).toBeCloseTo(7);
  });

  it('follows a speed changed while already flying', () => {
    // The panel's Set button is usable mid-flight; the next frame must obey it.
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.setFlying(true);
    movement.setSpeed(10);
    movement.update(idleInput({ forward: true }), 1);

    movement.setSpeed(40);
    movement.update(idleInput({ forward: true }), 1);

    expect(player.position[2]).toBeCloseTo(-50);
  });
});

describe('how fast the player moves on foot', () => {
  it('runs forward at the server speed and backs up at the server share of it', () => {
    // 6 units a second forward and 0.4 of that backwards, the values the
    // server checks reported steps against.
    const run = (input: Partial<InputState>): number => {
      const { world, player } = flatWorld([0, 0, 0]);
      new PlayerMovement(world, RIG).update(idleInput(input), 0.1);
      return Math.hypot(player.position[0], player.position[2]);
    };
    expect(run({ forward: true })).toBeCloseTo(0.6, 5);
    expect(run({ back: true })).toBeCloseTo(0.24, 5);
  });
});

describe('how fast the player moves while slowed or stunned', () => {
  const run = (share: number, input: Partial<InputState>): [number, number, number] => {
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.setSpeedShare(share);
    movement.update(idleInput(input), 0.1);
    return player.position;
  };

  it('runs at the share of its speed the server allows', () => {
    // Half speed while slowed by half, the same cap the server steps against.
    expect(Math.hypot(...run(0.5, { forward: true }))).toBeCloseTo(0.3, 5);
    expect(Math.hypot(...run(0.5, { back: true }))).toBeCloseTo(0.12, 5);
  });

  it('runs faster while sped up', () => {
    expect(Math.hypot(...run(2, { forward: true }))).toBeCloseTo(0.6 * 2, 5);
  });

  it('stands still and does not jump while it may not move at all', () => {
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.setSpeedShare(0);
    movement.update(idleInput({ forward: true, jump: true }), 0.1);

    expect(player.position).toEqual([0, 0, 0]);
    expect(movement.moving).toBe(false);
    expect(movement.airborneReason()).toBeNull();
  });

  it('runs at full speed again once the server lifts it', () => {
    const { world, player } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.setSpeedShare(0);
    movement.setSpeedShare(1);
    movement.update(idleInput({ forward: true }), 0.1);
    expect(Math.hypot(...player.position)).toBeCloseTo(0.6, 5);
  });
});

/*
 * JUMPING IN WATER.
 *
 * A jump from the water is a leap out of it, from wherever the swimmer is:
 * one under the surface comes up to it and leaps from there, the same as a
 * swimmer already floating on it.
 */
describe('jumping while swimming', () => {
  const SURFACE = 10;
  const SWIM_LINE = SURFACE - SWIM_DEPTH;

  function lake(): {
    movement: PlayerMovement;
    player: { position: [number, number, number] };
    pitch: { value: number };
  } {
    const player = { position: [0, SWIM_LINE, 0] as [number, number, number] };
    const pitch = { value: 0.3 };
    const world = {
      player,
      collision: { isLoaded: () => false },
      setYaw: () => {},
      setPosition: (_p: unknown, x: number, y: number, z: number) => {
        player.position = [x, y, z];
      },
      waterAt: () => ({ state: 'swimming', surface: SURFACE, swimLine: SWIM_LINE }),
      restingHeight: () => ({ y: SWIM_LINE, swimming: true, normal: [0, 1, 0] }),
      groundHeight: () => 0,
    } as unknown as World;
    const rig = {
      orbit: () => {},
      zoom: () => {},
      forward: () => ({ x: 0, y: -1 }),
      right: () => ({ x: 1, y: 0 }),
      elevation: () => pitch.value,
      target: { set: () => {} },
    } as never;
    const movement = new PlayerMovement(world, rig);
    // One still frame to settle into the water.
    movement.update(idleInput(), 1 / 60);
    return { movement, player, pitch };
  }

  /** The highest the feet reach over the two seconds after the press. */
  function leap(movement: PlayerMovement, player: { position: [number, number, number] }): number {
    movement.update(idleInput({ jump: true }), 1 / 60);
    let high = player.position[1];
    for (let i = 0; i < 120; i++) {
      movement.update(idleInput(), 1 / 60);
      high = Math.max(high, player.position[1]);
    }
    return high;
  }

  it('leaps a swimmer on the surface clear of the water', () => {
    const { movement, player } = lake();
    expect(movement.locomotion).toBe('swim');
    expect(leap(movement, player)).toBeGreaterThan(SURFACE);
  });

  it('brings a diver up to the surface and leaps it clear of the water', () => {
    const { movement, player, pitch } = lake();
    // Swim forward looking steeply down until well under.
    pitch.value = 1;
    for (let i = 0; i < 120; i++) movement.update(idleInput({ forward: true }), 1 / 60);
    expect(player.position[1]).toBeLessThan(SWIM_LINE - 0.5);

    pitch.value = 0.3;
    expect(leap(movement, player)).toBeGreaterThan(SURFACE);
  });

  it('lands back in the water afterwards, swimming', () => {
    const { movement, player } = lake();
    leap(movement, player);
    expect(movement.locomotion).toBe('swim');
    expect(player.position[1]).toBeCloseTo(SWIM_LINE, 5);
  });
});

describe('the frame a jump is pressed', () => {
  it('says so for that one frame only', () => {
    const { world } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.update(idleInput(), 1 / 60);
    expect(movement.justJumped()).toBe(false);

    movement.update(idleInput({ jump: true }), 1 / 60);
    expect(movement.justJumped()).toBe(true);

    movement.update(idleInput(), 1 / 60);
    expect(movement.justJumped()).toBe(false);
  });

  it('is not a new jump while the body is already in the air', () => {
    const { world } = flatWorld([0, 0, 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.update(idleInput({ jump: true }), 1 / 60);
    movement.update(idleInput({ jump: true }), 1 / 60);
    expect(movement.justJumped()).toBe(false);
  });
});

/**
 * Flat ground for x < 0 and a plane rising toward +x at `degrees` beyond it,
 * the way a mountainside meets a meadow. Terrain answers wherever you stand,
 * however steep, which is the case the slide is for.
 */
function slopeWorld(
  degrees: number,
  start: [number, number, number],
): { world: World; player: { position: [number, number, number] } } {
  const { world, player } = flatWorld(start);
  const angle = (degrees * Math.PI) / 180;
  const steepNormal: [number, number, number] = [-Math.sin(angle), Math.cos(angle), 0];
  (world as unknown as { restingHeight: World['restingHeight'] }).restingHeight = (x: number) =>
    x <= 0
      ? { y: 0, swimming: false, normal: [0, 1, 0] }
      : { y: x * Math.tan(angle), swimming: false, normal: steepNormal };
  return { world, player };
}

/** Run `frames` frames of a sixtieth of a second with the same input held. */
function run(movement: PlayerMovement, input: InputState, frames: number): void {
  for (let i = 0; i < frames; i++) movement.update(input, 1 / 60);
}

describe('slopes too steep to stand on', () => {
  it('cannot be walked up: the climb slides back to the foot', () => {
    const { world, player } = slopeWorld(60, [-1, 0, 0]);
    const movement = new PlayerMovement(world, RIG);

    run(movement, idleInput({ right: true }), 180);

    // Three seconds at a run would be 18 units up a slope that let you.
    expect(player.position[1]).toBeLessThan(0.5);
    expect(player.position[0]).toBeLessThan(0.5);
  });

  it('slides a body standing on one down to gentler ground and lets go', () => {
    const { world, player } = slopeWorld(60, [3, 3 * Math.tan(Math.PI / 3), 0]);
    const movement = new PlayerMovement(world, RIG);

    movement.update(idleInput(), 1 / 60);
    expect(movement.isSliding()).toBe(true);
    run(movement, idleInput(), 120);

    expect(player.position[0]).toBeLessThanOrEqual(0);
    expect(player.position[1]).toBe(0);
    expect(movement.isSliding()).toBe(false);
  });

  it('takes the controls away while sliding: no steering and no jump', () => {
    const { world, player } = slopeWorld(60, [3, 3 * Math.tan(Math.PI / 3), 0]);
    const movement = new PlayerMovement(world, RIG);
    movement.update(idleInput(), 1 / 60);

    movement.update(idleInput({ right: true, forward: true, jump: true }), 1 / 60);

    expect(player.position[0]).toBeLessThan(3);
    expect(player.position[2]).toBe(0);
    expect(movement.justJumped()).toBe(false);
    expect(movement.airborneReason()).toBeNull();
  });

  it('leaves a slope between the two limits walkable', () => {
    // About 48° up: under the start of a slide, so it is climbed as any hill.
    const { world, player } = slopeWorld(48, [-1, 0, 0]);
    const movement = new PlayerMovement(world, RIG);

    run(movement, idleInput({ right: true }), 60);

    expect(movement.isSliding()).toBe(false);
    expect(player.position[1]).toBeGreaterThan(3);
  });

  it('starts below one limit and stops only at the other', () => {
    const between: [number, number, number] = [
      -0.75,
      (SLIDE_START_NORMAL_Y + SLIDE_STOP_NORMAL_Y) / 2,
      0,
    ];

    expect(nextSlide(null, between)).toBeNull();
    expect(nextSlide([-1, 0], between)).toEqual([-1, 0]);
    expect(nextSlide(null, [-0.8, SLIDE_START_NORMAL_Y - 0.01, 0])).toEqual([-1, 0]);
    expect(nextSlide([-1, 0], [0, SLIDE_STOP_NORMAL_Y, 0])).toBeNull();
  });
});
