/**
 * The graphics slider: one [0,1] number becomes the budgets renderer and
 * streamer ration by (draw distance, tile window, etc., moving together so no
 * setting shows the world's end). Side settings (render scale, shadows, AA)
 * fold in via `resolveGraphics`. All budgets, not measurements.
 */

export interface GraphicsProfile {
  /** Model draw distance; zone fog is stretched to it so models reach full fog as they stop. */
  drawDistance: number;
  /** Where knee-high scenery stops: the cheapest thing to cut and the last missed. */
  detailDistance: number;
  /**
   * Draws allowed inside `drawDistance` before the cutoff shrinks. Draws, not
   * entities (one per mesh per material group). Measured: ~5 µs per draw.
   */
  drawBudget: number;
  /** Beyond this skeletons are not posed. Measured: ~120 bodies (~6,900 bones) cost 13.5 ms. */
  animationDistance: number;
  /** Particles simulate to here, fading over the last quarter. */
  effectDistance: number;
  /** Tiles across the ground window, odd and at least 3; derived by `tileWindowFor`. */
  tileWindow: number;
  /** Cap on the device pixel ratio the canvas is rendered at. */
  pixelRatio: number;
  /** Fraction of the capped pixel ratio rendered, (0, 1]; the browser upscales the rest. */
  renderScale: number;
  /** 1 to 16, a power of two; clamped to the GPU. */
  anisotropy: number;
  /** `baked` (art only), `blob` (one instanced draw), `realtime` (a sun shadow map, the dearest). */
  shadows: ShadowMode;
  /** Blended foliage as cut-outs, so it batches: one draw per model, not per tuft. */
  foliageCutout: boolean;
  /** Fixed at canvas creation; applies on the next load. */
  antialias: boolean;
  /** Views built per frame: a zone arrives as ~1,100 placements at once. */
  attachesPerFrame: number;
  /** Which of the build's water surfaces: plain (one ripple pass) or soft (two, with a shoreline fade). */
  water: WaterQuality;
}

/** Which water surface a setting asks for. See `GraphicsProfile.water`. */
export type WaterQuality = 'plain' | 'soft';

/** The fields the slider interpolates; the rest are switches applied on top. */
type SliderProfile = Pick<
  GraphicsProfile,
  | 'drawDistance'
  | 'detailDistance'
  | 'drawBudget'
  | 'animationDistance'
  | 'effectDistance'
  | 'pixelRatio'
  | 'anisotropy'
  | 'attachesPerFrame'
>;

/** The controls beside the slider; everything else is the slider's. */
type SwitchProfile = Pick<GraphicsProfile, 'renderScale' | 'antialias'>;

/** The controls beside the slider, and what they do to the profile. */
export interface GraphicsOverrides extends SwitchProfile {
  /** How shadows are drawn, or `auto` to take the slider's answer. */
  shadowMode: ShadowChoice;
  /** Draw distance override (default: slider answer). */
  viewDistance?: number | 'auto';
}

/** A named stop on the slider, and the budgets it stands for. */
export interface QualityAnchor {
  /** Slider position in [0, 1]. */
  at: number;
  name: string;
  profile: SliderProfile;
  /** On/off parts, taken from the nearest anchor rather than interpolated. */
  switches: AnchorSwitches;
}

export type AnchorSwitches = Pick<GraphicsProfile, 'shadows' | 'foliageCutout' | 'water'>;

export type ShadowMode = 'baked' | 'blob' | 'realtime';
/** The Settings choice: a mode, or follow the slider. */
export type ShadowChoice = 'auto' | ShadowMode;

export const SHADOW_CHOICES: ReadonlyArray<{ value: ShadowChoice; label: string }> = [
  { value: 'auto', label: 'Follow the slider' },
  { value: 'baked', label: 'Baked only' },
  { value: 'blob', label: 'Blob' },
  { value: 'realtime', label: 'Real time' },
];

