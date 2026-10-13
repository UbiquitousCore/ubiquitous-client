/**
 * Object-attached effects: the columns that carry them, and where they land.
 *
 * `staticobject_displayinfo` names up to six (node, effect) pairs per object
 * and the client hangs each `.beff` off the node it names.
 * Two things can go wrong quietly: reading the wrong
 * columns, which yields plausible-looking rubbish, and dropping the node
 * offset, which puts every effect at its object's feet.
 */

import { describe, expect, it } from 'vitest';

import { WorldTables } from '../src/assets/formats/tables';
import { offsetBy } from '../src/assets/providers/localZone';
import { buildTable, buildTableFiles } from './helpers/fixtures';

/** `WorldTables.load` reads `tables/<name>.tbl`; serve those from memory. */
function loader(override?: { name: string; data: Uint8Array }) {
  const files = new Map(buildTableFiles().map(e => [e.name, e.data]));
  if (override) files.set(override.name, override.data);
  return async (entry: string) => files.get(entry) ?? null;
}

describe('attached effects', () => {
  it('finds the effect columns by shape, not by number', async () => {
    const tables = await WorldTables.load(loader());
    // Entry 900's proto points at display 77, which carries one pair.
    expect(tables.staticEffects(900)).toEqual([
      { node: 'fx_top', effect: 'effects/scene/chest_glow.beff' },
    ]);
  });

  it('skips a pair with either half missing', async () => {
    // A node with no effect and an effect with no node have nothing to hang
    // or nowhere to hang it, so neither becomes a placement.
    const cols: (number | string)[] = new Array(12).fill('');
    cols[0] = 'fx_top'; // node, no effect
    cols[7] = 'effects/orphan.beff'; // effect, no node
    const data = buildTable(
      'usuuuuussssssssssss',
      [[0, 'model/scene/tree.bdae', 0, 0, 0, 0, 0, ...cols]],
      [77],
    );
    const tables = await WorldTables.load(
      loader({ name: 'tables/staticobject_displayinfo.tbl', data }),
    );
    expect(tables.staticEffects(900)).toEqual([]);
  });

  it('yields nothing, rather than throwing, on a shape it does not know', async () => {
    // These columns are decoration. A build that does not match must still
    // load its zones -- the objects themselves are unaffected.
    const data = buildTable('usuuu', [[0, 'model/scene/tree.bdae', 0, 0, 0]], [77]);
    const tables = await WorldTables.load(
      loader({ name: 'tables/staticobject_displayinfo.tbl', data }),
    );
    expect(tables.staticEffects(900)).toEqual([]);
    // ...and the rest of the table still reads.
    expect(tables.staticModel(900).path).toBe('model/scene/tree.bdae');
  });
});

describe('offsetBy', () => {
  const near = (got: number[], want: number[]) => {
    got.forEach((g, i) => expect(g).toBeCloseTo(want[i], 6));
  };

  it('leaves the position alone when the node is not found', () => {
    expect(offsetBy([1, 2, 3], undefined, [0, 0, 0, 1], 2)).toEqual([1, 2, 3]);
  });

  it('adds an unrotated offset straight on', () => {
    near(offsetBy([1, 2, 3], [0, 4, 0], [0, 0, 0, 1], 1), [1, 6, 3]);
  });

  it('scales the offset with the object', () => {
    near(offsetBy([0, 0, 0], [0, 4, 0], [0, 0, 0, 1], 2), [0, 8, 0]);
  });

  it('turns the offset with the object', () => {
    // A quarter turn about Y sends +x to -z.
    const q: [number, number, number, number] = [
      0,
      Math.sin(Math.PI / 4),
      0,
      Math.cos(Math.PI / 4),
    ];
    near(offsetBy([0, 0, 0], [3, 0, 0], q, 1), [0, 0, -3]);
  });

  it('keeps height while turning, which is what a torch flame needs', () => {
    const q: [number, number, number, number] = [
      0,
      Math.sin(Math.PI / 3),
      0,
      Math.cos(Math.PI / 3),
    ];
    const got = offsetBy([10, 5, -2], [0, 4, 0], q, 1);
    near(got, [10, 9, -2]);
  });
});
