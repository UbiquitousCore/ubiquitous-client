/**
 * What a dialog's own structure settles, on made-up dialogs.
 *
 * Every name here is invented for the test and follows the patterns the
 * inference reads: a `btn…` beside a `panel…`, numbered runs, a `mask`,
 * a group of coin fields.
 */

import { describe, expect, it } from 'vitest';

import {
  captionsOf,
  closeOf,
  frameOf,
  gridIn,
  listIn,
  menuIn,
  pagerIn,
  purseIn,
  tabsOf,
  unavailableOf,
  wordSet,
} from '../../src/ui/art/dialogShape';
import type { PiecePart } from '../../src/ui/art/piecePlan';

/** A part at a place, drawing unless told otherwise. */
function part(
  path: string,
  x = 0,
  y = 0,
  more: Partial<Omit<PiecePart, 'path' | 'name'>> & { words?: string } = {},
): PiecePart {
  const { words, ...rest } = more;
  return {
    name: path.slice(path.lastIndexOf('/') + 1),
    path,
    box: { x, y, w: 10, h: 10 },
    draws: words === undefined,
    ...(words !== undefined
      ? { text: { align: 'left', sizePx: 12, color: null, face: null, words } }
      : {}),
    ...rest,
  };
}

describe('closeOf', () => {
  it('takes the shallowest close control, in any case', () => {
    const parts = [part('panelA/btnClose'), part('btnclose')];
    expect(closeOf(parts)).toBe('btnclose');
  });

  it('finds nothing where there is none', () => {
    expect(closeOf([part('btnOk')])).toBeUndefined();
  });
});

describe('frameOf', () => {
  it('prefers the rectangle named after the dialog', () => {
    expect(frameOf([part('btnempty'), part('rectdlgThing')], 'dlgThing')).toBe('rectdlgThing');
  });

  it('falls back to the hit area laid under everything', () => {
    expect(frameOf([part('btnEmpty'), part('panelA')], 'dlgThing')).toBe('btnEmpty');
  });

  it('says nothing about a dialog with neither', () => {
    expect(frameOf([part('panelA')], 'dlgThing')).toBeUndefined();
  });
});

describe('tabsOf', () => {
  it('pairs a control with the panel of the same stem, and the words beside them', () => {
    const parts = [
      part('btnFirst', 0),
      part('panelFirst'),
      part('textFirst', 0, 0, { words: '' }),
      part('btnSecond', 50),
      part('panelSecond'),
      part('txtSecond', 50, 0, { words: '' }),
      part('btnLonely'),
    ];
    const { tabs, panels } = tabsOf(parts);
    expect(panels).toEqual({ first: 'panelFirst', second: 'panelSecond' });
    expect(tabs).toEqual([
      { control: 'btnFirst', panel: 'first', caption: 'first', text: 'textFirst' },
      { control: 'btnSecond', panel: 'second', caption: 'second', text: 'txtSecond' },
    ]);
  });

  it('pairs only siblings', () => {
    const { tabs } = tabsOf([part('outer/btnWhich'), part('panelWhich')]);
    expect(tabs).toEqual([]);
  });
});

describe('captionsOf', () => {
  const words = wordSet(['Level', 'Sample heading', 'Day one']);

  it('keeps authored text that is one of the build’s own words, with or without a colon', () => {
    const parts = [
      part('a', 0, 0, { words: 'Level:' }),
      part('b', 0, 0, { words: 'sample heading' }),
    ];
    expect(captionsOf(parts, words)).toEqual({ a: 'Level:', b: 'sample heading' });
  });

  it('takes a marked reference at its word', () => {
    expect(captionsOf([part('a', 0, 0, { words: '_T[Anything at all]' })], words)).toEqual({
      a: 'Anything at all',
    });
  });

  it('drops placeholder: figures, keyboard mash, and words the build does not have', () => {
    const parts = [
      part('a', 0, 0, { words: '99' }),
      part('b', 0, 0, { words: 'asdasd' }),
      part('c', 0, 0, { words: 'Wort' }),
      part('d', 0, 0, { words: '' }),
    ];
    expect(captionsOf(parts, words)).toEqual({});
  });

  it('leaves out what the caller says holds a value', () => {
    const parts = [part('value', 0, 0, { words: 'Level' }), part('head', 0, 0, { words: 'Level' })];
    expect(captionsOf(parts, words, path => path === 'value')).toEqual({ head: 'Level' });
  });
});

