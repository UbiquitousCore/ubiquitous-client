/** @vitest-environment happy-dom */
/**
 * The settings store: what a reload gets back, and what a corrupt or stale
 * saved value is allowed to do to it (nothing, field by field).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  OPTIONS_STORAGE_KEY,
  defaultOptions,
  options,
  parseOptions,
  setOption,
  setOptions,
} from '../../src/ui/optionsStore';
import { DEFAULT_FOG } from '../../src/core/graphics';
import { resetOptions } from '../helpers/stores';

beforeEach(resetOptions);
afterEach(resetOptions);

describe('parseOptions', () => {
  it('returns the defaults for anything that is not a record', () => {
    const fallback = defaultOptions();
    expect(parseOptions(null, fallback)).toEqual(fallback);
    expect(parseOptions('nonsense', fallback)).toEqual(fallback);
    expect(parseOptions(42, fallback)).toEqual(fallback);
  });

  it('reverts one bad field without touching the good ones', () => {
    const fallback = defaultOptions();
    const parsed = parseOptions(
      { damageNumbers: 'yes', diagnostics: true, quality: 0.75 },
      fallback,
    );
    expect(parsed.damageNumbers).toBe(fallback.damageNumbers);
    expect(parsed.diagnostics).toBe(true);
    expect(parsed.quality).toBe(0.75);
  });

  it('clamps a quality outside the slider and drops one that is not a number', () => {
    const fallback = defaultOptions();
    expect(parseOptions({ quality: 7 }, fallback).quality).toBe(1);
    expect(parseOptions({ quality: -2 }, fallback).quality).toBe(0);
    expect(parseOptions({ quality: 'high' }, fallback).quality).toBe(fallback.quality);
  });

  it('checks the two controls beside the slider the same way', () => {
    const fallback = defaultOptions();
    const parsed = parseOptions({ renderScale: 0.2, antialias: false }, fallback);
    expect(parsed.renderScale).toBe(0.5);
    expect(parsed.antialias).toBe(false);
    expect(parseOptions({ antialias: 'no' }, fallback).antialias).toBe(fallback.antialias);
    expect(parseOptions({ shadowMode: 'realtime' }, fallback).shadowMode).toBe('realtime');
    expect(parseOptions({ keybinds: { forward: ['E'] } }, fallback).keybinds.forward).toEqual([
      'e',
    ]);
    expect(parseOptions({ keybinds: 'no' }, fallback).keybinds).toEqual(fallback.keybinds);
    expect(parseOptions({ shadowMode: 'soft' }, fallback).shadowMode).toBe(fallback.shadowMode);
  });

  it('keeps a known tone mapping, drops a removed setting, and reverts anything else', () => {
    const fallback = defaultOptions();
    expect(fallback.toneMapping).toBe('none');
    const parsed = parseOptions({ bloom: true, toneMapping: 'agx' }, fallback);
    expect(parsed.toneMapping).toBe('agx');
    expect('bloom' in parsed).toBe(false);
    expect(parseOptions({ toneMapping: 'reinhard' }, fallback).toneMapping).toBe('none');
  });

  it('keeps the fog inside [0, 1], and reverts one that is not a number', () => {
    const fallback = defaultOptions();
    expect(fallback.fog).toBe(DEFAULT_FOG);
    expect(parseOptions({ fog: 0.8 }, fallback).fog).toBe(0.8);
    expect(parseOptions({ fog: 3 }, fallback).fog).toBe(1);
    expect(parseOptions({ fog: -1 }, fallback).fog).toBe(0);
    expect(parseOptions({ fog: 'thick' }, fallback).fog).toBe(DEFAULT_FOG);
  });

  it('holds the interface to whole steps inside its own range', () => {
    // How finely a worn screen is drawn is a count of pixels per movie
    // unit, not a fraction of the screen like `renderScale` beside it: a
    // fractional one lands a sheet's edges between pixels, which is how a
    // seam appears down the middle of one.
    const fallback = defaultOptions();
    expect(parseOptions({ uiScale: 9 }, fallback).uiScale).toBe(4);
    expect(parseOptions({ uiScale: 0 }, fallback).uiScale).toBe(1);
    expect(parseOptions({ uiScale: 2.6 }, fallback).uiScale).toBe(3);
    expect(parseOptions({ uiScale: 'sharp' }, fallback).uiScale).toBe(fallback.uiScale);
  });

  it('keeps a custom view distance, clamped, or falls back to auto', () => {
    const fallback = defaultOptions();
    expect(fallback.viewDistance).toBe('auto');
    expect(parseOptions({ viewDistance: 200 }, fallback).viewDistance).toBe(200);
    expect(parseOptions({ viewDistance: 10_000 }, fallback).viewDistance).toBeLessThanOrEqual(420);
    expect(parseOptions({ viewDistance: 'auto' }, fallback).viewDistance).toBe('auto');
    expect(parseOptions({ viewDistance: 'far' }, fallback).viewDistance).toBe('auto');
  });

  it('drops switches a saved copy may carry beside the slider', () => {
    const parsed = parseOptions({ detail: 'far', shadows: false, foliageCutout: false });
    expect(parsed).not.toHaveProperty('detail');
    expect(parsed).not.toHaveProperty('shadows');
    expect(parsed).not.toHaveProperty('foliageCutout');
  });

  it('drops fields it does not know', () => {
    const parsed = parseOptions({ ...defaultOptions(), lensFlare: true }, defaultOptions());
    expect('lensFlare' in parsed).toBe(false);
  });
});

describe('setOptions', () => {
  it('applies and remembers', () => {
    setOptions({ ...options.value, quality: 0.25, touchStick: true });

    expect(options.value.quality).toBe(0.25);
    expect(options.value.touchStick).toBe(true);
    const saved = JSON.parse(localStorage.getItem(OPTIONS_STORAGE_KEY)!) as Record<string, unknown>;
    expect(saved.quality).toBe(0.25);
    expect(saved.touchStick).toBe(true);
  });

  it('cleans what it is handed, so the screen cannot store a bad value', () => {
    setOptions({ ...options.value, quality: 9 });
    expect(options.value.quality).toBe(1);
  });

  it('changes one field through setOption', () => {
    const before = options.value;
    setOption('diagnostics', true);
    expect(options.value).toEqual({ ...before, diagnostics: true });
  });
});

describe('resetOptions', () => {
  it('forgets the saved record', () => {
    setOption('quality', 1);
    resetOptions();
    expect(localStorage.getItem(OPTIONS_STORAGE_KEY)).toBeNull();
    expect(options.value).toEqual(defaultOptions());
  });
});
