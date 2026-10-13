/**
 * Dressing a character: which of its meshes show, which items hang off it as
 * meshes of their own, and how the rest is painted onto its skin sheet.
 *
 * Everything here works from three things in the user's files: the item
 * display rows (what each item looks like), the item model rows (the meshes
 * worn separately) and the mesh families of the character model itself.
 */

import type { EquipmentAttachment, WornSlot } from '../types';
import { allocPixels, type DecodedImage, type Pixels } from './image';
import type { Row } from './ftable';
import {
  type Footprints,
  type Rect,
  type Segment,
  SHEET_MATERIALS,
  regionRect,
} from './avatarSheet';
import { type HeldKind, heldKind } from '../heldKinds';

export type { WornSlot };

export const TEXTURE_DIR = 'texture/avatar/';

/** Every slot, in the order a character is dressed and its meshes attached. */
const SLOTS: readonly WornSlot[] = [
  'head',
  'shoulders',
  'shirt',
  'chest',
  'legs',
  'feet',
  'hands',
  'back',
  'twoHand',
  'mainHand',
  'offHand',
  'ranged',
];

/** One character's chosen features and the item worn in each slot (0 for none). */
export interface Look {
  skin: number;
  face: number;
  ear: number;
  hairStyle: number;
  hairColor: number;
  worn: Record<WornSlot, number>;
}

function nothingWorn(): Record<WornSlot, number> {
  return Object.fromEntries(SLOTS.map(slot => [slot, 0])) as Record<WornSlot, number>;
}

// -- the appearance table ------------------------------------------------

/** Columns of `creaturedisplayinfoextra` ahead of the items. A table layout. */
const LOOK_FEATURES = 1;
const LOOK_HAIR_STYLE = 2;
const LOOK_HAIR_COLOR = 3;

/**
 * The column of `creaturedisplayinfoextra` that holds each slot's item. A
 * table layout: the twelve item columns run from `head` to `offHand`.
 */
export const LOOK_ROW_ITEMS: Readonly<Record<WornSlot, number>> = {
  head: 4,
  shoulders: 5,
  shirt: 6,
  chest: 7,
  feet: 8,
  hands: 9,
  back: 10,
  legs: 11,
  ranged: 12,
  twoHand: 13,
  mainHand: 14,
  offHand: 15,
};

/** The first item column; the item columns follow it without gaps. */
export const LOOK_ROW_FIRST_ITEM = 4;

/** Digit `place` of `n` written in hexadecimal. */
const hexDigit = (n: number, place: number): number => Math.floor(n / 16 ** place) % 16;

/**
 * The features column holds three choices as hexadecimal digits: the lowest
 * is the skin, the next the ear pair, and everything above them the face.
 */
function unpackFeatures(n: number): { skin: number; ear: number; face: number } {
  return { skin: hexDigit(n, 0), ear: hexDigit(n, 1), face: Math.floor(n / 256) };
}

/**
 * Hair style and colour are the low byte of their columns. A few rows set a
 * higher bit as well, which does not change the choice.
 */
const lowByte = (n: number): number => n % 256;

export function lookFromRow(row: Row): Look {
  const cell = (i: number): number => {
    const v = row[i];
    return typeof v === 'number' ? v : 0;
  };
  const worn = nothingWorn();
  for (const slot of SLOTS) worn[slot] = cell(LOOK_ROW_ITEMS[slot]);
  return {
    ...unpackFeatures(cell(LOOK_FEATURES)),
    hairStyle: lowByte(cell(LOOK_HAIR_STYLE)),
    hairColor: lowByte(cell(LOOK_HAIR_COLOR)),
    worn,
  };
}

/**
 * A look with no table row behind it, as the player has. Nothing is worn
 * until the caller says so: bare legs, no skirt.
 */
export function lookFrom(
  opts: { skin?: number; face?: number; hairStyle?: number; hairColor?: number } = {},
): Look {
  return {
    skin: opts.skin ?? 1,
    face: opts.face ?? 1,
    ear: 0,
    hairStyle: opts.hairStyle ?? 2,
    hairColor: opts.hairColor ?? 1,
    worn: nothingWorn(),
  };
}

/** One hand: the item in it and its class, entry 0 for an empty hand. */
export interface HeldItem {
  entry: number;
  itemClass: number;
  subClass: number;
}

