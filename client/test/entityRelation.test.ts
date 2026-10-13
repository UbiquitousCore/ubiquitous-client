import { describe, expect, it } from 'vitest';

import {
  relationToEntity,
  relationSubjectFromEntity,
  standingToEntity,
} from '../src/app/helpers/combat/entityRelation';

const creature = {
  id: 12,
  kind: 'creature',
  networkDead: false,
  networkHealth: 100,
  networkMaxHealth: 100,
  networkFaction: 1,
  questMark: 'finished',
};

describe('relationSubjectFromEntity', () => {
  it('uses fight and duel flags when enabled', () => {
    const out = relationSubjectFromEntity({
      entity: creature,
      countFight: true,
      networkId: 88,
      isFightingMe: id => id === 88,
      isDuellingMe: id => id === 88,
    });
    expect(out.fightingMe).toBe(true);
    expect(out.duellingMe).toBe(true);
  });

  it('drops fightingMe when countFight is disabled', () => {
    const out = relationSubjectFromEntity({
      entity: creature,
      countFight: false,
      networkId: 88,
      isFightingMe: () => true,
      isDuellingMe: () => false,
    });
    expect(out.fightingMe).toBe(false);
    expect(out.duellingMe).toBe(false);
  });
});

describe('relationToEntity / standingToEntity', () => {
  it('lets quest hand-in override standing relation', () => {
    const args = {
      entity: creature,
      playerFaction: 1,
      countFight: true,
      networkId: 88,
      isFightingMe: () => false,
      isDuellingMe: () => false,
    };
    expect(relationToEntity(args)).toBe('questUnit');
    expect(standingToEntity(args)).toBe('ally');
  });
});
