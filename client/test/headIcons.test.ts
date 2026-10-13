/**
 * Head icons: the easing, without a scene graph.
 *
 * A short glide between two heights, and the bookkeeping that keeps a move
 * from outliving the body it belongs to.
 */

import { describe, expect, it } from 'vitest';

import {
  HeadIcons,
  ICON_BOB_AMPLITUDE,
  ICON_BOB_PERIOD_S,
  ICON_GLIDE_MS,
  iconBob,
  iconLift,
} from '../src/renderer/HeadIcons';
import {
  NAME_LABEL_ONE_LINE_PX,
  NAME_LABEL_PX,
  NAME_LABEL_WORLD_HEIGHT,
} from '../src/renderer/nameLabels';

/** Collects what would have been written to each icon. */
function recorder(missing: Set<number> = new Set()) {
  const placed: Array<{ id: number; y: number }> = [];
  const place = (id: number, y: number): boolean => {
    if (missing.has(id)) return false;
    placed.push({ id, y });
    return true;
  };
  return { placed, place };
}

describe('easing an icon to its new height', () => {
  it('glides for 170 ms', () => {
    expect(ICON_GLIDE_MS).toBe(170);
  });

  it('lands a move over the glide, not in one frame', () => {
    const icons = new HeadIcons();
    icons.start(1, 0, 1, 0);

    const half = recorder();
    icons.advance(ICON_GLIDE_MS / 2, half.place);
    expect(half.placed).toEqual([{ id: 1, y: 0.5 }]);
    // Still in flight, so still tracked.
    expect(icons.size).toBe(1);

    const done = recorder();
    icons.advance(ICON_GLIDE_MS, done.place);
    expect(done.placed).toEqual([{ id: 1, y: 1 }]);
    expect(icons.size).toBe(0);
  });

  it('never overshoots, however late the frame is', () => {
    const icons = new HeadIcons();
    icons.start(1, 0, 1, 0);

    const late = recorder();
    icons.advance(ICON_GLIDE_MS * 10, late.place);

    expect(late.placed).toEqual([{ id: 1, y: 1 }]);
  });

  it('eases downward the same way', () => {
    const icons = new HeadIcons();
    icons.start(7, 1, 0, 0);

    const half = recorder();
    icons.advance(ICON_GLIDE_MS / 2, half.place);

    expect(half.placed).toEqual([{ id: 7, y: 0.5 }]);
  });
});

describe('a move that should not outlive its body', () => {
  it('is dropped when the icon has gone', () => {
    const icons = new HeadIcons();
    icons.start(1, 0, 1, 0);

    const gone = recorder(new Set([1]));
    icons.advance(ICON_GLIDE_MS / 2, gone.place);

    expect(gone.placed).toEqual([]);
    expect(icons.size).toBe(0);
  });

  it('is dropped when the body is forgotten', () => {
    const icons = new HeadIcons();
    icons.start(1, 0, 1, 0);

    icons.forget(1);

    const after = recorder();
    icons.advance(ICON_GLIDE_MS / 2, after.place);
    expect(after.placed).toEqual([]);
  });

  it('leaves nothing behind when the whole zone goes', () => {
    const icons = new HeadIcons();
    icons.start(1, 0, 1, 0);
    icons.start(2, 0, 1, 0);

    icons.clear();

    expect(icons.size).toBe(0);
  });

  it('costs nothing when nothing is moving', () => {
    const icons = new HeadIcons();

    const idle = recorder();
    icons.advance(1000, idle.place);

    expect(idle.placed).toEqual([]);
  });
});

describe('where the text under it puts an icon', () => {
  it('lifts the icon clear of whatever text is under it', () => {
    // Measured from the nameplate anchor, and higher the more text there is.
    const alone = HeadIcons.heightFor(2, 0);
    const overName = HeadIcons.heightFor(2, 1);
    const overBoth = HeadIcons.heightFor(2, 2);
    expect(alone).toBeGreaterThan(2);
    expect(overName).toBeGreaterThan(alone);
    expect(overBoth).toBeGreaterThan(overName);
  });

  it('keeps the icon centre at least half a small icon above the top of the text', () => {
    // A single name reaches half a line above the anchor, a name over a role
    // a whole line: the same clearance above each.
    const line = NAME_LABEL_WORLD_HEIGHT * (NAME_LABEL_PX / NAME_LABEL_ONE_LINE_PX);
    const smallestIconHalf = 0.55 / 2;
    expect(iconLift(0)).toBeGreaterThan(smallestIconHalf);
    expect(iconLift(1) - line / 2).toBeCloseTo(iconLift(0), 6);
    expect(iconLift(2) - line).toBeCloseTo(iconLift(0), 6);
  });

  it('restarts a move from wherever the icon currently is, mid-ease', () => {
    const icons = new HeadIcons();
    icons.start(1, 0, 1, 0);
    const mid = recorder();
    icons.advance(ICON_GLIDE_MS / 2, mid.place);

    // Selected again before the first move finished: the second starts from
    // the height reached, not from where the first one began.
    icons.start(1, mid.placed[0]!.y, 0, ICON_GLIDE_MS / 2);
    const back = recorder();
    // Its own glide, counted from when it started.
    icons.advance(ICON_GLIDE_MS / 2 + ICON_GLIDE_MS, back.place);

    expect(back.placed).toEqual([{ id: 1, y: 0 }]);
  });
});

describe('icon bob', () => {
  it('stays within its amplitude and repeats every period', () => {
    for (let t = 0; t < 5000; t += 137) {
      expect(Math.abs(iconBob(t, 3))).toBeLessThanOrEqual(ICON_BOB_AMPLITUDE + 1e-9);
      expect(iconBob(t + ICON_BOB_PERIOD_S * 1000, 3)).toBeCloseTo(iconBob(t, 3), 6);
    }
  });

  it('actually moves, and bodies are out of step with each other', () => {
    expect(iconBob(0, 1)).not.toBeCloseTo(iconBob(400, 1), 3);
    expect(iconBob(0, 1)).not.toBeCloseTo(iconBob(0, 2), 3);
  });
});
