/**
 * Dressing a character.
 *
 * Every rule here is invisible when it is wrong in a way of its own: a figure
 * wearing every hairstyle at once, a mendel with eight pairs of ears, a robe
 * showing bare legs, or a helmet painted across a face.
 */

import { describe, expect, it } from 'vitest';

import {
  attachmentsFor,
  blendInto,
  bodyLayers,
  compositeSkin,
  hairColourFor,
  heldItemsOf,
  lookFrom,
  lookFromRow,
  modelStem,
  shippedHairColours,
  skinBelongsToModel,
  visibleMeshes,
  wearsNoArmour,
} from '../src/assets/formats/avatar';
import type { Look, SheetPiece, WornSlot } from '../src/assets/formats/avatar';
import { type Footprints, type SheetMesh, footprints } from '../src/assets/formats/avatarSheet';
import { allocPixels, type DecodedImage } from '../src/assets/formats/image';
import type { Row } from '../src/assets/formats/ftable';

/** A character model's mesh list, in the shape the reader produces. */
const MESHES = [
  'body_01-mesh',
  'hair_01-mesh',
  'hair_02-mesh',
  'hair_03-mesh',
  'lowerarm_01-mesh',
  'lowerarm_21-mesh',
  'lowerleg_01-mesh',
  'lowerleg_20-mesh',
  'upperleg_01-mesh',
  'skirt_01-mesh',
  'special_01-mesh',
  'cape_01-mesh',
  'cape_02-mesh',
  'ear_01-mesh',
  'ear_02-mesh',
];

/** A display row: id, model, second model, texture, second texture. */
const shown = (model: number, second = 0, texture = '', secondTexture = ''): Row => [
  0,
  model,
  second,
  texture,
  secondTexture,
];

/** A look wearing `worn`, with display rows by item id. */
function dressed(worn: Partial<Record<WornSlot, Row>>, base: Look = lookFrom()) {
  const rows = new Map<number, Row>();
  const look: Look = { ...base, worn: { ...base.worn } };
  let next = 100;
  for (const [slot, row] of Object.entries(worn) as Array<[WornSlot, Row]>) {
    const id = next++;
    rows.set(id, row);
    look.worn[slot] = id;
  }
  return { look, items: (id: number) => rows.get(id) };
}

const none = (): Row | undefined => undefined;

/** Items marked long in their second model column, by the mesh they wear. */
const SKIRT = 99;
const SPECIAL = 98;

