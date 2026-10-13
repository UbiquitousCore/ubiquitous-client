import { describe, expect, it } from 'vitest';

import { impactSound, parrySound, swingSound, weaponFamily } from '../src/gameplay/weaponSounds';

const weapon = (subClass: number) => ({ itemClass: 2, subClass });

describe('weaponFamily', () => {
  it('sorts weapons by what makes their sound', () => {
    expect(weaponFamily(weapon(0))).toBe('edge');
    expect(weaponFamily(weapon(9))).toBe('edge');
    expect(weaponFamily(weapon(10))).toBe('blunt');
    expect(weaponFamily(weapon(11))).toBe('blunt');
    expect(weaponFamily(weapon(3))).toBe('dagger');
    expect(weaponFamily(weapon(12))).toBe('parry');
    expect(weaponFamily(weapon(17))).toBe('arrow');
    expect(weaponFamily(weapon(20))).toBe('wand');
  });

  it('punches with an empty hand, a fist weapon, or anything that is not a weapon', () => {
    expect(weaponFamily(null)).toBe('fist');
    expect(weaponFamily(weapon(4))).toBe('fist');
    expect(weaponFamily({ itemClass: 4, subClass: 5 })).toBe('fist');
  });
});

describe('the sounds of a family', () => {
  it('swings, lands and lands hard', () => {
    expect(swingSound('blunt')).toBe('sfx_weapon_blunt_swoosh_1');
    expect(swingSound('arrow')).toBe('sfx_weapon_arrow_swoosh_draw_1');
    expect(impactSound('edge', false)).toBe('sfx_weapon_edge_impact_flesh_1');
    expect(impactSound('fist', true)).toBe('sfx_weapon_fist_impact_flesh_critical');
    expect(impactSound('wand', true)).toBe('sfx_weapon_wand_hit');
  });

  it('parries with the block the family has', () => {
    expect(parrySound('dagger')).toBe('sfx_weapon_edge_block_1');
    expect(parrySound('blunt')).toBe('sfx_weapon_blunt_block_1');
    expect(parrySound('fist')).toBe('sfx_weapon_block_block_1');
  });
});
