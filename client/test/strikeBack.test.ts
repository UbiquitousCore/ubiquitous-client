/**
 * What being struck does to the hero's target and swing.
 *
 * A harmful blow from a living hostile body, on a living hero, is answered by
 * where the hero's attention already is: with no target, or a fallen one, the
 * attacker is picked and swung at; with the attacker already picked, it is
 * swung at; with anyone else alive picked, nothing changes. A swing already
 * running is never started again.
 */

import { describe, expect, it } from 'vitest';
import { replyToBlow, type Struck } from '../src/gameplay/strikeBack';

const base: Struck = {
  heroAlive: true,
  harmful: true,
  attackerAlive: true,
  attackerHostile: true,
  target: 'none',
  swinging: false,
  casting: false,
};
const reply = (change: Partial<Struck>) => replyToBlow({ ...base, ...change });

describe('where the hero is looking decides', () => {
  it('picks and swings at the attacker when nothing is picked', () => {
    expect(reply({ target: 'none' })).toEqual({ pick: true, swing: true });
  });

  it('picks and swings at the attacker when the picked body has fallen', () => {
    expect(reply({ target: 'fallen' })).toEqual({ pick: true, swing: true });
  });

  it('swings at the attacker already picked, without picking again', () => {
    expect(reply({ target: 'attacker' })).toEqual({ pick: false, swing: true });
  });

  it('leaves the player’s own pick of someone else alone', () => {
    expect(reply({ target: 'other' })).toEqual({ pick: false, swing: false });
  });
});

describe('a swing already running', () => {
  it('is not started again, though the pick still follows', () => {
    expect(reply({ target: 'none', swinging: true })).toEqual({ pick: true, swing: false });
    expect(reply({ target: 'attacker', swinging: true })).toEqual({ pick: false, swing: false });
  });
});

describe('blows that change nothing', () => {
  const nothing = { pick: false, swing: false };

  it('on a hero who is down', () => {
    expect(reply({ heroAlive: false })).toEqual(nothing);
  });

  it('when the blow heals', () => {
    expect(reply({ harmful: false })).toEqual(nothing);
  });

  it('from a body that is not hostile', () => {
    expect(reply({ attackerHostile: false })).toEqual(nothing);
  });

  it('from a body that has already fallen', () => {
    expect(reply({ attackerAlive: false })).toEqual(nothing);
  });
});

describe('a hero in the middle of a cast', () => {
  it('picks the attacker but does not swing, so the cast is not broken into', () => {
    expect(reply({ target: 'none', casting: true })).toEqual({ pick: true, swing: false });
    expect(reply({ target: 'attacker', casting: true })).toEqual({ pick: false, swing: false });
  });
});
