import { describe, expect, it } from 'vitest';

import { listedThoughNotCastable, spellBookPage } from '../src/gameplay/spellBookPages';

describe('which side tab of the spell book a spell is under', () => {
  it('puts the life skills, each class tree and the crafts apart', () => {
    expect(spellBookPage(1, 'Auto Attack')).toBe('lifeSkills');
    expect(spellBookPage(2, 'teleport')).toBe('lifeSkills');
    expect(spellBookPage(14, 'Charge')).toBe('treeOne');
    expect(spellBookPage(15, 'Shield Wall')).toBe('treeTwo');
    expect(spellBookPage(25, 'Handmade leather gloves')).toBe('crafting');
    expect(spellBookPage(101, 'Brown Horse')).toBe('mounts');
  });

  it('reads the second copy of a tree as that tree, and leaves the unnamed third tree out', () => {
    expect(spellBookPage(111, 'Fireball')).toBe('treeOne');
    expect(spellBookPage(121, 'Focus')).toBe('treeTwo');
    expect(spellBookPage(13, 'shadow word I')).toBe('none');
  });

  it('gives a GM their test and tool spells by name, and lists gathering nowhere', () => {
    expect(spellBookPage(0, 'Test Stun')).toBe('gm');
    expect(spellBookPage(0, 'GM:Offhand Expert')).toBe('gm');
    expect(spellBookPage(0, 'God Attribute1')).toBe('gm');
    expect(spellBookPage(0, 'Gather mine')).toBe('none');
    expect(spellBookPage(0, 'Robe of Healer of God')).toBe('none');
  });

  it('lists a GM spell and a craft though the bar would not take them, and not gathering', () => {
    expect(listedThoughNotCastable(0, 'Test Stun')).toBe(true);
    expect(listedThoughNotCastable(24, 'Grenadine glove')).toBe(true);
    expect(listedThoughNotCastable(0, 'Gather mine')).toBe(false);
    expect(listedThoughNotCastable(11, 'Fireball')).toBe(false);
  });
});
