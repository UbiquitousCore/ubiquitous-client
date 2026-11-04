/**
 * Which side tab of the spell book a spell is listed under, by its
 * `spell_skillset` row. Measured in 1.1.4: set 1 holds the basics (auto
 * attack, auto shoot) and 2 the teleport; 11 to 22 are the class trees, three
 * to a class, and 111 to 122 the same trees again; 23 to 26 are the craft
 * recipes; 101 and 102 the mounts and riding skills; 0 is every spell with no
 * class, the build's test and GM rows among them.
 */

export type SpellBookPage = 'basic' | 'treeOne' | 'treeTwo' | 'treeThree' | 'crafts' | 'gm' | 'mounts';

/** The side tabs in the order they stand, top to bottom. */
export const SPELL_BOOK_PAGES: readonly SpellBookPage[] = [
  'basic',
  'treeOne',
  'treeTwo',
  'treeThree',
  'crafts',
  'gm',
];

const TREES: readonly SpellBookPage[] = ['treeOne', 'treeTwo', 'treeThree'];

export function spellBookPage(skillSet: number): SpellBookPage {
  if (skillSet === 0) return 'gm';
  if (skillSet === 101 || skillSet === 102) return 'mounts';
  if (skillSet >= 23 && skillSet <= 26) return 'crafts';
  const tree = skillSet >= 111 ? skillSet - 100 : skillSet;
  if (tree >= 11 && tree <= 22) return TREES[(tree - 11) % 3]!;
  return 'basic';
}

/** A spell the bar would not take that the book still lists: those with no class, and the crafts. */
export function listedThoughNotCastable(skillSet: number): boolean {
  const page = spellBookPage(skillSet);
  return page === 'gm' || page === 'crafts';
}
