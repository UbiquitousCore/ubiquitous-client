/**
 * One frame of an auto-run to a body, and how close each kind of walk gets.
 *
 * Rules whose *order* is the behaviour, and none of them checkable without
 * walking a character at something and grabbing the controls at the right
 * moment — which is why they are a function rather than branches in the
 * frame loop.
 */

import { describe, expect, it } from 'vitest';

import {
  approachStep,
  isStalled,
  MELEE_REACH,
  RANGED_REACH,
  serverReach,
  stopDistanceFor,
  trackProgress,
  INTERACT_REACH,
} from '../src/gameplay/approach';
import type { ApproachState } from '../src/gameplay/approach';
import { canAttack } from '../src/gameplay/npcInteraction';

const STOP = 3;

function state(over: Partial<ApproachState> = {}): ApproachState {
  return {
    heroDead: false,
    directionHeld: false,
    here: [0, 0, 0],
    there: [100, 0, 0],
    stillWanted: true,
    retargeted: false,
    asked: 'talk',
    now: 'talk',
    stopDistance: STOP,
    reach: INTERACT_REACH,
    stalled: false,
    running: true,
    ...over,
  };
}

describe('running at a body', () => {
  it('re-aims at where the body is now, every frame', () => {
    expect(approachStep(state({ there: [50, 0, 0] }))).toEqual({ kind: 'run', to: [50, 0, 0] });
    expect(approachStep(state({ there: [40, 0, 0] }))).toEqual({ kind: 'run', to: [40, 0, 0] });
  });

  it('brakes on arrival rather than acting in the same frame', () => {
    // Acting while still sliding opens a shop window mid-slide.
    expect(approachStep(state({ there: [1, 0, 0], running: true }))).toEqual({ kind: 'brake' });
  });

  it('acts once it has actually stopped', () => {
    expect(approachStep(state({ there: [1, 0, 0], running: false }))).toEqual({ kind: 'act' });
  });

  it('acts without running at all when it is already close enough', () => {
    expect(approachStep(state({ there: [0, 0, 0], running: false }))).toEqual({ kind: 'act' });
  });

  it('counts height, so a body on a ledge is genuinely further off', () => {
    // Flat distance would call this arrived while the hero is under a ledge.
    expect(approachStep(state({ there: [0, 100, 0] })).kind).toBe('run');
  });
});

describe('what ends an approach', () => {
  it('a dead hero, who walks nowhere', () => {
    expect(approachStep(state({ heroDead: true }))).toEqual({ kind: 'cancel' });
  });

  it('the player taking the controls, outright', () => {
    // Not "obeyed first, resumed after": taking the stick is a statement.
    expect(approachStep(state({ directionHeld: true }))).toEqual({ kind: 'cancel' });
  });

  it('the body going away', () => {
    expect(approachStep(state({ there: null }))).toEqual({ kind: 'cancel' });
  });

  it('the hero having no position at all', () => {
    expect(approachStep(state({ here: null }))).toEqual({ kind: 'cancel' });
  });

  it('the player clicking something else and meaning it', () => {
    expect(approachStep(state({ stillWanted: false }))).toEqual({ kind: 'cancel' });
  });

  it('the player picking a different target some other way', () => {
    // A unit frame or a party frame changes the target without a tap.
    expect(approachStep(state({ retargeted: true }))).toEqual({ kind: 'cancel' });
  });

  it('the target dying on the way to a fight', () => {
    // Otherwise the swing asked for arrives as a request to loot the corpse.
    expect(approachStep(state({ asked: 'attack', now: 'loot' }))).toEqual({ kind: 'cancel' });
  });

  it('a body turning on the hero on the way to talk to it', () => {
    expect(approachStep(state({ asked: 'talk', now: 'attack' }))).toEqual({ kind: 'cancel' });
  });

  it('nothing else — arriving is not cancelling', () => {
    expect(approachStep(state({ there: [1, 0, 0], running: false })).kind).not.toBe('cancel');
  });
});

describe('a walk that can get no closer', () => {
  it('acts from where it stands when the server would accept it from there', () => {
    // A vendor behind a counter, an NPC on a balcony: the stop is out of
    // reach of the legs but not of the server.
    const blocked = state({ there: [6, 0, 0], stalled: true, running: false });
    expect(approachStep(blocked)).toEqual({ kind: 'act' });
  });

  it('stops running before acting, the same as an ordinary arrival', () => {
    expect(approachStep(state({ there: [6, 0, 0], stalled: true, running: true }))).toEqual({
      kind: 'brake',
    });
  });

  it('gives up when the server would refuse it from there', () => {
    expect(approachStep(state({ there: [12, 0, 0], stalled: true }))).toEqual({ kind: 'giveUp' });
  });

  it('keeps clear of the very edge of the server’s reach', () => {
    // The server measures from the last position it was told; a hair inside
    // on this side is outside on that one.
    expect(approachStep(state({ there: [INTERACT_REACH, 0, 0], stalled: true })).kind).toBe(
      'giveUp',
    );
  });

  it('gives up on a swing the legs cannot bring into melee reach', () => {
    const swing = state({ asked: 'attack', now: 'attack', reach: MELEE_REACH, stopDistance: 2 });
    expect(approachStep({ ...swing, there: [0, 4, 0], stalled: true }).kind).toBe('giveUp');
  });

  it('keeps running while it is still getting closer', () => {
    expect(approachStep(state({ there: [6, 0, 0], stalled: false })).kind).toBe('run');
  });
});

