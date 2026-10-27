/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installTouchMenuGuard } from '../src/ui/touchMenu';

describe('the browser menu on a long press', () => {
  let remove: () => void;

  beforeEach(() => {
    document.body.innerHTML =
      '<img id="art" /><input id="chat" /><div contenteditable="true"><span id="note"></span></div>';
    remove = installTouchMenuGuard();
  });

  afterEach(() => {
    remove();
    document.body.innerHTML = '';
  });

  const pressWith = (pointerType: string, id: string): boolean => {
    const target = document.getElementById(id)!;
    target.dispatchEvent(new PointerEvent('pointerdown', { pointerType, bubbles: true }));
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    target.dispatchEvent(menu);
    return menu.defaultPrevented;
  };

  it('does not open over the interface after a touch', () => {
    expect(pressWith('touch', 'art')).toBe(true);
  });

  it('still opens in a field being typed in, for paste', () => {
    expect(pressWith('touch', 'chat')).toBe(false);
    expect(pressWith('touch', 'note')).toBe(false);
  });

  it('still opens for a mouse', () => {
    expect(pressWith('mouse', 'art')).toBe(false);
  });

  it('opens everywhere again once removed', () => {
    remove();
    expect(pressWith('touch', 'art')).toBe(false);
    remove = installTouchMenuGuard();
  });
});