export interface HeldItems {
  mainhand: HeldItem;
  offhand: HeldItem;
  ranged: HeldItem;
}

/** What a look holds in its hands, or null when they are all empty; a two-hander is the main hand. */
export function heldItemsOf(look: Look, classOf: ItemClassLookup): HeldItems | null {
  const hand = (entry: number): HeldItem =>
    entry ? { entry, ...classOf(entry) } : { entry: 0, itemClass: 0, subClass: 0 };
  const { mainHand, twoHand, offHand, ranged } = look.worn;
  if (!mainHand && !twoHand && !offHand && !ranged) return null;
  return { mainhand: hand(mainHand || twoHand), offhand: hand(offHand), ranged: hand(ranged) };
}

// -- item display rows ---------------------------------------------------

/** Rows of `itemdisplayinfo`, keyed by item id. */
export type ItemDisplayLookup = (itemId: number) => Row | undefined;

/** Rows of `itemmodeldata`, keyed by the model numbers display rows name. */
export type ItemModelLookup = (itemModelId: number) => Row | undefined;

/** An item's class and sub-class, from the item table. */
export type ItemClassLookup = (itemId: number) => { itemClass: number; subClass: number };

/** Columns of an `itemdisplayinfo` row. A table layout. */
const SHOWN_MODEL = 1;
const SHOWN_SECOND_MODEL = 2;
const SHOWN_TEXTURE = 3;
const SHOWN_SECOND_TEXTURE = 4;

/** Columns of an `itemmodeldata` row. A table layout. */
const MODEL_PATH = 2;
const MODEL_EFFECT_NODES = 3;
const MODEL_EFFECT_FILES = 9;
const EFFECTS_PER_ITEM_MODEL = 6;

/**
 * Model numbers up to this name a limb-mesh variant, painted on the sheet;
 * above it, an item model row worn as its own mesh. Read from the files:
 * limb meshes are 1-3 and 20-22, item rows start at 141.
 */
const LAST_LIMB_VARIANT = 22;

/**
 * Gloves and boots whose variant is at least this are outer pieces: they
 * wear a thicker forearm or shin mesh, and gauntlets paint over sleeves. Own
 * reading, consistent with the data: the character models number their
 * plain limb meshes from 1 and their thicker ones from here.
 */
const FIRST_OUTER_VARIANT = 20;

const cellNumber = (row: Row | undefined, column: number): number => Number(row?.[column] ?? 0);

const cellText = (row: Row | undefined, column: number): string => {
  const v = row?.[column];
  return typeof v === 'string' ? v.replace(/\0+$/, '') : '';
};

/** The display row of whatever is in `slot`, if anything is. */
function shown(look: Look, items: ItemDisplayLookup, slot: WornSlot): Row | undefined {
  const id = look.worn[slot];
  return id ? items(id) : undefined;
}

/** Whether an item is its own mesh rather than art on the sheet. */
const hasOwnMesh = (row: Row | undefined): boolean =>
  cellNumber(row, SHOWN_MODEL) > LAST_LIMB_VARIANT;

/** The variant of the character's own limb mesh an item wears, or null. */
function meshVariant(row: Row | undefined): number | null {
  const n = cellNumber(row, SHOWN_MODEL);
  return n > 0 && n <= LAST_LIMB_VARIANT ? n : null;
}

/** Whether gloves or boots are an outer piece with a thicker limb mesh. */
const isOuter = (row: Row | undefined): boolean => (meshVariant(row) ?? 0) >= FIRST_OUTER_VARIANT;

// -- long garments ---------------------------------------------------------

/** The mesh a long garment is worn over, named by its mesh family. */
export type LongMesh = 'skirt' | 'special';

/**
 * A chest piece or legwear that reaches the ankles carries one of these in
 * its second model column, saying which long mesh replaces the legs. Own
 * reading, consistent with the data: the rows carrying them are mostly
 * named as robes and skirts.
 */
const LONG_MESH_MARK: ReadonlyMap<number, LongMesh> = new Map([
  [99, 'skirt'],
  [98, 'special'],
]);

const longMeshOf = (row: Row | undefined): LongMesh | null =>
  LONG_MESH_MARK.get(cellNumber(row, SHOWN_SECOND_MODEL)) ?? null;

