/** The hero's talents as the server last said; `talentStanding` mirrors its rules only for display and staging. */
import { signal } from '@preact/signals';

import type { TalentRow } from '../assets/types';
import type { TalentRank } from '../net/GameConnection';
import { talentPlaces } from './SpellBook';

/** Points left to spend, or null until the server has said. */
export const talentPoints = signal<number | null>(null);

/** Bought ranks by talent id. A place with none bought is absent. */
export const talentRanks = signal<ReadonlyMap<number, number>>(new Map());

export function applyTalentState(points: number, ranks: readonly TalentRank[]): void {
  talentPoints.value = Math.max(0, points);
  talentRanks.value = new Map(ranks.map(row => [row.talentId, row.rank]));
}

/**
 * Whether one more rank of a place can be bought, and if not, why — in the
 * server's own refusal codes, so a screen and a refusal say the same thing.
 */
export type TalentStanding = 'open' | 'maxRank' | 'noPoints' | 'tierLocked' | 'prerequisite';

/**
 * Where a place stands: every rank bought, no point to spend, too few points
 * in its tree to reach its tier, the place it follows short of full rank, or
 * open. `tree` is every place on the same tree.
 */
export function talentStanding(
  place: TalentRow,
  tree: readonly TalentRow[],
  ranks: ReadonlyMap<number, number>,
  points: number,
): TalentStanding {
  const rank = ranks.get(place.id) ?? 0;
  if (rank >= place.ranks) return 'maxRank';
  if (points <= 0) return 'noPoints';
  const spent = tree.reduce((sum, other) => sum + (ranks.get(other.id) ?? 0), 0);
  if (spent < place.requires) return 'tierLocked';
  if (place.after) {
    const before = tree.find(other => other.id === place.after);
    if (!before || (ranks.get(before.id) ?? 0) < before.ranks) return 'prerequisite';
  }
  return 'open';
}

/**
 * Points the player has put on places but not yet sent, by talent id.
 *
 * Staging is this client's: the server hears of a point only once the
 * player confirms, one learn a point.
 */
export const talentStaged = signal<ReadonlyMap<number, number>>(new Map());

/** Points left to spend once the staged ones are counted. */
export function pointsToSpend(): number {
  let staged = 0;
  for (const count of talentStaged.value.values()) staged += count;
  return Math.max(0, (talentPoints.value ?? 0) - staged);
}

/** Learned ranks with the staged points added on. */
export function withStaged(
  ranks: ReadonlyMap<number, number>,
  staged: ReadonlyMap<number, number>,
): Map<number, number> {
  const both = new Map(ranks);
  for (const [id, count] of staged) both.set(id, (both.get(id) ?? 0) + count);
  return both;
}

/** One talent id per staged point in a learnable order (lowest open tier first), or null if none exists. */
export function learnOrder(
  places: readonly TalentRow[],
  ranks: ReadonlyMap<number, number>,
  staged: ReadonlyMap<number, number>,
  points: number,
): number[] | null {
  const now = new Map(ranks);
  const left = new Map([...staged].filter(([, count]) => count > 0));
  const order: number[] = [];
  const ahead = places
    .filter(place => left.has(place.id))
    .sort((a, b) => a.tier - b.tier || a.column - b.column);
  let spare = points;
  while (left.size) {
    const next = ahead.find(
      place =>
        left.has(place.id) &&
        talentStanding(
          place,
          places.filter(other => other.classId === place.classId),
          now,
          spare,
        ) === 'open',
    );
    if (!next) return null;
    order.push(next.id);
    now.set(next.id, (now.get(next.id) ?? 0) + 1);
    spare -= 1;
    const remaining = (left.get(next.id) ?? 0) - 1;
    if (remaining > 0) left.set(next.id, remaining);
    else left.delete(next.id);
  }
  return order;
}

/**
 * The staging with one more, or one fewer, point on a place — or null
 * where that staging could not all be learned. A place never gives back
 * more than is staged on it.
 */
export function restaged(
  places: readonly TalentRow[],
  ranks: ReadonlyMap<number, number>,
  staged: ReadonlyMap<number, number>,
  points: number,
  talentId: number,
  change: 1 | -1,
): ReadonlyMap<number, number> | null {
  const next = new Map(staged);
  const count = (next.get(talentId) ?? 0) + change;
  if (count < 0) return null;
  if (count === 0) next.delete(talentId);
  else next.set(talentId, count);
  return learnOrder(places, ranks, next, points) ? next : null;
}

function holds(talentId: number, change: 1 | -1): ReadonlyMap<number, number> | null {
  return restaged(
    talentPlaces.value,
    talentRanks.value,
    talentStaged.value,
    talentPoints.value ?? 0,
    talentId,
    change,
  );
}

/** Stage one more point on a place, where it can take one. */
export function stageTalent(talentId: number): boolean {
  const next = holds(talentId, 1);
  if (next) talentStaged.value = next;
  return next !== null;
}

/**
 * Take back one staged point. Never a learned rank, and never one a
 * later staged point stands on.
 */
export function unstageTalent(talentId: number): boolean {
  const next = holds(talentId, -1);
  if (next) talentStaged.value = next;
  return next !== null;
}

/** Whether a place can take one more staged point, or give one back. */
export function canStage(talentId: number): boolean {
  return holds(talentId, 1) !== null;
}

export function canUnstage(talentId: number): boolean {
  return holds(talentId, -1) !== null;
}

export interface TalentActions {
  learn(talentId: number): void;
}

let actions: TalentActions | null = null;

/** `Game` installs the sender; with none installed a press does nothing. */
export function setTalentActions(next: TalentActions | null): void {
  actions = next;
}

/**
 * Send every staged point, one learn a point in an order the server
 * accepts, and clear the staging. The server answers each with the
 * character's talents as they then stand.
 */
export function confirmTalents(): void {
  const order =
    learnOrder(
      talentPlaces.value,
      talentRanks.value,
      talentStaged.value,
      talentPoints.value ?? 0,
    ) ?? [];
  talentStaged.value = new Map();
  for (const talentId of order) actions?.learn(talentId);
}
