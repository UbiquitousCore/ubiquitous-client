/**
 * What a character can be made as, read out of the build's own rows.
 *
 * Synthetic tables with made-up numbers and names: the shapes are the thing
 * under test, not any particular build's contents.
 */

import { describe, expect, it } from 'vitest';

import { WorldTables } from '../src/assets/formats/tables';
import { buildTable, buildTableFiles } from './helpers/fixtures';

const base = new Map(buildTableFiles().map(entry => [entry.name, entry.data]));

function loader(extra: Array<{ name: string; data: Uint8Array }>) {
  const files = new Map(base);
  for (const one of extra) files.set(one.name, one.data);
  return async (entry: string) => files.get(entry) ?? null;
}

/** A race row: its key, then the two bodies and the name's own number. */
const RACE_FORMAT = 'uuuuuuu';
/** A class row: its key, then columns this does not read. */
const CLASS_FORMAT = 'uuuuuuuu';

describe('playableKinds', () => {
  it('offers each race with the body it wears for each sex, and its name', async () => {
    const races = buildTable(
      RACE_FORMAT,
      [
        [1, 0, 0, 7101, 7102, 9031, 9031],
        [4, 0, 0, 7401, 7402, 9034, 9034],
      ],
      [1, 4],
    );
    const tables = await WorldTables.load(
      loader([{ name: 'tables/character_race.tbl', data: races }]),
    );

    const offered = tables.playableKinds(
      new Map([
        [9031, 'First Folk'],
        [9034, 'Sample Folk'],
      ]),
    );

    expect(offered.races).toEqual([
      {
        race: 1,
        maleDisplayInfoId: 7101,
        femaleDisplayInfoId: 7102,
        nameTextId: 9031,
        name: 'First Folk',
      },
      {
        race: 4,
        maleDisplayInfoId: 7401,
        femaleDisplayInfoId: 7402,
        nameTextId: 9034,
        name: 'Sample Folk',
      },
    ]);
  });

  it('leaves a race unnamed rather than inventing a word for it', async () => {
    const races = buildTable(RACE_FORMAT, [[6, 0, 0, 7601, 7602, 9036, 9036]], [6]);
    const tables = await WorldTables.load(
      loader([{ name: 'tables/character_race.tbl', data: races }]),
    );

    expect(tables.playableKinds(new Map()).races[0].name).toBeNull();
  });

  it('offers a class by its number, which is all its row carries', async () => {
    const classes = buildTable(
      CLASS_FORMAT,
      [
        [1, 9, 0, 8141, 8142, 8143, 0, 0],
        [2, 9, 0, 8151, 8152, 8153, 0, 0],
      ],
      [1, 2],
    );
    const tables = await WorldTables.load(
      loader([{ name: 'tables/character_class.tbl', data: classes }]),
    );

    expect(tables.playableKinds(new Map()).classes).toEqual([
      { playerClass: 1 },
      { playerClass: 2 },
    ]);
  });

  it('offers nothing at all on a build whose tables carry no such rows', async () => {
    const tables = await WorldTables.load(loader([]));

    expect(tables.playableKinds(new Map())).toEqual({ races: [], classes: [] });
  });
});
