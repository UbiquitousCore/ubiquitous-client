/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMultiTouchTap } from '../src/ui/multiTouchTap';
import { pinchWheel } from '../src/gameplay/pinch';

describe('pinchWheel', () => {
  it('zooms in as the fingers spread and out as they close', () => {
    expect(pinchWheel(100, 150)).toBeLessThan(0);
    expect(pinchWheel(150, 100)).toBeGreaterThan(0);
    expect(pinchWheel(100, 100)).toBe(0);
  });
});

describe('installMultiTouchTap', () => {
  let off: () => void;
  let button: HTMLButtonElement;
  let clicks: number;

  const pointer = (type: string, target: Element, id: number) => {
    const e = new Event(type, { bubbles: true }) as Event & Record<string, unknown>;
    Object.assign(e, { pointerType: 'touch', pointerId: id, clientX: 5, clientY: 5 });
    target.dispatchEvent(e);
  };

  beforeEach(() => {
    button = document.createElement('button');
    document.body.append(button);
    document.elementFromPoint = () => button;
    clicks = 0;
    button.addEventListener('click', () => clicks++);
    off = installMultiTouchTap();
  });
  afterEach(() => {
    off();
    button.remove();
    vi.restoreAllMocks();
  });

  it('clicks a button tapped while another finger is down', () => {
    pointer('pointerdown', document.body, 1);
    pointer('pointerdown', button, 2);
    pointer('pointerup', button, 2);
    expect(clicks).toBe(1);
  });

  it('swallows the browser click that follows, so one tap is one click', () => {
    pointer('pointerdown', document.body, 1);
    pointer('pointerdown', button, 2);
    pointer('pointerup', button, 2);
    button.click();
    expect(clicks).toBe(1);
  });

  it('leaves a lone tap to the browser', () => {
    pointer('pointerdown', button, 1);
    pointer('pointerup', button, 1);
    expect(clicks).toBe(0);
  });
});
