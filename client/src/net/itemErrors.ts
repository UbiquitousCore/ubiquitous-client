/** Item result codes as the server names them, with a plain-English sentence
 * for each. `ok` means the action worked. */

/** The code that means success. */
export const ITEM_OK = 'ok';

const MESSAGES: Record<string, string> = {
  inventoryFull: 'Your bags are full.',
  destinationOccupied: 'That slot is not empty.',
  itemNotInSlot: 'That item is not in that slot.',
  unknownItem: 'That item does not exist.',
  wrongSlot: 'That item does not go there.',
  vendorDoesNotSell: 'The vendor does not sell that.',
  notAVendor: 'That is not a vendor.',
  cantSell: 'No vendor will buy that.',
  notEnoughMoney: 'You cannot afford that.',
  cantEquip: 'You cannot equip that.',
};

/** True when a result code means the operation worked. */
export function itemResultOk(code: string): boolean {
  return code === ITEM_OK;
}

/** A readable reason for a result code, success included. */
export function itemErrorMessage(code: string): string {
  if (itemResultOk(code)) return 'Done.';
  return MESSAGES[code] ?? `The server refused that (${code}).`;
}
