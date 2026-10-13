/**
 * Auras per unit for the HUD icons, a second record of the wire messages
 * beside the 3D effects. Keyed by spell (visual 0 is shared); time left is
 * counted down locally from the latest `aura.applied`.
 */

import { signal } from '@preact/signals';

import type { HeldAura } from '../net/GameConnection';

export interface Aura {
  spellId: number;
  /** Who put it there, as the server addresses them. */
  casterId: number;
  harmful: boolean;
  /** How many times it is stacked; 1 for one that does not stack. */
  stacks: number;
  /** Its whole run, in ms. 0 for one that lasts until it is taken off. */
  durationMs: number;
  /** When it runs out on this client's clock, or null for one that lasts until taken off. */
  endsAt: number | null;
}

/** What one `aura.applied` says, before it is set against a clock. */
export interface AuraApplied {
  spellId: number;
  casterId: number;
  harmful: boolean;
  stacks: number;
  /** What is left of it, in ms. */
  remainingMs: number;
  /** What it started as, in ms. */
  durationMs: number;
}

/** One aura as the wire gives it — an `aura.applied`, or one a spawn lists — before it is set against a clock. */
export function appliedFrom(aura: HeldAura): AuraApplied {
  return {
    spellId: aura.spellId,
    casterId: aura.casterId,
    harmful: aura.harmful !== 0,
    stacks: 1,
    remainingMs: aura.remaining,
    durationMs: aura.maxDuration,
  };
}

/**
 * Every unit's auras, keyed by the id the server addresses the unit by
 * (`auraKey`), buffs first and then debuffs, each in the order they
 * arrived.
 */
export const auras = signal<ReadonlyMap<string, readonly Aura[]>>(new Map());

/** The clock every aura is timed against, in ms. */
export function auraClock(): number {
  return performance.now();
}

/** The key a unit's auras are held under: the id the server addresses it by. */
export function auraKey(networkId: number): string;
export function auraKey(networkId: number | undefined): string | undefined;
export function auraKey(networkId: number | undefined): string | undefined {
  return networkId === undefined ? undefined : String(networkId);
}

/**
 * Buffs before debuffs, keeping arrival order within each: the movie's
 * own pair of aura spots stands the buff before the debuff.
 */
function ordered(list: readonly Aura[]): Aura[] {
  return [...list.filter(one => !one.harmful), ...list.filter(one => one.harmful)];
}

/** Apply or refresh an aura in place: time restarts from what the server says is left; no times means until ended. */
export function setAura(unitKey: string, applied: AuraApplied, now = auraClock()): void {
  const map = new Map(auras.value);
  map.set(unitKey, ordered(wearing(auras.value.get(unitKey) ?? [], toAura(applied, now))));
  auras.value = map;
}

/**
 * Everything a unit wears, as the server lists it with the message that
 * first shows the unit. The list is the whole of it: it replaces whatever
 * the unit's row held, and an empty one clears the row. Each entry is read
 * the way `setAura` reads one `aura.applied`, its time counted from `now`.
 */
export function setAurasOf(unitKey: string, list: readonly AuraApplied[], now = auraClock()): void {
  const worn = list.reduce<Aura[]>((row, applied) => wearing(row, toAura(applied, now)), []);
  if (!worn.length && !auras.value.has(unitKey)) return;
  const map = new Map(auras.value);
  if (worn.length) map.set(unitKey, ordered(worn));
  else map.delete(unitKey);
  auras.value = map;
}

function toAura(applied: AuraApplied, now: number): Aura {
  const left = applied.remainingMs > 0 ? applied.remainingMs : applied.durationMs;
  return {
    spellId: applied.spellId,
    casterId: applied.casterId,
    harmful: applied.harmful,
    stacks: Math.max(1, applied.stacks),
    durationMs: Math.max(applied.durationMs, left),
    endsAt: left > 0 ? now + left : null,
  };
}

