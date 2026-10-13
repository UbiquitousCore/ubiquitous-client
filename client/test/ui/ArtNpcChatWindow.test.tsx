/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:chat', width: 400, height: 280 }),
}));

import { ArtNpcChatWindow } from '../../src/ui/components/ArtNpcChatWindow';
import { GossipWindow } from '../../src/ui/GossipWindow';
import { closeGossip, gossip, showGossip } from '../../src/ui/hudStore';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  closeGossip();
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** The talking screen: a sheet, a name plate, the words, a Back control and a cross. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 280,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 30, h: 30 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L30 0L30 30L0 30Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 300, h: 150 },
        fills: [{ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L300 0L300 150L0 150Z' }],
      },
    ],
    sprites: [
      { id: 44, frameCount: 1, frames: [[place(11, 0, 0, 'text')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, 0, 0, 'back'),
            place(44, 10, 10, 'panelTitle'),
            place(12, 10, 50, 'text'),
            place(11, 150, 230, 'btnBack'),
            place(11, 150, 230, 'textBack'),
            place(11, 360, 10, 'btnClose'),
          ],
        ],
      },
      { id: 21, frameCount: 1, frames: [[place(12, 0, 0, 'back')]] },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'theChat'), place(21, 0, 0, 'theList')]],
  };
}

const spec = {
  screens: {
    npcChat: {
      dialog: 'theChat',
      close: 'btnClose',
      values: { title: 'panelTitle/text', body: 'text', back: 'textBack' },
      actions: { btnBack: 'back' },
      words: { back: 'Back' },
    },
    questAsk: { dialog: 'theList' },
  },
};

describe('ArtNpcChatWindow', () => {
  it('goes back one page from Back and shuts from the cross', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onBack = vi.fn();
    const onClose = vi.fn();
    const { getByRole } = render(
      <ArtNpcChatWindow speaker="Sample Keeper" says="Hm." onBack={onBack} onClose={onClose} />,
    );
    fireEvent.click(getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lists what can be said back under what is said', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const pick = vi.fn();
    const { getByRole, getByText } = render(
      <ArtNpcChatWindow
        speaker="Sample Keeper"
        says="The road north is closed."
        choices={[{ label: 'Where is the captain?', onPick: pick }]}
        onBack={() => {}}
        onClose={() => {}}
      />,
    );
    expect(getByText('The road north is closed.')).toBeTruthy();
    fireEvent.click(getByRole('button', { name: 'Where is the captain?' }));
    expect(pick).toHaveBeenCalledOnce();
  });
});

describe('GossipWindow, worn', () => {
  it('keeps Back and the cross on a page of choices, too', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const back = vi.fn();
    const pick = vi.fn();
    showGossip({
      title: 'Sample Keeper',
      text: [{ text: 'Ask away.', tone: 'plain' }],
      choices: [{ label: 'Where is the captain?', onPick: pick }],
      onBack: back,
    });
    const { getByRole } = render(<GossipWindow />);
    fireEvent.click(getByRole('button', { name: 'Where is the captain?' }));
    expect(pick).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: 'Back' }));
    expect(back).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(gossip.value).toBeNull();
  });
});
