/** Item vocabulary: wire numbers to words/colours/slots (quality is colour
 * only in-game; screens without the dark material use the name). */

import { type GameLine, LINES, say } from './gameLines';

/** Equipment slots in wire order (position IS the slot number — not freely
 * reorderable; named for screen readers). Head to toe, then the rings and
 * trinkets, then the weapons, whose numbers the game's spell tables use. No
 * wrist/waist (declared, unworn). */
export const EQUIPMENT_SLOTS = [
  'Head',
  'Neck',
  'Shoulders',
  'Hands',
  'Chest',
  'Shirt',
  'Back',
  'Legs',
  'Feet',
  'Ring 1',
  'Ring 2',
  'Trinket 1',
  'Trinket 2',
  'Main hand',
  'Off hand',
  'Ranged',
] as const;

/** Worn-slot type to accepting slots in preference order: first free, else the first. */
const HOMES: Record<number, readonly number[]> = {
  1: [0], // head
  2: [1], // neck
  3: [2], // shoulder
  4: [5], // shirt
  5: [4], // chest
  6: [7], // legs
  7: [8], // feet
  8: [3], // hands
  9: [9, 10], // finger
  10: [11, 12], // trinket
  11: [13, 14], // one-hand: main, then off
  12: [14], // off hand; no shipped item uses this type
  13: [15], // ranged
  14: [6], // back
  15: [13], // two-hand
  16: [], // a bag, which this build has no slots for
  17: [4], // robe, which is a chest piece
  18: [13], // main hand only
  19: [14], // off hand: shields and off-hand weapons
  20: [15], // ammo
  21: [15], // thrown
  22: [15], // ranged, right
};

/**
 * Every slot an item of this type can go in.
 *
 * A screen comparing what is offered against what is worn needs to know
 * which slots to look at — a ring has two homes, most things have one.
 */
export function equipmentHomesFor(inventoryType: number): readonly number[] {
  return HOMES[inventoryType] ?? [];
}

/** What an item's inventory type is called, for a description line. */
export function wornAt(inventoryType: number): string | null {
  const first = HOMES[inventoryType]?.[0];
  if (first === undefined) return null;
  // The two-handed case is worth its own words: it goes in the main hand and
  // takes the off hand with it, which "Main hand" alone does not say.
  if (inventoryType === 15) return 'Two-handed';
  return EQUIPMENT_SLOTS[first] ?? null;
}

/**
 * Item quality, by the number in the items table's quality column.
 *
 * 1 to 6 are the ordered scale. 0 is on a handful of rows and 7 on one armour
 * piece in each of the user's builds; neither has a colour of its own.
 */
export const ITEM_QUALITY = {
  unranked: 0,
  poor: 1,
  common: 2,
  fine: 3,
  rare: 4,
  epic: 5,
  artifact: 6,
  offScale: 7,
} as const;

/**
 * The rank in words, for a label and for a screen reader.
 *
 * A value outside the ordered scale reads as ordinary, as does any value with
 * no colour of its own.
 */
const NAMES: Record<number, string> = {
  [ITEM_QUALITY.poor]: 'Poor',
  [ITEM_QUALITY.common]: 'Common',
  [ITEM_QUALITY.fine]: 'Fine',
  [ITEM_QUALITY.rare]: 'Rare',
  [ITEM_QUALITY.epic]: 'Epic',
  [ITEM_QUALITY.artifact]: 'Artifact',
};

/** The Tailwind text utility for a quality, on the dark material. */
const TEXT: Record<number, string> = {
  [ITEM_QUALITY.poor]: 'text-quality-poor',
  [ITEM_QUALITY.common]: 'text-quality-common',
  [ITEM_QUALITY.fine]: 'text-quality-fine',
  [ITEM_QUALITY.rare]: 'text-quality-rare',
  [ITEM_QUALITY.epic]: 'text-quality-epic',
  [ITEM_QUALITY.artifact]: 'text-quality-artifact',
};

export function qualityName(quality: number): string {
  return NAMES[quality] ?? 'Common';
}

/** The class that tints an item's name. Only legible on dark chrome. */
export function qualityTextClass(quality: number): string {
  return TEXT[quality] ?? TEXT[ITEM_QUALITY.common]!;
}

/** How an item binds to its owner, by the item's bonding number. */
const BINDING: Record<number, GameLine> = {
  1: LINES.bindOnPickup,
  2: LINES.bindOnEquip,
  3: LINES.bindOnUse,
  4: LINES.questItem,
};

export function bindingNote(bonding: number): string | null {
  const which = BINDING[bonding];
  return which ? say(which) : null;
}

/** Bit 0 of an item's flag word: it belongs to this character now. */
export const SOULBOUND_FLAG = 0x1;

export function isSoulbound(flags: number): boolean {
  return (flags & SOULBOUND_FLAG) !== 0;
}

/** Item classes the interface tells apart; others are treated alike. */
export const ITEM_CLASS = {
  consumable: 0,
  container: 1,
  weapon: 2,
  gem: 3,
  armour: 4,
  projectile: 5,
  quest: 10,
} as const;

/**
 * What using an item does: `cast` a spell that does not wait for wearing
 * (trigger 2 fires while worn, read from the files); `guild` opens the
 * founding prompt; `byKind` uses the kind itself (boxes and chests, observed
 * in play; quest items of sub-class 1, own choice). Offered only in the bag.
 */
export type WhatUseDoes = 'cast' | 'guild' | 'byKind';

/** The parts of an item's row that say what using it does. */
export interface UseFacts {
  itemClass: number;
  subClass: number;
  spellSlots: readonly { id: number; trigger: number }[];
}

/** The spell-slot trigger that fires only while the item is worn. */
const FIRES_WHILE_WORN = 2;

/** Kinds of item whose use is the kind itself, as class and subclass. */
const KIND_USES: ReadonlyArray<{ itemClass: number; subClass: number; use: WhatUseDoes }> = [
  { itemClass: ITEM_CLASS.consumable, subClass: 10, use: 'guild' },
  { itemClass: ITEM_CLASS.quest, subClass: 1, use: 'byKind' },
  { itemClass: ITEM_CLASS.projectile, subClass: 0, use: 'byKind' },
];

/** What using this item does, or null where it does nothing. */
export function useOf(item: UseFacts): WhatUseDoes | null {
  if (item.spellSlots.some(slot => slot.id > 0 && slot.trigger !== FIRES_WHILE_WORN)) return 'cast';
  const kind = KIND_USES.find(
    one => one.itemClass === item.itemClass && one.subClass === item.subClass,
  );
  return kind?.use ?? null;
}
