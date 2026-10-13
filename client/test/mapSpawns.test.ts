import { describe, expect, it } from 'vitest';

import { MapSpawns } from '../src/assets/providers/localTile';

type Tables = Parameters<typeof MapSpawns.build>[0];

function tables(entries: number[]): Tables {
  const rows = entries.map(entry => [0, entry, 1, 10, 0, 10, 0, 0, 0, 0, 0, 1]);
  return {
    rowsOf: (name: string) => (name === 'staticobject_spawns' ? rows : []),
    staticModel: () => ({ path: 'prop.bdae', scale: 1, type: 0 }),
    staticEffects: () => [],
    creatureModel: () => ({ path: '', scale: 1, skin: null }),
  } as unknown as Tables;
}

describe('MapSpawns', () => {
  it('places an ordinary static object', () => {
    const spawns = MapSpawns.build(tables([7001]), 1);

    expect(spawns.staticsAt(0, 0).map(s => s.entry)).toEqual([7001]);
  });

  it('leaves the ore locations to the server', () => {
    const spawns = MapSpawns.build(tables([52, 7001]), 1);

    expect(spawns.staticsAt(0, 0).map(s => s.entry)).toEqual([7001]);
  });
});
