/**
 * The graphics slider: one number in, the renderer's and the streamer's
 * budgets out.
 *
 * The properties that matter are the ones a wrong profile would break
 * visibly: the middle of the slider must be exactly what the client drew
 * before it had a slider, the ground must always reach the fog, and moving
 * the slider up must never buy less of anything.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_GRAPHICS,
  DEFAULT_OVERRIDES,
  DEFAULT_QUALITY,
  MAX_VIEW_DISTANCE,
  MIN_RENDER_SCALE,
  MIN_VIEW_DISTANCE,
  QUALITY_ANCHORS,
  TILE_EDGE_SLACK,
  clampQuality,
  clampRenderScale,
  clampViewDistance,
  describeProfile,
  fitUiScale,
  uiPictureScale,
  graphicsProfile,
  oddTileWindow,
  qualityName,
  resolveGraphics,
  tileWindowFor,
  isShadowChoice,
} from '../src/core/graphics';
import type { ShadowMode } from '../src/core/graphics';
import { DEFAULT_TILE_WINDOW } from '../src/world/TileStreamer';
import { TILE_SIZE } from '../src/world/Terrain';

const STEPS = Array.from({ length: 21 }, (_, i) => i / 20);

/** Cheapest first, so "only ever buys more going up" has a direction. */
const SHADOW_ORDER: readonly ShadowMode[] = ['baked', 'blob', 'realtime'];

describe('graphicsProfile', () => {
  it('reproduces the pre-slider budgets at the default position', () => {
    // The default rung's values. Moving them is a fidelity decision, not a
    // refactor.
    expect(graphicsProfile(DEFAULT_QUALITY)).toEqual({
      drawDistance: 240,
      // Small scenery draws as far as everything else from Balanced up.
      detailDistance: 240,
      drawBudget: 3000,
      animationDistance: 60,
      effectDistance: 120,
      tileWindow: 7,
      pixelRatio: 1.5,
      renderScale: 1,
      anisotropy: 4,
      shadows: 'blob',
      antialias: true,
      foliageCutout: true,
      water: 'soft',
      attachesPerFrame: 16,
    });
    expect(DEFAULT_GRAPHICS).toEqual(graphicsProfile(DEFAULT_QUALITY));
    expect(DEFAULT_TILE_WINDOW).toBe(DEFAULT_GRAPHICS.tileWindow);
  });

  it('hits each anchor exactly at its position', () => {
    for (const anchor of QUALITY_ANCHORS) {
      expect(graphicsProfile(anchor.at)).toMatchObject(anchor.profile);
    }
  });

  it('never buys less of anything as the slider goes up', () => {
    let previous = graphicsProfile(0);
    for (const q of STEPS.slice(1)) {
      const next = graphicsProfile(q);
      for (const key of Object.keys(next) as Array<keyof typeof next>) {
        const a = next[key];
        const b = previous[key];
        if (typeof a === 'number' && typeof b === 'number') expect(a).toBeGreaterThanOrEqual(b);
        // The stepped parts only ever buy more going up: shadows go baked to
        // blob and stay, cut-out foliage gives way to blended and stays blended.
        else if (key === 'shadows') {
          expect(SHADOW_ORDER.indexOf(a as ShadowMode)).toBeGreaterThanOrEqual(
            SHADOW_ORDER.indexOf(b as ShadowMode),
          );
        } else if (key === 'foliageCutout') expect(!(b === false && a === true)).toBe(true);
        // Water goes plain to soft and stays: the softer surface churns two
        // passes of the ripple map and fades its own shoreline.
        else if (key === 'water') expect(!(b === 'soft' && a === 'plain')).toBe(true);
        else expect(a).toBe(b);
      }
      previous = next;
    }
  });

  it('keeps small scenery inside the draw distance and filtering a power of two', () => {
    for (const q of STEPS) {
      const p = graphicsProfile(q);
      expect(p.detailDistance).toBeLessThanOrEqual(p.drawDistance);
      expect([1, 2, 4, 8, 16]).toContain(p.anisotropy);
    }
  });

  it('keeps the ground reaching the fog at every position', () => {
    for (const q of STEPS) {
      const p = graphicsProfile(q);
      const edge = (p.tileWindow * TILE_SIZE) / 2;
      expect(edge).toBeGreaterThanOrEqual(p.drawDistance - TILE_EDGE_SLACK);
      expect(p.tileWindow % 2).toBe(1);
      expect(p.tileWindow).toBeGreaterThanOrEqual(3);
    }
  });

  it('rounds every count to a whole number', () => {
    for (const q of STEPS) {
      const p = graphicsProfile(q);
      for (const key of [
        'drawDistance',
        'drawBudget',
        'animationDistance',
        'effectDistance',
        'tileWindow',
        'attachesPerFrame',
      ] as const) {
        expect(Number.isInteger(p[key])).toBe(true);
      }
    }
  });

  it('clamps a position outside the slider to its ends', () => {
    expect(graphicsProfile(-1)).toEqual(graphicsProfile(0));
    expect(graphicsProfile(2)).toEqual(graphicsProfile(1));
  });

  it('treats a value that is not a number as the default', () => {
    expect(clampQuality(Number.NaN)).toBe(DEFAULT_QUALITY);
    expect(clampQuality(Number.POSITIVE_INFINITY)).toBe(DEFAULT_QUALITY);
    expect(graphicsProfile(Number.NaN)).toEqual(DEFAULT_GRAPHICS);
  });
});

