/**
 * The engine-neutral resource shapes the game and renderer consume. Nothing
 * here may mention a file format or Three.js. Typed arrays, so buffers
 * transfer from the worker without a copy.
 */

import type { HeldItems } from './formats/avatar';
import type { SoundCatalogue, SpellVisualData, UnitSounds } from './formats/tables';

/** How a surface composites, from the shader name in the shipped data. */
export type BlendMode = 'opaque' | 'cutout' | 'blend' | 'additive';

export interface MountRow {
  /** Carried by the mount-summon aura. */
  id: number;
  model: string;
  texture: string;
  effect: string;
}

/**
 * One rung of the storage upgrade ladder: it applies only while capacity is
 * exactly `requires`. No matching row is the top, and no upgrade shows.
 */
export interface StorageUpgradeRow {
  storage: number;
  slots: number;
  currency: number;
  price: number;
  item: number;
  requires: number;
}

/** One place on a class's talent tree (`spell_talent`); what a character bought is the wire's. */
export interface TalentRow {
  id: number;
  /** Grid row, from one at the top. */
  tier: number;
  /** Grid column, from one at the left. */
  column: number;
  classId: number;
  /** Points already spent in the tree needed to reach it. */
  requires: number;
  /** Another place to buy first, or 0. */
  after: number;
  ranks: number;
  spells: number[];
  icon: string;
  /** Its own words, in the interface string table. */
  says: number;
}

/** Every talent place and each class's trees: a place names its tree, only a class row says which. */
export interface TalentData {
  places: TalentRow[];
  trees: Array<{ classId: number; trees: number[] }>;
}

export interface TeleportStop {
  id: number;
  name: string;
  mapId: number;
  position: [number, number, number];
  orientation: number;
  type: number;
}

/** One `chat_menu` row and its `String_Menu` markup; script and sub-page columns are 0 where unset. */
export interface GossipMenu {
  id: number;
  text: string;
  scripts: number[];
  subMenus: number[];
}

export interface MeshGroup {
  start: number;
  count: number;
  texture: string | null;
  material: string;
  blend: BlendMode;
  doubleSided: boolean;
  /** The `unlit_*` family, nearly all: lighting is baked, so scene light would double-shade. */
  unlit: boolean;
  /** The shader family; kept because some describe motion (`waterfall` scrolls UVs), not blending. */
  shader: string;
}

export interface MeshData {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Baked vertex lighting, RGBA sRGB bytes; the shaders are `texture * vColor0`. Empty when absent. */
  colors: Uint8Array;
  /** Always fits 16 bits (the reader rejects indices past the vertex count); the union is the data's. */
  indices: Uint16Array | Uint32Array;
  groups: MeshGroup[];
  /**
   * Set when an animation drives a node placing this mesh: `positions` are
   * untransformed and the whole node chain, root first, is rebuilt as objects.
   */
  chain?: Array<{ key: string; local: number[]; animated: boolean }>;
  /**
   * Absolute blend-shape poses, not deltas, matching three's
   * `morphTargetsRelative = false`. Only a handful of meshes have them.
   */
  morphTargets?: MorphTargetData[];
}

export interface MorphTargetData {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  weight: number;
}

export interface ModelData {
  path: string;
  meshes: MeshData[];
  /** Meshes drawn by default; characters ship every variant as a mesh. Empty means all. */
  defaultMeshes: string[];
  /** Node animation embedded in the model (windmill blades), unlike a skinned `anim/` clip. */
  nodeClip?: AnimationClipData;
}

export interface TextureData {
  ref: string;
  image: ImageBitmap;
}

/** A 2D affine transform, SVG/canvas convention: x' = a*x + c*y + tx. */
export interface UiMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

/**
 * One interface movie's display list in interface terms. Lengths are CSS
 * pixels; paths are SVG `d` strings in the shape's own frame.
 */
