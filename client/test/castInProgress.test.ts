/**
 * A cast in progress is not given up for another press: a second spell waits
 * its turn, and the server refusing it leaves the first cast's bar alone. A
 * jump does give it up.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  abandonCast,
  BROKEN_CAST_HOLD_MS,
  brokenCast,
  casting,
  failCast,
  interruptCast,
  mayStartCast,
  startCast,
  tickSpells,
} from '../src/gameplay/SpellBook';

afterEach(() => {
  casting.value = null;
  brokenCast.value = null;
});

describe('pressing a spell while one is casting', () => {
  it('may start a cast when nothing is being cast', () => {
    expect(mayStartCast()).toBe(true);
  });

  it('may not start another while a cast is filling', () => {
    startCast(7, null, 1500);
    expect(mayStartCast()).toBe(false);
  });

  it('keeps the bar when the refused spell is not the one being cast', () => {
    startCast(7, null, 1500);
    failCast(9);
    expect(casting.value?.spellId).toBe(7);
  });

  it('clears the bar when the spell being cast fails', () => {
    startCast(7, null, 1500);
    failCast(7);
    expect(casting.value).toBeNull();
  });
});

describe('giving up a cast, as a jump does', () => {
  it('clears the bar and names the spell to call off', () => {
    startCast(7, null, 1500);
    expect(abandonCast()).toBe(7);
    expect(casting.value).toBeNull();
    expect(mayStartCast()).toBe(true);
  });

  it('names nothing when no cast is running', () => {
    expect(abandonCast()).toBeNull();
  });
});

describe('an interrupted cast', () => {
  it('holds the bar where it stopped, then lets it go', () => {
    startCast(7, null, 1500);
    tickSpells(0.6);

    interruptCast();

    expect(casting.value).toBeNull();
    expect(mayStartCast()).toBe(true);
    expect(brokenCast.value).toMatchObject({ spellId: 7, castTime: 1500, elapsed: 600 });
    tickSpells(0.5);
    expect(brokenCast.value?.elapsed).toBe(600);
    tickSpells(BROKEN_CAST_HOLD_MS / 1000);
    expect(brokenCast.value).toBeNull();
  });

  it('is shown for a jump too', () => {
    startCast(7, null, 1500);
    abandonCast();
    expect(brokenCast.value?.spellId).toBe(7);
  });

  it('gives way to the next cast', () => {
    startCast(7, null, 1500);
    interruptCast();
    startCast(9, null, 1500);
    expect(brokenCast.value).toBeNull();
  });

  it('shows nothing when no cast was running', () => {
    interruptCast();
    expect(brokenCast.value).toBeNull();
  });

  it('is not shown for a refusal', () => {
    startCast(7, null, 1500);
    failCast(7);
    expect(brokenCast.value).toBeNull();
  });
});
