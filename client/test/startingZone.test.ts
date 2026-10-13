import { describe, expect, it } from 'vitest';

import { startingZone, zoneForArrival } from '../src/app/startingZone';
import type { ZoneInfo } from '../src/assets/types';
import { loadConfig } from '../src/core/config';

let nextId = 1;

function zone(over: Partial<ZoneInfo> = {}): ZoneInfo {
  const id = over.id ?? nextId++;
  return {
    id,
    name: `Zone ${id}`,
    mapId: 1,
    mapName: 'test-map',
    centre: [0, 0],
    bounds: [0, 0, 100, 100],
    hasScenery: true,
    parentId: -1,
    priority: 1,
    icon: '',
    friendly: 2,
    atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 0, skybox: null },
    sound: { music: 0, ambience: 0 },
    ...over,
  };
}

const NO_WISH = { id: null, name: null };

describe('startingZone, with nothing asked for', () => {
  it('opens a top-level zone on the map holding the most zones', () => {
    const zones = [
      zone({ id: 1, mapId: 7, priority: 1 }),
      zone({ id: 2, mapId: 8, priority: 1 }),
      zone({ id: 3, mapId: 8, priority: 13 }),
      zone({ id: 4, mapId: 8, priority: 13 }),
      zone({ id: 5, mapId: 7, priority: 13 }),
    ];
    expect(startingZone(zones, NO_WISH).zone.id).toBe(2);
  });

  it('opens the first top-level zone that has scenery, and says nothing', () => {
    const zones = [
      zone({ id: 10, hasScenery: false, priority: 1 }),
      zone({ id: 11, hasScenery: true, priority: 13 }),
      zone({ id: 12, hasScenery: true, priority: 2 }),
      zone({ id: 13, hasScenery: true, priority: 1 }),
    ];
    const picked = startingZone(zones, NO_WISH);
    expect(picked.zone.id).toBe(12);
    expect(picked.problem).toBeNull();
  });

  it('falls back to any zone with scenery when no top-level zone has any', () => {
    const zones = [
      zone({ id: 20, hasScenery: false, priority: 1 }),
      zone({ id: 21, hasScenery: true, priority: 13 }),
    ];
    expect(startingZone(zones, NO_WISH).zone.id).toBe(21);
  });

  it('opens the first zone when none has scenery', () => {
    const zones = [zone({ id: 30, hasScenery: false }), zone({ id: 31, hasScenery: false })];
    expect(startingZone(zones, NO_WISH).zone.id).toBe(30);
  });
});

describe('startingZone, with ?zone= set', () => {
  it('opens the zone with that id', () => {
    const zones = [zone({ id: 40 }), zone({ id: 41, hasScenery: false, priority: 13 })];
    const picked = startingZone(zones, { id: 41, name: null });
    expect(picked.zone.id).toBe(41);
    expect(picked.problem).toBeNull();
  });

  it('says so when the id is not in the table, and opens the default', () => {
    const zones = [zone({ id: 50, priority: 13 }), zone({ id: 51 })];
    const picked = startingZone(zones, { id: 999, name: null });
    expect(picked.zone.id).toBe(51);
    expect(picked.problem).toContain('999');
  });

  it('matches a name whatever its case, preferring the largest of a shared name', () => {
    const zones = [
      zone({ id: 60 }),
      zone({ id: 61, name: 'Test Vale', bounds: [0, 0, 10, 10] }),
      zone({ id: 62, name: 'Test Vale', bounds: [0, 0, 500, 500], mapId: 2 }),
    ];
    const picked = startingZone(zones, { id: null, name: 'test vale' });
    expect(picked.zone.id).toBe(62);
    expect(picked.problem).toBeNull();
  });

  it('takes a zone whose name contains the text when nothing matches it whole', () => {
    const zones = [zone({ id: 70 }), zone({ id: 71, name: 'Upper Test Vale' })];
    expect(startingZone(zones, { id: null, name: 'Test Vale' }).zone.id).toBe(71);
  });

  it('says so when no name matches, and opens the default', () => {
    const zones = [zone({ id: 80, priority: 13 }), zone({ id: 81, name: 'Sample Town' })];
    const picked = startingZone(zones, { id: null, name: 'Nowhere' });
    expect(picked.zone.id).toBe(81);
    expect(picked.problem).toContain('Nowhere');
    expect(picked.problem).toContain('Sample Town');
  });
});

