import { describe, expect, it } from 'vitest';

import type { ZoneInfo } from '../src/assets/types';
import { detailZonesInTop } from '../src/app/helpers/map/detailZones';

function zone(id: number, parentId: number, priority: number): ZoneInfo {
  return {
    id,
    name: `zone-${id}`,
    mapId: 1,
    mapName: 'map',
    centre: [0, 0],
    bounds: [0, 0, 1, 1],
    hasScenery: true,
    parentId,
    priority,
    icon: '',
    friendly: 2,
    atmosphere: { fogColor: [0, 0, 0], fogNear: 0, fogFar: 1, skybox: null },
    sound: { music: 0, ambience: 0 },
  };
}

describe('detailZonesInTop', () => {
  it('returns only zones under the top id at the detail priority', () => {
    const out = detailZonesInTop(
      [zone(1, 10, 13), zone(2, 10, 2), zone(3, 11, 13), zone(4, 10, 13)],
      10,
      13,
    );
    expect(out.map(one => one.id)).toEqual([1, 4]);
  });

  it('preserves zone order from the source cache', () => {
    const zones = [zone(4, 10, 13), zone(1, 10, 13), zone(7, 10, 13)];
    expect(detailZonesInTop(zones, 10, 13).map(one => one.id)).toEqual([4, 1, 7]);
  });
});
