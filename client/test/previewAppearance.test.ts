import { describe, expect, it } from 'vitest';

import { previewAppearanceFor } from '../src/app/features/frontEnd/previewAppearance';

describe('previewAppearanceFor', () => {
  it('maps a PreviewLook into the networkAppearance request shape', () => {
    const appearance = previewAppearanceFor({
      race: 4,
      gender: 1,
      displayInfoId: 902,
      skin: 3,
      face: 2,
      hairStyle: 7,
      hairColour: 5,
      equipment: [101, 202],
    });

    expect(appearance).toEqual({
      entry: 0,
      displayInfoId: 902,
      race: 4,
      gender: 1,
      skin: 3,
      face: 2,
      hairStyle: 7,
      hairColor: 5,
      equipment: [101, 202],
      animationId: 0,
    });
  });

  it('uses an empty equipment list when the look has none', () => {
    const appearance = previewAppearanceFor({
      race: 1,
      gender: 0,
      displayInfoId: 7,
      skin: 0,
      face: 0,
      hairStyle: 0,
      hairColour: 0,
    });
    expect(appearance.equipment).toEqual([]);
  });
});
