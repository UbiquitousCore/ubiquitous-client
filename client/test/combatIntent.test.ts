import { describe, expect, it } from 'vitest';

import {
  canAttackEntity,
  hasRangedWeaponEquipped,
  interactionWithEntity,
  routeInteraction,
} from '../src/app/helpers/combat/combatIntent';

describe('hasRangedWeaponEquipped', () => {
  it('uses ranged hand weapon entry/class when present', () => {
    expect(hasRangedWeaponEquipped({ entry: 10, itemClass: 2 }, undefined, 2)).toBe(true);
    expect(hasRangedWeaponEquipped({ entry: 0, itemClass: 2 }, undefined, 2)).toBe(false);
    expect(hasRangedWeaponEquipped({ entry: 10, itemClass: 1 }, undefined, 2)).toBe(false);
  });

  it('falls back to ranged subclass when no ranged hand item is present', () => {
    expect(hasRangedWeaponEquipped(undefined, 3, 2)).toBe(true);
    expect(hasRangedWeaponEquipped(undefined, undefined, 2)).toBe(false);
  });
});

describe('canAttackEntity', () => {
  it('allows living creature/player enemies and bystanders', () => {
    expect(canAttackEntity({ kind: 'creature', dead: false, standing: 'enemy' })).toBe(true);
    expect(canAttackEntity({ kind: 'player', dead: false, standing: 'bystander' })).toBe(true);
  });

  it('rejects allies, dead units, and non-body kinds', () => {
    expect(canAttackEntity({ kind: 'creature', dead: false, standing: 'ally' })).toBe(false);
    expect(canAttackEntity({ kind: 'creature', dead: true, standing: 'enemy' })).toBe(false);
    expect(canAttackEntity({ kind: 'static', dead: false, standing: 'enemy' })).toBe(false);
  });
});

describe('interactionWithEntity', () => {
  it('prioritises corpse loot over all other actions', () => {
    expect(
      interactionWithEntity({
        relation: 'corpse',
        canAttack: true,
        interactable: true,
      }),
    ).toBe('loot');
  });

  it('attacks living attackable entities before talk', () => {
    expect(
      interactionWithEntity({
        relation: 'enemy',
        canAttack: true,
        interactable: true,
      }),
    ).toBe('attack');
  });

  it('talks when not attackable but interactable, else none', () => {
    expect(
      interactionWithEntity({
        relation: 'ally',
        canAttack: false,
        interactable: true,
      }),
    ).toBe('talk');
    expect(
      interactionWithEntity({
        relation: 'ally',
        canAttack: false,
        interactable: false,
      }),
    ).toBe('none');
  });
});

describe('routeInteraction', () => {
  it('loots a corpse and attacks an enemy before looking at any service', () => {
    expect(routeInteraction('loot', 'shop')).toEqual({ kind: 'loot' });
    expect(routeInteraction('attack', 'quests')).toEqual({ kind: 'attack' });
  });

  it('does nothing when the click means nothing or the body offers no service', () => {
    expect(routeInteraction('none', 'shop')).toBeNull();
    expect(routeInteraction('talk', null)).toBeNull();
  });

  it('opens the teleport map locally and routes every other service by name', () => {
    expect(routeInteraction('talk', 'travel')).toEqual({ kind: 'travel' });
    expect(routeInteraction('talk', 'auction')).toEqual({ kind: 'service', service: 'auction' });
  });
});
