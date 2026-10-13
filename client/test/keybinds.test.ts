/**
 * Which key does what: the model behind the Controls tab.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KEYBINDS,
  castSlotOf,
  keyLabel,
  parseKeybinds,
  rebind,
} from '../src/gameplay/keybinds';

describe('parseKeybinds', () => {
  it('takes what storage held and falls back one action at a time', () => {
    const binds = parseKeybinds({ forward: ['E'], cast1: 'not a list', back: [3] });
    expect(binds.forward).toEqual(['e']);
    expect(binds.cast1).toEqual(DEFAULT_KEYBINDS.cast1);
    expect(binds.back).toEqual(DEFAULT_KEYBINDS.back);
    expect(parseKeybinds(undefined)).toEqual(DEFAULT_KEYBINDS);
  });
});

describe('rebind', () => {
  it('gives the action the key and takes it from wherever it was', () => {
    const binds = rebind(DEFAULT_KEYBINDS, 'cast1', 'w');
    expect(binds.cast1).toEqual(['w']);
    expect(binds.forward).toEqual(['arrowup']);
  });

  it('lets jump and swim-up keep sharing a key, as one press means both', () => {
    const binds = rebind(DEFAULT_KEYBINDS, 'jump', 'x');
    expect(binds.jump).toEqual(['x']);
    expect(binds.ascend).toEqual([' ']);
    const shared = rebind(binds, 'ascend', 'x');
    expect(shared.jump).toEqual(['x']);
    expect(shared.ascend).toEqual(['x']);
  });
});

describe('labels and slots', () => {
  it('prints keys the way a settings screen should', () => {
    expect(keyLabel(' ')).toBe('Space');
    expect(keyLabel('arrowup')).toBe('↑');
    expect(keyLabel('w')).toBe('W');
    expect(keyLabel('shift')).toBe('Shift');
  });

  it('maps cast actions onto the ten bar sockets in order', () => {
    expect(castSlotOf('cast1')).toBe(0);
    expect(castSlotOf('cast10')).toBe(9);
    expect(DEFAULT_KEYBINDS.cast10).toEqual(['0']);
  });
});
