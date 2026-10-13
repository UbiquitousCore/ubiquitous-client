/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArtItemCard } from '../../src/ui/components/ArtItemCard';
import { CARD_MARGIN } from '../../src/ui/itemCard';

// There is no canvas here to draw on, and what is drawn is not what this
// is about: where the card puts things is.
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  // Four pixels a unit, as the production canvas draws: the pictures are drawn
  // finer than they are shown, and the card lays itself out in what it
  // is shown at.
  drawPiece: () => ({ url: 'blob:card', width: 400, height: 400 }),
}));

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

const listing = {
  id: 'one',
  sellerName: 'Someone',
  itemEntry: 1,
  itemCount: 1,
  name: 'A thing',
  startPrice: 100,
  listedAt: 0,
  expiresAt: 0,
  currentBid: 100,
};

/** A card whose backdrop and whose button do not overlap. */
const skin = (): UiSkinData => {
  // Shapes are sized in twips, twenty to the unit a placement uses.
  const box = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w: w * 20, h: h * 20 },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${w * 20} 0L${w * 20} ${h * 20}L0 ${h * 20}Z` }],
  });
  const at = (id: number, x: number, y: number, name: string, opacity = 1) => ({
    depth: id,
    characterId: id,
    matrix: { a: 1, b: 0, c: 0, d: 1, tx: x * 20, ty: y * 20 },
    opacity,
    name,
  });
  return {
    movie: 'TEST',
    width: 200,
    height: 300,
    background: null,
    exports: [],
    shapes: [box(11, 100, 100), box(12, 40, 20)],
    sprites: [
      // The strip is parked at nothing until the screen turns it on, and
      // it sits inside a panel that is parked with it.
      { id: 21, frameCount: 1, frames: [[at(12, 0, 0, 'btn')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [[at(11, 0, 0, 'panel'), { ...at(21, 10, 120, 'strip', 0), characterId: 21 }]],
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
          name: 'theCard',
        },
      ],
    ],
  };
};

describe('ArtItemCard', () => {
  it('draws nothing until the spec says which card to wear', () => {
    const { container } = render(
      <ArtItemCard listing={listing} actions={[]} onClose={() => undefined} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('asks for whichever card the spec names', () => {
    uiSpec.value = { screens: { goods: { dialog: 'theCard' } } };
    render(<ArtItemCard listing={listing} actions={[]} onClose={() => undefined} />);
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('theCard');
  });

  it('stacks a parked strip under the body, art and all', () => {
    // The backdrop stops where the button starts, so a frame measured on
    // the backdrop alone would clip the button off the bottom of the
    // picture and place it past the edge of what was drawn. The strip is
    // parked until asked for, and asking for the button alone leaves the
    // walk stopped at the panel above it.
    uiSpec.value = {
      screens: {
        goods: {
          dialog: 'theCard',
          frame: ['panel'],
          card: {
            title: 'panel',
            body: 'panel',
            actions: {
              go: { strip: 'strip', control: 'strip/btn', label: 'strip/btn', says: 'Do it' },
            },
          },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const { container, getByRole } = render(
      <ArtItemCard listing={listing} actions={[{ key: 'go', onPick }]} onClose={() => undefined} />,
    );
    const card = getByRole('dialog');
    // The strip is drawn on its own, so its button sits at the top of its
    // own picture rather than 120 units down someone else's.
    const button = card.querySelector('button') as HTMLElement;
    expect(parseFloat(button.style.top)).toBeCloseTo(0, 1);
    fireEvent.click(button);
    expect(onPick).toHaveBeenCalled();
    // Two pictures: the body, and the strip under it.
    expect(container.querySelectorAll('img')).toHaveLength(2);
  });

  it('writes a price on its control in only the coins it has', () => {
    const priced = skin();
    // The strip gains a figure field for each coin, as a shop's does.
    priced.sprites[0]!.frames[0]!.push(
      ...(['figGold', 'figSilver', 'figCopper'] as const).map((name, at) => ({
        depth: 2 + at,
        characterId: 40,
        matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        opacity: 1,
        name,
      })),
    );
    (priced as unknown as { edits: unknown[] }).edits.push({
      id: 40,
      bounds: { x: 0, y: 0, w: 400, h: 200 },
      words: '',
      sizePx: 12,
      align: 'right',
    });
    uiSpec.value = {
      screens: {
        goods: {
          dialog: 'theCard',
          frame: ['panel'],
          card: {
            title: 'panel',
            body: 'panel',
            actions: {
              purchase: {
                strip: 'strip',
                control: 'strip/btn',
                says: 'Buy',
                price: {
                  amounts: {
                    gold: 'strip/figGold',
                    silver: 'strip/figSilver',
                    copper: 'strip/figCopper',
                  },
                  coins: {},
                },
              },
            },
          },
        },
      },
    };
    setMovie({ skin: priced, art: new Map() });
    const { getByRole } = render(
      <ArtItemCard
        listing={listing}
        actions={[{ key: 'purchase', price: 102, onPick: () => undefined }]}
        onClose={() => undefined}
      />,
    );
    const written = Array.from(getByRole('dialog').querySelectorAll('span'))
      .map(span => span.textContent)
      .filter(text => /^\d+$/.test(text ?? ''));
    // A hundred and two copper is a silver and two copper, and no gold.
    expect(written).toEqual(['1', '2']);
  });

  it('leaves the button out when the listing offers nothing to do', () => {
    uiSpec.value = {
      screens: {
        goods: {
          dialog: 'theCard',
          frame: ['panel'],
          card: {
            title: 'panel',
            body: 'panel',
            actions: { go: { control: 'act', label: 'act', says: 'Do it' } },
          },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole } = render(
      <ArtItemCard listing={listing} actions={[]} onClose={() => undefined} />,
    );
    // The one outside is the press-away-to-close catcher, not a control.
    expect(getByRole('dialog').querySelectorAll('button')).toHaveLength(0);
  });

  it('lays every piece against one origin, so they line up', () => {
    // The body, the strips and anything that hangs off a corner are drawn
    // separately. Laid out each on its own they would drift apart.
    uiSpec.value = {
      screens: {
        goods: {
          dialog: 'theCard',
          frame: ['panel'],
          card: {
            title: 'panel',
            body: 'panel',
            actions: {
              go: { strip: 'strip', control: 'strip/btn', label: 'strip/btn', says: 'Do it' },
            },
          },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(
      <ArtItemCard
        listing={listing}
        actions={[{ key: 'go', onPick: () => undefined }]}
        onClose={() => undefined}
      />,
    );
    const placed = [...container.querySelectorAll('img')].map(
      img => (img.parentElement as HTMLElement).style.left,
    );
    // The strip starts ten units right of the body, and says so.
    expect(placed).toEqual(['0px', '20px']);
  });

  /** A card with room to stand in, and a spec that draws one. */
  const opened = (at: { x: number; y: number }) => {
    uiSpec.value = {
      screens: {
        goods: {
          dialog: 'theCard',
          frame: ['panel'],
          card: { title: 'panel', body: 'panel', actions: {} },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    return render(
      <ArtItemCard listing={listing} actions={[]} anchor={at} onClose={() => undefined} />,
    ).getByRole('dialog') as HTMLElement;
  };

  it('stands beside what was pressed, not over the middle of the screen', () => {
    // The card is a thing said about a row. Put in the centre it covers
    // the row it is about, which is how the screen reads back wrong.
    Object.assign(window, { innerWidth: 1000, innerHeight: 800 });
    const card = opened({ x: 100, y: 400 });
    const tall = parseFloat(card.style.height);
    expect(card.style.left).toBe(`${100 + CARD_MARGIN}px`);
    expect(parseFloat(card.style.top)).toBeCloseTo(400 - tall / 2, 1);
    expect(card.style.transform).toBe('');
    // It grows out of the point that was pressed.
    expect(card.style.transformOrigin).toBe(`left ${tall / 2}px`);
  });

  it('takes in the band over the top of its backdrop, and keeps the whole of it inside the view', () => {
    // A band fourteen units deep laid ten above the backdrop's top edge and
    // over it: framed on the backdrop alone, its top was cut off.
    const banded = skin();
    banded.shapes.push({
      id: 13,
      bounds: { x: 0, y: 0, w: 2000, h: 280 },
      fills: [{ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L2000 0L2000 280L0 280Z' }],
    });
    banded.sprites[1]!.frames[0]!.push({
      depth: 13,
      characterId: 13,
      matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: -200 },
      opacity: 1,
      name: null,
    });
    uiSpec.value = {
      screens: {
        goods: {
          dialog: 'theCard',
          frame: ['panel'],
          card: { title: 'panel', body: 'panel', actions: {} },
        },
      },
    };
    setMovie({ skin: banded, art: new Map() });
    Object.assign(window, { innerWidth: 1000, innerHeight: 800 });
    const card = render(
      <ArtItemCard
        listing={listing}
        actions={[]}
        anchor={{ x: 100, y: 0 }}
        onClose={() => undefined}
      />,
    ).getByRole('dialog') as HTMLElement;
    expect(parseFloat(card.style.height) / parseFloat(card.style.width)).toBeCloseTo(110 / 100, 3);
    expect(parseFloat(card.style.top)).toBeGreaterThanOrEqual(CARD_MARGIN);
  });

  it('stands beside what was pressed when the room it stands in is not the whole view', () => {
    // A screen drawn inside a moved or transformed box: the card's own
    // room starts 500 down the view, so a press 900 down is 400 into it.
    Object.assign(window, { innerWidth: 1000, innerHeight: 2000 });
    const measured = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({ left: 0, top: 500, width: 1000, height: 800 } as DOMRect);
    try {
      const card = opened({ x: 100, y: 900 });
      const tall = parseFloat(card.style.height);
      expect(card.style.left).toBe(`${100 + CARD_MARGIN}px`);
      expect(parseFloat(card.style.top)).toBeCloseTo(400 - tall / 2, 1);
    } finally {
      measured.mockRestore();
    }
  });

  it('opens towards the side with more room', () => {
    Object.assign(window, { innerWidth: 1000, innerHeight: 800 });
    const card = opened({ x: 980, y: 400 });
    const wide = parseFloat(card.style.width);
    expect(parseFloat(card.style.left)).toBeCloseTo(980 - CARD_MARGIN - wide, 1);
    expect(card.style.transformOrigin.startsWith('right ')).toBe(true);
  });
});
