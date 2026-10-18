/**
 * Renderer — turns the World into pixels. It reads the world, which never
 * reaches back, and consumes resources, never formats.
 */

import * as THREE from 'three';
import { DEFAULT_FOG, DEFAULT_GRAPHICS } from '../core/graphics';
import type { GraphicsProfile, ShadowMode } from '../core/graphics';
import { logger } from '../core/log';
import type { ResourceSystem } from '../assets/ResourceSystem';
import type { Entity, EntityId, World } from '../world/World';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildModel } from './ModelFactory';
import type { BuiltModel } from './ModelFactory';
import { buildSkinnedModel, toThreeClip } from './SkinnedModelFactory';
import { isSkinned, loadModelSources } from './modelSources';
import { fillCandidates, orderForPop } from './attachOrder';
import { ZoneFog } from './ZoneFog';
import { GroundLightBlend } from './GroundLightBlend';
import { installColourGrade } from './colourGrade';
import { lightGround } from './terrainShader';
import { footfallPhases } from './footfalls';
import { effectFade, effectWorldPosition } from './effectFade';
import {
  DOME_HAZE,
  hazeSky,
  makeSky,
  makeSkyHill,
  SUN_DIRECTION,
  SUN_DISTANCE,
  SUN_RENDER_ORDER,
  SUN_SIZE,
  sunMaterial,
} from './skyMaterials';
import { HeadIcons, iconBob } from './HeadIcons';
import { WeaponStripes } from './WeaponStripes';
import type { BladePair } from './WeaponStripes';
import type { LinesUnderIcon } from './HeadIcons';
import { findAttachmentNode, itemEffectHost, placedEffectHosts, rowMatrix } from './attachPoints';
import { buildTerrainTile } from './TerrainFactory';
import { buildCollisionWireframe } from './CollisionDebug';
import { buildNavigationOverlay } from './NavigationDebug';
import type { NavigationDebugObject, NavigationDebugStats } from './NavigationDebug';
import type { NavigationGround } from '../world/NavigationGround';
import { buildWaterTile } from './WaterFactory';
import { WaterRipples } from './WaterRipples';
import { ObjectShadows, collectShadows } from './ObjectShadows';
import type { GroundCacheEntry } from './ObjectShadows';
import { TargetRing, placeRing } from './TargetRing';
import { GUIDE_MODEL, GUIDE_SCALE } from '../gameplay/questGuide';
import type { Relation } from './TargetRing';

/** How tall a body is taken to be before it has been built. */
const UNBUILT_BODY_HEIGHT = 1.8;
/** Own choice: a ray this much beyond a body's largest side cannot touch it, whatever its pose. */
const PICK_REMEASURE_MARGIN = 1;
import type {
  ClipName,
  EffectData,
  EffectEmitter,
  EquipmentAttachment,
  MountRow,
  WornSlot,
  ZoneAtmosphere,
} from '../assets/types';
import { attachPointId, effectId, heldItemId } from '../assets/ids';
import { MaterialCache } from './MaterialCache';
import { EffectInstance } from './EffectFactory';
import { placementSeed } from './emitterSpawn';
import { combatClipName, UNARMED } from '../gameplay/weaponClips';
import type { EquippedWeapons } from '../gameplay/weaponClips';
import { CameraRig } from './CameraRig';
import {
  appendEntry,
  createStaticBatchOf,
  disposeBatch,
  removeEntry,
  writeEntry,
  writeEntryFade,
} from './staticBatch';
import { acquireFadeClone, releaseFadeClone, setFade } from './fadeMaterial';
import { installSkeletonUpdateSkip } from './skeletonUpdate';
import { MODEL_SHADOW, modelShadowsCompiled, setModelShadowsCompiled } from './modelShadows';
import { needsPostEffects, PostEffects } from './postfx/PostEffects';
import type { PostSettings } from './postfx/PostEffects';
import {
  actionSpan,
  type ActionSpan,
  onNewBaseClip,
  spanCoversWholeBody,
  bodyBox,
  markNotBody,
  measureBody,
  splitClip,
  upperBodyBones,
} from './upperBody';
import {
  animatedRadius,
  animationStride,
  budgetRadius,
  countDraws,
  hashPhase,
  HIDE_BANDS,
  isFoliageVisible,
  shouldPose,
  VISIBILITY_RECHECK_DISTANCE,
} from './drawBudget';
import { disposeTile } from './tileCache';
import type { BuiltTile } from './tileCache';
import {
  NAME_COLOURS,
  namePlateHeight,
  PLAYER_NAME_COLOUR,
  playerNameColour,
  recolourNameLabel,
  redrawNameLabel,
  showNamePlate,
  unitNameLabel,
  updateNameLabelMatrix,
} from './nameLabels';
import { onFacesChanged } from '../core/lettering';
import { clampZoom, stageBackground, stageCopyRect, STAGE_ZOOM_PER_WHEEL_PX } from './heroStage';
import type { HeroStage } from './heroStage';
import {
  applyObjectFade,
  applyObjectGhost,
  beginObjectFade,
  clearObjectGhost,
  endObjectFade,
  swapFoliage,
} from './entityFade';
import {
  isPickableEntity,
  markNotPickable,
  ownerOfPick,
  pendingAttachmentCount,
  refreshSkinnedBounds,
} from './picking';
import type { StaticBatch } from './staticBatch';
import { renderPortrait } from './portrait';
import { lightAsStage } from './stageLight';
import { createEffectMaterial } from './effectMaterial';
import { previewTurn } from './previewTurn';
import type { ViewCover } from './viewCentre';

const log = logger('renderer');

/** The slots whose item moves between a resting node and the hand. */
const HELD_SLOTS: ReadonlySet<WornSlot> = new Set(['twoHand', 'mainHand', 'offHand', 'ranged']);

/**
 * Real-time shadows: map size, reach, sun height and edge softness. Own
 * choices (4096 over 80 units is ~51 texels a unit).
 */
const SHADOW_MAP_SIZE = 4096;
const SHADOW_REACH = 80;
const SHADOW_SUN_DISTANCE = 150;
const SHADOW_SOFTNESS = 3;
/** Scratch for `followSunShadow`, once per frame. */
const scratchShadowCentre = new THREE.Vector3();
const scratchShadowRight = new THREE.Vector3();
const scratchShadowUp = new THREE.Vector3();

export interface EntityView {
  object: THREE.Object3D;
  version: number;
  batch?: StaticBatch;
  batchIndex?: number;
  batchVisible?: boolean;
  /** A soft-edged clone over this placement's batch row, near the eye only. */
  foliageCompanion?: THREE.Mesh;
  /** The companion's cross-fade, 0 dithered out to 1 grown (batch row hidden). */
  foliageFade?: number;
  /** When a no-longer-wanted companion may start shrinking (`FOLIAGE_BLEND_GRACE_MS`). */
  foliageGraceUntil?: number;
  /** Draw-call cost, priced at build; batched views are free. */
  drawCount?: number;
  nameLabel?: THREE.Sprite;
  /** The head icon; `iconBaseY` and `iconLines` let it lift over the name. */
  interactionIcon?: THREE.Sprite;
  iconBaseY?: number;
  iconLines?: LinesUnderIcon;
  /** The icon this view was built with; compared against `entity.interactionIcon` in `sync`. */
  iconPath?: string;
  /** The icon is rebuilt only after `attach` finishes, or two sprites race. */
  attached?: boolean;
  skinned?: boolean;
  small?: boolean;
  landmark?: boolean;
  /** Fraction drawn, 0..1, as a scale; absent means 1. */
  fade?: number;
  shown?: boolean;
  /** Set once the body is leaving: distance no longer brings it back. */
  leaving?: boolean;
  /** Each mesh's shared material and its fading clone; absent unless fading. */
  fadeMaterials?: Array<{
    mesh: THREE.Mesh;
    shared: THREE.Material | THREE.Material[];
    own: THREE.Material | THREE.Material[];
  }>;
  /** Model-space XZ half-extents for the blob shadow, once resolved. */
  shadowExtents?: [number, number];
  effect?: EffectInstance;
  mixer?: THREE.AnimationMixer;
  clipName?: string;
  /**
   * Characters ship combat clips per weapon; creatures under bare names.
   * Null means do not suffix, not unarmed (that is `UNARMED`).
   */
  weapons?: EquippedWeapons | null;
  /** Measured once at build: a live measure would include spell effects. */
  bodyBounds?: { size: THREE.Vector3; centreOffsetY: number };
  /** Bones from the spine up, or null for a model with no spine to split at. */
  upperBones?: ReadonlySet<string> | null;
  /** The combat clip over the legs; `until` is when a one-shot ends, absent for a held clip. */
  overlay?: {
    ask: string;
    action: THREE.AnimationAction;
    until: number | null;
    span: ActionSpan;
  };
  /**
   * Bumped by anything that cancels an action, so a clip that finishes
   * loading after the reason for it has gone is discarded.
   */
  actionSeq?: number;
  baseAsk?: { clip: string; rate: number; once: boolean };
  clipRate?: number;
  action?: THREE.AnimationAction;
  equipmentMixers?: THREE.AnimationMixer[];
  equipmentEffects?: EffectInstance[];
  /** Items held for show (a gatherer's tool), off the equipment list so a stance never moves them. */
  heldProps?: THREE.Object3D[];
  /** Bumped by each hold and drop; a prop that loads for an older one is not hung. */
  propSeq?: number;
  equipmentObjects?: Array<{
    object: THREE.Object3D;
    slot: WornSlot;
    heldNode?: string;
    folded: THREE.Matrix4;
    foldedHost: THREE.Object3D;
  }>;
  combatStance?: 'melee' | 'ranged' | null;
  modelPath?: string;
  /** The mount this body rides; its clips go to the mount while the body sits. */
  mount?: Ridden;
  /** Bumped by each mount and dismount; a mount that loads for an older one is not used. */
  mountSeq?: number;
}

/** A mount under a body: its own model where the body stands, carrying the body on its seat. */
interface Ridden {
  row: MountRow;
  object: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  modelPath: string;
  seat: THREE.Object3D | null;
  /** Where the body itself stands and faces; the body is drawn up on the seat. */
  ground: THREE.Vector3;
  facing: THREE.Quaternion;
  action?: THREE.AnimationAction;
  clipName?: string;
  clipRate?: number;
}

/** A built model to clone per entity; skinned ones need their own bone tree per clone. */
interface Prototype {
  object: THREE.Object3D;
  geometries: THREE.BufferGeometry[];
  skinned: boolean;
  clip: THREE.AnimationClip | null;
  shadowExtents?: [number, number];
  height?: number;
  foliage?: boolean;
  /** Once a cut-out, always: so every placement joins one batch. */
  foliageCutout?: boolean;
}

/**
 * Own choice: scenery this short is drawn only to `detailDistance`. Between
 * a fence post (1.2) and a person (1.9).
 */
export const SMALL_SCENERY_HEIGHT = 1.6;

/**
 * Own choice: scenery this tall is a landmark, exempt from the budget's
 * shrinking radius, so a town loses its stalls before its church.
 */
export const LANDMARK_HEIGHT = 10;

/** Dithered in the opaque pass; see `fadeMaterial.ts`. */
export const HIDE_FADE_SECONDS = 0.35;

export function isLandmark(
  kind: Entity['kind'],
  height: number | undefined,
  scaleY: number,
): boolean {
  if (kind !== 'static' && kind !== 'scenery') return false;
  if (height === undefined) return false;
  return height * Math.abs(scaleY) >= LANDMARK_HEIGHT;
}

export function stepFade(fade: number, shown: boolean, dt: number): number {
  const step = dt / HIDE_FADE_SECONDS;
  return shown ? Math.min(1, fade + step) : Math.max(0, fade - step);
}

/** How solid a stealthed body is drawn: a faint shimmer, still there to be seen. */
export const GHOST_ALPHA = 0.12;

/** Seconds to fade fully into or out of stealth. */
export const GHOST_FADE_SECONDS = 0.4;

export function stepGhost(current: number, target: number, dt: number): number {
  const step = dt / GHOST_FADE_SECONDS;
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step);
}

export function isSmallScenery(
  kind: Entity['kind'],
  height: number | undefined,
  scaleY: number,
): boolean {
  if (kind !== 'static' && kind !== 'scenery') return false;
  if (height === undefined) return false;
  return height * Math.abs(scaleY) < SMALL_SCENERY_HEIGHT;
}

/** Generous: a frozen character costs more than a wasted pose. */
export const ANIMATION_BOUND_RADIUS = 3;

/** Always posed inside this distance, for a camera inside the model. */
export const ANIMATION_ALWAYS_DISTANCE = 10;

/** Draw-distance hysteresis, against boundary flicker. */
const HIDE_HYSTERESIS = 12;

/**
 * How often dirty distance-hiding may recheck: positions cross the
 * hysteresis far slower, so a fight rechecks four times a second while a
 * moved eye still rechecks at once. Own choice: a sprinting body covers
 * ~2 units in the interval against a 12-unit hysteresis.
 */
const HIDE_RECHECK_MS = 250;

/**
 * How often the sun's shadow map redraws on its own: anything the refresh
 * rule below misses (a dissolve's last frames, a swapped material) lands
 * here within two seconds, while a still scene skips every frame between.
 */
const SHADOW_MAP_REFRESH_FRAMES = 120;

/**
 * Whether the sun's shadow map is redrawn this frame. A new frustum, a
 * posed or fading body, or fresh attachments all change what it must hold;
 * otherwise the safety net above is the only redraw.
 */
export function shadowMapNeedsUpdate(
  sunMoved: boolean,
  sceneAlive: boolean,
  frame: number,
): boolean {
  if (sunMoved || sceneAlive) return true;
  return frame % SHADOW_MAP_REFRESH_FRAMES === 0;
}

/**
 * Whether the distance hiding runs now. A moved eye always rechecks, so a
 * teleport never shows the old radius; dirt alone waits out the interval.
 */
export function hideRecheckDue(
  nowMs: number,
  lastMs: number,
  eyeMoved: boolean,
  dirty: boolean,
): boolean {
  if (eyeMoved) return true;
  if (!dirty) return false;
  return nowMs - lastMs >= HIDE_RECHECK_MS;
}

/** Batched foliage is cut-out; near placements get a soft-edged clone over a hidden row. */
export const FOLIAGE_BLEND_DISTANCE = 55;
export const FOLIAGE_BLEND_HYSTERESIS = 6;

/**
 * A companion is a draw call; a dense meadow can put many inside the blend
 * radius. Past the cap the farthest keep their cut-out row until a later
 * recheck.
 */
const MAX_FOLIAGE_COMPANIONS = 160;

/** Measured: growing dozens in one pass cost over 16 ms. */
const MAX_FOLIAGE_GROWTH_PER_TICK = 24;

/** A companion waits this long before shrinking, so a quick glance away never fades it. */
const FOLIAGE_BLEND_GRACE_MS = 1200;

const FOLIAGE_BLEND_NEAR_SQ = FOLIAGE_BLEND_DISTANCE * FOLIAGE_BLEND_DISTANCE;
const FOLIAGE_BLEND_FAR_SQ = (FOLIAGE_BLEND_DISTANCE + FOLIAGE_BLEND_HYSTERESIS) ** 2;

/**
 * Whether a batched foliage placement should have a blend companion. `has`
 * makes the thresholds asymmetric, so standing on the line does not spawn
 * and dispose the same mesh forever.
 */
export function wantsFoliageCompanion(
  has: boolean,
  wantsBlend: boolean,
  distanceSq: number,
): boolean {
  if (!wantsBlend) return false;
  return has ? distanceSq <= FOLIAGE_BLEND_FAR_SQ : distanceSq < FOLIAGE_BLEND_NEAR_SQ;
}

/** Whether a companion's shrink grace has run out; undefined means not started. */
export function foliageGraceExpired(graceUntil: number | undefined, now: number): boolean {
  return graceUntil !== undefined && now >= graceUntil;
}

const scratchMatrix = new THREE.Matrix4();
const scratchSize = new THREE.Vector2();

/** Claimed-but-undrawn entities `sync` keeps queued; candidates refresh on change. */
const ATTACH_QUEUE_BUDGET = 128;

/**
 * Resolving attachments, as a multiple of per-frame dispatch: enough to keep
 * the worker busy, few enough to keep nearest-first order. Own choice.
 */
const ATTACH_IN_FLIGHT_MULTIPLE = 4;

/** Texture backlog where new attachments start throttling; the second is heavy. */
const ATTACH_THROTTLE_TEXTURES = 96;
const ATTACH_THROTTLE_TEXTURES_HARD = 192;

const TERRAIN_BUILDS_PER_FRAME = 2;
const TERRAIN_BUILDS_PER_FRAME_THROTTLED = 1;
const TERRAIN_DISPOSES_PER_FRAME = 2;
const TERRAIN_DISPOSES_PER_FRAME_THROTTLED = 1;

/** Creatures share only part of the player's clip vocabulary; every chain ends at `idle`. */
const CLIP_FALLBACKS: Readonly<Partial<Record<ClipName, readonly ClipName[]>>> = {
  run_normal: ['run', 'walk_forward', 'walk', 'idle'],
  walk_backward: ['walk_forward', 'walk', 'run_normal', 'run', 'idle'],
  move_left: ['walk_forward', 'walk', 'run_normal', 'run', 'idle'],
  move_right: ['walk_forward', 'walk', 'run_normal', 'run', 'idle'],
  run_idle: ['idle'],
  move_left_idle: ['idle'],
  move_right_idle: ['idle'],
  jump_start: ['idle'],
  jump_air: ['idle'],
  jump_land: ['idle'],
  jumplandrun: ['jump_land', 'idle'],
};

function fallbacksFor(clip: string): readonly ClipName[] {
  return CLIP_FALLBACKS[clip as ClipName] ?? [];
}

/** Short enough not to smear a hop. */
const CLIP_FADE = 0.12;

/** Where a mount carries its rider: every mount in the user's files has this node. */
const SEAT = 'Dummy_ride';

/** What a rider plays, whatever the mount under them is doing. */
const RIDER_CLIP = 'ride_idle';

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  entityViews: number;
  animatedEntities: number;
  pendingAttachments: number;
  terrainTiles: number;
  staticBatches: number;
  foliageCompanions: number;
  hideMs: number;
  preMs: number;
  drawMs: number;
  texturesUploaded: number;
  /** Time spent in CPU-side effect simulation this frame, in ms. */
  effectsMs: number;
  /** Time spent in the post pass this frame, in ms; 0 when the frame drew direct. */
  postMs: number;
  /** Blade ribbons still in flight; each is a material born that swing. */
  weaponStripes: number;
}

export class Renderer {
  readonly rig = new CameraRig();
  readonly scene = new THREE.Scene();
  /**
   * The sky's own pass. In one scene a blended sky layer lands in the
   * transparent list, draws after the world without a depth test, and paints
   * over it.
   */
  readonly skyScene = new THREE.Scene();

