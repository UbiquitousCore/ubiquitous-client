/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { spellDrag, spellSlotAt, startSpellDrag } from '../../src/ui/components/spellDrag';

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function socket(index: number): HTMLElement {
  const el = document.createElement('div');
  el.dataset.spellSlot = String(index);
  document.body.append(el);
  return el;
}

function press(x: number, y: number): PointerEvent {
  return new PointerEvent('pointerdown', { clientX: x, clientY: y, button: 0 });
}

/**
 * A spell held long enough follows the pointer to a bar socket; a quick move
 * is a scroll and leaves the press alone, so a tap still opens the spell.
 */
describe('startSpellDrag', () => {
  it('drops the spell on the socket under the pointer after a hold', () => {
    vi.useFakeTimers();
    const target = socket(3);
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(target);
    const onDrop = vi.fn();
    startSpellDrag(press(10, 10), 101, onDrop);
    vi.advanceTimersByTime(250);
    expect(spellDrag.value).toEqual({ spellId: 101, x: 10, y: 10 });
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 90, clientY: 90, button: 0 }));
    expect(onDrop).toHaveBeenCalledWith(101, 3);
    expect(spellDrag.value).toBeNull();
  });

  it('abandons a press that wanders before the hold, and reports nothing', () => {
    vi.useFakeTimers();
    const onDrop = vi.fn();
    startSpellDrag(press(10, 10), 101, onDrop);
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 40, clientY: 10, button: 0 }));
    vi.advanceTimersByTime(250);
    expect(spellDrag.value).toBeNull();
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 40, clientY: 10, button: 0 }));
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('reads the socket index off whatever carries it, and nothing off anything else', () => {
    const target = socket(7);
    const inner = document.createElement('span');
    target.append(inner);
    vi.spyOn(document, 'elementFromPoint')
      .mockReturnValueOnce(inner)
      .mockReturnValueOnce(document.body);
    expect(spellSlotAt(0, 0)).toBe(7);
    expect(spellSlotAt(0, 0)).toBeNull();
  });
});