export interface UiSkinData {
  movie: string;
  width: number;
  height: number;
  background: string | null;
  exports: Array<{ id: number; name: string }>;
  shapes: UiSkinShape[];
  sprites: UiSkinSprite[];
  edits: UiSkinEdit[];
  root: UiSkinPlaced[][];
}

export type UiSkinFill =
  | { kind: 'solid'; css: string; opacity: number }
  | {
      kind: 'bitmap';
      imageId: number;
      art: string | null;
      matrix: UiMatrix;
      repeating: boolean;
    }
  | { kind: 'unsupported' };

/** What an item's own row says, for a caller holding only its entry. */
export interface ItemFacts {
  itemClass: number;
  subClass: number;
  quality: number;
  requiredLevel: number;
  descriptionId: number;
  inventoryType: number;
  armour: number;
  binding: number;
  /** One bit per class from one. Zero means unrestricted, and the card says nothing of class. */
  allowedClasses: number;
  stats: ReadonlyArray<{ kind: number; value: number }>;
  damage: ReadonlyArray<{ min: number; max: number; kind: number }>;
  /** Swing time in ms. */
  delay: number;
  block: number;
  /** Spell ids; what each does is the spell row's business. */
  spells: number[];
  spellSlots: ReadonlyArray<{ id: number; trigger: number }>;
  startsQuest: number;
}

export interface UiSkinShape {
  id: number;
  bounds: { x: number; y: number; w: number; h: number };
  fills: UiSkinFill[];
  paths: Array<{ fill: number; d: string }>;
}

export interface UiSkinPlaced {
  depth: number;
  characterId: number | null;
  matrix: UiMatrix;
  name: string | null;
  /** From the colour transform; states parked at zero are not drawn. */
  opacity: number;
  clipDepth?: number;
}

export interface UiSkinSprite {
  id: number;
  frameCount: number;
  frames: UiSkinPlaced[][];
}

export interface UiSkinEdit {
  id: number;
  bounds: { x: number; y: number; w: number; h: number };
  varName: string;
  sampleHtml: string;
  sizePx: number;
  color: string | null;
  face: string | null;
}

export interface UiFace {
  family: string;
  bytes: Uint8Array;
}

/** `body` is the face most fields use, `title` the next; null where the build ships no file. */
export interface UiFaces {
  body: UiFace | null;
  title: UiFace | null;
}

export interface ZoneAtmosphere {
  /** Display (sRGB) values, 0..1, as they should reach the screen. */
  fogColor: [number, number, number];
  fogNear: number;
  fogFar: number;
  /** The ground's sunlit and shaded colours, display values; absent leaves the ground's own. */
  sunColor?: [number, number, number];
  shadeColor?: [number, number, number];
  skybox: string | null;
  skyHill?: string | null;
  skySun?: string | null;
}

export interface ZoneInfo {
  id: number;
  name: string;
  mapId: number;
  mapName: string;
  /** The pack the ground comes from where no map row names one (the selection map). */
  world?: string;
  centre: [number, number];
  bounds: [number, number, number, number];
  hasScenery: boolean;
  /** The parent zone, or -1. Most zones inherit their parent's map art. */
  parentId: number;
  /** The zone table's `priority`: 1 and 2 are a map's top zones, 13 a named detail zone. */
  priority: number;
  icon: string;
  /** 2 friendly, 1 neutral, 0 hostile. Colours the zone's name on the map. */
  friendly: number;
  /** On every row, so walking across a boundary changes the weather (`World.zoneAt`). */
  atmosphere: ZoneAtmosphere;
  /** Music and ambience as `c_sound` ids; 0 defers to the enclosing zone. */
  sound: ZoneSound;
}

export interface ZoneSound {
  music: number;
  ambience: number;
}

export interface ZoneIndex {
  zones: ZoneInfo[];
}

