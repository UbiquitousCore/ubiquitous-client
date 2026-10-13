import { describe, expect, it } from 'vitest';

import {
  compose,
  findPlacements,
  frameAround,
  transformTo,
  mapBox,
  pieceNames,
  pieceStates,
  planPiece,
} from '../../src/ui/art/piecePlan';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';

const at = (tx: number, ty: number, s = 1): UiSkinPlaced['matrix'] => ({
  a: s,
  b: 0,
  c: 0,
  d: s,
  tx,
  ty,
});

const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string | null,
  opacity = 1,
): UiSkinPlaced => ({ depth: 1, characterId, matrix, name, opacity });

/**
 * A movie with one framed piece: a sprite holding a filled shape, placed
 * away from the origin so the crop has something to remove.
 */
function movie(overrides: Partial<UiSkinData> = {}): UiSkinData {
  return {
    movie: 'TEST',
    width: 800,
    height: 600,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 40, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 20L0 20Z' }],
      },
    ],
    sprites: [{ id: 20, frameCount: 1, frames: [[place(11, at(5, 5), 'art')]] }],
    edits: [],
    root: [[place(20, at(100, 60), 'frame')]],
    ...overrides,
  };
}

describe('planPiece', () => {
  it('crops a piece to the art it draws and moves it to the origin', () => {
    // Where the piece sat in the movie is not part of the picture: a
    // screen places it itself, so the plan starts at 0, 0.
    const plan = planPiece(movie(), 'frame');
    expect(plan?.box).toEqual({ x: 105, y: 65, w: 40, h: 20 });
    expect(plan?.ops).toHaveLength(1);
    expect(plan?.ops[0].matrix).toEqual(at(0, 0));
    expect(plan?.ops[0].fill).toEqual({ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 });
  });

  it('sizes a piece by every transform above it', () => {
    // A piece placed at half size is half the picture. Reading the
    // translation alone keeps the authored size and the art draws off it.
    const half = movie({ root: [[place(20, at(100, 60, 0.5), 'frame')]] });
    expect(planPiece(half, 'frame')?.box).toEqual({ x: 102.5, y: 62.5, w: 20, h: 10 });
  });

  it('leaves out what the build drives and what is parked', () => {
    const m = movie();
    m.sprites[0].frames[0].push(place(11, at(0, 0), 'redmask'));
    m.sprites[0].frames[0].push(place(11, at(0, 0), 'alternate', 0));
    expect(planPiece(m, 'frame')?.ops).toHaveLength(1);
  });

  it('measures on art that draws, not on empty shapes', () => {
    // A shape whose fill index points at nothing draws nothing, and must
    // not pad the picture with margin the screen would have to crop back.
    const m = movie();
    m.shapes.push({
      id: 12,
      bounds: { x: 0, y: 0, w: 500, h: 500 },
      fills: [],
      paths: [{ fill: 1, d: 'M0 0L500 0L500 500L0 500Z' }],
    });
    m.sprites[0].frames[0].push(place(12, at(0, 0), 'empty'));
    expect(planPiece(m, 'frame')?.box.w).toBe(40);
  });

  it('carries a bitmap fill by the name of its art', () => {
    // The atlas is fetched separately and shared between pieces, so the
    // plan names it rather than holding it.
    const m = movie();
    m.shapes[0].fills = [
      { kind: 'bitmap', repeating: false, imageId: 7, art: 'frame.png', matrix: at(2, 3) },
    ];
    const fill = planPiece(m, 'frame')?.ops[0].fill;
    expect(fill).toEqual({ kind: 'bitmap', art: 'frame.png', matrix: at(2, 3), repeating: false });
  });

  it('multiplies the alpha of every placement it passes through', () => {
    const faded = movie({ root: [[place(20, at(100, 60), 'frame', 0.5)]] });
    expect(planPiece(faded, 'frame')?.ops[0].opacity).toBe(0.5);
  });

  it('answers null for a name the movie does not draw', () => {
    expect(planPiece(movie(), 'nothing')).toBeNull();
    const empty = movie({ sprites: [{ id: 20, frameCount: 1, frames: [[]] }] });
    expect(planPiece(empty, 'frame')).toBeNull();
  });

  it('survives a piece that contains itself', () => {
    const looped = movie();
    looped.sprites[0].frames[0].push(place(20, at(1, 1), 'again'));
    expect(planPiece(looped, 'frame')?.ops.length).toBeGreaterThan(0);
  });
});

describe('pieceNames', () => {
  it('lists what the movie names, minus what the build drives', () => {
    const m = movie();
    m.sprites[0].frames[0].push(place(11, at(0, 0), 'bluemask'));
    expect(pieceNames(m)).toEqual(['art', 'frame']);
  });
});

