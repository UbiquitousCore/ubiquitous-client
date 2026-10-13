/**
 * Small pictures cut from the player's UI sheets once mounted, as image
 * URLs; absent until then, and wearers draw a neutral fallback.
 */

import { signal } from '@preact/signals';

import type { UiMovie } from '../../assets/ids';
import type { UiSkinArt, UiSkinData, UiSkinFill } from '../../assets/types';

/** A rectangle on a sheet, in the pixels of the sheet's base-size copy. */
export interface SpriteRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where one sprite lives: the movie that wears it, the instance, and its sheet. */
export interface UiSpriteSpec {
  movie: UiMovie;
  /** Instance name of a placement in the movie that draws the sprite. */
  instance: string;
  /** The sheet the sprite is cut from; an instance filled from any other is not it. */
  sheet: string;
}

/* Sprites are located through the build's own movie, which differ, never hard-coded. */
const ICONS = 'zhanshi.png';
const BANNER = 'UI_store_banner.png';

const on =
  (sheet: string) =>
  (instance: string): UiSpriteSpec => ({ movie: 'IGM', instance, sheet });
const icon = on(ICONS);
const banner = on(BANNER);

export const UI_SPRITES = {
  'coin-gold': icon('iconGold'),
  'coin-silver': icon('iconSilver'),
  'coin-copper': icon('iconcopper'),
  'button-fill-light': banner('btnJoinQueue'),
  'stick-ring': icon('touchpadbak'),
  'stick-knob': icon('btnstick'),
} as const satisfies Record<string, UiSpriteSpec>;

export type UiSpriteName = keyof typeof UI_SPRITES;

export const UI_SPRITE_NAMES = Object.keys(UI_SPRITES) as UiSpriteName[];

/**
 * The design-system slot each sprite fills, for those worn as a surface.
 * The slots ship as `none` in `theme.css`; setting one re-skins every
 * surface that reads it.
 */
export const SPRITE_SLOTS: Partial<Record<UiSpriteName, string>> = {
  'button-fill-light': '--texture-button-fill-light',
  'stick-ring': '--texture-stick-ring',
  'stick-knob': '--texture-stick-knob',
};

/** Sprites cut so far, by name, as image URLs. Empty until a game file is mounted. */
export const uiSprites = signal<ReadonlyMap<UiSpriteName, string>>(new Map());

export function setUiSprites(found: ReadonlyMap<UiSpriteName, string>): void {
  if (!found.size) return;
  const merged = new Map(uiSprites.value);
  for (const [name, url] of found) merged.set(name, url);
  uiSprites.value = merged;
}

/** Reads one interface movie out of the player's files; null where it is not there. */
export type MovieSource = (movie: UiMovie) => Promise<UiSkinData | null>;

/** Reads one sheet out of the player's files; null where it is not there. */
export type SheetSource = (sheet: string, movie: UiMovie) => Promise<UiSkinArt | null>;

/** Cuts a rectangle, in the image's own pixels, out of a sheet as an image URL. */
export type SpriteCutter = (image: ImageBitmap, rect: SpriteRect) => Promise<string | null>;

/**
 * Where a base-size rectangle lands on the copy of the sheet actually read.
 * `scale` is how large one of that copy's pixels draws, so a copy twice
 * the base size has a scale of one half and every edge doubles.
 */
export function rectOnCopy(rect: SpriteRect, scale: number): SpriteRect {
  const k = scale > 0 ? 1 / scale : 1;
  return {
    x: Math.round(rect.x * k),
    y: Math.round(rect.y * k),
    w: Math.round(rect.w * k),
    h: Math.round(rect.h * k),
  };
}

function inside(rect: SpriteRect, image: ImageBitmap): boolean {
  return (
    rect.w > 0 &&
    rect.h > 0 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= image.width &&
    rect.y + rect.h <= image.height
  );
}

/** How many units of a bitmap fill's matrix draw one pixel of its sheet at 1:1. */
const FILL_UNITS_PER_PIXEL = 20;