describe('gridIn', () => {
  /** A dialog scrolling three pages of four slots each, and a pager. */
  const pages = [
    ...[1, 2, 3].flatMap(page =>
      [1, 2, 3, 4].flatMap(slot => [
        part(`group/scroll/sub0${page}/slot0${slot}`, page * 100 + slot * 10),
        part(`group/scroll/sub0${page}/slot0${slot}/bg`),
        part(`group/scroll/sub0${page}/slot0${slot}/bg/cnt`, 0, 0, { draws: false }),
      ]),
    ),
    part('pageleftright'),
    part('pageleftright/btnleft'),
    part('pageleftright/btnright'),
    part('pageleftright/text', 0, 0, { words: '' }),
  ];

  it('takes the first page of a run scrolled a page at a time, and what pages it', () => {
    expect(gridIn(pages, {})).toEqual({
      slot: 'slot',
      within: 'group/scroll/sub01',
      face: 'bg',
      count: 'bg/cnt',
      pageBack: 'pageleftright/btnleft',
      pageOn: 'pageleftright/btnright',
      page: 'pageleftright/text',
    });
  });

  it('keeps what the table says over what it finds', () => {
    expect(gridIn(pages, { face: 'other' })?.face).toBe('other');
  });

  it('takes one slot named outright, where the table says there is only one', () => {
    const one = [part('worn/item'), part('worn/item/face')];
    expect(gridIn(one, { slot: 'worn/item', one: true, face: 'face' })).toEqual({
      slot: 'worn/item',
      face: 'face',
    });
    expect(gridIn(one, { slot: 'worn/other', one: true })).toBeUndefined();
  });

  it('takes a run of points the screen draws at, where the table says it is one', () => {
    // Places laid out as points round a body: the movie says where each
    // goes and draws nothing there itself.
    const points = [1, 2, 3].map(at => part(`body/place0${at}`, at * 10, 0, { draws: false }));
    expect(gridIn(points, {})).toBeUndefined();
    expect(gridIn(points, { driven: true })).toEqual({ slot: 'place', within: 'body' });
  });

  it('finds a run by name where there are two', () => {
    const parts = [
      part('mine01'),
      part('mine02'),
      part('theirs01'),
      part('theirs02'),
      part('theirs03'),
    ];
    expect(gridIn(parts, {})?.slot).toBe('theirs');
    expect(gridIn(parts, { slot: 'mine' })?.slot).toBe('mine');
  });

  it('finds nothing where there is no run', () => {
    expect(gridIn([part('only')], {})).toBeUndefined();
  });
});

describe('pagerIn', () => {
  const two = [
    part('pagerLeftSide'),
    part('pagerLeftSide/btnleft'),
    part('pagerLeftSide/btnright'),
    part('pagerRightSide'),
    part('pagerRightSide/btnleft'),
    part('pagerRightSide/btnright'),
  ];

  it('will not choose between two', () => {
    expect(pagerIn(two, '', /^pager/i)).toBeUndefined();
  });

  it('takes the one it is told, wherever it sits', () => {
    expect(pagerIn(two, 'somewhereElse', /^pagerrightside$/i)).toEqual({
      back: 'pagerRightSide/btnleft',
      on: 'pagerRightSide/btnright',
    });
  });
});

