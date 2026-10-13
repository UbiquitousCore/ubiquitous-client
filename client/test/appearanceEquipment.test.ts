/**
 * Reading a positional equipment array into worn slots.
 *
 * The server sends a character's equipment as sixteen inventory positions,
 * head first and ranged last. Getting the translation wrong is silent and
 * specific: a flat list of the items a character owns, sent where positions
 * were expected, puts whatever comes first on the character's head.
 */

import { describe, expect, it, vi } from 'vitest';

import { appearanceEquipment } from '../src/assets/providers/PackAssetProvider';
import { attachmentsFor, lookFrom } from '../src/assets/formats/avatar';
import type { Row } from '../src/assets/formats/ftable';

/** The server's inventory positions, as it numbers them. */
const POSITION = {
  head: 0,
  neck: 1,
  shoulders: 2,
  hands: 3,
  chest: 4,
  shirt: 5,
  back: 6,
  legs: 7,
  feet: 8,
  ring1: 9,
  ring2: 10,
  trinket1: 11,
  trinket2: 12,
  mainHand: 13,
  offHand: 14,
  ranged: 15,
} as const;

/** A sixteen-position array, laid out the way the server sends it. */
function inventory(worn: Partial<Record<keyof typeof POSITION, number>>): number[] {
  const values = new Array(16).fill(0);
  for (const [slot, entry] of Object.entries(worn))
    values[POSITION[slot as keyof typeof POSITION]] = entry;
  return values;
}

describe('appearanceEquipment', () => {
  it('reads an inventory array by position, not as a list of held items', () => {
    const out = appearanceEquipment(
      inventory({
        chest: 3070,
        legs: 3007,
        feet: 3071,
        mainHand: 1103,
        offHand: 1213,
        ranged: 4149,
      }),
    );
    expect(out).toMatchObject({
      ranged: 4149,
      mainHand: 1103,
      offHand: 1213,
      chest: 3070,
      legs: 3007,
      feet: 3071,
      head: 0,
    });
  });

  it('puts nothing in the two-handed slot: a two-hander arrives in the main hand', () => {
    const out = appearanceEquipment(inventory({ mainHand: 1165 }));
    expect(out.mainHand).toBe(1165);
    expect(out.twoHand).toBe(0);
  });

  it('shows nothing for rings, trinkets or the neck', () => {
    const out = appearanceEquipment(
      inventory({ neck: 1, ring1: 2, ring2: 3, trinket1: 4, trinket2: 5 }),
    );
    expect(Object.values(out).every(v => v === 0)).toBe(true);
  });

  it('reads twelve values as the item columns of the appearance table', () => {
    // Head, shoulders, shirt, chest, feet, hands, back, legs, ranged, two-handed,
    // main hand, off hand.
    const out = appearanceEquipment([0, 0, 0, 0, 0, 0, 0, 0, 4149, 1165, 0, 0]);
    expect(out.ranged).toBe(4149);
    expect(out.twoHand).toBe(1165);
  });

  it('warns about an array too short to be either', () => {
    // Still dressed, so a bad payload does not strip a character bare; the
    // bow lands on the head, which is what the warning is for.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = appearanceEquipment([4149]);
    expect(out.head).toBe(4149);
    expect(out.ranged).toBe(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('does not warn about an inventory or an appearance row', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    appearanceEquipment(inventory({ ranged: 4149 }));
    appearanceEquipment([0, 0, 0, 0, 0, 0, 0, 0, 4149, 0, 0, 0]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('a bow sent in the ranged position', () => {
  it('rests on the right of the back and is drawn in the left hand', () => {
    const look = lookFrom();
    Object.assign(look.worn, appearanceEquipment(inventory({ ranged: 4149 })));

    const items = (id: number): Row | undefined =>
      id === 4149 ? [4149, 500, 0, 'bow.tga'] : undefined;
    const models = (id: number): Row | undefined =>
      id === 500 ? [500, 0, 'model/item/weapon/ranged/bow/training_bow.bdae'] : undefined;
    const bow = () => ({ itemClass: 2, subClass: 16 });

    expect(attachmentsFor(look, items, models, false, bow)).toEqual([
      {
        model: 'model/item/weapon/ranged/bow/training_bow.bdae',
        texture: 'texture/bow.tga',
        node: 'Dummy_R_Back-node',
        slot: 'ranged',
        heldNode: 'Dummy_L_Hand-node',
        alignNode: 'Dummy_folded-node',
      },
    ]);
    expect(attachmentsFor(look, items, models, true, bow)[0]).toMatchObject({
      node: 'Dummy_L_Hand-node',
      heldNode: 'Dummy_L_Hand-node',
    });
  });
});
