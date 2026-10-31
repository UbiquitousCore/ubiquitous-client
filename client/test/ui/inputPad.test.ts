/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from '../../src/gameplay/Input';

let input: Input | null = null;
afterEach(() => {
  input?.dispose();
  input = null;
});

function standardPad(down: number[] = [], axes: number[] = [0, 0, 0, 0]): Gamepad {
  return {
    connected: true,
    mapping: 'standard',
    axes,
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: down.includes(i),
      value: down.includes(i) ? 1 : 0,
      touched: false,
    })),
  } as unknown as Gamepad;
}

/** An `Input` reading a pad that the test swaps between samples, on a clock it advances. */
function withPad(): {
  read: () => Input;
  set: (pad: Gamepad | null) => void;
  tick: (ms: number) => void;
} {
  let current: Gamepad | null = null;
  let now = 1000;
  return {
    read: () => {
      input = new Input(
        document.createElement('div'),
        () => [current],
        () => now,
      );
      return input;
    },
    set: pad => {
      current = pad;
    },
    tick: ms => {
      now += ms;
    },
  };
}

describe('Input and a controller', () => {
  it('walks and turns from the left stick as the on-screen stick does', () => {
    const rig = withPad();
    const sampled = rig.read();
    rig.set(standardPad([], [0.9, -0.9, 0, 0]));
    const state = sampled.sample();
    expect(state.forward).toBe(true);
    expect(state.right).toBe(true);
    expect(state.back).toBe(false);
  });

  it('stands still with the stick at rest', () => {
    const rig = withPad();
    const sampled = rig.read();
    rig.set(standardPad([], [0.1, -0.1, 0, 0]));
    const state = sampled.sample();
    expect([state.forward, state.back, state.left, state.right]).toEqual([
      false,
      false,
      false,
      false,
    ]);
  });

  it('jumps once per press of A', () => {
    const rig = withPad();
    const sampled = rig.read();
    rig.set(standardPad([0]));
    expect(sampled.sample().jump).toBe(true);
    rig.tick(16);
    expect(sampled.sample().jump).toBe(false);
  });

  it('sends a bar socket press together with the keyboard', () => {
    const rig = withPad();
    const sampled = rig.read();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    rig.set(standardPad([6, 0]));
    expect(sampled.sample().castSlots).toEqual([1, 0]);
  });

  it('adds the right stick to the mouse drag and clamps a long stall', () => {
    const rig = withPad();
    const sampled = rig.read();
    rig.set(standardPad([], [0, 0, 1, 0]));
    sampled.sample();
    rig.tick(60_000);
    const state = sampled.sample();
    expect(state.dragX).toBeCloseTo(70, 0);
  });

  it('does nothing without a controller', () => {
    const rig = withPad();
    const sampled = rig.read();
    const state = sampled.sample();
    expect(state.targetStep).toBe(0);
    expect(state.interact).toBe(false);
  });
});
