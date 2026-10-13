/**
 * What redraws the sun's shadow map, and when the distance hiding rechecks.
 * Both are per-frame gates over work that costs a full scene pass, so both
 * are pure rules with tests before the loop that reads them.
 */

import { describe, expect, it } from 'vitest';

import { hideRecheckDue, shadowMapNeedsUpdate } from '../src/renderer/Renderer';

describe('shadowMapNeedsUpdate', () => {
  it('redraws when the frustum moved or the scene is alive', () => {
    expect(shadowMapNeedsUpdate(true, false, 1)).toBe(true);
    expect(shadowMapNeedsUpdate(false, true, 1)).toBe(true);
  });

  it('otherwise redraws only on the safety net', () => {
    expect(shadowMapNeedsUpdate(false, false, 1)).toBe(false);
    expect(shadowMapNeedsUpdate(false, false, 119)).toBe(false);
    expect(shadowMapNeedsUpdate(false, false, 120)).toBe(true);
  });
});

describe('hideRecheckDue', () => {
  it('always rechecks on a moved eye, so a teleport never shows the old radius', () => {
    expect(hideRecheckDue(1000, 1000, true, false)).toBe(true);
    expect(hideRecheckDue(1000, 900, true, true)).toBe(true);
  });

  it('never rechecks clean work', () => {
    expect(hideRecheckDue(1000, 0, false, false)).toBe(false);
  });

  it('holds dirty rechecks to the interval', () => {
    expect(hideRecheckDue(1000, 900, false, true)).toBe(false);
    expect(hideRecheckDue(1150, 900, false, true)).toBe(true);
  });
});