describe('tileWindowFor', () => {
  it('is odd, at least 3, and covers the draw distance less the slack', () => {
    for (let d = 0; d <= 600; d += 8) {
      const n = tileWindowFor(d);
      expect(n % 2).toBe(1);
      expect(n).toBeGreaterThanOrEqual(3);
      expect((n * TILE_SIZE) / 2).toBeGreaterThanOrEqual(d - TILE_EDGE_SLACK);
    }
  });

  it('gives the window this client has always used for its default draw distance', () => {
    expect(tileWindowFor(240)).toBe(7);
  });
});

describe('oddTileWindow', () => {
  it('forces even up to odd and nothing below 3', () => {
    expect(oddTileWindow(4)).toBe(5);
    expect(oddTileWindow(7)).toBe(7);
    expect(oddTileWindow(1)).toBe(3);
    expect(oddTileWindow(6.9)).toBe(7);
  });
});

describe('qualityName', () => {
  it('names the nearest anchor', () => {
    expect(qualityName(0)).toBe('Low');
    expect(qualityName(0.2)).toBe('Low');
    expect(qualityName(0.5)).toBe('Balanced');
    expect(qualityName(0.7)).toBe('Balanced');
    expect(qualityName(1)).toBe('High');
  });
});

describe('describeProfile', () => {
  it('states the distances a player would notice', () => {
    const text = describeProfile(DEFAULT_GRAPHICS);
    expect(text).toContain('240');
    expect(text).toContain('7 × 7');
  });
});

