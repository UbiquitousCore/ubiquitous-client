import { describe, expect, it } from 'vitest';
import { MOST_ITEM_HITS, searchItems } from '../src/ui/itemSearch';

const catalog = [
  { entry: 10, name: 'Iron Sword' },
  { entry: 11, name: 'Sword of Dawn' },
  { entry: 12, name: 'Wooden Shield' },
  { entry: 13, name: 'Broadsword' },
];

describe('searchItems', () => {
  it('finds names holding the words, those opening with them first', () => {
    expect(searchItems(catalog, 'sword').map(item => item.entry)).toEqual([11, 10, 13]);
  });

  it('ignores case and the space around the words', () => {
    expect(searchItems(catalog, '  SHIELD ').map(item => item.entry)).toEqual([12]);
  });

  it('takes a number for the entry itself', () => {
    expect(searchItems(catalog, '12')).toEqual([{ entry: 12, name: 'Wooden Shield' }]);
    expect(searchItems(catalog, '999')).toEqual([]);
  });

  it('finds nothing for a single letter or for nothing', () => {
    expect(searchItems(catalog, 's')).toEqual([]);
    expect(searchItems(catalog, '')).toEqual([]);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ entry: i + 1, name: `Sword ${i}` }));
    expect(searchItems(many, 'sword')).toHaveLength(MOST_ITEM_HITS);
    expect(searchItems(many, 'sword', 5)).toHaveLength(5);
  });
});
