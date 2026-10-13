/**
 * A screen's spec, built from a made-up movie and a made-up table.
 *
 * The movie is the smallest that exercises each source: two tabs the
 * movie pairs itself and one the table adds, a caption the build's words
 * vouch for, one it does not, and a field that holds a value.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { MOVIE_TEXT, buildScreenSpec, buildUiSpec } from '../../src/ui/art/screenSpecs';
import type { ScreenMeaning } from '../../src/ui/art/screenSpecs';
import { screenFallback, screenSpec, uiSpec } from '../../src/ui/art/uiSpec';
import { movies, setMovie } from '../../src/ui/art/pieceStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';

afterEach(() => {
  uiSpec.value = null;
  movies.value = new Map();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** A plate, a text field authored with `words`, and a dialog built from them. */
function skin(): UiSkinData {
  const edit = (id: number, words: string) => ({
    id,
    bounds: { x: 0, y: 0, w: 40, h: 12 },
    varName: '',
    sampleHtml: `<p align="center">${words}</p>`,
    sizePx: 10,
    color: null,
    face: null,
  });
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      {
        id: 1,
        bounds: { x: 0, y: 0, w: 40, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 20L0 20Z' }],
      },
    ],
    edits: [
      edit(100, 'Heading'),
      edit(200, 'Words of its own'),
      edit(300, 'asdasd'),
      edit(400, 'Heading'),
    ],
    sprites: [
      {
        id: 10,
        frameCount: 1,
        frames: [
          [
            place(1, 0, 0, 'rectdlgSample'),
            place(1, 200, 0, 'btnclose'),
            place(1, 100, 0, 'btnSecond'),
            place(1, 0, 0, 'btnFirst'),
            place(100, 0, 0, 'textFirst'),
            place(20, 0, 30, 'panelFirst'),
            place(20, 0, 30, 'panelSecond'),
            place(1, 150, 0, 'btnThird'),
          ],
        ],
      },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [place(200, 0, 0, 'note'), place(300, 0, 20, 'placeholder'), place(400, 0, 40, 'amount')],
        ],
      },
    ],
    root: [[place(10, 0, 0, 'dlgSample')]],
  } as unknown as UiSkinData;
}

const WORDS = ['Heading', 'Other'];

const MEANING: ScreenMeaning = {
  dialog: 'dlgSample',
  tabs: [{ control: 'btnThird', panel: 'first', caption: 'again' }],
  values: { amount: 'amount' },
  captions: { 'panelFirst/note': MOVIE_TEXT, 'panelSecond/placeholder': 'Ours' },
};

