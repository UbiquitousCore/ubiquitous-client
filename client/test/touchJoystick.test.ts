/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest';

import { Input } from '../src/gameplay/Input';
import { followThumb, inStickZone, keepOnScreen } from '../src/gameplay/TouchJoystick';

describe('where a thumb takes the stick', () => {
  it('takes the lower-left corner and leaves the rest for looking', () => {
    expect(inStickZone(10, 390, 800, 400)).toBe(true);
    expect(inStickZone(10, 399, 800, 400)).toBe(true);
    expect(inStickZone(319, 399, 800, 400)).toBe(true);
    expect(inStickZone(320, 399, 800, 400)).toBe(false);
    expect(inStickZone(10, 100, 800, 400)).toBe(false);
    expect(inStickZone(700, 390, 800, 400)).toBe(false);
  });
});

describe('following the thumb', () => {
  const centre = { x: 100, y: 100 };

  it('reads the thumb over the radius while it stays inside the rim', () => {
    const got = followThumb(centre, { x: 125, y: 100 }, 50);
    expect(got.centre).toEqual(centre);
    expect(got.x).toBeCloseTo(0.5);
    expect(got.y).toBeCloseTo(0);
  });

  it('drags the ring along behind a thumb that passes the rim', () => {
    const got = followThumb(centre, { x: 100, y: 180 }, 50);
    expect(got.centre).toEqual({ x: 100, y: 130 });
    expect(got.x).toBeCloseTo(0);
    expect(got.y).toBeCloseTo(1);
  });

  it('steers from where the ring was dragged to, not where it began', () => {
    const dragged = followThumb(centre, { x: 100, y: 180 }, 50).centre;
    const back = followThumb(dragged, { x: 100, y: 130 }, 50);
    expect(back.centre).toEqual(dragged);
    expect(back.y).toBeCloseTo(0);
  });
});

describe('keeping the ring on the screen', () => {
  it('pulls a ring that would hang off an edge back inside', () => {
    expect(keepOnScreen({ x: 5, y: 790 }, 60, 1000, 800)).toEqual({ x: 60, y: 740 });
    expect(keepOnScreen({ x: 300, y: 300 }, 60, 1000, 800)).toEqual({ x: 300, y: 300 });
  });
});

describe('a touch on the game', () => {
  let input: Input | null = null;
  afterEach(() => {
    input?.dispose();
    input = null;
    document.body.innerHTML = '';
    delete (HTMLDivElement.prototype as { clientWidth?: number }).clientWidth;
  });

  function touch(target: HTMLElement, type: string, id: number, x: number, y: number): void {
    const t = { identifier: id, clientX: x, clientY: y, target } as unknown as Touch;
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'changedTouches', {
      value: Object.assign([t], { item: (i: number) => [t][i] }),
    });
    (type === 'touchstart' ? target : window).dispatchEvent(e);
  }

  function setUp(): HTMLElement {
    // happy-dom lays nothing out; the ring is 120 pixels across on a phone.
    Object.defineProperty(HTMLDivElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 120,
    });
    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    input = new Input(canvas);
    input.setJoystickEnabled(true);
    return canvas;
  }

  it('moves when it lands on the left, and does not turn the camera', () => {
    const canvas = setUp();
    const x = window.innerWidth * 0.2;
    const y = window.innerHeight * 0.8;
    touch(canvas, 'touchstart', 1, x, y);
    touch(canvas, 'touchmove', 1, x, y - 100);
    const state = input!.sample();
    expect(state.forward).toBe(true);
    expect(state.dragX).toBe(0);
    expect(state.dragY).toBe(0);
  });

  it('does nothing for a tap or a resting thumb, and does not look either', () => {
    const canvas = setUp();
    const x = window.innerWidth * 0.2;
    const y = window.innerHeight * 0.8;
    touch(canvas, 'touchstart', 1, x, y);
    touch(canvas, 'touchmove', 1, x, y - 4);
    const state = input!.sample();
    expect(state.forward).toBe(false);
    expect(state.dragY).toBe(0);
  });

  it('looks, not moves, in the upper-left', () => {
    const canvas = setUp();
    const x = window.innerWidth * 0.2;
    touch(canvas, 'touchstart', 3, x, 100);
    touch(canvas, 'touchmove', 3, x + 30, 100);
    const state = input!.sample();
    expect(state.forward).toBe(false);
    expect(state.dragX).toBe(30);
  });

  it('looks when it lands on the right, and does not move', () => {
    const canvas = setUp();
    const x = window.innerWidth * 0.8;
    touch(canvas, 'touchstart', 2, x, 300);
    touch(canvas, 'touchmove', 2, x + 30, 300);
    const state = input!.sample();
    expect(state.forward).toBe(false);
    expect(state.dragX).toBe(30);
  });
});