/**
 * The long mesh the outfit wears, or null for legs. Either the chest piece or
 * the legwear can make it long; the plain skirt wins when either asks for it.
 */
function outfitLongMesh(look: Look, items: ItemDisplayLookup): LongMesh | null {
  const asked = [longMeshOf(shown(look, items, 'chest')), longMeshOf(shown(look, items, 'legs'))];
  if (asked.includes('skirt')) return 'skirt';
  return asked.includes('special') ? 'special' : null;
}

// -- meshes on the figure ----------------------------------------------------

export interface MeshVisibility {
  visible: string[];
  /** The long mesh worn in place of the legs, or null for legs. */
  longMesh: LongMesh | null;
  /** Art for meshes that wear an item's own picture instead of their material's. */
  meshTextures: Record<string, string>;
}

// -- the back ------------------------------------------------------------------

/**
 * The cape meshes are numbered like the other families. The first is the bare
 * upper back, drawn from the skin sheet; the higher ones are capes of growing
 * length. Own reading of the user's files: every character model's first cape
 * mesh samples the sheet, its others are cut as cloth hanging behind it, and
 * the back items' display rows name the higher numbers only.
 */
const BARE_BACK = 1;

/**
 * The cape worn for a back item whose display row names none, as most do:
 * the shorter one, in the plain cloth art. Own choice.
 */
const PLAIN_CAPE = 2;
const PLAIN_CAPE_ART = 'coarse_cloth_cape.tga';

/** The cape mesh and art whatever is on the back wears, or null for a bare back. */
function capeOf(look: Look, items: ItemDisplayLookup): { variant: number; art: string } | null {
  const id = look.worn.back;
  if (!id) return null;
  const row = items(id);
  const variant = cellNumber(row, SHOWN_MODEL);
  return {
    variant: variant > BARE_BACK ? variant : PLAIN_CAPE,
    art: TEXTURE_DIR + (cellText(row, SHOWN_TEXTURE) || PLAIN_CAPE_ART),
  };
}

/** `lowerleg_20-mesh` -> `['lowerleg', 20]`; a name with no number is its own family. */
function familyAndVariant(name: string): [string, number | null] {
  const match = /^(.+)_(\d+)$/.exec(name.toLowerCase().replace('-mesh', ''));
  return match ? [match[1]!, Number(match[2])] : [name.toLowerCase(), null];
}

/**
 * Which meshes show, per family: hair and ear as chosen; the back item's
 * cape where the model has it, else the bare back; forearm plus the gloves'
 * variant; under a long garment only its mesh, else thighs and shins with
 * legwear and boot variants. Other families show whole.
 */
export function visibleMeshes(
  meshNames: string[],
  look: Look,
  items: ItemDisplayLookup,
): MeshVisibility {
  const variantOf = (slot: WornSlot): number[] => {
    const v = meshVariant(shown(look, items, slot));
    return v === null ? [] : [v];
  };
  const has = (family: string, variant: number): boolean =>
    meshNames.some(name => {
      const [f, v] = familyAndVariant(name);
      return f === family && v === variant;
    });

  const cape = capeOf(look, items);
  const capeWorn = cape !== null && has('cape', cape.variant);
  const longMesh = outfitLongMesh(look, items);
  const shows = new Map<string, number[]>([
    ['hair', [look.hairStyle]],
    ['ear', [look.ear]],
    ['cape', [capeWorn ? cape.variant : BARE_BACK]],
    ['lowerarm', [1, ...variantOf('hands')]],
    ['upperleg', longMesh ? [] : [1]],
    ['lowerleg', longMesh ? [] : [1, ...variantOf('legs'), ...variantOf('feet')]],
    ['skirt', longMesh === 'skirt' ? [1] : []],
    ['special', longMesh === 'special' ? [1] : []],
  ]);

  const visible: string[] = [];
  const meshTextures: Record<string, string> = {};
  for (const name of meshNames) {
    const [family, variant] = familyAndVariant(name);
    const wanted = shows.get(family);
    if (wanted && (variant === null || !wanted.includes(variant))) continue;
    visible.push(name);
    if (family === 'cape' && capeWorn) meshTextures[name] = cape.art;
  }
  return { visible: [...new Set(visible)].sort(), longMesh, meshTextures };
}

