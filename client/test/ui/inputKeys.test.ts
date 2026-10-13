/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from '../../src/gameplay/Input';
import { DEFAULT_KEYBINDS, rebind } from '../../src/gameplay/keybinds';

let input: Input | null = null;
afterEach(() => {
  input?.dispose();
  input = null;
});

function press(key: string, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, repeat }));
}

/**
 * Keys reach the bar through the bindings, once per press, and a rebind
 * moves them.
 */
describe('Input and the bar keys', () => {
  it('reports a pressed bar socket once, and not on auto-repeat', () => {
    input = new Input(document.createElement('div'));
    press('1');
    press('1', true);
    press('0');
    expect(input.sample().castSlots).toEqual([0, 9]);
    expect(input.sample().castSlots).toEqual([]);
  });

  it('follows a rebind, and lets go of the key it took', () => {
    input = new Input(document.createElement('div'));
    input.setBindings(rebind(DEFAULT_KEYBINDS, 'cast3', 'w'));
    press('w');
    const state = input.sample();
    expect(state.castSlots).toEqual([2]);
    expect(state.forward).toBe(false);
  });
});

describe('Input and letting go of a target', () => {
  it('reports Escape once, on the frame it was pressed', () => {
    input = new Input(document.createElement('div'));
    press('Escape');
    expect(input.sample().deselect).toBe(true);
    expect(input.sample().deselect).toBe(false);
  });

  it('leaves Escape to a text field that is being typed in', () => {
    input = new Input(document.createElement('div'));
    const field = document.createElement('input');
    document.body.append(field);
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(input.sample().deselect).toBe(false);
    field.remove();
  });
});
