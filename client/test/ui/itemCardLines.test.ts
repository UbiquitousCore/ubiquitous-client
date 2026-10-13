/**
 * What a card says about one thing.
 *
 * The order: how a thing binds, where it is worn and what it is, what it protects or hits for,
 * the level it asks, who may wear it, what it gives you, and last its own
 * words.
 *
 * The sentences here are invented stand-ins for the user's own strings.
 * Each holds one number.
 */

import { describe, expect, it } from 'vitest';

import { cardLines, holding } from '../../src/ui/itemCard';
import type { ScreenSpec } from '../../src/ui/art/uiSpec';
import type { ItemFacts } from '../../src/assets/types';

const ARMOUR_CLASS = 4;
const STRENGTH = 11;
const DODGE = 22;
const ARMOUR_GIFT = 10;
const BLOCK_GIFT = 21;

const SPEC: ScreenSpec = {
  dialog: 'card',
  card: { title: 'title', body: 'body' },
  names: {
    classes: ['', '', 'weapon', '', 'armour'],
    worn: ['', 'head', '', '', '', '', '', 'legs'],
    binds: ['', 'bound on taking', 'bound on wearing'],
    damageTypes: ['hits %d to %d', 'burns %d to %d'],
    subClasses: { '4': ['', 'cloth', '', '', 'plate'] },
    allowed: { '1': 'fighter', '2': 'caster' },
  },
  stats: {
    [STRENGTH]: 'strength up %d',
    [DODGE]: 'wearing this raises dodge by %d.',
    [ARMOUR_GIFT]: 'wearing this raises armour by %d.',
    [BLOCK_GIFT]: 'wearing this raises block by %d.',
  },
  formats: {
    armour: '%d armour',
    level: 'needs level %d',
    levelPrefix: 'needs',
    levelValue: 'at %d',
    speed: 'every %.1f s',
    dps: '(%.1f a second)',
    blockValue: 'wearing this raises block by %d.',
    allowedPrefix: 'who may wear it',
  },
  shape: {
    armourClass: ARMOUR_CLASS,
    plainKinds: [1, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14],
    armour: ARMOUR_GIFT,
    block: BLOCK_GIFT,
  },
};

function item(over: Partial<ItemFacts> = {}): ItemFacts {
  return {
    itemClass: ARMOUR_CLASS,
    subClass: 4,
    quality: 3,
    requiredLevel: 0,
    descriptionId: 0,
    inventoryType: 7,
    armour: 0,
    binding: 0,
    allowedClasses: 0,
    stats: [],
    damage: [],
    delay: 0,
    block: 0,
    spells: [],
    spellSlots: [],
    startsQuest: 0,
    ...over,
  };
}

const said = (facts: ItemFacts, over: Partial<Parameters<typeof cardLines>[0]> = {}) =>
  cardLines({ facts, level: 60, playerClass: 1, ...over }, SPEC);

describe('what a card says about one thing', () => {
  it('writes each thing in the order the card doc sets out', () => {
    const lines = said(
      item({
        binding: 2,
        armour: 288,
        requiredLevel: 42,
        allowedClasses: 0b10,
        stats: [{ kind: DODGE, value: 18 }],
      }),
      { describedAs: 'a plate legging' },
    );

    expect(lines.map(line => line.text)).toEqual([
      'bound on wearing',
      'legs',
      '288 armour',
      'needs level 42',
      'who may wear it',
      'fighter',
      'wearing this raises dodge by 18.',
      'a plate legging',
    ]);
  });

  it('says where a thing is worn and what it is made of on one line', () => {
    const [worn] = said(item({ inventoryType: 7 }));
    expect(worn).toMatchObject({ text: 'legs', far: 'plate' });
  });

  it('says nothing about where a thing is worn when it is not worn at all', () => {
    expect(said(item({ inventoryType: 0, itemClass: 0 }))).toEqual([]);
  });

  it('reddens only the number when the level is out of reach', () => {
    const lines = said(item({ requiredLevel: 42, inventoryType: 0 }), { level: 10 });
    expect(lines).toEqual([
      { text: 'needs', tone: 'plain' },
      // Written on the same line as the words before it, in red.
      { text: 'at 42', tone: 'loss', joined: true },
    ]);
  });

  it('names every class the mask allows, and greens them when the player is one', () => {
    const [, who] = said(item({ allowedClasses: 0b110 }), { playerClass: 2 }).slice(-2);
    expect(who).toEqual({ text: 'fighter, caster', tone: 'gain' });
  });

  it('reddens who may wear it when the player is not one of them', () => {
    const [, who] = said(item({ allowedClasses: 0b100 }), { playerClass: 1 }).slice(-2);
    expect(who).toEqual({ text: 'caster', tone: 'loss' });
  });

  it('greens armour that is partly a gift, and folds the gift into it', () => {
    const lines = said(item({ armour: 200, stats: [{ kind: ARMOUR_GIFT, value: 88 }] }));
    expect(lines).toContainEqual({ text: '288 armour', tone: 'gain' });
    // The gift is in the armour figure, so it is not also a line of its own.
    expect(lines.some(line => line.text.includes('raises armour'))).toBe(false);
  });

  it('writes what a weapon hits for instead of what it protects', () => {
    const lines = said(
      item({
        itemClass: 2,
        subClass: 1,
        inventoryType: 1,
        delay: 2600,
        damage: [{ min: 40, max: 60, kind: 0 }],
      }),
    );
    expect(lines.map(line => line.text)).toContain('hits 40 to 60');
    expect(lines.map(line => line.text)).toContain('every 2.6 s');
    expect(lines.map(line => line.text)).toContain('(19.2 a second)');
  });

  it('writes what a thing gives you above the level, or below it, as the kind says', () => {
    const lines = said(
      item({
        requiredLevel: 20,
        stats: [
          { kind: DODGE, value: 18 },
          { kind: STRENGTH, value: 4 },
        ],
      }),
    ).map(line => line.text);

    expect(lines.indexOf('strength up 4')).toBeLessThan(lines.indexOf('needs level 20'));
    expect(lines.indexOf('wearing this raises dodge by 18.')).toBeGreaterThan(
      lines.indexOf('needs level 20'),
    );
  });
});

