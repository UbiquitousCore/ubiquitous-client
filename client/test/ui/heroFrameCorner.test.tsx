/** @vitest-environment happy-dom */
/**
 * Where the hero's frame stands, against the player's own builds.
 *
 * The frame is cut out of a dialog the whole HUD shares and stands at its
 * own size in the top corner. It must be framed on the art this hero draws
 * and nothing else: the art reaches the frame's top and left edges, so the
 * frame stands flush in the corner, and the ring sits where the corner art
 * puts it for the hero's class. Skips on a checkout with no build on disk.
 */
import { File as NodeFile } from 'node:buffer';
import { existsSync, openAsBlob, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, render } from '@testing-library/preact';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

interface Drawn {
  box: { x: number; y: number; w: number; h: number };
  parts: Array<{
    path: string;
    draws: boolean;
    box: { x: number; y: number; w: number; h: number };
  }>;
}
const drawn: Drawn[] = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: (plan: Drawn) => {
    drawn.push(plan);
    return { url: 'blob:frame', width: plan.box.w, height: plan.box.h };
  },
}));

import { PackAssetProvider } from '../../src/assets/providers/PackAssetProvider';
import { uiSkinId, uiStringsId } from '../../src/assets/ids';
import type { UiSkinData } from '../../src/assets/types';
import { setMovie, setUiWords } from '../../src/ui/art/pieceStore';
import { screenSpec } from '../../src/ui/art/uiSpec';
import { ArtPlayerFrame, PLAYER_FRAME_SCREEN } from '../../src/ui/components/ArtPlayerFrame';
import type { ResourceType, Unit } from '../../src/ui/hudStore';
import { clearMovies, clearUiWords } from '../helpers/stores';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CACHE = join(ROOT, '.cache');
const BUILDS = existsSync(CACHE)
  ? readdirSync(CACHE)
      .filter(dir => existsSync(join(CACHE, dir, 'res.bin')))
      .sort()
  : [];

const read = new Map<string, { skin: UiSkinData; words: readonly string[] }>();

beforeAll(async () => {
  for (const build of BUILDS) {
    const provider = new PackAssetProvider();
    // The pack reader wants the platform's own file, not the page's.
    const bytes = await openAsBlob(join(CACHE, build, 'res.bin'));
    const file = new NodeFile([bytes as unknown as ArrayBuffer], 'res.bin') as unknown as File;
    await provider.useSource(provider.offer([file]).id);
    const skin = await provider.load(uiSkinId('IGM')).catch(() => null);
    if (!skin) continue;
    read.set(build, { skin, words: await provider.load(uiStringsId()).catch(() => []) });
  }
}, 120_000);

afterEach(() => {
  drawn.length = 0;
  cleanup();
  clearMovies();
  clearUiWords();
});

const hero = (resource: ResourceType): Unit => ({
  id: 'hero',
  name: 'Hero',
  level: 10,
  health: 60,
  maxHealth: 100,
  mana: 60,
  maxMana: 100,
  exp: 40,
  expToLevel: 100,
  disposition: 'friendly',
  resource,
});

const pct = (value: string | undefined): number => Number.parseFloat(value ?? 'NaN') / 100;

/**
 * The frame as drawn for this hero: its size, and where the ring's face
 * stands in it, both in the movie's own units.
 */
function standing(build: string, resource: ResourceType) {
  const one = read.get(build)!;
  setUiWords(one.words);
  // A copy, so the frame is drawn for this test rather than answered from
  // the last test's drawing of the same movie.
  setMovie({ skin: { ...one.skin }, art: new Map() });
  const { container } = render(<ArtPlayerFrame unit={hero(resource)} portraitUrl="blob:face" />);
  const plan = drawn.at(-1)!;
  const socket = container.querySelector<HTMLElement>('[data-socket]')!;
  const spec = screenSpec(PLAYER_FRAME_SCREEN)!;
  return { plan, socket, spec };
}

/**
 * Where each build's ring face stands in its frame, in movie units from the
 * frame's top-left corner, for each kind of hero.
 */
const RING_AT: Record<string, Partial<Record<ResourceType, { x: number; y: number }>>> = {
  // The corner ornament stands in the corner, for every class: a
  // warrior's or a ranger's meter wraps round the ring's right side and
  // takes no room from the corner once its own ornaments are left out.
  // The socket is fitted to the ring's opaque edge, not the corner art.
  '1.1.4': {
    mana: { x: 6.7, y: 9.4 },
    morale: { x: 6.7, y: 9.4 },
    vigor: { x: 6.7, y: 9.4 },
  },
  // The meters are inside the ring, which stands flush in the corner.
  '2.2.0': {
    mana: { x: 5.6, y: 3.8 },
    morale: { x: 5.6, y: 3.8 },
    vigor: { x: 5.6, y: 3.8 },
  },
};

describe.skipIf(!BUILDS.length)('the hero’s frame in the corner, in the player’s builds', () => {
  for (const build of BUILDS) {
    for (const resource of ['mana', 'morale', 'vigor'] as const) {
      it(`${build}, a hero who spends ${resource}: the art reaches the frame's top and left edges`, () => {
        const { plan, spec } = standing(build, resource);
        const framedOn = Array.isArray(spec.frame) ? spec.frame : [spec.frame];
        const art = plan.parts.filter(
          part => framedOn.includes(part.path) && part.draws && part.box.w > 0,
        );
        expect(art.length).toBeGreaterThan(0);
        expect(Math.min(...art.map(part => part.box.x))).toBeCloseTo(0, 0);
        expect(Math.min(...art.map(part => part.box.y))).toBeCloseTo(0, 0);
      });

      it(`${build}, a hero who spends ${resource}: the ring stands where the corner puts it`, () => {
        const { plan, socket } = standing(build, resource);
        const at = {
          x: pct(socket.style.left) * plan.box.w,
          y: pct(socket.style.top) * plan.box.h,
        };
        const want = RING_AT[build]?.[resource];
        if (!want) return;
        expect(at.x).toBeCloseTo(want.x, 0);
        expect(at.y).toBeCloseTo(want.y, 0);
      });
    }
  }
});