export function isShadowChoice(value: unknown): value is ShadowChoice {
  return SHADOW_CHOICES.some(choice => choice.value === value);
}

/** `none` shows the colours as painted; the rest are filmic curves that roll off highlights. */
export type ToneMapping = 'none' | 'aces' | 'agx' | 'neutral';

export const TONE_MAPPINGS: ReadonlyArray<{ value: ToneMapping; label: string }> = [
  { value: 'none', label: 'None (as painted)' },
  { value: 'aces', label: 'ACES filmic' },
  { value: 'agx', label: 'AgX' },
  { value: 'neutral', label: 'Neutral' },
];

export function isToneMapping(value: unknown): value is ToneMapping {
  return TONE_MAPPINGS.some(choice => choice.value === value);
}

/** How far the draw distance may reach past the resident ground; the last stretch is fully fogged. */
export const TILE_EDGE_SLACK = 16;

/** World units along one edge of a ground tile. `core/` cannot import `world/`, so it is restated here and pinned equal by test. */
const TILE_UNITS = 64;

/** Odd and at least 3, so the player has a centre tile. */
export function oddTileWindow(wanted: number): number {
  const whole = Math.floor(wanted);
  return Math.max(3, whole % 2 === 0 ? whole + 1 : whole);
}

/** The smallest window whose edge, half its width out, reaches within `TILE_EDGE_SLACK` of the draw distance. */
export function tileWindowFor(drawDistance: number): number {
  const halfTiles = (drawDistance - TILE_EDGE_SLACK) / TILE_UNITS;
  return oddTileWindow(Math.ceil(halfTiles * 2));
}

export const QUALITY_ANCHORS: ReadonlyArray<QualityAnchor> = [
  {
    at: 0,
    name: 'Low',
    // Only baked shadows, cut-out foliage, and knee-high scenery only close by.
    switches: { shadows: 'baked', foliageCutout: true, water: 'plain' },
    profile: {
      drawDistance: 120,
      detailDistance: 60,
      drawBudget: 1200,
      animationDistance: 30,
      effectDistance: 60,
      pixelRatio: 1,
      anisotropy: 1,
      attachesPerFrame: 8,
    },
  },
  {
    at: 0.5,
    name: 'Balanced',
    // A nearer small-scenery cutoff makes fences and headstones vanish while still readable.
    switches: { shadows: 'blob', foliageCutout: true, water: 'soft' },
    profile: {
      drawDistance: 240,
      detailDistance: 240,
      drawBudget: 3000,
      animationDistance: 60,
      effectDistance: 120,
      // Full retina is 4x the pixels; 1.5x reads the
      // same in motion at 9/16 the traffic, on phones most of all.
      pixelRatio: 1.5,
      anisotropy: 4,
      attachesPerFrame: 16,
    },
  },
  {
    // Measured: 360 units, 6,000 draws and an 11-tile window held about 15 fps
    // (4,500 draws over 113 tiles), so the frame is scenery-bound. 300 units
    // is a 9-tile window.
    at: 1,
    name: 'High',
    // Blended foliage edges: softer, and paid for. Real-time shadows are not
    // the slider's to switch on — they are a choice beside it.
    switches: { shadows: 'blob', foliageCutout: false, water: 'soft' },
    profile: {
      drawDistance: 300,
      detailDistance: 300,
      drawBudget: 4000,
      animationDistance: 120,
      effectDistance: 180,
      // Below full retina on a 2x screen: the frame scales with pixels,
      // and 1.5x is 9/16 the traffic.
      pixelRatio: 1.5,
      anisotropy: 16,
      attachesPerFrame: 32,
    },
  },
];

/** Where the slider sits until someone moves it. */
export const DEFAULT_QUALITY = 0.5;

/** The least a render scale may be. Below half, text and edges stop being readable. */
export const MIN_RENDER_SCALE = 0.5;

/** The view-distance override reaches past either end of the slider. */
export const MIN_VIEW_DISTANCE = 60;
export const MAX_VIEW_DISTANCE = 420;

