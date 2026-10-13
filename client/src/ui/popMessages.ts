/** Floating reward lines over the hero: a queue, one line at a time with a
 * gap between them and a longer hold for a level-up, not a pile. Quest
 * rewards arrive as generic got-item / got-money / got-XP messages, not a
 * summary panel. Every timing here is this client's own choice. */

import { signal } from '@preact/signals';

import { formatMoney } from './money';
import { LINES, say } from './gameLines';

/** How long the queue waits between messages. */
export const POP_INTERVAL_MS = 450;

/** A level-up holds the queue longer than anything else. Own choice. */
export const POP_INTERVAL_LEVEL_UP_MS = 1300;

/** How long one line over the hero's head lasts. */
export const POP_LIFETIME_MS = 1400;

/** The level-up banner is not in a hurry. */
export const POP_LIFETIME_LEVEL_UP_MS = 4000;

/** How far a line drifts up over its life, in pixels. */
export const POP_RISE = 48;

/** A new line swells a little as it appears, and how fast. */
export const POP_GROW_TO = 1.15;
export const POP_GROW_MS = 150;

/** `hero` follows the nameplate; `banner` is the fixed centre slot a level-up takes. */
export type PopMessagePlace = 'hero' | 'banner';

export type PopMessageKind = 'exp' | 'gold' | 'item' | 'levelUp';

export interface RewardLine {
  key: number;
  kind: PopMessageKind;
  place: PopMessagePlace;
  text: string;
  /** How long it has been up, in ms. */
  age: number;
  /** Screen position, written each frame by the game and mutated in place. */
  x: number;
  y: number;
  /** False until the hero has been projected at least once. */
  onScreen: boolean;
}

/** What is on screen. Replaced only when the set changes. */
export const popMessages = signal<RewardLine[]>([]);

/** A line still waiting for its turn. */
interface Waiting {
  kind: PopMessageKind;
  place: PopMessagePlace;
  text: string;
}

/**
 * How urgent each kind is, and how long the stage stays closed after it.
 * The most urgent waiting line goes next; among equals, the one that arrived
 * first.
 */
const PACING: Record<PopMessageKind, { urgency: number; gapMs: number }> = {
  exp: { urgency: 0, gapMs: POP_INTERVAL_MS },
  gold: { urgency: 0, gapMs: POP_INTERVAL_MS },
  item: { urgency: 0, gapMs: POP_INTERVAL_MS },
  levelUp: { urgency: 1, gapMs: POP_INTERVAL_LEVEL_UP_MS },
};

/** In arrival order. */
let waiting: Waiting[] = [];
/** Time since the queue was last cleared, summed from the frames it saw. */
let clockMs = 0;
/** The earliest clock reading at which the next line may appear. */
let stageOpensAtMs = 0;
let nextKey = 1;

function enqueue(kind: PopMessageKind, place: PopMessagePlace, text: string): void {
  waiting.push({ kind, place, text });
}

/** The line that should go on stage next, or undefined when nothing waits. */
function nextInLine(): Waiting | undefined {
  let best: Waiting | undefined;
  for (const candidate of waiting) {
    if (!best || PACING[candidate.kind].urgency > PACING[best.kind].urgency) best = candidate;
  }
  return best;
}

/**
 * `Exp: +250`.
 *
 * The shipped caption carries its own colon; the format string adds only
 * the plus.
 */
export function popExpGained(amount: number): void {
  if (amount <= 0) return;
  enqueue('exp', 'hero', `Exp: +${amount}`);
}

/**
 * The level-up banner: a cheer, then the new level on a line of its own.
 * It outranks every gain still waiting, because a level-up is the thing a
 * player most wants to be told.
 */
export function popLevelUp(level: number): void {
  enqueue('levelUp', 'banner', `${say(LINES.congratulations)}\nLevel ${level} reached.`);
}

/**
 * `+3 gold 25 silver`, or `-…` for money that left.
 *
 * Only denominations that are not zero are spelled out — which is what
 * `formatMoney` already does for every other place this client shows coin.
 */
export function popMoneyGained(copper: number): void {
  if (copper === 0) return;
  const sign = copper < 0 ? '-' : '+';
  enqueue('gold', 'hero', `${sign}${formatMoney(Math.abs(copper))}`);
}

/** `+ [Sample Cape] x 2`: the name in brackets, then the count where there is more than one. */
export function popItemGained(name: string, count: number): void {
  const suffix = count > 1 ? ` x ${count}` : '';
  enqueue('item', 'hero', `+ [${name}]${suffix}`);
}

/** Advance by `dtMs`, releasing at most one line per call after a fixed gap, so a late frame does not bunch them. */
export function tickPopMessages(dtMs: number): void {
  clockMs += dtMs;
  const before = popMessages.value;
  for (const line of before) line.age += dtMs;
  let after = before.filter(line => line.age < lifetimeOf(line));

  const chosen = clockMs >= stageOpensAtMs ? nextInLine() : undefined;
  if (chosen) {
    waiting = waiting.filter(entry => entry !== chosen);
    stageOpensAtMs = clockMs + PACING[chosen.kind].gapMs;
    const { kind, place, text } = chosen;
    after = [...after, { key: nextKey++, kind, place, text, age: 0, x: 0, y: 0, onScreen: false }];
  }

  if (after.length !== before.length || chosen) popMessages.value = after;
}

export function lifetimeOf(message: Pick<RewardLine, 'kind'>): number {
  return message.kind === 'levelUp' ? POP_LIFETIME_LEVEL_UP_MS : POP_LIFETIME_MS;
}

/** How far this line has drifted up from its anchor. The banner does not drift. */
export function popRise(message: Pick<RewardLine, 'kind' | 'age'>): number {
  if (message.kind === 'levelUp') return 0;
  return POP_RISE * Math.min(1, message.age / POP_LIFETIME_MS);
}

/** How much bigger than its base size a line of this age is drawn. */
export function popScale(message: Pick<RewardLine, 'age'>): number {
  return 1 + (POP_GROW_TO - 1) * Math.min(1, message.age / POP_GROW_MS);
}

/** How solid it is drawn, from one down to nothing. */
export function popFade(message: Pick<RewardLine, 'kind' | 'age'>): number {
  const life = lifetimeOf(message);
  return Math.max(0, 1 - message.age / life);
}

/** Forget everything, queued and shown — on leaving the world. */
export function clearPopMessages(): void {
  waiting = [];
  clockMs = 0;
  stageOpensAtMs = 0;
  if (popMessages.value.length > 0) popMessages.value = [];
}
