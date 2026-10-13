/**
 * What counts as small scenery, which is drawn only to the nearer detail
 * distance. Judged from a model's height after its placement scale, and only
 * for scenery: a small creature is still a creature.
 */

import { describe, expect, it } from 'vitest';

import {
  HIDE_FADE_SECONDS,
  LANDMARK_HEIGHT,
  SMALL_SCENERY_HEIGHT,
  isLandmark,
  isSmallScenery,
  stepFade,
} from '../src/renderer/Renderer';

describe('isSmallScenery', () => {
  it('takes knee-high scenery and leaves a person-sized prop', () => {
    expect(isSmallScenery('static', 0.6, 1)).toBe(true);
    expect(isSmallScenery('scenery', SMALL_SCENERY_HEIGHT - 0.01, 1)).toBe(true);
    expect(isSmallScenery('static', 2.4, 1)).toBe(false);
  });

  it('scales the height by the placement, so a scaled-up tuft is not small', () => {
    expect(isSmallScenery('static', 0.8, 3)).toBe(false);
    expect(isSmallScenery('static', 3, 0.25)).toBe(true);
    expect(isSmallScenery('static', 0.8, -1)).toBe(true);
  });

  it('never applies to bodies, or to a model with no height', () => {
    expect(isSmallScenery('creature', 0.5, 1)).toBe(false);
    expect(isSmallScenery('player', 0.5, 1)).toBe(false);
    expect(isSmallScenery('static', undefined, 1)).toBe(false);
  });
});

describe('isLandmark', () => {
  it('takes tall scenery and nothing that is not scenery', () => {
    expect(isLandmark('static', LANDMARK_HEIGHT, 1)).toBe(true);
    expect(isLandmark('scenery', 4, 3)).toBe(true);
    expect(isLandmark('static', LANDMARK_HEIGHT - 0.01, 1)).toBe(false);
    expect(isLandmark('creature', 30, 1)).toBe(false);
    expect(isLandmark('static', undefined, 1)).toBe(false);
  });

  it('never calls the same model both small and a landmark', () => {
    for (let h = 0.1; h < 40; h += 0.7) {
      expect(isSmallScenery('static', h, 1) && isLandmark('static', h, 1)).toBe(false);
    }
  });
});

describe('stepFade', () => {
  it('crosses the whole range in exactly the fade time and clamps at the ends', () => {
    expect(stepFade(1, false, HIDE_FADE_SECONDS)).toBe(0);
    expect(stepFade(0, true, HIDE_FADE_SECONDS)).toBe(1);
    expect(stepFade(0.5, true, HIDE_FADE_SECONDS / 2)).toBeCloseTo(1, 10);
    expect(stepFade(0.2, false, 10)).toBe(0);
    expect(stepFade(0.9, true, 10)).toBe(1);
  });

  it('moves toward the target a little each frame', () => {
    const step = stepFade(1, false, HIDE_FADE_SECONDS / 7);
    expect(step).toBeLessThan(1);
    expect(step).toBeGreaterThan(0.8);
  });
});