describe('matrix helpers', () => {
  it('composes a scale under a translation', () => {
    expect(compose(at(10, 10), at(5, 5, 2))).toEqual({ a: 2, b: 0, c: 0, d: 2, tx: 15, ty: 15 });
  });

  it('maps every corner, not the origin and the size', () => {
    const flipped = { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
    expect(mapBox(flipped, { x: 0, y: 0, w: 10, h: 4 })).toEqual({ x: -10, y: 0, w: 10, h: 4 });
  });
});

describe('alternate states', () => {
  const twoStates = (): UiSkinData => {
    const m = movie();
    // The state the dialog opens in, and the one the build switches to.
    m.sprites[0].frames[0].push(place(11, at(50, 0), 'empty', 0));
    return m;
  };

  it('leaves parked states off, the way the dialog opens', () => {
    expect(planPiece(twoStates(), 'frame')?.ops).toHaveLength(1);
  });

  it('draws a parked state when asked, at full strength', () => {
    // Parked is off, not faint: drawing it at its own alpha would show
    // nothing at all.
    const plan = planPiece(twoStates(), 'frame', { includeParked: true });
    expect(plan?.ops).toHaveLength(2);
    expect(plan?.ops.every(op => op.opacity === 1)).toBe(true);
  });

  it('switches one state on without switching them all on', () => {
    const plan = planPiece(twoStates(), 'frame', { shown: ['empty'] });
    expect(plan?.ops).toHaveLength(2);
  });

  it('takes a state out that the movie would have drawn', () => {
    expect(planPiece(twoStates(), 'frame', { hidden: ['art'] })).toBeNull();
  });

  it('lists the states a caller can switch', () => {
    expect(pieceStates(twoStates(), 'frame')).toEqual([
      { name: 'art', parked: false, characterId: 11 },
      { name: 'empty', parked: true, characterId: 11 },
    ]);
  });
});

describe('a fixed frame', () => {
  it('keeps the same extent whatever is switched on', () => {
    // Hit-areas are placed as a fraction of the picture, so the picture
    // has to stay the same size when a state is switched.
    const m = movie();
    m.sprites[0].frames[0].push(place(11, at(200, 0), 'wide', 0));
    const frame = planPiece(m, 'frame', { includeParked: true })!.box;
    const narrow = planPiece(m, 'frame', { frame });
    expect(narrow?.box).toEqual(frame);
    expect(narrow?.ops).toHaveLength(1);
    // And the art still sits where it sat in the wider frame.
    expect(narrow?.ops[0].matrix.tx).toBe(0);
  });
});

describe('named parts', () => {
  it('boxes each part inside the picture, not inside its own parent', () => {
    // A part's placement is in its parent's coordinates. Planning the part
    // on its own gives a box in the wrong space — and picks whichever
    // placement of that name comes first in the movie, which may be in a
    // different dialog entirely.
    const m = movie();
    m.shapes.push({
      id: 12,
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L10 0L10 10L0 10Z' }],
    });
    // Inside the sprite, which the root places at (100, 60).
    m.sprites[0].frames[0].push(place(12, at(30, 5), 'someControl'));
    const plan = planPiece(m, 'frame');
    const part = plan?.parts.find(p => p.name === 'someControl');
    // The part is placed at (30, 5) inside a sprite the root puts at
    // (100, 60), so it lands at (130, 65) on the stage. The piece is
    // cropped to its art at (105, 65), which leaves the part 25 across and
    // flush with the top — and that is the number a hit-area needs.
    expect(part?.box).toEqual({ x: 25, y: 0, w: 10, h: 10 });
    expect(part?.path).toBe('someControl');
  });

  it('boxes a part around everything it draws', () => {
    const m = movie();
    m.sprites.push({
      id: 21,
      frameCount: 1,
      frames: [[place(11, at(0, 0), 'left'), place(11, at(60, 0), 'right')]],
    });
    m.sprites[0].frames[0].push(place(21, at(0, 0), 'pair'));
    const pair = planPiece(m, 'frame')?.parts.find(p => p.name === 'pair');
    expect(pair?.box).toMatchObject({ w: 100, h: 20 });
  });

  it('tells two parts of the same name apart by where they sit', () => {
    // Two runs of cells on one screen share a name for each cell.
    // Boxed together they make one box covering both, and a hit-area the
    // size of the screen.
    const m = movie();
    m.sprites.push({
      id: 22,
      frameCount: 1,
      frames: [[place(11, at(0, 0), 'cell01')]],
    });
    m.sprites.push({
      id: 23,
      frameCount: 1,
      frames: [[place(11, at(0, 0), 'cell01')]],
    });
    m.sprites[0].frames[0].push(place(22, at(0, 0), 'holder'));
    m.sprites[0].frames[0].push(place(23, at(300, 0), 'shelf'));
    const parts = planPiece(m, 'frame')?.parts ?? [];
    const boxes = parts.filter(part => part.name === 'cell01');
    expect(boxes).toHaveLength(2);
    expect(boxes.map(b => b.path).sort()).toEqual(['holder/cell01', 'shelf/cell01']);
    expect(boxes.every(b => b.box.w === 40)).toBe(true);
  });

  it('leaves out a part the movie parks', () => {
    const m = movie();
    m.sprites[0].frames[0].push(place(11, at(0, 0), 'ghost', 0));
    expect(planPiece(m, 'frame')?.parts.map(p => p.name)).toEqual(['art']);
  });
});

describe('parts that draw nothing', () => {
  it('still says where they are', () => {
    // A control can be a hit-area with a text field in it and no art at
    // all. It is still somewhere, and an input has to go there.
    const m = movie();
    m.sprites.push({ id: 24, frameCount: 1, frames: [[]] });
    m.sprites[0].frames[0].push(place(24, at(50, 10), 'numberControl'));
    const part = planPiece(m, 'frame')?.parts.find(p => p.name === 'numberControl');
    expect(part).toMatchObject({ draws: false, box: { x: 50 - 5, y: 10 - 5, w: 0, h: 0 } });
  });
});

describe('the spot a picture is drawn into', () => {
  it('keeps the extent the spot was authored with, apart from its point', () => {
    // The hook a screen draws a picture into is authored as a box: how
    // big the picture is meant to be, and where. It is still a point as a
    // part, so nothing measured against it moves.
    const m = movie();
    m.shapes.push({
      id: 12,
      bounds: { x: 0, y: 0, w: 64, h: 60 },
      fills: [{ kind: 'solid', css: 'rgb(255, 255, 255)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L64 0L64 60L0 60Z' }],
    });
    m.sprites.push({ id: 26, frameCount: 1, frames: [[place(12, at(0, 0), null)]] });
    m.sprites[0].frames[0].push(place(26, at(8, 6, 0.5), 'displayCallback'));
    const plan = planPiece(m, 'frame');
    const spot = plan?.parts.find(part => part.name === 'displayCallback');
    expect(spot).toMatchObject({ draws: false, box: { x: 3, y: 1, w: 0, h: 0 } });
    expect(spot?.spot).toEqual({ x: 3, y: 1, w: 32, h: 30 });
    expect(plan?.ops).toHaveLength(1);
  });
});

describe('drawing one part alone', () => {
  it('draws only that part and what it holds, where the whole piece puts it', () => {
    // A part cut out of a screen to be placed on its own has to come
    // without whatever else of the screen lies under it — the screen's own
    // sheet, which no name reaches — and still sit on the screen's grid.
    const m = movie();
    m.shapes.push({
      id: 12,
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      fills: [{ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L10 0L10 10L0 10Z' }],
    });
    m.sprites.push({ id: 26, frameCount: 1, frames: [[place(12, at(0, 0), null)]] });
    m.sprites[0].frames[0].push(place(26, at(20, 4), 'seat'));
    const plan = planPiece(m, 'frame', { only: 'seat' });
    expect(plan?.ops).toHaveLength(1);
    expect(plan?.ops[0].fill).toEqual({ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 });
    expect(plan?.box).toEqual({ x: 120, y: 64, w: 10, h: 10 });
  });
});

describe('drawing a hook the movie leaves to interface code', () => {
  /** A slot holding a sweep clip of three faces, a tint and a lit edge, none drawn by default. */
  function slotted(): UiSkinData {
    const m = movie();
    m.shapes.push(
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 10, h: 10 },
        fills: [{ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L10 0L10 10L0 10Z' }],
      },
      {
        id: 13,
        bounds: { x: 0, y: 0, w: 20, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(7, 8, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L20 0L20 20L0 20Z' }],
      },
    );
    // The sweep: the first face is a small square and the later ones a large one.
    m.sprites.push({
      id: 26,
      frameCount: 2,
      frames: [
        [{ depth: 1, characterId: 12, matrix: at(0, 0), name: null, opacity: 1 }],
        [{ depth: 1, characterId: 13, matrix: at(0, 0), name: null, opacity: 1 }],
      ],
    });
    m.sprites.push({ id: 27, frameCount: 1, frames: [[place(12, at(0, 0), null)]] });
    m.sprites.push({
      id: 28,
      frameCount: 1,
      frames: [
        [
          { depth: 1, characterId: 26, matrix: at(0, 0), name: 'rectcooldown', opacity: 1 },
          { depth: 2, characterId: 27, matrix: at(0, 0), name: 'redmask', opacity: 1 },
          { depth: 3, characterId: 27, matrix: at(0, 0), name: 'hot', opacity: 1 },
        ],
      ],
    });
    m.sprites[0].frames[0].push(place(28, at(30, 0), 'btn01'));
    return m;
  }

  it('leaves them out unless the screen names them', () => {
    expect(planPiece(slotted(), 'frame')?.ops).toHaveLength(1);
  });

  it('draws the ones named, by path, and no others', () => {
    const plan = planPiece(slotted(), 'frame', { driven: ['btn01/redmask'] });
    expect(plan?.ops).toHaveLength(2);
    // The tint is then a part like any other, with a box to place things by.
    expect(plan?.parts.find(part => part.path === 'btn01/redmask')).toMatchObject({ draws: true });
    expect(plan?.parts.find(part => part.path === 'btn01/hot')).toMatchObject({ draws: false });
  });

  it('turns a clip it draws to the face it is given', () => {
    const first = planPiece(slotted(), 'frame', { driven: ['btn01/rectcooldown'] });
    const second = planPiece(slotted(), 'frame', {
      driven: ['btn01/rectcooldown'],
      frames: { 'btn01/rectcooldown': 1 },
    });
    const box = (plan: typeof first) =>
      plan?.parts.find(part => part.path === 'btn01/rectcooldown')?.box;
    expect(box(first)).toMatchObject({ w: 10 });
    expect(box(second)).toMatchObject({ w: 20 });
  });

  it('draws only the parts of a list, still where the whole piece puts them', () => {
    const plan = planPiece(slotted(), 'frame', {
      driven: ['btn01/redmask', 'btn01/hot'],
      only: ['btn01/redmask', 'btn01/hot'],
    });
    expect(plan?.ops).toHaveLength(2);
    expect(planPiece(slotted(), 'frame', { only: [] })).toBeNull();
  });
});

describe('hiding by path', () => {
  it('hides one part of a repeated name, leaving the others', () => {
    // One name can be a row of a list, a slot in a dropdown and a slot
    // in a grid at once. Hiding by name hides all three.
    const m = movie();
    m.sprites.push({ id: 25, frameCount: 1, frames: [[place(11, at(0, 0), 'cell01')]] });
    m.sprites.push({ id: 26, frameCount: 1, frames: [[place(11, at(200, 0), 'cell01')]] });
    m.sprites[0].frames[0].push(place(25, at(0, 0), 'holder'));
    m.sprites[0].frames[0].push(place(26, at(0, 0), 'shelf'));
    const plan = planPiece(m, 'frame', { hidden: ['holder/cell01'] });
    const paths = (plan?.parts ?? []).map(p => p.path);
    expect(paths).toContain('shelf/cell01');
    expect(paths).not.toContain('holder/cell01');
  });
});

describe('text fields', () => {
  it('carries the box, alignment, size, colour and typeface the screen sets', () => {
    // A caller supplying words should not have to place them: every one
    // of these is already in the movie, and only the words are missing.
    const m = movie();
    m.edits.push({
      id: 40,
      bounds: { x: 0, y: 0, w: 60, h: 14 },
      varName: '',
      sampleHtml: '<p align="center"><font size="11" color="#660000">asdasd</font></p>',
      sizePx: 11,
      color: '#660000',
      face: 'Some Face',
    });
    m.sprites[0].frames[0].push(place(40, at(10, 20), 'textQuality'));
    const part = planPiece(m, 'frame')?.parts.find(p => p.name === 'textQuality');
    expect(part?.box).toMatchObject({ w: 60, h: 14 });
    expect(part?.text).toEqual({
      align: 'center',
      sizePx: 11,
      color: '#660000',
      face: 'Some Face',
      // The screen's own caption, which a caller shows rather than
      // writing its own.
      words: 'asdasd',
    });
  });

  it('counts a text field as words rather than art', () => {
    // Drawing it would paint whatever placeholder was typed while the
    // screen was being authored.
    const m = movie();
    m.edits.push({
      id: 41,
      bounds: { x: 0, y: 0, w: 20, h: 10 },
      varName: '',
      sampleHtml: '<p align="left">x</p>',
      sizePx: 10,
      color: null,
      face: null,
    });
    m.sprites[0].frames[0].push(place(41, at(0, 0), 'label'));
    expect(planPiece(m, 'frame')?.parts.find(p => p.name === 'label')?.draws).toBe(false);
  });
});

describe('masks', () => {
  it('measures a mask without drawing it', () => {
    // A mask says how much of a run is visible at once. Measured from the
    // run instead, the answer moves as the run's contents do.
    const m = movie();
    m.shapes.push({
      id: 50,
      bounds: { x: 0, y: 0, w: 100, h: 40 },
      fills: [{ kind: 'solid', css: 'rgb(0, 0, 0)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L100 0L100 40L0 40Z' }],
    });
    m.sprites[0].frames[0].push(place(50, at(0, 60), 'mask'));
    const plan = planPiece(m, 'frame');
    const mask = plan?.parts.find(part => part.name === 'mask');
    expect(mask).toMatchObject({ mask: true, draws: false, box: { w: 100, h: 40 } });
    // And it neither draws nor stretches the piece it sits in.
    expect(plan?.ops).toHaveLength(1);
    expect(plan?.box.h).toBe(20);
  });
});

describe('the places the build draws for itself', () => {
  it('says where a driven placement sits without drawing it', () => {
    // How many are in a stack, the picture on a row: the build draws
    // those itself, into a placement that carries no art. A screen
    // wearing this art has to put the same thing in the same place, so
    // where the hook sits is worth having even though nothing is drawn.
    const m = movie();
    m.shapes.push({
      id: 60,
      bounds: { x: 0, y: 0, w: 10, h: 10 },
      fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L10 0L10 10L0 10Z' }],
    });
    m.sprites[0].frames[0].push(place(60, at(30, 12), 'cnt'));
    const plan = planPiece(m, 'frame');
    const count = plan?.parts.find(part => part.name === 'cnt');
    // Placed at 100,60 then 5,5 then 30,12, and read against the
    // picture's own corner at 105,65 — a point, not a box.
    expect(count).toMatchObject({ draws: false, box: { x: 25, y: 7, w: 0, h: 0 } });
    // And it draws nothing, so the piece is the size it always was.
    expect(plan?.ops).toHaveLength(1);
    expect(plan?.box).toEqual({ x: 105, y: 65, w: 40, h: 20 });
  });
});

describe('a part drawn without its own art', () => {
  it('leaves out what it carries and keeps what it holds', () => {
    // A row of a list draws a bar behind its contents that the build
    // lights when the row is chosen. Drawn as shipped it is a line under
    // every row; hiding the row hides what sits on it.
    const m = movie();
    m.sprites.push({
      id: 60,
      frameCount: 1,
      frames: [[place(11, at(0, 0), null), place(11, at(5, 5), 'inside')]],
    });
    m.sprites[0].frames[0].push(place(60, at(0, 0), 'rowish'));
    const plain = planPiece(m, 'frame');
    const bare = planPiece(m, 'frame', { withoutArt: ['rowish'] });
    expect(plain!.ops.length - bare!.ops.length).toBe(1);
    expect(bare?.parts.some(part => part.name === 'inside')).toBe(true);
  });
});

describe('showing a thing and what is inside it', () => {
  /** A parked list with a parked slot in it, the shape a dropdown has. */
  const withList = (): UiSkinData => {
    const m = movie();
    m.sprites.push({
      id: 60,
      frameCount: 1,
      frames: [[{ ...place(1, at(0, 0), 'item01'), opacity: 0 }]],
    });
    m.sprites[0].frames[0].push({ ...place(60, at(5, 5), 'comboList01'), opacity: 0 });
    return m;
  };

  it('leaves a parked list out until it is asked for', () => {
    const parts = planPiece(withList(), 'frame')?.parts ?? [];
    expect(parts.some(part => part.path.includes('comboList01'))).toBe(false);
  });

  it('asking for the list alone would give an empty list', () => {
    const parts = planPiece(withList(), 'frame', { shown: ['comboList01'] })?.parts ?? [];
    expect(parts.some(part => part.path.endsWith('/item01'))).toBe(false);
  });

  it('asking for what is inside it gives the slots too', () => {
    const parts = planPiece(withList(), 'frame', { shownInside: ['comboList01'] })?.parts ?? [];
    expect(parts.some(part => part.path.endsWith('comboList01/item01'))).toBe(true);
  });
});

describe('the face a control is wearing', () => {
  /** A control with a plain face and a wider lit one, as a tab has. */
  const withFaces = (): UiSkinData => {
    const m = movie();
    m.shapes.push({
      id: 70,
      bounds: { x: 0, y: 0, w: 90, h: 20 },
      fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
      paths: [{ fill: 1, d: 'M0 0L90 0L90 20L0 20Z' }],
    });
    m.sprites.push({
      id: 61,
      frameCount: 2,
      frames: [
        [{ ...place(11, at(0, 0), null), depth: 1 }],
        // The lit face takes the plain one away and puts its own there.
        [
          { ...place(11, at(0, 0), null), depth: 1, characterId: -1 },
          { ...place(70, at(0, 0), null), depth: 2 },
        ],
      ],
    });
    m.sprites[0].frames[0] = [place(61, at(0, 0), 'tab')];
    return m;
  };

  it('wears its first face when nobody says otherwise', () => {
    expect(planPiece(withFaces(), 'frame')!.box.w).toBeCloseTo(40, 1);
  });

  it('moves what a later face only moves', () => {
    // A face after the first says "that one, bigger" without saying which
    // character: the character is still the one the first face put there.
    const m = withFaces();
    m.sprites[1].frames[1] = [
      {
        ...place(11, at(0, 0), null),
        depth: 1,
        characterId: null,
        matrix: { a: 3, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      },
    ];
    expect(planPiece(m, 'frame', { frames: { tab: 1 } })!.box.w).toBeCloseTo(120, 1);
  });

  it('wears the face it is told to, and drops what that face takes away', () => {
    // Both would be 130 wide together; the lit face is 90 on its own.
    expect(planPiece(withFaces(), 'frame', { frames: { tab: 1 } })!.box.w).toBeCloseTo(90, 1);
  });

  it('turns the piece itself to a face, where the piece is a clip of faces', () => {
    // A bar that is a clip of its own, placed straight on the stage.
    const m = withFaces();
    m.root = [[place(61, at(100, 60), 'bar')]];
    expect(planPiece(m, 'bar')!.box.w).toBeCloseTo(40, 1);
    expect(planPiece(m, 'bar', { frames: { bar: 1 } })!.box.w).toBeCloseTo(90, 1);
  });
});

describe('finding a piece a movie names twice', () => {
  /**
   * Two screens carrying the same name for different art, which is what
   * a movie built one screen at a time ends up holding.
   */
  const twice: UiSkinData = {
    ...movie(),
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 40, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L40 0L40 20L0 20Z' }],
      },
    ],
    sprites: [
      { id: 20, frameCount: 1, frames: [[place(11, at(0, 0), 'reading')]] },
      { id: 21, frameCount: 1, frames: [[place(11, at(0, 0), 'typing')]] },
      { id: 30, frameCount: 1, frames: [[place(20, at(0, 0), 'money')]] },
      { id: 31, frameCount: 1, frames: [[place(21, at(0, 0), 'money')]] },
    ],
    root: [[place(30, at(0, 0), 'letter'), place(31, at(0, 0), 'screen')]],
  };

  it('gives back every placement of a bare name, in the order it is placed', () => {
    expect(findPlacements(twice, 'money')).toHaveLength(2);
  });

  it('finds the one inside the piece a path names', () => {
    // Asked by name alone, a screen wears whichever of the two the movie
    // happens to place first — which is how one screen came out wearing
    // another's art.
    const inLetter = findPlacements(twice, 'letter/money');
    expect(inLetter).toHaveLength(1);
    expect(planPiece(twice, 'letter/money')?.parts.map(part => part.name)).toContain('reading');
    expect(planPiece(twice, 'screen/money')?.parts.map(part => part.name)).toContain('typing');
  });

  it('finds nothing where a step of the path is not inside the one before it', () => {
    expect(findPlacements(twice, 'letter/typing')).toEqual([]);
    expect(findPlacements(twice, 'nowhere/money')).toEqual([]);
  });
});

describe('where the movie\u2019s own screen puts a piece', () => {
  /** A dialog two sprites deep, each carrying an offset of its own. */
  const nested: UiSkinData = {
    ...movie(),
    sprites: [
      { id: 20, frameCount: 1, frames: [[place(11, at(0, 0), 'art')]] },
      { id: 30, frameCount: 1, frames: [[place(20, at(7, 9), 'dialog')]] },
      { id: 40, frameCount: 1, frames: [[place(30, at(100, 200), 'group')]] },
    ],
    root: [[place(40, at(1, 2), 'IGM')]],
  };

  it('adds up every offset above the piece, its own left out', () => {
    // The plan already carries the piece's own matrix, so what is wanted
    // is everything between it and the movie: 1+100 across, 2+200 down.
    expect(transformTo(nested, 'dialog')).toMatchObject({ tx: 101, ty: 202 });
  });

  it('answers with nothing for a piece the movie does not carry', () => {
    expect(transformTo(nested, 'nowhere')).toBeNull();
  });

  it('agrees with the lookup about which of two same-named pieces it is', () => {
    // Measured off one and drawn from the other, a screen lands tens of
    // units from where it belongs, off the bottom of the view.
    const twice: UiSkinData = {
      ...nested,
      sprites: [
        ...nested.sprites,
        { id: 50, frameCount: 1, frames: [[place(20, at(3, 4), 'dialog')]] },
        { id: 60, frameCount: 1, frames: [[place(50, at(0, 0), 'elsewhere')]] },
      ],
      root: [[place(40, at(1, 2), 'IGM'), place(60, at(500, 600), 'other')]],
    };
    expect(findPlacements(twice, 'other/elsewhere/dialog')).toHaveLength(1);
    expect(transformTo(twice, 'other/elsewhere/dialog')).toMatchObject({ tx: 500, ty: 600 });
  });
});

describe('masks and splits', () => {
  /** A second shape in another colour, so which one drew is plain. */
  const other = {
    id: 12,
    bounds: { x: 0, y: 0, w: 40, h: 20 },
    fills: [{ kind: 'solid' as const, css: 'rgb(9, 9, 9)', opacity: 1 }],
    paths: [{ fill: 1, d: 'M0 0L20 0L20 20L0 20Z' }],
  };
  const at1 = (
    depth: number,
    characterId: number,
    name: string | null,
    extra: Partial<UiSkinPlaced> = {},
  ): UiSkinPlaced => ({
    ...place(characterId, at(0, 0), name),
    depth,
    ...extra,
  });

  it('shows art under a mask only where the mask covers, and never paints the mask', () => {
    const m = movie();
    m.shapes.push(other);
    m.sprites[0].frames[0] = [
      at1(1, 12, null, { clipDepth: 2 }),
      at1(2, 11, 'bar'),
      at1(3, 11, 'plain'),
    ];
    const ops = planPiece(m, 'frame')?.ops ?? [];
    expect(ops.every(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(1, 2, 3)')).toBe(true);
    expect(ops[0].clips).toEqual([[{ matrix: at(0, 0), path: 'M0 0L20 0L20 20L0 20Z' }]]);
    expect(ops[ops.length - 1].clips).toBeUndefined();
  });

  it('records a named mask as a part that draws nothing — the window a list shows through', () => {
    const m = movie();
    m.shapes.push(other);
    m.sprites[0].frames[0] = [at1(1, 12, 'window', { clipDepth: 2 }), at1(2, 11, 'bar')];
    const plan = planPiece(m, 'frame');
    const window_ = plan?.parts.find(part => part.name === 'window');
    expect(window_).toBeDefined();
    expect(window_?.draws).toBe(false);
    expect(window_?.box.w).toBeGreaterThan(0);
    expect(plan?.ops.some(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(9, 9, 9)')).toBe(
      false,
    );
  });

  it('leaves out a placement with no name by where it sits, keeping its named neighbours', () => {
    const m = movie();
    m.shapes.push(other);
    m.sprites[0].frames[0] = [at1(1, 12, null), at1(2, 11, 'bar')];
    const all = planPiece(m, 'frame')?.ops ?? [];
    const kept = planPiece(m, 'frame', { hidden: ['@1'] })?.ops ?? [];
    expect(all.some(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(9, 9, 9)')).toBe(true);
    expect(kept.some(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(9, 9, 9)')).toBe(false);
    expect(kept.some(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(1, 2, 3)')).toBe(true);
  });

  it('leaves out by depth only what the part itself holds, not what an unnamed one inside it holds', () => {
    const m = movie();
    m.shapes.push(other);
    // A slot holding a plain square at depth 1, and at depth 3 an unnamed
    // group whose own art is at depth 1 of that group.
    m.sprites.push({ id: 30, frameCount: 1, frames: [[at1(1, 11, null)]] });
    m.sprites[0].frames[0] = [at1(1, 12, null), at1(3, 30, null)];
    const kept = planPiece(m, 'frame', { hidden: ['@1'] })?.ops ?? [];
    expect(kept.some(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(9, 9, 9)')).toBe(false);
    expect(kept.some(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(1, 2, 3)')).toBe(true);
  });

  it('leaves out one outline of a shape with no name, keeping the shape’s other outlines', () => {
    const m = movie();
    // One shape of two outlines, each in a paint of its own: a corner and
    // a track under it, the way a backdrop can carry both in one shape.
    m.shapes.push({
      id: 40,
      bounds: { x: 0, y: 0, w: 40, h: 20 },
      fills: [
        { kind: 'solid', css: 'rgb(4, 4, 4)', opacity: 1 },
        { kind: 'solid', css: 'rgb(5, 5, 5)', opacity: 1 },
      ],
      paths: [
        { fill: 1, d: 'M0 0L20 0L20 20L0 20Z' },
        { fill: 2, d: 'M20 10L40 10L40 20L20 20Z' },
      ],
    });
    m.sprites[0].frames[0] = [at1(2, 40, null), at1(3, 11, 'bar')];
    const paints = (hidden: string[]) =>
      (planPiece(m, 'frame', { hidden })?.ops ?? []).map(
        op => op.fill.kind === 'solid' && op.fill.css,
      );
    expect(paints([])).toEqual(['rgb(4, 4, 4)', 'rgb(5, 5, 5)', 'rgb(1, 2, 3)']);
    expect(paints(['@2#1'])).toEqual(['rgb(5, 5, 5)', 'rgb(1, 2, 3)']);
    expect(paints(['@2#2'])).toEqual(['rgb(4, 4, 4)', 'rgb(1, 2, 3)']);
    // The whole placement, as before, and an outline elsewhere touches nothing here.
    expect(paints(['@2'])).toEqual(['rgb(1, 2, 3)']);
    expect(paints(['@3#1'])).toEqual(['rgb(4, 4, 4)', 'rgb(5, 5, 5)', 'rgb(1, 2, 3)']);
  });

  it('measures a shape with an outline left out by the outlines it still draws', () => {
    const m = movie();
    m.shapes.push({
      id: 40,
      bounds: { x: 0, y: 0, w: 40, h: 20 },
      fills: [
        { kind: 'solid', css: 'rgb(4, 4, 4)', opacity: 1 },
        { kind: 'solid', css: 'rgb(5, 5, 5)', opacity: 1 },
      ],
      paths: [
        { fill: 1, d: 'M0 0L20 0L20 20L0 20Z' },
        { fill: 2, d: 'M20 10L40 10Q45 15 40 20L20 20Z' },
      ],
    });
    m.sprites[0].frames[0] = [at1(2, 40, null)];
    // Boxes are in the picture's own coordinates, which start where the art does.
    const painted = (hidden: string[]) => planPiece(m, 'frame', { hidden })?.painted;
    expect(painted([])).toEqual([{ x: 0, y: 0, w: 40, h: 20 }]);
    // The control point counts: a curve can reach toward it, never past it.
    expect(painted(['@2#1'])).toEqual([{ x: 0, y: 0, w: 25, h: 10 }]);
    expect(painted(['@2#1', '@2#2'])).toBeUndefined();
  });

  it('draws only what paints before, or after, a named part — lined up by one frame', () => {
    const m = movie();
    m.shapes.push(other);
    m.sprites[0].frames[0] = [at1(1, 11, 'under'), at1(2, 12, 'hook'), at1(3, 12, 'over')];
    const frame = { x: 100, y: 60, w: 40, h: 20 };
    const before = planPiece(m, 'frame', { split: { at: 'hook', keep: 'before' }, frame });
    const after = planPiece(m, 'frame', { split: { at: 'hook', keep: 'after' }, frame });
    expect(before?.ops.map(op => op.fill.kind === 'solid' && op.fill.css)).toEqual([
      'rgb(1, 2, 3)',
    ]);
    expect(after?.ops.every(op => op.fill.kind === 'solid' && op.fill.css === 'rgb(9, 9, 9)')).toBe(
      true,
    );
    expect(before?.parts.find(p => p.path === 'hook')?.box).toEqual(
      after?.parts.find(p => p.path === 'hook')?.box,
    );
  });
});

describe('frameAround', () => {
  const stage = { w: 480, h: 320 };
  const backdrop = { x: 100, y: 100, w: 200, h: 100 };

  it('takes in art that reaches over an edge, and what that art reaches in turn', () => {
    // A band over the top edge, and a close mark over the band's own top.
    const band = { x: 90, y: 80, w: 220, h: 30 };
    const close = { x: 280, y: 70, w: 20, h: 20 };
    expect(frameAround(backdrop, [close, band], stage)).toEqual({ x: 90, y: 70, w: 220, h: 130 });
  });

  it('leaves out art that touches nothing in the frame, and a sheet as big as the screen', () => {
    const apart = { x: 400, y: 10, w: 20, h: 20 };
    const sheet = { x: -5, y: -5, w: 490, h: 330 };
    expect(frameAround(backdrop, [apart, sheet], stage)).toEqual(backdrop);
  });
});
