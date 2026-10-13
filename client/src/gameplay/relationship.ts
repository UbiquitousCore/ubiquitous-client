/**
 * How the hero relates to a unit (drives its colour): dead > fixed object >
 * fighting me or duelling me > a quest waiting to be handed in > unknown >
 * same faction > neither neutral > otherwise. Both kinds of fight outrank
 * factions and the quest mark; the quest mark outranks factions.
 */

import type { Outcome } from '../net/wireCodes';
import type { Relation } from '../renderer/TargetRing';
import { lands, restoresHealth } from './combatResults';

/**
 * `NEUTRAL_FACTION`. Neither side of a pair involving it counts as
 * hostile, however different the two factions are.
 */
export const NEUTRAL_FACTION = 2;

/** What the rule needs to know about the unit being judged. */
export interface RelationSubject {
  /** Any world kind; scenery and effects fall through to the fixed-object answer. */
  kind: string;
  /** The server's word for it, which outranks a health of zero. */
  dead?: boolean;
  health?: number;
  maxHealth?: number;
  faction?: number;
  /** Whether this body and the player are trading blows right now. */
  fightingMe?: boolean;
  /** Whether this body is the player's opponent in a duel under way. */
  duellingMe?: boolean;
  /** The server's quest mark for this body and this player, if it has sent one. */
  questMark?: string;
}

/**
 * Whether a quest mark says the player has a quest to hand in here.
 */
export function awaitsHandIn(questMark: string | undefined): boolean {
  return questMark === 'finished';
}

/** Dead by message or by zero health, whichever arrives first. */
export function isDead(subject: RelationSubject): boolean {
  if (subject.dead === true) return true;
  return subject.maxHealth !== undefined && subject.maxHealth > 0 && subject.health === 0;
}

export function relationOf(subject: RelationSubject, playerFaction: number | undefined): Relation {
  // A corpse is grey whatever else is true of it, a grudge included: the
  // fight with it is over by definition.
  if (isDead(subject)) return 'corpse';
  if (subject.kind !== 'creature' && subject.kind !== 'player') return 'ally';

  // Angry at me outranks the factions, and outranks not knowing them: a body
  // that is hitting the player is hostile even if the server has not said
  // whose side it is on.
  if (subject.fightingMe === true) return 'enemy';
  // A duel makes a friend fair game, for as long as it lasts and for
  // nobody but the two of them.
  if (subject.duellingMe === true) return 'enemy';

  // A creature with a quest to hand in wears the quest colour whatever side
  // it is on; a fight with it still reads as a fight.
  if (subject.kind === 'creature' && awaitsHandIn(subject.questMark)) return 'questUnit';

  const theirs = subject.faction;
  // Nothing said: the server has not described this unit's faction, so there
  // is no relationship to claim. Neutral is the middle.
  if (theirs === undefined || playerFaction === undefined) {
    return subject.kind === 'creature' ? 'bystander' : 'ally';
  }
  if (theirs === playerFaction) return 'ally';
  const hostile = playerFaction !== NEUTRAL_FACTION && theirs !== NEUTRAL_FACTION;
  return hostile ? 'enemy' : 'bystander';
}
/**
 * Whether a blow starts a fight with the player. Heals and evades never do;
 * a never-fights-back body never joins; a neutral body joins at the first
 * landed blow either way, a miss leaves it neutral.
 * @param struckByPlayer whether the player dealt it.
 * @param standing the player's standing with the body, fight aside.
 * @param fightsBack false for a training dummy.
 */
export function blowStartsFight(
  outcome: Outcome | null,
  struckByPlayer: boolean,
  standing: Relation,
  fightsBack: boolean,
): boolean {
  if (restoresHealth(outcome) || outcome === 'evade') return false;
  if (!fightsBack) return false;
  if (struckByPlayer && standing === 'bystander') return lands(outcome);
  return true;
}
