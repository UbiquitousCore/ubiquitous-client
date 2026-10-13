/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

// There is no canvas here, and what is drawn is not what this is about:
// where the screen puts things, and what it asks the game to do.
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:letter', width: 200, height: 200 }),
}));

import { ArtMailWriteWindow } from '../../src/ui/components/ArtMailWriteWindow';
import { setMovie, setUiWords, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { inventory } from '../../src/ui/inventoryStore';
import type { MailDraft } from '../../src/ui/mailStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
  setUiWords([]);
  inventory.value = { bagSlotCount: 0, bankSlotCount: 0, items: [] };
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

/**
 * The smallest letter: a backdrop, a line to address it on, a control for
 * each of the three things it offers, and the face one of them wears
 * while it cannot be pressed.
 */
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
        bounds: { x: 0, y: 0, w: 40, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 20L0 20Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 200, h: 200 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 200L0 200Z' }],
      },
    ],
    sprites: [
      { id: 30, frameCount: 1, frames: [[place(11, at(0, 0), 'disable')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, at(0, 0), 'back'),
            place(11, at(0, 0), 'to'),
            place(11, at(0, 30), 'money'),
            place(11, at(0, 60), 'attach'),
            place(30, at(0, 90), 'send'),
            place(11, at(0, 120), 'shut'),
          ],
        ],
      },
    ],
    edits: [{ id: 11, bounds: { x: 0, y: 0, w: 40, h: 20 }, words: '', sizePx: 10, align: 'left' }],
    root: [[place(20, at(0, 0), 'theLetter')]],
  } as unknown as UiSkinData;
}

const spec = {
  screens: {
    mailWrite: {
      dialog: 'theLetter',
      frame: 'back',
      close: 'shut',
      edits: { to: { holds: 'to', max: 4 } },
      actions: { money: 'money', attach: 'attach', send: 'send' },
      unavailable: { send: 'send/disable' },
    },
  },
};

const draft: MailDraft = { to: 'Someone', subject: '', body: '', money: 0, itemIds: [] };

const nothing = {
  bag: [],
  onEdit: vi.fn(),
  onCarry: vi.fn(),
  onEmpty: vi.fn(),
  onSend: vi.fn(),
  onClose: vi.fn(),
};

describe('ArtMailWriteWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { queryByRole } = render(<ArtMailWriteWindow {...nothing} draft={draft} />);
    expect(queryByRole('dialog')).toBeNull();
  });

  it('writes what is being typed where the screen writes it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByText } = render(<ArtMailWriteWindow {...nothing} draft={draft} />);
    expect(getByText('Someone')).toBeTruthy();
  });

  it('keeps a line no longer than the screen accepts', () => {
    // How long each line may be is the screen's, and typing past it in a
    // window that does not cap it is a send the server refuses.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onEdit = vi.fn();
    const { getByLabelText } = render(
      <ArtMailWriteWindow {...nothing} onEdit={onEdit} draft={draft} />,
    );
    fireEvent.click(getByLabelText('to'));
    fireEvent.input(getByLabelText('to'), { target: { value: 'abcdefgh' } });
    expect(onEdit).toHaveBeenCalledWith({ to: 'abcd' });
  });

  it('turns to the face for a letter that cannot be sent, and back again', () => {
    // A letter addressed to nobody: the screen has its own face for a
    // control with nothing behind it, and it says so better than dimming.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const blank = render(<ArtMailWriteWindow {...nothing} draft={{ ...draft, to: '  ' }} />);
    expect((blank.getByLabelText('send') as HTMLButtonElement).disabled).toBe(true);
    blank.unmount();
    const addressed = render(<ArtMailWriteWindow {...nothing} draft={draft} />);
    expect((addressed.getByLabelText('send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sends what was written when the control for it is pressed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onSend = vi.fn();
    const { getByLabelText } = render(
      <ArtMailWriteWindow {...nothing} onSend={onSend} draft={draft} />,
    );
    fireEvent.click(getByLabelText('send'));
    expect(onSend).toHaveBeenCalled();
  });

  it('opens what a control opens, and shuts it when it is pressed again', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByLabelText } = render(<ArtMailWriteWindow {...nothing} draft={draft} />);
    const control = getByLabelText('attach');
    expect(control.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(control);
    expect(getByLabelText('attach').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(getByLabelText('attach'));
    expect(getByLabelText('attach').getAttribute('aria-expanded')).toBe('false');
  });

  it('writes the count of things attached in the theme gold, whatever colour the sentence asks for', () => {
    // A synthetic sentence: a coloured count, then plain words.
    uiSpec.value = {
      screens: {
        mailWrite: {
          ...spec.screens.mailWrite,
          groups: { attached: 'to' },
          formats: { attached: "\x12font color='%x'\x13%d\x12/font\x13 riding along" },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { getByText } = render(
      <ArtMailWriteWindow {...nothing} draft={{ ...draft, itemIds: ['a', 'b'] }} />,
    );
    expect((getByText('2') as HTMLElement).style.color).toBe('var(--color-brass-300)');
    expect((getByText(/riding along/) as HTMLElement).style.color).toBe('');
  });

  it('puts the letter away when the screen is closed', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onClose = vi.fn();
    const { getByLabelText } = render(
      <ArtMailWriteWindow {...nothing} onClose={onClose} draft={draft} />,
    );
    fireEvent.click(getByLabelText(/close the letter/i));
    expect(onClose).toHaveBeenCalled();
  });
});