describe('?zone=, as the config reads it', () => {
  it('asks for no zone by default', () => {
    const cfg = loadConfig('');
    expect(cfg.defaultZoneId).toBeNull();
    expect(cfg.defaultZoneName).toBeNull();
  });

  it('reads a number as an id and anything else as a name', () => {
    expect(loadConfig('?zone=471')).toMatchObject({ defaultZoneId: 471, defaultZoneName: null });
    expect(loadConfig('?zone=Test%20Vale')).toMatchObject({
      defaultZoneId: null,
      defaultZoneName: 'Test Vale',
    });
  });
});

describe('zoneForArrival', () => {
  const at = (mapId: number, x: number, z: number) => ({
    mapId,
    position: [x, 0, z] as [number, number, number],
  });

  it('opens the smallest zone on the server’s map that holds the position', () => {
    const zones = [
      zone({ id: 1, mapId: 5, bounds: [0, 0, 1000, 1000] }),
      zone({ id: 2, mapId: 5, bounds: [100, 100, 200, 200] }),
      zone({ id: 3, mapId: 6, bounds: [100, 100, 150, 150] }),
    ];
    const picked = zoneForArrival(zones, at(5, 150, 150), NO_WISH);
    expect(picked.zone.id).toBe(2);
    expect(picked.problems).toEqual([]);
  });

  it('counts a position on the edge as inside', () => {
    const zones = [zone({ id: 1, mapId: 5, bounds: [0, 0, 100, 100] })];
    expect(zoneForArrival(zones, at(5, 100, 0), NO_WISH).problems).toEqual([]);
  });

  it('opens the largest zone on the map for a position outside them all, and says so', () => {
    const zones = [
      zone({ id: 1, mapId: 5, name: 'Small', bounds: [0, 0, 10, 10] }),
      zone({ id: 2, mapId: 5, name: 'Large', bounds: [0, 0, 100, 100] }),
    ];
    const picked = zoneForArrival(zones, at(5, 500.4, 700.6), NO_WISH);
    expect(picked.zone.id).toBe(2);
    expect(picked.problems).toEqual([
      'position (500, 701) is outside every zone on map 5; opened Large',
    ]);
  });

  it('falls back to what was asked for when the data has no zone on the server’s map, saying both', () => {
    const zones = [zone({ id: 1, mapId: 7 }), zone({ id: 2, mapId: 7, name: 'Wanted' })];
    const picked = zoneForArrival(zones, at(9, 1, 1), { id: 2, name: null });
    expect(picked.zone.id).toBe(2);
    expect(picked.problems).toEqual([
      'server put us on map 9, which the mounted data has no zone for',
    ]);

    const missing = zoneForArrival(zones, at(9, 1, 1), { id: 99, name: null });
    expect(missing.problems).toEqual([
      'server put us on map 9, which the mounted data has no zone for',
      `zone id 99 not found; opened ${missing.zone.name}`,
    ]);
  });

  it('goes by the wish alone with no spawn', () => {
    const zones = [zone({ id: 1 }), zone({ id: 2, name: 'Wanted' })];
    expect(zoneForArrival(zones, null, { id: null, name: 'wanted' })).toMatchObject({
      zone: { id: 2 },
      problems: [],
    });
  });

  it('does not reorder the zones it was given', () => {
    const zones = [
      zone({ id: 1, mapId: 5, bounds: [0, 0, 100, 100] }),
      zone({ id: 2, mapId: 5, bounds: [0, 0, 10, 10] }),
    ];
    zoneForArrival(zones, at(5, 5, 5), NO_WISH);
    expect(zones.map(z => z.id)).toEqual([1, 2]);
  });
});