/** One terrain tile; `heights` is `side * side`, row-major, from `origin` at the minimum corner. */
export interface TerrainTileData {
  tile: [number, number];
  origin: [number, number];
  side: number;
  tileSize: number;
  heights: Float32Array;
  colours: Uint16Array | null;
  visible: boolean[];
  /**
   * Per-chunk water height, 8x8, null where a chunk has none; empty for no
   * water. The flag alone means nothing (44% of chunks), so the provider
   * keeps only levels that rise above the ground.
   */
  water: (number | null)[];
  /** The build's pre-baked 512x512 tile image, the fallback for a tile with no mask. */
  baseTexture: string | null;
  /** R blends layer 1 over the base, G layer 2, B is shadow (0 lit, 1 dark). */
  maskTexture: string | null;
  /**
   * Up to three ground textures per chunk, by position: slot 1 blends by the
   * mask's red, slot 2 by green. A missing slot 1 stays empty rather than
   * sliding slot 2 into it.
   */
  chunkTextures: (string | null)[][];
}

/** One playable race; `name` is null where the build's string table lacks it. */
export interface PlayableRace {
  race: number;
  maleDisplayInfoId: number;
  femaleDisplayInfoId: number;
  nameTextId: number;
  name: string | null;
}

/** A class number only: the build's class rows carry no name. */
export interface PlayableClass {
  playerClass: number;
}

/**
 * The looks one body offers, each found in the build (an image shipped or a
 * mesh carried), never assumed.
 */
export interface LookOptions {
  skins: number[];
  faces: number[];
  hairStyles: number[];
  /** The offered hair styles whose mesh is bare scalp: no hair at all. */
  bareHairStyles: number[];
  hairColours: number[];
}

export interface PlayableKinds {
  races: PlayableRace[];
  classes: PlayableClass[];
}

/** Per placement, not per model: one character model is worn by many NPCs. */
export interface Appearance {
  /** The composited body atlas reference, or null; opaque above the provider. */
  skin: string | null;
  /** Mesh names to draw, overriding the model's defaults; empty means default. */
  meshes: string[];
  /** `skin` replaces every texture, not only gaps: how creature colour variants work. */
  skinReplacesAll: boolean;
  /**
   * Hair colour 1-8 for an avatar. Not tinted: the build ships one texture
   * per colour (`<race>_<sex>_hair_<a|b>_01..08.tga`).
   */
  hairColor?: number;
  /** Texture per mesh name, over its material's: a cape wears its item's art. */
  meshTextures?: Readonly<Record<string, string>>;
  attachments?: EquipmentAttachment[];
  /** Stable identity, so a built variant can be cached and shared. */
  key: string;
}

/** Where an item is worn; `twoHand` is carried alongside the main hand, as dressed NPCs do. */
export type WornSlot =
  | 'head'
  | 'shoulders'
  | 'shirt'
  | 'chest'
  | 'legs'
  | 'feet'
  | 'hands'
  | 'back'
  | 'twoHand'
  | 'mainHand'
  | 'offHand'
  | 'ranged';

/** One item model parented to a named node in the character skeleton. */
export interface EquipmentAttachment {
  model: string;
  texture: string | null;
  /** Exact avatar attachment node, read from the character model. */
  node: string;
  /** Where the item is worn, kept so a weapon can move between hand and rest. */
  slot: WornSlot;
  /** Hand node used when this weapon is drawn, from its item class/subclass. */
  heldNode?: string;
  /** A right shoulder that reuses the left shoulder's model, mirrored on X. */
  mirrorX?: boolean;
  /** Folded weapons align their authored Dummy_folded node to the host. */
  alignNode?: string;
  /** Effects declared by itemmodeldata, attached to nodes inside this item. */
  effects?: Array<{ node: string; effect: string }>;
}

