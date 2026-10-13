/**
 * What colour a unit is, and in what order that is decided.
 *
 * A mob in combat with you turns red. Were the colour to come from the two
 * factions alone, anything involving a neutral faction would fall through to
 * yellow — so a creature you had provoked would go on reading as merely
 * attackable while it was hitting you.
 *
 * The order is the point of these tests. Dead outranks a grudge, a grudge
 * outranks the factions, and a grudge outranks not knowing the factions at
 * all.
 */

import { describe, expect, it } from 'vitest';

import {
  NEUTRAL_FACTION,
  awaitsHandIn,
  blowStartsFight,
  relationOf,
} from '../src/gameplay/relationship';
import type { RelationSubject } from '../src/gameplay/relationship';

/** The player's own side, for the cases where it matters. */
const MINE = 5;
const THEIRS = 9;

function creature(fields: Partial<RelationSubject> = {}): RelationSubject {
  return { kind: 'creature', maxHealth: 100, health: 100, ...fields };
}

describe('a mob fighting you', () => {
  it('is red, even though its faction alone would say otherwise', () => {
    // A neutral-factioned creature: yellow until it takes a swing at you.
    const wolf = creature({ faction: NEUTRAL_FACTION });
    expect(relationOf(wolf, MINE)).toBe('bystander');
    expect(relationOf({ ...wolf, fightingMe: true }, MINE)).toBe('enemy');
  });

  it('is red even before the server has said whose side it is on', () => {
    // Faction unknown is normally the reason to claim nothing. Something
    // hitting you is not a claim that needs a faction behind it.
    expect(relationOf(creature({ fightingMe: true }), MINE)).toBe('enemy');
  });

  it('goes back to what it was when the fight ends', () => {
    const wolf = creature({ faction: NEUTRAL_FACTION, fightingMe: true });
    expect(relationOf({ ...wolf, fightingMe: false }, MINE)).toBe('bystander');
  });

  it('is red for a player of your own faction who is fighting you', () => {
    const duellist: RelationSubject = { kind: 'player', faction: MINE, fightingMe: true };
    expect(relationOf(duellist, MINE)).toBe('enemy');
  });
});

describe('what still outranks a grudge', () => {
  it('death: a corpse is grey, not red', () => {
    // The one that would be visible immediately if the order were wrong —
    // everything you kill would stay red instead of going grey.
    const killed = creature({ faction: THEIRS, fightingMe: true, dead: true });
    expect(relationOf(killed, MINE)).toBe('corpse');
  });

  it('death by health, before the message that says so has landed', () => {
    const killed = creature({ health: 0, faction: THEIRS, fightingMe: true });
    expect(relationOf(killed, MINE)).toBe('corpse');
  });

  it('being a fixed object rather than a unit', () => {
    expect(relationOf({ kind: 'static', fightingMe: true }, MINE)).toBe('ally');
    expect(relationOf({ kind: 'scenery' }, MINE)).toBe('ally');
  });
});

describe('the rule that was already there', () => {
  it('same faction is green', () => {
    expect(relationOf(creature({ faction: MINE }), MINE)).toBe('ally');
  });

  it('two different non-neutral factions are red without any fight', () => {
    expect(relationOf(creature({ faction: THEIRS }), MINE)).toBe('enemy');
  });

  it('anything involving a neutral faction is yellow', () => {
    expect(relationOf(creature({ faction: NEUTRAL_FACTION }), MINE)).toBe('bystander');
    expect(relationOf(creature({ faction: THEIRS }), NEUTRAL_FACTION)).toBe('bystander');
  });

  it('claims nothing when a faction is unknown and no blow has passed', () => {
    expect(relationOf(creature(), undefined)).toBe('bystander');
    expect(relationOf({ kind: 'player' }, MINE)).toBe('ally');
  });
});

describe('a duel opponent', () => {
  it('is fair game for the duel, whatever side they are on', () => {
    const friend = { kind: 'player', faction: MINE };
    expect(relationOf(friend, MINE)).toBe('ally');
    expect(relationOf({ ...friend, duellingMe: true }, MINE)).toBe('enemy');
  });

  it('is still only a corpse once dead', () => {
    expect(relationOf({ kind: 'player', faction: MINE, duellingMe: true, dead: true }, MINE)).toBe(
      'corpse',
    );
  });
});

