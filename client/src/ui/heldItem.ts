/** A held thing's card action: wear or remove, or Use while in the bag (observed in play by the owner). */

import type { ItemFacts } from '../assets/types';
import type { InventoryItem } from './inventoryStore';
import { useOf } from './items';

/** Our own names for what the card can offer. */
export type HeldAction = 'equip' | 'unequip' | 'use';

export function heldAction(
  item: Pick<InventoryItem, 'slot'>,
  facts: ItemFacts | null | undefined,
): HeldAction | null {
  if (!facts) return null;
  if (facts.inventoryType > 0) {
    return item.slot?.area === 'equipment' ? 'unequip' : 'equip';
  }
  return item.slot?.area === 'bag' && useOf(facts) !== null ? 'use' : null;
}
