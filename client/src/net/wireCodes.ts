import type { Lootable } from '../world/World';

/**
 * The server's named codes, read off the wire. The names are listed in the
 * ubiquitous-server repository's `docs/architecture/wire-codes.md`.
 */

/** How a swing, a shot or a spell resolved. */
export const OUTCOMES = [
  'hit',
  'miss',
  'dodge',
  'parry',
  'block',
  'critical',
  'evade',
  'heal',
  'periodicHeal',
] as const;

export type Outcome = (typeof OUTCOMES)[number];

/** The outcome the server named, or null when it named none this client knows. */
export function readOutcome(value: unknown): Outcome | null {
  return typeof value === 'string' && (OUTCOMES as readonly string[]).includes(value)
    ? (value as Outcome)
    : null;
}

/** Which hand struck a melee blow. */
export const HANDS = ['main', 'off'] as const;

export type Hand = (typeof HANDS)[number];

/** The hand the server named; the main hand when it named none this client knows. */
export function readHand(value: unknown): Hand {
  return value === 'off' ? 'off' : 'main';
}

/** What became of a shared quest, for one party member. */
export const QUEST_SHARE_RESULTS = [
  'alreadyHas',
  'notEligible',
  'outOfReach',
  'accepted',
  'declined',
] as const;

export type QuestShareResult = (typeof QUEST_SHARE_RESULTS)[number];

/** The result the server named, or null for one this client does not know. */
export function readQuestShareResult(value: unknown): QuestShareResult | null {
  return QUEST_SHARE_RESULTS.find(result => result === value) ?? null;
}

/** What became of a summon, as the server names it. */
export const SUMMON_RESULTS = ['asked', 'accepted', 'refused', 'failed', 'levelTooLow'] as const;

export type SummonResult = (typeof SUMMON_RESULTS)[number];

/** The result the server named, or null for one this client does not know. */
export function readSummonResult(value: unknown): SummonResult | null {
  return SUMMON_RESULTS.find(result => result === value) ?? null;
}

/** What picking a conversation choice did, as the server names it. */
export const CHOICE_RESULTS = [
  'teleported',
  'notEnoughMoney',
  'nothingHappens',
  'started',
] as const;

export type ChoiceResult = (typeof CHOICE_RESULTS)[number];

/**
 * The result the server named. A name this client does not have reads as
 * `nothingHappens`, which is what the player sees of a choice it cannot follow.
 */
export function readChoiceResult(value: unknown): ChoiceResult {
  return CHOICE_RESULTS.find(result => result === value) ?? 'nothingHappens';
}

/** The loot states the server names. */
export const LOOTABLE_CODES = ['lootable', 'emptied'] as const;

/**
 * A corpse's loot state as the server named it: `none` when it named none,
 * `unknown` for a name this client does not have.
 */
export function readLootable(value: unknown): Lootable {
  if (typeof value !== 'string') return 'none';
  return LOOTABLE_CODES.find(state => state === value) ?? 'unknown';
}
