/**
 * The red line across the middle: what raises it, what a repeat does, and
 * the lines either side of a fight.
 *
 * Different words replace the line at once. The same words again within
 * `REPEAT_WINDOW` of the last time they went up are dropped, however many
 * other lines came between. The fight's lines share one topic; the line for
 * leaving is quiet, so it never covers a line of another topic still on
 * screen.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  BANNER_LIFETIME,
  COMBAT_WORDS,
  REPEAT_WINDOW,
  banner,
  inCombat,
  reportToPlayer,
  setInCombat,
  tickSpells,
} from '../src/gameplay/SpellBook';
import { themeSource } from './helpers/themeTokens';

/*
 * A clock the test owns. Every call names its own instant; the start of each
 * case is far enough ahead that nothing the last one raised still counts as
 * recent.
 */
let clock = 0;

beforeEach(() => {
  banner.value = null;
  inCombat.value = false;
  clock += REPEAT_WINDOW * 10;
});

describe('what colour each line wears', () => {
  it('refuses by default, so good news names its tone', () => {
    reportToPlayer('You cannot do that.', clock);
    expect(banner.value?.tone).toBe('refused');
    reportToPlayer('You have learned Fireball.', clock + REPEAT_WINDOW * 2, { tone: 'done' });
    expect(banner.value?.tone).toBe('done');
  });
});

describe('the lines either side of a fight', () => {
  it('says so when a fight starts', () => {
    setInCombat(true, clock);
    expect(banner.value?.text).toBe(COMBAT_WORDS.enter);
  });

  it('says so when it ends, replacing the line that opened it', () => {
    setInCombat(true, clock);
    setInCombat(false, clock + 10);
    expect(banner.value?.text).toBe(COMBAT_WORDS.leave);
  });

  it('keeps quiet about leaving while another topic is on screen', () => {
    setInCombat(true, clock);
    reportToPlayer('You have died.', clock + 10);
    setInCombat(false, clock + 20);
    expect(banner.value?.text).toBe('You have died.');
    expect(inCombat.value).toBe(false);
  });

  it('says it once that other line has gone', () => {
    setInCombat(true, clock);
    reportToPlayer('Out of range.', clock + 10);
    tickSpells(BANNER_LIFETIME);
    setInCombat(false, clock + 20);
    expect(banner.value?.text).toBe(COMBAT_WORDS.leave);
  });

  it('only speaks on an edge, not on every message that agrees', () => {
    setInCombat(true, clock);
    banner.value = null;
    setInCombat(true, clock + REPEAT_WINDOW * 2);
    expect(banner.value).toBeNull();
  });
});

describe('repeats', () => {
  it('replaces the line at once with different words', () => {
    reportToPlayer('first', clock);
    reportToPlayer('second', clock + 1);
    expect(banner.value?.text).toBe('second');
  });

  it('drops the same words inside the repeat window', () => {
    reportToPlayer('Not ready yet.', clock);
    const first = banner.value!.key;
    reportToPlayer('Not ready yet.', clock + REPEAT_WINDOW - 1);
    expect(banner.value!.key).toBe(first);
  });

  it('drops a repeat even when another line came between', () => {
    reportToPlayer('Not ready yet.', clock);
    reportToPlayer('Out of range.', clock + 100);
    reportToPlayer('Not ready yet.', clock + 200);
    expect(banner.value?.text).toBe('Out of range.');
  });

  it('raises the same words again once the window has passed, with a new key', () => {
    reportToPlayer('Not ready yet.', clock);
    const first = banner.value!.key;
    reportToPlayer('Not ready yet.', clock + REPEAT_WINDOW);
    expect(banner.value?.text).toBe('Not ready yet.');
    expect(banner.value!.key).not.toBe(first);
  });

  it('counts the window from when the words last went up, not from each press', () => {
    // Pressing on through a refusal still hears it now and then.
    reportToPlayer('Not ready yet.', clock);
    const first = banner.value!.key;
    for (let t = 100; t < REPEAT_WINDOW; t += 100) reportToPlayer('Not ready yet.', clock + t);
    reportToPlayer('Not ready yet.', clock + REPEAT_WINDOW);
    expect(banner.value!.key).not.toBe(first);
  });
});

describe('how long it stays up', () => {
  it('ages with the frame and goes on its own', () => {
    reportToPlayer('up', clock);
    tickSpells(BANNER_LIFETIME / 2);
    expect(banner.value?.age).toBeCloseTo(BANNER_LIFETIME / 2, 6);
    tickSpells(BANNER_LIFETIME / 2);
    expect(banner.value).toBeNull();
  });
});

describe('the banner on screen', () => {
  it('fades out over exactly the time it is kept for', () => {
    const run = themeSource.match(/--animate-banner:\s*banner\s+([\d.]+)s/);
    expect(run, 'theme.css has no --animate-banner').toBeTruthy();
    expect(Number(run![1])).toBe(BANNER_LIFETIME);
  });
});