export const DEFAULT_OVERRIDES: GraphicsOverrides = {
  renderScale: 1,
  antialias: true,
  shadowMode: 'auto',
  viewDistance: 'auto',
};

/**
 * Haze thickness: 0 stretches it most of the way to the draw distance, 1
 * keeps each zone's own. Own choice, by the owner beside the game: the
 * zone's own distances come closer to its haze than any stretch.
 */
export const DEFAULT_FOG = 1;

/** A fog setting kept to [0, 1]; anything not a number is the default. */
export function clampFog(fog: number): number {
  if (!Number.isFinite(fog)) return DEFAULT_FOG;
  return Math.min(1, Math.max(0, fog));
}

export function clampViewDistance(distance: number): number {
  if (!Number.isFinite(distance)) return QUALITY_ANCHORS[1]!.profile.drawDistance;
  return Math.min(MAX_VIEW_DISTANCE, Math.max(MIN_VIEW_DISTANCE, distance));
}

/** The anchor whose name a slider position is closest to. */
export function nearestAnchor(quality: number): QualityAnchor {
  const q = clampQuality(quality);
  let best = QUALITY_ANCHORS[0]!;
  for (const anchor of QUALITY_ANCHORS) {
    if (Math.abs(anchor.at - q) < Math.abs(best.at - q)) best = anchor;
  }
  return best;
}

/** Clamp a slider value into [0, 1], treating anything unusable as the default. */
export function clampQuality(quality: number): number {
  if (!Number.isFinite(quality)) return DEFAULT_QUALITY;
  return Math.min(1, Math.max(0, quality));
}

/** Clamp a render scale into its range, treating anything unusable as full size. */
export function clampRenderScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(1, Math.max(MIN_RENDER_SCALE, scale));
}

/**
 * Pixels per movie unit for worn screens: the interface's own scale, not
 * `renderScale`, so it stays crisp. Whole numbers only: a fraction puts
 * edges between pixels and seams down tiled sheets.
 */
export const MIN_UI_SCALE = 1;
export const MAX_UI_SCALE = 4;
export const DEFAULT_UI_SCALE = 2;

const STAGE_UNITS = { width: 480, height: 320 };

/** Own choice: fit steps, fine enough to use the room and coarse enough to keep edges on whole pixels. */
const FIT_STEP = 0.05;

/** The setting, held down so the whole stage fits: at the default 2x a phone is shorter than it. */
export function fitUiScale(setting: number, viewportWidth: number, viewportHeight: number): number {
  const wanted = clampUiScale(setting);
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) return wanted;
  const room = Math.min(viewportWidth / STAGE_UNITS.width, viewportHeight / STAGE_UNITS.height);
  const fitted = Math.floor(room / FIT_STEP) * FIT_STEP;
  return Math.max(FIT_STEP, Math.min(wanted, fitted));
}

/** Own choice: pictures are drawn for at most a 2x screen, as the 3D view is. */
const MAX_PICTURE_DPR = 2;
/** Own choice: half steps, so a resize redraws a picture only when the need moves a real amount. */
const PICTURE_STEP = 0.5;

/**
 * Picture pixels per movie unit for a screen shown at `fitted` CSS pixels per
 * unit: what the display shows, so no finer than it can, rounded up to a step.
 */
export function uiPictureScale(fitted: number, devicePixelRatio: number): number {
  const dpr = Math.min(MAX_PICTURE_DPR, Math.max(1, devicePixelRatio || 1));
  const needed = Math.ceil((fitted * dpr) / PICTURE_STEP) * PICTURE_STEP;
  return Math.min(MAX_UI_SCALE, Math.max(PICTURE_STEP, needed));
}

export function clampUiScale(scale: number): number {
  if (!Number.isFinite(scale)) return DEFAULT_UI_SCALE;
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, Math.round(scale)));
}

