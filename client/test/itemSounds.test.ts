import { describe, expect, it } from 'vitest';

import { equipSound, handleSound } from '../src/gameplay/itemSounds';

const armour = (subClass: number, inventoryType: number) => ({
  itemClass: 4,
  subClass,
  inventoryType,
});
const weapon = (subClass: number, inventoryType = 11) => ({
  itemClass: 2,
  subClass,
  inventoryType,
});

describe('equipSound', () => {
  it('sounds clothing by the part of the body it goes on, then by what it is made of', () => {
    expect(equipSound(armour(4, 1), true)).toBe('sfx_ui_menu_equip_helmet');
    expect(equipSound(armour(2, 7), false)).toBe('sfx_ui_menu_unequip_boot');
    expect(equipSound(armour(1, 8), true)).toBe('sfx_ui_menu_equip_glove');
    expect(equipSound(armour(4, 5), true)).toBe('sfx_ui_menu_equip_armor_metal');
    expect(equipSound(armour(1, 6), true)).toBe('sfx_ui_menu_equip_armor_leather');
    expect(equipSound(armour(0, 9), true)).toBe('sfx_ui_menu_equip_accessory');
  });

  it('sounds what is held by what it is', () => {
    expect(equipSound(armour(5, 19), true)).toBe('sfx_ui_menu_equip_shield_metal');
    expect(equipSound(armour(6, 19), true)).toBe('sfx_ui_menu_equip_weapon_magical');
    expect(equipSound(weapon(7), true)).toBe('sfx_ui_menu_equip_weapon_metal');
    expect(equipSound(weapon(16, 13), false)).toBe('sfx_ui_menu_unequip_weapon_bow');
    expect(equipSound(weapon(20, 13), true)).toBe('sfx_ui_menu_equip_weapon_magical');
    expect(equipSound(weapon(11, 15), true)).toBe('sfx_ui_menu_equip_weapon_wood');
  });

  it('falls back to the plain sound for anything else worn', () => {
    expect(equipSound({ itemClass: 12, subClass: 0, inventoryType: 23 }, true)).toBe(
      'sfx_ui_menu_equip_generic',
    );
  });
});

describe('handleSound', () => {
  it('sounds by what kind of thing it is', () => {
    expect(handleSound({ itemClass: 0, subClass: 1 }, true)).toBe('sfx_ui_pickup_potion');
    expect(handleSound({ itemClass: 0, subClass: 4 }, false)).toBe('sfx_ui_drop_food');
    expect(handleSound({ itemClass: 0, subClass: 3 }, true)).toBe('sfx_ui_pickup_paper');
    expect(handleSound({ itemClass: 0, subClass: 9 }, true)).toBe('sfx_ui_pickup_paper');
    expect(handleSound({ itemClass: 0, subClass: 12 }, true)).toBe('sfx_ui_pickup_magic');
    expect(handleSound({ itemClass: 7, subClass: 1 }, true)).toBe('sfx_ui_pickup_paper');
    expect(handleSound({ itemClass: 6, subClass: 7 }, false)).toBe('sfx_ui_drop_food');
    expect(handleSound({ itemClass: 2, subClass: 7 }, false)).toBe('sfx_ui_drop_equipment');
  });
});
