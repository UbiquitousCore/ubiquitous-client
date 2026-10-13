import { describe, expect, it } from 'vitest';
import { moneyChange } from '../src/app/helpers/hud/moneyChange';
import { isResultOfPick } from '../src/app/helpers/npc/pickedChoice';
import { friendsAdded } from '../src/app/features/social/friendsAdded';

describe('moneyChange', () => {
  it('says nothing when the purse is absent or unchanged', () => {
    expect(moneyChange(100, undefined)).toBeNull();
    expect(moneyChange(100, 100)).toBeNull();
  });

  it('reports the difference, negative for money spent', () => {
    expect(moneyChange(100, 350)).toEqual({ money: 350, gained: 250 });
    expect(moneyChange(350, 100)).toEqual({ money: 100, gained: -250 });
  });

  it('takes the first purse of a session without announcing it', () => {
    expect(moneyChange(null, 500)).toEqual({ money: 500, gained: null });
  });
});

describe('friendsAdded', () => {
  it('names only the entries the old list lacked', () => {
    expect(friendsAdded([{ name: 'Ann' }], [{ name: 'Ann' }, { name: 'Bo' }])).toEqual(['Bo']);
  });

  it('is empty when nothing was added', () => {
    expect(friendsAdded([{ name: 'Ann' }], [{ name: 'Ann' }])).toEqual([]);
  });
});

describe('isResultOfPick', () => {
  const picked = { networkId: 7, menuId: 2, choice: { scriptSlot: 3 } };

  it('matches the npc, menu and slot that were picked', () => {
    expect(isResultOfPick(picked, 7, 2, 3)).toBe(true);
  });

  it.each([
    [8, 2, 3],
    [7, 9, 3],
    [7, 2, 4],
  ])('does not match npc %i menu %i slot %i', (n, m, s) => {
    expect(isResultOfPick(picked, n, m, s)).toBe(false);
  });

  it('does not match when nothing was picked', () => {
    expect(isResultOfPick(null, 7, 2, 3)).toBe(false);
  });
});
