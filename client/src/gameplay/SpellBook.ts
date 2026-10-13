/**
 * Spell state, cooldowns and casting. Game state, not UI: `Game.ts` writes
 * the signals, the UI reads them, and `tickSpells` advances them per frame.
 */

import { computed, signal } from '@preact/signals';
import type { SpellStats, TalentRow } from '../assets/types';

/**
 * The server's six-slot primary bar and 32-slot shortcut bar; separate
 * arrays here, one index space on the wire.
 */
export const PRIMARY_BAR_SLOTS = 6;
export const SHORTCUT_BAR_SLOTS = 32;

/** The shortcut bar is paged, sixteen slots at a time. */
export const SHORTCUT_PAGE_SLOTS = 16;

export type ActionBarName = 'primary' | 'shortcut';

/** A slot's kind, as the protocol stores it. */
export const ACTION_SLOT_SPELL = 0;
export const ACTION_SLOT_ITEM = 1;

/** An empty slot is kept: compacting would invent another layout. */
export interface SavedBarSlot {
  bar: ActionBarName;
  /** Position within its own bar. */
  slot: number;
  spellId: number | null;
  /** An item slot. Nothing uses these yet, but the layout keeps them. */
  itemId: number | null;
}

/** One saved slot as it arrived, before it is placed in a bar. */
export interface ActionBarRecord {
  bar: ActionBarName;
  slot: number;
  id: number;
  type: number;
}

export interface CooldownTimer {
  spellId: number;
  remaining: number;
  total: number;
}

export interface CastState {
  spellId: number;
  targetId: string | null;
  castTime: number;
  elapsed: number;
}

/** Castable spell ids the server said the character has, before dedupe. */
const rawKnownSpells = signal<number[]>([]);

/** Resolved spell names by id. */
export const spellNames = signal<Map<number, string>>(new Map());

/** Resolved spell ranks by id, from `spell_new`'s own rank column. */
export const spellRanks = signal<Map<number, number>>(new Map());

/** Every talent place, from local tables; the wire carries nothing about trees. */
export const talentPlaces = signal<readonly TalentRow[]>([]);

export function setTalentPlaces(rows: readonly TalentRow[]): void {
  talentPlaces.value = rows;
}

/** Each class's three trees, from `character_class`. */
export const classTrees = signal<ReadonlyMap<number, readonly number[]>>(new Map());

export function setClassTrees(trees: ReadonlyMap<number, readonly number[]>): void {
  classTrees.value = trees;
}

/** Mount spells, kept off the bar by their own rows; the mount page wants exactly these. */
export const mountSpells = signal<readonly number[]>([]);

export function setMountSpells(ids: readonly number[]): void {
  mountSpells.value = [...ids];
}

/** Spell-string lines by number: a talent place names its own line; the next says what it does. */
export const talentWords = signal<ReadonlyMap<number, string>>(new Map());
export const wantedTalentWords = signal<readonly number[]>([]);

export function wantTalentWords(ids: readonly number[]): void {
  const have = talentWords.value;
  const asked = wantedTalentWords.value;
  const missing = ids.filter(id => id > 0 && !have.has(id) && !asked.includes(id));
  if (missing.length) wantedTalentWords.value = [...asked, ...missing];
}

export function setTalentWord(id: number, said: string): void {
  if (talentWords.value.get(id) === said) return;
  talentWords.value = new Map(talentWords.value).set(id, said);
}

/** Resolved spell icon bitmaps by id. */
export const spellIcons = signal<Map<number, ImageBitmap>>(new Map());

/** Spells a screen asked about (unlearned tree places); their pictures and words come together. */
export const wantedSpellDetails = signal<readonly number[]>([]);

export function wantSpellDetails(ids: readonly number[]): void {
  const have = spellIcons.value;
  const asked = wantedSpellDetails.value;
  const missing = ids.filter(id => id > 0 && !have.has(id) && !asked.includes(id));
  if (missing.length) wantedSpellDetails.value = [...asked, ...missing];
}

