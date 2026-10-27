import { describe, expect, it } from 'vitest';

import { serviceMarkersForMap, teamMarkersForMap } from '../src/app/helpers/map/serviceMarkers';

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

describe('teamMarkersForMap', () => {
  const bodies = [
    { id: 1, networkName: 'Self', position: [0, 0, 0] as [number, number, number] },
    { id: 2, networkName: 'Ally', position: [3, 0, 4] as [number, number, number] },
    { id: 3, networkName: 'Stranger', position: [5, 0, 5] as [number, number, number] },
    { id: 4, networkName: 'Away', position: [6, 0, 6] as [number, number, number] },
  ];
  const network = new Map([
    [1, 10],
    [2, 20],
    [3, 30],
    [4, 40],
  ]);
  const members = [
    { networkId: 10, name: 'Self', online: true },
    { networkId: 20, name: 'Ally', online: true },
    { networkId: 40, name: 'Away', online: false },
  ];

  it('marks online teammates other than the player, and nobody else', () => {
    const out = teamMarkersForMap(bodies, bodies[0]!, members, id => network.get(id));
    expect(out).toEqual([
      { id: 'member:20', label: 'Ally', position: [3, 0, 4], kind: 'member', slot: 1 },
    ]);
  });

  it('gives each teammate a colour in turn, and starts again after the last', () => {
    const many = [1, 2, 3, 4, 5].map(id => ({
      id,
      position: [id, 0, 0] as [number, number, number],
    }));
    const team = [1, 2, 3, 4, 5].map(id => ({ networkId: id * 10, name: `M${id}`, online: true }));
    const out = teamMarkersForMap(many, many[0]!, team, id => id * 10);
    expect(out.map(marker => marker.slot)).toEqual([1, 2, 3, 1]);
  });

  it('marks nobody when not in a team', () => {
    expect(teamMarkersForMap(bodies, bodies[0]!, [], id => network.get(id))).toEqual([]);
  });
});
