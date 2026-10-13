/**
 * What handling an item sounds like. Own choice, by what the item table's
 * groups hold (read from item names): worn slots 1 head … 19 off hand;
 * armour sub-classes 0 jewellery, 1 cloth, 2 leather, 4 mail, 5 shields,
 * 6 off-hand items; weapons as `assets/heldKinds.ts`; consumables 1 potions,
 * 3 scrolls, 4 food, 9 spell books; class 6 materials, 7 handbooks.
 */

import { heldKind } from '../assets/heldKinds';

const CLASS_CONSUMABLE = 0;
const CLASS_WEAPON = 2;
const CLASS_ARMOUR = 4;
const CLASS_MATERIAL = 6;
const CLASS_HANDBOOK = 7;

const ARMOUR_JEWELLERY = 0;
const ARMOUR_CLOTH = 1;
const ARMOUR_LEATHER = 2;
const ARMOUR_MAIL = 4;
const ARMOUR_SHIELD = 5;
const ARMOUR_OFF_HAND = 6;

const CONSUMABLE_POTION = 1;
const CONSUMABLE_SCROLL = 3;
const CONSUMABLE_FOOD = 4;
const CONSUMABLE_BOOK = 9;

const SLOT_HEAD = 1;
const SLOT_FEET = 7;
const SLOT_HANDS = 8;

export interface ItemKind {
  itemClass: number;
  subClass: number;
  /** Where it is worn; 0 for something never worn. */
  inventoryType: number;
}

/** The sound of putting an item on (`on`) or taking it off. */
export function equipSound(item: ItemKind, on: boolean): string {
  return `sfx_ui_menu_${on ? 'equip' : 'unequip'}_${wornAs(item)}`;
}

/** Which of the pack's equip sounds an item makes. */
function wornAs(item: ItemKind): string {
  if (item.itemClass === CLASS_WEAPON) return wieldedAs(item.subClass);
  if (item.itemClass === CLASS_ARMOUR) {
    switch (item.subClass) {
      case ARMOUR_SHIELD:
        return 'shield_metal';
      case ARMOUR_OFF_HAND:
        return 'weapon_magical';
      case ARMOUR_JEWELLERY:
        return 'accessory';
    }
    // Clothing sounds by the part of the body it goes on first, then by what
    // it is made of.
    if (item.inventoryType === SLOT_HEAD) return 'helmet';
    if (item.inventoryType === SLOT_FEET) return 'boot';
    if (item.inventoryType === SLOT_HANDS) return 'glove';
    if (item.subClass === ARMOUR_MAIL) return 'armor_metal';
    if (item.subClass === ARMOUR_CLOTH || item.subClass === ARMOUR_LEATHER) return 'armor_leather';
  }
  return 'generic';
}

/** A weapon's equip sound, by the kind of thing it is. */
function wieldedAs(subClass: number): string {
  switch (heldKind(CLASS_WEAPON, subClass)) {
    case 'bow':
    case 'crossbow':
      return 'weapon_bow';
    case 'wand':
      return 'weapon_magical';
    case 'pole':
      return 'weapon_wood';
    default:
      return 'weapon_metal';
  }
}

/** The sound of picking an item up (`up`) or setting it down. */
export function handleSound(item: Pick<ItemKind, 'itemClass' | 'subClass'>, up: boolean): string {
  return `sfx_ui_${up ? 'pickup' : 'drop'}_${handledAs(item)}`;
}

/** Which of the pack's pick-up and set-down sounds an item makes. */
function handledAs({ itemClass, subClass }: Pick<ItemKind, 'itemClass' | 'subClass'>): string {
  if (itemClass === CLASS_HANDBOOK) return 'paper';
  if (itemClass === CLASS_MATERIAL) return 'food';
  if (itemClass !== CLASS_CONSUMABLE) return 'equipment';
  switch (subClass) {
    case CONSUMABLE_POTION:
      return 'potion';
    case CONSUMABLE_FOOD:
      return 'food';
    case CONSUMABLE_SCROLL:
    case CONSUMABLE_BOOK:
      return 'paper';
    default:
      return 'magic';
  }
}
