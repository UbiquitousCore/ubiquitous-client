import { describe, expect, it } from 'vitest';

import { ITEM_OK, itemErrorMessage, itemResultOk } from '../src/net/itemErrors';

describe('item result codes', () => {
  it('knows success by name', () => {
    expect(ITEM_OK).toBe('ok');
    expect(itemResultOk(ITEM_OK)).toBe(true);
    expect(itemResultOk('inventoryFull')).toBe(false);
  });

  it('names the refusals the vendor path can produce', () => {
    expect(itemErrorMessage('inventoryFull')).toContain('bags are full');
    expect(itemErrorMessage('notEnoughMoney')).toContain('afford');
    expect(itemErrorMessage('vendorDoesNotSell')).toContain('does not sell');
    expect(itemErrorMessage('cantSell')).toBe('No vendor will buy that.');
  });

  it('says something useful about a code it does not know', () => {
    expect(itemErrorMessage('somethingNew')).toContain('somethingNew');
    expect(itemErrorMessage(ITEM_OK)).toBe('Done.');
  });
});