/** A locally resolved model and appearance for a server-described entity. */
export interface NetworkAppearance {
  model: string;
  scale: number;
  appearance?: Appearance;
  /** The clip the create block says the body was spawned playing. */
  animationName?: string;
  /** Whether `c_animationdata` marks that clip as looping. */
  animationLoops?: boolean;
  /** What a humanoid creature's look holds, which picks its combat clips; absent for empty hands. */
  heldItems?: HeldItems;
}

/** A thing standing in the world: scenery, a building, or a creature. */
export interface Placement {
  /** Model resource path. */
  model: string;
  /** World-space position. */
  position: [number, number, number];
  /** World-space orientation as a quaternion (x, y, z, w). */
  rotation: [number, number, number, number];
  scale: [number, number, number];
  /** Table entry id, when the placement came from a spawn table. 0 = scenery. */
  entry: number;
  /**
   * `effect` places a `.beff` rather than a model. It is kept in the same
   * list because the game places them the same way, out of the same `.itm`
   * records — but nothing may hand one to the model loader.
   */
  kind: 'static' | 'scenery' | 'creature' | 'effect';
  /** Head-billboard icon from the user's files, for an interactable placement. */
  interactionIcon?: string;
  /** Set for creatures that composite their look; absent means "as shipped". */
  appearance?: Appearance;
}

/**
 * A particle effect: what emits, what it emits, and how both change over time.
 *
 * Declared here rather than imported from the reader so this file keeps its
 * rule: it names no format. `providers/localEffect.ts` turns a decoded `.beff`
 * into these shapes, and a reader for any other format would have to produce
 * them too. Times are in frames at 30 per second.
 */

/** One animated value. `loop` repeats the keys past the last one. */
export interface EffectCurve<T> {
  loop: boolean;
  keys: Array<{ frame: number; value: T }>;
}

export type EffectVec3 = [number, number, number];

/**
 * Where an emitter's particles are born. `carrier` is not a shape: it marks
 * the emitter that moves and fades a mesh, and it draws no particles.
 */
export type EmitterShape = 'point' | 'sphere' | 'disc' | 'box' | 'carrier';

/**
 * How a particle is drawn: a camera-facing sprite, a quad with its own
 * orientation, a quad stretched along its velocity (`facingStreak` also rolls
 * to face the camera), a strip through a moving point's recent positions
 * (`facingRibbon` twists to face the camera), or a trail swept between two
 * weapon nodes.
 */
export type ParticleShape =
  | 'sprite'
  | 'freeQuad'
  | 'streak'
  | 'facingStreak'
  | 'ribbon'
  | 'facingRibbon';

export type EffectBlend = 'alpha' | 'additive';

/** Which quad point sits on the particle, per axis; `start`/`end` grow a streak away from its birth. */
export type QuadAnchor = 'center' | 'start' | 'end';

/**
 * A force on a live particle: a steady `pull` along a direction whose length
 * is part of its strength, a `speedScale` that keeps a share of the speed
 * each second, a `wander` of random pushes, or a `swirl` about an axis
 * through the emitter (`swirlMode` 1 also draws particles in towards it).
 */
export type EffectAffector =
  | { kind: 'pull'; strength: EffectCurve<number>; direction: EffectCurve<EffectVec3> }
  | { kind: 'speedScale'; factor: EffectCurve<number> }
  | { kind: 'wander'; amplitude: EffectVec3; changeEveryFrames: number }
  | {
      kind: 'swirl';
      strength: EffectCurve<number>;
      axis: EffectCurve<EffectVec3>;
      swirlMode: 0 | 1;
    };

