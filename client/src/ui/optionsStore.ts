/** Player settings signal (screen renders, loop applies; storage validated
 * field-by-field with per-field fallback). */

import { signal } from '@preact/signals';

import {
  DEFAULT_FOG,
  DEFAULT_OVERRIDES,
  DEFAULT_QUALITY,
  DEFAULT_UI_SCALE,
  clampQuality,
  clampRenderScale,
  clampUiScale,
  clampFog,
  clampViewDistance,
  fitUiScale,
  isShadowChoice,
  isToneMapping,
} from '../core/graphics';
import type { ShadowChoice, ToneMapping } from '../core/graphics';
import { DEFAULT_KEYBINDS, parseKeybinds } from '../gameplay/keybinds';
import type { Keybinds } from '../gameplay/keybinds';

export interface OptionsState {
  music: boolean;
  sound: boolean;
  /** Floating combat text over bodies and over your own frame. */
  damageNumbers: boolean;
  /** The on-screen stick, for a device with no keyboard. */
  touchStick: boolean;
  /** The plain-text overlay `Hud` writes each frame. */
  diagnostics: boolean;
  /**
   * How much the renderer is allowed to draw, as a slider position in [0, 1].
   * `core/graphics` turns it into distances and budgets.
   */
  quality: number;
  /** Fraction of the screen's pixels rendered, in [MIN_RENDER_SCALE, 1]. */
  renderScale: number;
  /**
   * How finely a screen wearing the shipped art is drawn, in pixels per
   * movie unit. Not `renderScale`, which is the world's — see
   * `clampUiScale`.
   */
  uiScale: number;
  /** Multisampled anti-aliasing. Takes effect on the next load. */
  antialias: boolean;
  /** How shadows are drawn, or follow the slider. */
  shadowMode: ShadowChoice;
  /** How thick the zones' haze is drawn, 0..1; see `DEFAULT_FOG`. */
  fog: number;
  /** How the frame's light is fitted to the screen. */
  toneMapping: ToneMapping;
  /** How far models and grass are drawn, in world units, or follow the slider. */
  viewDistance: number | 'auto';
  /** Which key does what. */
  keybinds: Keybinds;
}

export const DEFAULT_OPTIONS: OptionsState = {
  music: true,
  sound: true,
  damageNumbers: true,
  touchStick: false,
  diagnostics: false,
  quality: DEFAULT_QUALITY,
  renderScale: DEFAULT_OVERRIDES.renderScale,
  uiScale: DEFAULT_UI_SCALE,
  antialias: DEFAULT_OVERRIDES.antialias,
  shadowMode: DEFAULT_OVERRIDES.shadowMode,
  fog: DEFAULT_FOG,
  toneMapping: 'none',
  viewDistance: DEFAULT_OVERRIDES.viewDistance ?? 'auto',
  keybinds: DEFAULT_KEYBINDS,
};

/** The `localStorage` key. Changing it forgets every saved setting. */
export const OPTIONS_STORAGE_KEY = 'ubiquitousOptions';

/** What a fresh install starts with, on this device. */
export function defaultOptions(): OptionsState {
  return {
    ...DEFAULT_OPTIONS,
    // A phone wants the stick from the first frame; a desktop never does. The
    // saved setting wins once there is one.
    touchStick:
      typeof navigator !== 'undefined' &&
      (navigator.maxTouchPoints > 0 || 'ontouchstart' in globalThis),
  };
}

/**
 * Rebuild a settings record from whatever storage held. Field by field: a
 * boolean that is not a boolean, or a quality outside [0, 1], reverts alone.
 * Unknown fields are dropped.
 */
export function parseOptions(
  raw: unknown,
  fallback: OptionsState = defaultOptions(),
): OptionsState {
  if (typeof raw !== 'object' || raw === null) return { ...fallback };
  const record = raw as Record<string, unknown>;
  const bool = (key: keyof OptionsState): boolean => {
    const value = record[key];
    return typeof value === 'boolean' ? value : (fallback[key] as boolean);
  };
  const quality = record.quality;
  const renderScale = record.renderScale;
  const uiScale = record.uiScale;
  const shadowMode = record.shadowMode;
  const viewDistance = record.viewDistance;
  return {
    music: bool('music'),
    sound: bool('sound'),
    damageNumbers: bool('damageNumbers'),
    touchStick: bool('touchStick'),
    diagnostics: bool('diagnostics'),
    antialias: bool('antialias'),
    quality: typeof quality === 'number' ? clampQuality(quality) : fallback.quality,
    renderScale:
      typeof renderScale === 'number' ? clampRenderScale(renderScale) : fallback.renderScale,
    uiScale: typeof uiScale === 'number' ? clampUiScale(uiScale) : fallback.uiScale,
    shadowMode: isShadowChoice(shadowMode) ? shadowMode : fallback.shadowMode,
    fog: typeof record.fog === 'number' ? clampFog(record.fog) : fallback.fog,
    toneMapping: isToneMapping(record.toneMapping) ? record.toneMapping : fallback.toneMapping,
    viewDistance:
      viewDistance === 'auto'
        ? 'auto'
        : typeof viewDistance === 'number'
          ? clampViewDistance(viewDistance)
          : fallback.viewDistance,
    keybinds: parseKeybinds(record.keybinds, fallback.keybinds),
  };
}

function load(): OptionsState {
  try {
    const raw = globalThis.localStorage?.getItem(OPTIONS_STORAGE_KEY);
    if (!raw) return defaultOptions();
    return parseOptions(JSON.parse(raw) as unknown);
  } catch {
    // Storage blocked, or a saved value that is not JSON. Neither is worth a
    // broken settings screen.
    return defaultOptions();
  }
}

function save(next: OptionsState): void {
  try {
    globalThis.localStorage?.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked: the setting still applies for this session.
  }
}

export const options = signal<OptionsState>(load());

/** Apply and remember a new set of settings. */
export function setOptions(next: OptionsState): void {
  const clean = parseOptions(next, options.value);
  options.value = clean;
  save(clean);
}

/** Change one setting. */
export function setOption<Key extends keyof OptionsState>(
  key: Key,
  value: OptionsState[Key],
): void {
  setOptions({ ...options.value, [key]: value });
}

export const viewport = signal({ width: 0, height: 0 });

if (typeof window !== 'undefined') {
  const measure = (): void => {
    viewport.value = { width: window.innerWidth, height: window.innerHeight };
  };
  measure();
  window.addEventListener('resize', measure);
}

export function uiScale(): number {
  const { width, height } = viewport.value;
  return fitUiScale(options.value.uiScale, width, height);
}
