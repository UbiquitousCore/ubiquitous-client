/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:room', width: 150, height: 250 }),
}));

import { ArtTryOn } from '../../src/ui/components/ArtTryOn';
import { setBodyStageSource } from '../../src/ui/components/BodyStage';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  setBodyStageSource(() => null);
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** A backing, a dark room, a reset control and a close. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 30, h: 30 },
        fills: [{ kind: 'solid', css: 'rgb(0, 0, 0)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L30 0L30 30L0 30Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'back'),
            place(11, 10, 40, 'room'),
            place(11, 10, 80, 'again'),
            place(11, 100, 0, 'shut'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'theRoom')]],
  };
}

const spec = {
  screens: {
    fittingRoom: {
      dialog: 'theRoom',
      close: 'shut',
      groups: { room: 'room' },
      actions: { again: 'reset' },
    },
  },
};

describe('ArtTryOn', () => {
  it("stages the hero wearing every piece tried on, in the room's own dark square", () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const asked: Array<readonly number[] | undefined> = [];
    setBodyStageSource((_unit, tryOn) => {
      asked.push(tryOn);
      return null;
    });
    const { getByRole } = render(
      <ArtTryOn entries={[42, 43]} onReset={() => {}} onClose={() => {}} />,
    );
    expect(getByRole('dialog', { name: 'Fitting room' })).toBeTruthy();
    expect(asked).toContainEqual([42, 43]);
  });

  it('resets and closes from its own controls', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onReset = vi.fn();
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <ArtTryOn entries={[42]} onReset={onReset} onClose={onClose} />,
    );
    fireEvent.click(getByLabelText('Reset'));
    expect(onReset).toHaveBeenCalled();
    fireEvent.click(getByLabelText('Close the fitting room'));
    expect(onClose).toHaveBeenCalled();
  });
});