// -- the skin sheet ------------------------------------------------------------

/**
 * What a piece painted on the skin sheet is: the skin, the two things drawn
 * on it (face and hair), or the item in one slot.
 */
export type SheetPiece =
  | 'skin'
  | 'face'
  | 'hair'
  | 'shirt'
  | 'hands'
  | 'legs'
  | 'feet'
  | 'chest'
  | 'head';

/** A piece to paint: its art, where on the figure it goes, and what decides its order. */
interface Painted {
  piece: SheetPiece;
  ref: string;
  /** The segments it covers, or the whole sheet. */
  covers: Segment[] | 'sheet';
  /** Reach up above the leg meshes, so a waistband sits on the hips. */
  toHips: boolean;
  /** Reaches the ankles: a robe, or legwear painted on a long garment's mesh. */
  long: boolean;
  /** An outer hand piece (gauntlets), worn over sleeves. */
  outer: boolean;
}

/** What a piece's art is chosen from. */
interface Dressing {
  stem: string;
  look: Look;
  /** Hair styles the model draws as bare scalp. */
  bareScalps: ReadonlySet<number>;
  /** Hair colours the user's files ship for this model, lowest first. */
  hairColours: readonly number[];
  items: ItemDisplayLookup;
  longMesh: LongMesh | null;
}

const twoDigits = (n: number): string => String(n).padStart(2, '0');

/** The sheet art for whatever is in `slot`, unless it is worn as its own mesh. */
function paintedArt(d: Dressing, slot: WornSlot): string | null {
  const row = shown(d.look, d.items, slot);
  const texture = cellText(row, SHOWN_TEXTURE);
  return texture && !hasOwnMesh(row) ? TEXTURE_DIR + texture : null;
}

/**
 * Bodies whose head is furred, so they get no painted hair. Own choice: a
 * mendel's face art is fur over the whole head region (read from the user's
 * files).
 */
const FURRED_HEADS = ['mendel_'];

/** The hair art to paint under the hair mesh, or null. */
function hairArt(d: Dressing): string | null {
  if (FURRED_HEADS.some(stem => d.stem.startsWith(stem)) || d.bareScalps.has(d.look.hairStyle))
    return null;
  const colour = hairColourFor(d.look.hairColor, d.hairColours);
  return colour === null ? null : `${TEXTURE_DIR}${d.stem}_hair_a_${twoDigits(colour)}.tga`;
}

/** Every piece the look paints, in dressing order, before they are stacked. */
function piecesFor(d: Dressing): Painted[] {
  const out: Painted[] = [];
  const add = (
    piece: SheetPiece,
    ref: string | null,
    covers: Painted['covers'],
    more: Partial<Painted> = {},
  ): void => {
    if (ref) out.push({ piece, ref, covers, toHips: false, long: false, outer: false, ...more });
  };
  const skin = `${TEXTURE_DIR}${d.stem}_body_${twoDigits(d.look.skin)}`;
  add('skin', `${skin}.tga`, 'sheet');
  add('face', d.look.face ? `${skin}_face_${twoDigits(d.look.face)}.tga` : null, ['head']);
  add('hair', hairArt(d), ['head']);
  add('shirt', paintedArt(d, 'shirt'), 'sheet');
  add('head', paintedArt(d, 'head'), ['head']);
  add('hands', paintedArt(d, 'hands'), ['forearm', 'hand'], {
    outer: isOuter(shown(d.look, d.items, 'hands')),
  });
  add('feet', paintedArt(d, 'feet'), ['shin', 'foot']);
  const robe = longMeshOf(shown(d.look, d.items, 'chest')) !== null;
  add('chest', paintedArt(d, 'chest'), robe ? ['torso', 'skirt'] : ['torso'], { long: robe });
  add('legs', paintedArt(d, 'legs'), d.longMesh ? ['skirt'] : ['thigh', 'shin'], {
    toHips: true,
    long: d.longMesh !== null,
  });
  return out;
}

/**
 * How far out from the skin a piece is worn; only meeting regions need an
 * order. Read from the files (art alpha): hair over face, helmet over both,
 * garments over all, long legwear over a tunic. Own choice: the shirt under
 * every garment, a helmet over a robe's collar, gauntlets over sleeves, long
 * garments over boot tops, a robe over its skirt's legwear, the chest piece
 * over glove tops and waistband, boots over trouser legs.
 */
