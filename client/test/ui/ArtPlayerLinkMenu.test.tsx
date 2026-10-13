/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:playerLink', width: 200, height: 100 }),
}));

import { ArtPlayerLinkMenu } from '../../src/ui/components/ArtPlayerLinkMenu';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix,
  name,
  opacity: 1,
});

/** Five buttons in a row: as many slots as the popup's art carries. */
function skin(): UiSkinData {
  const rect = (name: string, x: number): UiSkinPlaced => place(11, at(x, 0), name);
  return {
    movie: 'TEST',
    width: 200,
    height: 40,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 40, h: 40 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 40L0 40Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            rect('btn01', 0),
            rect('btn02', 40),
            rect('btn03', 80),
            rect('btn04', 120),
            rect('btn05', 160),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, at(0, 0), 'dlgPlayerLink')]],
  };
}

const spec = {
  screens: {
    playerLink: {
      dialog: 'dlgPlayerLink',
      frame: ['btn01', 'btn02', 'btn03', 'btn04', 'btn05'],
      actions: {
        btn01: 'slot1',
        btn02: 'slot2',
        btn03: 'slot3',
        btn04: 'slot4',
        btn05: 'slot5',
      },
      values: {
        slot1: 'text01',
        slot2: 'text02',
        slot3: 'text03',
        slot4: 'text04',
        slot5: 'text05',
      },
    },
  },
};

const nothing = { onClose: vi.fn() };

describe('ArtPlayerLinkMenu', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtPlayerLinkMenu {...nothing} actions={[]} />);
    expect(queryByRole('menu')).toBeNull();
  });

  it('offers exactly as many actions as it was given, not every slot the piece has', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getAllByRole } = render(
      <ArtPlayerLinkMenu
        {...nothing}
        actions={[
          { label: 'Whisper', onPick: vi.fn() },
          { label: 'Add Friend', onPick: vi.fn() },
        ]}
      />,
    );
    expect(getAllByRole('menuitem')).toHaveLength(2);
  });

  it('names each slot with whatever the caller called it, not a game name', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByLabelText } = render(
      <ArtPlayerLinkMenu {...nothing} actions={[{ label: 'Invite to team', onPick: vi.fn() }]} />,
    );
    expect(getByLabelText('Invite to team')).toBeTruthy();
  });

  it('picks the action that was pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const { getByLabelText } = render(
      <ArtPlayerLinkMenu {...nothing} actions={[{ label: 'Report', onPick }]} />,
    );
    fireEvent.click(getByLabelText('Report'));
    expect(onPick).toHaveBeenCalled();
  });

  it('closes when a press lands anywhere else', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onClose = vi.fn();
    render(
      <ArtPlayerLinkMenu onClose={onClose} actions={[{ label: 'Report', onPick: vi.fn() }]} />,
    );
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });
});