describe('resolveGraphics', () => {
  it('is the slider alone when every switch is at its default', () => {
    expect(resolveGraphics(0.5, DEFAULT_OVERRIDES)).toEqual(DEFAULT_GRAPHICS);
  });

  it('takes shadows, foliage and the small-scenery distance from the slider alone', () => {
    // Low: no shadows, cut-out foliage, knee-high scenery close by only.
    const low = resolveGraphics(0, DEFAULT_OVERRIDES);
    expect(low.shadows).toBe('baked');
    expect(low.foliageCutout).toBe(true);
    expect(low.detailDistance).toBe(60);
    // Balanced and above: small scenery draws as far as everything else.
    const mid = resolveGraphics(0.5, DEFAULT_OVERRIDES);
    expect(mid.shadows).toBe('blob');
    expect(mid.detailDistance).toBe(mid.drawDistance);
    // High: blended foliage, the softer and dearer edge.
    const high = resolveGraphics(1, DEFAULT_OVERRIDES);
    expect(high.foliageCutout).toBe(false);
    expect(high.detailDistance).toBe(high.drawDistance);
  });

  it('switches the on/off parts at the midpoints between names', () => {
    expect(resolveGraphics(0.24, DEFAULT_OVERRIDES).shadows).toBe('baked');
    expect(resolveGraphics(0.26, DEFAULT_OVERRIDES).shadows).toBe('blob');
    expect(resolveGraphics(0.74, DEFAULT_OVERRIDES).foliageCutout).toBe(true);
    expect(resolveGraphics(0.76, DEFAULT_OVERRIDES).foliageCutout).toBe(false);
  });

  it('carries the two controls through and clamps the render scale', () => {
    const p = resolveGraphics(1, { renderScale: 0.1, antialias: false, shadowMode: 'auto' });
    expect(p.renderScale).toBe(MIN_RENDER_SCALE);
    expect(p.antialias).toBe(false);
    // The slider never picks real time; the choice beside it does, and it
    // can also turn shadows down below what the slider would give.
    expect(p.shadows).toBe('blob');
    expect(resolveGraphics(1, { ...DEFAULT_OVERRIDES, shadowMode: 'realtime' }).shadows).toBe(
      'realtime',
    );
    expect(resolveGraphics(1, { ...DEFAULT_OVERRIDES, shadowMode: 'baked' }).shadows).toBe('baked');
    expect(isShadowChoice('blob')).toBe(true);
    expect(isShadowChoice('soft')).toBe(false);
    expect(clampRenderScale(Number.NaN)).toBe(1);
    expect(clampRenderScale(3)).toBe(1);
  });

  it('follows the slider when the view distance is auto, or missing entirely', () => {
    expect(resolveGraphics(1, DEFAULT_OVERRIDES).drawDistance).toBe(
      graphicsProfile(1).drawDistance,
    );
    // An overrides object built before this field existed — an old save, a
    // stale caller — has `viewDistance` as `undefined`. That must read as
    // "auto" too, not as a distance of zero.
    const stale = { renderScale: 1, antialias: true, shadowMode: 'auto' as const };
    expect(resolveGraphics(1, stale).drawDistance).toBe(graphicsProfile(1).drawDistance);
  });

  it('overrides both draw and detail distance together when set, clamped to its range', () => {
    const p = resolveGraphics(0, { ...DEFAULT_OVERRIDES, viewDistance: 200 });
    expect(p.drawDistance).toBe(200);
    expect(p.detailDistance).toBe(200);
    expect(p.tileWindow).toBe(tileWindowFor(200));
    // Clamped at both ends.
    expect(resolveGraphics(0, { ...DEFAULT_OVERRIDES, viewDistance: 1 }).drawDistance).toBe(
      MIN_VIEW_DISTANCE,
    );
    expect(resolveGraphics(0, { ...DEFAULT_OVERRIDES, viewDistance: 10_000 }).drawDistance).toBe(
      MAX_VIEW_DISTANCE,
    );
    expect(clampViewDistance(Number.NaN)).toBeGreaterThanOrEqual(MIN_VIEW_DISTANCE);
  });
});

describe('uiPictureScale', () => {
  it('draws as fine as the display shows, on a 1x and a 2x screen', () => {
    expect(uiPictureScale(2, 1)).toBe(2);
    expect(uiPictureScale(2, 2)).toBe(4);
  });

  it('draws for at most a 2x screen, so a 3x phone is not drawn finer than the 3D view', () => {
    expect(uiPictureScale(1.2, 3)).toBe(uiPictureScale(1.2, 2));
  });

  it('rounds up to half steps, and never past the finest scale', () => {
    expect(uiPictureScale(1.2, 2)).toBe(2.5);
    expect(uiPictureScale(1.05, 1)).toBe(1.5);
    expect(uiPictureScale(4, 2)).toBe(4);
  });

  it('takes a missing pixel ratio as 1', () => {
    expect(uiPictureScale(2, 0)).toBe(2);
  });
});

describe('fitUiScale', () => {
  it('keeps the setting where the stage already fits', () => {
    expect(fitUiScale(2, 1920, 1080)).toBe(2);
    expect(fitUiScale(2, 960, 640)).toBe(2);
  });

  it('shrinks to the stage fitting a phone held sideways', () => {
    expect(fitUiScale(2, 844, 390)).toBeCloseTo(1.2, 5);
  });

  it('shrinks to the width on a phone held upright', () => {
    expect(fitUiScale(2, 390, 844)).toBeCloseTo(0.8, 5);
  });

  it('never grows past the setting, and reads an unmeasured viewport as no limit', () => {
    expect(fitUiScale(1, 3840, 2160)).toBe(1);
    expect(fitUiScale(2, 0, 0)).toBe(2);
  });
});
