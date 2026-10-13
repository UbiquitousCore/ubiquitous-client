/**
 * A zone that leaves a fog field at zero takes it from the nearest zone above
 * it that sets that field: its parent first, then the parent's parent.
 *
 * In both builds of the user's files every zone with a missing fog field sits
 * directly under a top zone, so on that data the nearest zone that sets the
 * field and the top of the chain are the same zone. The synthetic chains
 * here are deeper, so the rule itself is pinned.
 */

import { describe, expect, it } from 'vitest';

import { fillMissingAtmosphere, type ZoneRow } from '../src/assets/formats/tables';

function zone(
  id: number,
  parentId: number,
  fog: {
    fogColor?: number;
    fogNear?: number;
    fogFar?: number;
    sunColor?: number;
    shadeColor?: number;
  } = {},
): ZoneRow {
  return {
    id,
    name: `zone ${id}`,
    parent: null,
    parentId,
    icon: '',
    friendly: 1,
    priority: 1,
    mapId: 1,
    mapName: 'map',
    centre: [0, 0],
    bounds: [0, 0, 1, 1],
    hasScenery: false,
    fogColor: fog.fogColor ?? 0,
    fogNear: fog.fogNear ?? 0,
    fogFar: fog.fogFar ?? 0,
    sunColor: fog.sunColor ?? 0,
    shadeColor: fog.shadeColor ?? 0,
    skybox: '',
    skyHill: '',
    skySun: '',
    skyHalo: '',
    music: 0,
    ambience: 0,
  };
}

describe('filling a zone’s missing fog', () => {
  it('takes it from the parent when the parent sets it', () => {
    const top = zone(1, -1, { fogColor: 0x111111, fogNear: 10, fogFar: 100 });
    const middle = zone(2, 1, { fogColor: 0x222222, fogNear: 20, fogFar: 200 });
    const inner = zone(3, 2);
    fillMissingAtmosphere([top, middle, inner]);

    expect([inner.fogColor, inner.fogNear, inner.fogFar]).toEqual([0x222222, 20, 200]);
  });

  it('takes the ground’s light from the parent as it takes the fog', () => {
    const top = zone(1, -1, { sunColor: 0xffffff, shadeColor: 0xc1e9f5 });
    const inner = zone(2, 1, { fogColor: 0x222222, fogNear: 20, fogFar: 200 });
    fillMissingAtmosphere([top, inner]);

    expect([inner.sunColor, inner.shadeColor]).toEqual([0xffffff, 0xc1e9f5]);
  });

  it('climbs past a parent that sets nothing', () => {
    const top = zone(1, -1, { fogColor: 0x111111, fogNear: 10, fogFar: 100 });
    const middle = zone(2, 1);
    const inner = zone(3, 2);
    fillMissingAtmosphere([inner, middle, top]);

    expect([inner.fogColor, inner.fogNear, inner.fogFar]).toEqual([0x111111, 10, 100]);
    expect([middle.fogColor, middle.fogNear, middle.fogFar]).toEqual([0x111111, 10, 100]);
  });

  it('fills each field on its own, and keeps the ones the zone sets', () => {
    const top = zone(1, -1, { fogColor: 0x111111, fogNear: 10, fogFar: 100 });
    const middle = zone(2, 1, { fogNear: 20 });
    const inner = zone(3, 2, { fogFar: 300 });
    fillMissingAtmosphere([top, middle, inner]);

    expect([inner.fogColor, inner.fogNear, inner.fogFar]).toEqual([0x111111, 20, 300]);
  });

  it('leaves a zone with nothing above it that sets a field at zero', () => {
    const lone = zone(1, -1);
    const under = zone(2, 1);
    fillMissingAtmosphere([lone, under]);

    expect([under.fogColor, under.fogNear, under.fogFar]).toEqual([0, 0, 0]);
  });

  it('stops on a parent chain that loops', () => {
    const a = zone(1, 2);
    const b = zone(2, 1);
    fillMissingAtmosphere([a, b]);

    expect(a.fogNear).toBe(0);
  });
});

describe('filling a zone’s missing sky', () => {
  it('takes the whole sky of the nearest zone above that names a dome', () => {
    const top = { ...zone(1, -1), skybox: 'sky/top.bdae', skySun: 'sun_top.tga' };
    const middle = { ...zone(2, 1), skybox: 'sky/middle.bdae', skyHill: 'hill.bdae' };
    const inner = zone(3, 2);
    fillMissingAtmosphere([inner, middle, top]);

    expect([inner.skybox, inner.skyHill, inner.skySun]).toEqual([
      'sky/middle.bdae',
      'hill.bdae',
      '',
    ]);
  });

  it('keeps a zone’s own sky, and leaves one with none above it without', () => {
    const own = { ...zone(1, -1), skybox: 'sky/own.bdae' };
    const lone = zone(2, -1);
    fillMissingAtmosphere([own, lone]);

    expect(own.skybox).toBe('sky/own.bdae');
    expect(lone.skybox).toBe('');
  });
});
