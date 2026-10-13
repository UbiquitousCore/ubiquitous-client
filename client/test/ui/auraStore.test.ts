import { afterEach, describe, expect, it } from 'vitest';

import {
  appliedFrom,
  auraCard,
  auraCardWords,
  aurasFor,
  clearAura,
  clearAuras,
  formatTimeLeft,
  liveAuras,
  setAura,
  setAurasOf,
  timeLeft,
  toggleAuraCard,
} from '../../src/ui/auraStore';
import type { AuraApplied } from '../../src/ui/auraStore';

afterEach(clearAuras);

const applied = (spellId: number, over: Partial<AuraApplied> = {}): AuraApplied => ({
  spellId,
  casterId: 7,
  harmful: false,
  stacks: 1,
  remainingMs: 30_000,
  durationMs: 30_000,
  ...over,
});

describe('the aura list', () => {
  it('carries nothing for a unit that has never had one set', () => {
    expect(aurasFor('1', 0)).toEqual([]);
    expect(aurasFor(undefined, 0)).toEqual([]);
  });

  it('applies an aura to the unit it names, and no other, timed from now', () => {
    setAura('1', applied(100), 1_000);
    expect(aurasFor('1', 1_000)).toEqual([
      { spellId: 100, casterId: 7, harmful: false, stacks: 1, durationMs: 30_000, endsAt: 31_000 },
    ]);
    expect(aurasFor('2', 1_000)).toEqual([]);
  });

  it('refreshes a reapplied aura in its place, with the time the server says is left', () => {
    setAura('1', applied(100), 0);
    setAura('1', applied(300), 0);
    setAura('1', applied(100, { remainingMs: 30_000 }), 20_000);
    const list = aurasFor('1', 20_000);
    expect(list.map(one => one.spellId)).toEqual([100, 300]);
    expect(timeLeft(list[0]!, 20_000)).toBe(30_000);
  });

  it('takes the stack count from the latest message, never below one', () => {
    setAura('1', applied(100, { stacks: 1 }), 0);
    setAura('1', applied(100, { stacks: 3 }), 0);
    expect(aurasFor('1', 0)[0]!.stacks).toBe(3);
    setAura('1', applied(100, { stacks: 0 }), 0);
    expect(aurasFor('1', 0)[0]!.stacks).toBe(1);
  });

  it('stands buffs before debuffs, each in the order they arrived', () => {
    setAura('1', applied(1, { harmful: true }), 0);
    setAura('1', applied(2), 0);
    setAura('1', applied(3, { harmful: true }), 0);
    setAura('1', applied(4), 0);
    expect(aurasFor('1', 0).map(one => one.spellId)).toEqual([2, 4, 1, 3]);
  });

  it('stops showing an aura whose time has run out, before its end arrives', () => {
    setAura('1', applied(100, { remainingMs: 5_000 }), 0);
    expect(aurasFor('1', 4_999)).toHaveLength(1);
    expect(aurasFor('1', 5_000)).toEqual([]);
    expect(liveAuras([], 0)).toEqual([]);
  });

  it('keeps an aura with no time on it until it is taken off', () => {
    setAura('1', applied(100, { remainingMs: 0, durationMs: 0 }), 0);
    const [aura] = aurasFor('1', 10_000_000);
    expect(aura!.endsAt).toBeNull();
    expect(timeLeft(aura!, 10_000_000)).toBeNull();
  });

  it('times an aura that names only its starting length from that length', () => {
    setAura('1', applied(100, { remainingMs: 0, durationMs: 8_000 }), 0);
    expect(timeLeft(aurasFor('1', 0)[0]!, 2_000)).toBe(6_000);
  });

  it('ends one aura by its spell, leaving the rest', () => {
    setAura('1', applied(100), 0);
    setAura('1', applied(300), 0);
    clearAura('1', 100);
    expect(aurasFor('1', 0).map(one => one.spellId)).toEqual([300]);
  });

  it('ends every aura on the unit for spell 0', () => {
    setAura('1', applied(100), 0);
    setAura('1', applied(300), 0);
    clearAura('1', 0);
    expect(aurasFor('1', 0)).toEqual([]);
  });

  it('does nothing to a unit carrying no auras at all', () => {
    expect(() => clearAura('nobody', 1)).not.toThrow();
    expect(aurasFor('nobody', 0)).toEqual([]);
  });

  it('forgets every unit and puts the open card away when the session goes', () => {
    setAura('1', applied(100), 0);
    toggleAuraCard({ unitKey: '1', spellId: 100, at: { x: 0, y: 0 } });
    clearAuras();
    expect(aurasFor('1', 0)).toEqual([]);
    expect(auraCard.value).toBeNull();
  });
});

