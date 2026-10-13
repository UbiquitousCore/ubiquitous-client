/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { UiMovie } from '../../src/assets/ids';
import type { UiSkinArt, UiSkinData } from '../../src/assets/types';
import {
  SPRITE_SLOTS,
  UI_SPRITES,
  UI_SPRITE_NAMES,
  applySpriteSlots,
  cutUiSprites,
  locateSprite,
  rectOnCopy,
  setUiSprites,
  uiSprites,
  type SpriteRect,
  type UiSpriteName,
} from '../../src/ui/art/uiSprites';
import { Plinth } from '../../src/ui/components/ItemSocket';
import { clearUiSprites } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearUiSprites();
});

/** A stand-in bitmap: the cutter only ever asks a sheet for its size. */
function sheet(width: number, height: number, scale = 1): UiSkinArt {
  return { image: { width, height } as ImageBitmap, scale };
}

/** A cutter that says where it cut, so a test can read the rectangle back. */
const describeCut = async (image: ImageBitmap, r: SpriteRect): Promise<string> =>
  `blob:${image.width}/${r.x},${r.y},${r.w},${r.h}`;

const IDENTITY = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/**
 * A stand-in interface movie: each named instance wraps a shape filled from
 * `sheet` so that the shape shows the sheet's pixels from (x, y), w by h.
 */
function movie(
  parts: Record<string, { sheet: string; x: number; y: number; w: number; h: number }>,
): UiSkinData {
  const shapes: UiSkinData['shapes'] = [];
  const placed: UiSkinData['root'][number] = [];
  let id = 100;
  for (const [instance, at] of Object.entries(parts)) {
    shapes.push({
      id,
      bounds: { x: 0, y: 0, w: at.w, h: at.h },
      fills: [
        {
          kind: 'bitmap',
          imageId: 1,
          art: at.sheet,
          repeating: false,
          matrix: { a: 20, b: 0, c: 0, d: 20, tx: -at.x, ty: -at.y },
        },
      ],
      paths: [],
    });
    placed.push({ depth: id, characterId: id, matrix: IDENTITY, name: instance, opacity: 1 });
    id++;
  }
  return {
    movie: 'IGM',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes,
    edits: [],
    root: [],
    sprites: [{ id: 1, frameCount: 1, frames: [placed] }],
  };
}

const ICONS = UI_SPRITES['coin-silver'].sheet;
const BANNER = UI_SPRITES['button-fill-light'].sheet;

/** Every sprite placed somewhere distinct on its sheet. */
function fullMovie(): UiSkinData {
  const parts: Parameters<typeof movie>[0] = {};
  UI_SPRITE_NAMES.forEach((name, i) => {
    const spec = UI_SPRITES[name];
    parts[spec.instance] = { sheet: spec.sheet, x: 10 + i * 20, y: 5, w: 16, h: 12 };
  });
  return movie(parts);
}

describe('finding a sprite in the player’s movie', () => {
  it('reads the rectangle back through the fill', () => {
    const film = movie({ iconSilver: { sheet: ICONS, x: 300, y: 40, w: 50, h: 50 } });
    expect(locateSprite(film, UI_SPRITES['coin-silver'])).toEqual({ x: 300, y: 40, w: 50, h: 50 });
  });

  it('follows the instance down into the sprite that draws it', () => {
    const film = movie({ inner: { sheet: ICONS, x: 7, y: 9, w: 19, h: 19 } });
    film.sprites.push({
      id: 2,
      frameCount: 1,
      frames: [[{ depth: 1, characterId: 1, matrix: IDENTITY, name: 'iconGold', opacity: 1 }]],
    });
    expect(locateSprite(film, UI_SPRITES['coin-gold'])).toEqual({ x: 7, y: 9, w: 19, h: 19 });
  });

  it('refuses an instance filled from some other sheet', () => {
    const film = movie({ btnJoinQueue: { sheet: ICONS, x: 1, y: 1, w: 10, h: 10 } });
    expect(locateSprite(film, UI_SPRITES['button-fill-light'])).toBeNull();
  });

  it('answers nothing for an instance the movie does not have', () => {
    expect(locateSprite(movie({}), UI_SPRITES['coin-copper'])).toBeNull();
  });
});