describe('a quest giver with a quest to hand in', () => {
  it('takes the quest colour on the finished mark', () => {
    expect(relationOf(creature({ faction: MINE, questMark: 'finished' }), MINE)).toBe('questUnit');
  });

  it('keeps its side on every other mark', () => {
    for (const mark of ['none', 'available', 'incomplete', undefined]) {
      expect(relationOf(creature({ faction: MINE, questMark: mark }), MINE), String(mark)).toBe(
        'ally',
      );
      expect(awaitsHandIn(mark), String(mark)).toBe(false);
    }
  });

  it('outranks its faction, neutral or hostile, and not knowing it', () => {
    const handIn = { questMark: 'finished' };
    expect(relationOf(creature({ ...handIn, faction: NEUTRAL_FACTION }), MINE)).toBe('questUnit');
    expect(relationOf(creature({ ...handIn, faction: THEIRS }), MINE)).toBe('questUnit');
    expect(relationOf(creature(handIn), undefined)).toBe('questUnit');
  });

  it('is outranked by death and by a fight', () => {
    const handIn = { faction: MINE, questMark: 'finished' };
    expect(relationOf(creature({ ...handIn, dead: true }), MINE)).toBe('corpse');
    expect(relationOf(creature({ ...handIn, fightingMe: true }), MINE)).toBe('enemy');
  });

  it('is a creature: a player or a placed object never wears the quest colour', () => {
    expect(relationOf({ kind: 'player', faction: MINE, questMark: 'finished' }, MINE)).toBe('ally');
    expect(relationOf({ kind: 'static', questMark: 'finished' }, MINE)).toBe('ally');
  });
});

describe('which blows start a fight', () => {
  const FIGHTS_BACK = true;
  const NEVER_FIGHTS_BACK = false;

  it('a heal between two players starts none, in either direction', () => {
    for (const outcome of ['heal', 'periodicHeal'] as const) {
      expect(blowStartsFight(outcome, true, 'ally', FIGHTS_BACK)).toBe(false);
      expect(blowStartsFight(outcome, false, 'ally', FIGHTS_BACK)).toBe(false);
    }
  });

  it('a heal on a neutral body leaves it neutral', () => {
    expect(blowStartsFight('heal', true, 'bystander', FIGHTS_BACK)).toBe(false);
    expect(blowStartsFight('periodicHeal', true, 'bystander', FIGHTS_BACK)).toBe(false);
  });

  it('a blow that lands, misses or is turned aside does', () => {
    for (const outcome of ['hit', 'critical', 'miss', 'dodge', 'parry', 'block'] as const) {
      expect(blowStartsFight(outcome, true, 'ally', FIGHTS_BACK)).toBe(true);
      expect(blowStartsFight(outcome, false, 'bystander', FIGHTS_BACK)).toBe(true);
    }
  });

  it('a blow on a body walking home, which evades it, starts none', () => {
    expect(blowStartsFight('evade', true, 'enemy', FIGHTS_BACK)).toBe(false);
    expect(blowStartsFight('evade', false, 'bystander', FIGHTS_BACK)).toBe(false);
  });

  it('an outcome this client does not know still counts as a blow', () => {
    expect(blowStartsFight(null, false, 'bystander', FIGHTS_BACK)).toBe(true);
  });

  it("the player's first landed blow on a neutral body puts it in the fight", () => {
    // A spell that lands damage comes through as a hit or a critical too.
    expect(blowStartsFight('hit', true, 'bystander', FIGHTS_BACK)).toBe(true);
    expect(blowStartsFight('critical', true, 'bystander', FIGHTS_BACK)).toBe(true);
  });

  it('a blow of the player that does not land leaves a neutral body neutral', () => {
    for (const outcome of ['miss', 'dodge', 'parry', 'block', null] as const) {
      expect(blowStartsFight(outcome, true, 'bystander', FIGHTS_BACK)).toBe(false);
    }
  });

  it('a body that never fights back is never put in the fight, however it is hit', () => {
    for (const outcome of ['hit', 'critical', 'miss', null] as const) {
      expect(blowStartsFight(outcome, true, 'bystander', NEVER_FIGHTS_BACK)).toBe(false);
    }
  });

  it('a neutral body that strikes the player back is in the fight from that blow', () => {
    expect(blowStartsFight('hit', false, 'bystander', FIGHTS_BACK)).toBe(true);
  });

  it('striking a hostile or a friendly body counts, as a flagged fight needs it to', () => {
    expect(blowStartsFight('hit', true, 'enemy', FIGHTS_BACK)).toBe(true);
    expect(blowStartsFight('hit', true, 'ally', FIGHTS_BACK)).toBe(true);
  });
});
