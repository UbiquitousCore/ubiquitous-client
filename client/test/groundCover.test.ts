import { describe, expect, it } from 'vitest';

import { coverHeight, isGroundCover } from '../src/world/groundCover';

describe('ground cover', () => {
  it('recognises the grass models the maps place', () => {
    expect(isGroundCover('model/scene/nature/humanselection/human_grass04.bdae')).toBe(true);
    expect(isGroundCover('model/scene/nature/broadleafforest/Broadleafforest_Grass07.bdae')).toBe(
      true,
    );
    expect(
      isGroundCover('model/scene/nature/broadleafforest/broadleafforest_grass01_02.bdae'),
    ).toBe(true);
  });

  it('leaves bushes, trees and buildings where they were authored', () => {
    expect(isGroundCover('model/scene/nature/broadleafforest/broadleafforest_bush02.bdae')).toBe(
      false,
    );
    expect(isGroundCover('model/scene/build/human/building_lightwood_01.bdae')).toBe(false);
    expect(coverHeight('model/scene/build/human/other_box_01.bdae', 7, 5)).toBe(7);
  });

  it('stands a hovering blade on the terrain, and keeps its height where there is none', () => {
    const grass = 'model/scene/nature/humanselection/human_grass04.bdae';
    expect(coverHeight(grass, 6.49, 5)).toBe(5);
    expect(coverHeight(grass, 6.49, null)).toBe(6.49);
  });
});
