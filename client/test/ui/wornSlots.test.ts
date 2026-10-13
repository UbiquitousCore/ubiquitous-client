import { describe, expect, it } from 'vitest';

import { pageLabel, pagesFor, slotsOf } from '../../src/ui/art/wornSlots';
import type { PiecePart } from '../../src/ui/art/piecePlan';

const part = (path: string, x: number, y: number, draws = true): PiecePart => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  box: { x, y, w: 50, h: 50 },
  draws,
});

describe('a run of slots', () => {
  it('reads across and then down, whatever order the names are numbered in', () => {
    // The names are numbered in the order they were authored and the
    // screen is free to lay them out any way it likes, so where they sit
    // is what decides which is first.
    const parts = [
      part('item03', 200, 0),
      part('item04', 0, 60),
      part('item01', 0, 0),
      part('item02', 100, 0),
    ];
    expect(slotsOf(parts, { slot: 'item' }).map(slot => slot.name)).toEqual([
      'item01',
      'item02',
      'item03',
      'item04',
    ]);
  });

  it('tells two runs of the same shape apart by name', () => {
    const parts = [part('hereSlot01', 0, 0), part('thereSlot01', 200, 0)];
    expect(slotsOf(parts, { slot: 'hereSlot' })).toHaveLength(1);
    expect(slotsOf(parts, { slot: 'thereSlot' })).toHaveLength(1);
  });

  it('leaves out slots of the same name that belong to something else', () => {
    // A dropdown holds slots named like the ones in a bag, and they are
    // not the player's bag.
    const parts = [
      part('panel/item01', 0, 0),
      part('panel/aListOfChoices/item01', 0, 300),
      part('elsewhere/item01', 500, 0),
    ];
    const run = slotsOf(parts, { slot: 'item', within: 'panel', except: ['aListOfChoices'] });
    expect(run.map(slot => slot.path)).toEqual(['panel/item01']);
  });

  it('ignores a slot that draws nothing', () => {
    const parts = [part('item01', 0, 0), part('item02', 100, 0, false)];
    expect(slotsOf(parts, { slot: 'item' })).toHaveLength(1);
  });
});

describe('how many pages a store fills', () => {
  it('fills one page per run, and one more for the remainder', () => {
    expect(pagesFor(12, 12)).toBe(1);
    expect(pagesFor(13, 12)).toBe(2);
    expect(pagesFor(24, 12)).toBe(2);
    expect(pagesFor(30, 12)).toBe(3);
  });

  it('is one page for a store with nothing in it', () => {
    // An empty run of slots is what an empty store looks like; no pages
    // at all reads as a store that failed to open.
    expect(pagesFor(0, 12)).toBe(1);
    expect(pagesFor(12, 0)).toBe(1);
  });

  it('writes which page of how many the way the screen writes it', () => {
    expect(pageLabel(0, 3)).toBe('1 / 3');
    expect(pageLabel(2, 3)).toBe('3 / 3');
  });
});

describe('a run laid out round a body', () => {
  /** Places numbered in one order and laid out in another, as the body is. */
  const body: PiecePart[] = [
    part('equip/btn01', 310, 54),
    part('equip/btn02', 266, 54),
    part('equip/btn03', 354, 54),
    part('equip/btn04', 225, 166),
    part('equip/btn05', 225, 124),
  ];

  it('reads a numbered run by its numbers, not by where it sits', () => {
    // The places go up one side of the body and down the other, so where
    // one sits says nothing about which place it is. Ordered by where
    // they sit, what is worn on the head turns up on the shoulder.
    expect(
      slotsOf(body, { slot: 'btn', within: 'equip', numbered: true }).map(one => one.name),
    ).toEqual(['btn01', 'btn02', 'btn03', 'btn04', 'btn05']);
  });

  it('still reads a run laid out in reading order by where it sits', () => {
    expect(slotsOf(body, { slot: 'btn', within: 'equip' }).map(one => one.name)).toEqual([
      'btn02',
      'btn01',
      'btn03',
      'btn05',
      'btn04',
    ]);
  });
});