/** A sprite's rect on its sheet, from the first placement filling it: the shape's bounds back through the fill matrix. */
export function locateSprite(movie: UiSkinData, spec: UiSpriteSpec): SpriteRect | null {
  const shapes = new Map(movie.shapes.map(shape => [shape.id, shape]));
  const sprites = new Map(movie.sprites.map(sprite => [sprite.id, sprite]));
  const fromSheet = (fill: UiSkinFill): fill is Extract<UiSkinFill, { kind: 'bitmap' }> =>
    fill.kind === 'bitmap' && fill.art === spec.sheet && fill.matrix.a > 0 && fill.matrix.d > 0;

  const find = (characterId: number, depth: number): SpriteRect | null => {
    const shape = shapes.get(characterId);
    if (shape) {
      const fill = shape.fills.find(fromSheet);
      if (!fill) return null;
      const kx = FILL_UNITS_PER_PIXEL / fill.matrix.a;
      const ky = FILL_UNITS_PER_PIXEL / fill.matrix.d;
      return {
        x: Math.round((shape.bounds.x - fill.matrix.tx) * kx),
        y: Math.round((shape.bounds.y - fill.matrix.ty) * ky),
        w: Math.round(shape.bounds.w * kx),
        h: Math.round(shape.bounds.h * ky),
      };
    }
    const sprite = sprites.get(characterId);
    if (!sprite || depth > 4) return null;
    for (const child of sprite.frames[0] ?? []) {
      if (child.characterId === null) continue;
      const found = find(child.characterId, depth + 1);
      if (found) return found;
    }
    return null;
  };

  const lists = [...movie.root.slice(0, 1), ...movie.sprites.map(sprite => sprite.frames[0] ?? [])];
  for (const list of lists) {
    for (const placed of list) {
      if (placed.name !== spec.instance || placed.characterId === null) continue;
      const found = find(placed.characterId, 0);
      if (found) return found;
    }
  }
  return null;
}

/** Cut the named sprites out, each sheet read once; a missing one is left out rather than failing the rest. */
export async function cutUiSprites(
  readMovie: MovieSource,
  readSheet: SheetSource,
  cut: SpriteCutter,
  names: readonly UiSpriteName[] = UI_SPRITE_NAMES,
): Promise<Map<UiSpriteName, string>> {
  const once = <T>(
    held: Map<string, Promise<T | null>>,
    key: string,
    read: () => Promise<T | null>,
  ) => {
    let got = held.get(key);
    if (!got) {
      got = read().catch(() => null);
      held.set(key, got);
    }
    return got;
  };
  const movies = new Map<string, Promise<UiSkinData | null>>();
  const sheets = new Map<string, Promise<UiSkinArt | null>>();
  const found = new Map<UiSpriteName, string>();
  for (const name of names) {
    const spec: UiSpriteSpec = UI_SPRITES[name];
    const movie = await once(movies, spec.movie, () => readMovie(spec.movie));
    const placed = movie && locateSprite(movie, spec);
    if (!placed) continue;
    const art = await once(sheets, `${spec.movie}/${spec.sheet}`, () =>
      readSheet(spec.sheet, spec.movie),
    );
    if (!art) continue;
    const rect = rectOnCopy(placed, art.scale);
    if (!inside(rect, art.image)) continue;
    const url = await cut(art.image, rect).catch(() => null);
    if (url) found.set(name, url);
  }
  return found;
}

/** The browser's cutter: draw the rectangle onto a canvas and hand back a blob URL. */
export const cutToBlobUrl: SpriteCutter = async (image, rect) => {
  const canvas = document.createElement('canvas');
  canvas.width = rect.w;
  canvas.height = rect.h;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
};

/**
 * Point the design system's texture slots at whichever sprites have been
 * cut, and keep them pointed there as more arrive. A slot whose sprite is
 * absent keeps the `none` the stylesheet gives it.
 */
export function applySpriteSlots(
  sprites: ReadonlyMap<UiSpriteName, string>,
  root: HTMLElement,
): void {
  for (const [name, slot] of Object.entries(SPRITE_SLOTS) as [UiSpriteName, string][]) {
    const url = sprites.get(name);
    if (url) root.style.setProperty(slot, `url('${url}')`);
    else root.style.removeProperty(slot);
  }
}