describe('lookFromRow', () => {
  it('unpacks skin, ears and face from one number and reads each item by its column', () => {
    // Skin 3, ears 2, face 5; the hair columns carry a flag above the choice.
    const row: Row = [7, 0x523, 0x103, 0x104, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    const look = lookFromRow(row);
    expect([look.skin, look.ear, look.face]).toEqual([3, 2, 5]);
    expect([look.hairStyle, look.hairColor]).toEqual([3, 4]);
    expect(look.worn).toEqual({
      head: 11,
      shoulders: 12,
      shirt: 13,
      chest: 14,
      feet: 15,
      hands: 16,
      back: 17,
      legs: 18,
      ranged: 19,
      twoHand: 20,
      mainHand: 21,
      offHand: 22,
    });
  });

  it('wears nothing in a column the row stops short of', () => {
    expect(lookFromRow([7, 0x11, 1, 1]).worn.offHand).toBe(0);
  });
});

describe('skinBelongsToModel', () => {
  it("knows a texture named for its model, by the model's stem", () => {
    expect(skinBelongsToModel('ariel.tga', 'model/npc/creature/dungeon/ariel/ariel.bdae')).toBe(
      true,
    );
    expect(skinBelongsToModel('cosmo_demon.tga', 'model/x/cosmo_demon/cosmo_demon.bdae')).toBe(
      true,
    );
    expect(skinBelongsToModel('Ariel.TGA', 'model/x/ariel.bdae')).toBe(true);
  });

  it("does not take another creature's texture for the model's own", () => {
    expect(
      skinBelongsToModel('armored_skeleton_body_02.tga', 'model/x/executioner/executioner_h.bdae'),
    ).toBe(false);
  });
});

describe('wearsNoArmour', () => {
  it('is true for a row with no item in an armour slot, hair and all', () => {
    expect(wearsNoArmour(lookFromRow([7, 0x11, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      true,
    );
  });

  it('is true when the only item is a weapon in the hands', () => {
    // twoHand is column 13.
    expect(wearsNoArmour(lookFromRow([7, 0x11, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5451, 0, 0]))).toBe(
      true,
    );
  });

  it('is false once armour is worn', () => {
    // chest is column 7.
    expect(wearsNoArmour(lookFromRow([7, 0x11, 1, 1, 0, 0, 0, 9, 0, 0, 0, 0, 0, 0, 0, 0]))).toBe(
      false,
    );
  });
});

describe('visibleMeshes', () => {
  it('shows one hairstyle, not all of them', () => {
    const { visible } = visibleMeshes(MESHES, lookFrom({ hairStyle: 2 }), none);
    expect(visible).toContain('hair_02-mesh');
    expect(visible).not.toContain('hair_01-mesh');
    expect(visible).not.toContain('hair_03-mesh');
  });

  it('always shows the body', () => {
    expect(visibleMeshes(MESHES, lookFrom(), none).visible).toContain('body_01-mesh');
  });

  it('shows the bare back when nothing is on it', () => {
    const { visible, meshTextures } = visibleMeshes(MESHES, lookFrom(), none);
    expect(visible).toContain('cape_01-mesh');
    expect(visible).not.toContain('cape_02-mesh');
    expect(meshTextures).toEqual({});
  });

  it('wears the cape mesh a back item names, in its own art, instead of the bare back', () => {
    const { look, items } = dressed({ back: shown(2, 0, 'Some_Cape.tga') });
    const { visible, meshTextures } = visibleMeshes(MESHES, look, items);
    expect(visible).toContain('cape_02-mesh');
    expect(visible).not.toContain('cape_01-mesh');
    expect(meshTextures).toEqual({ 'cape_02-mesh': 'texture/avatar/Some_Cape.tga' });
  });

  it('wears the plain cape for a back item whose display row names no cape', () => {
    const { look, items } = dressed({ back: shown(0) });
    const { visible, meshTextures } = visibleMeshes(MESHES, look, items);
    expect(visible).toContain('cape_02-mesh');
    expect(visible).not.toContain('cape_01-mesh');
    expect(meshTextures).toEqual({ 'cape_02-mesh': 'texture/avatar/coarse_cloth_cape.tga' });
  });

  it('keeps the bare back on a model with no cape mesh of the kind asked for', () => {
    const { look, items } = dressed({ back: shown(3, 0, 'Long.tga') });
    const { visible, meshTextures } = visibleMeshes(MESHES, look, items);
    expect(visible).toContain('cape_01-mesh');
    expect(visible).not.toContain('cape_02-mesh');
    expect(meshTextures).toEqual({});
  });

  it('shows exactly the chosen pair of ears', () => {
    const { visible } = visibleMeshes(MESHES, { ...lookFrom(), ear: 2 }, none);
    expect(visible).toContain('ear_02-mesh');
    expect(visible).not.toContain('ear_01-mesh');
  });

  it('gives an undressed figure legs, not a skirt', () => {
    const { visible, longMesh } = visibleMeshes(MESHES, lookFrom(), none);
    expect(longMesh).toBeNull();
    expect(visible).toContain('upperleg_01-mesh');
    expect(visible).toContain('lowerleg_01-mesh');
    expect(visible).not.toContain('skirt_01-mesh');
  });

  it('covers the legs with a skirt under long legwear', () => {
    const { look, items } = dressed({ legs: shown(1, SKIRT) });
    const { visible, longMesh } = visibleMeshes(MESHES, look, items);
    expect(longMesh).toBe('skirt');
    expect(visible).toContain('skirt_01-mesh');
    expect(visible).not.toContain('upperleg_01-mesh');
    expect(visible).not.toContain('lowerleg_01-mesh');
  });

  it('covers the legs under a robe just the same', () => {
    const { look, items } = dressed({ chest: shown(1, SKIRT) });
    const { visible } = visibleMeshes(MESHES, look, items);
    expect(visible).toContain('skirt_01-mesh');
    expect(visible).not.toContain('upperleg_01-mesh');
  });

  it('wears the other long mesh when the garment asks for it', () => {
    const { look, items } = dressed({ chest: shown(1, SPECIAL) });
    const { visible, longMesh } = visibleMeshes(MESHES, look, items);
    expect(longMesh).toBe('special');
    expect(visible).toContain('special_01-mesh');
    expect(visible).not.toContain('skirt_01-mesh');
  });

  it('prefers the plain skirt when either garment asks for it', () => {
    const { look, items } = dressed({ chest: shown(1, SPECIAL), legs: shown(1, SKIRT) });
    expect(visibleMeshes(MESHES, look, items).longMesh).toBe('skirt');
  });

  it('thickens the forearm under gauntlets, over the bare one', () => {
    const { look, items } = dressed({ hands: shown(21, 0, 'g.tga') });
    const { visible } = visibleMeshes(MESHES, look, items);
    expect(visible).toContain('lowerarm_01-mesh');
    expect(visible).toContain('lowerarm_21-mesh');
  });

  it('thickens the shin under tall boots, but not under a long garment', () => {
    const boots = dressed({ feet: shown(20, 0, 'b.tga') });
    expect(visibleMeshes(MESHES, boots.look, boots.items).visible).toContain('lowerleg_20-mesh');
    const robed = dressed({ feet: shown(20, 0, 'b.tga'), chest: shown(1, SKIRT) });
    expect(visibleMeshes(MESHES, robed.look, robed.items).visible).not.toContain(
      'lowerleg_20-mesh',
    );
  });
});

describe('attachmentsFor', () => {
  const MODELS: Record<number, Row> = {
    201: [201, 0, 'model/item/axe.bdae'],
    202: [202, 0, 'model/item/shield.bdae'],
    203: [203, 0, 'model/item/staff.bdae'],
    204: [204, 0, 'model/item/bow.bdae'],
    205: [205, 0, 'model/item/pauldron_l.bdae'],
    206: [206, 0, 'model/item/pauldron_r.bdae'],
  };
  const models = (id: number) => MODELS[id];

  it('hangs a main-hand weapon at the hip, aligned by its folded node', () => {
    const { look, items } = dressed({ mainHand: shown(201, 0, 'axe.tga') });
    const axe = () => ({ itemClass: 2, subClass: 0 });
    expect(attachmentsFor(look, items, models, false, axe)).toEqual([
      {
        model: 'model/item/axe.bdae',
        texture: 'texture/axe.tga',
        node: 'Dummy_R_Waist-node',
        slot: 'mainHand',
        heldNode: 'Dummy_R_Hand-node',
        alignNode: 'Dummy_folded-node',
      },
    ]);
  });

  it('mirrors the left shoulder onto the right when there is no right model', () => {
    const { look, items } = dressed({ shoulders: shown(205, 0, 'p.tga') });
    const sides = attachmentsFor(look, items, models);
    expect(sides.map(s => [s.node, s.model, s.mirrorX ?? false])).toEqual([
      ['Dummy_L_Shoulder-node', 'model/item/pauldron_l.bdae', false],
      ['Dummy_R_Shoulder-node', 'model/item/pauldron_l.bdae', true],
    ]);
  });

  it('wears a right shoulder model of its own when there is one', () => {
    const { look, items } = dressed({ shoulders: shown(205, 206, 'l.tga', 'r.tga') });
    const right = attachmentsFor(look, items, models)[1];
    expect(right).toMatchObject({ model: 'model/item/pauldron_r.bdae', texture: 'texture/r.tga' });
    expect(right?.mirrorX).toBeUndefined();
  });

  it('hangs a helmet that has a model, and nothing for one painted on', () => {
    const painted = dressed({ head: shown(1, 0, 'cap.tga') });
    const hung = dressed({ head: shown(201, 0, 'cap.tga') });
    expect(attachmentsFor(painted.look, painted.items, models)).toEqual([]);
    expect(attachmentsFor(hung.look, hung.items, models)[0]?.node).toBe('Dummy_Head-node');
  });

  /** Where an item of this class and sub-class in `slot` sits: put away, then in use. */
  const carried = (slot: WornSlot, itemClass: number, subClass: number): [string?, string?] => {
    const { look, items } = dressed({ [slot]: shown(202, 0, 'held.tga') });
    const kind = () => ({ itemClass, subClass });
    return [
      attachmentsFor(look, items, models, false, kind)[0]?.node,
      attachmentsFor(look, items, models, true, kind)[0]?.node,
    ];
  };

  it('hangs a one-handed blade or dagger at the hip of the hand that draws it', () => {
    expect(carried('mainHand', 2, 0)).toEqual(['Dummy_R_Waist-node', 'Dummy_R_Hand-node']);
    expect(carried('mainHand', 2, 3)).toEqual(['Dummy_R_Waist-node', 'Dummy_R_Hand-node']);
    expect(carried('offHand', 2, 0)).toEqual(['Dummy_L_Waist-node', 'Dummy_L_Hand-node']);
    expect(carried('offHand', 2, 3)).toEqual(['Dummy_L_Waist-node', 'Dummy_L_Hand-node']);
  });

  it('keeps a fist weapon on its fist and a rod in its hand, put away or not', () => {
    expect(carried('mainHand', 2, 4)).toEqual(['Dummy_R_Hand-node', 'Dummy_R_Hand-node']);
    expect(carried('offHand', 2, 4)).toEqual(['Dummy_L_Hand-node', 'Dummy_L_Hand-node']);
    expect(carried('offHand', 4, 6)).toEqual(['Dummy_L_Hand-node', 'Dummy_L_Hand-node']);
  });

  it('slings a shield on its back mount and wears it on the arm in use', () => {
    expect(carried('offHand', 4, 5)).toEqual(['Dummy_shield_back-node', 'Dummy_Shield-node']);
  });

  it('puts a staff or spear on the staff mount and a two-hander on the right of the back', () => {
    expect(carried('twoHand', 2, 11)).toEqual(['Dummy_R_Back_Staff-node', 'Dummy_R_Hand-node']);
    expect(carried('mainHand', 2, 12)).toEqual(['Dummy_R_Back_Staff-node', 'Dummy_R_Hand-node']);
    expect(carried('twoHand', 2, 8)).toEqual(['Dummy_R_Back-node', 'Dummy_R_Hand-node']);
  });

  it('rests a bow, crossbow or wand where its slot keeps what it holds', () => {
    for (const subClass of [16, 17, 20]) {
      expect(carried('ranged', 2, subClass)[0]).toBe('Dummy_R_Back-node');
      expect(carried('twoHand', 2, subClass)[0]).toBe('Dummy_R_Back-node');
      expect(carried('mainHand', 2, subClass)[0]).toBe('Dummy_R_Waist-node');
      expect(carried('offHand', 2, subClass)[0]).toBe('Dummy_L_Waist-node');
    }
  });

  it('draws a bow or crossbow in the left hand from the ranged slot, and in its own slot’s hand elsewhere', () => {
    expect(carried('ranged', 2, 16)[1]).toBe('Dummy_L_Hand-node');
    expect(carried('ranged', 2, 17)[1]).toBe('Dummy_L_Hand-node');
    expect(carried('mainHand', 2, 16)[1]).toBe('Dummy_R_Hand-node');
    expect(carried('twoHand', 2, 17)[1]).toBe('Dummy_R_Hand-node');
    expect(carried('offHand', 2, 16)[1]).toBe('Dummy_L_Hand-node');
    // A wand is drawn in the hand of its slot, the ranged slot's right.
    expect(carried('ranged', 2, 20)[1]).toBe('Dummy_R_Hand-node');
  });

  it('rests a blade or dagger on the right of the back from the two-hand or ranged slot', () => {
    expect(carried('twoHand', 2, 0)).toEqual(['Dummy_R_Back-node', 'Dummy_R_Hand-node']);
    expect(carried('ranged', 2, 3)).toEqual(['Dummy_R_Back-node', 'Dummy_R_Hand-node']);
  });

  it('rests a thing of no known kind where its slot keeps what it holds', () => {
    expect(carried('mainHand', 9, 9)).toEqual(['Dummy_R_Waist-node', 'Dummy_R_Hand-node']);
    expect(carried('offHand', 9, 9)).toEqual(['Dummy_L_Waist-node', 'Dummy_L_Hand-node']);
    expect(carried('ranged', 9, 9)).toEqual(['Dummy_R_Back-node', 'Dummy_R_Hand-node']);
  });

  it('aligns a weapon put away by its folded node, and one in use by nothing', () => {
    const { look, items } = dressed({ ranged: shown(204, 0, 'bow.tga') });
    const bow = () => ({ itemClass: 2, subClass: 16 });
    expect(attachmentsFor(look, items, models, false, bow)[0]).toMatchObject({
      heldNode: 'Dummy_L_Hand-node',
      alignNode: 'Dummy_folded-node',
      slot: 'ranged',
    });
    expect(attachmentsFor(look, items, models, true, bow)[0]?.alignNode).toBeUndefined();
  });

  it('skips a model number with no model row', () => {
    const { look, items } = dressed({ mainHand: shown(999, 0, 'x.tga') });
    expect(attachmentsFor(look, items, models)).toEqual([]);
  });

  it('carries a two-hander and a separate main-hand weapon both', () => {
    const { look, items } = dressed({
      twoHand: shown(203, 0, 'staff.tga'),
      mainHand: shown(201, 0, 'axe.tga'),
    });
    const worn = attachmentsFor(look, items, models, false, id =>
      id === look.worn.twoHand ? { itemClass: 2, subClass: 11 } : { itemClass: 2, subClass: 0 },
    );
    expect(worn.map(w => [w.slot, w.node])).toEqual([
      ['twoHand', 'Dummy_R_Back_Staff-node'],
      ['mainHand', 'Dummy_R_Waist-node'],
    ]);
  });

  it('carries a two-hander listed in both columns only once', () => {
    const { look, items } = dressed({ twoHand: shown(203, 0, 'staff.tga') });
    look.worn.mainHand = look.worn.twoHand;
    const worn = attachmentsFor(look, items, models, false, () => ({ itemClass: 2, subClass: 11 }));
    expect(worn).toHaveLength(1);
    expect(worn[0]?.node).toBe('Dummy_R_Back_Staff-node');
  });
});

describe('bodyLayers', () => {
  const model = 'model/npc/character/human/male/human_m_h.bdae';
  const piecesOf = (look: Look, items: (id: number) => Row | undefined = none) =>
    bodyLayers(model, look, items).map(l => l.piece);

  it('starts from the chosen skin', () => {
    const [first] = bodyLayers(model, lookFrom({ skin: 3 }), none);
    expect(first).toEqual({ piece: 'skin', ref: 'texture/avatar/human_m_body_03.tga' });
  });

  it('names the face art after the skin it sits on', () => {
    const face = bodyLayers(model, lookFrom({ skin: 1, face: 4 }), none).find(
      l => l.piece === 'face',
    );
    expect(face?.ref).toBe('texture/avatar/human_m_body_01_face_04.tga');
  });

  it('paints no hair under a hair style that is bare scalp', () => {
    // The model says which styles are bare; painting hair under one gives the
    // shaved head a hairline.
    const bare = new Set([1]);
    const hair = (hairStyle: number) =>
      bodyLayers(model, lookFrom({ hairStyle }), none, bare).some(l => l.piece === 'hair');
    expect(hair(2)).toBe(true);
    expect(hair(1)).toBe(false);
    expect(bodyLayers(model, lookFrom({ hairStyle: 1 }), none).some(l => l.piece === 'hair')).toBe(
      true,
    );
  });

  it('paints the lowest hair colour the files ship when the look names none', () => {
    const hairOf = (hairColor: number, shipped: number[]) =>
      bodyLayers(model, lookFrom({ hairColor }), none, undefined, shipped).find(
        l => l.piece === 'hair',
      )?.ref;
    expect(hairOf(0, [3, 5])).toBe('texture/avatar/human_m_hair_a_03.tga');
    expect(hairOf(4, [3, 5])).toBe('texture/avatar/human_m_hair_a_04.tga');
    // Nothing named and nothing shipped: no hair rather than a made-up file.
    expect(hairOf(0, [])).toBeUndefined();
  });

  it('paints no hair on a mendel, whose head is furred', () => {
    const path = 'model/ep1/npc/character/mendel/male/mendel_m_h.bdae';
    expect(bodyLayers(path, lookFrom({ hairStyle: 2 }), none).some(l => l.piece === 'hair')).toBe(
      false,
    );
  });

  it('does not paint an item worn as its own mesh', () => {
    // Painting it anyway puts a helmet's texture across the face.
    const painted = dressed({ head: shown(1, 0, 'hat.tga') });
    const hung = dressed({ head: shown(2418, 0, 'hat.tga') });
    expect(piecesOf(painted.look, painted.items)).toContain('head');
    expect(piecesOf(hung.look, hung.items)).not.toContain('head');
  });

  it('paints each worn slot once, the skin and what is drawn on it first', () => {
    const { look, items } = dressed(
      {
        shirt: shown(1, 0, 's.tga'),
        chest: shown(1, 0, 'c.tga'),
        legs: shown(1, 0, 'l.tga'),
        feet: shown(1, 0, 'f.tga'),
        hands: shown(1, 0, 'h.tga'),
        head: shown(1, 0, 'x.tga'),
      },
      lookFrom({ face: 2, hairStyle: 2 }),
    );
    const pieces = piecesOf(look, items);
    expect(pieces.slice(0, 4)).toEqual(['skin', 'face', 'hair', 'shirt']);
    expect([...pieces].sort()).toEqual([
      'chest',
      'face',
      'feet',
      'hair',
      'hands',
      'head',
      'legs',
      'shirt',
      'skin',
    ]);
  });

  it('paints gauntlets last, over everything else', () => {
    const { look, items } = dressed({
      hands: shown(22, 0, 'g.tga'),
      chest: shown(1, SKIRT, 'robe.tga'),
      head: shown(1, 0, 'x.tga'),
    });
    expect(piecesOf(look, items).at(-1)).toBe('hands');
  });

  it('puts close gloves under the chest piece', () => {
    const { look, items } = dressed({ hands: shown(1, 0, 'g.tga'), chest: shown(1, 0, 'c.tga') });
    const pieces = piecesOf(look, items);
    expect(pieces.indexOf('hands')).toBeLessThan(pieces.indexOf('chest'));
  });

  it('puts long legwear over a short chest piece, and a robe over any legwear', () => {
    const skirted = dressed({ legs: shown(1, SKIRT, 'l.tga'), chest: shown(1, 0, 'c.tga') });
    const skirt = piecesOf(skirted.look, skirted.items);
    expect(skirt.indexOf('legs')).toBeGreaterThan(skirt.indexOf('chest'));
    const robed = dressed({ legs: shown(1, 0, 'l.tga'), chest: shown(1, SKIRT, 'c.tga') });
    const robe = piecesOf(robed.look, robed.items);
    expect(robe.indexOf('chest')).toBeGreaterThan(robe.indexOf('legs'));
  });
});

describe('modelStem', () => {
  it('strips the directory and the detail suffix, and reads the sex', () => {
    expect(modelStem('model/npc/character/human/male/human_m_h.bdae')).toEqual(['human_m', false]);
    expect(modelStem('model/npc/character/elf/female/elf_f_h.bdae')).toEqual(['elf_f', true]);
  });
});

// -- compositing -------------------------------------------------------

type RGBA = [number, number, number, number];

function solid(w: number, h: number, rgba: RGBA): DecodedImage {
  const pixels = allocPixels(w, h);
  for (let i = 0; i < w * h; i++) pixels.set(rgba, i * 4);
  return { width: w, height: h, pixels };
}

/** An opaque image whose red channel is its row number. */
function rows(w: number, h: number): DecodedImage {
  const img = solid(w, h, [0, 0, 0, 255]);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img.pixels[(y * w + x) * 4] = y;
  return img;
}

const at = (img: DecodedImage, x: number, y: number): number[] => {
  const i = (y * img.width + x) * 4;
  return [...img.pixels.slice(i, i + 4)];
};

describe('blendInto', () => {
  it('crops the source instead of stretching it to fill the region', () => {
    const dst = solid(16, 16, [0, 0, 0, 255]);
    blendInto(dst, solid(4, 4, [255, 0, 0, 255]), [0, 0], [0, 0, 16, 16], false);
    expect(at(dst, 3, 3)[0]).toBe(255);
    expect(at(dst, 4, 0)[0]).toBe(0);
    expect(at(dst, 0, 4)[0]).toBe(0);
  });

  it('cuts off whatever overhangs the region', () => {
    const dst = solid(16, 16, [0, 0, 0, 255]);
    blendInto(dst, solid(16, 16, [255, 0, 0, 255]), [0, 0], [4, 4, 8, 8], false);
    expect(at(dst, 3, 4)[0]).toBe(0);
    expect(at(dst, 4, 4)[0]).toBe(255);
    expect(at(dst, 7, 7)[0]).toBe(255);
    expect(at(dst, 8, 7)[0]).toBe(0);
  });

  it('places the source by its own origin, not the region corner', () => {
    const dst = solid(8, 8, [0, 0, 0, 255]);
    blendInto(dst, rows(8, 8), [0, -2], [0, 0, 8, 8], false);
    expect(at(dst, 0, 0)[0]).toBe(2);
  });

  it('mixes by the source alpha when blending', () => {
    const dst = solid(2, 2, [0, 0, 0, 255]);
    blendInto(dst, solid(2, 2, [255, 255, 255, 128]), [0, 0], [0, 0, 2, 2], true);
    expect(dst.pixels[0]).toBeGreaterThan(120);
    expect(dst.pixels[0]).toBeLessThan(135);
  });

  it('copies outright when not', () => {
    const dst = solid(2, 2, [0, 0, 0, 255]);
    blendInto(dst, solid(2, 2, [10, 20, 30, 0]), [0, 0], [0, 0, 2, 2], false);
    expect(at(dst, 0, 0)).toEqual([10, 20, 30, 0]);
  });
});

/**
 * A made-up character: one body mesh whose UV patches are each carried by one
 * bone, and a skirt mesh. The layout the compositor paints into is read from
 * these, the same way it is read from a shipped model.
 *
 * On a 128 sheet the torso fills the top 48 rows. Forearms (rows 32-64) share
 * rows with it on the left, as sleeves do; hands and head follow below them.
 * The legs run down the right half, and the skirt spans thigh to shin.
 */
function figure(): Footprints {
  const quads = (
    patches: Array<[string, number, number, number, number]>,
    segment?: 'skirt',
  ): SheetMesh => {
    const uvs: number[] = [];
    const indices: number[] = [];
    const bones = [...new Set(patches.map(p => p[0]))];
    const influences: SheetMesh['influences'] = [];
    for (const [bone, ...box] of patches) {
      const [u0, v0, u1, v1] = box.map(x => x / 128);
      const base = uvs.length / 2;
      uvs.push(u0, v0, u1, v0, u1, v1, u0, v1);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      for (let i = 0; i < 4; i++) influences.push({ indices: [bones.indexOf(bone)], weights: [1] });
    }
    return {
      uvs,
      indices,
      ranges: [{ start: 0, count: indices.length }],
      bones,
      influences,
      segment,
    };
  };
  return footprints([
    quads([
      ['Spine', 0, 0, 128, 48],
      ['L_Forearm', 0, 32, 64, 64],
      ['R_Hand', 0, 64, 64, 80],
      ['Head', 0, 80, 64, 128],
      ['L_Thigh', 64, 48, 128, 80],
      ['R_Calf', 64, 80, 128, 108],
      ['L_Foot', 64, 108, 128, 128],
    ]),
    quads([['Pelvis', 64, 48, 128, 108]], 'skirt'),
  ]);
}

describe('compositeSkin', () => {
  const model = 'model/npc/character/human/male/human_m_h.bdae';
  const LAYOUT = figure();
  const SKIN: RGBA = [90, 90, 90, 255];
  const RED: RGBA = [200, 0, 0, 255];
  const GREEN: RGBA = [0, 200, 0, 255];
  const BLUE: RGBA = [0, 0, 200, 255];

  /** Item art that is one flat colour, named by its texture. */
  const flat = (rgba: RGBA): string => `${rgba.slice(0, 3).join('_')}.tga`;
  const flatArt = (ref: string): DecodedImage | null => {
    const m = /\/(\d+)_(\d+)_(\d+)\.tga$/.exec(ref);
    return m ? solid(128, 128, [Number(m[1]), Number(m[2]), Number(m[3]), 255]) : null;
  };

  /** Composite over grey skin, every other layer from `art`. */
  const composite = (
    look: Look,
    items: (id: number) => Row | undefined,
    art: (ref: string) => DecodedImage | null = flatArt,
    sheet = 128,
    layout = LAYOUT,
  ) =>
    compositeSkin(
      model,
      look,
      items,
      ref => (ref.endsWith('_body_01.tga') ? solid(sheet, sheet, SKIN) : art(ref)),
      layout,
      BARE_STYLES,
    );
  /** The hair styles this figure's model draws as bare scalp. */
  const BARE_STYLES = new Set([1]);
  /** A bare head: no face markings, shaved. */
  const bare = lookFrom({ face: 0, hairStyle: 1 });

  it('makes the sheet the size of the skin art', () => {
    expect(composite(lookFrom(), none).image.width).toBe(128);
    expect(composite(lookFrom(), none, () => null, 256).image.width).toBe(256);
  });

  it('paints gloves over the hands and forearms and nowhere else', () => {
    const { look, items } = dressed({ hands: shown(1, 0, flat(RED)) }, bare);
    const { image } = composite(look, items);
    expect(at(image, 10, 50)).toEqual(RED);
    expect(at(image, 10, 70)).toEqual(RED);
    expect(at(image, 10, 90)).toEqual(SKIN);
    expect(at(image, 70, 70)).toEqual(SKIN);
  });

  it('pulls a tunic over close gloves where sleeve and forearm meet', () => {
    const { look, items } = dressed(
      { hands: shown(1, 0, flat(RED)), chest: shown(1, 0, flat(GREEN)) },
      bare,
    );
    const { image } = composite(look, items);
    expect(at(image, 10, 40)).toEqual(GREEN);
    expect(at(image, 10, 50)).toEqual(RED);
  });

  it('wears gauntlets over the tunic sleeve', () => {
    const { look, items } = dressed(
      { hands: shown(21, 0, flat(RED)), chest: shown(1, 0, flat(GREEN)) },
      bare,
    );
    const { image } = composite(look, items);
    expect(at(image, 10, 40)).toEqual(RED);
    expect(at(image, 70, 20)).toEqual(GREEN);
  });

  it('pulls boots over the trouser legs', () => {
    const { look, items } = dressed(
      { legs: shown(1, 0, flat(BLUE)), feet: shown(1, 0, flat(RED)) },
      bare,
    );
    const { image } = composite(look, items);
    expect(at(image, 70, 60)).toEqual(BLUE);
    expect(at(image, 70, 90)).toEqual(RED);
    expect(at(image, 70, 120)).toEqual(RED);
  });

  it('covers long legwear and boot tops with a robe', () => {
    const { look, items } = dressed(
      {
        legs: shown(1, SKIRT, flat(BLUE)),
        chest: shown(1, SKIRT, flat(GREEN)),
        feet: shown(1, 0, flat(RED)),
      },
      bare,
    );
    const { image } = composite(look, items);
    expect(at(image, 70, 60)).toEqual(GREEN);
    expect(at(image, 70, 100)).toEqual(GREEN);
    expect(at(image, 70, 120)).toEqual(RED);
  });

  it('paints a helmet over the face and hair', () => {
    const { look, items } = dressed(
      { head: shown(1, 0, flat(RED)) },
      lookFrom({ face: 2, hairStyle: 2 }),
    );
    const { image } = composite(look, items, ref =>
      ref.includes('_face_') || ref.includes('_hair_') ? solid(64, 48, BLUE) : flatArt(ref),
    );
    expect(at(image, 10, 100)).toEqual(RED);
  });

  it('hangs the face from the bottom of the sheet', () => {
    const { image } = composite(lookFrom({ face: 2, hairStyle: 1 }), none, ref =>
      ref.includes('_face_') ? rows(64, 41) : null,
    );
    // The head region reaches the bottom edge, and the 41-row face ends on it.
    expect(at(image, 10, 87)[0]).toBe(0);
    expect(at(image, 10, 127)[0]).toBe(40);
    expect(at(image, 10, 86)).toEqual(SKIN);
    expect(at(image, 64, 100)).toEqual(SKIN);
  });

  it('starts trousers above the leg meshes so the belt sits on the hips', () => {
    // The legs run from row 48 to 108; a sixth of that above them is row 38.
    const { look, items } = dressed({ legs: shown(1, 0, 'short.tga') }, bare);
    const { image } = composite(look, items, ref =>
      ref.endsWith('short.tga') ? rows(64, 58) : null,
    );
    expect(at(image, 64, 37)).toEqual(SKIN);
    expect(at(image, 64, 38)[0]).toBe(0);
    expect(at(image, 64, 95)[0]).toBe(57);
    expect(at(image, 64, 96)).toEqual(SKIN);
    expect(at(image, 63, 60)).toEqual(SKIN);
  });

  it('crops art bigger than its region', () => {
    const { look, items } = dressed({ chest: shown(1, 0, 'tall.tga') }, bare);
    const { image } = composite(look, items, ref =>
      ref.endsWith('tall.tga') ? rows(128, 64) : null,
    );
    expect(at(image, 5, 47)[0]).toBe(47);
    expect(at(image, 5, 48)).toEqual(SKIN);
  });

  it('enlarges art drawn for a smaller sheet', () => {
    // 64-wide glove art on a 256 sheet, whose glove region is 128 wide.
    const { look, items } = dressed({ hands: shown(1, 0, 'g.tga') }, bare);
    const { image } = composite(
      look,
      items,
      ref => (ref.endsWith('g.tga') ? solid(64, 64, RED) : null),
      256,
    );
    expect(at(image, 127, 64)).toEqual(RED);
    expect(at(image, 127, 159)).toEqual(RED);
    expect(at(image, 128, 64)).toEqual(SKIN);
  });

  it('leaves art alone once it is most of its region wide', () => {
    // Enlarged by the power of two that brings it nearest its region's width:
    // 96 of 128 is nearer 1x, 80 of 128 nearer 2x.
    const { look, items } = dressed({ hands: shown(1, 0, 'g.tga') }, bare);
    const wide = (w: number) =>
      composite(look, items, ref => (ref.endsWith('g.tga') ? solid(w, 64, RED) : null), 256).image;
    expect(at(wide(96), 100, 64)).toEqual(SKIN);
    expect(at(wide(80), 100, 64)).toEqual(RED);
  });

  it('skips a layer over segments the model has no mesh for', () => {
    const { look, items } = dressed({ legs: shown(1, 0, flat(BLUE)) }, bare);
    const { drawn } = composite(look, items, flatArt, 128, { head: LAYOUT.head });
    expect(drawn.map(d => d.piece)).toEqual<SheetPiece[]>(['skin']);
  });

  it('draws nothing for missing art rather than failing', () => {
    const { image, drawn } = compositeSkin(model, lookFrom(), none, () => null, LAYOUT);
    expect(drawn).toHaveLength(0);
    expect(image.width).toBeGreaterThan(0);
  });
});

describe('the hair colours a model ships', () => {
  it("reads the colour numbers off the model's own hair textures, lowest first", () => {
    const names = [
      'texture/avatar/human_m_hair_a_05.tga',
      'human_m_hair_a_02.tga',
      'HUMAN_M_HAIR_A_03.TGA',
      'human_f_hair_a_01.tga',
      'human_m_hair_b_01.tga',
      'human_m_hair_a_xx.tga',
    ];
    expect(shippedHairColours('model/npc/character/human/male/human_m_h.bdae', names)).toEqual([
      2, 3, 5,
    ]);
  });

  it('keeps a named colour and falls back only when none is named', () => {
    expect(hairColourFor(7, [2, 3])).toBe(7);
    expect(hairColourFor(0, [2, 3])).toBe(2);
    expect(hairColourFor(0, [])).toBeNull();
  });
});

describe('what a creature holds, for its combat clips', () => {
  const classes: Record<number, { itemClass: number; subClass: number }> = {
    10: { itemClass: 2, subClass: 0 },
    20: { itemClass: 4, subClass: 5 },
    30: { itemClass: 2, subClass: 8 },
  };
  const classOf = (id: number) => classes[id] ?? { itemClass: 0, subClass: 0 };

  it('reads each hand with the class the item table gives it', () => {
    const look = lookFrom();
    look.worn.mainHand = 10;
    look.worn.offHand = 20;
    expect(heldItemsOf(look, classOf)).toEqual({
      mainhand: { entry: 10, itemClass: 2, subClass: 0 },
      offhand: { entry: 20, itemClass: 4, subClass: 5 },
      ranged: { entry: 0, itemClass: 0, subClass: 0 },
    });
  });

  it('puts a two-hander in the main hand', () => {
    const look = lookFrom();
    look.worn.twoHand = 30;
    expect(heldItemsOf(look, classOf)?.mainhand).toEqual({ entry: 30, itemClass: 2, subClass: 8 });
  });

  it('says nothing for a look with empty hands, which keeps a beast its bare clips', () => {
    expect(heldItemsOf(lookFrom(), classOf)).toBeNull();
  });
});
