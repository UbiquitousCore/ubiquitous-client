import { describe, expect, it } from 'vitest';

import { serviceMarkersForMap } from '../src/app/helpers/map/serviceMarkers';

describe('serviceMarkersForMap', () => {
  it('builds markers for non-player entities accepted by the kind filter', () => {
    const entities = [
      { id: 1, networkName: 'Self', position: [0, 0, 0] as [number, number, number] },
      {
        id: 2,
        networkName: 'Trainer',
        position: [1, 0, 1] as [number, number, number],
        interactionIcon: 'icon/trainer',
      },
      { id: 3, position: [2, 0, 2] as [number, number, number] },
    ];
    const iconUrls = new Map([['icon/trainer', 'blob:trainer']]);

    const out = serviceMarkersForMap(entities, entities[0]!, iconUrls, entity =>
      entity.id === 2 ? 'trainer' : null,
    );

    expect(out).toEqual([
      {
        id: '2',
        label: 'Trainer',
        position: [1, 0, 1],
        kind: 'service',
        iconUrl: 'blob:trainer',
      },
    ]);
  });

  it('uses fallback label and null icon when missing', () => {
    const entities = [{ id: 9, position: [9, 0, 9] as [number, number, number] }];

    const out = serviceMarkersForMap(entities, null, new Map(), () => 'vendor');

    expect(out).toEqual([
      {
        id: '9',
        label: 'Entity',
        position: [9, 0, 9],
        kind: 'service',
        iconUrl: null,
      },
    ]);
  });
});
