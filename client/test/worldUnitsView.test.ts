import { describe, expect, it } from 'vitest';

import {
  hudUnitsFromEntities,
  remotePlayerNameRelations,
} from '../src/app/helpers/hud/worldUnitsView';

describe('hudUnitsFromEntities', () => {
  it('filters to non-player creatures/players and maps HUD fields', () => {
    const entities = [
      { id: 1, kind: 'player', networkName: 'me' },
      {
        id: 2,
        kind: 'player',
        networkName: 'ally',
        networkLevel: 10,
        networkHealth: 20,
        networkMaxHealth: 30,
        networkPower: 40,
        networkMaxPower: 50,
        networkClass: 2,
      },
      { id: 3, kind: 'static' },
      { id: 4, kind: 'creature', networkName: 'wolf' },
    ];

    const out = hudUnitsFromEntities({
      entities,
      playerId: 1,
      relationTo: entity => (entity.id === 2 ? 'ally' : 'enemy'),
      networkIdOf: id => (id === 2 ? 77 : undefined),
      resourceForClass: () => 'mana',
      dispositionOf: {
        ally: 'friendly',
        enemy: 'hostile',
        bystander: 'neutral',
        catchable: 'neutral',
        corpse: 'neutral',
        questUnit: 'friendly',
      },
    });

    expect(out).toHaveLength(2);
    expect(out[0]?.id).toBe('2');
    expect(out[0]?.networkId).toBe(77);
    expect(out[0]?.disposition).toBe('friendly');
    expect(out[1]?.id).toBe('4');
  });
});

describe('remotePlayerNameRelations', () => {
  it('returns relation rows for non-self players only', () => {
    const entities = [
      { id: 1, kind: 'player' },
      { id: 2, kind: 'player' },
      { id: 3, kind: 'creature' },
    ];

    const out = remotePlayerNameRelations(entities, 1, entity =>
      entity.id === 2 ? 'enemy' : 'ally',
    );
    expect(out).toEqual([{ id: 2, relation: 'enemy' }]);
  });
});