  private readonly gl: THREE.WebGLRenderer;
  private readonly materials: MaterialCache;
  private readonly terrainGroup = new THREE.Group();
  private readonly waterGroup = new THREE.Group();
  private readonly builtTiles = new Map<string, BuiltTile>();
  private readonly terrainDisposalQueue: BuiltTile[] = [];
  private waterClock = 0;
  private previousFrameSeconds = 1 / 60;
  private ripples: WaterRipples | null = null;
  /** Instanced blob shadows, one draw call for everything in view. */
  private shadows: ObjectShadows | null = null;
  private sun!: THREE.DirectionalLight;
  private shadowMode: ShadowMode = 'blob';
  /** Frames drawn; the shadow map's safety net counts on it. */
  private frameNo = 0;
  /** Where the sun stood when its shadow map last could have changed. */
  private readonly lastShadowSun = new THREE.Vector3();
  private postSettings: PostSettings = {
    toneMapping: 'none',
  };
  private post: PostEffects | null = null;
  private targetRing: TargetRing | null = null;
  /** A model, so it turns in three dimensions and needs no ground fitting. */
  private guideArrow: THREE.Object3D | null = null;
  private guideArrowLoading = false;
  private target: { id: EntityId; relation: Relation; since: number } | null = null;
  /**
   * The name over the selected creature, shown while it is targeted. A remote
   * player's name is always on, and is a separate sprite.
   */
  private targetLabel: { id: EntityId; key: string; sprite: THREE.Sprite } | null = null;
  private readonly stopFaces: () => void;
  private readonly icons = new HeadIcons();
  private readonly stripes: WeaponStripes;
  /** The sky dome, recentred on the camera; unlit, unfogged, no depth test. */
  private skybox: THREE.Group | null = null;
  private skySunMaterial: THREE.SpriteMaterial | null = null;
  /**
   * Bumped on zone teardown. Cancels skybox builds and every in-flight
   * `attach`, which otherwise run to completion for the zone being left,
   * ahead of the one being entered.
   */
  private zoneSeq = 0;
  private appliedAtmosphere = '';
  private fogSetting = DEFAULT_FOG;
  private appliedSkybox: string | null = null;
  private world: World | null = null;
  private graphics: GraphicsProfile = DEFAULT_GRAPHICS;
  private readonly fog = new ZoneFog();
  private readonly groundLight = new GroundLightBlend();
  /** Off is for inspecting a zone: models then pop in against the sky. */
  private fogOn = true;
  private bgColor = new THREE.Color();
  /** Resolved shadow placements, kept until an entity moves; cleared with the views. */
  private readonly shadowGround = new Map<number, GroundCacheEntry>();
  private lastPlayerPos: [number, number, number] | null = null;
  private wasAtWaterline = false;
  private readonly entityGroup = new THREE.Group();
  private collisionDebug: {
    object: THREE.Object3D;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
  } | null = null;
  private collisionDebugWanted = false;
  private collisionDebugAt = -1;
  /** The walkable-ground overlay; never rebuilt on its own, since it draws one answer. */
  private navigationDebug: NavigationDebugObject | null = null;

