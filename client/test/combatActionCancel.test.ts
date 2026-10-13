/**
 * When a combat action gives the body back.
 *
 * Start running after firing and the run takes over; the character does not
 * stay in the firing pose. Two rules keep it so:
 *
 * 1. A whole-body action played *because the body was standing still* does
 *    not hold the base clip back. Only a cast asked for on the whole body
 *    does that.
 * 2. A clip that comes out of the pack after its action was cancelled does
 *    not install itself.
 *
 * The first is a pure rule and is tested directly. The second is tested
 * through `NetworkBodies`, which is the one action path with a seam a test can
 * hold: its views are an interface, and the renderer behind them is a double.
 */

import { describe, expect, it, vi } from 'vitest';

import { actionSpan, onNewBaseClip, spanCoversWholeBody } from '../src/renderer/upperBody';
import { NetworkBodies } from '../src/gameplay/NetworkBodies';
import type { BodyLookups, BodyViews } from '../src/gameplay/NetworkBodies';
import { World } from '../src/world/World';
import type { EntitySnapshot } from '../src/net/GameConnection';
import { UNARMED } from '../src/gameplay/weaponClips';

describe('how much of the body an action takes, and what a new base clip does to it', () => {
  const STILL = ['idle', 'combat_ready', 'combat_aim', 'combat_load'];
  const MOVING = ['run_normal', 'walk_forward', undefined];
  /** What the feet do in the moment after stopping or landing; they stay put. */
  const SETTLING = [
    'run_idle',
    'move_left_idle',
    'move_right_idle',
    'jump_land',
    'jump_land_left',
    'jump_land_right',
  ];

  it('keeps a whole-body cast the caller asked for, whatever the base asks for', () => {
    for (const hasSpine of [true, false])
      for (const baseClip of [...STILL, ...MOVING]) {
        const span = actionSpan({ wholeBody: true, hasSpine, baseClip });
        expect(span).toBe('wholeByRequest');
        expect(spanCoversWholeBody(span)).toBe(true);
        for (const next of [...STILL, ...MOVING]) expect(onNewBaseClip(span, next)).toBe('wait');
      }
  });

  it('plays a swing on the whole of a body standing still, and hands it back when the body moves', () => {
    for (const baseClip of STILL) {
      const span = actionSpan({ wholeBody: false, hasSpine: true, baseClip });
      expect(span).toBe('wholeWhileStill');
      expect(spanCoversWholeBody(span)).toBe(true);
      for (const next of MOVING) expect(onNewBaseClip(span, next)).toBe('giveBack');
    }
  });

  it('keeps the whole body while the base only settles from one still clip into another', () => {
    for (const baseClip of [...STILL, ...SETTLING]) {
      const span = actionSpan({ wholeBody: false, hasSpine: true, baseClip });
      expect(span).toBe('wholeWhileStill');
      for (const next of STILL) expect(onNewBaseClip(span, next)).toBe('wait');
    }
  });

  it('plays a swing on the arms of a moving body, with the base on the legs', () => {
    for (const baseClip of MOVING) {
      const span = actionSpan({ wholeBody: false, hasSpine: true, baseClip });
      expect(span).toBe('armsOnly');
      expect(spanCoversWholeBody(span)).toBe(false);
      for (const next of [...STILL, ...MOVING]) expect(onNewBaseClip(span, next)).toBe('legsOnly');
    }
  });

  it('does not take a creature’s swing away, which is whole-body because it has no spine', () => {
    // A wolf has nowhere to split, so every action it plays is whole-body —
    // but a posture change must not cancel it, or no creature animates an
    // attack.
    for (const baseClip of [...STILL, ...MOVING]) {
      const span = actionSpan({ wholeBody: false, hasSpine: false, baseClip });
      expect(span).toBe('wholeNoSpine');
      expect(spanCoversWholeBody(span)).toBe(true);
      for (const next of [...STILL, ...MOVING]) expect(onNewBaseClip(span, next)).toBe('legsOnly');
    }
  });

  it('lets the base take the whole body when no action is running', () => {
    expect(onNewBaseClip(undefined, 'idle')).toBe('wholeBody');
  });
});

// ---------------------------------------------------------------------------

function views(overrides: Partial<BodyViews> = {}): BodyViews {
  return {
    isAnimated: () => true,
    clipOf: () => null,
    clipLength: () => 1,
    setEntityClip: vi.fn(async () => {}),
    setEntityMount: vi.fn(async () => {}),
    poseEntityClip: vi.fn(async () => {}),
    setEntityClipRate: vi.fn(),
    setEntityWeapons: vi.fn(),
    setEntityAction: vi.fn(async () => {}),
    clearEntityAction: vi.fn(),
    hasHeldAction: () => false,
    refreshAppearance: vi.fn(async () => {}),
    ...overrides,
  };
}

function lookups(): BodyLookups {
  return {
    networkAppearance: async () => ({ model: 'wolf.bdae', scale: 1 }),
    staticObjectModel: async () => ({ model: 'other_bank.bdae', scale: 1 }),
    animationNamed: async () => null,
    equippedWeapons: async () => UNARMED,
  };
}

function snapshot(over: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    networkId: 1,
    entry: 2451,
    displayInfoId: 0,
    race: 0,
    gender: 0,
    appearance: { skin: 0, hairStyle: 0, hairColour: 0, face: 0 },
    equipment: [],
    animationId: 0,
    position: [0, 0, 0],
    orientation: 0,
    ...over,
  };
}

async function withBody(over: Partial<BodyViews> = {}) {
  const world = new World({} as ConstructorParameters<typeof World>[0]);
  const v = views(over);
  const bodies = new NetworkBodies(world, v, lookups());
  bodies.open();
  bodies.take({ kind: 'spawned', snapshot: snapshot() });
  await Promise.resolve();
  await Promise.resolve();
  return { world, bodies, views: v };
}

describe('a remote body cancelling an action', () => {
  it('never issues an action the server already stopped', async () => {
    const { bodies, views: v } = await withBody();

    // The shot and its cancellation land in the same frame — the attack
    // stopped before the clip was ever asked for.
    bodies.playAction(1, 'combat_fire', false);
    bodies.stopAction(1);
    bodies.updateClips(1 / 60);

    expect(v.setEntityAction).not.toHaveBeenCalled();
    expect(v.clearEntityAction).toHaveBeenCalledWith(1);
  });

  it('issues one that was not stopped', async () => {
    const { bodies, views: v } = await withBody();
    bodies.playAction(1, 'combat_fire', false);
    bodies.updateClips(1 / 60);
    expect(v.setEntityAction).toHaveBeenCalledWith(1, 'combat_fire', {
      hold: false,
      allBody: false,
    });
  });

  it('cancels a held cast when the body starts moving, and only a held one', async () => {
    // A chant ends on any velocity — the client cancels it and the server
    // interrupts to match. A swing or a shot is untouched: those are meant to
    // play over the run.
    const held = await withBody({ hasHeldAction: () => true });
    held.bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 5],
        moving: true,
        speed: 4,
      },
    });
    held.bodies.updateClips(1 / 60);
    expect(held.views.clearEntityAction).toHaveBeenCalledWith(1);

    const oneShot = await withBody({ hasHeldAction: () => false });
    oneShot.bodies.take({
      kind: 'moved',
      move: {
        networkId: 1,
        position: [0, 0, 5],
        moving: true,
        speed: 4,
      },
    });
    oneShot.bodies.updateClips(1 / 60);
    expect(oneShot.views.clearEntityAction).not.toHaveBeenCalled();
  });
});