/** Cast time, cooldown and reach for the card; asked even for spells whose picture is in. */
export const spellStats = signal<ReadonlyMap<number, SpellStats>>(new Map());
export const wantedSpellStats = signal<readonly number[]>([]);

export function wantSpellStats(ids: readonly number[]): void {
  const asked = wantedSpellStats.value;
  const missing = ids.filter(id => id > 0 && !spellStats.value.has(id) && !asked.includes(id));
  if (missing.length) wantedSpellStats.value = [...asked, ...missing];
}

export function setSpellStats(id: number, stats: SpellStats): void {
  spellStats.value = new Map(spellStats.value).set(id, stats);
}

/** One button per family (same resolved name), highest rank kept; unresolved names stand alone. */
export function dedupeRanks(
  ids: readonly number[],
  names: ReadonlyMap<number, string>,
  ranks: ReadonlyMap<number, number>,
): number[] {
  const best = new Map<string, { id: number; rank: number; order: number }>();
  ids.forEach((id, order) => {
    const name = names.get(id);
    const key = name === undefined ? `#${id}` : name.trim().toLowerCase();
    const rank = ranks.get(id) || 1;
    const held = best.get(key);
    if (!held || rank > held.rank || (rank === held.rank && id > held.id)) {
      best.set(key, { id, rank, order: held?.order ?? order });
    }
  });
  return [...best.values()].sort((a, b) => a.order - b.order).map(entry => entry.id);
}

/** Known spells, one per ability at its highest rank by `spell_new`'s rank column. */
export const knownSpells = computed<number[]>(() =>
  dedupeRanks(rawKnownSpells.value, spellNames.value, spellRanks.value),
);

/** The primary bar as saved, empties kept; empty with no server. */
export const actionBar = signal<SavedBarSlot[]>([]);

/** The pop-out bar, exactly as the server saved it — thirty-two slots. */
export const shortcutSlots = signal<SavedBarSlot[]>([]);

function emptyBar(bar: ActionBarName, count: number): SavedBarSlot[] {
  return Array.from({ length: count }, (_, slot) => ({
    bar,
    slot,
    spellId: null,
    itemId: null,
  }));
}

/** Active cooldowns by spell id. */
export const cooldowns = signal<Map<number, CooldownTimer>>(new Map());

/** Current cast in progress, or null. */
export const casting = signal<CastState | null>(null);

/** A cast that was broken off, held where it stopped for `held` ms; it never blocks the next cast. */
export const brokenCast = signal<(CastState & { held: number }) | null>(null);

/** Own choice: long enough to read the word on the bar, short enough to be gone by the next cast. */
export const BROKEN_CAST_HOLD_MS = 1000;

/** Whether the player is in combat. */
export const inCombat = signal<boolean>(false);

/** Sent with no spell; keying it by spell 0 would sweep whichever spell has that id. */
export const globalCooldown = signal<CooldownTimer | null>(null);

/** The bar the player sees has this many buttons: six rows of two. */
export const BAR_SLOTS = 12;

/** The extra mount slot after the numbered ones; unsaved, so it lasts as long as the tab. */
export const MOUNT_SLOT = BAR_SLOTS;

/** The ring in the corner holds this many spells, after the mount's slot in the order of drop targets. */
export const WHEEL_SLOTS = 12;
export const WHEEL_FIRST = MOUNT_SLOT + 1;

/** Where the ring's first slot is saved: the shortcut slots after the ones the bar shows. */
const WHEEL_SHORTCUT_FIRST = BAR_SLOTS - PRIMARY_BAR_SLOTS;

/** What the ring's slots hold, empties kept. Nothing fills them in: the ring starts empty. */
export const wheelSlots = computed<Array<number | null>>(() =>
  Array.from(
    { length: WHEEL_SLOTS },
    (_, at) => shortcutSlots.value[WHEEL_SHORTCUT_FIRST + at]?.spellId ?? null,
  ),
);

