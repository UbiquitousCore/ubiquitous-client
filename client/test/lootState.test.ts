/**
 * Which bodies are worth opening.
 *
 * Getting this wrong leaves no trace of any kind: no error, no warning, just
 * a corpse that sits there with no glow and cannot be looted. The server has
 * two values that mean "has something in it", sent by two different paths,
 * and matching only one of them misses the one that answers the player who
 * did the killing.
 *
 * So the rule is negative, and these tests stop it quietly becoming positive
 * the next time somebody tidies it.
 */

import { describe, expect, it } from 'vitest';

import { worthOpening } from '../src/gameplay/loot';

describe('a body worth opening', () => {
  it('is one the server calls lootable', () => {
    expect(worthOpening('lootable')).toBe(true);
  });

  it('is any state this client has no name for', () => {
    /*
     * A server may send a value this client has no name for. Treating it as
     * openable is the safe direction: an openable body that turns out to be
     * empty closes its own window again, while an inert body that had loot
     * cannot be looted at all.
     */
    expect(worthOpening('unknown')).toBe(true);
  });

  it('is not one that has been emptied', () => {
    expect(worthOpening('emptied')).toBe(false);
  });

  it('is not one that has had nothing put in it', () => {
    expect(worthOpening('none')).toBe(false);
  });
});
