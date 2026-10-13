import { describe, expect, it } from 'vitest';

import { routeLegsForTopMap } from '../src/app/helpers/map/routeLegs';

describe('routeLegsForTopMap', () => {
  it('draws only legs whose both ends resolve to stops inside detail zones', () => {
    const detailZones = [
      {
        bounds: [0, 0, 10, 10] as [number, number, number, number],
        centre: [5, 5] as [number, number],
      },
      {
        bounds: [20, 20, 30, 30] as [number, number, number, number],
        centre: [25, 25] as [number, number],
      },
    ];
    const stops = [
      { id: 1, name: 'a', mapId: 9, position: [2, 0, 2] as [number, number, number], type: 0 },
      { id: 2, name: 'b', mapId: 9, position: [22, 0, 22] as [number, number, number], type: 0 },
      { id: 3, name: 'c', mapId: 9, position: [100, 0, 100] as [number, number, number], type: 0 },
    ];
    const routes = [
      { from: 1, to: 2, price: 10 },
      { from: 1, to: 3, price: 5 },
    ];

    expect(routeLegsForTopMap(9, detailZones, stops, routes)).toEqual([
      { id: '1-2', from: [5, 0, 5], to: [25, 0, 25] },
    ]);
  });

  it('ignores stops that are not bus-stop type or on another map', () => {
    const detailZones = [
      {
        bounds: [0, 0, 10, 10] as [number, number, number, number],
        centre: [5, 5] as [number, number],
      },
    ];
    const stops = [
      { id: 1, name: 'a', mapId: 9, position: [2, 0, 2] as [number, number, number], type: 1 },
      { id: 2, name: 'b', mapId: 10, position: [2, 0, 2] as [number, number, number], type: 0 },
    ];
    const routes = [{ from: 1, to: 2, price: 10 }];

    expect(routeLegsForTopMap(9, detailZones, stops, routes)).toEqual([]);
  });
});