export interface EffectParticle {
  shape: ParticleShape;
  movesWithEmitter: boolean;
  /** A live particle is swung round when its emitter turns. */
  turnsWithEmitter: boolean;
  /** Frames. */
  lifeFrames: number;
  lifelong: boolean;
  lifeJitter: number;
  sizeJitter: number;
  lockAspect: boolean;
  /** Radians. */
  startTilt: EffectVec3;
  startTiltJitter: EffectVec3;
  spinJitter: EffectVec3;
  growJitter: number;
  blend: EffectBlend;
  anchorColumn: QuadAnchor;
  anchorRow: QuadAnchor;
  mirrorU: boolean;
  mirrorV: boolean;
  /** Texture turned on the quad by this many 90-degree steps. */
  uvQuarterTurns: number;
  /** Already resolved; '' if none. */
  texture: string;
  tintR: EffectCurve<number>;
  tintG: EffectCurve<number>;
  tintB: EffectCurve<number>;
  opacityCurve: EffectCurve<number>;
  sizeX: EffectCurve<number>;
  sizeY: EffectCurve<number>;
  spinX: EffectCurve<number>;
  spinY: EffectCurve<number>;
  spinZ: EffectCurve<number>;
  growX: EffectCurve<number>;
  growY: EffectCurve<number>;
}

export interface EffectEmitter {
  /** The model node this emitter hangs off, or '' for the origin (a torch's flame on its post). */
  attachPoint: string;
  shape: EmitterShape;
  faceCamera: boolean;
  /** As on `EffectParticle`, set on the emitter instead. */
  movesWithEmitter: boolean;
  turnsWithEmitter: boolean;
  /** Frames. -1 emits forever. */
  activeFrames: number;
  firstBurstFrame: number;
  burstSpacing: number;
  /** Jitter percentages on the burst spacing, burst size and launch speeds. */
  burstSpacingJitter: number;
  burstSizeJitter: number;
  radialSpeedJitter: number;
  aimSpeedJitter: number;
  killParticlesWithEmitter: boolean;
  /** The spawn shape's size per axis (radii for a sphere or disc). */
  spawnSize: [EffectCurve<number>, EffectCurve<number>, EffectCurve<number>];
  /** Percent of the radius, from the centre out, that spawns nothing. */
  hollowPct: EffectCurve<number>;
  /** The emitter node's turn per axis, in radians. */
  emitterAngle: [EffectCurve<number>, EffectCurve<number>, EffectCurve<number>];
  emitterOffset: [EffectCurve<number>, EffectCurve<number>, EffectCurve<number>];
  emitterScale: [EffectCurve<number>, EffectCurve<number>, EffectCurve<number>];
  burstSize: EffectCurve<number>;
  radialSpeed: EffectCurve<number>;
  aimSpeed: EffectCurve<number>;
  spreadAngle: EffectCurve<number>;
  aimAxis: EffectCurve<EffectVec3>;
  particle: EffectParticle;
  affectors: EffectAffector[];
  children: EffectEmitter[];
}

export interface EffectModel {
  model: string;
  loop: boolean;
  alpha: EffectCurve<number>;
  /**
   * Named node matrices (16 floats, model space). Emitters hang off them,
   * and an effect's model may have no geometry (the fountain's `dummy.bdae`).
   */
  attachPoints: Record<string, number[]>;
  /** Drives the model's transform, when the effect version supplies one. */
  animation: EffectEmitter | null;
}

export interface EffectData {
  path: string;
  /** Start delay range in milliseconds; the effect starts after a pick seeded by its path, the same every cast. */
  delayMin: number;
  delayMax: number;
  models: EffectModel[];
  emitters: EffectEmitter[];
}

/** A labelled rectangle and its weather; not a unit of ground. */
export interface ZoneData {
  info: ZoneInfo;
  spawn: [number, number];
}

/**
 * One 64-unit tile: ground, placements, collision. The load unit; absolute
 * world coordinates, so tiles add and drop independently.
 */
export interface TileData {
  mapId: number;
  tile: [number, number];
  /** Null where the map ships no `.trn`, or the tile is flat or empty. */
  terrain: TerrainTileData | null;
  placements: Placement[];
  collision: CollisionItem[];
}

