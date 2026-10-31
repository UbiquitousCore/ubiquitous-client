import { describe, expect, it } from 'vitest';
import {
  STICK_DEADZONE,
  buttonsDown,
  firstStandardPad,
  readPad,
  socketUnderTriggers,
  stickVector,
} from '../src/gameplay/gamepad';
import type { PadReading } from '../src/gameplay/gamepad';

const A = 0;
const B = 1;
const X = 2;
const Y = 3;
const LB = 4;
const RB = 5;
const LT = 6;
const RT = 7;
const UP = 12;
const DOWN = 13;

function pad(down: number[] = [], axes: number[] = [0, 0, 0, 0]): PadReading {
  return {
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: down.includes(i),
      value: down.includes(i) ? 1 : 0,
    })),
  };
}

describe('stickVector', () => {
  it('ignores the centre in every direction alike', () => {
    expect(stickVector(STICK_DEADZONE * 0.9, 0)).toEqual([0, 0]);
    expect(stickVector(0.1, 0.1)).toEqual([0, 0]);
  });

  it('spans the whole range outside the deadzone, with no jump at its edge', () => {
    const [x] = stickVector(1, 0);
    expect(x).toBe(1);
    const [justOut] = stickVector(STICK_DEADZONE + 0.001, 0);
    expect(justOut).toBeGreaterThan(0);
    expect(justOut).toBeLessThan(0.01);
  });

  it('keeps the direction a stick is pushed in', () => {
    const [x, y] = stickVector(0.6, -0.6);
    expect(x).toBeCloseTo(-y);
    expect(x).toBeGreaterThan(0);
  });
});

describe('socketUnderTriggers', () => {
  it('gives no socket without a trigger', () => {
    expect(socketUnderTriggers(false, false, 0)).toBeNull();
  });

  it('gives sockets 1-4 under the left trigger and 5-8 under the right', () => {
    expect([0, 1, 2, 3].map(f => socketUnderTriggers(true, false, f as 0 | 1 | 2 | 3))).toEqual([
      0, 1, 2, 3,
    ]);
    expect([0, 1, 2, 3].map(f => socketUnderTriggers(false, true, f as 0 | 1 | 2 | 3))).toEqual([
      4, 5, 6, 7,
    ]);
  });

  it('gives sockets 9 and 10 under both, and nothing past the bar', () => {
    expect([0, 1, 2, 3].map(f => socketUnderTriggers(true, true, f as 0 | 1 | 2 | 3))).toEqual([
      8, 9, null, null,
    ]);
  });
});

describe('readPad', () => {
  it('acts on the frame a face button goes down and not while it is held', () => {
    const first = readPad(pad([A]), [], 0.016);
    expect(first.jump).toBe(true);
    const held = readPad(pad([A]), buttonsDown(pad([A])), 0.016);
    expect(held.jump).toBe(false);
  });

  it('maps the plain face buttons to jump, deselect and interact', () => {
    expect(readPad(pad([B]), [], 0.016).deselect).toBe(true);
    expect(readPad(pad([X]), [], 0.016).interact).toBe(true);
  });

  it('uses face buttons under a trigger for the bar and leaves their plain meaning alone', () => {
    const frame = readPad(pad([LT, A, Y]), [], 0.016);
    expect(frame.castSlots).toEqual([0, 3]);
    expect(frame.jump).toBe(false);
    const right = readPad(pad([RT, X]), [], 0.016);
    expect(right.castSlots).toEqual([6]);
    expect(right.interact).toBe(false);
  });

  it('steps through targets on the bumpers', () => {
    expect(readPad(pad([RB]), [], 0.016).targetStep).toBe(1);
    expect(readPad(pad([LB]), [], 0.016).targetStep).toBe(-1);
    expect(readPad(pad([]), [], 0.016).targetStep).toBe(0);
  });

  it('zooms while the pad is held and pulls back on down', () => {
    expect(readPad(pad([UP]), [], 1).zoom).toBeLessThan(0);
    expect(readPad(pad([DOWN]), [], 1).zoom).toBeGreaterThan(0);
    expect(readPad(pad([UP, DOWN]), [], 1).zoom).toBe(0);
  });

  it('turns the camera by a distance that follows time, not frame rate', () => {
    const stick = pad([], [0, 0, 1, 0]);
    const slow = readPad(stick, [], 0.032).lookX;
    const fast = readPad(stick, [], 0.016).lookX;
    expect(slow).toBeCloseTo(fast * 2);
  });

  it('turns less than proportionally near the centre of the stick', () => {
    const half = readPad(pad([], [0, 0, 0.59, 0]), [], 1).lookX;
    const full = readPad(pad([], [0, 0, 1, 0]), [], 1).lookX;
    expect(half).toBeLessThan(full / 2);
  });

  it('counts a trigger that reports travel rather than a press', () => {
    const soft = pad([], [0, 0, 0, 0]);
    soft.buttons = soft.buttons.map((b, i) => (i === LT ? { pressed: false, value: 0.8 } : b));
    soft.buttons = soft.buttons.map((b, i) => (i === A ? { pressed: true, value: 1 } : b));
    expect(readPad(soft, [], 0.016).castSlots).toEqual([0]);
  });
});

describe('firstStandardPad', () => {
  const make = (mapping: string, connected = true): Gamepad =>
    ({ mapping, connected, axes: [], buttons: [] }) as unknown as Gamepad;

  it('skips pads without the standard layout, whose buttons cannot be told apart', () => {
    const standard = make('standard');
    expect(firstStandardPad([null, make(''), standard])).toBe(standard);
  });

  it('is null with nothing usable', () => {
    expect(firstStandardPad([make('', true), make('standard', false)])).toBeNull();
    expect(firstStandardPad(null)).toBeNull();
  });
});
