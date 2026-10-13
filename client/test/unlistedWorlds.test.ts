/**
 * The worlds a build ships and its own map table never names.
 *
 * The ground the screens before the world stand on is one of them on the
 * build most people run: the pack is there, with its tiles and its layer
 * pack beside it, and nothing in the tables points at it. Left out of the
 * zone list, there is no way to walk into it at all.
 */

import { describe, expect, it } from 'vitest';

import { UNLISTED_WORLD_ID, unlistedWorlds } from '../src/assets/providers/localZone';
import type { WorldTables } from '../src/assets/formats/tables';
import type { Library } from '../src/assets/vfs/Library';

/** Only what the listing asks of either of them. */
function build(packs: readonly string[], maps: readonly string[]): [WorldTables, Library] {
  const tables = {
    maps: () => maps.map((world, id) => ({ id, world })),
  } as unknown as WorldTables;
  const held = new Set(packs.map(one => one.toLowerCase()));
  const lib = {
    packNames: () => [...packs],
    hasPack: (name: string) => held.has(name.toLowerCase()),
  } as unknown as Library;
  return [tables, lib];
}

describe('worlds the map table never names', () => {
  it('lists a world that ships its own tiles and layers', () => {
    const [tables, lib] = build(
      ['res.bin', 'tables.bin', 'human_selection.bin', 'human_selection_layer.bin'],
      ['world/land1.wld'],
    );

    const found = unlistedWorlds(tables, lib);

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('human_selection');
    expect(found[0]!.world).toBe('human_selection');
    expect(found[0]!.id).toBeGreaterThanOrEqual(UNLISTED_WORLD_ID);
  });

  it('leaves out a world the table already names', () => {
    const [tables, lib] = build(['land1.bin', 'land1_layer.bin'], ['world/land1.wld']);

    expect(unlistedWorlds(tables, lib)).toEqual([]);
  });

  it('leaves out packs that are not worlds at all', () => {
    // No layer pack beside it, which is what every map ships and
    // nothing else does.
    const [tables, lib] = build(['res.bin', 'sound.bin', 'tables.bin'], []);

    expect(unlistedWorlds(tables, lib)).toEqual([]);
  });

  it('gives each world it finds an id of its own', () => {
    const [tables, lib] = build(['a.bin', 'a_layer.bin', 'b.bin', 'b_layer.bin'], []);

    const found = unlistedWorlds(tables, lib);

    expect(found.map(one => one.id)).toEqual([UNLISTED_WORLD_ID, UNLISTED_WORLD_ID + 1]);
  });
});