/** Round to the nearest power of two in [1, 16], which is what a GPU accepts. */
function anisotropyStep(level: number): number {
  const exponent = Math.round(Math.log2(Math.max(1, level)));
  return Math.min(16, 2 ** Math.max(0, exponent));
}

/** A position's budgets, interpolated between anchors; counts rounded, anisotropy a power of two, the window re-derived. */
export function graphicsProfile(quality: number): GraphicsProfile {
  const q = clampQuality(quality);
  let lower = QUALITY_ANCHORS[0]!;
  let upper = QUALITY_ANCHORS[QUALITY_ANCHORS.length - 1]!;
  for (let i = 0; i < QUALITY_ANCHORS.length - 1; i++) {
    const a = QUALITY_ANCHORS[i]!;
    const b = QUALITY_ANCHORS[i + 1]!;
    if (q >= a.at && q <= b.at) {
      lower = a;
      upper = b;
      break;
    }
  }
  const span = upper.at - lower.at;
  const t = span === 0 ? 0 : (q - lower.at) / span;
  const mix = (key: keyof SliderProfile): number =>
    lower.profile[key] + (upper.profile[key] - lower.profile[key]) * t;
  const drawDistance = Math.round(mix('drawDistance'));
  return {
    drawDistance,
    detailDistance: Math.min(drawDistance, Math.round(mix('detailDistance'))),
    drawBudget: Math.round(mix('drawBudget')),
    animationDistance: Math.round(mix('animationDistance')),
    effectDistance: Math.round(mix('effectDistance')),
    tileWindow: tileWindowFor(drawDistance),
    pixelRatio: mix('pixelRatio'),
    renderScale: DEFAULT_OVERRIDES.renderScale,
    anisotropy: anisotropyStep(mix('anisotropy')),
    ...nearestAnchor(q).switches,
    antialias: DEFAULT_OVERRIDES.antialias,
    attachesPerFrame: Math.round(mix('attachesPerFrame')),
  };
}

/** The slider's profile with the two controls applied. What the renderer is handed. */
export function resolveGraphics(quality: number, overrides: GraphicsOverrides): GraphicsProfile {
  const profile = graphicsProfile(quality);
  // An override moves draw and detail distance together. Anything but a
  // finite number is "auto", so an old save without `viewDistance` falls
  // through to the slider instead of overriding every level.
  const custom =
    typeof overrides.viewDistance === 'number' ? clampViewDistance(overrides.viewDistance) : null;
  const drawDistance = custom ?? profile.drawDistance;
  const detailDistance = custom ?? profile.detailDistance;
  return {
    ...profile,
    drawDistance,
    detailDistance,
    tileWindow: tileWindowFor(drawDistance),
    renderScale: clampRenderScale(overrides.renderScale),
    antialias: overrides.antialias,
    shadows: overrides.shadowMode === 'auto' ? profile.shadows : overrides.shadowMode,
  };
}

/** The budgets at the slider's default position. */
export const DEFAULT_GRAPHICS: GraphicsProfile = graphicsProfile(DEFAULT_QUALITY);

/** The anchor a slider position is closest to, for a readout and a screen reader. */
export function qualityName(quality: number): string {
  return nearestAnchor(quality).name;
}

const SHADOW_LABEL: Record<ShadowMode, string> = {
  baked: 'baked only',
  blob: 'blob',
  realtime: 'real time',
};

/** One line saying what a profile draws, for the settings screen. */
export function describeProfile(profile: GraphicsProfile): string {
  const grass =
    profile.detailDistance < profile.drawDistance ? `, grass to ${profile.detailDistance}` : '';
  return (
    `Models to ${profile.drawDistance} units${grass}, ` +
    `animation to ${profile.animationDistance}, ${profile.tileWindow} × ${profile.tileWindow} tiles of ground. ` +
    `Shadows ${SHADOW_LABEL[profile.shadows]}, foliage ${profile.foliageCutout ? 'cut-out' : 'blended'}, ` +
    `${profile.water === 'soft' ? 'soft' : 'plain'} water.`
  );
}