describe('cutting sprites from the player’s sheets', () => {
  it('answers each name with the URL its cut came back as', async () => {
    const found = await cutUiSprites(
      async () => fullMovie(),
      async () => sheet(1024, 1024),
      describeCut,
      ['coin-silver', 'button-fill-light'],
    );
    const silver = locateSprite(fullMovie(), UI_SPRITES['coin-silver'])!;
    expect(found.get('coin-silver')).toBe(
      `blob:1024/${silver.x},${silver.y},${silver.w},${silver.h}`,
    );
    expect([...found.keys()]).toEqual(['coin-silver', 'button-fill-light']);
  });

  it('reads the movie once and each sheet once however many sprites share them', async () => {
    const readMovie = vi.fn(async () => fullMovie());
    const read = vi.fn(async (_sheet: string, _movie: UiMovie) => sheet(1024, 1024));
    await cutUiSprites(readMovie, read, describeCut);
    expect(readMovie).toHaveBeenCalledTimes(1);
    expect(new Set(read.mock.calls.map(([name]) => name))).toEqual(new Set([ICONS, BANNER]));
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('scales the cut to a finer copy of the sheet', async () => {
    const found = await cutUiSprites(
      async () => fullMovie(),
      async () => sheet(4096, 4096, 0.25),
      describeCut,
      ['coin-copper'],
    );
    const { x, y, w, h } = locateSprite(fullMovie(), UI_SPRITES['coin-copper'])!;
    expect(found.get('coin-copper')).toBe(`blob:4096/${x * 4},${y * 4},${w * 4},${h * 4}`);
    expect(rectOnCopy({ x: 3, y: 5, w: 7, h: 9 }, 0.5)).toEqual({ x: 6, y: 10, w: 14, h: 18 });
  });

  it('leaves out a sprite with no movie, no sheet, or a cut that falls off it', async () => {
    expect(
      (
        await cutUiSprites(
          async () => null,
          async () => sheet(1024, 1024),
          describeCut,
        )
      ).size,
    ).toBe(0);
    const read = async (name: string): Promise<UiSkinArt | null> =>
      name === BANNER ? null : sheet(8, 8);
    expect(
      (
        await cutUiSprites(async () => fullMovie(), read, describeCut, [
          'button-fill-light',
          'coin-silver',
        ])
      ).size,
    ).toBe(0);
  });

  it('survives a movie or sheet that fails to read and a cut that fails', async () => {
    const read = async (name: string): Promise<UiSkinArt | null> => {
      if (name === BANNER) throw new Error('no pack');
      return sheet(1024, 1024);
    };
    const coin = locateSprite(fullMovie(), UI_SPRITES['coin-gold'])!;
    const cut = async (image: ImageBitmap, r: SpriteRect): Promise<string | null> => {
      if (r.x === coin.x) throw new Error('no canvas');
      return describeCut(image, r);
    };
    const found = await cutUiSprites(async () => fullMovie(), read, cut, [
      'button-fill-light',
      'coin-gold',
      'coin-silver',
    ]);
    expect([...found.keys()]).toEqual(['coin-silver']);
    await expect(
      cutUiSprites(
        async () => {
          throw new Error('no movie');
        },
        read,
        cut,
      ),
    ).resolves.toEqual(new Map());
  });
});

describe('publishing sprites', () => {
  it('keeps what arrived before', () => {
    setUiSprites(new Map([['coin-silver', 'blob:a']]));
    setUiSprites(new Map([['button-fill-light', 'blob:b']]));
    expect(uiSprites.value.get('coin-silver')).toBe('blob:a');
    expect(uiSprites.value.get('button-fill-light')).toBe('blob:b');
  });

  it('points each texture slot at its sprite, and clears the ones with none', () => {
    const root = document.createElement('div');
    const [first, ...rest] = Object.keys(SPRITE_SLOTS) as UiSpriteName[];
    root.style.setProperty(SPRITE_SLOTS[rest[0]!]!, "url('stale')");
    applySpriteSlots(new Map([[first!, 'blob:page']]), root);
    expect(root.style.getPropertyValue(SPRITE_SLOTS[first!]!)).toBe("url('blob:page')");
    for (const name of rest) expect(root.style.getPropertyValue(SPRITE_SLOTS[name]!)).toBe('');
  });
});

describe('what wears a sprite, with no art', () => {
  it('stands an item on a CSS plinth', () => {
    const { container } = render(<Plinth />);
    expect(container.querySelector('[data-socket="plinth"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });
});
