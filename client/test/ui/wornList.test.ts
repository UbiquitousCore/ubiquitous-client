import { describe, expect, it } from 'vitest';

import { listSlice, rowsIn, rowsInView, rowsOf } from '../../src/ui/art/wornList';
import type { PiecePart } from '../../src/ui/art/piecePlan';
import type { ListingSpec } from '../../src/ui/art/uiSpec';

/** A part at a place, which is all the list cares about. */
const part = (path: string, y: number, h = 10, w = 100, x = 0): PiecePart => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  path,
  box: { x, y, w, h },
  draws: true,
});

/**
 * A run of eight rows shown through a window four of them tall, which is
 * the shape every list in this interface is laid out in.
 */
function screen(): PiecePart[] {
  const parts: PiecePart[] = [part('view', 0, 40)];
  parts.push({ ...part('view/mask', 0, 40), mask: true, draws: false });
  for (let i = 1; i <= 8; i++) {
    parts.push(part(`view/row${String(i).padStart(2, '0')}`, (i - 1) * 10, 10));
    parts.push(part(`view/row${String(i).padStart(2, '0')}/name`, (i - 1) * 10, 10));
  }
  return parts;
}

const spec: ListingSpec = {
  view: 'view',
  viewport: 'view/mask',
  row: 'view/row',
  fields: { name: 'name' },
  more: { above: 'view/lineTop', below: 'view/lineBottom' },
};

describe('the window onto a list', () => {
  it('fits as many rows as the window has room for, not as many as exist', () => {
    // The run is laid out longer than the mask it shows through, and the
    // rows outside it are never on screen whatever the list holds.
    const slice = listSlice(screen(), { list: spec, items: [1, 2, 3, 4, 5, 6], scroll: 0 });
    expect(slice.roomFor).toBe(4);
    expect(slice.shown).toEqual([1, 2, 3, 4]);
    expect(slice.furthest).toBe(2);
  });

  it('keeps only the rows there is something to write into', () => {
    // A row kept with nothing in it still draws its own rule, and an
    // empty table ruled into rows reads as a table that failed to fill.
    const slice = listSlice(screen(), { list: spec, items: ['a', 'b'], scroll: 0 });
    expect(slice.keptRows).toEqual(['view/row01', 'view/row02']);
    expect(slice.hidden).toContain('view/row03');
    expect(slice.hidden).toContain('view/row08');
  });

  it('scrolls far enough that the last thing sits wholly inside the window', () => {
    // A window that ends partway down a row: the row is counted in, since
    // its middle shows, but a thing written into it is cut off. Scrolled
    // right down, the last thing lands in the last row that fits whole.
    const parts = screen().map(one =>
      one.path === 'view/mask' ? { ...one, box: { ...one.box, h: 36 } } : one,
    );
    const items = [1, 2, 3, 4, 5, 6];
    const slice = listSlice(parts, { list: spec, items, scroll: 99 });
    expect(slice.roomFor).toBe(4);
    const last = slice.keptRows.at(slice.shown.indexOf(6));
    const row = parts.find(one => one.path === last)!;
    expect(row.box.y + row.box.h).toBeLessThanOrEqual(36);
    expect(slice.shown.at(-1)).toBe(6);
  });

  it('holds the scroll inside the list however far it is pushed', () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(listSlice(screen(), { list: spec, items, scroll: 99 }).from).toBe(2);
    expect(listSlice(screen(), { list: spec, items, scroll: -5 }).from).toBe(0);
  });

  it('hands back both marks, whichever way the list runs', () => {
    // A mark that says there is more slides the way it points, and one
    // drawn into the screen's own picture cannot move. The screen keeps
    // their places and draws each on its own, so the list only says
    // which they are and how far it has been moved.
    const items = [1, 2, 3, 4, 5, 6];
    for (const scroll of [0, 2]) {
      const slice = listSlice(screen(), { list: spec, items, scroll });
      expect(slice.marks).toContain('view/lineTop');
      expect(slice.marks).toContain('view/lineBottom');
      expect(slice.hidden).not.toContain('view/lineTop');
    }
    const short = listSlice(screen(), { list: spec, items: [1, 2], scroll: 0 });
    expect(short.from).toBe(0);
    expect(short.furthest).toBe(0);
  });

  it('leaves out the coin beside a figure the row does not name', () => {
    // The figure and the coin go together: a price of forty silver names
    // no gold, and a bare gold piece reads as a price of nothing.
    const coins: ListingSpec = {
      ...spec,
      fields: { gold: 'gold', silver: 'silver' },
      coins: { gold: 'iconGold', silver: 'iconSilver' },
    };
    const slice = listSlice(screen(), {
      list: coins,
      items: [{ gold: '', silver: '40' }],
      scroll: 0,
      values: item => item,
    });
    expect(slice.hidden).toContain('view/row01/iconGold');
    expect(slice.hidden).not.toContain('view/row01/iconSilver');
  });

  it('measures the window of a list that sits at the top of the screen', () => {
    // A name reaches a part as the whole of its path or as the tail of
    // one. Matched on the tail alone, a mask with no slash in its path is
    // never found, and the list comes out as long as its whole run.
    const parts: PiecePart[] = [{ ...part('mask', 0, 20), mask: true, draws: false }];
    for (let i = 1; i <= 6; i++) parts.push(part(`btn0${i}`, (i - 1) * 10, 10));
    const slice = listSlice(parts, {
      list: { view: 'group', viewport: 'mask', row: 'btn', fields: {} },
      items: [1, 2, 3, 4, 5, 6],
      scroll: 0,
    });
    expect(slice.roomFor).toBe(2);
  });

  it('narrows to one panel where a screen keeps more than one list', () => {
    const parts = [
      ...screen().map(p => ({ ...p, path: `left/${p.path}` })),
      ...screen().map(p => ({ ...p, path: `right/${p.path}` })),
    ];
    const slice = listSlice(parts, {
      within: 'left',
      list: { ...spec, viewport: 'view/mask', row: 'view/row' },
      items: [1, 2, 3, 4, 5, 6],
      scroll: 0,
    });
    expect(slice.keptRows.every(path => path.startsWith('left/'))).toBe(true);
    // And the other panel's rows are still left out of the picture.
    expect(slice.hidden).toContain('right/view/row01');
  });
});

