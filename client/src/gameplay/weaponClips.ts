/**
 * Which combat clip a body plays, from what its hands hold. Characters ship
 * each combat clip per family (`combat_ready_2h`), never bare, so the suffix
 * is added at playback. Read from the files: families `1h`, `2h`, `dagger`,
 * `polearm`, `stave`, `bow`, `crossbow`, `thrown`; load/aim/fire exist only
 * in the ranged families and read the ranged slot; `combat03` reads the off
 * hand; kinds named like a family use it; spears use `polearm`. Observed in
 * play by the owner: empty hands punch with `stave`; staves swing `polearm`;
 * fist weapons punch; wands and empty ranged slots play `thrown`. A
 * character's shield or rod hand plays nothing; own choice: a creature's
 * fights unarmed (`HOLDING_NO_FAMILY`). Beasts keep bare names.
 */

import { type HeldKind, heldKind } from '../assets/heldKinds';

/** Where the weapons sit in the protocol's 16-slot equipment list. */
export const WEAPON_SLOT = {
  mainhand: 13,
  offhand: 14,
  ranged: 15,
} as const;

/** The clip families, by the suffix their clips carry. */
const FAMILIES = ['1h', '2h', 'dagger', 'polearm', 'stave', 'bow', 'crossbow', 'thrown'] as const;

/** A clip family's suffix, or `''` for a hand that adds none. */
export type WeaponType = (typeof FAMILIES)[number] | '';

/** What each hand plays, already resolved from what it holds. */
export interface EquippedWeapons {
  mainhand: WeaponType;
  offhand: WeaponType;
  ranged: WeaponType;
}

/** A hand slot swings in reach, or shoots from range. */
export type Reach = 'melee' | 'ranged';

/** The kinds whose clips are a family; a fist punches with the bare hand's. */
const SWINGS_WITH: ReadonlyMap<HeldKind, WeaponType> = new Map([
  ['blade', '1h'],
  ['great', '2h'],
  ['dagger', 'dagger'],
  ['fist', 'stave'],
  ['pole', 'polearm'],
  ['bow', 'bow'],
  ['crossbow', 'crossbow'],
  ['wand', 'thrown'],
]);

/** What a hand with nothing to fight with plays, by the reach of its slot. */
const BARE_HANDED: Readonly<Record<Reach, WeaponType>> = { melee: 'stave', ranged: 'thrown' };

/** Who a hand belongs to. */
export type Holder = 'character' | 'creature';

/** What a hand plays when it holds something with no family, by who holds it: `null` for the bare hand's. */
const HOLDING_NO_FAMILY: Readonly<Record<Holder, WeaponType | null>> = {
  character: '',
  creature: null,
};

/**
 * The family a hand plays, from the class and sub-class of what it holds;
 * null for a hand holding nothing.
 */
export function familyOf(
  item: { itemClass: number; subClass: number } | null,
  reach: Reach,
  holder: Holder = 'character',
): WeaponType {
  if (!item) return BARE_HANDED[reach];
  const kind = heldKind(item.itemClass, item.subClass);
  const family = kind !== null ? SWINGS_WITH.get(kind) : undefined;
  return family ?? HOLDING_NO_FAMILY[holder] ?? BARE_HANDED[reach];
}

/** What an empty-handed body plays: every combat clip still has a family. */
export const UNARMED: EquippedWeapons = {
  mainhand: BARE_HANDED.melee,
  offhand: BARE_HANDED.melee,
  ranged: BARE_HANDED.ranged,
};

/** One hand, as the server describes it: an item and what kind of item. */
export interface HeldItem {
  entry: number;
  itemClass: number;
  subClass: number;
}

/** What the three hands play: a character's hand naming no item is empty; a creature's is taken as its told kind. */
export function weaponsFromHands(
  hands: { mainhand: HeldItem; offhand: HeldItem; ranged: HeldItem },
  holder: Holder = 'character',
): EquippedWeapons {
  const held = (hand: HeldItem): HeldItem | null =>
    holder === 'creature' || hand.entry ? hand : null;
  return {
    mainhand: familyOf(held(hands.mainhand), 'melee', holder),
    offhand: familyOf(held(hands.offhand), 'melee', holder),
    ranged: familyOf(held(hands.ranged), 'ranged', holder),
  };
}

/** The clips only the shooting families ship. */
const SHOTS: ReadonlySet<string> = new Set(['combat_load', 'combat_aim', 'combat_fire']);

/** The off-hand swing. */
export const OFF_HAND_SWING = 'combat03';

/**
 * The families that ship an off-hand swing: one-handed blades, daggers and
 * the empty hand's `stave` (read from the user's files: `combat03_1h`,
 * `combat03_dagger` and `combat03_stave` in 1.1.4, and no other).
 */
const OFF_HAND_SWINGS: ReadonlySet<WeaponType> = new Set<WeaponType>(['1h', 'dagger', 'stave']);

/** Whether a body holding these swings its off hand. False for one that keeps the bare names. */
export function swingsOffHand(weapons: EquippedWeapons | null): boolean {
  return weapons !== null && OFF_HAND_SWINGS.has(weapons.offhand);
}

/** Suffixes a table name can already end in; `shield` is the shield block's. */
const ENDINGS: readonly string[] = [...FAMILIES, 'shield'].map(suffix => `_${suffix}`);

/** Which hand a combat clip is played for. */
function handFor(clip: string): keyof EquippedWeapons {
  if (SHOTS.has(clip)) return 'ranged';
  return clip.startsWith(OFF_HAND_SWING) ? 'offhand' : 'mainhand';
}

/**
 * The clip a body plays for a table's combat clip name.
 *
 * `weapons` is null for a body that keeps the bare names. Names outside the
 * combat family, and names that already end in a suffix, are played as given.
 */
export function combatClipName(base: string, weapons: EquippedWeapons | null): string {
  if (!weapons || !base.startsWith('combat')) return base;
  if (ENDINGS.some(ending => base.endsWith(ending))) return base;
  const family = weapons[handFor(base)];
  return family ? `${base}_${family}` : base;
}