/** The mount the player put in the mount slot, or null while they have not chosen one. */
const mountChoice = signal<number | null>(null);

/** The mount the player put there while they still have it, else their first. */
export const mountSlot = computed<number | null>(() => {
  const owned = mountSpells.value;
  const chosen = mountChoice.value;
  if (chosen !== null && owned.includes(chosen)) return chosen;
  return owned[0] ?? null;
});

/** Own convention: buttons 1-6 are the primary bar, 7-12 the first six shortcut slots. */
export function barSlotOf(index: number): { bar: ActionBarName; slot: number } {
  return index < PRIMARY_BAR_SLOTS
    ? { bar: 'primary', slot: index }
    : { bar: 'shortcut', slot: index - PRIMARY_BAR_SLOTS };
}

/**
 * The twelve buttons. With nothing saved, the deduplicated known spells in
 * server order; once anything is saved, the saved layout, kept as arranged.
 */
export const barSlots = computed<Array<number | null>>(() => {
  const saved = Array.from({ length: BAR_SLOTS }, (_, index) => {
    const { bar, slot } = barSlotOf(index);
    const source = bar === 'primary' ? actionBar.value : shortcutSlots.value;
    return source[slot]?.spellId ?? null;
  });
  if (saved.some(id => id !== null)) return saved;
  const known = knownSpells.value;
  return saved.map((_, index) => known[index] ?? null);
});

/** The spells a button offers (the bar, the ring and the mount's slot), for casting and for the book to mark. */
export const spellBar = computed<number[]>(() =>
  [...barSlots.value, ...wheelSlots.value, mountSlot.value].filter(
    (id): id is number => id !== null,
  ),
);

/** White for a blow, yellow for a spell, green for a heal. */
export type FloatingTone = 'hit' | 'spell' | 'heal';

export interface FloatingNumber {
  id: number;
  /** A word floated with the number, or in place of it: "Parry", "Block". */
  word?: string;
  /** Signed health change as the server sent it: negative for a blow. */
  value: number;
  /** The body it belongs to, so a moving mob carries its numbers; null if unresolved. */
  entityId: number | null;
  /** How high above that body's feet the number sits, in world units. */
  worldY: number;
  /** A fixed screen-space nudge, so blows landing together do not overlap. */
  offsetX: number;
  offsetY: number;
  /** Screen position, written each frame by `Game`; mutated in place so the HUD does not re-render. */
  x: number;
  y: number;
  /** False until the body has been projected at least once. */
  onScreen: boolean;
  age: number;
  tone: FloatingTone;
  /** Over the hero's own body: pinned to the HUD and drawn a size down. */
  onSelf: boolean;
  /** A critical: drawn larger, and up for longer. */
  critical: boolean;
  /** Struck by the attacker's off hand: drawn a size down, beside the main hand's. */
  offHand: boolean;
}

let nextFloatId = 0;
export const floatingNumbers = signal<FloatingNumber[]>([]);

/** Own choice: a spell stays only if known; other slot kinds stay as they came. */
function savedContent(
  record: ActionBarRecord,
  knows: ReadonlySet<number>,
): Pick<SavedBarSlot, 'spellId' | 'itemId'> | null {
  if (record.id <= 0) return null;
  if (record.type !== ACTION_SLOT_SPELL) return { spellId: null, itemId: record.id };
  return knows.has(record.id) ? { spellId: record.id, itemId: null } : null;
}

