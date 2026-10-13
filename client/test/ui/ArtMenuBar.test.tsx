/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:menu', width: 100, height: 300 }),
}));

import { ArtMenuBar, plaquesTopAtRest } from '../../src/ui/components/ArtMenuBar';
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

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({ depth: 1, characterId, matrix, name, opacity: 1 });

/** A bar of three, each a plaque with a field of words beside it. */
function skin(): UiSkinData {
  const rows: UiSkinPlaced[] = [];
  for (let i = 1; i <= 3; i++) rows.push(place(11, at(10, i * 30), `pick${i}`));
  return {
    movie: 'TEST',
    width: 200,
    height: 200,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 80, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L80 0L80 20L0 20Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 100, h: 150 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L100 0L100 150L0 150Z' }],
      },
    ],
    sprites: [{ id: 20, frameCount: 1, frames: [[place(12, at(0, 0), 'back'), ...rows]] }],
    edits: [],
    root: [[place(20, at(0, 0), 'theBar')]],
  };
}

const spec = {
  screens: {
    menu: {
      dialog: 'theBar',
      frame: 'back',
      items: [
        { control: 'pick1', text: 'w1', screen: 'bag', says: 'Bag' },
        { control: 'pick2', text: 'w2', screen: 'character', says: 'Character' },
        { control: 'pick3', text: 'w3', screen: 'quests', says: 'Quests' },
      ],
    },
  },
};

const nothing = { activeId: null, onPick: vi.fn(), onDismiss: vi.fn() };

describe('ArtMenuBar', () => {
  it('draws nothing until the shipped bar has arrived', () => {
    const { queryByRole } = render(<ArtMenuBar {...nothing} />);
    expect(queryByRole('menu')).toBeNull();
  });

  it('asks for whichever piece of the movie the spec says it wears', () => {
    uiSpec.value = { screens: { menu: { dialog: 'someBar', items: [] } } };
    render(<ArtMenuBar {...nothing} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('someBar');
  });

  it('draws nothing where the spec names no screens to open', () => {
    // The emblems alone are not a menu: without the list of what each
    // control opens there is nothing to press.
    uiSpec.value = { screens: { menu: { dialog: 'theBar', icons: { bag: 'anEmblem' } } } };
    setMovie({ skin: skin(), art: new Map() });
    const { queryByRole } = render(<ArtMenuBar {...nothing} />);
    expect(queryByRole('menu')).toBeNull();
  });

  it('offers what the spec lists, in the order it lists them', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getAllByRole } = render(<ArtMenuBar {...nothing} />);
    expect(getAllByRole('menuitem').map(item => item.getAttribute('aria-label'))).toEqual([
      'Bag',
      'Character',
      'Quests',
    ]);
  });

  it('marks the one whose screen is already showing', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByLabelText } = render(<ArtMenuBar {...nothing} activeId="character" />);
    expect(getByLabelText('Character').getAttribute('aria-current')).toBe('true');
    expect(getByLabelText('Bag').getAttribute('aria-current')).toBeNull();
  });

  it('opens the screen the control the spec names stands for', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const { getByLabelText } = render(<ArtMenuBar {...nothing} onPick={onPick} />);
    fireEvent.click(getByLabelText('Quests'));
    expect(onPick).toHaveBeenCalledWith('quests');
  });

  it('will not open a screen this client does not have', () => {
    // The spec is beside the game file and may name more than this client
    // has built. A control for one of those does nothing rather than
    // opening a window that is not there.
    uiSpec.value = {
      screens: {
        menu: {
          dialog: 'theBar',
          frame: 'back',
          items: [{ control: 'pick1', text: 'w1', screen: 'somethingElse', says: 'Elsewhere' }],
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const { getByLabelText } = render(<ArtMenuBar {...nothing} onPick={onPick} />);
    fireEvent.click(getByLabelText('Elsewhere'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    // The bar stands on the same stage as whichever screen it opened, so
    // it darkens nothing of its own and there is nothing behind it to
    // press: putting the screens away is what closes it.
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onDismiss = vi.fn();
    render(<ArtMenuBar {...nothing} onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('takes the keyboard when it opens', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByLabelText } = render(<ArtMenuBar {...nothing} />);
    expect(document.activeElement).toBe(getByLabelText('Bag'));
  });
});

describe('plaquesTopAtRest', () => {
  const box = (y: number, h: number) => ({ x: 0, y, w: 100, h });

  it('is the top of the first plaque', () => {
    expect(
      plaquesTopAtRest([
        { plaque: box(40, 30), words: box(50, 12) },
        { plaque: box(80, 30), words: box(90, 12) },
      ]),
    ).toBe(40);
  });

  it('puts the open plaque back where it rests, however far its lit face reaches up', () => {
    // The lit face stands proud of the plaque it replaces; where the first
    // plaque starts must not move with it, or the material read from above
    // the plaques changes with whichever screen is open.
    expect(
      plaquesTopAtRest([
        { plaque: box(30, 40), words: box(50, 12), open: true },
        { plaque: box(80, 30), words: box(90, 12) },
      ]),
    ).toBe(40);
  });

  it('keeps the open plaque as drawn where nothing is at rest to measure it by', () => {
    expect(plaquesTopAtRest([{ plaque: box(30, 40), words: box(50, 12), open: true }])).toBe(30);
  });

  it('is nowhere with no plaques', () => {
    expect(plaquesTopAtRest([])).toBe(Number.POSITIVE_INFINITY);
  });
});