function depth(p: Painted): number {
  switch (p.piece) {
    case 'skin':
      return 0;
    case 'face':
      return 1;
    case 'hair':
      return 2;
    case 'shirt':
      return 3;
    case 'head':
      return 20;
    case 'hands':
      return p.outer ? 30 : clothingDepth(p);
    default:
      return clothingDepth(p);
  }
}

/** The short clothes from the innermost out, where they meet. */
const SHORT_CLOTHES: readonly SheetPiece[] = ['hands', 'legs', 'feet', 'chest'];

/** Depth among the clothes: short ones by `SHORT_CLOTHES`, long ones over them, a robe over long legs. */
function clothingDepth(p: Painted): number {
  if (!p.long) return 4 + SHORT_CLOTHES.indexOf(p.piece);
  return p.piece === 'chest' ? 11 : 10;
}

/** The pieces a look paints, skin first and each over the ones before it. */
function stacked(d: Dressing): Painted[] {
  return piecesFor(d).sort((a, b) => depth(a) - depth(b));
}

/**
 * 'model/npc/character/human/male/human_m_h.bdae' -> ['human_m', false].
 *
 * Strips the directory and the trailing "_h"/"_m"/"_l" detail suffix, then
 * reads the character before it to tell male from female.
 */
export function modelStem(modelPath: string): [string, boolean] {
  let base = modelPath.split('/').pop() ?? modelPath;
  base = base.replace(/\.[^.]*$/, '');
  if (base.length > 2 && base[base.length - 2] === '_') base = base.slice(0, -2);
  return [base, base.endsWith('_f')];
}

const NO_STYLES: ReadonlySet<number> = new Set();

/**
 * The hair colours the user's files ship for a model: the number of every
 * `<stem>_hair_a_<nn>.tga` among `textureNames`, lowest first.
 */
export function shippedHairColours(modelPath: string, textureNames: Iterable<string>): number[] {
  const prefix = `${modelStem(modelPath)[0].toLowerCase()}_hair_a_`;
  const found = new Set<number>();
  for (const name of textureNames) {
    const base = (name.split('/').pop() ?? name).toLowerCase();
    if (!base.startsWith(prefix) || !base.endsWith('.tga')) continue;
    const digits = base.slice(prefix.length, -'.tga'.length);
    if (/^\d+$/.test(digits)) found.add(Number(digits));
  }
  return [...found].sort((a, b) => a - b);
}

/**
 * The hair colour to paint: the one the look names, or, when it names none,
 * the lowest the model's files ship. Null when there is neither.
 */
export function hairColourFor(asked: number, shipped: readonly number[]): number | null {
  if (asked > 0) return asked;
  return shipped.length > 0 ? shipped[0]! : null;
}

function dressingFor(
  modelPath: string,
  look: Look,
  items: ItemDisplayLookup,
  bareScalps: ReadonlySet<number>,
  hairColours: readonly number[],
): Dressing {
  return {
    stem: modelStem(modelPath)[0],
    look,
    items,
    bareScalps,
    hairColours,
    longMesh: outfitLongMesh(look, items),
  };
}

/**
 * The pieces to paint for a look, in paint order, each with its art.
 * `bareScalps` are the hair styles the model draws as bare scalp
 * (`bareScalpStyles`); `hairColours` the hair colours its files ship
 * (`shippedHairColours`).
 */
export function bodyLayers(
  modelPath: string,
  look: Look,
  items: ItemDisplayLookup,
  bareScalps: ReadonlySet<number> = NO_STYLES,
  hairColours: readonly number[] = [],
): Array<{ piece: SheetPiece; ref: string }> {
  return stacked(dressingFor(modelPath, look, items, bareScalps, hairColours)).map(
    ({ piece, ref }) => ({ piece, ref }),
  );
}

/**
 * How many times to enlarge art before painting it: the power of two that
 * brings its width nearest its region's. Art drawn for a sheet half the size
 * is doubled; art within about 70% of its region's width is left as it is.
 */