/** From the server's whole known list and saved bars; an emptied slot stays empty rather than shifting. */
export function initSpells(
  known: number[],
  records: ActionBarRecord[],
  castable: readonly number[] = known,
): void {
  rawKnownSpells.value = [...castable];
  const bars: Record<ActionBarName, SavedBarSlot[]> = {
    primary: emptyBar('primary', PRIMARY_BAR_SLOTS),
    shortcut: emptyBar('shortcut', SHORTCUT_BAR_SLOTS),
  };
  const knows = new Set(known);
  for (const record of records) {
    const slots = bars[record.bar];
    const content = savedContent(record, knows);
    if (!slots?.[record.slot] || !content) continue;
    slots[record.slot] = { ...slots[record.slot]!, ...content };
  }
  actionBar.value = bars.primary;
  shortcutSlots.value = bars.shortcut;
}

/** One saved slot changed, by the same rules initialisation uses. */
export function assignActionBar(record: ActionBarRecord): void {
  const target = record.bar === 'primary' ? actionBar : shortcutSlots;
  const slots = [...target.value];
  if (record.slot < 0 || record.slot >= slots.length) return;
  slots[record.slot] = {
    bar: record.bar,
    slot: record.slot,
    spellId: record.id > 0 && record.type === ACTION_SLOT_SPELL ? record.id : null,
    itemId: record.id > 0 && record.type !== ACTION_SLOT_SPELL ? record.id : null,
  };
  target.value = slots;
}

/** Cache a resolved spell name. */
export function setSpellName(spellId: number, name: string): void {
  const next = new Map(spellNames.value);
  next.set(spellId, name);
  spellNames.value = next;
}

/** Resolved cast times by spell id, in milliseconds; 0 is instant. */
export const spellCastTimes = signal<Map<number, number>>(new Map());

export function setSpellCastTime(spellId: number, ms: number): void {
  if (spellCastTimes.value.get(spellId) === ms) return;
  spellCastTimes.value = new Map(spellCastTimes.value).set(spellId, ms);
}

