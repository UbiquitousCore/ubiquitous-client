import { describe, expect, it } from 'vitest';

import { CARD_MARGIN, placeAlongside, placeBeside } from '../src/ui/itemCard';

const ROOM = { w: 1400, h: 900 };
const SIZE = { w: 300, h: 400 };

describe('where a card opens', () => {
  it('opens on the side of the press with more free space', () => {
    expect(placeBeside({ x: 100, y: 450 }, SIZE, ROOM).left).toBe(100 + CARD_MARGIN);
    expect(placeBeside({ x: 1180, y: 450 }, SIZE, ROOM).left).toBe(1180 - CARD_MARGIN - 300);
  });

  it('centres itself on the press, top to bottom', () => {
    expect(placeBeside({ x: 100, y: 450 }, SIZE, ROOM).top).toBe(450 - 200);
  });

  it('stays a margin inside every edge of the view', () => {
    // The size a card is placed by and what it draws are not always the
    // same — a strip of controls under it reaches further than the body
    // it was sized from — and half a card off the edge is unreadable.
    for (const anchor of [
      { x: 2, y: 2 },
      { x: ROOM.w - 2, y: ROOM.h - 2 },
      { x: 700, y: 20 },
      { x: 700, y: 880 },
    ]) {
      const at = placeBeside(anchor, SIZE, ROOM);
      expect(at.left).toBeGreaterThanOrEqual(CARD_MARGIN);
      expect(at.left + SIZE.w).toBeLessThanOrEqual(ROOM.w - CARD_MARGIN);
      expect(at.top).toBeGreaterThanOrEqual(CARD_MARGIN);
      expect(at.top + SIZE.h).toBeLessThanOrEqual(ROOM.h - CARD_MARGIN);
    }
  });

  it('never covers the point that was pressed while there is room beside it', () => {
    for (const x of [40, 400, 700, 1000, 1360]) {
      const at = placeBeside({ x, y: 450 }, SIZE, ROOM);
      expect(x < at.left || x > at.left + SIZE.w).toBe(true);
    }
  });

  it('grows out of the point that was pressed', () => {
    expect(placeBeside({ x: 100, y: 450 }, SIZE, ROOM).from).toBe('left 200px');
    // Pressed near the top, the card is pushed down, so the press sits
    // higher up its edge.
    expect(placeBeside({ x: 1180, y: 60 }, SIZE, ROOM).from).toBe(`right ${60 - CARD_MARGIN}px`);
  });
});

describe('where the cards for what is worn stand', () => {
  const CARD = { left: 800, top: 100, w: 300 };

  it('stands on the side of the card with more free space', () => {
    // 800 free on the left, 300 on the right.
    expect(placeAlongside(CARD, 260, 1, ROOM)).toEqual([
      { left: 800 - CARD_MARGIN - 260, top: 100 },
    ]);
    expect(placeAlongside({ left: 200, top: 100, w: 300 }, 260, 1, ROOM)).toEqual([
      { left: 500 + CARD_MARGIN, top: 100 },
    ]);
  });

  it('stacks two outward from the card, never under it', () => {
    const [near, far] = placeAlongside(CARD, 260, 2, ROOM);
    expect(near).toEqual({ left: 800 - CARD_MARGIN - 260, top: 100 });
    expect(far).toEqual({ left: 800 - 2 * (CARD_MARGIN + 260), top: 100 });
    expect(near!.left + 260).toBeLessThanOrEqual(CARD.left);
  });

  it('parts two around the card when the roomier side cannot take both', () => {
    const narrow = { w: 1000, h: 900 };
    expect(placeAlongside({ left: 300, top: 100, w: 300 }, 260, 2, narrow)).toEqual([
      { left: 600 + CARD_MARGIN, top: 100 },
      { left: 300 - CARD_MARGIN - 260, top: 100 },
    ]);
  });

  it('keeps every card on screen', () => {
    for (const where of placeAlongside({ left: 0, top: 0, w: 900 }, 600, 2, { w: 900, h: 900 })) {
      expect(where.left).toBeGreaterThanOrEqual(0);
      expect(where.left + 600).toBeLessThanOrEqual(900);
    }
  });
});
