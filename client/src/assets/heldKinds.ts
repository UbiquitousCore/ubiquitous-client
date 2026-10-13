/** A held thing's kind, which decides its rest place and combat clip family; sub-class groups checked against item names and models. */

export type HeldKind =
  /** One-handed swords, axes and maces. */
  | 'blade'
  | 'dagger'
  /** Knuckles and katars, worn on the fist. */
  | 'fist'
  /** Two-handed swords, axes and hammers. */
  | 'great'
  /** Staves and spears. */
  | 'pole'
  | 'bow'
  | 'crossbow'
  | 'wand'
  | 'shield'
  /** A rod or totem carried in the off hand. */
  | 'trinket';

/** Item classes, as the item table numbers them. */
const WEAPON_CLASS = 2;
const ARMOUR_CLASS = 4;

const WEAPON_KINDS: ReadonlyMap<number, HeldKind> = new Map([
  [0, 'blade'],
  [1, 'blade'],
  [2, 'blade'],
  [3, 'dagger'],
  [4, 'fist'],
  [8, 'great'],
  [9, 'great'],
  [10, 'great'],
  [11, 'pole'],
  [12, 'pole'],
  [16, 'bow'],
  [17, 'crossbow'],
  [20, 'wand'],
]);

const ARMOUR_KINDS: ReadonlyMap<number, HeldKind> = new Map([
  [5, 'shield'],
  [6, 'trinket'],
]);

/** The kind of a held item, or null for anything a hand does not hold. */
export function heldKind(itemClass: number, subClass: number): HeldKind | null {
  const kinds =
    itemClass === WEAPON_CLASS ? WEAPON_KINDS : itemClass === ARMOUR_CLASS ? ARMOUR_KINDS : null;
  return kinds?.get(subClass) ?? null;
}
