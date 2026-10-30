/** The damage log: a record in, a sentence out, for the console, `ubiquitous.combat()` and chat. */

import type { Outcome } from '../net/wireCodes';
import { isCritical, restoresHealth } from './combatResults';

/** What a blow was: a swing, a shot, or a spell. */
export type CombatEventKind = 'attack' | 'spell';

/** One blow, as the server reported it. */
export interface CombatEvent {
  kind: CombatEventKind;
  /** Who struck, and who was struck, by network id. */
  attacker: number;
  target: number;
  /** The reader's own network id, which is what "you" means below. */
  self: number;
  /** The change to the target's health; only its size is written. */
  damage: number;
  /** How it resolved, by the server's name; null for one this client does not know. */
  outcome: Outcome | null;
  /** The spell that did it, for a spell; absent for a swing. */
  spellId?: number;
  /** The target's health once it landed, where the server said. */
  finalHealth?: number;
  /** What it was immediately before, where the reader knew. */
  healthBefore?: number;
  /** The target's ceiling, which is what says whether this was a one-shot. */
  maxHealth?: number;
  /** Milliseconds since the page began, for ordering. */
  at?: number;
}

/** Names to read ids by. Anything missing is written as the id itself. */
export interface CombatNames {
  nameOf(networkId: number): string | undefined;
  spellNameOf(spellId: number): string | undefined;
}

/**
 * One blow as a line of English.
 *
 * "You" wherever the reader is one end of it, which is what makes a log
 * readable at a glance rather than a column of numbers to match up against
 * ids.
 */
export function describeCombatEvent(event: CombatEvent, names?: Partial<CombatNames>): string {
  const attacker = who(event.attacker, event.self, names, true);
  const target = who(event.target, event.self, names, false);
  // Health lost to a fall has no one behind it, so no one to name as the striker.
  if (event.outcome === 'fall') {
    const faller = who(event.target, event.self, names, true);
    const lands = event.target === event.self ? 'land' : 'lands';
    return `${faller} ${lands} hard for ${Math.abs(event.damage)}${health(event, target)}.`;
  }
  const by =
    event.spellId === undefined
      ? ''
      : ` with ${names?.spellNameOf?.(event.spellId) ?? `spell ${event.spellId}`}`;

  const missed = missWord(event.outcome);
  if (missed !== null)
    return `${attacker} ${verb(event.attacker, event.self, missed)} ${target}${by}.`;

  const stem = restoresHealth(event.outcome) ? 'heal' : 'hit';
  const amount = Math.abs(event.damage);
  const line = `${attacker} ${verb(event.attacker, event.self, stem)} ${target}${by} for ${amount}`;
  return `${line}${note(event.outcome)}${health(event, target)}.`;
}

/** A word in brackets for the outcomes a plain "hits" or "heals" does not say. */
function note(outcome: Outcome | null): string {
  if (isCritical(outcome)) return ' (critical)';
  if (outcome === 'periodicHeal') return ' (over time)';
  return '';
}

/**
 * What the blow left, said so that a one-shot is obvious: the health before
 * it where the reader knew, and the ceiling where it knew that too. "583 of
 * 1873 left" and "1873 down to 0" are very different lines, and only one of
 * them is a bug.
 */
function health(event: CombatEvent, target: string): string {
  if (event.finalHealth === undefined) return '';
  const ceiling = event.maxHealth === undefined ? '' : ` of ${event.maxHealth}`;
  return event.healthBefore === undefined
    ? `, ${target} now on ${event.finalHealth}${ceiling}`
    : `, ${target} ${event.healthBefore} to ${event.finalHealth}${ceiling}`;
}

/** Whichever of miss, dodge, parry, block or evade this was, or null for a blow that landed. */
function missWord(outcome: Outcome | null): string | null {
  switch (outcome) {
    case 'miss':
      return 'missed';
    case 'dodge':
      return 'was dodged by';
    case 'parry':
      return 'was parried by';
    case 'block':
      return 'was blocked by';
    case 'evade':
      return 'was evaded by';
    default:
      return null;
  }
}

function who(
  id: number,
  self: number,
  names: Partial<CombatNames> | undefined,
  capital: boolean,
): string {
  if (id === self && self !== 0) return capital ? 'You' : 'you';
  return names?.nameOf?.(id) ?? `#${id}`;
}

/** English needs "you hit" and "it hits", so the verb follows who is speaking. */
function verb(attacker: number, self: number, stem: string): string {
  if (attacker === self && self !== 0) return stem;
  if (stem === 'hit') return 'hits';
  if (stem === 'heal') return 'heals';
  return stem;
}
