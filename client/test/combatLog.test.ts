/**
 * The damage log's sentences: a record in, a line out, so the console and
 * the chat window say the same thing. The outcome comes off the wire by the
 * server's own name, so every name it sends is fed through here as the
 * connection reads it.
 */

import { describe, expect, it } from 'vitest';

import { describeCombatEvent } from '../src/gameplay/combatLog';
import type { CombatEvent } from '../src/gameplay/combatLog';
import { OUTCOMES, readOutcome } from '../src/net/wireCodes';

const SELF = 7;
const FOE = 9;
const names = {
  nameOf: (id: number) => (id === FOE ? 'Sample Brute' : undefined),
  spellNameOf: (id: number) => (id === 12 ? 'Sample Strike' : undefined),
};

function blow(fields: Partial<CombatEvent>): CombatEvent {
  return {
    kind: 'attack',
    attacker: FOE,
    target: SELF,
    self: SELF,
    damage: 0,
    outcome: 'hit',
    ...fields,
  };
}

describe('every outcome the server names', () => {
  const lines: Record<(typeof OUTCOMES)[number], string> = {
    hit: 'Sample Brute hits you for 40.',
    critical: 'Sample Brute hits you for 40 (critical).',
    miss: 'Sample Brute missed you.',
    dodge: 'Sample Brute was dodged by you.',
    parry: 'Sample Brute was parried by you.',
    block: 'Sample Brute was blocked by you.',
    evade: 'Sample Brute was evaded by you.',
    heal: 'Sample Brute heals you for 40.',
    periodicHeal: 'Sample Brute heals you for 40 (over time).',
    fall: 'You land hard for 40.',
  };

  it.each(OUTCOMES.map(name => [name]))('reads "%s" off the wire and says it', name => {
    const outcome = readOutcome(name);
    expect(outcome).toBe(name);
    expect(describeCombatEvent(blow({ damage: 40, outcome }), names)).toBe(lines[name]);
  });

  it('covers every outcome the wire can carry', () => {
    expect(Object.keys(lines).sort()).toEqual([...OUTCOMES].sort());
  });

  it('writes an outcome it does not know as a plain blow', () => {
    const outcome = readOutcome('somethingNew');
    expect(outcome).toBeNull();
    expect(describeCombatEvent(blow({ damage: 5, outcome }), names)).toBe(
      'Sample Brute hits you for 5.',
    );
  });
});

describe('one blow as a line', () => {
  it('says who, with what, for how much, and what it left', () => {
    const line = describeCombatEvent(
      blow({ kind: 'spell', damage: 340, spellId: 12, finalHealth: 1500 }),
      names,
    );
    expect(line).toBe('Sample Brute hits you with Sample Strike for 340, you now on 1500.');
  });

  it('writes the size of the change, whichever sign it carries', () => {
    expect(describeCombatEvent(blow({ damage: -57 }), names)).toBe('Sample Brute hits you for 57.');
  });

  it('says the health before and the ceiling when it knows them, so a one-shot shows', () => {
    const line = describeCombatEvent(
      blow({
        kind: 'spell',
        attacker: 93,
        damage: 580,
        spellId: 28,
        finalHealth: 0,
        healthBefore: 1800,
        maxHealth: 1800,
      }),
      {},
    );
    expect(line).toBe('#93 hits you with spell 28 for 580, you 1800 to 0 of 1800.');
  });

  it('turns the sentence round when the reader struck', () => {
    const line = describeCombatEvent(
      blow({ attacker: SELF, target: FOE, damage: 57, finalHealth: 4200 }),
      names,
    );
    expect(line).toBe('You hit Sample Brute for 57, Sample Brute now on 4200.');
    expect(describeCombatEvent(blow({ attacker: SELF, target: FOE, outcome: 'miss' }), names)).toBe(
      'You missed Sample Brute.',
    );
  });

  it('falls back to the id where it has no name', () => {
    expect(
      describeCombatEvent(
        blow({ kind: 'spell', attacker: 4, target: 5, damage: 10, spellId: 99 }),
        {},
      ),
    ).toBe('#4 hits #5 with spell 99 for 10.');
  });
});