/** One skeleton node. Quaternions are already unconjugated by the provider. */
export interface BoneData {
  /** Node id, e.g. 'Bip01_Pelvis-node'. Animation channels target this. */
  id: string;
  name: string;
  /** COLLADA sid, e.g. 'Bone12'. Skins address joints by this. May be ''. */
  sid: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  /** Index into `SkeletonData.bones`, or -1 for a root. */
  parent: number;
}

export interface SkinData {
  mesh: string;
  /** Bone indices this skin uses, in joint order. */
  joints: number[];
  /** Inverse bind matrix per joint: 16 floats each, column-major for the GPU. */
  inverseBind: Float32Array;
  /** Four joint slots per vertex, indexing into `joints`. */
  skinIndices: Uint16Array;
  /** Four weights per vertex, matching `skinIndices`. */
  skinWeights: Float32Array;
  /** Bind shape matrix, 16 floats. */
  bindShape: Float32Array;
}

export interface SkeletonData {
  path: string;
  bones: BoneData[];
  skins: SkinData[];
}

/**
 * One bone property resolved to whole values: per-component channels and
 * axis-angle turns are resolved in the provider.
 */
export interface AnimationTrack {
  /** A bone or node id; for `morphInfluence`, the deformed mesh's name. */
  bone: string;
  property: 'position' | 'quaternion' | 'scale' | 'morphInfluence';
  times: Float32Array;
  /** 3 values per key for position/scale, 4 for quaternion, 1 for a weight. */
  values: Float32Array;
  /** Which of the mesh's `morphTargets` — `morphInfluence` only. */
  morphIndex?: number;
}

/** Clip names the animation tables ask for (`swim_backword` keeps its shipped spelling). */
export type ClipName =
  | 'run_normal'
  | 'walk_forward'
  | 'walk_backward'
  | 'move_left'
  | 'move_right'
  | 'idle'
  | 'run_idle'
  | 'move_left_idle'
  | 'move_right_idle'
  | 'jump_start'
  | 'jump_start_left'
  | 'jump_start_right'
  | 'jump_air'
  | 'jump_air_left'
  | 'jump_air_right'
  | 'jump_in_place'
  | 'jump_land'
  | 'jump_land_left'
  | 'jump_land_right'
  | 'jumplandrun'
  | 'jumplandrun_left'
  | 'jumplandrun_right'
  // Swimming.
  | 'swim_idle'
  | 'swim_forward'
  | 'swim_backword'
  | 'swim_left'
  | 'swim_right'
  | 'combat_ready'
  | 'combat_load'
  | 'combat_aim'
  | 'stun'
  // Fallback-only bare names some older models ship; nothing asks for them.
  | 'run'
  | 'walk';

export interface AnimationClipData {
  name: string;
  /** Seconds. */
  duration: number;
  tracks: AnimationTrack[];
}

export interface CollisionGeom {
  type: 'primitive' | 'mesh';
  /** Physics info flags; the low two bits identify interior trigger volumes. */
  flags?: number;
  /** Which primitive it is. Everything but a mesh is treated as its box. */
  shape?: 'wall' | 'box' | 'cylinder' | 'mesh';
  position: [number, number, number];
  halfSize?: [number, number, number];
  /** Yaw of the block about the world Y axis, radians. Primitives only. */
  rotY?: number;
  vertices?: [number, number, number][];
  faces?: [number, number, number, number][];
}

export interface CollisionItem {
  path: string;
  pos: [number, number, number];
  rot: [number, number, number, number];
  scale: [number, number, number];
  geoms: CollisionGeom[];
  /** The spawn-table entry, as on its `Placement`; absent for map scenery. */
  entry?: number;
}

/** Collision streams with its tile: a bridge arriving after its ground is one you fall through. */
export interface CollisionData {
  items: CollisionItem[];
}