function enlargement(regionWidth: number, artWidth: number): number {
  if (artWidth <= 0 || regionWidth <= artWidth) return 1;
  return 2 ** Math.round(Math.log2(regionWidth / artWidth));
}

/**
 * Where art starts on one axis of its region. Art hangs from the far border
 * when the region reaches that border and not the near one — a face ends on
 * the bottom edge of the sheet — and otherwise starts at the region's start.
 */
function anchor(start: number, end: number, sheet: number, art: number): number {
  return end === sheet && start > 0 ? end - art : start;
}

/**
 * Build the skin sheet from decoded layers (`load` returns null for a missing
 * one, which paints nothing). The sheet takes the skin art's size; each piece
 * is placed in its `layout` region and cropped, never squeezed.
 */
export function compositeSkin(
  modelPath: string,
  look: Look,
  items: ItemDisplayLookup,
  load: (ref: string) => DecodedImage | null,
  layout: Footprints,
  bareScalps: ReadonlySet<number> = NO_STYLES,
  hairColours: readonly number[] = [],
): { image: DecodedImage; drawn: Array<{ piece: SheetPiece; ref: string }> } {
  const painted = stacked(dressingFor(modelPath, look, items, bareScalps, hairColours))
    .map(p => ({ ...p, art: load(p.ref) }))
    .filter((p): p is Painted & { art: DecodedImage } => p.art !== null);
  // Without the skin there is no sheet to size by; the widest piece stands in.
  const base =
    painted.find(p => p.piece === 'skin')?.art ??
    painted.reduce<DecodedImage | null>((w, p) => (!w || p.art.width > w.width ? p.art : w), null);
  const width = base?.width ?? 1;
  const height = base?.height ?? 1;

  const sheet: DecodedImage = { width, height, pixels: allocPixels(width, height) };
  const drawn: Array<{ piece: SheetPiece; ref: string }> = [];

  for (const { piece, ref, art, covers, toHips } of painted) {
    const region: Rect | null =
      covers === 'sheet'
        ? [0, 0, width, height]
        : regionRect(
            covers.map(s => layout[s]),
            width,
            height,
            toHips,
          );
    if (!region) continue;
    const k = enlargement(region[2] - region[0], art.width);
    const src = k > 1 ? resizeNearest(art, art.width * k, art.height * k) : art;
    const origin: [number, number] = [
      anchor(region[0], region[2], width, src.width),
      anchor(region[1], region[3], height, src.height),
    ];
    // The skin is the sheet itself; everything over it blends by its alpha.
    blendInto(sheet, src, origin, region, piece !== 'skin');
    drawn.push({ piece, ref });
  }

  return { image: sheet, drawn };
}

/** Nearest-neighbour resample. Good enough for small avatar layers. */
export function resizeNearest(img: DecodedImage, width: number, height: number): DecodedImage {
  if (img.width === width && img.height === height) return img;
  const out = allocPixels(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(img.height - 1, Math.floor((y * img.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(img.width - 1, Math.floor((x * img.width) / width));
      const s = (sy * img.width + sx) * 4;
      const d = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = img.pixels[s + c];
    }
  }
  return { width, height, pixels: out };
}

/** Paint `src` at `origin`, clipped to `clip` and the sheet; `blend` mixes by alpha, else replaces. */
export function blendInto(
  dst: DecodedImage,
  src: DecodedImage,
  origin: [number, number],
  clip: Rect,
  blend = true,
): DecodedImage {
  const [ox, oy] = origin;
  const left = Math.max(0, clip[0], ox);
  const top = Math.max(0, clip[1], oy);
  const right = Math.min(dst.width, clip[2], ox + src.width);
  const bottom = Math.min(dst.height, clip[3], oy + src.height);

  const sp: Pixels = src.pixels;
  const dp: Pixels = dst.pixels;
  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const s = ((y - oy) * src.width + (x - ox)) * 4;
      const d = (y * dst.width + x) * 4;
      const a = sp[s + 3];
      if (!blend || a === 255) {
        for (let c = 0; c < 4; c++) dp[d + c] = sp[s + c];
      } else if (a > 0) {
        const keep = 255 - a;
        for (let c = 0; c < 3; c++)
          dp[d + c] = Math.floor((sp[s + c] * a + dp[d + c] * keep) / 255);
        dp[d + 3] = Math.max(dp[d + 3], a);
      }
    }
  }
  return dst;
}

