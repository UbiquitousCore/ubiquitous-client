/**
 * Which dais a character is stood on before the world loads.
 *
 * The selection map holds two placements of the piece the screens stand
 * a character on, and only one of them is meant: the other is sunk into
 * the village with houses and trees packed round it, and a character put
 * there is left standing in a treetop. The one in the open is the stand.
 */

import { describe, expect, it } from 'vitest';

import { clearestStand, type DaisStanding } from '../src/renderer/SelectionScene';
import { resourceKey, tileId } from '../src/assets/ids';
import type { Placement } from '../src/assets/types';

function standing(model: string, at: [number, number, number]): Placement {
  return {
    model,
    position: at,
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    entry: 0,
    kind: 'scenery',
  };
}

/** `count` things stood close enough to a dais to be in the way of it. */
function crowd(around: Placement, count: number): Placement[] {
  return Array.from({ length: count }, (_, n) =>
    standing(`model/scene/nature/tree${n}.bdae`, [
      around.position[0] + (n % 5) - 2,
      around.position[1],
      around.position[2] + Math.floor(n / 5) - 2,
    ]),
  );
}

describe('the dais a character is stood on', () => {
  // The two the human selection map holds, where the build puts them.
  const inTheVillage = standing('model/scene/build/human/human_selection.bdae', [58.6, 4, 44.8]);
  const inTheOpen = standing(
    'model/scene/build/human/human_selection01.bdae',
    [232.8, 15.2, 214.8],
  );

  const candidates: DaisStanding[] = [
    { dais: inTheVillage, tile: [0, 0], near: [inTheVillage, ...crowd(inTheVillage, 44)] },
    { dais: inTheOpen, tile: [3, 3], near: [inTheOpen, ...crowd(inTheOpen, 2)] },
  ];

  it('is the one with room around it, not the first one found', () => {
    const chosen = clearestStand(candidates, [0, 0]);
    expect(chosen?.dais).toBe(inTheOpen);
    expect(chosen?.tile).toEqual([3, 3]);
  });

  it('is still the one with room when the search starts beside the other', () => {
    // The build that lists this map starts the search from the middle of
    // the zone; the one that does not starts from the map's corner. The
    // answer may not depend on which.
    expect(clearestStand(candidates, [58, 44])?.dais).toBe(inTheOpen);
  });

  it('is the nearer of two that are as clear as each other', () => {
    const far = standing('model/scene/build/human/human_selection.bdae', [400, 0, 400]);
    const near = standing('model/scene/build/human/human_selection.bdae', [10, 0, 10]);
    const both: DaisStanding[] = [
      { dais: far, tile: [6, 6], near: [far] },
      { dais: near, tile: [0, 0], near: [near] },
    ];
    expect(clearestStand(both, [0, 0])?.dais).toBe(near);
  });

  it('is nothing at all where the map holds none', () => {
    expect(clearestStand([], [0, 0])).toBeNull();
  });
});

describe('a tile asked for by the world it belongs to', () => {
  it('is kept apart from a tile of the same number on a listed map', () => {
    expect(resourceKey(tileId(-1, 3, 3, 'human_selection'))).not.toBe(
      resourceKey(tileId(-1, 3, 3)),
    );
  });

  it('is the same tile however often it is asked for', () => {
    expect(resourceKey(tileId(-1, 3, 3, 'human_selection'))).toBe(
      resourceKey(tileId(-1, 3, 3, 'human_selection')),
    );
  });
});