/** A row with `aura` in it: in the place of the same spell's, or added last. */
function wearing(list: readonly Aura[], aura: Aura): Aura[] {
  const at = list.findIndex(one => one.spellId === aura.spellId);
  return at >= 0 ? list.map((one, index) => (index === at ? aura : one)) : [...list, aura];
}

/**
 * Take one aura off a unit, by its spell, or every aura on it.
 *
 * Spell 0 clears the unit's whole row — the same rule `auraRemovalVisual`
 * states for the 3D system, so a message naming no spell still empties it.
 */
export function clearAura(unitKey: string, spellId: number): void {
  const list = auras.value.get(unitKey);
  if (!list) return;
  const map = new Map(auras.value);
  const kept = spellId === 0 ? [] : list.filter(one => one.spellId !== spellId);
  if (kept.length) map.set(unitKey, kept);
  else map.delete(unitKey);
  auras.value = map;
}

/** Forget every unit's auras: the session they belonged to has gone. */
export function clearAuras(): void {
  auras.value = new Map();
  auraCard.value = null;
}

/** Ms left on an aura, never below 0, or null for one that lasts until taken off. */
export function timeLeft(aura: Aura, now = auraClock()): number | null {
  return aura.endsAt === null ? null : Math.max(0, aura.endsAt - now);
}

/**
 * The auras still running.
 *
 * One whose time has run out is not shown even before its `aura.ended`
 * arrives: the countdown reaching nothing is the end of it on screen.
 */
export function liveAuras(list: readonly Aura[], now = auraClock()): Aura[] {
  return list.filter(one => one.endsAt === null || one.endsAt > now);
}

/** One unit's auras still running, or an empty list for a unit carrying none. */
export function aurasFor(unitKey: string | undefined, now = auraClock()): Aura[] {
  return unitKey === undefined ? [] : liveAuras(auras.value.get(unitKey) ?? [], now);
}

/**
 * Time left, as minutes and seconds — hours, minutes and seconds past an
 * hour. Rounded up, so an aura shows "0:01" until its last second is
 * over rather than "0:00" while it is still on.
 */
export function formatTimeLeft(ms: number): string {
  const whole = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = String(whole % 60).padStart(2, '0');
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}

/** What an aura's card says. */
export interface AuraCardWords {
  title: string;
  body: string;
  /** The time-left line, or null for an aura that lasts until taken off. */
  time: string | null;
}

/**
 * The words on an aura's card: the spell's name, what the spell says it
 * does, and the time left written into the build's own sentence for it
 * (`timeLeft`, holding one `%s`) where there is one.
 */
export function auraCardWords(
  aura: Aura,
  said: { name: string; text: string; timeLeft?: string },
  now = auraClock(),
): AuraCardWords {
  const left = timeLeft(aura, now);
  const figure = left === null ? null : formatTimeLeft(left);
  const sentence = said.timeLeft?.includes('%s') ? said.timeLeft : undefined;
  return {
    title: said.name,
    body: said.text,
    time: figure === null ? null : sentence ? sentence.replace('%s', figure) : figure,
  };
}

/** The aura whose card is open, and where it was pressed. */
export interface OpenAuraCard {
  unitKey: string;
  spellId: number;
  at: { x: number; y: number };
}

/** How to take an aura off, for one the player may; null for any other. */
export type AuraCancel = (unitKey: string, spellId: number) => (() => void) | null;

export const auraCancel = signal<AuraCancel>(() => null);

/** The one aura card on screen, if any: opening another puts the first away. */
export const auraCard = signal<OpenAuraCard | null>(null);

/** Open an aura's card, or put it away when that same aura's card is already open. */
export function toggleAuraCard(open: OpenAuraCard): void {
  const current = auraCard.value;
  auraCard.value =
    current && current.unitKey === open.unitKey && current.spellId === open.spellId ? null : open;
}

export function closeAuraCard(): void {
  auraCard.value = null;
}