// -- textures the character model does not name --------------------------------

/**
 * From 1.1.4 on, character models ship without images (the sheet is
 * composited at run time); an imageless material is matched by name: the
 * cape by this table, otherwise `<character>_<material>_01.tga`.
 */
const MATERIAL_TEXTURE: Record<string, string> = {
  cape: PLAIN_CAPE_ART,
};

/** Texture for a character material the model does not name, or null. */
export function avatarTexture(
  modelPath: string,
  material: string,
  resolves: (ref: string) => boolean,
): string | null {
  if (!material || SHEET_MATERIALS.has(material)) return null;
  const path = (modelPath || '').toLowerCase();
  // The whole basename, detail suffix included: only the high-detail
  // character models (`human_m_h`) are matched.
  const base = (path.split('/').pop() ?? path).replace(/\.[^.]*$/, '');
  if (!base.endsWith('_h') || !path.includes('/npc/')) return null;
  const candidates = [MATERIAL_TEXTURE[material], `${base.slice(0, -2)}_${material}_01.tga`];
  for (const name of candidates) {
    if (name && resolves(TEXTURE_DIR + name)) return TEXTURE_DIR + name;
  }
  return null;
}

// -- meshes worn separately ------------------------------------------------------

/**
 * Where a held thing is carried; every playable body has a node for each.
 * Observed in play by the owner, matching the node and file names: shields
 * on `Dummy_shield_back` stowed and `Dummy_Shield` in use; staves and spears
 * on `Dummy_R_Back_Staff`; fist weapons and off-hand rods stay in hand;
 * two-handers on the right of the back; blades, daggers, bows, crossbows and
 * wands rest at their slot's hip or back, a ranged-slot bow drawn in the left
 * hand. Own choice: unknown kinds rest like their slot.
 */
type Place =
  | 'hand'
  | 'shootingHand'
  | 'slotRest'
  | 'back'
  | 'staffMount'
  | 'shieldBack'
  | 'shieldArm';

/** Which side of the body a held slot belongs to. */
type Side = 'L' | 'R';

/** Where a slot keeps what it holds when that thing has no place of its own. */
const SLOT_REST: Partial<Record<WornSlot, 'hip' | 'back'>> = {
  mainHand: 'hip',
  offHand: 'hip',
  twoHand: 'back',
  ranged: 'back',
};

/** The node for a place, for the slot it serves on the side it belongs to. */
const NODE_AT: Readonly<Record<Place, (slot: WornSlot, side: Side) => string>> = {
  hand: (_, side) => `Dummy_${side}_Hand-node`,
  shootingHand: (slot, side) => `Dummy_${slot === 'ranged' ? 'L' : side}_Hand-node`,
  slotRest: (slot, side) =>
    SLOT_REST[slot] === 'hip' ? `Dummy_${side}_Waist-node` : 'Dummy_R_Back-node',
  back: () => 'Dummy_R_Back-node',
  staffMount: () => 'Dummy_R_Back_Staff-node',
  shieldBack: () => 'Dummy_shield_back-node',
  shieldArm: () => 'Dummy_Shield-node',
};

/** Where each kind of held thing goes: put away, and in use. */
const CARRIED: Readonly<Record<HeldKind | 'unknown', { away: Place; inUse: Place }>> = {
  blade: { away: 'slotRest', inUse: 'hand' },
  dagger: { away: 'slotRest', inUse: 'hand' },
  fist: { away: 'hand', inUse: 'hand' },
  trinket: { away: 'hand', inUse: 'hand' },
  great: { away: 'back', inUse: 'hand' },
  pole: { away: 'staffMount', inUse: 'hand' },
  bow: { away: 'slotRest', inUse: 'shootingHand' },
  crossbow: { away: 'slotRest', inUse: 'shootingHand' },
  wand: { away: 'slotRest', inUse: 'hand' },
  shield: { away: 'shieldBack', inUse: 'shieldArm' },
  unknown: { away: 'slotRest', inUse: 'hand' },
};

/** The slots whose item is held rather than worn, and the side each belongs to. */
const HELD_SIDE: Partial<Record<WornSlot, Side>> = {
  twoHand: 'R',
  mainHand: 'R',
  ranged: 'R',
  offHand: 'L',
};

