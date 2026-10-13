/**
 * What an item is, out of the local game data.
 *
 * A market row crosses the wire as an entry number and nothing else — no
 * quality to colour its name by, no level it asks for, no words about what
 * it is for. All three sit in the item's own row, so a gap here shows up as
 * a market list with a blank level column and a card with nothing on it.
 *
 * The fixtures below put quality, required level and the description string
 * in the columns the reader takes them from, so a reader that shifts a
 * column reads the wrong one here.
 */

import { describe, expect, it } from 'vitest';

import { WorldTables } from '../src/assets/formats/tables';
import { buildTable, buildTableFiles } from './helpers/fixtures';

function loader(overrides: Array<{ name: string; data: Uint8Array }>) {
  const files = new Map(buildTableFiles().map(e => [e.name, e.data]));
  for (const override of overrides) files.set(override.name, override.data);
  return async (entry: string) => files.get(entry) ?? null;
}

/**
 * `items.tbl` as far as the columns this reads: through column 81, with
 * the four float columns a weapon's damage sits in written as floats.
 */
const ITEMS_FORMAT = Array.from({ length: 82 }, (_, at) =>
  at === 48 || at === 49 || at === 51 || at === 52 ? 'f' : 'u',
).join('');

/** One row, with only the columns under test filled in. */
function row(
  entry: number,
  quality: number,
  level: number,
  description: number,
  worn = 0,
  armour = 0,
  binding = 0,
  more: {
    allowedClasses?: number;
    stats?: Array<[number, number]>;
    block?: number;
    spells?: number[];
    triggers?: number[];
    quest?: number;
  } = {},
): number[] {
  const cells = Array<number>(82).fill(0);
  cells[0] = entry;
  cells[1] = 4; // armour
  cells[2] = 4; // plate
  cells[3] = 900 + entry; // the name string, which this does not read
  cells[5] = quality;
  cells[11] = worn;
  cells[16] = level;
  cells[71] = description;
  cells[54] = armour;
  cells[70] = binding;
  cells[13] = more.allowedClasses ?? 0;
  cells[81] = more.block ?? 0;
  for (const [at, spell] of (more.spells ?? []).entries()) {
    cells[58 + at * 6] = spell;
    cells[59 + at * 6] = more.triggers?.[at] ?? 1;
  }
  cells[75] = more.quest ?? 0;
  for (const [at, [kind, value]] of (more.stats ?? []).entries()) {
    cells[28 + at * 2] = kind;
    cells[29 + at * 2] = value;
  }
  return cells;
}

describe('what an item is', () => {
  it('reads the quality, the level it asks for, and what describes it', async () => {
    const items = buildTable(
      ITEMS_FORMAT,
      [
        row(3, 3, 42, 777, 5, 288, 2, {
          allowedClasses: 0b10,
          stats: [[22, 18]],
          block: 7,
          spells: [4471],
        }),
      ],
      [3],
    );
    const tables = await WorldTables.load(loader([{ name: 'tables/items.tbl', data: items }]));

    expect(tables.itemFacts(3)).toEqual({
      itemClass: 4,
      subClass: 4,
      quality: 3,
      requiredLevel: 42,
      descriptionId: 777,
      inventoryType: 5,
      armour: 288,
      binding: 2,
      allowedClasses: 0b10,
      stats: [{ kind: 22, value: 18 }],
      damage: [],
      delay: 0,
      block: 7,
      spells: [4471],
      spellSlots: [{ id: 4471, trigger: 1 }],
      startsQuest: 0,
    });
  });

  it('reads when each spell fires, and the quest an item offers', async () => {
    // What using an item does rests on these two: a spell slot's trigger
    // says whether it fires on use or while worn, and the quest column
    // names the quest using it offers.
    const items = buildTable(
      ITEMS_FORMAT,
      [
        row(3, 3, 42, 777, 5, 288, 2, { spells: [4471, 52], triggers: [2, 1] }),
        row(4, 2, 0, 0, 0, 0, 4, { quest: 9101 }),
      ],
      [3, 4],
    );
    const tables = await WorldTables.load(loader([{ name: 'tables/items.tbl', data: items }]));

    expect(tables.itemFacts(3)?.spellSlots).toEqual([
      { id: 4471, trigger: 2 },
      { id: 52, trigger: 1 },
    ]);
    expect(tables.itemFacts(3)?.startsQuest).toBe(0);
    expect(tables.itemFacts(4)?.startsQuest).toBe(9101);
    expect(tables.itemFacts(4)?.spellSlots).toEqual([]);
  });

  it('keeps only the slots an item actually filled', async () => {
    // Nine pairs are reserved whether or not an item uses them, and an
    // amount of nothing is a slot left empty rather than a thing worth
    // nothing: a card would otherwise say a ring raises strength by zero.
    const items = buildTable(
      ITEMS_FORMAT,
      [
        row(3, 3, 42, 777, 5, 288, 2, {
          stats: [
            [11, 4],
            [0, 0],
            [12, 0],
          ],
        }),
      ],
      [3],
    );
    const tables = await WorldTables.load(loader([{ name: 'tables/items.tbl', data: items }]));

    expect(tables.itemFacts(3)?.stats).toEqual([{ kind: 11, value: 4 }]);
  });

  it('says nothing rather than guessing for an item the build has no row for', async () => {
    const items = buildTable(ITEMS_FORMAT, [row(3, 3, 42, 777, 5, 288, 2)], [3]);
    const tables = await WorldTables.load(loader([{ name: 'tables/items.tbl', data: items }]));

    expect(tables.itemFacts(9999)).toBeNull();
  });

  it('answers zeroes for an item the build carries but says little about', async () => {
    // Most stackable goods have no description and ask for no level. That
    // is an answer, not a gap: the card simply says less about them.
    const items = buildTable(ITEMS_FORMAT, [row(5206, 2, 0, 0)], [5206]);
    const tables = await WorldTables.load(loader([{ name: 'tables/items.tbl', data: items }]));

    expect(tables.itemFacts(5206)).toEqual({
      itemClass: 4,
      subClass: 4,
      quality: 2,
      requiredLevel: 0,
      descriptionId: 0,
      inventoryType: 0,
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
    });
  });
});
