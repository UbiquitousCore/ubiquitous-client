/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArtAuctionWindow } from '../../src/ui/components/ArtAuctionWindow';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  wantedDialogs.value = [];
  uiSpec.value = null;
});

const interaction = {
  listings: [],
  status: null,
  onBrowse: vi.fn(),
  onList: vi.fn(),
  onBid: vi.fn(),
  onBuyout: vi.fn(),
  onCancel: vi.fn(),
};

describe('ArtAuctionWindow', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    // The screen is the build's, and there is no second auction house of
    // our own to stand in for it: without a mounted build nothing else on
    // screen has its art either.
    const { queryByRole } = render(<ArtAuctionWindow {...interaction} onClose={() => undefined} />);
    expect(queryByRole('dialog', { name: /auction/i })).toBeNull();
  });

  it('asks for whichever screen the spec says it wears', () => {
    // The screen is named in the spec, never here: which dialog this
    // window wears is not something this repository knows.
    uiSpec.value = { screens: { auction: { dialog: 'someScreen' } } };
    render(<ArtAuctionWindow {...interaction} onClose={() => undefined} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('someScreen');
  });

  it('asks once, however many times it is drawn', () => {
    uiSpec.value = { screens: { auction: { dialog: 'someScreen' } } };
    const { rerender } = render(<ArtAuctionWindow {...interaction} onClose={() => undefined} />);
    rerender(<ArtAuctionWindow {...interaction} onClose={() => undefined} />);
    expect(wantedDialogs.value.filter(one => one.dialog === 'someScreen')).toHaveLength(1);
  });

  it('draws nothing when there is no spec to read', () => {
    const { queryByRole } = render(<ArtAuctionWindow {...interaction} onClose={() => undefined} />);
    expect(queryByRole('dialog', { name: /auction/i })).toBeNull();
  });
});

describe('with a screen to wear', () => {
  /** The smallest movie that still puts the window through every step. */
  const skin = (): UiSkinData => ({
    movie: 'TEST',
    width: 200,
    height: 100,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 100, h: 60 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L100 0L100 60L0 60Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            {
              depth: 1,
              characterId: 11,
              matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
              opacity: 1,
              name: 'back',
            },
          ],
        ],
      },
    ],
    edits: [],
    root: [
      [
        {
          depth: 1,
          characterId: 20,
          matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
          opacity: 1,
          name: 'someScreen',
        },
      ],
    ],
  });

  it('runs every step before deciding whether it can draw', () => {
    // Every step of the window runs before it decides it cannot draw, so
    // this catches an ordering fault that would otherwise only show as a
    // window that never opens.
    uiSpec.value = {
      screens: {
        auction: {
          dialog: 'someScreen',
          frame: 'back',
          panels: { browse: 'back' },
          tabs: [{ control: 'back', panel: 'browse', caption: 'browse' }],
          lists: { browse: { view: 'back', row: 'back/row', fields: { name: 'name' } } },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    expect(() =>
      render(<ArtAuctionWindow {...interaction} onClose={() => undefined} />),
    ).not.toThrow();
  });
});