/** "Instant", or "1.5s cast": what the book says beside a spell. */
export function castTimeLabel(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  if (ms <= 0) return 'Instant';
  const seconds = ms / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s cast`;
}

/** Cache a resolved spell rank. */
export function setSpellRank(spellId: number, rank: number): void {
  const next = new Map(spellRanks.value);
  next.set(spellId, rank);
  spellRanks.value = next;
}

/** Cache a resolved spell icon. */
export function setSpellIcon(spellId: number, icon: ImageBitmap): void {
  const next = new Map(spellIcons.value);
  next.set(spellId, icon);
  spellIcons.value = next;
}

/** Get a spell icon from the cache. */
export function getSpellIcon(spellId: number): ImageBitmap | undefined {
  return spellIcons.value.get(spellId);
}

/** Get a spell name from the cache, or a placeholder. */
export function getSpellName(spellId: number): string {
  return spellNames.value.get(spellId) ?? `Spell ${spellId}`;
}

/** Get a spell's cached rank, or null while it has not resolved yet. */
export function getSpellRank(spellId: number): number | null {
  return spellRanks.value.get(spellId) ?? null;
}

/** A cast has begun. An instant spell has no bar to show. */
export function startCast(spellId: number, targetId: string | null, castTimeMs: number): void {
  if (castTimeMs <= 0) {
    casting.value = null;
    return;
  }
  brokenCast.value = null;
  casting.value = {
    spellId,
    targetId,
    castTime: castTimeMs,
    elapsed: 0,
  };
}

/** Cast completed successfully. */
export function completeCast(): void {
  casting.value = null;
}

/** A refusal naming another spell leaves the running cast and its bar alone. */
export function failCast(spellId?: number): void {
  const current = casting.value;
  if (current && spellId !== undefined && current.spellId !== 0 && current.spellId !== spellId)
    return;
  casting.value = null;
}

/** Whether a press may start a cast: never while one is filling. */
export function mayStartCast(): boolean {
  return casting.value === null;
}

/** Give up the cast, as a jump does (observed in play by the owner); returns the spell to call off, or null. */
export function abandonCast(): number | null {
  const current = casting.value;
  if (!current) return null;
  breakCast(current);
  return current.spellId;
}

/** Cast interrupted (moving, stun, silence, etc.). */
export function interruptCast(): void {
  const current = casting.value;
  if (current) breakCast(current);
}

function breakCast(current: CastState): void {
  brokenCast.value = { ...current, held: 0 };
  casting.value = null;
}

/** Set the global cooldown. Every button greys until it runs out. */
export function startGlobalCooldown(durationMs: number): void {
  globalCooldown.value =
    durationMs > 0 ? { spellId: 0, remaining: durationMs, total: durationMs } : null;
}

/** A red line a third of the way down; `key` changes per raise to restart the fade. */
export interface HudBanner {
  key: number;
  text: string;
  /** Lines of one topic may stand in for each other; see `BannerLine.quiet`. */
  topic: string;
  /** Seconds it has been up. Aged by `tickSpells`. */
  age: number;
}

/** How to raise a line, beyond its words. */
export interface BannerLine {
  /** Lines that belong together, such as the two either side of a fight. Defaults to the words. */
  topic?: string;
  /** A quiet line goes up only over nothing, or over a line of its own topic. */
  quiet?: boolean;
}

/** How long the message stays up, in seconds; `--animate-banner` runs as long. */
export const BANNER_LIFETIME = 4;

/** Own choice, ms: holding a refused button reads as one line. */
export const REPEAT_WINDOW = 1500;

export const banner = signal<HudBanner | null>(null);

let nextBannerKey = 1;
/** When each set of words last went up; entries older than the window are pruned on each raise. */
const raisedAt = new Map<string, number>();

/** Different words replace at once; the same words within `REPEAT_WINDOW` are dropped. */
export function reportToPlayer(text: string, now = performance.now(), line: BannerLine = {}): void {
  for (const [words, at] of raisedAt) if (now - at >= REPEAT_WINDOW) raisedAt.delete(words);
  if (raisedAt.has(text)) return;
  const topic = line.topic ?? text;
  const showing = banner.value;
  if (line.quiet && showing && showing.topic !== topic) return;
  raisedAt.set(text, now);
  banner.value = { key: nextBannerKey++, text, topic, age: 0 };
}

/** The words either side of a fight. */
export interface CombatWords {
  readonly enter: string;
  readonly leave: string;
}

/** This project's own wording, for when the user's strings supply none. */
export const COMBAT_WORDS: CombatWords = { enter: 'Fighting', leave: 'Out of the fight' };

/** The topic both fight lines share, so leaving may replace entering. */
const FIGHT_TOPIC = 'fight';

/**
 * Whether the player is fighting. Own choice: entering raises a line;
 * leaving replaces only that line, never a death or refusal still up.
 */
export function setInCombat(
  fighting: boolean,
  now = performance.now(),
  words: CombatWords = COMBAT_WORDS,
): void {
  const edge = inCombat.value !== fighting;
  inCombat.value = fighting;
  if (!edge) return;
  reportToPlayer(fighting ? words.enter : words.leave, now, {
    topic: FIGHT_TOPIC,
    quiet: !fighting,
  });
}

/** Start a cooldown on a spell. */
export function startCooldown(spellId: number, durationMs: number): void {
  const next = new Map(cooldowns.value);
  next.set(spellId, {
    spellId,
    remaining: durationMs,
    total: durationMs,
  });
  cooldowns.value = next;
}

/** Sends a saved slot to the server; none installed keeps changes local. */
export type ActionSlotSink = (record: ActionBarRecord) => void;

let saveSlot: ActionSlotSink | null = null;

export function setActionSlotSink(sink: ActionSlotSink | null): void {
  saveSlot = sink;
}

/** Put a spell on a bar or ring button and save its slot, or a mount in the unsaved mount slot; `null` clears. */
export function assignBarSlot(index: number, spellId: number | null): void {
  if (index === MOUNT_SLOT) {
    // Only a mount goes in the mount's slot; clearing it goes back to the first the player has.
    if (spellId === null || mountSpells.value.includes(spellId)) mountChoice.value = spellId;
    return;
  }
  const wheel = index - WHEEL_FIRST;
  const place =
    index >= 0 && index < BAR_SLOTS
      ? barSlotOf(index)
      : wheel >= 0 && wheel < WHEEL_SLOTS
        ? { bar: 'shortcut' as const, slot: WHEEL_SHORTCUT_FIRST + wheel }
        : null;
  if (!place) return;
  // While nothing is saved the bar shows the known spells; save them first,
  // or one drop would empty the rest.
  const nothingSaved = ![...actionBar.value, ...shortcutSlots.value].some(s => s.spellId !== null);
  if (nothingSaved) {
    barSlots.value.forEach((shown, i) => {
      if (i === index || shown === null) return;
      const { bar, slot } = barSlotOf(i);
      assignSpell(slot, shown, bar);
    });
  }
  assignSpell(place.slot, spellId, place.bar);
}

/** Assign a spell to a slot in either bar, and save it. */
export function assignSpell(
  slotIndex: number,
  spellId: number | null,
  bar: ActionBarName = 'primary',
): void {
  const record: ActionBarRecord = {
    bar,
    slot: slotIndex,
    id: spellId ?? 0,
    // A cleared slot is an empty item slot, as the game sends: the id says empty.
    type: spellId === null ? ACTION_SLOT_ITEM : ACTION_SLOT_SPELL,
  };
  const slots = bar === 'primary' ? actionBar.value : shortcutSlots.value;
  if (slotIndex < 0 || slotIndex >= slots.length) return;
  assignActionBar(record);
  saveSlot?.(record);
}

/** `value` is the signed health change as sent; `Game` projects `entityId` and `worldY` each frame. */
export function addDamageNumber(
  value: number,
  entityId: number | null,
  worldY: number,
  options: {
    healing?: boolean;
    spell?: boolean;
    onSelf?: boolean;
    critical?: boolean;
    offHand?: boolean;
    offsetX?: number;
    offsetY?: number;
    word?: string;
  } = {},
): void {
  const entry: FloatingNumber = {
    id: nextFloatId++,
    ...(options.word ? { word: options.word } : {}),
    value,
    entityId,
    worldY,
    offsetX: options.offsetX ?? 0,
    offsetY: options.offsetY ?? 0,
    x: 0,
    y: 0,
    onScreen: false,
    age: 0,
    tone: options.healing ? 'heal' : options.spell ? 'spell' : 'hit',
    onSelf: options.onSelf === true,
    critical: options.critical === true,
    offHand: options.offHand === true,
  };
  floatingNumbers.value = [...floatingNumbers.value, entry];
}

// ---------------------------------------------------------------------------
// Frame loop tick — called every frame from Game.ts
// ---------------------------------------------------------------------------

/*
 * A number over a body pops in, rises, holds and fades; a critical lasts
 * longer, rises half as far and arrives large. Over the hero it stays put.
 */

/** Seconds a number over another body stays up. */
export const FLOAT_LIFE = 1.3;
/** Seconds a critical over another body stays up. */
export const FLOAT_LIFE_CRITICAL = 1.8;
/** Seconds a number over the hero stays up. */
export const FLOAT_LIFE_HERO = 2.4;
/** The share of its life a number is drawn solid before it starts to fade. */
export const FLOAT_SOLID_SHARE = 0.55;
/** Pixels a number over another body rises over its life. */
export const FLOAT_RISE = 44;
/** A critical rises this share of `FLOAT_RISE`. */
const CRITICAL_RISE_SHARE = 0.5;
/** Seconds an ordinary number takes to pop in, and the size it pops from. */
const POP_IN = 0.12;
const POP_FROM = 0.7;
/** Seconds a critical takes to settle, and the size it arrives at. */
const PUNCH = 0.25;
const PUNCH_FROM = 1.4;

/** How long this number stays up, in seconds. */
export function floatLifetime(n: Pick<FloatingNumber, 'onSelf' | 'critical'>): number {
  if (n.onSelf) return FLOAT_LIFE_HERO;
  return n.critical ? FLOAT_LIFE_CRITICAL : FLOAT_LIFE;
}

/** How far through its life a number is, from 0 to 1. */
function lifeShare(n: Pick<FloatingNumber, 'onSelf' | 'critical' | 'age'>): number {
  return Math.min(1, Math.max(0, n.age / floatLifetime(n)));
}

/** Pixels risen, fast then slowing; the hero's numbers are pinned and do not rise. */
export function floatRise(n: Pick<FloatingNumber, 'onSelf' | 'critical' | 'age'>): number {
  if (n.onSelf) return 0;
  const t = lifeShare(n);
  const eased = 1 - (1 - t) * (1 - t);
  return FLOAT_RISE * (n.critical ? CRITICAL_RISE_SHARE : 1) * eased;
}

/** Scale as a share of the style's font size: a critical shrinks onto it, others pop up to it; the hero's stay still. */
export function floatScale(n: Pick<FloatingNumber, 'onSelf' | 'critical' | 'age'>): number {
  if (n.critical) {
    const t = Math.min(1, n.age / PUNCH);
    return PUNCH_FROM + (1 - PUNCH_FROM) * t * (2 - t);
  }
  if (n.onSelf) return 1;
  const t = Math.min(1, n.age / POP_IN);
  return POP_FROM + (1 - POP_FROM) * t * (2 - t);
}

/** How solid a number is drawn: 1 while it holds, easing to 0 at the end of its life. */
export function floatFade(n: Pick<FloatingNumber, 'onSelf' | 'critical' | 'age'>): number {
  const t = lifeShare(n);
  if (t >= 1) return 0;
  if (t <= FLOAT_SOLID_SHARE) return 1;
  const fading = (t - FLOAT_SOLID_SHARE) / (1 - FLOAT_SOLID_SHARE);
  return 1 - fading * fading;
}

/** Advance all timed state by `dt` seconds; once per frame. */
export function tickSpells(dt: number): void {
  const ms = dt * 1000;

  // — cooldowns: rebuilt only when something expired, or the bar re-renders every frame.
  const current = cooldowns.value;
  if (current.size > 0) {
    const next = new Map<number, CooldownTimer>();
    for (const [id, cd] of current) {
      const remaining = cd.remaining - ms;
      if (remaining > 0) next.set(id, { ...cd, remaining });
    }
    cooldowns.value = next;
  }

  const gcd = globalCooldown.value;
  if (gcd) {
    const remaining = gcd.remaining - ms;
    globalCooldown.value = remaining > 0 ? { ...gcd, remaining } : null;
  }

  // — casting: driven locally between messages, stopping at full; only the
  // server ends a cast.
  const c = casting.value;
  if (c && c.elapsed < c.castTime) {
    casting.value = { ...c, elapsed: Math.min(c.castTime, c.elapsed + ms) };
  }
  const broken = brokenCast.value;
  if (broken) {
    const held = broken.held + ms;
    brokenCast.value = held >= BROKEN_CAST_HOLD_MS ? null : { ...broken, held };
  }

  // — the banner ----------------------------------------------------------
  const current_banner = banner.value;
  if (current_banner) {
    const aged = current_banner.age + dt;
    banner.value = aged >= BANNER_LIFETIME ? null : { ...current_banner, age: aged };
  }

  // — floating numbers: aged in place; the signal changes only on expiry,
  // since the canvas reads live entries every frame.
  const floats = floatingNumbers.value;
  if (floats.length > 0) {
    let expired = false;
    for (const f of floats) {
      f.age += dt;
      if (f.age >= floatLifetime(f)) expired = true;
    }
    if (expired) {
      floatingNumbers.value = floats.filter(f => f.age < floatLifetime(f));
    }
  }
}