  /** One prototype per model and appearance: a different look is a different mesh set and skin. */
  private readonly prototypes = new Map<string, Promise<Prototype | null>>();
  private readonly animated: Array<{
    mixer: THREE.AnimationMixer;
    object: THREE.Object3D;
    boundRadius?: number;
  }> = [];
  private animatedNear = 0;
  private readonly hideBandDraws = new Int32Array(HIDE_BANDS);
  private visibilityDirty = true;
  /** When the distance hiding last ran; dirty rechecks wait out `HIDE_RECHECK_MS`. */
  private lastHideCheck = 0;
  private lastVisibilityEye: THREE.Vector3 | null = null;
  private readonly poseFrustum = new THREE.Frustum();
  private readonly poseFrustumMatrix = new THREE.Matrix4();
  private readonly preloadCandidates: Entity[] = [];
  private candidateListDirty = true;
  private candidateMembership = -1;
  private evictedMembership = -1;
  private lastCandidateEye: THREE.Vector3 | null = null;
  private handedToAttach = 0;
  private attachesInFlight = 0;
  private readonly fading = new Map<EntityId, EntityView>();
  /** Stealthed bodies easing toward an alpha; survives a body whose model has not loaded. */
  private readonly ghosts = new Map<EntityId, { target: number; current: number }>();
  private readonly views = new Map<EntityId, EntityView>();
  /** Bodies with an upper-body clip running; a set so retiring swings needs no scan. */
  private readonly withActions = new Set<EntityId>();
  private readonly staticBatches = new Map<string, StaticBatch>();
  private readonly foliageBlendMaterials = new WeakMap<StaticBatch, THREE.Material>();
  /** True while growing in, false while shrinking. */
  private readonly foliageFading = new Map<EntityId, boolean>();
  /** Placements with a companion, against `MAX_FOLIAGE_COMPANIONS`. */
  private activeFoliageCompanions = 0;
  /** Reused array for `admitFoliageCompanions`. */
  private readonly foliageGrowCandidates: Array<{ id: EntityId; view: EntityView; d2: number }> =
    [];
  private lastHideMs = 0;
  /** Wall time of the last frame's bookkeeping before the draw. */
  private lastPreMs = 0;
  /** Wall time of the last effect simulation pass. */
  private lastEffectsMs = 0;
  /** Wall time of the last post pass, or 0 when the frame drew direct. */
  private lastPostMs = 0;
  /** Wall time of the last `gl.render`. */
  private lastDrawMs = 0;
  private readonly effects: Array<{
    instance: EffectInstance;
    object: THREE.Object3D;
    attached?: boolean;
    paused?: boolean;
  }> = [];
  private readonly equipmentEffectEntries: Array<{
    instance: EffectInstance;
    object: THREE.Object3D;
  }> = [];
  /** For diagnostics only. */
  private readonly effectPaths = new WeakMap<EffectInstance, string>();
  /** Effect model mixers, retired with the effect; projectiles come and go all fight. */
  private readonly effectMixers = new Map<EffectInstance, THREE.AnimationMixer[]>();
  private effectMarkers: THREE.Group | null = null;
  private readonly effectMaterials = new Map<string, THREE.Material>();
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  /** Materials the terrain built, which nothing else frees. */
  private readonly ownedMaterials: THREE.Material[] = [];
  private readonly attachQueue: Entity[] = [];
  private readonly clipCache = new Map<string, Map<string, THREE.AnimationClip>>();
  private readonly footfallCache = new Map<string, number[]>();
  private readonly equipmentPrototypes = new Map<string, Promise<Prototype | null>>();
  private readonly interactionIconMaterials = new Map<
    string,
    Promise<THREE.SpriteMaterial | null>
  >();
  private readonly interactionIconUpdates = new Set<EntityId>();
  private readonly headshotCache = new Map<string, string>();
  private viewCover: ViewCover | null = null;
  private readonly heroStages = new Set<HeroStage>();
  private readonly pendingWeapons = new Map<EntityId, EquippedWeapons | null>();
  /** Mounts asked for before their rider's view was built. */
  private readonly pendingMounts = new Map<EntityId, MountRow>();
  /** The mount each body was last asked onto, so a slow table read cannot undo a later ask. */
  private readonly mountAsks = new Map<EntityId, number>();
  private readonly riders = new Set<EntityId>();
  private readonly pendingStances = new Map<EntityId, 'melee' | 'ranged' | null>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly resources: ResourceSystem,
    private readonly options: { animate?: boolean; antialias?: boolean } = {},
  ) {
    installSkeletonUpdateSkip();
    installColourGrade();
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: options.antialias !== false,
      alpha: false,
      // Otherwise a dual-GPU laptop may get the integrated one.
      powerPreference: 'high-performance',
    });
    this.applyPixelRatio();
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    // A frame is several renders; reset once a frame so `stats` covers them all.
    this.gl.info.autoReset = false;

    // A live reference, so texture priority follows the player.
    this.materials = new MaterialCache(resources, this.rig.target);
    // Read back: the granted attributes may differ from those asked for.
    this.materials.setCoverage(this.gl.getContextAttributes()?.antialias === true);
    // Names drawn before the build's typefaces arrived are redrawn in them.
    this.stopFaces = onFacesChanged(() => this.redrawNameLabels());

    this.scene.add(this.terrainGroup);
    this.scene.add(this.waterGroup);
    this.ripples = new WaterRipples();
    this.scene.add(this.ripples.object);
    this.shadows = new ObjectShadows();
    this.scene.add(this.shadows.object);
    this.targetRing = new TargetRing();
    this.scene.add(this.targetRing.object);

    this.scene.add(this.entityGroup);
    this.stripes = new WeaponStripes({
      parent: this.entityGroup,
      bladeOf: id => this.bladeOf(id),
      texture: path => this.materials.rawTexture(path, 'clamp'),
    });

    // Enough to read shape; most art carries baked lighting.
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.copy(SUN_DIRECTION);
    this.scene.add(sun);
    this.sun = sun;
    // Off until asked: enabling it grows every material's shadow chunks.
    this.gl.shadowMap.enabled = false;
    // The map redraws only on ask (see `updateShadowMap`): a still scene
    // keeps last frame's, which is the whole point of the sun following.
    this.gl.shadowMap.autoUpdate = false;
    // This three version has no PCFSoftShadowMap; asking for it warns every frame.
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    sun.castShadow = false;
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    const frustum = sun.shadow.camera;
    frustum.left = -SHADOW_REACH;
    frustum.right = SHADOW_REACH;
    frustum.top = SHADOW_REACH;
    frustum.bottom = -SHADOW_REACH;
    frustum.near = 1;
    frustum.far = SHADOW_SUN_DISTANCE * 2;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = SHADOW_SOFTNESS;
    this.scene.add(sun.target);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.1));
    // Unlit models read the sun's shadow through its matrix, updated in place.
    MODEL_SHADOW.uModelShadowMatrix.value = sun.shadow.matrix;
  }

  /**
   * Adopt new budgets mid-session: fog, visibility and candidates recompute;
   * built views stay, and a narrower radius hides the far ones.
   */
  setGraphics(profile: GraphicsProfile): void {
    this.graphics = profile;
    this.applyPixelRatio();
    this.appliedAtmosphere = '';
    this.visibilityDirty = true;
    this.candidateListDirty = true;
    this.materials.setAnisotropy(
      Math.min(profile.anisotropy, this.gl.capabilities.getMaxAnisotropy()),
    );
    this.applyShadowMode(profile.shadows);
    this.applyWaterSurface();
    this.syncUnbatchedFoliage();
  }

  /** Coverage already softens the cut-out edge, so a blend adds nothing. */
  private get foliageCutout(): boolean {
    return this.graphics.foliageCutout || this.materials.coverageFoliage;
  }

  /** Unbatched foliage follows the profile's blend setting directly. */
  private syncUnbatchedFoliage(): void {
    const cutout = this.foliageCutout;
    for (const view of this.views.values()) {
      if (view.small && !view.batch && view.attached)
        swapFoliage(view.object, this.materials, cutout);
    }
  }

  /** Blob, real-time or baked; materials recompile once. */
  private applyShadowMode(mode: ShadowMode): void {
    if (this.shadows) {
      this.shadows.object.visible = mode === 'blob';
      if (mode !== 'blob') this.shadows.clear();
    }
    const realtime = mode === 'realtime';
    if (this.gl.shadowMap.enabled !== realtime) {
      this.gl.shadowMap.enabled = realtime;
      this.sun.castShadow = realtime;
      // With `autoUpdate` off nothing draws the first map unasked.
      if (realtime) this.gl.shadowMap.needsUpdate = true;
      this.scene.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material) material.needsUpdate = true;
        }
      });
      this.materials.markAllForRecompile();
    }
    this.shadowMode = mode;
  }

  /** Keep the shadow frustum on the player, snapped to texels so edges do not crawl. */
  private followSunShadow(): void {
    if (this.shadowMode !== 'realtime') return;
    const target = scratchShadowCentre.copy(this.rig.target);
    const texel = (SHADOW_REACH * 2) / SHADOW_MAP_SIZE;
    const right = scratchShadowRight.set(0, 1, 0).cross(SUN_DIRECTION).normalize();
    const up = scratchShadowUp.copy(SUN_DIRECTION).cross(right).normalize();
    const x = Math.round(target.dot(right) / texel) * texel;
    const y = Math.round(target.dot(up) / texel) * texel;
    const z = target.dot(SUN_DIRECTION);
    target.copy(right).multiplyScalar(x).addScaledVector(up, y).addScaledVector(SUN_DIRECTION, z);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(SUN_DIRECTION, SHADOW_SUN_DISTANCE);
    this.sun.target.updateMatrixWorld();
  }

  /** Hand the sun's shadow map to the unlit models (`modelShadows.ts`) once it exists. */
  private shareSunShadow(): void {
    const map = this.shadowMode === 'realtime' ? this.sun.shadow.map : null;
    const depth = map?.depthTexture ?? null;
    MODEL_SHADOW.uModelShadowMap.value = depth;
    if (map) MODEL_SHADOW.uModelShadowTexel.value.set(1 / map.width, 1 / map.height);
    if ((depth !== null) !== modelShadowsCompiled()) {
      setModelShadowsCompiled(depth !== null);
      this.recompileMaterials();
    }
  }

  private recompileMaterials(): void {
    for (const root of [this.scene, this.skyScene]) {
      root.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (material) material.needsUpdate = true;
        }
      });
    }
    this.materials.markAllForRecompile();
  }

  /** Haze thickness, 0..1 (`DEFAULT_FOG`); blends over like a zone change. */
  setFog(fog: number): void {
    if (fog === this.fogSetting) return;
    this.fogSetting = fog;
    this.appliedAtmosphere = '';
  }

  /** Tone mapping; grades the frame through `postfx/PostEffects.ts`. */
  setPostSettings(settings: PostSettings): void {
    this.postSettings = settings;
    if (!needsPostEffects(settings)) return;
    this.post ??= new PostEffects(
      this.gl,
      this.skyScene,
      this.scene,
      this.rig.camera,
      this.options.antialias !== false,
    );
    this.post.set(settings);
  }

  get graphicsProfile(): GraphicsProfile {
    return this.graphics;
  }

  private applyPixelRatio(): void {
    const capped = Math.min(window.devicePixelRatio || 1, this.graphics.pixelRatio);
    this.gl.setPixelRatio(capped * this.graphics.renderScale);
  }

  /** Drop zone-scoped state; terrain and views diff away on their own. */
  resetZone(): void {
    // First: everything in flight belongs to the zone being left.
    this.zoneSeq++;
    this.clearCollisionDebug();
    this.clearNavigationDebug();
    this.clearSkybox();
    this.appliedAtmosphere = '';
    this.appliedSkybox = null;
    this.ripples?.clear();
    this.shadows?.clear();
    this.target = null;
    this.targetRing?.clear();
    if (this.guideArrow) this.guideArrow.visible = false;
    this.clearTargetLabel();
    this.lastPlayerPos = null;
    this.wasAtWaterline = false;
    this.visibilityDirty = true;
    this.lastVisibilityEye = null;
    this.fading.clear();
    // Local ids restart, so a kept ghost would fade whoever inherits the id.
    this.ghosts.clear();
    this.candidateListDirty = true;
    this.candidateMembership = -1;
    this.evictedMembership = -1;
    this.lastCandidateEye = null;
    this.preloadCandidates.length = 0;
    this.disposeOwned();

    // Constructed before data is mounted, so the startup request rejected;
    // a zone change retries. `rawTexture` de-dupes.
    void this.materials.rawTexture('texture/shadow.tga', 'clamp').then(tex => {
      if (tex && this.shadows) this.shadows.setTexture(tex);
    });
  }

  /** Free the skybox and effect materials; the cache is cleared so no disposed material is reused. */
  private disposeOwned(): void {
    for (const g of this.ownedGeometries) g.dispose();
    this.ownedGeometries.length = 0;
    for (const m of this.ownedMaterials) m.dispose();
    this.ownedMaterials.length = 0;
    this.effectMaterials.clear();
  }

  /** Adopt a zone's fog, ground light and sky; `appliedAtmosphere` skips unchanged numbers. */
  private applyAtmosphere(atmos: ZoneAtmosphere): void {
    const skyKey = `${atmos.skybox}|${atmos.skyHill ?? ''}|${atmos.skySun ?? ''}`;
    const light = `${atmos.sunColor?.join(',') ?? ''}|${atmos.shadeColor?.join(',') ?? ''}`;
    const stamp = `${atmos.fogColor.join(',')}|${atmos.fogNear}|${atmos.fogFar}|${light}|${skyKey}`;
    if (stamp === this.appliedAtmosphere) return;
    const skyChanged = skyKey !== this.appliedSkybox;
    this.appliedAtmosphere = stamp;
    this.groundLight.adopt(atmos.sunColor, atmos.shadeColor);
    const ground = this.groundLight.current;
    lightGround(ground.sun, ground.shade);

    // A zone with no fog keeps the last (`ZoneFog.adopt`). What shows is the
    // blend in progress, not the new fog.
    if (this.fog.adopt(atmos, this.graphics.drawDistance, this.fogSetting)) {
      const shown = this.fog.current;
      this.scene.fog = this.fogOn
        ? new THREE.Fog(this.bgColor.copy(shown.color), shown.near, shown.far)
        : null;
      this.bgColor.copy(shown.color);
      this.scene.background = this.bgColor;
    }

    if (!skyChanged) return;
    this.appliedSkybox = skyKey;
    this.clearSkybox();
    if (atmos.skybox) this.loadSkybox(atmos.skybox, atmos.skyHill ?? null, atmos.skySun ?? null);
  }

  /** Bring the drawn ground in line with the world's, as a diff: re-meshing would stall every tile. */
  private syncTerrain(world: World): void {
    const live = new Set<string>();
    const missing: typeof world.terrain.tiles = [];
    for (const tile of world.terrain.tiles) {
      const key = `${tile.tile[0]},${tile.tile[1]}`;
      live.add(key);
      if (!this.builtTiles.has(key)) missing.push(tile);
    }

    const buildBudget =
      this.pendingTextures >= ATTACH_THROTTLE_TEXTURES
        ? TERRAIN_BUILDS_PER_FRAME_THROTTLED
        : TERRAIN_BUILDS_PER_FRAME;
    if (missing.length > buildBudget) {
      const eye = this.rig.target;
      missing.sort((a, b) => {
        const acx = a.origin[0] + a.tileSize * 0.5;
        const acz = a.origin[1] + a.tileSize * 0.5;
        const bcx = b.origin[0] + b.tileSize * 0.5;
        const bcz = b.origin[1] + b.tileSize * 0.5;
        const adx = acx - eye.x,
          adz = acz - eye.z;
        const bdx = bcx - eye.x,
          bdz = bcz - eye.z;
        return adx * adx + adz * adz - (bdx * bdx + bdz * bdz);
      });
    }

    for (let i = 0; i < Math.min(buildBudget, missing.length); i++) {
      const tile = missing[i]!;
      const built: BuiltTile = {
        objects: [],
        geometries: [],
        materials: [],
        water: [],
        textures: [],
      };
      const ground = buildTerrainTile(tile, this.materials);
      if (ground) {
        this.terrainGroup.add(ground.mesh);
        built.objects.push(ground.mesh);
        built.geometries.push(ground.geometry);
        built.materials.push(...ground.materials);
        built.textures.push(...ground.textures);
      }
      const water = buildWaterTile(tile, this.materials);
      if (water) {
        water.material.uniforms.uSoft.value = this.graphics.water === 'soft' ? 1 : 0;
        this.waterGroup.add(water.mesh);
        built.objects.push(water.mesh);
        built.geometries.push(water.geometry);
        built.water.push(water.material);
      }
      this.builtTiles.set(`${tile.tile[0]},${tile.tile[1]}`, built);
    }

    for (const [key, built] of this.builtTiles) {
      if (live.has(key)) continue;
      this.builtTiles.delete(key);
      this.terrainDisposalQueue.push(built);
    }
  }

  /** In small batches, to avoid unload spikes. */
  private drainTerrainDisposals(): void {
    const budget =
      this.pendingTextures >= ATTACH_THROTTLE_TEXTURES
        ? TERRAIN_DISPOSES_PER_FRAME_THROTTLED
        : TERRAIN_DISPOSES_PER_FRAME;
    for (let i = 0; i < budget; i++) {
      const built = this.terrainDisposalQueue.pop();
      if (!built) break;
      disposeTile(built, this.materials);
    }
  }

  /**
   * The zone's sky dome: small unlit no-depth domes meant to hug the camera.
   * Depth and fog are off and the group recentres each frame. Own choice:
   * the sun sprite rides the light direction, wearing `fx_sun.tga` where the
   * zone names no texture.
   */
  private loadSkybox(
    path: string,
    hill: string | null = null,
    sunTexture: string | null = null,
  ): void {
    const seq = this.zoneSeq;
    const group = this.getSkyboxGroup();

    void this.resources
      .model(path)
      .then(async model => {
        if (seq !== this.zoneSeq || !this.skybox) return;
        const built = buildModel(model, this.materials);
        makeSky(built.object);
        // Hazed toward the fog colour so the far world fades into the sky.
        hazeSky(built.object, this.bgColor, DOME_HAZE);
        this.skybox.add(built.object);
        this.ownedGeometries.push(...built.geometries);
        if (hill) this.loadSkyHill(hill, seq);

        // Additive, along the invented light direction just inside the dome.
        const sun = new THREE.Sprite(this.getSkySunMaterial());
        sun.position.copy(SUN_DIRECTION).multiplyScalar(SUN_DISTANCE);
        sun.scale.setScalar(SUN_SIZE);
        sun.renderOrder = SUN_RENDER_ORDER;
        group.add(sun);
        void this.materials
          .rawTexture(sunTexture ?? 'texture/fx_sun.tga', 'clamp')
          .then(tex => {
            if (tex && this.skySunMaterial) {
              this.skySunMaterial.map = tex;
              this.skySunMaterial.needsUpdate = true;
            }
          })
          .catch(() => undefined);
      })
      .catch(err => {
        // Without this a missing sky is just a grey background.
        log.warn(`sky ${path}: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  /** The horizon layer: after the dome, before the world, lowered and hazed (`makeSkyHill`). */
  private loadSkyHill(path: string, seq: number): void {
    void this.resources
      .model(path)
      .then(model => {
        if (seq !== this.zoneSeq || !this.skybox) return;
        const built = buildModel(model, this.materials);
        makeSkyHill(built.object, this.bgColor);
        this.skybox.add(built.object);
        this.ownedGeometries.push(...built.geometries);
      })
      .catch(err => {
        log.warn(`sky hill ${path}: ${err instanceof Error ? err.message : String(err)}`);
      });
  }

  private getSkyboxGroup(): THREE.Group {
    if (!this.skybox) {
      this.skybox = new THREE.Group();
      this.skyScene.add(this.skybox);
    }
    return this.skybox;
  }

  private getSkySunMaterial(): THREE.SpriteMaterial {
    this.skySunMaterial ??= sunMaterial();
    return this.skySunMaterial;
  }

  /** Bring the scene in line with the world: new entities get views, gone ones are removed. */
  sync(world: World): void {
    this.world = world;
    if (world.membership !== this.candidateMembership) {
      this.candidateMembership = world.membership;
      this.candidateListDirty = true;
    }
    this.applyAtmosphere(world.atmosphere);
    this.syncTerrain(world);
    if (this.collisionDebugWanted) this.setCollisionDebug(world, true);
    const eye = this.rig.target;
    if (this.lastCandidateEye) {
      const dx = eye.x - this.lastCandidateEye.x;
      const dy = eye.y - this.lastCandidateEye.y;
      const dz = eye.z - this.lastCandidateEye.z;
      if (dx * dx + dy * dy + dz * dz >= this.visibilityRecheckDistanceSq()) {
        this.candidateListDirty = true;
      }
    }
    // Rebuild from everything when the set or the eye changes. Otherwise only
    // something walking into range can be new, so an empty list asks the movers.
    const isBuilt = (entity: Entity): boolean => this.views.has(entity.id);
    if (this.candidateListDirty) {
      this.candidateListDirty = false;
      (this.lastCandidateEye ??= new THREE.Vector3()).copy(eye);
      fillCandidates(
        this.preloadCandidates,
        world.entities.values(),
        isBuilt,
        eye,
        this.graphics.drawDistance,
      );
    } else if (this.preloadCandidates.length === 0) {
      fillCandidates(
        this.preloadCandidates,
        world.movers,
        isBuilt,
        eye,
        this.graphics.drawDistance,
      );
    }
    // A small claimed backlog, or nearby entities wait behind invisible ones.
    let room = ATTACH_QUEUE_BUDGET - this.attachQueue.length;
    while (room > 0) {
      const entity = this.preloadCandidates.pop();
      if (!entity) break;
      if (!world.entities.has(entity.id) || this.views.has(entity.id)) continue;
      this.views.set(entity.id, { object: new THREE.Group(), version: -1 });
      this.visibilityDirty = true;
      this.attachQueue.push(entity);
      room--;
    }

    for (const entity of world.entities.values()) {
      const view = this.views.get(entity.id);
      if (!view) continue;
      if (view.version !== entity.version) {
        this.visibilityDirty = true;
        applyTransform(view.object, entity);
        if (view.fade !== undefined && view.fade < 1) view.object.scale.multiplyScalar(view.fade);
        if (view.batch) writeEntry(view.batch, view.batchIndex ?? -1);
        if (view.mount) {
          view.mount.ground.copy(view.object.position);
          view.mount.facing.copy(view.object.quaternion);
          this.seatRider(view);
        }
        // The subtree is frozen, so push the transform through by hand.
        refreshWorldMatrix(view.object);
        if (view.nameLabel) {
          // Explicit: some three builds leave a frozen subtree's sprites at
          // their previous jump height.
          updateNameLabelMatrix(view.object, view.nameLabel);
          view.nameLabel.matrixWorldAutoUpdate = false;
        }
        view.version = entity.version;
      }
      if (view.nameLabel) {
        // Plates hang off the entity group, not the faded object, so a
        // distance-hidden body must hide its plate here, or its name floats
        // where the body was — still traversed, sorted and drawn each frame.
        const drawn = view.batch ? (view.batchVisible ?? true) : view.object.visible;
        showNamePlate(view.nameLabel, entity, drawn);
      }
      // A head marker changes on its own schedule, outside the version check.
      if (view.attached && view.iconPath !== entity.interactionIcon) {
        void this.rebuildInteractionIcon(entity);
      }
    }

    this.drainAttachQueue();

    // Nothing can need evicting until something leaves the world.
    if (world.membership !== this.evictedMembership) {
      this.evictedMembership = world.membership;
      for (const id of this.views.keys()) {
        if (!world.entities.has(id)) {
          this.visibilityDirty = true;
          this.detach(id);
        }
      }
    }

    this.syncRipples(world);
    this.syncShadows(world);
    this.syncTargetRing(world);
    this.syncIcons();
  }

  /** Swap the head marker; its shared materials belong to the cache. */
  private async rebuildInteractionIcon(entity: Entity): Promise<void> {
    if (this.interactionIconUpdates.has(entity.id)) return;
    const view = this.views.get(entity.id);
    if (!view) return;
    // Claimed before the first await, so the next frame does not start a second rebuild.
    const wanted = entity.interactionIcon;
    view.iconPath = wanted;
    this.interactionIconUpdates.add(entity.id);
    try {
      // Resolve the new art before removing the old, so a changing mark never
      // leaves the giver bare-headed.
      const icon = wanted === undefined ? null : await this.interactionIcon(wanted);
      if (this.views.get(entity.id) !== view || view.iconPath !== wanted) return;

      if (view.interactionIcon) {
        view.object.remove(view.interactionIcon);
        this.icons.forget(entity.id);
        view.interactionIcon = undefined;
        view.iconBaseY = undefined;
        view.iconLines = undefined;
      }
      if (!icon) return;

      const bounds = new THREE.Box3().setFromObject(view.object);
      const bodyHeight =
        (bounds.max.y - bounds.min.y) / Math.max(Math.abs(view.object.scale.y), 1e-4);
      const height = Math.max(bodyHeight, 1);
      const iconBaseY = namePlateHeight(view.object, height);
      view.iconBaseY = iconBaseY;
      view.iconLines = 0;
      const sprite = new THREE.Sprite(icon);
      sprite.position.set(0, HeadIcons.heightFor(iconBaseY, 0), 0);
      sprite.scale.setScalar(Math.min(1.1, Math.max(0.55, height * 0.24)));
      sprite.renderOrder = 20;
      sprite.userData.entityId = entity.id;
      view.object.add(sprite);
      view.interactionIcon = sprite;
      refreshWorldMatrix(view.object);
    } finally {
      this.interactionIconUpdates.delete(entity.id);
    }
  }

  /** Point the quest guide arrow, or hide it with `null`; driven every frame from the game loop. */
  setGuideArrow(placement: { position: [number, number, number]; yaw: number } | null): void {
    if (!placement) {
      if (this.guideArrow) this.guideArrow.visible = false;
      return;
    }
    if (!this.guideArrow) {
      // Built on first use: most sessions never track a quest.
      if (!this.guideArrowLoading) {
        this.guideArrowLoading = true;
        void this.build(GUIDE_MODEL, undefined, placement.position)
          .then(prototype => {
            if (!prototype || this.guideArrow) return;
            const object = prototype.object.clone(true);
            object.scale.setScalar(GUIDE_SCALE);
            object.renderOrder = 7;
            this.guideArrow = object;
            this.scene.add(object);
          })
          .catch(error => log.warn(`quest guide arrow: ${String(error)}`));
      }
      return;
    }
    this.guideArrow.visible = true;
    this.guideArrow.position.set(...placement.position);
    this.guideArrow.rotation.set(0, placement.yaw, 0);
    this.guideArrow.updateMatrixWorld();
  }

  pickEntity(clientX: number, clientY: number): EntityId | null {
    return this.pickEntityObject(clientX, clientY, false);
  }

  /**
   * Project a world position to screen coordinates.
   *
   * Returns `{ x, y }` in CSS pixels, or null if the point is behind the camera.
   */
  projectToScreen(wx: number, wy: number, wz: number): { x: number; y: number } | null {
    const v = new THREE.Vector3(wx, wy, wz);
    v.project(this.rig.camera);
    if (v.z > 1) return null;
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((v.x + 1) / 2) * rect.width + rect.left,
      y: ((-v.y + 1) / 2) * rect.height + rect.top,
    };
  }

  /** Speech stands at the top of the speaker's box; an unbuilt body uses a plain height. */
  chatHeight(id: EntityId): number {
    const view = this.views.get(id);
    if (!view) return UNBUILT_BODY_HEIGHT;
    const box = bodyBox(view.object);
    if (box.isEmpty()) return UNBUILT_BODY_HEIGHT;
    const above = box.max.y - view.object.position.y;
    return above > 0 ? above : UNBUILT_BODY_HEIGHT;
  }

  pickInteractionEntity(clientX: number, clientY: number): EntityId | null {
    return this.pickEntityObject(clientX, clientY, true);
  }

  /** Entity under a canvas point; spell-effect subtrees are skipped and never occlude. */
  private pickEntityObject(clientX: number, clientY: number, iconOnly: boolean): EntityId | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.rig.camera);
    // Body roots and icon statics only, never the player, whose body would
    // eat clicks beside the camera.
    const selfId = this.world?.player?.id;
    const selectable = [...this.views.entries()]
      .filter(
        ([id, view]) =>
          id !== selfId && !view.batch && isPickableEntity(this.world?.entities.get(id)),
      )
      .map(([, view]) => view);
    // Only bodies the ray passes near are worth re-measuring.
    for (const view of selectable) {
      const size = view.bodyBounds?.size;
      const reach = size ? Math.max(size.x, size.y, size.z) + PICK_REMEASURE_MARGIN : Infinity;
      if (raycaster.ray.distanceToPoint(view.object.position) <= reach) {
        refreshSkinnedBounds(view.object);
      }
    }
    const hits = raycaster.intersectObjects(
      selectable.map(view => view.object),
      true,
    );
    for (const hit of hits) {
      const isSprite = (hit.object as THREE.Sprite).isSprite === true;
      if (iconOnly !== isSprite) continue;
      const id = ownerOfPick(hit.object, this.entityGroup);
      if (id === null || id === selfId) continue;
      // Effects and unbatched scenery neither select nor occlude.
      if (isPickableEntity(this.world?.entities.get(id))) return id;
    }
    return null;
  }

  private syncShadows(world: World): void {
    if (!this.shadows || this.graphics.shadows !== 'blob') return;
    const hero =
      world.player?.position ??
      ([this.rig.camera.position.x, this.rig.camera.position.y, this.rig.camera.position.z] as [
        number,
        number,
        number,
      ]);
    const blobs = collectShadows(
      {
        movers: world.movers,
        groundPoint: (x, z, fromY) => world.groundPoint(x, z, fromY),
        waterStateAt: (x, z, groundY) => world.terrain.waterStateAt(x, z, groundY),
      },
      { x: hero[0], z: hero[2] },
      id => this.views.get(id)?.shadowExtents,
      this.shadowGround,
    );
    this.shadows.set(blobs);
  }

  /** Ring the selected unit, or none. Reselecting restarts the pop. */
  setTargetEntity(id: EntityId | null, relation: Relation = 'bystander'): void {
    if (id === null) {
      this.target = null;
      this.targetRing?.clear();
      return;
    }
    if (this.target?.id === id) {
      // Same unit, changed relationship: no new pop.
      this.target = { ...this.target, relation };
      return;
    }
    this.target = { id, relation, since: performance.now() };
  }

  /** Colour a player's always-on name; an unbuilt label is picked up by the next call. */
  setPlayerNameRelation(id: EntityId, relation: Relation): void {
    const label = this.views.get(id)?.nameLabel;
    if (label) recolourNameLabel(label, playerNameColour(relation));
  }

  private syncTargetRing(world: World): void {
    if (!this.targetRing) return;
    const target = this.target;
    if (!target) {
      this.targetRing.set(null);
      this.clearTargetLabel();
      return;
    }
    const entity = world.entities.get(target.id);
    // A despawned target takes its ring, even for the frame before the app clears it.
    if (!entity || (entity.kind !== 'creature' && entity.kind !== 'player')) {
      this.targetRing.set(null);
      this.clearTargetLabel();
      return;
    }
    const view = this.views.get(target.id);
    this.syncTargetLabel(entity, target.relation, view);
    this.targetRing.set(
      placeRing(
        {
          groundPoint: (x, z, fromY) => world.groundPoint(x, z, fromY),
          waterStateAt: (x, z, groundY) => world.terrain.waterStateAt(x, z, groundY),
        },
        entity,
        view?.shadowExtents,
        target.relation,
        performance.now() - target.since,
        // A corpse is ringed at its box centre, not where it stood.
        target.relation === 'corpse' && view?.bodyBounds
          ? view.object.position.y + view.bodyBounds.centreOffsetY
          : undefined,
      ),
    );
  }

  /** Rebuilt only on a change, since building rasterises a canvas; players have their own label. */
  private syncTargetLabel(entity: Entity, relation: Relation, view: EntityView | undefined): void {
    // No name for the dead, the nameless or the stealthed.
    const name = entity.networkName;
    if (!name || relation === 'corpse' || !view || view.nameLabel || entity.networkStealthed) {
      this.clearTargetLabel();
      return;
    }
    const subName = entity.networkSubName || undefined;
    this.setIconLines(entity.id, subName ? 2 : 1);
    const colour = NAME_COLOURS[relation];
    const key = `${name}|${subName ?? ''}|${colour}`;
    if (this.targetLabel?.id === entity.id && this.targetLabel.key === key) {
      // The sprite is outside the frozen subtree; push its matrix by hand.
      updateNameLabelMatrix(view.object, this.targetLabel.sprite);
      return;
    }
    this.clearTargetLabel();

    const height = view.bodyBounds ? view.bodyBounds.size.y : 0;
    const sprite = unitNameLabel(name, subName, colour, namePlateHeight(view.object, height));
    this.entityGroup.add(sprite);
    sprite.matrixAutoUpdate = false;
    sprite.matrixWorldAutoUpdate = false;
    updateNameLabelMatrix(view.object, sprite);
    this.targetLabel = { id: entity.id, key, sprite };
  }

  private redrawNameLabels(): void {
    for (const view of this.views.values()) {
      if (view.nameLabel) redrawNameLabel(view.nameLabel);
    }
    if (this.targetLabel) redrawNameLabel(this.targetLabel.sprite);
  }

  private clearTargetLabel(): void {
    const label = this.targetLabel;
    if (!label) return;
    this.setIconLines(label.id, 0);
    this.entityGroup.remove(label.sprite);
    const material = label.sprite.material as THREE.SpriteMaterial;
    material.map?.dispose();
    material.dispose();
    this.targetLabel = null;
  }

  /** Glide a head icon to clear this many nameplate lines (`HeadIcons`). */
  private setIconLines(id: EntityId, lines: LinesUnderIcon): void {
    const view = this.views.get(id);
    if (!view?.interactionIcon || view.iconBaseY === undefined) return;
    if (view.iconLines === lines) return;
    view.iconLines = lines;
    this.icons.start(
      id,
      view.interactionIcon.position.y,
      HeadIcons.heightFor(view.iconBaseY, lines),
      performance.now(),
    );
  }

  private syncIcons(): void {
    const now = performance.now();
    // The bob shifts the quad via `center`, leaving frozen matrices alone.
    for (const [id, view] of this.views) {
      const icon = view.interactionIcon;
      if (!icon) continue;
      icon.center.set(0.5, 0.5 - iconBob(now, id) / icon.scale.y);
    }
    this.icons.advance(now, (id, y) => {
      const icon = this.views.get(id)?.interactionIcon;
      if (!icon) return false;
      icon.position.y = y;
      // The subtree is frozen, so push a moved child's matrix through by hand.
      if (icon.parent) {
        icon.updateMatrix();
        icon.matrixWorld.multiplyMatrices(icon.parent.matrixWorld, icon.matrix);
      }
      return true;
    });
  }

  /** Ripples where the player wades or floats; not when diving deep. */
  private syncRipples(world: World): void {
    const ripples = this.ripples;
    const player = world.player;
    if (!ripples || !player) return;

    const [x, y, z] = player.position;
    const water = world.waterAt(x, z);
    const atWaterline =
      water.surface !== null &&
      water.swimLine !== null &&
      y < water.surface &&
      y >= water.swimLine - 0.5;

    if (atWaterline) {
      const last = this.lastPlayerPos;
      const travelled = last ? Math.hypot(x - last[0], z - last[2]) : 0;
      if (!this.wasAtWaterline) ripples.spawn(x, water.surface!, z, 2.2);
      else ripples.trail(x, water.surface!, z, travelled, this.previousFrameSeconds);
    } else if (this.wasAtWaterline && water.surface !== null) {
      ripples.spawn(x, water.surface, z, 1.8);
    }

    this.wasAtWaterline = atWaterline;
    this.lastPlayerPos = [x, y, z];
  }

  /** At most `attachesPerFrame` queued views, closest first. */
  private drainAttachQueue(): void {
    const cap = this.attachDispatchCap();
    // Bounded per frame and by attachments still resolving; a per-frame bound
    // alone floods the worker and buries the nearest body's model.
    const room = ATTACH_IN_FLIGHT_MULTIPLE * cap - this.attachesInFlight;
    const budget = Math.min(cap, room, this.attachQueue.length);
    if (budget <= 0) return;
    // Bursts arrive in tile order; sort so `pop()` drains nearest-first.
    if (this.attachQueue.length > budget) orderForPop(this.attachQueue, this.rig.target);
    for (let i = 0; i < budget; i++) {
      const entity = this.attachQueue.pop();
      if (entity) {
        void this.attach(entity);
        this.handedToAttach++;
      }
    }
  }

  private attachDispatchCap(): number {
    const base = this.graphics.attachesPerFrame;
    const pendingTextures = this.pendingTextures;
    if (pendingTextures >= ATTACH_THROTTLE_TEXTURES_HARD) return Math.max(1, Math.floor(base / 4));
    if (pendingTextures >= ATTACH_THROTTLE_TEXTURES) return Math.max(1, Math.floor(base / 2));
    return base;
  }

  /** Queued plus in-flight attaches: dispatch is sync, fetch and decode async. */
  get pendingAttachments(): number {
    return pendingAttachmentCount(this.attachQueue.length, this.attachesInFlight);
  }

  /**
   * Monotonic count handed to `attach()`. `pendingAttachments` sits near budget
   * for most of a dense drain, so a loading screen paces on this delta.
   */
  get attachedSoFar(): number {
    return this.handedToAttach;
  }

  get waterfallStatus(): { total: number; textured: number } {
    return this.materials.waterfallStatus;
  }

  effectReport(): Array<Record<string, unknown>> {
    const at = new THREE.Vector3();
    return this.effects
      .map(e => {
        e.object.updateWorldMatrix(true, false);
        at.setFromMatrixPosition(e.object.matrixWorld);
        const scale = new THREE.Vector3();
        e.object.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        return {
          path: this.effectPaths.get(e.instance) ?? '(unknown)',
          position: [Number(at.x.toFixed(1)), Number(at.y.toFixed(1)), Number(at.z.toFixed(1))],
          placedScale: Number(scale.x.toFixed(2)),
          distance: Number(at.distanceTo(this.rig.camera.position).toFixed(1)),
          visible: e.object.visible,
          emitters: e.instance.report(),
        };
      })
      .sort((a, b) => (a.distance as number) - (b.distance as number));
  }

  /** Poles at every placed effect's origin, emitting or not; returns how many. */
  markEffects(on: boolean): number {
    if (this.effectMarkers) {
      this.scene.remove(this.effectMarkers);
      this.effectMarkers.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      });
      this.effectMarkers = null;
    }
    if (!on) return 0;

    const group = new THREE.Group();
    group.name = 'effect-markers';
    const material = new THREE.MeshBasicMaterial({
      color: 0xff00ff,
      depthTest: false,
      transparent: true,
      opacity: 0.85,
    });
    const at = new THREE.Vector3();
    for (const e of this.effects) {
      e.object.updateWorldMatrix(true, false);
      at.setFromMatrixPosition(e.object.matrixWorld);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.25, 8, 0.25), material);
      pole.position.copy(at).setY(at.y + 4);
      pole.renderOrder = 999;
      group.add(pole);
      const ball = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), material);
      ball.position.copy(at);
      ball.renderOrder = 999;
      group.add(ball);
    }
    this.scene.add(group);
    this.effectMarkers = group;
    return this.effects.length;
  }

  hasView(id: EntityId): boolean {
    return this.views.has(id);
  }

  /**
   * False before a model arrives and for models with no clips. `setEntityClip`
   * is a silent no-op then, so sequencers must ask first.
   */
  isAnimated(id: EntityId): boolean {
    const view = this.views.get(id);
    return view?.mixer !== undefined && view.modelPath !== undefined;
  }

  /** The clip the renderer applied, which may differ from the one asked (silent misses). */
  clipOf(id: EntityId): string | null {
    return this.views.get(id)?.clipName ?? null;
  }

  get pendingTextures(): number {
    return this.materials.pendingCount;
  }

  /** Switch an entity's clip once it has loaded. */
  async setEntityClip(entityId: EntityId, clipName: string, rate = 1, once = false): Promise<void> {
    const view = this.views.get(entityId);
    if (!view?.mixer || !view.modelPath) return;
    if (view.mount) {
      view.baseAsk = { clip: clipName, rate, once };
      await this.setMountClip(view, view.mount, clipName, rate, once);
      return;
    }
    // Resolved before comparing: two weapons answer one ask with different clips.
    const wanted = combatClipName(clipName, view.weapons ?? null);
    // Recorded first: a finished combat clip returns to it.
    view.baseAsk = { clip: clipName, rate, once };
    // The base asks again only when the movement state changed.
    const turn = onNewBaseClip(view.overlay?.span, clipName);
    if (turn === 'wait') return;
    if (turn === 'giveBack') this.dropOverlay(entityId, view);
    // Beside a running action the base drives only the legs.
    const part = turn === 'legsOnly' ? 'lower' : null;
    const key = part ? `${wanted}#${part}` : wanted;
    if (view.clipName === key && view.clipRate === rate) return;

    const clip = await this.loadClip(view.modelPath, wanted, part, view.upperBones);
    if (!clip) return;
    if (!view.mixer) return;

    const previous = view.action;
    const action = view.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveTimeScale(rate);
    action.setEffectiveWeight(1);
    // A zero-length hold pose plays once and clamps; looping it divides by zero.
    const held = once || clip.duration <= 0;
    action.loop = held ? THREE.LoopOnce : THREE.LoopRepeat;
    action.clampWhenFinished = held;
    action.play();
    // No warped fade against a zero-length clip: it NaNs the outgoing action and
    // kills the animation for the session (14 mounts ship a zero-length `jump_air`).
    if (previous && previous !== action) {
      const warp = clip.duration > 0 && previous.getClip().duration > 0;
      previous.crossFadeTo(action, CLIP_FADE, warp);
    }

    view.action = action;
    view.clipName = key;
    view.clipRate = rate;
  }

  /** Hold a clip's final pose with no crossfade, for a body already dead when first seen. */
  async poseEntityClip(entityId: EntityId, clipName: string): Promise<void> {
    const view = this.views.get(entityId);
    if (!view?.mixer || !view.modelPath) return;
    const wanted = combatClipName(clipName, view.weapons ?? null);
    const clip = await this.loadClip(view.modelPath, wanted, null, null);
    if (!clip || !view.mixer) return;
    const action = view.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveWeight(1);
    action.loop = THREE.LoopOnce;
    action.clampWhenFinished = true;
    action.play();
    action.time = Math.max(0, clip.duration);
    view.action = action;
    view.clipName = wanted;
    view.clipRate = 1;
  }

  /** A combat clip over the legs; `allBody` takes the whole body, as do spineless models. */
  async setEntityAction(
    entityId: EntityId,
    clipName: string,
    options: { hold?: boolean; allBody?: boolean } = {},
  ): Promise<void> {
    const view = this.views.get(entityId);
    if (!view?.mixer || !view.modelPath) return;
    // Stale if anything cancels an action before the clip arrives (`actionSeq`).
    const seq = view.actionSeq ?? 0;

    // Whole-body combat stays an overlay, so the base knows what to return to.
    const span = actionSpan({
      wholeBody: options.allBody === true,
      hasSpine: !!view.upperBones,
      baseClip: view.baseAsk?.clip,
    });
    const wholeBody = spanCoversWholeBody(span);
    const wanted = combatClipName(clipName, view.weapons ?? null);
    const load = (name: string): Promise<THREE.AnimationClip | null> =>
      wholeBody
        ? this.loadClip(view.modelPath!, name)
        : this.loadClip(view.modelPath!, name, 'upper', view.upperBones);
    /* Suffixed name first, then bare; a missing clip fails silently to standing. */
    let clip = await load(wanted);
    if (!clip && wanted !== clipName) clip = await load(clipName);
    if (this.views.get(entityId) !== view || (view.actionSeq ?? 0) !== seq) return;
    if (!clip || !view.mixer) return;
    // Nothing above the waist: play it whole rather than not at all.
    if (!wholeBody && clip.tracks.length === 0) {
      await this.setEntityAction(entityId, clipName, { ...options, allBody: true });
      return;
    }

    const previous = view.overlay;
    const action = view.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveWeight(1);
    const held = options.hold === true || clip.duration <= 0;
    action.loop = held ? THREE.LoopRepeat : THREE.LoopOnce;
    if (clip.duration <= 0) action.loop = THREE.LoopOnce;
    action.clampWhenFinished = !held;
    action.play();
    if (previous && previous.action !== action) {
      previous.action.stop();
    }
    view.overlay = {
      ask: clipName,
      action,
      until: held ? null : performance.now() + Math.max(clip.duration, 0.1) * 1000,
      span,
    };
    this.withActions.add(entityId);

    if (wholeBody) {
      // Two actions on one bone average to a pose that is neither.
      view.action?.stop();
      view.action = undefined;
      view.clipName = undefined;
      return;
    }

    const base = view.baseAsk;
    if (base) {
      view.clipName = undefined;
      await this.setEntityClip(entityId, base.clip, base.rate, base.once);
    }
  }

  /** Hang an item in a body's hand for show, replacing any held before; never worn, so never sheathed. */
  async holdItem(entityId: EntityId, entry: number): Promise<void> {
    const view = this.views.get(entityId);
    if (!view?.modelPath) return;
    this.dropHeldItem(entityId);
    const seq = view.propSeq ?? 0;
    const attachments = await this.resources.tryGet<'heldItem'>(heldItemId(entry));
    if (this.views.get(entityId) !== view || view.propSeq !== seq || !attachments) return;
    const props: THREE.Object3D[] = [];
    await this.attachEquipment(
      view.object,
      entityId,
      view.modelPath,
      attachments,
      undefined,
      this.zoneSeq,
      props,
    );
    if (this.views.get(entityId) === view && view.propSeq === seq) view.heldProps = props;
    // Dropped while it loaded. The clones share the prototype's GPU data, so removal is enough.
    else for (const prop of props) prop.removeFromParent();
  }

  dropHeldItem(entityId: EntityId): void {
    const view = this.views.get(entityId);
    if (!view) return;
    view.propSeq = (view.propSeq ?? 0) + 1;
    for (const prop of view.heldProps ?? []) prop.removeFromParent();
    view.heldProps = undefined;
  }

  fadeOutEntity(entityId: EntityId): void {
    const view = this.views.get(entityId);
    if (!view) return;
    view.leaving = true;
    this.setShown(entityId, view, false);
  }

  /** Only a cast wind-up holds an endless clip. */
  hasHeldAction(entityId: EntityId): boolean {
    return this.views.get(entityId)?.overlay?.until === null;
  }

  /** Take an action off; the generation bumps either way, as the clip may still be loading. */
  private dropOverlay(entityId: EntityId, view: EntityView): boolean {
    view.actionSeq = (view.actionSeq ?? 0) + 1;
    if (!view.overlay) return false;
    view.overlay.action.stop();
    view.overlay = undefined;
    this.withActions.delete(entityId);
    return true;
  }

  clearEntityAction(entityId: EntityId): void {
    const view = this.views.get(entityId);
    if (!view) return;
    if (!this.dropOverlay(entityId, view)) return;
    const base = view.baseAsk;
    if (!base) return;
    view.clipName = undefined;
    // The posture may still be active; restoring idle for a frame would drop a wand's aim.
    const postureClip =
      view.combatStance === 'ranged'
        ? 'combat_aim'
        : view.combatStance === 'melee'
          ? 'combat_ready'
          : base.clip;
    void this.setEntityClip(entityId, postureClip, base.rate, base.once);
  }

  /** Retire finished swings; a held wind-up waits to be cleared. */
  private sweepActions(): void {
    if (this.withActions.size === 0) return;
    const now = performance.now();
    for (const id of [...this.withActions]) {
      const until = this.views.get(id)?.overlay?.until;
      // Absent: the view has gone. Null: a held clip, waiting to be cleared.
      if (until === undefined) this.withActions.delete(id);
      else if (until !== null && now >= until) this.clearEntityAction(id);
    }
  }

  /** Null for a creature. A change clears the recorded clip so the next request is not deduplicated. */
  setEntityWeapons(entityId: EntityId, weapons: EquippedWeapons | null): void {
    const view = this.views.get(entityId);
    if (!view) {
      this.pendingWeapons.set(entityId, weapons);
      return;
    }
    const before = view.weapons;
    if (
      before !== undefined &&
      before?.mainhand === weapons?.mainhand &&
      before?.offhand === weapons?.offhand &&
      before?.ranged === weapons?.ranged
    )
      return;
    const active = view.overlay
      ? {
          ask: view.overlay.ask,
          hold: view.overlay.until === null,
          allBody: spanCoversWholeBody(view.overlay.span),
        }
      : null;
    // Combat clips resolve to new names; anything loading under the old weapon is stale.
    view.actionSeq = (view.actionSeq ?? 0) + 1;
    if (active) {
      const overlay = view.overlay!;
      overlay.action.stop();
      view.overlay = undefined;
      this.withActions.delete(entityId);
    }
    view.weapons = weapons;
    view.clipName = undefined;
    this.setEntityWeaponState(entityId, weapons);
    if (active) void this.setEntityAction(entityId, active.ask, active);
  }

  setEntityCombatStance(entityId: EntityId, stance: 'melee' | 'ranged' | null): void {
    const view = this.views.get(entityId);
    if (!view) {
      this.pendingStances.set(entityId, stance);
      return;
    }
    view.combatStance = stance;
    this.setEntityWeaponState(entityId, view.weapons ?? null);
  }

  private setEntityWeaponState(entityId: EntityId, weapons: EquippedWeapons | null): void {
    const view = this.views.get(entityId);
    if (!view?.equipmentObjects) return;
    const held = (slot: WornSlot): boolean => {
      if (!weapons) return false;
      // Not the animation suffix: an empty ranged slot and a wand both resolve
      // to `thrown`, but only a wand has a mesh to move.
      if (slot === 'ranged') return view.combatStance === 'ranged';
      return view.combatStance === 'melee';
    };
    for (const entry of view.equipmentObjects) {
      if (!HELD_SLOTS.has(entry.slot)) continue;
      const wantHeld = held(entry.slot);
      const node = wantHeld
        ? findAttachmentNode(view.object, entry.heldNode ?? 'Dummy_R_Hand-node')
        : entry.foldedHost;
      if (node && entry.object.parent !== node) node.add(entry.object);
      if (node && wantHeld) {
        // Changing host keeps the authored scale; only the relative transform clears.
        entry.object.matrixAutoUpdate = true;
        const scale = entry.object.scale.clone();
        entry.object.position.set(0, 0, 0);
        entry.object.quaternion.identity();
        entry.object.scale.copy(scale);
      } else if (node) {
        entry.object.matrixAutoUpdate = false;
        entry.object.matrix.copy(entry.folded);
      }
      entry.object.visible = true;
    }
  }

  /** Change the playing clip's rate in place: `setEntityClip` would restart the stride. */
  setEntityClipRate(entityId: EntityId, rate: number): void {
    const view = this.views.get(entityId);
    if (!view?.action || view.clipRate === rate) return;
    view.action.setEffectiveTimeScale(rate);
    view.clipRate = rate;
  }

  /** The base clip's phase, 0..1, and where its feet come down; footfalls measured once per clip. */
  stride(entityId: EntityId): { phase: number; footfalls: readonly number[] } | null {
    const view = this.views.get(entityId);
    const action = view?.action;
    if (!view?.object || !view.modelPath || !action) return null;
    const clip = action.getClip();
    if (clip.duration <= 0) return null;
    const key = `${view.modelPath}#${clip.name}`;
    let footfalls = this.footfallCache.get(key);
    if (!footfalls) {
      footfalls = footfallPhases(view.object, clip);
      this.footfallCache.set(key, footfalls);
      // Measuring posed the body; restore its pose.
      view.mixer?.update(0);
    }
    if (!footfalls.length) return null;
    return { phase: (action.time % clip.duration) / clip.duration, footfalls };
  }

  weaponsOf(entityId: EntityId): EquippedWeapons | null {
    return this.views.get(entityId)?.weapons ?? null;
  }

  /** A loaded clip's length, or null; never starts a load (asked every frame). */
  clipLength(entityId: EntityId, clipName: string): number | null {
    const view = this.views.get(entityId);
    if (view?.mount) return this.clipCache.get(view.mount.modelPath)?.get(clipName)?.duration ?? null;
    if (!view?.modelPath) return null;
    const wanted = combatClipName(clipName, view.weapons ?? null);
    return this.clipCache.get(view.modelPath)?.get(wanted)?.duration ?? null;
  }

  /** Seat a body on the `mountprototype` row `mountId` names, or with 0 set it back on its feet. */
  async setEntityMount(entityId: EntityId, mountId: number): Promise<void> {
    this.mountAsks.set(entityId, mountId);
    const rows = mountId > 0 ? await this.resources.mountList().catch(() => []) : [];
    if (this.mountAsks.get(entityId) !== mountId) return;
    if (mountId === 0) this.mountAsks.delete(entityId);
    await this.seatOn(entityId, rows.find(row => row.id === mountId) ?? null);
  }

  private async seatOn(entityId: EntityId, row: MountRow | null): Promise<void> {
    const view = this.views.get(entityId);
    if (!view?.attached) {
      if (row) this.pendingMounts.set(entityId, row);
      else this.pendingMounts.delete(entityId);
      return;
    }
    if ((view.mount?.row.id ?? null) === (row?.id ?? null)) return;
    const seq = (view.mountSeq ?? 0) + 1;
    view.mountSeq = seq;
    this.dropMount(entityId, view);
    if (!row) return;

    const prototype = await this.modelPrototype(row.model, {
      skin: row.texture,
      meshes: [],
      skinReplacesAll: true,
      key: `skin:${row.texture}`,
    });
    if (!prototype || this.views.get(entityId) !== view || view.mountSeq !== seq) return;
    const object = prototype.skinned ? cloneSkinned(prototype.object) : prototype.object.clone(true);
    object.traverse(node => {
      if ((node as THREE.Mesh).isMesh) node.castShadow = true;
    });
    object.matrixWorldAutoUpdate = false;
    this.entityGroup.add(object);
    const mixer = new THREE.AnimationMixer(object);
    this.animated.push({ mixer, object });
    const mount: Ridden = {
      row,
      object,
      mixer,
      modelPath: row.model,
      seat: findAttachmentNode(object, SEAT),
      ground: view.object.position.clone(),
      facing: view.object.quaternion.clone(),
    };
    view.mount = mount;
    this.riders.add(entityId);
    this.seatRider(view);
    await this.playRiderClip(view, mount);
    const ask = view.baseAsk;
    if (ask && view.mount === mount) await this.setMountClip(view, mount, ask.clip, ask.rate, ask.once);
  }

  /** The mount where the body stands, and the body up on its seat. */
  private seatRider(view: EntityView): void {
    const mount = view.mount!;
    mount.object.position.copy(mount.ground);
    mount.object.quaternion.copy(mount.facing);
    refreshWorldMatrix(mount.object);
    if (mount.seat) mount.seat.getWorldPosition(view.object.position);
    else view.object.position.copy(mount.ground);
    view.object.quaternion.copy(mount.facing);
    refreshWorldMatrix(view.object);
    if (view.nameLabel) updateNameLabelMatrix(view.object, view.nameLabel);
  }

  /** Put the body back on its own feet where the mount stood; `standUp` replays what it was doing. */
  private dropMount(entityId: EntityId, view: EntityView, standUp = true): void {
    const mount = view.mount;
    this.riders.delete(entityId);
    if (!mount) return;
    view.mount = undefined;
    mount.mixer.stopAllAction();
    const at = this.animated.findIndex(a => a.mixer === mount.mixer);
    if (at >= 0) this.animated.splice(at, 1);
    mount.object.removeFromParent();
    view.object.position.copy(mount.ground);
    view.object.quaternion.copy(mount.facing);
    refreshWorldMatrix(view.object);
    if (view.nameLabel) updateNameLabelMatrix(view.object, view.nameLabel);
    // The body's next ask is played again rather than taken as already playing.
    view.clipName = undefined;
    const ask = view.baseAsk;
    if (ask && standUp) void this.setEntityClip(entityId, ask.clip, ask.rate, ask.once);
  }

  private async playRiderClip(view: EntityView, mount: Ridden): Promise<void> {
    if (!view.mixer || !view.modelPath) return;
    const clip = await this.loadClip(view.modelPath, RIDER_CLIP);
    if (!clip || !view.mixer || view.mount !== mount) return;
    if (view.overlay) {
      view.overlay.action.stop();
      view.overlay = undefined;
    }
    const action = view.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveWeight(1);
    action.loop = THREE.LoopRepeat;
    action.play();
    if (view.action && view.action !== action) view.action.crossFadeTo(action, CLIP_FADE, false);
    view.action = action;
    view.clipName = RIDER_CLIP;
    view.clipRate = 1;
  }

  private async setMountClip(
    view: EntityView,
    mount: Ridden,
    clipName: string,
    rate: number,
    once: boolean,
  ): Promise<void> {
    if (mount.clipName === clipName && mount.clipRate === rate) return;
    const clip = await this.loadClip(mount.modelPath, clipName);
    if (!clip || view.mount !== mount) return;
    const previous = mount.action;
    const action = mount.mixer.clipAction(clip);
    action.reset();
    action.setEffectiveTimeScale(rate);
    action.setEffectiveWeight(1);
    const held = once || clip.duration <= 0;
    action.loop = held ? THREE.LoopOnce : THREE.LoopRepeat;
    action.clampWhenFinished = held;
    action.play();
    if (previous && previous !== action) {
      const warp = clip.duration > 0 && previous.getClip().duration > 0;
      previous.crossFadeTo(action, CLIP_FADE, warp);
    }
    mount.action = action;
    mount.clipName = clipName;
    mount.clipRate = rate;
  }

  private async loadClip(
    modelPath: string,
    clipName: string,
    part: 'upper' | 'lower' | null = null,
    upperBones: ReadonlySet<string> | null = null,
  ): Promise<THREE.AnimationClip | null> {
    let byModel = this.clipCache.get(modelPath);
    if (!byModel) {
      byModel = new Map();
      this.clipCache.set(modelPath, byModel);
    }
    // Halves are cached beside the whole, so a direction change is no filter pass.
    const key = part ? `${clipName}#${part}` : clipName;
    const cached = byModel.get(key);
    if (cached) return cached;

    if (this.options.animate === false) return null;

    if (part) {
      const whole = await this.loadClip(modelPath, clipName);
      if (!whole || !upperBones) return whole;
      const split = splitClip(whole, upperBones, part);
      byModel.set(key, split);
      return split;
    }

    // Fallbacks are cached under the asked-for name, the vocabulary callers use.
    for (const name of [clipName, ...fallbacksFor(clipName)]) {
      const clipData = await this.resources.animation(modelPath, name);
      if (!clipData || clipData.tracks.length === 0) continue;
      const clip = toThreeClip(clipData);
      byModel.set(clipName, clip);
      if (name !== clipName) {
        log.once(
          'info',
          `clip-fallback:${modelPath}:${clipName}`,
          `${modelPath} has no ${clipName}; using ${name}`,
        );
      }
      return clip;
    }
    return null;
  }

  private async attach(entity: Entity): Promise<void> {
    this.attachesInFlight++;
    try {
      await this.attachView(entity);
    } finally {
      this.attachesInFlight--;
    }
  }

  private async attachView(entity: Entity): Promise<void> {
    const seq = this.zoneSeq;
    if (entity.kind === 'effect') {
      await this.attachEffect(entity, seq);
      return;
    }
    const prototype = await this.prototype(entity);
    // Checked before the view: a dropped entity's view lingers until the next `sync`.
    if (seq !== this.zoneSeq) return;
    const view = this.views.get(entity.id);
    if (!prototype || !view) return;

    view.small = isSmallScenery(entity.kind, prototype.height, entity.scale[1]);
    view.landmark = isLandmark(entity.kind, prototype.height, entity.scale[1]);
    if (view.small && !prototype.skinned) {
      // The first small placement decides for the shared prototype: always a
      // cut-out, so every placement batches; blend returns only up close.
      prototype.foliage = true;
      if (!prototype.foliageCutout) {
        prototype.foliageCutout = true;
        swapFoliage(prototype.object, this.materials, true);
      }
    }
    if (isBatchableStatic(entity, prototype)) {
      const key = `${entity.model}#${entity.appearance?.key ?? ''}`;
      const batch = this.staticBatches.get(key) ?? this.newStaticBatch(key, prototype);
      const object = new THREE.Group();
      applyTransform(object, entity);
      object.userData.entityId = entity.id;
      view.object = object;
      view.batch = batch;
      view.batchIndex = appendEntry(batch, { id: entity.id, object, visible: true });
      view.batchVisible = true;
      view.shadowExtents = prototype.shadowExtents;
      view.version = entity.version;
      this.visibilityDirty = true;
      return;
    }

    // `SkeletonUtils.clone` rebuilds bones and rebinds the skin; `clone` does not.
    const object = prototype.skinned
      ? cloneSkinned(prototype.object)
      : prototype.object.clone(true);
    applyTransform(object, entity);
    view.object = object;
    object.userData.entityId = entity.id;
    view.skinned = prototype.skinned;
    view.shadowExtents = prototype.shadowExtents;
    // Missed the batch, so it pays its own draw anyway: follow the profile's
    // blend setting rather than the cut-out.
    if (view.small) swapFoliage(object, this.materials, this.foliageCutout);
    object.traverse(node => {
      if ((node as THREE.Mesh).isMesh) node.castShadow = true;
    });
    view.version = entity.version;
    // Characters ship combat clips per weapon, creatures under bare names.
    // Unarmed until equipment resolves; keep weapons that arrived early.
    if (view.weapons === undefined) {
      view.weapons =
        this.pendingWeapons.get(entity.id) ?? (entity.kind === 'player' ? UNARMED : null);
      this.pendingWeapons.delete(entity.id);
    }
    if (view.combatStance === undefined && this.pendingStances.has(entity.id)) {
      view.combatStance = this.pendingStances.get(entity.id)!;
      this.pendingStances.delete(entity.id);
    }
    this.entityGroup.add(object);

    // Recorded even with no icon, so `sync` tells "no marker" from "not built".
    view.iconPath = entity.interactionIcon;
    if (entity.interactionIcon) {
      const icon = await this.interactionIcon(entity.interactionIcon);
      if (seq !== this.zoneSeq) return;
      if (icon && this.views.get(entity.id) === view) {
        const sprite = new THREE.Sprite(icon);
        const bounds = new THREE.Box3().setFromObject(object);
        const bodyHeight = (bounds.max.y - bounds.min.y) / Math.max(Math.abs(object.scale.y), 1e-4);
        const height = Math.max(bodyHeight, 1);
        view.iconBaseY = namePlateHeight(object, height);
        view.iconLines = 0;
        sprite.position.set(0, HeadIcons.heightFor(view.iconBaseY, 0), 0);
        const size = Math.min(1.1, Math.max(0.55, height * 0.24));
        sprite.scale.setScalar(size);
        sprite.renderOrder = 20;
        sprite.userData.entityId = entity.id;
        object.add(sprite);
        view.interactionIcon = sprite;
      }
    }

    if (entity.kind === 'player' && entity.networkName) {
      const bounds = new THREE.Box3().setFromObject(object);
      const bodyHeight = (bounds.max.y - bounds.min.y) / Math.max(Math.abs(object.scale.y), 1e-4);
      const label = unitNameLabel(
        entity.networkName,
        undefined,
        PLAYER_NAME_COLOUR,
        namePlateHeight(object, Math.max(bodyHeight, 1)),
      );
      this.entityGroup.add(label);
      view.nameLabel = label;
      label.matrixAutoUpdate = false;
      label.matrixWorldAutoUpdate = false;
      updateNameLabelMatrix(object, label);
    }

    await this.attachEquipment(
      object,
      entity.id,
      entity.model,
      entity.appearance?.attachments,
      entity.position,
      seq,
    );
    if (seq !== this.zoneSeq) return;
    this.setEntityWeaponState(entity.id, view.weapons ?? null);

    // Freeze the subtree: three's per-frame matrix walk over idle bones cost
    // more than drawing. `refreshWorldMatrix` updates it when something moves.
    refreshWorldMatrix(object);
    object.matrixWorldAutoUpdate = false;
    // Last: the budget needs the finished total.
    view.drawCount = countDraws(object);
    view.bodyBounds = measureBody(object);
    view.upperBones = upperBodyBones(object);
    // From here `sync` may replace the head marker without racing this build.
    view.attached = true;

    if (prototype.clip) {
      const mixer = new THREE.AnimationMixer(object);
      const action = mixer.clipAction(prototype.clip);
      action.play();
      // Scatter phases so a crowd does not breathe in unison.
      mixer.setTime(hashPhase(entity.id) * prototype.clip.duration);
      view.mixer = mixer;
      // Tracked, so `setEntityClip` can crossfade out of it.
      view.action = action;
      view.clipName = 'idle';
      view.modelPath = entity.model;
      this.animated.push({ mixer, object });
    }

    const ridden = this.pendingMounts.get(entity.id);
    if (ridden) {
      this.pendingMounts.delete(entity.id);
      void this.seatOn(entity.id, ridden);
    }
  }

  private interactionIcon(path: string): Promise<THREE.SpriteMaterial | null> {
    const existing = this.interactionIconMaterials.get(path);
    if (existing) return existing;
    const material = this.resources
      .texture(path)
      .then(data => {
        if (!data) return null;
        const texture = new THREE.Texture(data.image);
        texture.colorSpace = THREE.SRGBColorSpace;
        // Decoded pixels are top-left first; sprite UVs start at the bottom, and
        // some ImageBitmap paths ignore `flipY`, so invert UVs.
        texture.flipY = false;
        texture.repeat.set(1, -1);
        texture.offset.y = 1;
        texture.needsUpdate = true;
        return new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: true,
          depthWrite: false,
        });
      })
      .catch(() => null);
    this.interactionIconMaterials.set(path, material);
    return material;
  }

  async refreshAppearance(entity: Entity): Promise<void> {
    const old = this.views.get(entity.id);
    if (!old) return;
    const weapons = old.weapons;
    const combatStance = old.combatStance;
    const ridden = old.mount?.row;
    this.detach(entity.id);
    if (ridden) this.pendingMounts.set(entity.id, ridden);
    this.views.set(entity.id, {
      object: new THREE.Group(),
      version: -1,
      weapons,
      combatStance,
    });
    this.visibilityDirty = true;
    await this.attach(entity);
  }

  private async attachEquipment(
    body: THREE.Object3D,
    entityId: EntityId,
    bodyPath: string,
    attachments: readonly EquipmentAttachment[] | undefined,
    at?: readonly [number, number, number],
    seq = this.zoneSeq,
    props?: THREE.Object3D[],
  ): Promise<void> {
    if (!attachments?.length) return;
    for (const item of attachments) {
      // Each item costs a prototype build; a teleport must not pay for the old zone.
      if (seq !== this.zoneSeq) return;
      const key = `${item.model}|${item.texture ?? ''}`;
      let pending = this.equipmentPrototypes.get(key);
      if (!pending) {
        const appearance = item.texture
          ? { skin: item.texture, meshes: [], skinReplacesAll: true, key: `item:${key}` }
          : undefined;
        pending = this.build(item.model, appearance, at);
        this.equipmentPrototypes.set(key, pending);
      }
      const prototype = await pending;
      if (!prototype) continue;
      let host = findAttachmentNode(body, item.node);
      if (!host) {
        // Attachments hang off any node, not only bones; rebuild one from its
        // model-space matrix where `SkeletonData` did not keep it.
        const matrix = await this.resources.tryGet<'attachPoint'>(
          attachPointId(bodyPath, item.node),
        );
        if (matrix) {
          const staticHost = new THREE.Group();
          staticHost.applyMatrix4(rowMatrix(matrix));
          staticHost.matrixAutoUpdate = false;
          body.add(staticHost);
          host = staticHost;
        }
      }
      if (!host) {
        log.once(
          'warn',
          `equipment-node:${item.node}`,
          `equipment node ${item.node} is missing from character model`,
        );
        continue;
      }
      const object = prototype.skinned
        ? cloneSkinned(prototype.object)
        : prototype.object.clone(true);
      object.userData.equipmentSlot = item.slot;
      // Held items are not part of the body's box, which sizes its spells.
      markNotBody(object);
      if (item.mirrorX) object.scale.x *= -1;
      if (item.slot === 'head' || item.slot === 'shoulders') {
        object.traverse(child => {
          const mesh = child as THREE.Mesh;
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const material of materials) {
            if (material) material.side = THREE.DoubleSide;
          }
        });
      }
      if (item.alignNode) {
        const matrix = await this.resources.tryGet<'attachPoint'>(
          attachPointId(item.model, item.alignNode),
        );
        if (matrix) object.applyMatrix4(rowMatrix(matrix).invert());
      }
      object.matrixWorldAutoUpdate = true;
      host.add(object);
      if (props) {
        props.push(object);
        continue;
      }
      const view = this.views.get(entityId);
      object.updateMatrix();
      if (view)
        (view.equipmentObjects ??= []).push({
          object,
          slot: item.slot,
          heldNode: item.heldNode,
          folded: object.matrix.clone(),
          foldedHost: host,
        });
      for (const effect of item.effects ?? []) {
        const data = await this.resources.tryGet<'effect'>(effectId(effect.effect));
        if (!data) continue;
        const matrix = await this.resources.tryGet<'attachPoint'>(
          attachPointId(item.model, effect.node),
        );
        const effectHost = itemEffectHost(object, effect.node, matrix);
        const attach = (node: string): THREE.Object3D | null => {
          const found = findAttachmentNode(object, node);
          if (found) return found;
          return null;
        };
        const instance = new EffectInstance(
          data,
          def => this.effectMaterial(def),
          attach,
          node => findAttachmentNode(object, node),
        );
        // Weapon particles take no clicks.
        markNotPickable(instance.object);
        markNotBody(instance.object);
        (effectHost ?? object).add(instance.object);
        if (view) (view.equipmentEffects ??= []).push(instance);
        this.equipmentEffectEntries.push({ instance, object });
      }
      if (prototype.clip) {
        const mixer = new THREE.AnimationMixer(object);
        mixer.clipAction(prototype.clip).play();
        this.animated.push({ mixer, object });
        const view = this.views.get(entityId);
        if (view) (view.equipmentMixers ??= []).push(mixer);
      }
    }
  }

  /**
   * A placed `.beff`: model nodes drawn as models, emitters simulated per
   * frame. Some carry real scenery (`maincity_streetlight.beff` is the post).
   */
  private async attachEffect(entity: Entity, seq = this.zoneSeq): Promise<void> {
    const data = await this.resources.tryGet<'effect'>(effectId(entity.model));
    if (seq !== this.zoneSeq) return;
    const view = this.views.get(entity.id);
    if (!data || !view) return;

    const group = new THREE.Group();
    const roots: THREE.Object3D[] = [];
    const modelRoots: Array<THREE.Object3D | null> = [];

    // Model nodes first: emitters attach to named nodes inside them.
    for (const node of data.models) {
      const prototype = await this.build(node.model, undefined, entity.position).catch(() => null);
      if (seq !== this.zoneSeq) return;
      if (!prototype) {
        modelRoots.push(null);
        continue;
      }
      const object = prototype.skinned
        ? cloneSkinned(prototype.object)
        : prototype.object.clone(true);
      group.add(object);
      roots.push(object);
      modelRoots.push(object);

      // A fountain's water is a played clip; the effect says whether it loops.
      if (prototype.clip) {
        const mixer = new THREE.AnimationMixer(object);
        const action = mixer.clipAction(prototype.clip);
        action.setLoop(node.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !node.loop;
        action.play();
        this.animated.push({ mixer, object: group });
      }
    }

    // Emitter nodes mostly carry no geometry; one Group per named transform,
    // shared by emitters naming the same node.
    const { attach, findDrawable } = placedEffectHosts(data.models, roots, group);

    const instance = new EffectInstance(
      data,
      def => this.effectMaterial(def),
      attach,
      findDrawable,
      false,
      modelRoots,
      false,
      placementSeed(entity.model, entity.position),
    );
    const [found, named] = instance.countAttached(attach);
    if (named && found < named) {
      log.once(
        'warn',
        `effect-uid:${entity.model}`,
        `${entity.model}: ${named - found} of ${named} emitters name a model ` +
          'node that is not there — they fall back to the effect origin',
      );
    }
    group.add(instance.object);

    applyTransform(group, entity);
    view.object = group;
    view.version = entity.version;
    view.effect = instance;
    this.entityGroup.add(group);
    refreshWorldMatrix(group);
    group.matrixWorldAutoUpdate = false;
    this.effects.push({ instance, object: group });
    this.effectPaths.set(instance, entity.model);
  }

  /** A transient effect in its own container; culled by attached position, not origin. */
  private async buildTempEffect(
    data: EffectData,
    path: string,
    parent: THREE.Object3D,
    scale: number,
    attached: boolean,
    hideModels = false,
    inFlight = false,
  ): Promise<EffectInstance> {
    const container = new THREE.Group();
    // Not pickable: a cast or aura on a bone must not shield clicks.
    markNotPickable(container);
    if (scale !== 1) container.scale.setScalar(scale);

    /*
     * Models first: an arrow is geometry with a trail on its tail node.
     * Emitters alone draw the trail with no arrow, stranded at the origin.
     */
    const roots: THREE.Object3D[] = [];
    const modelRoots: Array<THREE.Object3D | null> = [];
    const mixers: THREE.AnimationMixer[] = [];
    for (const node of hideModels ? [] : data.models) {
      const prototype = await this.build(node.model).catch(() => null);
      if (!prototype) {
        modelRoots.push(null);
        continue;
      }
      const object = prototype.skinned
        ? cloneSkinned(prototype.object)
        : prototype.object.clone(true);
      container.add(object);
      roots.push(object);
      modelRoots.push(object);
      if (prototype.clip) {
        const mixer = new THREE.AnimationMixer(object);
        const action = mixer.clipAction(prototype.clip);
        action.setLoop(node.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !node.loop;
        action.play();
        mixers.push(mixer);
        this.animated.push({ mixer, object: container });
      }
    }

    const hosts = new Map<string, THREE.Object3D>();
    const attach = (uid: string): THREE.Object3D | null => {
      const made = hosts.get(uid);
      if (made) return made;

      // Emitter nodes mostly carry no geometry; the effect gives their transforms.
      for (const node of data.models) {
        const matrix = node.attachPoints[uid];
        if (!matrix) continue;
        const host = new THREE.Group();
        host.applyMatrix4(
          new THREE.Matrix4().set(
            matrix[0],
            matrix[1],
            matrix[2],
            matrix[9],
            matrix[3],
            matrix[4],
            matrix[5],
            matrix[10],
            matrix[6],
            matrix[7],
            matrix[8],
            matrix[11],
            0,
            0,
            0,
            1,
          ),
        );
        host.matrixAutoUpdate = false;
        container.add(host);
        hosts.set(uid, host);
        return host;
      }

      for (const root of roots) {
        const found = root.getObjectByName(uid);
        if (found) {
          hosts.set(uid, found);
          return found;
        }
      }

      // No such node: a bare host keeps the particles in the scene.
      const host = new THREE.Group();
      container.add(host);
      hosts.set(uid, host);
      return host;
    };
    const findDrawable = (uid: string): THREE.Object3D | null => {
      for (const root of roots) {
        const found = root.getObjectByName(uid);
        if (found) return found;
      }
      return container.getObjectByName(uid) ?? null;
    };

    const instance = new EffectInstance(
      data,
      def => this.effectMaterial(def),
      attach,
      findDrawable,
      hideModels,
      modelRoots,
      inFlight,
    );
    container.add(instance.object);
    parent.add(container);
    if (mixers.length) this.effectMixers.set(instance, mixers);

    if (attached) {
      container.updateMatrix();
    } else {
      refreshWorldMatrix(container);
      container.matrixWorldAutoUpdate = false;
    }

    this.effects.push({ instance, object: container, attached });
    this.effectPaths.set(instance, path);
    return instance;
  }

  /**
   * A transient effect at a world position (spells, projectiles). A projectile
   * is `inFlight`, so its trailing emitters leave particles behind.
   */
  async spawnTempEffect(
    path: string,
    pos: [number, number, number],
    scale = 1,
    hideModels = false,
    inFlight = false,
  ): Promise<EffectInstance | null> {
    const data = await this.resources.tryGet<'effect'>(effectId(path));
    if (!data) return null;
    const instance = await this.buildTempEffect(
      data,
      path,
      this.entityGroup,
      scale,
      false,
      hideModels,
      inFlight,
    );
    this.moveTempEffect(instance, pos);
    return instance;
  }

  /** Hold an effect still and hidden, keeping its particles (a hit waiting for its blow). */
  setEffectPaused(instance: EffectInstance, paused: boolean): void {
    const entry = this.effects.find(e => e.instance === instance);
    if (!entry) return;
    entry.paused = paused;
    entry.object.visible = !paused;
  }

  /** Stop endless emitters and let particles fade; the owner removes it once finished. */
  windDownEffect(instance: EffectInstance): void {
    instance.windDown();
  }

  /** A projectile has arrived: it vanishes and its trail fades where it lies. */
  landEffect(instance: EffectInstance): void {
    instance.land();
  }

  /** Move a free-standing effect (a projectile); a no-op on a bone-parented one. */
  moveTempEffect(
    instance: EffectInstance,
    pos: [number, number, number],
    rotation?: THREE.Quaternion,
  ): void {
    const entry = this.effects.find(e => e.instance === instance);
    if (!entry || entry.attached) return;
    entry.object.position.set(pos[0], pos[1], pos[2]);
    if (rotation) entry.object.quaternion.copy(rotation);
    refreshWorldMatrix(entry.object);
  }

  removeTempEffect(instance: EffectInstance): void {
    const idx = this.effects.findIndex(e => e.instance === instance);
    if (idx < 0) return;
    const entry = this.effects[idx];
    instance.dispose();
    entry.object.removeFromParent();
    this.effectPaths.delete(instance);
    for (const mixer of this.effectMixers.get(instance) ?? []) {
      const at = this.animated.findIndex(a => a.mixer === mixer);
      if (at >= 0) this.animated.splice(at, 1);
    }
    this.effectMixers.delete(instance);
    this.effects.splice(idx, 1);
  }

  /** The blade's world ends; null retires a ribbon whose owner has gone. */
  private bladeOf(entityId: EntityId): BladePair | null {
    const view = this.views.get(entityId);
    if (!view) return null;
    const start = findAttachmentNode(view.object, 'Dummy_Weapon_Start');
    const end = findAttachmentNode(view.object, 'Dummy_Weapon_End');
    if (!start || !end) return null;
    return [start.getWorldPosition(new THREE.Vector3()), end.getWorldPosition(new THREE.Vector3())];
  }

  spawnWeaponStripe(entityId: EntityId, stripeIndex: number): void {
    this.stripes.spawn(entityId, stripeIndex);
  }

  /**
   * Attach a spell effect to a named node so it follows the animation.
   * `nodeId` is tried exact, then with or without `-node`, then ignoring case.
   */
  async attachEffectToEntity(
    entityId: EntityId,
    path: string,
    nodeId: string,
    scale = 1,
  ): Promise<EffectInstance | null> {
    const view = this.views.get(entityId);
    if (!view) return null;
    const data = await this.resources.tryGet<'effect'>(effectId(path));
    if (!data) return null;

    const node = findAttachmentNode(view.object, nodeId);
    if (!node) return null;

    return this.buildTempEffect(data, path, node, scale, true);
  }

  /** A named node's world position, e.g. a missile's launch hand. */
  entityNodePosition(entityId: EntityId, nodeId: string): [number, number, number] | null {
    const view = this.views.get(entityId);
    if (!view) return null;
    const node = findAttachmentNode(view.object, nodeId);
    if (!node) return null;
    const m = node.matrixWorld.elements;
    return [m[12], m[13], m[14]];
  }

  cameraForward(): [number, number, number] {
    const d = this.rig.camera.getWorldDirection(new THREE.Vector3());
    return [d.x, d.y, d.z];
  }

  cameraPosition(): [number, number, number] {
    const p = this.rig.camera.position;
    return [p.x, p.y, p.z];
  }

  /** A body's world size and centre Y: spells scale by height and missiles aim at the centre. */
  entityBounds(entityId: EntityId): { size: THREE.Vector3; centreY: number } | null {
    const view = this.views.get(entityId);
    const bounds = view?.bodyBounds;
    if (!bounds) return null;
    return {
      size: bounds.size,
      centreY: view.object.position.y + bounds.centreOffsetY,
    };
  }

  private effectMaterial(def: EffectEmitter): THREE.Material {
    const key = `${def.particle.texture}|${def.particle.blend}`;
    const existing = this.effectMaterials.get(key);
    if (existing) return existing;

    const material = createEffectMaterial(def.particle.blend);

    this.effectMaterials.set(key, material);
    this.ownedMaterials.push(material);

    if (def.particle.texture) {
      void this.materials
        .rawTexture(def.particle.texture)
        .then((map: THREE.Texture | null) => {
          if (!map) return;
          material.map = map;
          material.needsUpdate = true;
        })
        .catch(() => undefined);
    }
    return material;
  }

  private detach(id: EntityId): void {
    const view = this.views.get(id);
    this.pendingMounts.delete(id);
    this.mountAsks.delete(id);
    if (!view) return;
    this.dropMount(id, view, false);
    this.fading.delete(id);
    if (view.effect) {
      const at = this.effects.findIndex(e => e.instance === view.effect);
      if (at >= 0) this.effects.splice(at, 1);
      view.effect.dispose();
    }
    if (view.nameLabel) {
      const material = view.nameLabel.material as THREE.SpriteMaterial;
      material.map?.dispose();
      material.dispose();
      this.entityGroup.remove(view.nameLabel);
    }
    if (view.foliageCompanion) {
      view.foliageCompanion.removeFromParent();
      const material = view.foliageCompanion.material as THREE.Material;
      this.releaseCompanionMaterial(view, material);
      view.foliageCompanion = undefined;
      this.foliageFading.delete(id);
      this.activeFoliageCompanions--;
    }
    if (view.batch) {
      const batch = view.batch;
      let index = view.batchIndex ?? -1;
      if (batch.entries[index]?.id !== id)
        index = batch.entries.findIndex(entry => entry.id === id);
      if (index >= 0) {
        const moved = removeEntry(batch, index);
        if (moved !== null) {
          const movedView = this.views.get(moved);
          if (movedView) movedView.batchIndex = index;
        }
      }
      if (batch.entries.length === 0) {
        // Empties whenever its last tile is evicted.
        disposeBatch(batch);
        this.staticBatches.forEach((candidate, key) => {
          if (candidate === batch) this.staticBatches.delete(key);
        });
      }
    }
    this.entityGroup.remove(view.object);
    if (view.mixer) {
      view.mixer.stopAllAction();
      view.action = undefined;
      const at = this.animated.findIndex(a => a.mixer === view.mixer);
      if (at >= 0) this.animated.splice(at, 1);
    }
    this.views.delete(id);
    this.withActions.delete(id);
    // Entity ids are never reused, so an entry left behind is a leak.
    this.shadowGround.delete(id);
    this.icons.forget(id);
    // A clone owns nothing: geometry and materials belong to the prototype.
  }

  /**
   * One entity's head as a data URL, rendered in an empty scene and put
   * straight back. Undefined until the entity is built.
   */
  headshot(id: EntityId, size = 128): string | undefined {
    const view = this.views.get(id);
    if (!view?.object) return undefined;
    const entity = this.world?.entities.get(id);
    // Cached per look: idle animation does not change a portrait.
    const lookKey = entity ? `${entity.model}#${entity.appearance?.key ?? ''}` : null;
    const cached = lookKey ? this.headshotCache.get(lookKey) : undefined;
    if (cached) return cached;
    const object = view.object;

    // Never shoot a half-textured body: the grey mannequin would be cached all session.
    if (!this.isTextured(object)) return undefined;

    const url = renderPortrait(this.gl, object, size);
    if (!url) return undefined;
    if (lookKey) this.headshotCache.set(lookKey, url);
    return url;
  }

  /**
   * A live, rotatable view of the hero for the character sheet, in its own
   * stage scene, drawn by the main renderer. `dressed` stages another look
   * (trying something on) and does not follow the hero's changes.
   */
  stageHero(
    entityId?: number,
    dressed?: Promise<Entity['appearance'] | undefined>,
  ): { element: HTMLElement; sync(): void; dispose(): void } | null {
    const id = entityId ?? this.world?.player?.id;
    if (id === undefined) {
      log.once('warn', 'stage:no-player', 'character stage: no player in the world yet');
      return null;
    }
    const lookKey = (): string | null => {
      const entity = this.world?.entities.get(id);
      return entity ? `${entity.model}#${entity.appearance?.key ?? ''}` : null;
    };

    let live = true;
    const buildBody = (): { body: THREE.Object3D; mixer: THREE.AnimationMixer } | null => {
      const view = this.views.get(id);
      const source = view?.object;
      if (!view?.modelPath || !source || source.children.length === 0) {
        log.once('warn', 'stage:no-body', 'character stage: hero has no built body yet');
        return null;
      }
      // Lifted off for the synchronous clone and put straight back.
      const held = new Array<{ object: THREE.Object3D; parent: THREE.Object3D | null }>();
      for (const overlay of [view.nameLabel, view.interactionIcon]) {
        if (!overlay) continue;
        held.push({ object: overlay, parent: overlay.parent });
        overlay.removeFromParent();
      }
      let body: THREE.Object3D;
      try {
        body = cloneSkinned(source);
      } catch (error) {
        log.once(
          'warn',
          'stage:clone',
          `character stage: could not clone the hero body (${String(error)})`,
        );
        return null;
      } finally {
        for (const { object, parent } of held) parent?.add(object);
      }
      return readyBody(body, view.modelPath);
    };
    const readyBody = (
      body: THREE.Object3D,
      modelPath: string,
    ): { body: THREE.Object3D; mixer: THREE.AnimationMixer } => {
      body.rotation.set(0, 0, 0);
      body.position.set(0, 0, 0);
      body.scale.set(1, 1, 1);
      // The stage is its own scene: a body culled or mid-fade in the world
      // must still show here.
      body.visible = true;
      body.traverse(node => {
        node.visible = true;
        // A folded weapon's matrix is hand-written; read it back into its
        // fields before auto-update recomposes from stale ones.
        if (!node.matrixAutoUpdate)
          node.matrix.decompose(node.position, node.quaternion, node.scale);
        node.matrixAutoUpdate = true;
        node.matrixWorldAutoUpdate = true;
        const mesh = node as THREE.Mesh;
        // One body fills the scene; skinned bounds would cull a correct clone.
        if (mesh.isMesh) mesh.frustumCulled = false;
      });
      body.updateMatrixWorld(true);
      const mixer = new THREE.AnimationMixer(body);
      void this.loadClip(modelPath, 'idle').then(clip => {
        if (!live || !clip) return;
        mixer.clipAction(clip).play();
      });
      return { body, mixer };
    };

    const current = buildBody();
    if (!current) return null;

    const scene = new THREE.Scene();
    lightAsStage(scene);
    const pivot = new THREE.Group();
    scene.add(pivot);
    pivot.add(current.body);
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 4000);

    const box = document.createElement('div');
    box.className =
      'h-full w-full cursor-grab overflow-hidden [touch-action:none] active:cursor-grabbing';
    // Inline as well as the class, and a non-passive touchmove below: a browser
    // that takes the gesture for a pan cancels the pointer after a few pixels,
    // which stopped the turn a moment into a swipe.
    box.style.touchAction = 'none';
    const canvas = document.createElement('canvas');
    canvas.className = 'block h-full w-full';
    canvas.style.touchAction = 'none';
    box.append(canvas);
    const context = canvas.getContext('2d');
    if (!context) {
      log.once('warn', 'stage:no-2d', 'character stage: no 2D context for the stage canvas');
      return null;
    }

    const stage: HeroStage = {
      scene,
      camera,
      pivot,
      box,
      canvas,
      context,
      body: current.body,
      mixer: current.mixer,
      yaw: 0,
      touched: false,
      height: 1,
      centreY: 0.5,
      zoom: 1,
      background: new THREE.Color(0x000000),
    };
    const placeCamera = (): void => {
      const distance =
        (stage.height / 2 / Math.tan(THREE.MathUtils.degToRad(17.5))) * 1.2 * stage.zoom;
      camera.position.set(0, stage.centreY + stage.height * 0.05, distance);
      camera.lookAt(0, stage.centreY, 0);
      camera.updateProjectionMatrix();
    };
    const frame = (): void => {
      // Frame the body box, not the weapon box.
      stage.body.position.set(0, 0, 0);
      stage.body.updateMatrixWorld(true);
      let box3 = bodyBox(stage.body);
      if (box3.isEmpty()) box3 = new THREE.Box3().setFromObject(stage.body);
      const size = box3.getSize(new THREE.Vector3());
      const centre = box3.getCenter(new THREE.Vector3());
      const height = Math.max(size.y, 0.5);
      stage.height = height;
      if (!box3.isEmpty()) {
        stage.body.position.set(-centre.x, 0, -centre.z);
        stage.body.updateMatrixWorld(true);
      }
      stage.centreY = box3.isEmpty() ? height / 2 : centre.y;
      placeCamera();
      let meshes = 0;
      stage.body.traverse(node => {
        if ((node as THREE.Mesh).isMesh) meshes++;
      });
      box.dataset.stageMeshes = String(meshes);
      box.dataset.stageHeight = height.toFixed(2);
    };
    frame();

    const resize = (): void => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(Math.round(box.clientWidth * ratio), 1);
      const height = Math.max(Math.round(box.clientHeight * ratio), 1);
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      // A layout read, kept out of the frame: `getComputedStyle` recalculates style.
      stage.background.copy(stageBackground(box));
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(box);

    const fingers = new Map<number, { x: number; y: number }>();
    let lastX = 0;
    const spread = (): number => {
      const [a, b] = [...fingers.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const down = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return;
      stage.touched = true;
      fingers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastX = event.clientX;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent): void => {
      if (event.pointerType === 'touch') return;
      const held = fingers.get(event.pointerId);
      if (!held) return;
      if (fingers.size >= 2) {
        const before = spread();
        held.x = event.clientX;
        held.y = event.clientY;
        const after = spread();
        if (before > 0 && after > 0) {
          stage.zoom = clampZoom(stage.zoom * (before / after));
          placeCamera();
        }
        return;
      }
      stage.yaw += previewTurn(event.clientX - lastX, canvas.getBoundingClientRect().width);
      lastX = event.clientX;
      held.x = event.clientX;
      held.y = event.clientY;
    };
    const up = (event: PointerEvent): void => {
      fingers.delete(event.pointerId);
      // The remaining finger turns from where it is.
      const rest = [...fingers.values()][0];
      if (rest) lastX = rest.x;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      stage.zoom = clampZoom(stage.zoom * Math.exp(event.deltaY * STAGE_ZOOM_PER_WHEEL_PX));
      placeCamera();
    };
    // Touch is driven by touch events: they run until the finger lifts, where
    // a pointer stream is cancelled the moment the browser takes the gesture.
    const touches = new Map<number, number>();
    const touchSpread = (list: TouchList): number =>
      list.length >= 2
        ? Math.hypot(list[0]!.clientX - list[1]!.clientX, list[0]!.clientY - list[1]!.clientY)
        : 0;
    let touchBefore = 0;
    const touchStart = (event: TouchEvent): void => {
      event.preventDefault();
      stage.touched = true;
      for (const touch of Array.from(event.changedTouches)) {
        touches.set(touch.identifier, touch.clientX);
      }
      touchBefore = touchSpread(event.touches);
    };
    const touchMove = (event: TouchEvent): void => {
      event.preventDefault();
      if (event.touches.length >= 2) {
        const after = touchSpread(event.touches);
        if (touchBefore > 0 && after > 0) {
          stage.zoom = clampZoom(stage.zoom * (touchBefore / after));
          placeCamera();
        }
        touchBefore = after;
        for (const touch of Array.from(event.touches)) {
          touches.set(touch.identifier, touch.clientX);
        }
        return;
      }
      const touch = event.touches[0];
      if (!touch) return;
      const was = touches.get(touch.identifier) ?? touch.clientX;
      stage.yaw += previewTurn(touch.clientX - was, canvas.getBoundingClientRect().width);
      touches.set(touch.identifier, touch.clientX);
    };
    const touchEnd = (event: TouchEvent): void => {
      for (const touch of Array.from(event.changedTouches)) touches.delete(touch.identifier);
      touchBefore = 0;
      // The finger left on a pinch turns from where it is.
      const rest = event.touches[0];
      if (rest) touches.set(rest.identifier, rest.clientX);
    };
    canvas.addEventListener('touchstart', touchStart, { passive: false });
    canvas.addEventListener('touchmove', touchMove, { passive: false });
    canvas.addEventListener('touchend', touchEnd);
    canvas.addEventListener('touchcancel', touchEnd);
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', wheel, { passive: false });

    this.heroStages.add(stage);
    let key = lookKey();

    const swap = (next: { body: THREE.Object3D; mixer: THREE.AnimationMixer }): void => {
      pivot.remove(stage.body);
      stage.mixer.uncacheRoot(stage.body);
      stage.body = next.body;
      stage.mixer = next.mixer;
      pivot.add(stage.body);
      frame();
    };
    const modelPath = this.views.get(id)?.modelPath;
    if (dressed && modelPath) {
      void dressed
        .then(look => (look && live ? this.build(modelPath, look) : null))
        .then(prototype => {
          if (!live || !prototype) return;
          const body = prototype.skinned
            ? cloneSkinned(prototype.object)
            : prototype.object.clone(true);
          swap(readyBody(body, modelPath));
        })
        .catch(error => log.warn(`character stage: could not dress the hero (${String(error)})`));
    }

    return {
      element: box,
      sync(): void {
        if (!live || dressed) return;
        const now = lookKey();
        if (now === key) return;
        key = now;
        const next = buildBody();
        if (next) swap(next);
      },
      dispose: () => {
        live = false;
        this.heroStages.delete(stage);
        observer?.disconnect();
        canvas.removeEventListener('touchstart', touchStart);
        canvas.removeEventListener('touchmove', touchMove);
        canvas.removeEventListener('touchend', touchEnd);
        canvas.removeEventListener('touchcancel', touchEnd);
        canvas.removeEventListener('pointerdown', down);
        canvas.removeEventListener('pointermove', move);
        canvas.removeEventListener('pointerup', up);
        canvas.removeEventListener('pointercancel', up);
        canvas.removeEventListener('wheel', wheel);
        stage.mixer.uncacheRoot(stage.body);
        box.remove();
      },
    };
  }

  /**
   * Draw every open hero stage into a corner of the main canvas, before the
   * world render clears it, and `drawImage` it out in the same task. The
   * canvas has no alpha, so the region is cleared to the stage's colour.
   */
  private drawHeroStages(dt: number): void {
    if (this.heroStages.size === 0) return;
    const gl = this.gl;
    const target = gl.getDrawingBufferSize(new THREE.Vector2());
    // `setViewport`/`setScissor` take CSS pixels; the copy is in device pixels.
    const ratio = gl.getPixelRatio();
    const previousClear = gl.getClearColor(new THREE.Color());
    const previousAlpha = gl.getClearAlpha();
    for (const stage of this.heroStages) {
      const rect = stageCopyRect(stage.canvas.width, stage.canvas.height, target.x, target.y);
      if (!rect) continue;
      // The body turns only when dragged: the sheet is read, not watched.
      stage.pivot.rotation.y = stage.yaw;
      stage.mixer.update(dt);

      gl.setScissorTest(true);
      gl.setScissor(0, 0, rect.width / ratio, rect.height / ratio);
      gl.setViewport(0, 0, rect.width / ratio, rect.height / ratio);
      gl.setClearColor(stage.background, 1);
      gl.clear(true, true, true);
      gl.render(stage.scene, stage.camera);

      stage.context.clearRect(0, 0, stage.canvas.width, stage.canvas.height);
      stage.context.drawImage(
        gl.domElement,
        0,
        rect.sourceY,
        rect.width,
        rect.height,
        0,
        0,
        rect.width,
        rect.height,
      );
    }
    gl.setScissorTest(false);
    gl.setViewport(0, 0, target.x / ratio, target.y / ratio);
    gl.setClearColor(previousClear, previousAlpha);
  }

  /**
   * No mesh still waiting on a texture. Reads the cache's pending set, since
   * an untextured mesh has a null map for ever.
   */
  private isTextured(object: THREE.Object3D): boolean {
    let ready = true;
    object.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !ready) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (materials.some(m => m && this.materials.isPending(m))) ready = false;
    });
    return ready;
  }

  private newStaticBatch(key: string, prototype: Prototype): StaticBatch {
    const meshes = batchParts(prototype.object);
    if (!meshes) throw new Error(`static batch ${key} has no mesh`);
    prototype.object.updateMatrixWorld(true);
    const batch = createStaticBatchOf(
      `static batch ${key}`,
      meshes.map(mesh => ({
        geometry: mesh.geometry,
        material: mesh.material,
        baseMatrix: mesh.matrixWorld,
      })),
      this.entityGroup,
    );
    this.staticBatches.set(key, batch);
    return batch;
  }

  private prototype(entity: Entity): Promise<Prototype | null> {
    return this.modelPrototype(entity.model, entity.appearance, entity.position);
  }

  private modelPrototype(
    path: string,
    appearance?: Entity['appearance'],
    at?: readonly [number, number, number],
  ): Promise<Prototype | null> {
    const key = appearance ? `${path}#${appearance.key}` : path;
    const existing = this.prototypes.get(key);
    if (existing) return existing;

    // The first entity to trigger a shared build sets its texture priority;
    // attaches run nearest first, so that is usually reasonable.
    const work = this.build(path, appearance, at).catch(err => {
      log.warn(`model ${path}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    });
    this.prototypes.set(key, work);
    return work;
  }

  /** Build a model, skinned if a skeleton skins its meshes. */
  private async build(
    path: string,
    appearance?: Entity['appearance'],
    at?: readonly [number, number, number],
  ): Promise<Prototype | null> {
    const { model, skeleton, clipData } = await loadModelSources(
      this.resources,
      path,
      this.options.animate !== false,
    );

    if (isSkinned(skeleton)) {
      const built = buildSkinnedModel(model, skeleton, this.materials, appearance, at);
      if (built) {
        // Equipment can carry a node animation alongside skin metadata; keep it.
        const clip =
          clipData && clipData.tracks.length > 0
            ? toThreeClip(clipData)
            : model.nodeClip && model.nodeClip.tracks.length > 0
              ? toThreeClip(model.nodeClip)
              : null;
        return {
          object: built.object,
          geometries: built.geometries,
          skinned: true,
          clip,
          ...modelBounds(built.object),
        };
      }
    }

    const built: BuiltModel = buildModel(model, this.materials, appearance, at);
    // Static models animate scene nodes (windmill blades, chest lids) from
    // inside the model file; `buildModel` names each animated node.
    const nodeClip = this.options.animate === false ? null : (model.nodeClip ?? null);
    return {
      object: built.object,
      geometries: built.geometries,
      skinned: false,
      clip: nodeClip && nodeClip.tracks.length > 0 ? toThreeClip(nodeClip) : null,
      ...modelBounds(built.object),
    };
  }

  render(dt = 0): void {
    // `preMs` is our bookkeeping; `drawMs` is three.js's own per-frame cost.
    const t0 = performance.now();
    this.frameNo++;
    // Read before the bookkeeping below clears it: new or moved casters
    // this frame mean the shadow map is already stale.
    const attachActivity =
      this.visibilityDirty ||
      this.candidateListDirty ||
      this.attachQueue.length > 0 ||
      this.attachesInFlight > 0;
    this.gl.info.reset();
    this.resize();
    this.drawHeroStages(dt);
    this.rig.update();
    this.followSunShadow();
    this.shareSunShadow();
    if (this.skybox) this.skybox.position.copy(this.rig.camera.position);
    this.updateUnderwaterFog(dt);
    if (this.groundLight.step(dt * 1000)) {
      const ground = this.groundLight.current;
      lightGround(ground.sun, ground.shade);
    }
    if (dt > 0) {
      this.previousFrameSeconds = dt;
      this.advanceAnimations(dt);
      for (const id of this.riders) {
        const view = this.views.get(id);
        if (view?.mount) this.seatRider(view);
      }
      this.waterClock += dt;
      for (const built of this.builtTiles.values()) {
        for (const m of built.water) m.uniforms.uTime.value = this.waterClock;
      }
      this.materials.tickWaterfalls(this.waterClock);
      this.ripples?.update(dt);
      const tEffects0 = performance.now();
      this.advanceEffects(dt);
      this.lastEffectsMs = performance.now() - tEffects0;
      this.stripes.advance(dt);
      this.sweepActions();
      this.hideDistantModels();
      this.advanceFades(dt);
      this.advanceGhosts(dt);
      this.advanceFoliageFades(dt);
    }
    this.updateShadowMap(attachActivity);
    this.drainTerrainDisposals();
    const t1 = performance.now();
    // The sky pass clears and draws the sky; the world draws over it without
    // clearing colour. The sky writes no depth.
    const gl = this.gl;
    const background = this.scene.background;
    this.skyScene.background = background;
    this.scene.background = null;
    try {
      if (this.post && needsPostEffects(this.postSettings)) {
        const size = gl.getSize(scratchSize);
        this.post.setSize(size.x, size.y, gl.getPixelRatio());
        const tPost = performance.now();
        this.post.render();
        this.lastPostMs = performance.now() - tPost;
      } else {
        this.lastPostMs = 0;
        gl.render(this.skyScene, this.rig.camera);
        gl.autoClearColor = false;
        try {
          gl.render(this.scene, this.rig.camera);
        } finally {
          gl.autoClearColor = true;
        }
      }
    } finally {
      this.scene.background = background;
    }
    const t2 = performance.now();
    this.lastPreMs = t1 - t0;
    this.lastDrawMs = t2 - t1;
  }

  private applyWaterSurface(): void {
    const soft = this.graphics.water === 'soft' ? 1 : 0;
    for (const built of this.builtTiles.values()) {
      for (const sheet of built.water) sheet.uniforms.uSoft.value = soft;
    }
  }

  /** Redraw the sun's shadow map only when it could have changed; see `shadowMapNeedsUpdate`. */
  private updateShadowMap(attachActivity: boolean): void {
    if (this.shadowMode !== 'realtime') return;
    const sunMoved = !this.sun.position.equals(this.lastShadowSun);
    this.lastShadowSun.copy(this.sun.position);
    const sceneAlive =
      attachActivity || this.animatedNear > 0 || this.fading.size > 0 || this.ghosts.size > 0;
    this.gl.shadowMap.needsUpdate = shadowMapNeedsUpdate(sunMoved, sceneAlive, this.frameNo);
  }

  private visibilityRecheckDistanceSq(): number {
    const step =
      this.pendingTextures >= ATTACH_THROTTLE_TEXTURES
        ? VISIBILITY_RECHECK_DISTANCE * 2
        : VISIBILITY_RECHECK_DISTANCE;
    return step * step;
  }

  /** Hide models past the draw distance; over budget, the radius shrinks. Whole models only. */
  private hideDistantModels(): void {
    const eye = this.rig.target;
    const last = this.lastVisibilityEye;
    const step = this.visibilityRecheckDistanceSq();
    const dx = last ? eye.x - last.x : 0;
    const dy = last ? eye.y - last.y : 0;
    const dz = last ? eye.z - last.z : 0;
    const eyeMoved = !last || dx * dx + dy * dy + dz * dz >= step;
    // Runs only on the gated recheck, so its cost is a spike; timed for
    // `RendererStats.hideMs`.
    const start = performance.now();
    if (!hideRecheckDue(start, this.lastHideCheck, eyeMoved, this.visibilityDirty)) return;
    this.lastHideCheck = start;
    this.visibilityDirty = false;
    (this.lastVisibilityEye ??= new THREE.Vector3()).copy(eye);
    const { drawDistance, drawBudget } = this.graphics;
    const detailDistance = Math.min(this.graphics.detailDistance, drawDistance);
    let hide = drawDistance * drawDistance;
    let show = (drawDistance - HIDE_HYSTERESIS) ** 2;

    const bands = this.hideBandDraws;
    bands.fill(0);
    const bandWidth = drawDistance / HIDE_BANDS;
    for (const view of this.views.values()) {
      if (!view.object || view.effect || view.leaving) continue;
      const p = view.object.position;
      const dx = p.x - eye.x,
        dy = p.y - eye.y,
        dz = p.z - eye.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // Already past its cutoff: charging it would shrink the radius for nothing.
      if (d >= (view.small ? detailDistance : drawDistance)) continue;
      // Unresolved views cost nothing; landmarks are paid for first, so the
      // radius shrinks around them.
      bands[view.landmark ? 0 : Math.floor(d / bandWidth)] += view.drawCount ?? 0;
    }
    const radius = budgetRadius(bands, bandWidth, drawBudget, drawDistance);
    if (radius < drawDistance) {
      hide = radius * radius;
      show = Math.max(0, radius - HIDE_HYSTERESIS) ** 2;
    }

    const smallHide = Math.min(hide, detailDistance * detailDistance);
    const smallShow = Math.min(show, Math.max(0, detailDistance - HIDE_HYSTERESIS) ** 2);

    // Landmarks hide only at the draw distance.
    const farHide = drawDistance * drawDistance;
    const farShow = (drawDistance - HIDE_HYSTERESIS) ** 2;

    for (const [id, view] of this.views) {
      if (!view.object || view.effect) continue;
      const p = view.object.position;
      const dx = p.x - eye.x,
        dy = p.y - eye.y,
        dz = p.z - eye.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const shown = view.shown ?? true;
      let next = shown;
      const hideAt = view.small ? smallHide : view.landmark ? farHide : hide;
      const showAt = view.small ? smallShow : view.landmark ? farShow : show;
      if (shown) {
        if (d2 > hideAt) next = false;
      } else if (d2 < showAt) {
        next = true;
      }
      if (next !== shown) this.setShown(id, view, next);
      if (view.batch && view.small) this.updateFoliageCompanion(id, view, p, d2);
    }
    this.admitFoliageCompanions();
    this.lastHideMs = performance.now() - start;
  }

  /** Decide one placement's companion; new ones queue for `admitFoliageCompanions`. */
  private updateFoliageCompanion(
    id: EntityId,
    view: EntityView,
    p: THREE.Vector3,
    d2: number,
  ): void {
    // Only single-mesh, single-material batches get companions.
    const batch = view.batch;
    const single =
      batch !== undefined && batch.parts.length === 1 && !Array.isArray(batch.material);
    const wantsBlend = single && !this.foliageCutout;
    const hasCompanion = view.foliageCompanion !== undefined;
    const wanted =
      wantsFoliageCompanion(hasCompanion, wantsBlend, d2) &&
      isFoliageVisible(this.poseFrustum, p.x, p.y, p.z, d2);
    if (wanted) {
      view.foliageGraceUntil = undefined;
      if (!hasCompanion) this.foliageGrowCandidates.push({ id, view, d2 });
      return;
    }
    if (!hasCompanion) return;
    const now = performance.now();
    if (view.foliageGraceUntil === undefined) view.foliageGraceUntil = now + FOLIAGE_BLEND_GRACE_MS;
    else if (foliageGraceExpired(view.foliageGraceUntil, now))
      this.shrinkFoliageCompanion(id, view);
  }

  /** Grow companions for the nearest candidates, at most `MAX_FOLIAGE_GROWTH_PER_TICK` a pass. */
  private admitFoliageCompanions(): void {
    const candidates = this.foliageGrowCandidates;
    if (candidates.length === 0) return;
    const room = Math.min(
      MAX_FOLIAGE_COMPANIONS - this.activeFoliageCompanions,
      MAX_FOLIAGE_GROWTH_PER_TICK,
    );
    if (room > 0) {
      if (candidates.length > room) candidates.sort((a, b) => a.d2 - b.d2);
      const grow = Math.min(room, candidates.length);
      for (let i = 0; i < grow; i++)
        this.growFoliageCompanion(candidates[i]!.id, candidates[i]!.view);
    }
    candidates.length = 0;
  }

  /** Spawn a companion at fade 0; the row stays drawn beneath until it is grown. */
  private growFoliageCompanion(id: EntityId, view: EntityView): void {
    const batch = view.batch;
    if (!batch) return;
    // Decomposed, not written to `mesh.matrix`, which auto-update recomputes.
    view.object.updateMatrix();
    scratchMatrix.multiplyMatrices(view.object.matrix, batch.baseMatrix);
    const shared = this.foliageBlendMaterial(batch);
    const material = acquireFadeClone(shared) ?? shared;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = -1;
    const mesh = new THREE.Mesh(batch.geometry, material);
    scratchMatrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = false;
    this.entityGroup.add(mesh);
    view.foliageCompanion = mesh;
    view.foliageFade = 0;
    setFade(material, 0);
    this.foliageFading.set(id, true);
    this.activeFoliageCompanions++;
  }

  /**
   * Show the batch row at once (the companion still covers it under the same
   * `polygonOffset`), then fade the companion out over it.
   */
  private shrinkFoliageCompanion(id: EntityId, view: EntityView): void {
    if (!view.foliageCompanion) return;
    this.setDrawn(view, view.shown ?? true);
    this.foliageFading.set(id, false);
  }

  /** Step cross-fading companions; grown ones hide their row, shrunk ones are torn down. */
  private advanceFoliageFades(dt: number): void {
    if (this.foliageFading.size === 0) return;
    for (const [id, growing] of this.foliageFading) {
      const view = this.views.get(id);
      const companion = view?.foliageCompanion;
      if (!view || !companion) {
        this.foliageFading.delete(id);
        continue;
      }
      const fade = stepFade(view.foliageFade ?? (growing ? 0 : 1), growing, dt);
      view.foliageFade = fade;
      setFade(companion.material as THREE.Material, fade);
      if (growing && fade >= 1) {
        this.setDrawn(view, false);
        this.foliageFading.delete(id);
      } else if (!growing && fade <= 0) {
        companion.removeFromParent();
        const material = companion.material as THREE.Material;
        this.releaseCompanionMaterial(view, material);
        view.foliageCompanion = undefined;
        view.foliageFade = undefined;
        this.foliageFading.delete(id);
        this.activeFoliageCompanions--;
      }
    }
  }

  private releaseCompanionMaterial(view: EntityView, material: THREE.Material): void {
    if (!view.batch) {
      material.dispose();
      return;
    }
    releaseFadeClone(this.foliageBlendMaterial(view.batch), material);
  }

  private foliageBlendMaterial(batch: StaticBatch): THREE.Material {
    let material = this.foliageBlendMaterials.get(batch);
    if (!material) {
      material = this.materials.foliageVariant(batch.material as THREE.Material, false);
      this.foliageBlendMaterials.set(batch, material);
    }
    return material;
  }

  /** Fade a view in (drawable at once) or out (drawn until it reaches nothing). */
  private setShown(id: EntityId, view: EntityView, shown: boolean): void {
    view.shown = shown;
    view.fade ??= 1;
    if (shown) this.setDrawn(view, true);
    if (!view.batch) beginObjectFade(view);
    this.fading.set(id, view);
  }

  private setDrawn(view: EntityView, drawn: boolean): void {
    if (view.batch) {
      const index = view.batchIndex ?? -1;
      const entry = view.batch.entries[index];
      if (entry) entry.visible = drawn;
      view.batchVisible = drawn;
      writeEntry(view.batch, index);
    } else {
      view.object.visible = drawn;
    }
  }

  /** Step every fading view; a still scene has none. */
  private advanceFades(dt: number): void {
    if (this.fading.size === 0) return;
    const world = this.world;
    for (const [id, view] of this.fading) {
      const shown = view.shown ?? true;
      const fade = stepFade(view.fade ?? 1, shown, dt);
      view.fade = fade;
      const entity = world?.entities.get(id);
      if (!entity) {
        this.fading.delete(id);
        continue;
      }
      // A dissolve: a batch row fades through its instance colour, an object
      // through its own material (`fadeMaterial.ts`).
      if (view.batch) {
        const entry = view.batch.entries[view.batchIndex ?? -1];
        if (entry) entry.fade = fade;
        writeEntryFade(view.batch, view.batchIndex ?? -1);
      } else {
        applyObjectFade(view, fade);
      }
      if (fade <= 0) {
        this.setDrawn(view, false);
        this.fading.delete(id);
        // A ghosted body keeps its own materials: they carry the stealth alpha.
        if (!view.batch && !this.ghosts.has(id)) endObjectFade(view);
      } else if (fade >= 1) {
        this.fading.delete(id);
        if (!view.batch && !this.ghosts.has(id)) endObjectFade(view);
      }
    }
  }

  /** Hold a body at stealth alpha; asserted, since it can arrive before the model. */
  setEntityGhost(entityId: EntityId, alpha: number): void {
    if (alpha >= 1) {
      const held = this.ghosts.get(entityId);
      if (!held) return;
      held.target = 1;
      return;
    }
    const held = this.ghosts.get(entityId);
    if (held) held.target = alpha;
    else this.ghosts.set(entityId, { target: alpha, current: 1 });
  }

  /** Ease ghosted bodies toward their alpha (true transparency); opaque restored on arrival. */
  private advanceGhosts(dt: number): void {
    if (this.ghosts.size === 0) return;
    for (const [id, held] of this.ghosts) {
      const view = this.views.get(id);
      if (!view) {
        // No body yet; a loading model gets the state when it appears.
        continue;
      }
      held.current = stepGhost(held.current, held.target, dt);
      if (held.current >= 1) {
        this.ghosts.delete(id);
        clearObjectGhost(view);
        // Its own materials were for the ghost; hand back the shared ones.
        if (!view.batch && !this.fading.has(id)) endObjectFade(view);
        continue;
      }
      if (!view.batch) beginObjectFade(view);
      applyObjectGhost(view, held.current);
    }
  }

  /** Step only effects near enough to see; one behind you costs as much as one in front. */
  private advanceEffects(dt: number): void {
    const eye = this.rig.camera.position;
    const effectDistance = this.graphics.effectDistance;
    for (const entry of this.effects) {
      // `advanceAnimations` keeps the bone matrix current (`effectWorldPosition`).
      const [x, y, z] = effectWorldPosition(
        entry.object,
        entry.attached === true,
        entry.object.parent,
      );
      const dx = x - eye.x,
        dy = y - eye.y,
        dz = z - eye.z;
      const fade = entry.paused ? 0 : effectFade(dx * dx + dy * dy + dz * dz, effectDistance);
      if (fade === 0) {
        entry.object.visible = false;
        continue;
      }
      entry.object.visible = true;
      entry.instance.setFade(fade);
      entry.instance.update(dt, this.rig.camera);
      // An attached effect rides its bone, already refreshed with its body.
      if (!entry.attached) refreshWorldMatrix(entry.object);
    }
    for (const entry of this.equipmentEffectEntries) {
      entry.object.updateWorldMatrix(true, false);
      const m = entry.object.matrixWorld.elements;
      const dx = m[12] - eye.x,
        dy = m[13] - eye.y,
        dz = m[14] - eye.z;
      const fade = effectFade(dx * dx + dy * dy + dz * dz, effectDistance);
      entry.instance.object.visible = fade > 0;
      if (fade === 0) continue;
      entry.instance.setFade(fade);
      entry.instance.update(dt, this.rig.camera);
    }
  }

  /** Pose the near tier every frame and farther tiers on their stride, so distant motion slows instead of freezing; scaled steps keep every mixer on time. */
  private advanceAnimations(dt: number): void {
    const camera = this.rig.camera;
    const eye = camera.position;
    const animationDistance = this.graphics.animationDistance;
    const nearLimit = animationDistance * animationDistance;
    const midLimit = 2 * animationDistance * (2 * animationDistance);
    // The far ring reaches the draw distance: anything posed must be drawable.
    const far = this.graphics.drawDistance;
    const midFarLimit = Math.min(3 * animationDistance, far) ** 2;
    const limit = far * far;
    this.poseFrustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.poseFrustum.setFromProjectionMatrix(this.poseFrustumMatrix);
    let near = 0;
    let index = 0;
    for (const entry of this.animated) {
      // World, not local, position: an object parented under another has a
      // local position relative to its host, not to the world.
      const m = entry.object.matrixWorld.elements;
      const dx = m[12] - eye.x,
        dy = m[13] - eye.y,
        dz = m[14] - eye.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const stride = animationStride(
        d2,
        this.frameNo,
        index++,
        nearLimit,
        midLimit,
        midFarLimit,
        limit,
      );
      if (stride === 0) continue;
      if (!shouldPose(this.poseFrustum, m[12], m[13], m[14], d2, far, animatedRadius(entry)))
        continue;
      entry.mixer.update(dt * stride);
      refreshWorldMatrix(entry.object);
      near++;
    }
    this.animatedNear = near;
  }

  /** Distance fade on or off; the zone's own fog is kept for turning it back on. */
  setFogEnabled(on: boolean): void {
    if (this.fogOn === on) return;
    this.fogOn = on;
    if (!on) {
      this.scene.fog = null;
      return;
    }
    const { color, near, far } = this.fog.current;
    this.scene.fog = new THREE.Fog(color, near, far);
  }

  fogIsEnabled(): boolean {
    return this.fogOn;
  }

  /** The underwater wash and the ease back on surfacing; arithmetic in `ZoneFog`. */
  private updateUnderwaterFog(dt: number): void {
    const sceneFog = this.scene.fog as THREE.Fog | null;
    const world = this.world;
    if (!sceneFog || !world) return;
    const cam = this.rig.camera.position;
    const surface = world.terrain.waterAt(cam.x, cam.z);
    const stepped = this.fog.step(dt, surface !== null && cam.y < surface);
    if (!stepped) return;
    sceneFog.color.copy(stepped.color);
    sceneFog.near = stepped.near;
    sceneFog.far = stepped.far;
    this.bgColor.copy(stepped.color);
  }

  private resize(): void {
    // The viewport only: reading the canvas size after WebGL resizes the
    // backing store feeds bad dimensions into the next frame.
    const width = Math.max(1, Math.floor(window.innerWidth));
    const height = Math.max(1, Math.floor(window.innerHeight));
    const size = this.gl.getSize(scratchSize);
    if (size.x !== width || size.y !== height) {
      this.gl.setSize(width, height, false);
    }
    this.rig.setView(width, height, this.viewCover);
  }

  /** The canvas region an opaque HUD window covers; the camera recentres the hero (`CameraRig.setView`). */
  setViewCover(cover: ViewCover | null): void {
    this.viewCover = cover;
  }

  stats(): RendererStats {
    const info = this.gl.info.render;
    return {
      drawCalls: info.calls,
      triangles: info.triangles,
      entityViews: this.views.size,
      animatedEntities: this.animatedNear,
      pendingAttachments: this.attachQueue.length,
      terrainTiles: this.builtTiles.size,
      staticBatches: this.staticBatches.size,
      foliageCompanions: this.activeFoliageCompanions,
      hideMs: this.lastHideMs,
      preMs: this.lastPreMs,
      effectsMs: this.lastEffectsMs,
      postMs: this.lastPostMs,
      weaponStripes: this.stripes.count,
      drawMs: this.lastDrawMs,
      texturesUploaded: this.materials.uploadedCount,
    };
  }

  /** The collision wireframe, built once and kept; returns the triangle count. */
  setCollisionDebug(world: World, visible: boolean): number {
    this.collisionDebugWanted = visible;
    if (!visible) {
      if (this.collisionDebug) this.collisionDebug.object.visible = false;
      return 0;
    }
    // Rebuilt when the triangle count changes, i.e. when streaming touches it.
    if (this.collisionDebug && this.collisionDebugAt !== world.collision.triangleCount()) {
      this.clearCollisionDebug();
    }
    if (!this.collisionDebug) {
      const built = buildCollisionWireframe(world.collision);
      if (!built) return 0;
      this.collisionDebug = built;
      this.collisionDebugAt = world.collision.triangleCount();
      this.scene.add(built.object);
      log.debug(`collision debug: ${built.stats.triangles} triangles`);
    }
    this.collisionDebug.object.visible = true;
    return world.collision.triangleCount();
  }

  /** Draw the server's walkable ground, or hide it with none; returns polygon and link counts. */
  setNavigationDebug(
    ground: NavigationGround | null,
    standingOn: number | null,
    aroundY: number | null = null,
  ): NavigationDebugStats {
    this.clearNavigationDebug();
    if (!ground) return { polygons: 0, links: 0, otherStoreys: 0 };

    const built = buildNavigationOverlay(ground, standingOn, aroundY);
    if (!built) return { polygons: 0, links: 0, otherStoreys: 0 };
    this.navigationDebug = built;
    this.scene.add(built.object);
    log.debug(`navigation debug: ${built.stats.polygons} polygons, ${built.stats.links} links`);
    return built.stats;
  }

  private clearNavigationDebug(): void {
    if (!this.navigationDebug) return;
    this.scene.remove(this.navigationDebug.object);
    this.navigationDebug.dispose();
    this.navigationDebug = null;
  }

  private clearCollisionDebug(): void {
    this.collisionDebugAt = -1;
    if (!this.collisionDebug) return;
    this.scene.remove(this.collisionDebug.object);
    this.collisionDebug.geometry.dispose();
    this.collisionDebug.material.dispose();
    this.collisionDebug = null;
  }

  private clearEntities(): void {
    // Local ids stop meaning anything here.
    this.target = null;
    this.targetRing?.clear();
    this.clearTargetLabel();
    for (const id of [...this.views.keys()]) this.detach(id);
    this.entityGroup.clear();
    this.views.clear();
    this.withActions.clear();
    this.animated.length = 0;
    this.riders.clear();
    this.pendingMounts.clear();
    this.mountAsks.clear();
    this.effectMixers.clear();
    this.equipmentEffectEntries.length = 0;
    this.attachQueue.length = 0;
    this.preloadCandidates.length = 0;
    this.candidateListDirty = true;
    this.candidateMembership = -1;
    this.evictedMembership = -1;
    this.lastCandidateEye = null;
    this.shadowGround.clear();
    this.icons.clear();
  }

  private clearTerrain(): void {
    this.attachQueue.length = 0;
    for (const built of this.builtTiles.values()) disposeTile(built, this.materials);
    this.builtTiles.clear();
    while (this.terrainDisposalQueue.length > 0) {
      const built = this.terrainDisposalQueue.pop()!;
      disposeTile(built, this.materials);
    }
    this.terrainGroup.clear();
    this.waterGroup.clear();
    this.ripples?.clear();
    this.shadows?.clear();
    this.target = null;
    this.targetRing?.clear();
    this.clearTargetLabel();
    this.lastPlayerPos = null;
    this.wasAtWaterline = false;
    this.clearSkybox();
    this.appliedAtmosphere = '';
    this.appliedSkybox = null;
    this.disposeOwned();
  }

  private clearSkybox(): void {
    this.zoneSeq++;
    if (this.skybox) {
      this.skyScene.remove(this.skybox);
      this.skybox = null;
    }
    if (this.skySunMaterial) {
      this.skySunMaterial.dispose();
      this.skySunMaterial = null;
    }
  }

  dispose(): void {
    this.stopFaces();
    this.stripes.dispose();
    this.clearTerrain();
    this.clearCollisionDebug();
    this.clearNavigationDebug();
    this.clearEntities();
    for (const pending of this.prototypes.values()) {
      void pending.then(p => p?.geometries.forEach(g => g.dispose()));
    }
    this.prototypes.clear();
    for (const pending of this.equipmentPrototypes.values()) {
      void pending.then(p => p?.geometries.forEach(g => g.dispose()));
    }
    this.equipmentPrototypes.clear();
    for (const pending of this.interactionIconMaterials.values()) {
      void pending.then(material => {
        if (!material) return;
        material.map?.dispose();
        material.dispose();
      });
    }
    this.interactionIconMaterials.clear();
    this.ripples?.dispose();
    this.ripples = null;
    this.shadows?.dispose();
    this.shadows = null;
    this.clearTargetLabel();
    this.targetRing?.dispose();
    this.targetRing = null;
    this.guideArrow?.removeFromParent();
    this.guideArrow = null;
    this.guideArrowLoading = false;
    this.target = null;
    this.materials.dispose();
    this.gl.dispose();
  }
}

/** Refresh a frozen subtree; `updateMatrixWorld(true)` alone is a no-op on it. */
export function refreshWorldMatrix(object: THREE.Object3D): void {
  const frozen = object.matrixWorldAutoUpdate === false;
  if (frozen) object.matrixWorldAutoUpdate = true;
  object.updateMatrixWorld(true);
  if (frozen) object.matrixWorldAutoUpdate = false;
}

function modelBounds(object: THREE.Object3D): Pick<Prototype, 'shadowExtents' | 'height'> {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (!Number.isFinite(box.min.x) || box.isEmpty()) return {};
  const ex = (box.max.x - box.min.x) / 2;
  const ez = (box.max.z - box.min.z) / 2;
  const height = box.max.y - box.min.y;
  const bounds: Pick<Prototype, 'shadowExtents' | 'height'> = {};
  if (Number.isFinite(ex) && Number.isFinite(ez) && Math.max(ex, ez) > 0)
    bounds.shadowExtents = [ex, ez];
  if (Number.isFinite(height) && height > 0) bounds.height = height;
  return bounds;
}

function applyTransform(object: THREE.Object3D, entity: Entity): void {
  object.position.set(entity.position[0], entity.position[1], entity.position[2]);
  object.quaternion.set(
    entity.rotation[0],
    entity.rotation[1],
    entity.rotation[2],
    entity.rotation[3],
  );
  object.scale.set(entity.scale[0], entity.scale[1], entity.scale[2]);
}

/**
 * Whether every placement can share one static batch: any number of meshes
 * and materials, but nothing per-placement (head marker, animation), nothing
 * order-dependent (blending; additive is fine), and no shader material of our
 * own (the waterfall knows nothing of instancing).
 */
function isBatchableStatic(entity: Entity, prototype: Prototype): boolean {
  if (entity.kind !== 'static' && entity.kind !== 'scenery') return false;
  if (entity.interactionIcon || entity.gatherable || prototype.skinned || prototype.clip)
    return false;
  return batchParts(prototype.object) !== null;
}

/** The meshes a batch would draw, or null when the model cannot be instanced. */
function batchParts(root: THREE.Object3D): THREE.Mesh[] | null {
  const meshes: THREE.Mesh[] = [];
  let valid = true;
  root.traverse(object => {
    if (!valid) return;
    const drawable = object as THREE.Mesh & {
      isSprite?: boolean;
      isPoints?: boolean;
      isLine?: boolean;
    };
    if (drawable.isSprite || drawable.isPoints || drawable.isLine) {
      valid = false;
      return;
    }
    if (!drawable.isMesh) return;
    const mesh = drawable;
    if (!mesh.visible) return;
    if (Object.values(mesh.geometry.morphAttributes).some(list => list.length > 0)) {
      valid = false;
      return;
    }
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.length === 0 || !materials.every(isInstanceableMaterial)) {
      valid = false;
      return;
    }
    meshes.push(mesh);
  });
  return valid && meshes.length > 0 ? meshes : null;
}

function isInstanceableMaterial(material: THREE.Material | undefined): boolean {
  if (!material) return false;
  if ((material as THREE.ShaderMaterial).isShaderMaterial) return false;
  if (material.blending === THREE.AdditiveBlending) return true;
  return !material.transparent && material.blending === THREE.NormalBlending;
}
