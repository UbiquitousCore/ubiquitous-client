/**
 * The SWF reader against hand-built movies.
 *
 * Synthetic bytes prove the code does what this repository believes the
 * format is. Only the shipped movies prove the belief; those assertions
 * live in `swfSkin.test.ts`, which needs game data and skips without it.
 * Nothing here quotes anything from the game.
 */

import { describe, expect, it } from 'vitest';

import { parseSwf, REMOVED, SwfError, swfPathToSvg } from '../src/assets/formats/swf';

/** 1x1px frame: nbits=6, bounds 0..20 twips on both axes. */
const FRAME_RECT = [0x30, 0x0a, 0x00, 0xa0];

function header(payloadLength: number): number[] {
  const total = 8 + FRAME_RECT.length + 4 + payloadLength;
  return [
    0x46,
    0x57,
    0x53,
    0x0a, // FWS, version 10
    total & 0xff,
    (total >> 8) & 0xff,
    (total >> 16) & 0xff,
    (total >> 24) & 0xff,
    ...FRAME_RECT,
    0x00,
    0x18, // 24 fps
    0x01,
    0x00, // one frame
  ];
}

function tag(code: number, body: number[]): number[] {
  const head = (code << 6) | (body.length < 0x3f ? body.length : 0x3f);
  const out = [head & 0xff, (head >> 8) & 0xff];
  if (body.length >= 0x3f) {
    out.push(
      body.length & 0xff,
      (body.length >> 8) & 0xff,
      (body.length >> 16) & 0xff,
      (body.length >> 24) & 0xff,
    );
  }
  return [...out, ...body];
}

const str = (s: string): number[] => [...new TextEncoder().encode(s), 0x00];

function movie(tags: number[][]): Uint8Array {
  const payload = tags.flat();
  return new Uint8Array([...header(payload.length), ...payload]);
}