/** How the world map's regions adjoin, from `area.cnfg`; a zone id of 0 is drawn but unimplemented. */
export interface AreaLinks {
  /** Top zone ids in the world map's own button order. 0 where unimplemented. */
  regions: number[];
  /** Per top zone, the neighbour in each direction: up, down, left, right. 0 for none. */
  neighbours: Record<number, [number, number, number, number]>;
  /** Per top zone, its sub-areas: `zoneId` stands for it on this map, `topZoneId` is the region it leads to. */
  subAreas: Record<number, Array<{ topZoneId: number; zoneId: number }>>;
  /** Top zones the build ships a map picture for; only the provider knows the packs. */
  mapped: number[];
  /** Per top zone, the name of its button on the world map. */
  buttons: Record<number, string>;
}

/** One leg of the bus network. See `gameplay/busRoutes`. */
export interface BusLeg {
  from: number;
  to: number;
  price: number;
}

/** A spell's own figures, from its row in the spell table. Zero where it has none. */
export interface SpellStats {
  /** What casting it spends, in whichever power the caster's class has. */
  powerCost: number;
  castMs: number;
  cooldownMs: number;
  /** How far away its target may be, in world units. */
  range: number;
  /** Casting it seats the caster on a mount; the book lists it on the mount page. */
  mount: boolean;
}

/**
 * One interface bitmap with its rung scale. Fill matrices are authored
 * against the base rung (one bitmap pixel per shape pixel), so a retina
 * (`_2x`) bitmap draws at half its pixel size: `scale` is shape units
 * per bitmap pixel, 1 at base, 0.5 at retina.
 */
export interface UiSkinArt {
  image: ImageBitmap;
  scale: number;
}

/** One sound file, decoded. */
export interface SoundClipData {
  sampleRate: number;
  /** One array per channel, each sample in [-1, 1]. */
  channels: Float32Array[];
}

export interface ResourceTypes {
  soundCatalogue: SoundCatalogue;
  soundClip: SoundClipData;
  unitSounds: UnitSounds | null;
  zoneIndex: ZoneIndex;
  mountList: MountRow[];
  teleportStops: TeleportStop[];
  storageUpgrades: StorageUpgradeRow[];
  talents: TalentData;
  spellString: string | null;
  busRoutes: BusLeg[];
  gossipMenu: GossipMenu;
  npcGreeting: GossipMenu;
  areaMap: TextureData;
  areaLinks: AreaLinks;
  minimap: TextureData;
  zone: ZoneData;
  tile: TileData;
  model: ModelData;
  texture: TextureData;
  playableKinds: PlayableKinds;
  lookOptions: LookOptions;
  avatar: Appearance;
  networkAppearance: NetworkAppearance;
  staticObjectModel: NetworkAppearance;
  skeleton: SkeletonData;
  animation: AnimationClipData;
  animationName: string | null;
  visualWithEffect: number | null;
  animationNamed: string | null;
  impactVisual: number | null;
  splash: TextureData;
  effect: EffectData;
  /** Twelve floats, row-major 3x3 then translation; null if the model lacks the node. */
  attachPoint: number[] | null;
  creatureName: string | null;
  creatureEntryName: string | null;
  spellName: string | null;
  spellText: string | null;
  questText: string | null;
  spellIcon: ImageBitmap | null;
  itemIcon: ImageBitmap | null;
  topbarIcon: ImageBitmap | null;
  classIcon: ImageBitmap | null;
  uiSkin: UiSkinData;
  uiIcon: UiSkinArt | null;
  uiStrings: readonly string[];
  uiFaces: UiFaces;
  /** One GPU program stage's source text, as the build ships it. */
  shaderText: string;
  itemFacts: ItemFacts | null;
  spellCastable: boolean;
  spellRank: number;
  spellCastingTime: number;
  spellStats: SpellStats;
  spellVisualOf: number;
  itemWeaponClass: { itemClass: number; subClass: number };
  heldItem: EquipmentAttachment[];
  itemName: string | null;
  itemText: string | null;
  spellVisual: SpellVisualData | null;
}
