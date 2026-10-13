import { describe, expect, it } from 'vitest';

import { guessKind, inventoryBriefs, takeInventory } from '../../src/ui/art/pieceInventory';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  tx,
  ty,
});

const place = (characterId: number, tx: number, ty: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(tx, ty),
  name,
  opacity: 1,
});

const box = (id: number, w: number, h: number): UiSkinData['shapes'][number] => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});

/** A dialog holding a well and a button, plus one piece placed on its own. */
function movie(): UiSkinData {
  return {
    movie: 'TEST',
    width: 800,
    height: 600,
    background: null,
    exports: [],
    shapes: [box(11, 400, 400), box(12, 40, 30), box(13, 24, 24), box(14, 60, 20)],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'windowBack'),
            place(21, 20, 20, 'cell01'),
            place(22, 20, 80, 'closeControl'),
          ],
        ],
      },
      { id: 21, frameCount: 1, frames: [[place(12, 0, 0, 'well')]] },
      { id: 22, frameCount: 1, frames: [[place(13, 0, 0, 'face')]] },
      { id: 23, frameCount: 1, frames: [[place(14, 0, 0, 'strip')]] },
    ],
    edits: [],
    root: [[place(20, 100, 100, 'windowOne'), place(23, 700, 10, 'looseArt')]],
  };
}

describe('takeInventory', () => {
  it('groups every piece under the screen it belongs to', () => {
    const inventory = takeInventory(movie());
    const bag = inventory.screens.find(s => s.name === 'windowOne');
    expect(bag).toBeDefined();
    expect(bag?.pieces.map(p => p.name).sort()).toEqual([
      'cell01',
      'closeControl',
      'face',
      'well',
      'windowBack',
      'windowOne',
    ]);
    // Deeper pieces belong to the screen, not to their immediate holder.
    expect(inventory.screens.find(s => s.name === 'cell01')).toBeUndefined();
  });

  it('keeps a piece that merely names its own art out of the screens', () => {
    // Two parts under a name that is not a dialog is a piece, not a
    // screen: planning it as one would put a bar on the task list next to
    // the bag.
    const inventory = takeInventory(movie());
    expect(inventory.loose.map(p => p.name).sort()).toEqual(['looseArt', 'strip']);
  });

  it('measures each piece and names the art it needs', () => {
    const m = movie();
    m.shapes[1].fills = [
      { kind: 'bitmap', repeating: false, imageId: 5, art: 'wells.png', matrix: at(0, 0) },
    ];
    const inventory = takeInventory(m);
    const well = inventory.screens[0].pieces.find(p => p.name === 'cell01');
    expect(well).toMatchObject({ width: 40, height: 30, paths: 1, art: ['wells.png'] });
  });

  it('counts what the movie names against what actually draws', () => {
    const m = movie();
    // A container that places nothing is named, but draws nothing.
    m.sprites.push({ id: 24, frameCount: 1, frames: [[]] });
    m.root[0].push(place(24, 0, 0, 'emptyHolder'));
    const inventory = takeInventory(m);
    expect(inventory.total).toBe(inventory.drawn + 1);
  });

  it('survives a piece that holds itself', () => {
    const m = movie();
    m.sprites[1].frames[0].push(place(20, 0, 0, 'windowOne'));
    expect(() => takeInventory(m)).not.toThrow();
  });
});

describe('guessKind', () => {
  it('reads the name first', () => {
    expect(guessKind('btnWhatever', 20, 20)).toBe('button');
    expect(guessKind('cell03', 40, 30)).toBe('well');
    expect(guessKind('windowOne', 40, 30)).toBe('screen');
  });

  it('falls back to the shape', () => {
    expect(guessKind('thing', 400, 400)).toBe('screen');
    expect(guessKind('thing', 400, 40)).toBe('frame');
    expect(guessKind('thing', 24, 24)).toBe('icon');
    expect(guessKind('thing', 150, 20)).toBe('bar');
    expect(guessKind('thing', 80, 60)).toBe('art');
  });
});

describe('inventoryBriefs', () => {
  it('writes one section per screen, with its pieces and a checklist', () => {
    const text = inventoryBriefs(takeInventory(movie()));
    expect(text).toContain('## windowOne');
    expect(text).toContain('| cell01 |');
    expect(text).toContain('Wells: 1');
    expect(text).toContain('never drawn from the movie');
  });
});

describe('the stage', () => {
  it('is not a screen, and its children are', () => {
    // A movie may place everything inside one instance covering the whole
    // stage. Rolling the dialogs into it reports one screen with the
    // entire interface in it, which nobody can plan from.
    const m = movie();
    const stage: UiSkinData['sprites'][number] = {
      id: 30,
      frameCount: 1,
      frames: [[place(20, 0, 0, 'windowOne'), place(23, 700, 10, 'looseArt')]],
    };
    m.shapes.push(box(15, 800, 600));
    stage.frames[0].push(place(15, 0, 0, 'stageArt'));
    m.sprites.push(stage);
    m.root = [[place(30, 0, 0, 'wholeMovie')]];

    const inventory = takeInventory(m);
    expect(inventory.screens.map(s => s.name)).toContain('windowOne');
    expect(inventory.screens.map(s => s.name)).not.toContain('wholeMovie');
  });
});
