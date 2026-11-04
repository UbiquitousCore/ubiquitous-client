import { describe, expect, it } from 'vitest';

import { listedThoughNotCastable, spellBookPage } from '../src/gameplay/spellBookPages';

describe('which side tab of the spell book a spell is under', () => {
  it('puts the basics, each class tree, the crafts and the classless spells apart', () => {
    expect(spellBookPage(1)).toBe('basic');
    expect(spellBookPage(2)).toBe('basic');
    expect(spellBookPage(11)).toBe('treeOne');
    expect(spellBookPage(12)).toBe('treeTwo');
    expect(spellBookPage(13)).toBe('treeThree');
    expect(spellBookPage(20)).toBe('treeOne');
    expect(spellBookPage(23)).toBe('crafts');
    expect(spellBookPage(26)).toBe('crafts');
    expect(spellBookPage(0)).toBe('gm');
    expect(spellBookPage(101)).toBe('mounts');
  });

  it('reads the second copy of a tree as that tree', () => {
    expect(spellBookPage(111)).toBe('treeOne');
    expect(spellBookPage(121)).toBe('treeTwo');
  });

  it('lists the classless spells and the crafts though the bar would not take them', () => {
    expect(listedThoughNotCastable(0)).toBe(true);
    expect(listedThoughNotCastable(24)).toBe(true);
    expect(listedThoughNotCastable(11)).toBe(false);
  });
});
