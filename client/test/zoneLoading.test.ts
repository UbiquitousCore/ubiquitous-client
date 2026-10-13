import { describe, expect, it } from 'vitest';
import {
  buildStep,
  characterAppearanceRequest,
  fogAccent,
  soundscapePoint,
  stageProgress,
  type BuildReading,
} from '../src/app/helpers/world/zoneLoading';
import type { CharacterSummary } from '../src/net/GameConnection';

describe('fogAccent', () => {
  it('turns 0..1 channels into a CSS colour, rounding', () => {
    expect(fogAccent([0, 0.5, 1])).toBe('rgb(0, 128, 255)');
    expect(fogAccent([0.2, 0.4, 0.6])).toBe('rgb(51, 102, 153)');
  });
});

describe('soundscapePoint', () => {
  const zone = { mapId: 3, centre: [10, 20] as [number, number] };

  it('is the arrival point when the server put the hero on this map', () => {
    expect(soundscapePoint(zone, { mapId: 3, position: [1, 99, 2] })).toEqual([1, 2]);
  });

  it('is the zone’s centre for another map, or none', () => {
    expect(soundscapePoint(zone, { mapId: 4, position: [1, 99, 2] })).toEqual([10, 20]);
    expect(soundscapePoint(zone, null)).toEqual([10, 20]);
  });
});

describe('characterAppearanceRequest', () => {
  it('asks for the body the character was made with, and what it wears', () => {
    const character = {
      displayInfoId: 7,
      race: 2,
      gender: 1,
      appearance: { skin: 3, face: 4, hairStyle: 5, hairColour: 6 },
      equipment: [0, 11],
    } as unknown as CharacterSummary;
    expect(characterAppearanceRequest(character)).toEqual({
      entry: 0,
      displayInfoId: 7,
      race: 2,
      gender: 1,
      skin: 3,
      face: 4,
      hairStyle: 5,
      hairColor: 6,
      equipment: [0, 11],
      animationId: 0,
    });
  });
});

describe('stageProgress', () => {
  it('says ground first, then the tiles, a fifth then half along', () => {
    expect(stageProgress('zone', 'Vale', 0)).toEqual({
      text: 'Loading Vale — ground',
      fraction: 0.2,
    });
    expect(stageProgress('tiles', 'Vale', 12)).toEqual({
      text: 'Loading Vale — 12 tiles',
      fraction: 0.5,
    });
  });
});

describe('buildStep', () => {
  const reading = (over: Partial<BuildReading> = {}): BuildReading => ({
    zoneName: 'Vale',
    entities: 40,
    attachments: 100,
    textures: 20,
    pendingAttachments: 50,
    pendingTextures: 10,
    attachedSince: 50,
    ...over,
  });

  it('is not drained while attachments wait and too few have finished', () => {
    expect(buildStep(reading(), 300).drained).toBe(false);
  });

  it('is drained when nothing waits to attach', () => {
    expect(buildStep(reading({ pendingAttachments: 0 }), 300).drained).toBe(true);
  });

  it('is drained once enough have attached, even with a queue left', () => {
    expect(buildStep(reading({ attachedSince: 300 }), 300).drained).toBe(true);
    expect(buildStep(reading({ attachedSince: 299 }), 300).drained).toBe(false);
  });

  it('names the zone and the objects, and the pending count only while there is one', () => {
    expect(buildStep(reading(), 300).text).toBe('Building Vale — 40 objects, 50 pending');
    expect(buildStep(reading({ pendingAttachments: 0 }), 300).text).toBe(
      'Building Vale — 40 objects',
    );
  });

  it('sits at 0.6 with nothing built, and at 0.95 with everything', () => {
    expect(
      buildStep(reading({ pendingAttachments: 100, pendingTextures: 20 }), 300).fraction,
    ).toBeCloseTo(0.6);
    expect(
      buildStep(reading({ pendingAttachments: 0, pendingTextures: 0 }), 300).fraction,
    ).toBeCloseTo(0.95);
  });

  it('follows the slower of attachments and textures', () => {
    // Attachments half done, textures a quarter done.
    const step = buildStep(reading({ pendingAttachments: 50, pendingTextures: 15 }), 300);
    expect(step.fraction).toBeCloseTo(0.6 + 0.35 * 0.25);
  });

  it('counts as complete what there was never any of', () => {
    expect(buildStep(reading({ attachments: 0, textures: 0 }), 300).fraction).toBeCloseTo(0.95);
  });
});