/** The nodes a held item sits on, put away and in use, or null for a worn slot. */
function carriageOf(
  slot: WornSlot,
  item: { itemClass: number; subClass: number },
): { away: string; inUse: string } | null {
  const side = HELD_SIDE[slot];
  if (!side) return null;
  const places = CARRIED[heldKind(item.itemClass, item.subClass) ?? 'unknown'];
  return { away: NODE_AT[places.away](slot, side), inUse: NODE_AT[places.inUse](slot, side) };
}

/** One mesh an item puts on the figure, before its model row is resolved. */
interface Piece {
  model: number;
  texture: string;
  node: string;
  heldNode?: string;
  mirrorX?: true;
  held: boolean;
}

function piecesOf(
  slot: WornSlot,
  row: Row,
  item: () => { itemClass: number; subClass: number },
  drawn: boolean,
): Piece[] {
  const model = cellNumber(row, SHOWN_MODEL);
  const texture = cellText(row, SHOWN_TEXTURE);
  if (slot === 'head') return [{ model, texture, node: 'Dummy_Head-node', held: false }];
  if (slot === 'shoulders') {
    const left: Piece = { model, texture, node: 'Dummy_L_Shoulder-node', held: false };
    const rightModel = cellNumber(row, SHOWN_SECOND_MODEL);
    const right: Piece = rightModel
      ? {
          model: rightModel,
          texture: cellText(row, SHOWN_SECOND_TEXTURE),
          node: 'Dummy_R_Shoulder-node',
          held: false,
        }
      : { ...left, node: 'Dummy_R_Shoulder-node', mirrorX: true };
    return [left, right];
  }
  const carriage = carriageOf(slot, item());
  if (!carriage) return [];
  return [
    {
      model,
      texture,
      node: drawn ? carriage.inUse : carriage.away,
      heldNode: carriage.inUse,
      held: true,
    },
  ];
}

/** A texture named by an item row, under `texture/`. */
const itemTexture = (name: string): string | null =>
  name ? (name.toLowerCase().startsWith('texture/') ? name : `texture/${name}`) : null;

/** The attached effects an item model row names, as node and effect file. */
function effectsOf(row: Row): Array<{ node: string; effect: string }> | undefined {
  const out: Array<{ node: string; effect: string }> = [];
  for (let i = 0; i < EFFECTS_PER_ITEM_MODEL; i++) {
    const node = cellText(row, MODEL_EFFECT_NODES + i);
    const effect = cellText(row, MODEL_EFFECT_FILES + i);
    if (node && effect) out.push({ node, effect });
  }
  return out.length > 0 ? out : undefined;
}

/**
 * The item meshes a look hangs off the figure: helmet, shoulders and anything
 * held. `drawn` puts weapons in hand; otherwise they rest where their kind
 * does, aligned by their own folded node.
 */
export function attachmentsFor(
  look: Look,
  items: ItemDisplayLookup,
  models: ItemModelLookup,
  drawn = false,
  classOf: ItemClassLookup = () => ({ itemClass: 0, subClass: 0 }),
): EquipmentAttachment[] {
  const out: EquipmentAttachment[] = [];
  const seen = new Set<string>();
  for (const slot of SLOTS) {
    const id = look.worn[slot];
    // A two-hander the table lists in both columns is carried once.
    if (slot === 'mainHand' && id !== 0 && id === look.worn.twoHand) continue;
    const row = id ? items(id) : undefined;
    if (!row) continue;
    for (const piece of piecesOf(slot, row, () => classOf(id), drawn)) {
      if (!piece.model) continue;
      const modelRow = models(piece.model);
      const model = cellText(modelRow, MODEL_PATH).replace(/^(?:\.\.\/)+mid_data\//, '');
      if (!modelRow || !model) continue;
      const texture = itemTexture(piece.texture);
      const key = `${model}|${texture ?? ''}|${piece.node}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        model,
        texture,
        node: piece.node,
        slot,
        heldNode: piece.heldNode,
        mirrorX: piece.mirrorX,
        alignNode: piece.held && !drawn ? 'Dummy_folded-node' : undefined,
        effects: effectsOf(modelRow),
      });
    }
  }
  return out;
}
