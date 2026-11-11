/**
 * Which side tab of the spell book a spell is listed under, by its
 * `spell_skillset` row and, for a GM's spells, its name. Measured in 1.1.4:
 * set 1 holds the life skills (auto attack and shoot, switching target, race
 * skills) and 2 the teleport; 11 to 22 are the class trees, three to a class
 * of which the third is unnamed and unused, and 111 to 122 the same trees
 * again; 23 to 26 are the craft recipes; 101 and 102 the mounts and riding
 * skills; 0 every spell with no class, gathering and the test and GM rows
 * among them.
 */

export type SpellBookPage =
  | 'lifeSkills'
  | 'treeOne'
  | 'treeTwo'
  | 'crafting'
  | 'gm'
  | 'mounts'
  | 'none';

/** The side tabs in the order they stand, top to bottom. */
export const SPELL_BOOK_PAGES: readonly SpellBookPage[] = [
  'lifeSkills',
  'treeOne',
  'treeTwo',
  'crafting',
  'gm',
];

/**
 * A GM's test and tool spells, by the words the build names them with. The
 * server holds the same rule; "God" alone also names real gear ("Robe of
 * Healer of God"), so only the tool row's own name counts.
 */
const GM_NAMED = /\btest\b|\bsandbox\b|\bdebug\b|^\s*gm\s*:|^god attribute/i;

export function spellBookPage(skillSet: number, name = ''): SpellBookPage {
  if (GM_NAMED.test(name)) return 'gm';
  if (skillSet === 1 || skillSet === 2) return 'lifeSkills';
  if (skillSet === 101 || skillSet === 102) return 'mounts';
  if (skillSet >= 23 && skillSet <= 26) return 'crafting';
  const tree = skillSet >= 111 ? skillSet - 100 : skillSet;
  if (tree >= 11 && tree <= 22) {
    const at = (tree - 11) % 3;
    return at === 0 ? 'treeOne' : at === 1 ? 'treeTwo' : 'none';
  }
  return 'none';
}

/** A spell the bar would not take that the book still lists: a GM's own, and the crafts. */
export function listedThoughNotCastable(skillSet: number, name = ''): boolean {
  const page = spellBookPage(skillSet, name);
  return page === 'gm' || page === 'crafting';
}
