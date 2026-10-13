/**
 * Clicking a corpse, and keeping its sparkle on.
 *
 * Both halves were reachable only by playing. "Clicking does nothing" is the
 * report these rules exist to answer, and the glow one is the reason a corpse
 * you can plainly see loot on sometimes had none.
 */

import { describe, expect, it } from 'vitest';

import { decideLoot, LootGlow, worthOpening } from '../src/gameplay/loot';
import type { LootTarget } from '../src/gameplay/loot';

const REACH = 10;

/** Asserts the click was refused, and narrows to the refusal. */
function refusal(decision: ReturnType<typeof decideLoot>) {
  if (decision.open) throw new Error('expected the click to be refused');
  return decision;
}

function target(over: Partial<LootTarget> = {}): LootTarget {
  return { exists: true, isOwn: false, isDead: true, networkId: 7, distance: 1, ...over };
}

describe('whether a click opens a corpse', () => {
  it('opens anything dead and within reach', () => {
    expect(decideLoot(target(), REACH)).toEqual({ open: true, networkId: 7, distance: 1 });
  });

  it('opens it without waiting for the sparkle', () => {
    // Dead is the whole test. Requiring the loot state first makes the click
    // depend on a message that may never have arrived for this body.
    expect(decideLoot(target({ distance: REACH }), REACH).open).toBe(true);
  });

  it('refuses a body the world does not hold', () => {
    expect(decideLoot(target({ exists: false }), REACH)).toEqual({
      open: false,
      why: 'no such body',
    });
  });

  it('refuses the player’s own body', () => {
    expect(refusal(decideLoot(target({ isOwn: true }), REACH)).why).toBe('own body');
  });

  it('refuses anything still alive', () => {
    const decision = decideLoot(target({ isDead: false }), REACH);
    expect(decision.open).toBe(false);
    // The id rides along so the attempt log can name what was clicked.
    expect(decision).toMatchObject({ why: 'not dead', networkId: 7 });
  });

  it('refuses a body the server has not named yet', () => {
    expect(refusal(decideLoot(target({ networkId: undefined }), REACH)).why).toBe(
      'body has no server id',
    );
  });

  it('refuses one out of reach, and says so out loud', () => {
    const decision = decideLoot(target({ distance: REACH + 1 }), REACH);

    expect(decision).toMatchObject({ open: false, why: 'too far', distance: REACH + 1 });
    // The only refusal worth telling the player about: the rest are silent.
    expect(refusal(decision).tell).toBe('Too far away to loot');
  });

  it('opens one whose distance cannot be worked out at all', () => {
    // Either end unknown: send rather than refuse, and let the server decide.
    expect(decideLoot(target({ distance: null }), REACH).open).toBe(true);
  });

  it('checks the body before the reach, so a live one never reads as too far', () => {
    expect(refusal(decideLoot(target({ isDead: false, distance: 999 }), REACH)).why).toBe(
      'not dead',
    );
  });
});

describe('which states are worth opening', () => {
  it('is anything but none and emptied', () => {
    expect(worthOpening('lootable')).toBe(true);
    expect(worthOpening('none')).toBe(false);
    expect(worthOpening('emptied')).toBe(false);
  });

  it('includes a state this client has no name for', () => {
    // Openable rather than inert: the server may use a value we have not seen.
    expect(worthOpening('unknown')).toBe(true);
  });
});

describe('keeping the glow on', () => {
  it('records a state for a body that is not resident yet', () => {
    const glow = new LootGlow();

    // Dropping the fact because the model has not arrived is what left
    // corpses with no sparkle and no way to open them.
    expect(glow.record(7, 'lootable')).toBe(true);
    expect([...glow.openable()]).toEqual([[7, 'lootable']]);
  });

  it('says a body worth opening should wear the glow, and an empty one should not', () => {
    const glow = new LootGlow();

    expect(glow.record(7, 'lootable')).toBe(true);
    expect(glow.record(8, 'emptied')).toBe(false);
  });

  it('gives the glow once, not once a frame', () => {
    const glow = new LootGlow();
    glow.record(7, 'lootable');

    expect(glow.claimGlow(7)).toBe(true);
    expect(glow.claimGlow(7)).toBe(false);
    expect(glow.claimGlow(7)).toBe(false);
  });

  it('lets a body earn its glow again after being emptied and refilled', () => {
    const glow = new LootGlow();
    glow.record(7, 'lootable');
    glow.claimGlow(7);

    glow.record(7, 'emptied');
    glow.record(7, 'lootable');

    expect(glow.claimGlow(7)).toBe(true);
  });

  it('lists only the bodies worth re-asserting', () => {
    const glow = new LootGlow();
    glow.record(7, 'lootable');
    glow.record(8, 'emptied');
    glow.record(9, 'lootable');

    expect([...glow.openable()].map(([id]) => id)).toEqual([7, 9]);
  });

  it('forgets one body without touching the rest', () => {
    const glow = new LootGlow();
    glow.record(7, 'lootable');
    glow.record(8, 'lootable');

    glow.forget(7);

    expect([...glow.openable()]).toEqual([[8, 'lootable']]);
  });

  it('forgets everything when the zone goes', () => {
    const glow = new LootGlow();
    glow.record(7, 'lootable');

    glow.clear();

    expect([...glow.openable()]).toEqual([]);
    // And a body of the same id in the new zone starts owed its glow again.
    glow.record(7, 'lootable');
    expect(glow.claimGlow(7)).toBe(true);
  });
});
