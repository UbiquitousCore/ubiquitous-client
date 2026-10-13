/**
 * A refused cast must say something a player can read, and name a reason it
 * does not know so that reason can be given words.
 */

import { describe, expect, it } from 'vitest';

import { spellErrorMessage } from '../src/net/spellErrors';

describe('spellErrorMessage', () => {
  it('gives each reason the server names its own sentence', () => {
    expect(spellErrorMessage('onCooldown')).toBe('That spell is not ready yet.');
    expect(spellErrorMessage('missingEquipment')).toContain('weapon');
  });

  it('names a reason it does not know', () => {
    expect(spellErrorMessage('somethingNew')).toMatch(/^The spell could not be cast/);
    expect(spellErrorMessage('somethingNew')).toContain('somethingNew');
  });
});