describe('a card held up against what is already worn', () => {
  const held = item({ armour: 3, stats: [{ kind: DODGE, value: 0 }] });

  it('carries what wearing the other one instead would gain', () => {
    const lines = cardLines(
      {
        facts: held,
        level: 60,
        playerClass: 1,
        against: item({ armour: 288, stats: [{ kind: DODGE, value: 18 }] }),
      },
      SPEC,
    );
    expect(lines).toContainEqual({ text: '3 armour (+285)', tone: 'gain' });
    expect(lines).toContainEqual({
      text: 'wearing this raises dodge by 0. (+18)',
      tone: 'gain',
    });
  });

  it('reddens what wearing the other one instead would cost', () => {
    const lines = cardLines(
      { facts: item({ armour: 288 }), level: 60, playerClass: 1, against: item({ armour: 3 }) },
      SPEC,
    );
    expect(lines).toContainEqual({ text: '288 armour (-285)', tone: 'loss' });
  });

  it('writes a gift the worn thing does not have at all as all gain', () => {
    const lines = cardLines(
      {
        facts: item({ armour: 3 }),
        level: 60,
        playerClass: 1,
        against: item({ armour: 3, stats: [{ kind: STRENGTH, value: 7 }] }),
      },
      SPEC,
    );
    expect(lines).toContainEqual({ text: 'strength up 0 (+7)', tone: 'gain' });
  });
});

describe('what a thing does', () => {
  it('writes what its spells do above its own words, in the same colour', () => {
    const lines = said(item({ spells: [42] }), {
      does: ['Teleports you somewhere.'],
      describedAs: 'A sample description.',
    });

    expect(lines.slice(-2)).toEqual([
      { text: 'Teleports you somewhere.', tone: 'note' },
      { text: 'A sample description.', tone: 'note' },
    ]);
  });

  it('says nothing about a spell whose words have not arrived', () => {
    // The item's row names the spell; what it does is in the spell's own
    // row, and comes later or not at all. A card missing a line reads
    // better than one carrying a number nobody can read.
    const lines = said(item({ spells: [42] }), { describedAs: 'A sample description.' });
    expect(lines.filter(line => line.tone === 'note')).toEqual([
      { text: 'A sample description.', tone: 'note' },
    ]);
  });
});

describe('a card with no spec behind it yet', () => {
  it('writes nothing rather than bare figures', () => {
    expect(cardLines({ facts: item({ armour: 288 }), level: 60, playerClass: 1 }, null)).toEqual(
      [],
    );
  });
});

describe('what a press means', () => {
  it('is held when it is a finger or a pen', () => {
    expect(holding({ pointerType: 'touch' })).toBe(true);
    expect(holding({ pointerType: 'pen' })).toBe(true);
  });

  it('switches for a mouse, and for a press the browser cannot place', () => {
    // Holding a mouse button down to keep a card open is the worse of the
    // two mistakes, so anything unplaceable is treated as a pointer.
    expect(holding({ pointerType: 'mouse' })).toBe(false);
    expect(holding({})).toBe(false);
  });
});