describe('listIn', () => {
  const rows = [
    part('box/arrowup'),
    part('box/arrowdown'),
    part('box/list/mask', 0, 0, { mask: true, draws: false }),
    ...[1, 2, 3].flatMap(at => [
      part(`box/list/row0${at}`, 0, at * 20),
      part(`box/list/row0${at}/selected`, 0, at * 20),
      part(`box/list/row0${at}/socket`, 0, at * 20),
      part(`box/list/row0${at}/socket/bluemask`, 0, at * 20, { mask: true, draws: false }),
      part(`box/list/row0${at}/label`, 0, at * 20, { words: '' }),
      part(`box/list/row0${at}/cost/textGold`, 0, at * 20, { words: '' }),
      part(`box/list/row0${at}/cost/iconGold`, 0, at * 20),
    ]),
  ];

  it('finds the window, the marks, the highlight, the socket and the coin', () => {
    expect(listIn(rows, { row: 'row', fields: { name: 'label', price: 'cost/textGold' } })).toEqual(
      {
        view: 'box/list',
        viewport: 'box/list/mask',
        more: { above: 'box/arrowup', below: 'box/arrowdown' },
        chosen: 'selected',
        icon: 'socket',
        coins: { price: 'cost/iconGold' },
        row: 'row',
        fields: { name: 'label', price: 'cost/textGold' },
      },
    );
  });

  it('finds nothing where there are no such rows', () => {
    expect(listIn(rows, { row: 'line', fields: {} })).toBeUndefined();
  });
});

describe('purseIn', () => {
  const group = (at: string) => [
    part(`${at}/textGold`, 0, 0, { words: '' }),
    part(`${at}/textSilver`, 0, 0, { words: '' }),
    part(`${at}/textIron`, 0, 0, { words: '' }),
    part(`${at}/iconGold`),
    part(`${at}/iconSilver`),
    part(`${at}/iconIron`),
  ];

  it('finds the one group holding all three coins, and the coin beside each', () => {
    expect(purseIn(group('money'), '')).toEqual({
      purse: { gold: 'money/textGold', silver: 'money/textSilver', copper: 'money/textIron' },
      coins: { gold: 'money/iconGold', silver: 'money/iconSilver', copper: 'money/iconIron' },
    });
  });

  it('will not choose between two, unless told where to look', () => {
    const both = [...group('money'), ...group('price')];
    expect(purseIn(both, '')).toBeUndefined();
    expect(purseIn(both, 'price')?.purse.gold).toBe('price/textGold');
  });
});

describe('unavailableOf', () => {
  it('finds the face a control wears while it cannot act', () => {
    const parts = [part('btnGo'), part('btnGo/disable'), part('btnStop')];
    expect(unavailableOf(parts, { btnGo: 'go', btnStop: 'stop' })).toEqual({ go: 'btnGo/disable' });
  });
});

describe('menuIn', () => {
  /** A bar of three plaques, each with an emblem beside it and a field for its words. */
  const bar = [
    part('btn1', 0, 0, { box: { x: 0, y: 0, w: 50, h: 10 } }),
    part('btn2', 0, 12, { box: { x: 0, y: 12, w: 50, h: 10 } }),
    part('btn3', 0, 24, { box: { x: 0, y: 24, w: 50, h: 10 } }),
    part('text1', 0, 1, { words: 'TEXT' }),
    part('text2', 0, 13, { words: 'TEXT' }),
    part('text3', 0, 25, { words: 'TEXT' }),
    part('fooicon', 2, 13, { box: { x: 2, y: 13, w: 6, h: 6 } }),
    part('baricon', 2, 1, { box: { x: 2, y: 1, w: 6, h: 6 } }),
    part('bazicon', 2, 25, { box: { x: 2, y: 25, w: 6, h: 6 } }),
  ];

  it('takes each emblem’s plaque and the words beside it, top to bottom', () => {
    const found = menuIn(bar, [
      { icon: 'fooicon', screen: 'foo', says: 'Foo' },
      { icon: 'baricon', screen: 'bar', says: 'Bar' },
    ]);
    expect(found.items).toEqual([
      { control: 'btn1', text: 'text1', screen: 'bar', says: 'Bar' },
      { control: 'btn2', text: 'text2', screen: 'foo', says: 'Foo' },
    ]);
  });

  it('names the plaques whose emblem stands for nothing this client opens', () => {
    const found = menuIn(bar, [{ icon: 'bazicon' }, { icon: 'baricon', screen: 'bar' }]);
    expect(found.idle).toEqual(['btn3']);
  });

  it('passes over an emblem this movie does not carry', () => {
    expect(menuIn(bar, [{ icon: 'quxicon', screen: 'qux' }]).items).toEqual([]);
  });
});
