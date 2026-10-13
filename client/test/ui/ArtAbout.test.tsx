/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

// There is no canvas here, and what is drawn is not what this is about:
// what the panel says.
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:about', width: 200, height: 200 }),
}));

import { ArtAbout } from '../../src/ui/frontend/ArtAbout';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
});

const place = (characterId: number, ty: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty },
  name,
  opacity: 1,
});

/** The smallest panel: a backdrop, a title field, a body field and a close control. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [
      {
        id: 1,
        bounds: { x: 0, y: 0, w: 40, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 20L0 20Z' }],
      },
    ],
    sprites: [
      {
        id: 2,
        frameCount: 1,
        frames: [
          [place(1, 0, 'back'), place(1, 30, 'title'), place(1, 60, 'body'), place(1, 90, 'shut')],
        ],
      },
    ],
    edits: [],
    root: [[place(2, 0, 'theAbout')]],
  } as unknown as UiSkinData;
}

describe('ArtAbout', () => {
  it('says the client is not affiliated with or endorsed by the game’s publisher', () => {
    uiSpec.value = {
      screens: {
        about: {
          dialog: 'theAbout',
          frame: 'back',
          values: { title: 'title', body: 'body' },
          actions: { shut: 'close' },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(<ArtAbout onClose={() => undefined} />);
    expect(container.textContent).toContain('Not affiliated with or endorsed by Gameloft.');
  });
});