describe('rows and what goes in them', () => {
  it('pairs the drawn rows with the things they hold, in order', () => {
    const parts = screen();
    const slice = listSlice(parts, { list: spec, items: ['a', 'b'], scroll: 0 });
    const rows = rowsIn(parts, slice);
    expect(rows.map(row => row.item)).toEqual(['a', 'b']);
    expect(rows[0].fields.map(field => field.path)).toEqual(['view/row01/name']);
  });

  it('reads a run in the order it is laid out, not the order it is named', () => {
    const jumbled = [part('r02', 30), part('r01', 10), part('r03', 20)];
    expect(rowsOf(jumbled, 'r').map(row => row.name)).toEqual(['r01', 'r03', 'r02']);
  });

  it('counts a row in when its middle falls inside the window', () => {
    const rows = [part('a', 0, 10), part('a2', 35, 10)];
    expect(rowsInView(rows, part('mask', 0, 40))).toHaveLength(2);
    expect(rowsInView(rows, part('mask', 0, 20))).toHaveLength(1);
    // With no window named, every row of the run is on screen.
    expect(rowsInView(rows, undefined)).toHaveLength(2);
  });
});

describe('the marks that say a list runs on', () => {
  /** A screen whose list says so with marks it draws and arrows it presses. */
  const both = {
    view: 'view',
    viewport: 'view/mask',
    row: 'view/row',
    fields: {},
    more: { above: 'view/lineTop', below: 'view/lineBottom' },
    scroll: { up: 'arrowup', down: 'arrowdown' },
  };

  it('names every one of them, marks and arrows alike', () => {
    // The arrows must not show on a list with nowhere to go. They are
    // drawn art, so taking the button off one would leave the mark — so
    // none of them is drawn into the picture at all, and each can slide
    // the way it points.
    for (const items of [
      [1, 2],
      [1, 2, 3, 4, 5, 6],
    ]) {
      const slice = listSlice(screen(), { list: both, items, scroll: 0 });
      for (const mark of ['view/lineTop', 'view/lineBottom', 'arrowup', 'arrowdown']) {
        expect(slice.marks, `${mark} not named`).toContain(mark);
      }
    }
  });

  it('says which way the list still runs on, for the marks that move', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const top = listSlice(screen(), { list: both, items, scroll: 0 });
    expect(top.from).toBe(0);
    expect(top.from < top.furthest).toBe(true);
    const foot = listSlice(screen(), { list: both, items, scroll: 99 });
    expect(foot.from).toBe(foot.furthest);
    expect(foot.from > 0).toBe(true);
  });
});