describe('the countdown', () => {
  it('writes minutes and seconds, rounding a part-second up', () => {
    expect(formatTimeLeft(30_000)).toBe('0:30');
    expect(formatTimeLeft(29_001)).toBe('0:30');
    expect(formatTimeLeft(1)).toBe('0:01');
    expect(formatTimeLeft(0)).toBe('0:00');
    expect(formatTimeLeft(730_000)).toBe('12:10');
  });

  it('writes hours past the hour', () => {
    expect(formatTimeLeft(3_600_000)).toBe('1:00:00');
    expect(formatTimeLeft(3_725_000)).toBe('1:02:05');
  });

  it('counts down on this client from what the server sent', () => {
    setAura('1', applied(100, { remainingMs: 10_000 }), 50_000);
    const [aura] = aurasFor('1', 50_000);
    expect(formatTimeLeft(timeLeft(aura!, 50_000)!)).toBe('0:10');
    expect(formatTimeLeft(timeLeft(aura!, 53_500)!)).toBe('0:07');
    expect(timeLeft(aura!, 70_000)).toBe(0);
  });
});

describe('the aura card', () => {
  it('says the spell’s name, what it does, and the time left in the build’s sentence', () => {
    setAura('1', applied(100, { remainingMs: 65_000 }), 0);
    const [aura] = aurasFor('1', 0);
    expect(
      auraCardWords(
        aura!,
        { name: 'Sample Ward', text: 'Wards the sample.', timeLeft: 'Sample left: %s' },
        5_000,
      ),
    ).toEqual({ title: 'Sample Ward', body: 'Wards the sample.', time: 'Sample left: 1:00' });
  });

  it('writes the bare figure where there is no sentence to put it in', () => {
    setAura('1', applied(100, { remainingMs: 9_000 }), 0);
    const words = auraCardWords(aurasFor('1', 0)[0]!, { name: 'A', text: '' }, 0);
    expect(words.time).toBe('0:09');
  });

  it('has no time line for an aura that lasts until taken off', () => {
    setAura('1', applied(100, { remainingMs: 0, durationMs: 0 }), 0);
    const words = auraCardWords(aurasFor('1', 0)[0]!, { name: 'A', text: 'B', timeLeft: '%s' }, 0);
    expect(words.time).toBeNull();
  });

  it('opens one card at a time, and a second press on the same aura puts it away', () => {
    toggleAuraCard({ unitKey: '1', spellId: 100, at: { x: 1, y: 2 } });
    toggleAuraCard({ unitKey: '1', spellId: 300, at: { x: 3, y: 4 } });
    expect(auraCard.value).toEqual({ unitKey: '1', spellId: 300, at: { x: 3, y: 4 } });
    toggleAuraCard({ unitKey: '1', spellId: 300, at: { x: 3, y: 4 } });
    expect(auraCard.value).toBeNull();
  });
});

describe('what a unit already wears when it is first shown', () => {
  it('shows each aura with the time the server said was left, counted from now', () => {
    setAurasOf(
      '1',
      [applied(100, { remainingMs: 4_000, durationMs: 30_000 }), applied(300)],
      1_000,
    );
    const list = aurasFor('1', 1_000);
    expect(list.map(one => one.spellId)).toEqual([100, 300]);
    expect(timeLeft(list[0]!, 1_000)).toBe(4_000);
    expect(list[0]!.durationMs).toBe(30_000);
    expect(aurasFor('1', 5_000).map(one => one.spellId)).toEqual([300]);
  });

  it('replaces whatever the unit was carrying, and leaves every other unit alone', () => {
    setAura('1', applied(100), 0);
    setAura('2', applied(200), 0);
    setAurasOf('1', [applied(300)], 0);
    expect(aurasFor('1', 0).map(one => one.spellId)).toEqual([300]);
    expect(aurasFor('2', 0).map(one => one.spellId)).toEqual([200]);
  });

  it('clears the unit when it wears nothing', () => {
    setAura('1', applied(100), 0);
    setAurasOf('1', [], 0);
    expect(aurasFor('1', 0)).toEqual([]);
  });

  it('stands buffs before debuffs, and holds one of each spell', () => {
    setAurasOf(
      '1',
      [applied(100, { harmful: true }), applied(300), applied(100, { harmful: true, stacks: 2 })],
      0,
    );
    const list = aurasFor('1', 0);
    expect(list.map(one => one.spellId)).toEqual([300, 100]);
    expect(list[1]!.stacks).toBe(2);
  });

  it('keeps one that lasts until taken off without a clock', () => {
    setAurasOf('1', [applied(100, { remainingMs: 0, durationMs: 0 })], 0);
    expect(timeLeft(aurasFor('1', 999_999)[0]!)).toBeNull();
  });
});

describe('an aura as the wire gives it', () => {
  it('reads its time left, its whole run and whether it harms, as one stack', () => {
    expect(
      appliedFrom({
        casterId: 7,
        spellId: 100,
        remaining: 6_500,
        maxDuration: 10_000,
        harmful: 1,
      }),
    ).toEqual({
      spellId: 100,
      casterId: 7,
      harmful: true,
      stacks: 1,
      remainingMs: 6_500,
      durationMs: 10_000,
    });
  });
});
