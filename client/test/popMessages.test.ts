/**
 * The pop-message queue: the floating lines the game draws over the hero.
 *
 * The rules that matter are all about *pacing and wording*: one line per
 * interval and never two in a frame however far the clock has slipped, a
 * level-up that holds the queue longer and jumps it, and each line worded
 * in this client's own wording. Between them they are the whole of
 * what the client shows for a quest reward.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { LINES } from '../src/ui/gameLines';

import {
  POP_INTERVAL_LEVEL_UP_MS,
  POP_INTERVAL_MS,
  POP_LIFETIME_MS,
  POP_RISE,
  clearPopMessages,
  popExpGained,
  popFade,
  popItemGained,
  popLevelUp,
  popMessages,
  popMoneyGained,
  popRise,
  tickPopMessages,
} from '../src/ui/popMessages';

beforeEach(() => {
  clearPopMessages();
});

const texts = (): string[] => popMessages.value.map(message => message.text);

describe('what each line says', () => {
  it('writes experience as a signed amount', () => {
    popExpGained(250);
    tickPopMessages(0);

    // The shipped caption carries its own colon.
    expect(texts()).toEqual(['Exp: +250']);
  });

  it('says nothing at all for a gain of nothing', () => {
    popExpGained(0);
    popMoneyGained(0);
    tickPopMessages(POP_INTERVAL_MS);

    expect(texts()).toEqual([]);
  });

  it('spells money out in the denominations that are actually there', () => {
    popMoneyGained(32_540);
    tickPopMessages(0);

    expect(texts()).toEqual(['+3 gold 25 silver 40 copper']);
  });

  it('carries the minus for money that left', () => {
    popMoneyGained(-60);
    tickPopMessages(0);

    expect(texts()).toEqual(['-60 copper']);
  });

  it('brackets an item and counts it only when there is more than one', () => {
    popItemGained('Sample Cape', 1);
    tickPopMessages(0);
    expect(texts()).toEqual(['+ [Sample Cape]']);

    clearPopMessages();
    popItemGained('Sample Bread', 10);
    tickPopMessages(0);
    expect(texts()).toEqual(['+ [Sample Bread] x 10']);
  });

  it('congratulates a level-up by name', () => {
    popLevelUp(12);
    tickPopMessages(0);

    expect(texts()).toEqual([`${LINES.congratulations.fallback}\nLevel 12 reached.`]);
  });
});

describe('the pacing', () => {
  it('shows one line at once and holds the rest back', () => {
    popExpGained(10);
    popMoneyGained(20);
    popItemGained('Sample Blade', 1);
    tickPopMessages(0);

    expect(texts()).toEqual(['Exp: +10']);
  });

  it('lets the next one through half a second later', () => {
    popExpGained(10);
    popMoneyGained(20);
    tickPopMessages(0);
    tickPopMessages(POP_INTERVAL_MS);

    // The first has aged half its life and is still up; the second is new.
    expect(texts()).toEqual(['Exp: +10', '+20 copper']);
  });

  it('never releases two in one frame, however far behind the clock is', () => {
    popExpGained(10);
    popMoneyGained(20);
    popItemGained('Sample Blade', 1);
    tickPopMessages(0);
    // A dropped frame worth three intervals must not empty the queue: the
    // gap between lines is the point of the queue.
    tickPopMessages(POP_INTERVAL_MS * 3);

    expect(texts()).toContain('+20 copper');
    expect(texts()).not.toContain('+ [Sample Blade]');
  });

  it('holds a level-up longer than anything else', () => {
    expect(POP_INTERVAL_LEVEL_UP_MS).toBeGreaterThan(POP_INTERVAL_MS);
    popLevelUp(5);
    popExpGained(10);
    tickPopMessages(0);
    tickPopMessages(POP_INTERVAL_MS);

    // Still only the banner: the next line waits for the level-up's hold.
    expect(texts()).toEqual([`${LINES.congratulations.fallback}\nLevel 5 reached.`]);

    tickPopMessages(POP_INTERVAL_LEVEL_UP_MS - POP_INTERVAL_MS);
    expect(texts()).toContain('Exp: +10');
  });

  it('puts a level-up in front of what is already waiting', () => {
    popExpGained(10);
    popMoneyGained(20);
    popLevelUp(5);
    tickPopMessages(0);

    expect(texts()).toEqual([`${LINES.congratulations.fallback}\nLevel 5 reached.`]);
  });

  it('shows two level-ups in the order they were reached', () => {
    popLevelUp(5);
    popLevelUp(6);
    tickPopMessages(0);
    tickPopMessages(POP_INTERVAL_LEVEL_UP_MS);

    expect(texts().map(text => text.split('\n')[1])).toEqual([
      'Level 5 reached.',
      'Level 6 reached.',
    ]);
  });

  it('shows the first message of a quiet spell at once', () => {
    popExpGained(10);
    tickPopMessages(0);
    // Long enough for the line to expire and the queue to empty.
    tickPopMessages(POP_LIFETIME_MS);
    expect(texts()).toEqual([]);

    popMoneyGained(20);
    tickPopMessages(0);
    expect(texts()).toEqual(['+20 copper']);
  });
});

describe('the timeline over uneven frames', () => {
  /** When each line first shows, in ms since the first tick. */
  function appearances(frames: number[], atFrame: Record<number, () => void> = {}): string[] {
    const seen = new Set<number>();
    const shown: string[] = [];
    let clock = 0;
    frames.forEach((dt, i) => {
      clock += dt;
      atFrame[i]?.();
      tickPopMessages(dt);
      for (const line of popMessages.value) {
        if (seen.has(line.key)) continue;
        seen.add(line.key);
        shown.push(`${clock} ${line.text.split('\n')[1] ?? line.text}`);
      }
    });
    return shown;
  }

  it('lets a line through on the first frame its gap has run out, and loses the overshoot', () => {
    popExpGained(1);
    popMoneyGained(2);
    popExpGained(3);
    // 0, then 400 + 40 = 440 (short of the gap), 480 (past it), then the next
    // gap counts from 480, not from 450.
    const frames = [0, 400, 40, 40, 400, 40, 40];

    expect(appearances(frames)).toEqual(['0 Exp: +1', '480 +2 copper', '960 Exp: +3']);
  });

  it('shows a line queued into a quiet spell on the next frame', () => {
    popExpGained(1);
    const frames = [0, 40, 900, 20, 20];

    expect(appearances(frames, { 3: () => popMoneyGained(2) })).toEqual([
      '0 Exp: +1',
      '960 +2 copper',
    ]);
  });

  it('puts a level-up ahead of gains already waiting, and holds the queue for it', () => {
    popExpGained(1);
    popMoneyGained(2);
    popLevelUp(3);
    const frames = [0, 20, 1200, 100, 400, 100];

    expect(appearances(frames)).toEqual(['0 Level 3 reached.', '1320 Exp: +1', '1820 +2 copper']);
  });
});

