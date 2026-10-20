/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:map', width: 100, height: 100 }),
}));

import { ArtMinimap } from '../../src/ui/components/ArtMinimap';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { minimapShown } from '../../src/ui/hudStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  minimapShown.value = true;
});

const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y },
  name,
  opacity: 1,
});

/** A ring, and a fold control beside it. */
function skin(): UiSkinData {
  const square = (id: number, size: number) => ({
    id,
    bounds: { x: 0, y: 0, w: size, h: size },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${size} 0L${size} ${size}L0 ${size}Z` }],
  });
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [square(11, 100), square(12, 20)],
    sprites: [
      { id: 20, frameCount: 1, frames: [[place(11, 0, 0, 'ring'), place(12, 100, 0, 'fold')]] },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'theMap')]],
  };
}

const spec = {
  screens: {
    minimap: {
      dialog: 'theMap',
      frame: 'ring',
      pieces: { toggle: { dialog: 'theMap', part: 'fold' } },
    },
  },
};

describe('ArtMinimap', () => {
  it('folds the ground and the ring away on its control, and brings them back', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container, getByRole } = render(<ArtMinimap />);
    expect(container.querySelector('[data-map="disc"]')).not.toBeNull();

    fireEvent.click(getByRole('button', { name: 'Fold the minimap away' }));
    expect(container.querySelector('[data-map="disc"]')).toBeNull();

    fireEvent.click(getByRole('button', { name: 'Bring the minimap back' }));
    expect(container.querySelector('[data-map="disc"]')).not.toBeNull();
  });
});