describe('which rule wins', () => {
  it('death beats everything, including having arrived', () => {
    expect(approachStep(state({ heroDead: true, there: [0, 0, 0], running: false })).kind).toBe(
      'cancel',
    );
  });

  it('held input beats having arrived, so a grab never triggers the act', () => {
    // Otherwise taking the controls on the last frame opens the shop anyway.
    expect(
      approachStep(state({ directionHeld: true, there: [0, 0, 0], running: false })).kind,
    ).toBe('cancel');
  });

  it('a body that has gone beats having arrived at where it was', () => {
    expect(approachStep(state({ there: null, running: false })).kind).toBe('cancel');
  });

  it('a changed target beats being stuck within reach', () => {
    expect(
      approachStep(state({ asked: 'attack', now: 'loot', there: [6, 0, 0], stalled: true })).kind,
    ).toBe('cancel');
  });
});

describe('how close each walk gets before it acts', () => {
  const creature = { kind: 'creature' } as const;

  it('walks into melee reach to swing, well inside what the server accepts', () => {
    const stop = stopDistanceFor('attack', creature, false);
    expect(stop).toBeLessThan(MELEE_REACH);
    expect(stop).toBeGreaterThan(0.5);
  });

  it('never stops further out than melee reach for a big creature', () => {
    expect(stopDistanceFor('attack', { kind: 'creature', boundingRadius: 6 }, false)).toBeLessThan(
      MELEE_REACH,
    );
  });

  it('shoots from well out with a ranged weapon, inside what the server accepts', () => {
    const stop = stopDistanceFor('attack', creature, true);
    expect(stop).toBeGreaterThan(MELEE_REACH * 3);
    expect(stop).toBeLessThan(RANGED_REACH);
  });

  it('walks to a talking distance to talk, loot or use, whatever is held', () => {
    expect(stopDistanceFor('talk', creature, true)).toBe(stopDistanceFor('talk', creature, false));
    expect(stopDistanceFor('loot', creature, false)).toBeLessThan(INTERACT_REACH);
    expect(stopDistanceFor('talk', { kind: 'static' }, false)).toBeLessThan(INTERACT_REACH);
  });
});

describe('the furthest the server accepts each request from', () => {
  it('is ten units to talk, loot or use', () => {
    expect(serverReach('talk', false)).toBe(10);
    expect(serverReach('loot', true)).toBe(10);
  });

  it('is three to swing, and twenty-five to shoot', () => {
    expect(serverReach('attack', false)).toBe(3);
    expect(serverReach('attack', true)).toBe(25);
  });
});

describe('whether a walk has stopped getting closer', () => {
  it('is not stuck while the gap keeps closing', () => {
    let progress = trackProgress(null, 20, 0);
    for (let t = 0.1; t <= 3; t += 0.1) {
      progress = trackProgress(progress, 20 - t * 5, t);
      expect(isStalled(progress, t)).toBe(false);
    }
  });

  it('is stuck once the gap has not closed for a while', () => {
    let progress = trackProgress(null, 6, 0);
    progress = trackProgress(progress, 6, 0.5);
    expect(isStalled(progress, 0.5)).toBe(false);
    progress = trackProgress(progress, 6, 2);
    expect(isStalled(progress, 2)).toBe(true);
  });

  it('does not count sliding along a wall on the spot as progress', () => {
    // Tiny wobbles in the gap are not the hero getting anywhere.
    let progress = trackProgress(null, 6, 0);
    for (let t = 0.1; t <= 2; t += 0.1) progress = trackProgress(progress, 6 - (t % 0.2) * 0.1, t);
    expect(isStalled(progress, 2)).toBe(true);
  });

  it('starts counting afresh once it closes again', () => {
    let progress = trackProgress(null, 6, 0);
    progress = trackProgress(progress, 6, 1);
    progress = trackProgress(progress, 4, 1.2);
    expect(isStalled(progress, 1.3)).toBe(false);
  });
});

describe('whether the hero may swing at a body', () => {
  it('may, at a live hostile or neutral one', () => {
    expect(canAttack({ isBody: true, isDead: false, enemyOrBystander: true })).toBe(true);
  });

  it('may not, at a corpse', () => {
    expect(canAttack({ isBody: true, isDead: true, enemyOrBystander: true })).toBe(false);
  });

  it('may not, at anything the ring draws green', () => {
    expect(canAttack({ isBody: true, isDead: false, enemyOrBystander: false })).toBe(false);
  });

  it('may not, at a static object', () => {
    expect(canAttack({ isBody: false, isDead: false, enemyOrBystander: true })).toBe(false);
  });
});
