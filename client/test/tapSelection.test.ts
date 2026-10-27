import { describe, expect, it } from 'vitest';

import {
  nextTapState,
  pressFor,
  releaseIsTap,
  tapSelection,
} from '../src/app/helpers/combat/tapSelection';

describe('nextTapState', () => {
  it('detects second taps by time and distance', () => {
    const first = nextTapState({
      previous: null,
      x: 10,
      y: 10,
      at: 100,
      doubleTapMs: 300,
      tapSlop: 6,
    });
    expect(first.isSecondTap).toBe(false);

    const second = nextTapState({
      previous: first.next,
      x: 12,
      y: 11,
      at: 350,
      doubleTapMs: 300,
      tapSlop: 6,
    });
    expect(second.isSecondTap).toBe(true);
  });
});

describe('tapSelection', () => {
  it('returns null when no body/icon was hit', () => {
    expect(tapSelection({ bodyId: null, iconId: null, lastTapped: null, isSecondTap: false })).toBe(
      null,
    );
  });

  it('selects on first body tap and interacts on second', () => {
    expect(tapSelection({ bodyId: 7, iconId: null, lastTapped: null, isSecondTap: false })).toEqual(
      {
        id: 7,
        action: 'select',
      },
    );
    expect(tapSelection({ bodyId: 7, iconId: null, lastTapped: 7, isSecondTap: true })).toEqual({
      id: 7,
      action: 'interact',
    });
  });

  it('treats icon taps as interact taps', () => {
    expect(tapSelection({ bodyId: null, iconId: 8, lastTapped: null, isSecondTap: false })).toEqual(
      {
        id: 8,
        action: 'interact',
      },
    );
  });
});

describe('pressFor', () => {
  const down = { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 10, clientY: 20 };

  it('tracks a left or right mouse press and any touch', () => {
    expect(pressFor(down)).toEqual({ id: 1, x: 10, y: 20 });
    expect(pressFor({ ...down, button: 2 })).not.toBeNull();
    expect(pressFor({ ...down, pointerType: 'touch', button: -1 })).not.toBeNull();
  });

  it('ignores a middle click', () => {
    expect(pressFor({ ...down, button: 1 })).toBeNull();
  });

  it('tracks every finger on its own, so a tap works while another finger steers', () => {
    expect(pressFor({ ...down, pointerType: 'touch', pointerId: 2 })).toEqual({
      id: 2,
      x: 10,
      y: 20,
    });
  });
});

describe('releaseIsTap', () => {
  const press = { id: 1, x: 100, y: 100 };

  it('is a tap when released within the slop', () => {
    expect(releaseIsTap(press, { pointerId: 1, clientX: 106, clientY: 108 }, 12)).toBe(true);
  });

  it('is a look-drag once it travels past the slop', () => {
    expect(releaseIsTap(press, { pointerId: 1, clientX: 100, clientY: 113 }, 12)).toBe(false);
  });

  it('is not a tap for a different pointer', () => {
    expect(releaseIsTap(press, { pointerId: 2, clientX: 100, clientY: 100 }, 12)).toBe(false);
  });
});
