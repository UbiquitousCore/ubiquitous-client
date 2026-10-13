/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:peek', width: 224, height: 84 }),
}));

import { ArtChatPeek } from '../../src/ui/components/ArtChatPeek';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { PEEK_MS, chatOpen, clearChat, noteChat } from '../../src/ui/chatStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  clearChat();
  uiSpec.value = null;
  vi.useRealTimers();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const rect = (name: string, x: number, y: number): UiSkinPlaced => ({
  depth: 1,
  characterId: 11,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** The chat's text panel: its translucent backing and the field the log is written in. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 200, h: 80 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 0.5 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 80L0 80Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [[rect('background', 0, 0), rect('textChat', 5, 5), rect('bgName', 0, 90)]],
      },
    ],
    edits: [],
    root: [[{ depth: 1, characterId: 20, matrix: at(0, 0), name: 'dlgSampleChat', opacity: 1 }]],
  };
}

const spec = {
  screens: {
    chatPeek: {
      dialog: 'dlgSampleChat',
      frame: ['background', 'textChat'],
      values: { body: 'textChat' },
      hidden: ['bgName'],
    },
  },
};

function mount(): ReturnType<typeof render> {
  uiSpec.value = spec;
  setMovie({ skin: skin(), art: new Map() });
  return render(<ArtChatPeek tones={{ trade: '#FFFFFF', party: 'gray' }} />);
}

describe('ArtChatPeek', () => {
  it('stays out of sight until something is said', () => {
    const { getByLabelText } = mount();
    expect(getByLabelText('Open chat').getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the latest line on any channel, with who said it, in its channel colour', () => {
    const { getByLabelText, getByRole } = mount();
    act(() => noteChat({ channel: 'party', sender: 'Ayla', text: 'pull now' }));
    expect(getByLabelText('Open chat').getAttribute('aria-hidden')).toBe('false');
    const line = getByRole('log', { name: 'Latest chat' }).lastElementChild as HTMLElement;
    expect(line.textContent).toBe('[Ayla]: pull now');
    expect(line.style.color).toBe('gray');
  });

  it('goes away a while after the last line', () => {
    vi.useFakeTimers();
    const { getByLabelText } = mount();
    act(() => noteChat({ channel: 'trade', sender: 'Bram', text: 'selling ore' }));
    act(() => {
      vi.advanceTimersByTime(PEEK_MS + 50);
    });
    expect(getByLabelText('Open chat').getAttribute('aria-hidden')).toBe('true');
  });

  it('opens the log when pressed', () => {
    const { getByLabelText } = mount();
    act(() => noteChat({ channel: 'trade', sender: 'Bram', text: 'selling ore' }));
    fireEvent.click(getByLabelText('Open chat'));
    expect(chatOpen.value).toBe(true);
  });

  it('takes a press while it shows, though it stands on a layer that lets presses through', () => {
    // The HUD lets every press through to the world unless a piece of it
    // asks for them back; a box that does not ask is one a press misses.
    const { getByLabelText } = mount();
    expect(getByLabelText('Open chat').style.pointerEvents).toBe('none');
    act(() => noteChat({ channel: 'trade', sender: 'Bram', text: 'selling ore' }));
    expect(getByLabelText('Open chat').style.pointerEvents).toBe('auto');
  });
});