describe('buildScreenSpec', () => {
  it('writes the open tab’s words in the palette’s own ink, where the table names none', () => {
    const built = buildScreenSpec(skin(), WORDS, {
      ...MEANING,
      tabs: [
        { control: 'btnThird', panel: 'first', caption: 'again' },
        { control: 'btnSecond', openTone: 'var(--color-alert)' },
      ],
    });
    if (!('spec' in built)) throw new Error(JSON.stringify(built));
    // The movie letters every tab in one colour and says nothing of the
    // open one; the palette does.
    expect(built.spec.tabs?.map(tab => [tab.control, tab.openTone])).toEqual([
      ['btnFirst', 'var(--color-tab-open)'],
      ['btnSecond', 'var(--color-alert)'],
      ['btnThird', 'var(--color-tab-open)'],
    ]);
  });

  it('puts what the movie settles together with what the table says', () => {
    const built = buildScreenSpec(skin(), WORDS, MEANING);
    if (!('spec' in built)) throw new Error(JSON.stringify(built));
    const spec = built.spec;
    expect(spec.frame).toBe('rectdlgSample');
    expect(spec.close).toBe('btnclose');
    expect(spec.panels).toEqual({ first: 'panelFirst', second: 'panelSecond' });
    // Read across, the way they are laid out; the table's own tab among them.
    expect(spec.tabs?.map(tab => [tab.control, tab.panel, tab.caption])).toEqual([
      ['btnFirst', 'first', 'first'],
      ['btnSecond', 'second', 'second'],
      ['btnThird', 'first', 'again'],
    ]);
    expect(spec.captions).toEqual({
      // The build's own word, as the movie wrote it.
      textFirst: 'Heading',
      // The field's own text, because the table asked for it.
      'panelFirst/note': 'Words of its own',
      'panelSecond/placeholder': 'Ours',
    });
    // `amount` was authored with a word the build knows, but it holds a
    // value — in both panels, which is what naming it by its tail says —
    // so its word is a sample and is not written over the value.
    expect(spec.values).toEqual({ amount: 'amount' });
  });

  it('finds a row into the build’s words by a word it points at, and leaves it out where there is none', () => {
    const asked = { ...MEANING, rowsFrom: { first: { quote: '@0?Other', less: 1 } } };
    const moved = buildScreenSpec(skin(), ['Something', 'Heading', 'Other'], asked);
    if (!('spec' in moved)) throw new Error(JSON.stringify(moved));
    expect(moved.spec.rows).toEqual({ first: 1 });
    const none = buildScreenSpec(skin(), ['Heading'], asked);
    if (!('spec' in none)) throw new Error(JSON.stringify(none));
    expect(none.spec.rows).toBeUndefined();
  });

  it('refuses a screen whose table names a part the movie lacks, and says which', () => {
    const built = buildScreenSpec(skin(), WORDS, {
      ...MEANING,
      values: { amount: 'amount', missing: 'nowhere' },
    });
    expect(built).toEqual({ fallback: { reason: 'missing-part', missing: ['nowhere'] } });
  });

  it('draws without a part the table allows a build to lack', () => {
    const built = buildScreenSpec(skin(), WORDS, {
      ...MEANING,
      values: { amount: 'amount', missing: 'nowhere' },
      optional: ['nowhere'],
    });
    expect('spec' in built).toBe(true);
  });

  it('does not refuse a screen for hiding a part the build lacks', () => {
    expect('spec' in buildScreenSpec(skin(), WORDS, { ...MEANING, hidden: ['nowhere'] })).toBe(
      true,
    );
  });

  it('takes the unusable face off a plaque that opens something, and leaves it on one that opens nothing', () => {
    const m = skin();
    m.sprites.push({
      id: 40,
      frameCount: 1,
      frames: [[place(1, 0, 0, 'plate'), place(1, 0, 0, 'disable')]],
    });
    m.sprites.push({
      id: 41,
      frameCount: 1,
      frames: [
        [
          place(40, 0, 0, 'btn1'),
          place(40, 0, 30, 'btn2'),
          place(1, 2, 2, 'fooicon'),
          place(1, 2, 32, 'baricon'),
        ],
      ],
    });
    m.root[0]!.push(place(41, 0, 200, 'dlgMenu'));
    const built = buildScreenSpec(m, WORDS, {
      dialog: 'dlgMenu',
      menu: [{ icon: 'fooicon', screen: 'foo' }, { icon: 'baricon' }],
    });
    if (!('spec' in built)) throw new Error(JSON.stringify(built));
    expect(built.spec.hidden).toEqual(['btn1/disable']);
    expect(built.spec.shown).toEqual(['btn2/disable']);
  });

  it('steps a bar that is the whole of the piece, as many faces as its clip has', () => {
    const m = skin();
    m.sprites.push({
      id: 30,
      frameCount: 3,
      frames: [[place(1, 0, 0, 'fill')], [place(1, 0, 0, 'fill')], [place(1, 0, 0, 'fill')]],
    });
    m.root[0]!.push(place(30, 0, 100, 'meter'));
    const built = buildScreenSpec(m, WORDS, { dialog: 'meter', bars: { of: { cast: 'meter' } } });
    if (!('spec' in built)) throw new Error(JSON.stringify(built));
    expect(built.spec.bars).toEqual({ frames: 2, of: { cast: 'meter' } });
  });

  it('steps a bar on a run of its own apart from the run the others share', () => {
    const m = skin();
    const clip = (id: number, count: number) => ({
      id,
      frameCount: count,
      frames: Array.from({ length: count }, () => [place(1, 0, 0, 'fill')]),
    });
    m.sprites.push(clip(30, 5), clip(31, 3), {
      id: 32,
      frameCount: 1,
      frames: [[place(30, 0, 0, 'hp'), place(31, 0, 20, 'cast')]],
    });
    m.root[0]!.push(place(32, 0, 100, 'ring'));
    const built = buildScreenSpec(m, WORDS, {
      dialog: 'ring',
      bars: { of: { health: 'hp' }, own: { cast: 'cast' } },
    });
    if (!('spec' in built)) throw new Error(JSON.stringify(built));
    expect(built.spec.bars).toEqual({
      frames: 4,
      of: { health: 'hp' },
      own: { cast: { at: 'cast', frames: 2 } },
      // And each clip's runs, by its path.
      runs: { hp: [{ first: 0, last: 4 }], cast: [{ first: 0, last: 2 }] },
    });
  });

  it('refuses a screen whose own-run bar the movie does not have', () => {
    const built = buildScreenSpec(skin(), WORDS, {
      ...MEANING,
      bars: { of: {}, own: { cast: 'nowhere' } },
    });
    expect('fallback' in built).toBe(true);
  });

  it('refuses a dialog the movie does not have', () => {
    expect(buildScreenSpec(skin(), WORDS, { dialog: 'dlgOther' })).toEqual({
      fallback: { reason: 'no-dialog', dialog: 'dlgOther' },
    });
  });
});

describe('buildUiSpec', () => {
  it('reports a screen the consumers know and the table does not', () => {
    const built = buildUiSpec(new Map([['IGM', skin()]]), WORDS, { mine: MEANING }, [
      'mine',
      'unwritten',
    ]);
    expect(Object.keys(built.spec.screens)).toEqual(['mine']);
    expect(built.fallbacks).toEqual({ unwritten: { reason: 'not-mapped' } });
  });

  it('reports a screen whose movie has not been read', () => {
    const built = buildUiSpec(new Map(), WORDS, { mine: MEANING });
    expect(built.fallbacks).toEqual({ mine: { reason: 'no-movie' } });
  });
});

describe('screenFallback', () => {
  it('says there is no movie before one is read', () => {
    expect(screenFallback('bag')).toEqual({ reason: 'no-movie' });
    expect(screenSpec('bag')).toBeNull();
  });

  it('says the table has no such screen', () => {
    expect(screenFallback('noSuchScreen')).toEqual({ reason: 'not-mapped' });
  });

  it('says the movie has no such dialog', () => {
    setMovie({ skin: skin(), art: new Map() });
    expect(screenFallback('bag')).toMatchObject({ reason: 'no-dialog' });
  });

  it('answers from a spec set by hand, where there is one', () => {
    uiSpec.value = { screens: { bag: { dialog: 'dlgSample' } } };
    expect(screenFallback('bag')).toBeNull();
    expect(screenSpec('bag')?.dialog).toBe('dlgSample');
  });
});