describe('parseSwf', () => {
  it('reads a name from the later placement tag, which carries a second flags byte', async () => {
    // The later tag puts an extra flags byte before the depth and a class
    // name after it. Read as the earlier tag, every field that follows
    // lands one byte early — silently, because the matrix still parses and
    // the name simply comes back with a stray byte stuck to the front.
    const named = [0x22, 0x00, 0x01, 0x00, 0x07, 0x00, ...str('row')];
    const swf = await parseSwf(movie([tag(70, named), tag(1, []), tag(0, [])]));
    expect(swf.root[0][0]).toMatchObject({ depth: 1, characterId: 7, name: 'row' });
  });

  it('skips the class name the later placement tag can carry', async () => {
    const withClass = [0x22, 0x08, 0x01, 0x00, ...str('some.Class'), 0x07, 0x00, ...str('row')];
    const swf = await parseSwf(movie([tag(70, withClass), tag(1, []), tag(0, [])]));
    expect(swf.root[0][0]).toMatchObject({ characterId: 7, name: 'row' });
  });

  it('reads the header, background and export table', async () => {
    const exportsBody = [
      0x02,
      0x00, // two exports
      0x01,
      0x00,
      ...str('a.png'),
      0x02,
      0x00,
      ...str('b'),
    ];
    const data = movie([tag(9, [0xff, 0x00, 0x33]), tag(56, exportsBody), tag(0, [])]);
    const swf = await parseSwf(data);
    expect(swf.version).toBe(10);
    expect(swf.width).toBe(1);
    expect(swf.height).toBe(1);
    expect(swf.background).toBe('#ff0033');
    expect(swf.exports).toEqual([
      { id: 1, name: 'a.png' },
      { id: 2, name: 'b' },
    ]);
  });

  it('reads an edit-text field and its placement', async () => {
    const editBody = [
      0x07,
      0x00, // character id 7
      ...FRAME_RECT,
      0x84,
      0x00, // HasText + HasTextColor
      0x11,
      0x22,
      0x33,
      0xff, // colour
      ...str('txt'),
      ...str('hi'),
    ];
    // PlaceObject2: character + matrix + name. Translate (20, 40) twips.
    const placeBody = [0x26, 0x01, 0x00, 0x07, 0x00, 0x0e, 0x51, 0x40, ...str('row')];
    const data = movie([tag(37, editBody), tag(26, placeBody), tag(1, []), tag(0, [])]);
    const swf = await parseSwf(data);
    expect(swf.edits).toHaveLength(1);
    expect(swf.edits[0]).toMatchObject({
      id: 7,
      varName: 'txt',
      initialHtml: 'hi',
      color: '#112233',
    });
    expect(swf.root).toHaveLength(2); // one ShowFrame plus the End frame
    expect(swf.root[0]).toHaveLength(1);
    expect(swf.root[0][0]).toMatchObject({
      depth: 1,
      characterId: 7,
      name: 'row',
    });
    expect(swf.root[0][0].matrix.tx).toBeCloseTo(1);
    expect(swf.root[0][0].matrix.ty).toBeCloseTo(2);
  });

  it('names the typeface a field is lettered in, even from inside a sprite', async () => {
    // DefineFont2 with no glyphs: id 5, flags, language, then the name.
    const fontBody = [0x05, 0x00, 0x00, 0x00, 4, ...new TextEncoder().encode('Face'), 0, 0];
    const editBody = [
      0x07,
      0x00, // character id 7
      ...FRAME_RECT,
      0x01,
      0x00, // HasFont
      0x05,
      0x00, // font id 5
      0xf0,
      0x00, // 240 twips = 12px
      ...str('txt'),
    ];
    const spriteBody = [
      0x09,
      0x00,
      0x01,
      0x00,
      ...tag(75, fontBody),
      ...tag(37, editBody),
      ...tag(0, []),
    ];
    const swf = await parseSwf(movie([tag(39, spriteBody), tag(1, []), tag(0, [])]));
    expect(swf.fonts).toEqual([{ id: 5, name: 'Face' }]);
    expect(swf.edits[0]).toMatchObject({ id: 7, fontId: 5, fontHeight: 12 });
  });

  it('leaves a field that names no typeface without one', async () => {
    const editBody = [0x07, 0x00, ...FRAME_RECT, 0x00, 0x00, ...str('txt')];
    const swf = await parseSwf(movie([tag(37, editBody), tag(0, [])]));
    expect(swf.edits[0].fontId).toBeNull();
  });

  it('collects sprite frames and skips unknown tags by length', async () => {
    const spriteBody = [
      0x09,
      0x00, // sprite id 9
      0x02,
      0x00, // two frames
      ...tag(26, [0x02, 0x03, 0x00, 0x05, 0x00]),
      ...tag(1, []),
      ...tag(1, []),
      ...tag(0, []),
    ];
    const data = movie([
      tag(99, [1, 2, 3, 4, 5]), // unknown future tag: skipped, not fatal
      tag(39, spriteBody),
      tag(0, []),
    ]);
    const swf = await parseSwf(data);
    expect(swf.sprites).toHaveLength(1);
    expect(swf.sprites[0].frameCount).toBe(2);
    expect(swf.sprites[0].frames).toHaveLength(3); // two frames plus End
    expect(swf.sprites[0].frames[0][0]).toMatchObject({ depth: 3, characterId: 5 });
  });

  it('takes a depth away when a later frame removes it', async () => {
    // A screen's alternate state is often drawn by leaving the first
    // state's art in place on frame one and taking it away on frame two.
    // Reading the removal as "nothing happened" leaves both states drawn
    // on top of each other — which is not a subtle fault, but it is one
    // that only shows on the screens that use it.
    const spriteBody = [
      0x09,
      0x00, // sprite id 9
      0x02,
      0x00, // two frames
      ...tag(26, [0x02, 0x03, 0x00, 0x05, 0x00]), // place character 5 at depth 3
      ...tag(1, []), // end of frame one
      ...tag(28, [0x03, 0x00]), // RemoveObject2 at depth 3
      ...tag(1, []), // end of frame two
      ...tag(0, []),
    ];
    const swf = await parseSwf(movie([tag(39, spriteBody), tag(0, [])]));

    expect(swf.sprites[0].frames[0][0]).toMatchObject({ depth: 3, characterId: 5 });
    expect(swf.sprites[0].frames[1][0]).toMatchObject({ depth: 3, characterId: REMOVED });
  });

  it('reads a parked placement as fully transparent, not misaligned', async () => {
    // CXFORMWITHALPHA carries four mult terms (R G B A); reading three
    // eats the name that follows. Menus park alternate states at alpha
    // zero, so the alpha is visibility, not decoration.
    const placeBody = [
      0x2e, 0x01, 0x00, 0x07, 0x00, 0x00, 0x66, 0x00, 0x80, 0x40, 0x00, 0x00, 0x68, 0x69, 0x00,
    ];
    const data = movie([tag(26, placeBody), tag(1, []), tag(0, [])]);
    const swf = await parseSwf(data);
    expect(swf.root[0][0]).toMatchObject({ depth: 1, characterId: 7, name: 'hi', opacity: 0 });
  });

  it('reads a mask’s reach, so a mask is not mistaken for art', async () => {
    // Character 7 at depth 1, a mask reaching up to depth 5. Dropped, a
    // gauge's mask draws as a solid block over the bar it should reveal.
    const mask = [0x42, 0x01, 0x00, 0x07, 0x00, 0x05, 0x00];
    const art = [0x02, 0x02, 0x00, 0x08, 0x00];
    const swf = await parseSwf(movie([tag(26, mask), tag(26, art), tag(1, []), tag(0, [])]));
    expect(swf.root[0][0]).toMatchObject({ depth: 1, characterId: 7, clipDepth: 5 });
    expect(swf.root[0][1].clipDepth).toBeUndefined();
  });

  it('reads wide translate fields without shift wrap', async () => {
    // NTranslateBits = 31 carrying -13160 twips. JavaScript's `1 << 31`
    // is negative, so a shift-based sign fixup adds 2^31 instead of
    // subtracting it — the shipped movies carry such fields, and the
    // mistranslation parks their art two hundred million pixels away.
    const placeBody = [0x06, 0x01, 0x00, 0x07, 0x00, 63, 255, 255, 50, 96, 0, 0, 1, 64];
    const data = movie([tag(26, placeBody), tag(1, []), tag(0, [])]);
    const swf = await parseSwf(data);
    expect(swf.root[0][0].matrix.tx).toBeCloseTo(-658);
    expect(swf.root[0][0].matrix.ty).toBeCloseTo(2);
  });

  it('rejects what it cannot read', async () => {
    await expect(parseSwf(new Uint8Array([1, 2, 3]))).rejects.toThrow(SwfError);
    const bad = movie([tag(0, [])]);
    bad[0] = 0x58; // XWS
    await expect(parseSwf(bad)).rejects.toThrow(SwfError);
    const truncated = movie([tag(9, [1, 2, 3])]).subarray(0, 10);
    await expect(parseSwf(truncated)).rejects.toThrow(SwfError);
  });

  it('skips a fill that overruns its shape instead of hanging', async () => {
    // A gradient whose stops run past a short shape zeroes the read
    // position (undefined arithmetic makes it NaN), and a NaN bit
    // position rereads byte 0 forever: with the shape id's top bit set
    // and a fill already selected, every reread is an edge record into
    // that fill, growing until the worker OOMs. Found in a shipped
    // interface movie (a 35-byte shape at tag ~2200), which hung the
    // asset worker and took the tab down with a flat main-thread heap.
    // Synthetic bytes throughout: id, empty rect, one solid fill, no
    // lines, fill 0 selected, then new-styles with an overrunning fill.
    const killer = [
      0x81,
      0x00, // id: top bit set, so stuck rereads stay edge records
      0x00, // empty rect
      0x01, // one fill
      0x00,
      0xff,
      0x00,
      0x00,
      0xff, // solid red with alpha
      0xff,
      0x00,
      0x00, // extended line count of zero
      0x10, // fillBits 1, lineBits 0
      0x0a, // style change selecting fill 0... then fill index bit 1
      0x80, // ...then new-styles
      0x01, // one new fill: a gradient...
      0x10, // ...whose matrix and stops run past the body
      0x00,
    ];
    // One bad shape among good ones: skipped, the rest stands. Without
    // the guards this spins forever and OOMs the runner, so the timeout
    // is the assertion that matters.
    const good = [0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const mixed = await parseSwf(movie([tag(2, good), tag(32, killer), tag(0, [])]));
    expect(mixed.shapes.map(s => s.id)).toEqual([2]);
    // Past the budget the movie is rejected instead: mass failure means
    // the reader is wrong, not the file. Vary the id high byte so every
    // copy keeps the set top bit that makes the trap lethal unfixed.
    const manyBad = Array.from({ length: 9 }, (_, i) =>
      tag(32, [0x81, i & 0xff, ...killer.slice(2)]),
    );
    await expect(parseSwf(movie([...manyBad, tag(0, [])]))).rejects.toThrow(SwfError);
  }, 5000);
});

/** Packs values most-significant bit first, as SWF bit fields are stored. */
function bitBytes(fields: Array<[value: number, width: number]>): number[] {
  let acc = '';
  for (const [value, width] of fields) {
    const masked = value < 0 ? value + 2 ** width : value;
    acc += masked.toString(2).padStart(width, '0');
  }
  while (acc.length % 8) acc += '0';
  const out: number[] = [];
  for (let i = 0; i < acc.length; i += 8) out.push(parseInt(acc.slice(i, i + 8), 2));
  return out;
}

/**
 * One fill and one line bit each, select fill 1 for the right-hand side,
 * then a 1 px right and a 1 px down edge (20 twips each) and the end record.
 */
const SQUARE_EDGES = [
  0x11,
  ...bitBytes([
    [0, 1],
    [0b00100, 5],
    [1, 1], // style change: fill-1 = 1
    [1, 1],
    [1, 1],
    [4, 4],
    [1, 1],
    [20, 6],
    [0, 6], // straight, general: +20, 0
    [1, 1],
    [1, 1],
    [4, 4],
    [1, 1],
    [0, 6],
    [20, 6], // straight, general: 0, +20
    [0, 1],
    [0, 5], // end
  ]),
];

describe('shape tags', () => {
  const opaqueRed = [0x00, 0xff, 0x00, 0x00, 0xff];

  async function onlyShape(code: number, body: number[]) {
    const swf = await parseSwf(movie([tag(code, body), tag(0, [])]));
    expect(swf.shapes).toHaveLength(1);
    return swf.shapes[0];
  }

  it('reads tag 83 as the fourth shape tag, with edge bounds and a flags byte', async () => {
    const reference = await onlyShape(32, [
      0x05,
      0x00,
      0x00,
      0x01,
      ...opaqueRed,
      0x00,
      ...SQUARE_EDGES,
    ]);
    const fourth = await onlyShape(83, [
      0x05,
      0x00, // id
      0x00, // shape bounds
      0x00, // edge bounds
      0x00, // flags
      0x01,
      ...opaqueRed,
      0x00, // no line styles
      ...SQUARE_EDGES,
    ]);
    expect(fourth.id).toBe(5);
    expect(fourth.fills).toEqual(reference.fills);
    expect(fourth.paths).toEqual(reference.paths);
    expect(fourth.paths[0].ops).toEqual([
      { op: 'move', x: 0, y: 0 },
      { op: 'line', x: 1, y: 0 },
      { op: 'line', x: 1, y: 1 },
    ]);
  });

  it('skips tag 80, which is not a shape', async () => {
    const swf = await parseSwf(movie([tag(80, [0x05, 0x00, 0x00, 0x00, 0x00, 0x00]), tag(0, [])]));
    expect(swf.shapes).toEqual([]);
  });

  it('reads the third shape tag line style as a width and a colour only', async () => {
    const noLines = await onlyShape(32, [
      0x05,
      0x00,
      0x00,
      0x01,
      ...opaqueRed,
      0x00,
      ...SQUARE_EDGES,
    ]);
    // The colour bytes read as extended line flags would claim a fill.
    const withLine = await onlyShape(32, [
      0x05,
      0x00,
      0x00,
      0x01,
      ...opaqueRed,
      0x01,
      0x14,
      0x00,
      0x08,
      0x08,
      0x08,
      0xff, // one line: width 20, grey
      ...SQUARE_EDGES,
    ]);
    expect(withLine.paths).toEqual(noLines.paths);
  });

  it('reads the fourth shape tag line style: flags, a miter limit, then a fill or a colour', async () => {
    const noLines = await onlyShape(32, [
      0x05,
      0x00,
      0x00,
      0x01,
      ...opaqueRed,
      0x00,
      ...SQUARE_EDGES,
    ]);
    const head = [0x05, 0x00, 0x00, 0x00, 0x00, 0x01, ...opaqueRed];
    // Join style miter (2, in the second pair of bits), so a limit follows.
    const miterColour = await onlyShape(83, [
      ...head,
      0x01,
      0x14,
      0x00,
      0x20,
      0x00,
      0x03,
      0x00,
      0x08,
      0x08,
      0x08,
      0xff,
      ...SQUARE_EDGES,
    ]);
    expect(miterColour.paths).toEqual(noLines.paths);
    // The has-fill bit swaps the colour for a whole fill style.
    const filled = await onlyShape(83, [
      ...head,
      0x01,
      0x14,
      0x00,
      0x08,
      0x00,
      ...opaqueRed,
      ...SQUARE_EDGES,
    ]);
    expect(filled.paths).toEqual(noLines.paths);
  });
});

describe('swfPathToSvg', () => {
  it('emits move, line and quadratic segments', () => {
    expect(
      swfPathToSvg({
        fill: 1,
        ops: [
          { op: 'move', x: 0, y: 0 },
          { op: 'line', x: 10, y: 0 },
          { op: 'curve', cx: 15, cy: 0, x: 15, y: 5 },
        ],
      }),
    ).toBe('M0.00 0.00L10.00 0.00Q15.00 0.00 15.00 5.00Z');
  });
});