describe('how a line ages', () => {
  it('drops off once its life is up', () => {
    popExpGained(10);
    tickPopMessages(0);
    tickPopMessages(POP_LIFETIME_MS);

    expect(texts()).toEqual([]);
  });

  it('drifts up and fades across that life, and neither past the end', () => {
    expect(popRise({ kind: 'exp', age: 0 })).toBe(0);
    expect(popRise({ kind: 'exp', age: POP_LIFETIME_MS })).toBe(POP_RISE);
    expect(popRise({ kind: 'exp', age: POP_LIFETIME_MS * 2 })).toBe(POP_RISE);

    expect(popFade({ kind: 'exp', age: 0 })).toBe(1);
    expect(popFade({ kind: 'exp', age: POP_LIFETIME_MS / 2 })).toBeCloseTo(0.5);
    expect(popFade({ kind: 'exp', age: POP_LIFETIME_MS * 2 })).toBe(0);
  });

  it('does not drift the banner, which has a fixed slot', () => {
    expect(popRise({ kind: 'levelUp', age: POP_LIFETIME_MS })).toBe(0);
  });

  it('keeps the banner up long after a gain would have gone', () => {
    popLevelUp(5);
    tickPopMessages(0);
    tickPopMessages(POP_LIFETIME_MS);

    expect(texts()).toEqual([`${LINES.congratulations.fallback}\nLevel 5 reached.`]);
  });
});

describe('leaving the world', () => {
  it('forgets what is showing and what is still queued', () => {
    popExpGained(10);
    popMoneyGained(20);
    tickPopMessages(0);

    clearPopMessages();
    tickPopMessages(POP_INTERVAL_MS);

    expect(texts()).toEqual([]);
  });
});
