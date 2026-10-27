/** The parts of the world tables.bin describes. The tables carry no column
 * names, only a format string, so every column below is an index, and each
 * one read is checked against the format letter it should have. */

import { logger } from '../../core/log';
import { FTable, type Row } from './ftable';
import type { BusLeg, GossipMenu, ItemFacts, SpellStats } from '../types';
import type {
  MountRow,
  PlayableKinds,
  StorageUpgradeRow,
  TalentData,
  TeleportStop,
} from '../types';

const log = logger('tables');

/** World units per terrain tile on both axes. */
export const TILE_SIZE = 64.0;

// --- staticobject_spawns: "uuuffffffuufuf" at 1.0.2, "uuuffffffuufffuf" from
// 1.1.4 on. The one 'scale' float at column 11 became scaleX/Y/Z at 11..13.
// Everything ahead of it — entry, map, xyz, rotation — is unmoved.
const SO_SPAWN_ENTRY = 1;
const SO_SPAWN_MAP = 2;
const SO_SPAWN_XYZ = [3, 4, 5] as const;
const SO_SPAWN_ROT = [6, 7, 8] as const;
const SO_SPAWN_SCALE = 11;

// --- staticobject_proto: type, display row, scale and festival.
const SO_PROTO_TYPE = 1;
const SO_PROTO_DISPLAY = 3;
const SO_PROTO_SCALE = 7;
/** 0 always present, else a `festival.tbl` id; only the active festival's objects show. */
const SO_PROTO_FESTIVAL = 19;

// --- staticobject_displayinfo: column 1 is the model path, and the row ends
// in twelve strings, six node names followed by six effect paths — the
// object's attached effects, a node in its model and the `.beff` that hangs
// off it.
const SO_DISPLAY_PATH = 1;
/** Six (node, effect) pairs per object — the row has room for no more. */
const SO_DISPLAY_EFFECTS = 6;

// --- creature_spawns
const CR_SPAWN_ENTRY = 1;
const CR_SPAWN_MAP = 2;
const CR_SPAWN_XYZ = [3, 4, 5] as const;
const CR_SPAWN_O = 6;

// --- creature_appearance: the name string and the display row it wears.
const CR_APPEARANCE_NAME = 1;
const CR_APPEARANCE_DISPLAY = 5;

// --- creaturedisplayinfo: the model row, the scale it is drawn at, and
//     the skin it wears.
const CR_DISPLAY_MODEL = 1;
const CR_DISPLAY_SCALE = 3;
const CR_DISPLAY_SKIN = 5;

// --- creaturemodeldata: the model path.
const CR_MODEL_PATH = 2;

// --- creature_proto: the scale multiplier and the NPC's service flags, one
//     bit per thing it offers.
const CR_PROTO_SCALE = 10;
const CR_PROTO_FLAGS = 11;
/** The `chat_menu` row a creature greets a player with; 0 for none. */
const CR_PROTO_GREETING_MENU = 56;
/** `chat_menu`: column 1 names the page's string, 2-7 its scripts, 8-13 the pages under it. */
const CHAT_MENU_STRING = 1;
const CHAT_MENU_SCRIPTS = 2;
const CHAT_MENU_SUB_MENUS = 8;
const CHAT_MENU_SLOTS = 6;

// --- mountprototype: the key, the model path, a texture that replaces the
//     model's own, and an effect path.
const MOUNT_ID = 0;
const MOUNT_MODEL = 2;
const MOUNT_TEXTURE = 3;
const MOUNT_EFFECT = 8;

// --- zones: "iiiuffffffffuuffffuuuussssssfffffusiiiu" (2.2.0). The zone's own
// id indexes String_Zones_<lang> directly, so player-facing names come
// straight out of the table.
const ZONE_PARENT = 2;
const ZONE_MAP = 3;
const ZONE_PRIORITY = 12;
const ZONE_BOUNDS = [4, 6, 8, 10] as const; // x1, z1, x2, z2
const ZONE_FOG_COLOR = 13;
const ZONE_FOG_NEAR = 14;
const ZONE_FOG_FAR = 15;
/**
 * Offsets into the zone's six-string sky block: dome, horizon hill, sun,
 * halo. Found by shape (column 22 in 2.2.0, 20 in 1.1.4).
 */
const ZONE_SKY_DOME = 0;
const ZONE_SKY_HILL = 1;
const ZONE_SKY_SUN = 2;
const ZONE_SKY_HALO = 4;
const ZONE_SKY_BLOCK = 6;
/** 2 friendly, 1 neutral, 0 hostile; the third int after the icon string, moving with it. */
const ZONE_FRIENDLY_AFTER_ICON = 3;
/** Music and ambience `c_sound` ids (0 none): the last two numbers before the first string column. */
const ZONE_MUSIC_FROM_STRINGS = -2;
/**
 * The ground's light, packed like the fog colour: the sun's colour four
 * numbers before the first string column, the shade's three before.
 */
const ZONE_SUN_FROM_STRINGS = -4;
const ZONE_SHADE_FROM_STRINGS = -3;
const ZONE_AMBIENCE_FROM_STRINGS = -1;

// --- c_sound: "uuusfffuuuuuuuuuuu". Column 1 the numbered-file count, 3 the
// file, 4 a volume (0.2-1), 6 how far it carries (own reading), 7 a
// `c_sound_bank` key.
const SOUND_VARIANTS = 1;
const SOUND_FLAGS = 2;
const SOUND_PATH = 3;
const SOUND_VOLUME = 4;
const SOUND_REACH = 6;
const SOUND_BANK = 7;
/*
 * Column 2's bits, by which rows set them. Bit 1 is set on exactly the `m_`
 * music rows. Bit 2 is set on the sounds that happen somewhere — creatures,
 * spells, weapons, objects — and on no interface, music or ambience row.
 * Bit 4 is set on music, ambience, the running objects (a fountain, a
 * volcano) and the files named `…_loop`. Bit 8 is set mostly on creature,
 * weapon and footstep sounds, the ones heard over and over; taking it as
 * "vary each play" is **own choice**.
 */
const SOUND_FLAG_MUSIC = 1;
const SOUND_FLAG_POSITIONAL = 2;
const SOUND_FLAG_LOOP = 4;
const SOUND_FLAG_PITCHED = 8;
/**
 * c_sound_bank: the key, a name (`NPC_HURT`, `MC_MOVE`, `INTERFACE`), then a
 * number whose low 16 bits are 1 to 8 and read as how many of the bank's
 * sounds play at once (**own reading**). Bit 16 is set on some banks; what it
 * means is not settled by the data, and it is not read.
 */
const SOUND_BANK_CAPACITY = 2;
/**
 * ZoneSpecialMusic: a zone id and a `c_sound` id. The music named is an
 * arena's or a region's `…_combat` piece, so it is taken as the zone's fight
 * music.
 */
const BATTLE_MUSIC_ZONE = 0;
const BATTLE_MUSIC_CUE = 1;
/**
 * creaturemodeldata: the model's sound set, the row's last column. Its
 * values are `sound_solution` keys, and the set's own description matches
 * the model row's (the male human model's set is "Male Human").
 */
const CR_MODEL_SOUNDS_FROM_END = -1;

export const TABLE_NAMES = [
  'map_info',
  'zones',
  'staticobject_spawns',
  'staticobject_proto',
  'staticobject_displayinfo',
  'creature_spawns',
  'creature_appearance',
  'creaturedisplayinfo',
  'creaturemodeldata',
  'creature_proto',
  'itemmodeldata',
  'creaturedisplayinfoextra',
  'itemdisplayinfo',
] as const;

/*
 * Spell visuals: a spell's `c_spellvisual` row names a `c_spellvisualstate`
 * per phase, each naming a body clip and up to six particle files.
 */

/**
 * The phases in `c_spellvisual` column order from 1, named for what their
 * rows hold; the last column is read but not shown.
 */
const PHASE_COLUMNS = [
  'opening',
  'windUp',
  'release',
  'impact',
  'lasting',
  'area',
  'ending',
] as const;

export type SpellPhase = (typeof PHASE_COLUMNS)[number];

/**
 * Body anchors for the six effect columns, read off the files: sleep and
 * stun, hit and aura, ground, two hand columns (the busier taken as right),
 * and area.
 */
const ANCHOR_COLUMNS = ['overhead', 'chest', 'feet', 'rightHand', 'leftHand', 'area'] as const;

export type EffectAnchor = (typeof ANCHOR_COLUMNS)[number];

/**
 * How a particle file is placed, by the value in its row's placement column:
 * it rides its anchor, rides the body, bursts once where it starts, or is
 * dropped in the world and left there.
 */
export type EffectPlacement = 'ride' | 'rideBody' | 'burst' | 'drop';

/** 0 rides (most rows), 2 "pow" bursts, 3 ground and area files; 1 (breath, aim) and 4 (one parry row) ride the body. */
function placementOf(value: number): EffectPlacement {
  switch (value) {
    case 1:
      return 'rideBody';
    case 2:
      return 'burst';
    case 3:
      return 'drop';
    default:
      return 'ride';
  }
}

/**
 * Projectile flight: 0 straight; 1 and 2 on rows named for draining, both
 * drawn as a pull back to the caster. How they differ is unknown.
 */
export type MissileFlight = 'straight' | 'drain1' | 'drain2';

function flightOf(value: number): MissileFlight {
  if (value === 1) return 'drain1';
  if (value === 2) return 'drain2';
  return 'straight';
}

/** `c_spellvisual` columns after the phases. */
const VISUAL_MISSILE = 1 + PHASE_COLUMNS.length;
const VISUAL_STREAK = VISUAL_MISSILE + 1;
const VISUAL_IMPACT_DELAY = VISUAL_MISSILE + 2;

/** `c_spellvisualstate` columns. */
const PHASE_CLIP = 1;
const PHASE_FIRST_EFFECT = 2;
const PHASE_SOUND = 8;
const PHASE_SHAKE = 9;
const PHASE_CLIP_BLEND = 10;
/** The blend value for a clip that takes the whole body. */
const CLIP_BLEND_WHOLE_BODY = 2;

/** `c_spellvisualeffect` columns. */
const EFFECT_NAME = 1;
const EFFECT_PATH = 2;
const EFFECT_SCALE = 6;
const EFFECT_PLACEMENT = 7;
const EFFECT_FLIGHT = 8;
const EFFECT_PROJECTILES = 9;

/** The effect's scale column is a percentage, like `creaturedisplayinfo`'s. */
const EFFECT_SCALE_PERCENT = 100;

/** `c_animationdata` columns. */
const C_ANIM_NAME = 1;
const C_ANIM_LOOP = 2;

/** `spell_new` columns. */
const SPELL_ICON = 10;
const CAST_TIME_COLUMN = 16;
const COOLDOWN_COLUMN = 17;
const MAX_RANGE_COLUMN = 21;
const POWER_COST_COLUMN = 41;
const SPELL_VISUAL_COLUMN = 26;
const SPELL_SKILL_GROUP = 1;
const MOUNT_KIND_COLUMN = 25;
const SPELL_FLAGS_COLUMN = 43;
/** The spell's name string id; the spell id itself lands on the wrong string for many spells (`realPacks.test.ts`). */
const SPELL_NAME_STRING = 5;
/** The spell's rank in its chain, `1..N` like the name's numeral; column 2 is the class tree, not a chain. */
const SPELL_RANK = 6;
const SPELL_DESCRIPTION_STRING = 7;

/** Bit in the spell's flags column for a spell that is never cast. */
const SPELL_NEVER_CAST_FLAG = 0x4;

/** One `c_spellvisualeffect` row, resolved. */
export interface SpellVisualEffect {
  effectId: number;
  name: string;
  /** `.beff` path, as the pack spells it. */
  pathname: string;
  placement: EffectPlacement;
  /** A multiplier: the table's percentage already divided out. */
  scale: number;
  /** Only meaningful on a projectile. */
  flight: MissileFlight;
  /** How many of this projectile fly at once. At least 1. */
  count: number;
  /** Where on the body it sits, or null for the visual's projectile. */
  anchor: EffectAnchor | null;
}

/** One `c_spellvisualstate` row, resolved. */
export interface SpellPhaseData {
  /** `c_animationdata` id, or 0 for "leave the body alone". */
  casterClipId: number;
  /** The clip name `casterClipId` resolves to, or null when there is none. */
  casterClip: string | null;
  casterClipLoops: boolean;
  /** Whether the clip takes the whole body rather than the upper half. */
  wholeBody: boolean;
  sound: number;
  /** Set on a few rows; nothing shakes the camera yet. */
  shake: number;
  effects: SpellVisualEffect[];
}

/** One `c_spellvisual` row, with everything it points at resolved. */
export interface SpellVisualData {
  id: number;
  /** Null where the row names no phase. */
  phases: Record<SpellPhase, SpellPhaseData | null>;
  /** The projectile this visual flies, or null when it has none. */
  missile: SpellVisualEffect | null;
  /**
   * Which blade streak the weapon trails, 0 for none. Only melee skills set
   * the streak column; its low byte is taken as the streak's look.
   */
  weaponStreak: number;
  /** Milliseconds between the swing and the impact. */
  impactDelayMs: number;
}

/** What the creature tables say a body looks like. */
export interface CreatureModel {
  /** Model resource path, or null when the tables name none. */
  path: string | null;
  scale: number;
  /** Colour-variant skin name, or null. */
  skin: string | null;
}

/** `creaturedisplayinfo`'s scale is stored as a percentage, not a multiplier. */
const DISPLAY_SCALE_PERCENT = 100;

/** A creature the tables cannot describe. Fresh each time; callers mutate it. */
function noCreatureModel(): CreatureModel {
  return { path: null, scale: 1, skin: null };
}

/** Read when present: `mountprototype` is absent from the oldest builds and only the mount picker needs it. */
export const OPTIONAL_TABLE_NAMES = [
  'mountprototype',
  'c_animationdata',
  'teleport_spot',
  'chat_menu',
  'spell_new',
  'spell_effect',
  'c_spellvisual',
  'c_spellvisualstate',
  'c_spellvisualeffect',
  'items',
  't_bus_route',
  'storage_upgrade',
  'spell_talent',
  'character_class',
  'character_race',
  'c_sound',
  'c_sound_bank',
  'sound_solution',
  'ZoneSpecialMusic',
] as const;

/**
 * `sound_solution` columns from 1, one `c_sound` id each, named by the files
 * they point at (the goblin's column 7 is `sfx_npc_goblin_die_1`).
 */
export const UNIT_SOUND_STATES = [
  'idle',
  'greeting',
  'attack',
  'jump',
  'aggro',
  'drink',
  'dead',
  'eat',
  'hurt',
  'shout',
  'hello',
  'bye',
  'cry',
  'critical',
] as const;

export type UnitSoundState = (typeof UNIT_SOUND_STATES)[number];

/**
 * `character_race`: the body per sex, then the name id. Checked against the
 * five shipped rows.
 */
const RACE_MALE_DISPLAY = 3;
const RACE_FEMALE_DISPLAY = 4;
const RACE_NAME_STRING = 5;

/** `items.tbl` columns. The look column is a fallback; equipment dresses from the appearance tables. */
const ITEM_CLASS = 1;
const ITEM_SUBCLASS = 2;
const ITEM_NAME_STRING = 3;
const ITEM_QUALITY = 5;
const ITEM_WORN_ON_COLUMN = 11;
const ITEM_LEVEL_NEEDED_COLUMN = 16;
// The item's own words sit right after how it binds.
const ITEM_DESCRIPTION_STRING = 71;
const ITEM_CLASS_COL = 1;

const ITEM_SUBCLASS_COL = 2;
const ITEM_ARMOUR = 54;
const ITEM_BINDING = 70;
const ITEM_LOOK_COLUMN = 4;
const ITEM_WEARER_CLASSES_COLUMN = 13;
/** Nine (kind, amount) pairs after their count. */
const ITEM_STATS_FIRST = 28;
const ITEM_STAT_PAIRS = 9;
/** Two runs of least, most and kind, one per sort of damage it deals. */
const ITEM_DAMAGE_FIRST = 48;
const ITEM_DAMAGE_COUNT = 2;
const ITEM_DELAY = 55;
const ITEM_BLOCK = 81;
/** Two spell slots six columns apart; only the id is read. */
const ITEM_SPELLS_FIRST = 58;
const ITEM_SPELLS_COUNT = 2;
const ITEM_SPELL_STRIDE = 6;
/** Where in a spell slot its trigger sits: the column after the spell's id. */
const ITEM_SLOT_WHEN = 1;
/** The quest using the item offers, 0 for none; always a `quests.tbl` key. */
const ITEM_STARTS_QUEST = 75;

/** `itemdisplayinfo`'s icon column, after the two models and their textures. */
const ITEM_DISPLAY_ICON = 5;

export type { MountRow, StorageUpgradeRow, TeleportStop };

/** One `c_sound` row: a file, or a family of numbered files, and how it plays. */
export interface SoundCue {
  id: number;
  /** The file, as the pack spells it. With variants, the first of them. */
  path: string;
  /** How many numbered files the sound has: `_1` to `_<variants>`. 1 for one file. */
  variants: number;
  music: boolean;
  /** Heard from where it happens, rather than everywhere at once. */
  positional: boolean;
  loop: boolean;
  /** Marked to vary from play to play; see `SOUND_FLAG_PITCHED`. */
  pitched: boolean;
  volume: number;
  /** How far it carries in world units, or 0 where the row does not say. */
  reach: number;
  /** The `c_sound_bank` row that caps how many play at once, or 0. */
  bank: number;
}

export interface SoundBankRow {
  id: number;
  /** How many of the bank's sounds may play at once; 0 for no limit. */
  capacity: number;
}

export interface SoundCatalogue {
  cues: SoundCue[];
  banks: SoundBankRow[];
  /** [zone id, `c_sound` id]: the music a zone plays while a fight calls for it. */
  battleMusic: Array<[number, number]>;
}

/** What a body says, as `c_sound` ids, by the moment it says it. */
export type UnitSounds = Partial<Record<UnitSoundState, number>>;

export class SchemaError extends Error {}

export interface MapInfo {
  id: number;
  name: string;
  world: string;
  staticObjects: number;
  creatures: number;
}

export interface ZoneRow {
  id: number;
  name: string;
  parent: string | null;
  /** The parent zone's id, or -1 when this zone is a top-level one. */
  parentId: number;
  /** The area map's glyph for this zone, as a bare file name. */
  icon: string;
  /** 2 friendly, 1 neutral, 0 hostile. Colours the zone's name on the map. */
  friendly: number;
  /** The table's `priority`, read as an enum: 1 and 2 top zones, 13 a named detail zone. */
  priority: number;
  mapId: number;
  mapName: string;
  centre: [number, number];
  bounds: [number, number, number, number];
  hasScenery: boolean;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  /** The ground's sunlit and shaded colours, packed like `fogColor`; 0 when unset. */
  sunColor: number;
  shadeColor: number;
  skybox: string;
  /** The horizon layer drawn in front of the dome, or ''. */
  skyHill: string;
  /** The sun's (or moon's) texture, or ''. */
  skySun: string;
  /** A halo texture for the sun, or ''. */
  skyHalo: string;
  /** `c_sound` id of the zone's music, 0 for none. */
  music: number;
  /** `c_sound` id of the zone's ambient loop, 0 for none. */
  ambience: number;
}

/** A sky field as a path, or ''; the column holds '0', bare directories and backslashes too. */
function skyPath(value: unknown, extensions: RegExp): string {
  const path = trim(value).replace(/\\/g, '/');
  return extensions.test(path) ? path : '';
}

/** How many consecutive `ch` start at `at`. */
function runLength(fmt: string, at: number, ch: string): number {
  let n = 0;
  while (at + n < fmt.length && fmt[at + n] === ch) n++;
  return n;
}

/** Start and length of the longest run of `ch`, or `{ at: -1, length: 0 }`. */
function longestRun(fmt: string, ch: string): { at: number; length: number } {
  let best = { at: -1, length: 0 };
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== ch) continue;
    const length = runLength(fmt, i, ch);
    if (length > best.length) best = { at: i, length };
    i += length - 1;
  }
  return best;
}

/** The first place two `ch` sit side by side, for columns that move but keep their neighbours. */
function adjacentPair(fmt: string, ch: string): number {
  for (let i = 0; i < fmt.length - 1; i++) {
    if (fmt[i] === ch && fmt[i + 1] === ch) return i;
  }
  return -1;
}

/** Guard each column index against the table's own format string. */
function expect(table: FTable, name: string, checks: [number, string][]): void {
  for (const [index, want] of checks) {
    if (index >= table.format.length) {
      throw new SchemaError(
        `${name}: column ${index} beyond format ${JSON.stringify(table.format)}`,
      );
    }
    const got = table.format[index];
    if (!want.includes(got)) {
      throw new SchemaError(
        `${name}: column ${index} is ${JSON.stringify(got)}, expected one of ` +
          `${JSON.stringify(want)} (format ${JSON.stringify(table.format)})`,
      );
    }
  }
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
/** Nine stat pairs are reserved; an amount of zero is an empty slot, not a +0. */
function itemStats(row: readonly unknown[]): Array<{ kind: number; value: number }> {
  const out: Array<{ kind: number; value: number }> = [];
  for (let i = 0; i < ITEM_STAT_PAIRS; i += 1) {
    const kind = num(row[ITEM_STATS_FIRST + i * 2]);
    const value = num(row[ITEM_STATS_FIRST + i * 2 + 1]);
    if (kind > 0 && value > 0) out.push({ kind, value });
  }
  return out;
}

/** The spells an item carries. A slot holding no spell is not one. */
function itemSpells(row: readonly unknown[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < ITEM_SPELLS_COUNT; i += 1) {
    const id = num(row[ITEM_SPELLS_FIRST + i * ITEM_SPELL_STRIDE]);
    if (id > 0) out.push(id);
  }
  return out;
}

/** Each spell slot holding a spell, with the trigger that says when it fires. */
function itemSpellSlots(row: readonly unknown[]): Array<{ id: number; trigger: number }> {
  const out: Array<{ id: number; trigger: number }> = [];
  for (let i = 0; i < ITEM_SPELLS_COUNT; i += 1) {
    const at = ITEM_SPELLS_FIRST + i * ITEM_SPELL_STRIDE;
    const id = num(row[at]);
    if (id > 0) out.push({ id, trigger: num(row[at + ITEM_SLOT_WHEN]) });
  }
  return out;
}

/** What a weapon hits for. An entry that tops out at nothing is not one. */
function itemDamage(row: readonly unknown[]): Array<{ min: number; max: number; kind: number }> {
  const out: Array<{ min: number; max: number; kind: number }> = [];
  for (let i = 0; i < ITEM_DAMAGE_COUNT; i += 1) {
    const at = ITEM_DAMAGE_FIRST + i * 3;
    const max = num(row[at + 1]);
    if (max > 0) out.push({ min: num(row[at]), max, kind: num(row[at + 2]) });
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** Table strings are fixed-width and null-padded; the padding is not the name. */
const trim = (v: unknown): string => str(v).replace(/\0+$/, '');

/** The three columns of a spell row that hold the ids of its effect rows. */
const SPELL_EFFECT_SLOTS = [33, 34, 35] as const;
/** In an effect row: the written name of what it does, and the number it does it with. */
const SPELL_EFFECT_LABEL = 22;
const SPELL_EFFECT_ARGUMENT = 11;

/** Every table the client reads, decoded once per source (6 MB, cheap to hold). */
export class WorldTables {
  private readonly tables = new Map<string, FTable>();
  private readonly rows = new Map<string, Row[]>();
  private readonly keyed = new Map<string, Map<number, Row>>();
  private readonly strings = new Map<string, Map<number, string>>();

  private mapNameCol = 0;
  private mapWldCol = 0;
  /** 1 at 1.0.2, 3 from 1.1.4 on. Recorded because callers must use the scalar. */
  spawnScaleAxes = 1;
  /** First of the twelve effect columns, or -1 if this build's shape is unknown. */
  private soEffectFirst = -1;
  /** First of the zone's six sky columns, or -1 if this build's shape is unknown. */
  private zoneSkyFirst = -1;
  /** The area map glyph column (`ui/icons/board/`): the first string after the sky. */
  private zoneIconCol = -1;
  /** The zones table's first string column; music and ambience sit just ahead of it. */
  private zoneFirstString = -1;

  private constructor() {}

  static async load(read: (entry: string) => Promise<Uint8Array | null>): Promise<WorldTables> {
    const w = new WorldTables();
    for (const name of TABLE_NAMES) {
      const bytes = await read(`tables/${name}.tbl`);
      if (!bytes) throw new SchemaError(`tables.bin has no tables/${name}.tbl`);
      const table = new FTable(bytes);
      w.tables.set(name, table);
      w.rows.set(name, table.allRows());
      w.keyed.set(name, table.byKey());
    }
    for (const name of OPTIONAL_TABLE_NAMES) {
      const bytes = await read(`tables/${name}.tbl`);
      if (!bytes) continue;
      const table = new FTable(bytes);
      w.tables.set(name, table);
      w.rows.set(name, table.allRows());
      w.keyed.set(name, table.byKey());
    }
    w.schema();
    w.verify();
    log.info(
      `tables loaded: ${w.rows.get('zones')!.length} zones, ` +
        `${w.rows.get('staticobject_spawns')!.length} static spawns`,
    );
    return w;
  }

  /** Locate the columns that move between builds by shape. */
  private schema(): void {
    const mapFmt = this.table('map_info').format;
    const at = adjacentPair(mapFmt, 's');
    if (at < 0) {
      throw new SchemaError(
        'map_info: no adjacent pair of string columns to carry the map name ' +
          `and .wld path (format ${JSON.stringify(mapFmt)})`,
      );
    }
    this.mapNameCol = at;
    this.mapWldCol = at + 1;

    const spawnFmt = this.table('staticobject_spawns').format;
    const n = runLength(spawnFmt, SO_SPAWN_SCALE, 'f');
    if (n !== 1 && n !== 3) {
      throw new SchemaError(
        `staticobject_spawns: expected 1 or 3 scale floats at column ` +
          `${SO_SPAWN_SCALE}, found ${n} (format ${JSON.stringify(spawnFmt)})`,
      );
    }
    this.spawnScaleAxes = n;

    // The sky is the zone table's six-string run and the glyph the next
    // string; 2.2.0 moved both. Not fatal: a zone without them still loads.
    const zoneFmt = this.table('zones').format;
    const sky = longestRun(zoneFmt, 's');
    if (sky.length === ZONE_SKY_BLOCK) {
      this.zoneSkyFirst = sky.at;
      this.zoneIconCol = zoneFmt.indexOf('s', sky.at + sky.length);
    } else {
      log.warn(
        `zones: no run of ${ZONE_SKY_BLOCK} string columns for the sky ` +
          `(longest run is ${sky.length} at ${sky.at}, format ${JSON.stringify(zoneFmt)}) ` +
          '-- zones will have no sky and no map glyph',
      );
    }

    // The zone's music and ambience are the two uints ahead of its first
    // string column; a table of another shape leaves the zones silent.
    const firstString = zoneFmt.indexOf('s');
    if (firstString >= 2 && zoneFmt.slice(firstString - 2, firstString) === 'uu') {
      this.zoneFirstString = firstString;
    } else {
      log.warn(`zones: no music columns ahead of the strings (format ${JSON.stringify(zoneFmt)})`);
    }

    // The twelve effect strings are the table's only run of twelve. Not fatal
    // either: effects are decoration, not worth failing a zone load over.
    const displayFmt = this.table('staticobject_displayinfo').format;
    const run = longestRun(displayFmt, 's');
    if (run.length === SO_DISPLAY_EFFECTS * 2 && run.at > SO_DISPLAY_PATH) {
      this.soEffectFirst = run.at;
    } else {
      log.warn(
        'staticobject_displayinfo: no run of ' +
          `${SO_DISPLAY_EFFECTS * 2} string columns for the attached effects ` +
          `(longest run is ${run.length} at ${run.at}, format ` +
          `${JSON.stringify(displayFmt)}) -- objects will draw without them`,
      );
    }
  }

  private verify(): void {
    expect(this.table('staticobject_spawns'), 'staticobject_spawns', [
      [SO_SPAWN_ENTRY, 'u'],
      [SO_SPAWN_MAP, 'u'],
      [SO_SPAWN_XYZ[0], 'f'],
      [SO_SPAWN_XYZ[1], 'f'],
      [SO_SPAWN_XYZ[2], 'f'],
      [SO_SPAWN_ROT[1], 'f'],
    ]);
    expect(this.table('staticobject_proto'), 'staticobject_proto', [
      [SO_PROTO_DISPLAY, 'u'],
      [SO_PROTO_SCALE, 'f'],
    ]);
    expect(this.table('staticobject_displayinfo'), 'staticobject_displayinfo', [
      [SO_DISPLAY_PATH, 's'],
    ]);
    expect(this.table('creature_spawns'), 'creature_spawns', [
      [CR_SPAWN_ENTRY, 'u'],
      [CR_SPAWN_MAP, 'u'],
      [CR_SPAWN_XYZ[0], 'f'],
      [CR_SPAWN_O, 'f'],
    ]);
    expect(this.table('creature_proto'), 'creature_proto', [
      [CR_PROTO_SCALE, 'f'],
      [CR_PROTO_FLAGS, 'u'],
    ]);
    expect(this.table('creature_appearance'), 'creature_appearance', [
      [CR_APPEARANCE_NAME, 'uk'],
      [CR_APPEARANCE_DISPLAY, 'uk'],
    ]);
    expect(this.table('creaturedisplayinfo'), 'creaturedisplayinfo', [
      [CR_DISPLAY_MODEL, 'u'],
      [CR_DISPLAY_SKIN, 's'],
    ]);
    expect(this.table('creaturemodeldata'), 'creaturemodeldata', [[CR_MODEL_PATH, 's']]);
    expect(this.table('map_info'), 'map_info', [
      [this.mapNameCol, 's'],
      [this.mapWldCol, 's'],
    ]);
  }

  table(name: string): FTable {
    const t = this.tables.get(name);
    if (!t) throw new SchemaError(`table not loaded: ${name}`);
    return t;
  }

  rowsOf(name: string): Row[] {
    return this.rows.get(name) ?? [];
  }

  keyedRows(name: string): Map<number, Row> {
    return this.keyed.get(name) ?? new Map();
  }

  /** One `chat_menu` row, by its own id; the menus under it name rows the same way. */
  gossipMenuRow(id: number): Row | null {
    return this.keyedRows('chat_menu').get(id) ?? null;
  }

  /** One conversation page; a missing row or string reads as a page with no words. */
  gossipMenu(id: number, strings: ReadonlyMap<number, string>): GossipMenu {
    const row = this.gossipMenuRow(id);
    const columns = (first: number): number[] =>
      Array.from({ length: CHAT_MENU_SLOTS }, (_, at) => num(row?.[first + at]));
    return {
      id,
      text: row ? (strings.get(num(row[CHAT_MENU_STRING])) ?? '') : '',
      scripts: columns(CHAT_MENU_SCRIPTS),
      subMenus: columns(CHAT_MENU_SUB_MENUS),
    };
  }

  /** Rideable mounts from `mountprototype`; the summon aura names the row. */
  mounts(): MountRow[] {
    const out: MountRow[] = [];
    for (const r of this.rowsOf('mountprototype')) {
      const model = trim(r[MOUNT_MODEL]);
      const texture = trim(r[MOUNT_TEXTURE]);
      if (!model) continue;
      out.push({
        id: num(r[MOUNT_ID]),
        // Some rows carry the artist's export path; the pack has only the tail.
        model: model.replace(/^(?:\.\.\/)+mid_data\//, ''),
        texture,
        effect: trim(r[MOUNT_EFFECT]),
      });
    }
    return out;
  }

  /**
   * `storage_upgrade` ("uuuuuuu"): unread, storage, capacity granted,
   * currency and amount, item cost, capacity required. Found by requirement.
   */
  storageUpgrades(): StorageUpgradeRow[] {
    return this.rowsOf('storage_upgrade').map(row => ({
      storage: num(row[1]),
      slots: num(row[2]),
      currency: num(row[3]),
      price: num(row[4]),
      item: num(row[5]),
      requires: num(row[6]),
    }));
  }

  /**
   * `spell_talent`: grid place, tree, requirements, ranks, the spell each rank
   * teaches (unused rank columns are 0), picture and words.
   */
  talents(): TalentData {
    const places = this.rowsOf('spell_talent').map(row => ({
      id: num(row[0]),
      tier: num(row[1]),
      column: num(row[2]),
      classId: num(row[3]),
      requires: num(row[4]),
      after: num(row[5]),
      ranks: num(row[8]),
      spells: [9, 10, 11, 12, 13].map(at => num(row[at])).filter(spell => spell > 0),
      icon: trim(row[14]),
      says: num(row[15]),
    }));
    // `character_class`: its three trees after its own numbers; 0 for none.
    const trees = this.rowsOf('character_class').map(row => ({
      classId: num(row[0]),
      trees: [3, 4, 5].map(at => num(row[at])).filter(tree => tree > 0),
    }));
    return { places, trees };
  }

  /**
   * Races and classes. A race row has its two bodies (by sex) and its name
   * id in `String_Character_<lang>`; a class row has no name, only trees.
   */
  playableKinds(raceNames: Map<number, string>): PlayableKinds {
    const races = this.rowsOf('character_race').map(row => ({
      race: num(row[0]),
      maleDisplayInfoId: num(row[RACE_MALE_DISPLAY]),
      femaleDisplayInfoId: num(row[RACE_FEMALE_DISPLAY]),
      nameTextId: num(row[RACE_NAME_STRING]),
      name: raceNames.get(num(row[RACE_NAME_STRING])) ?? null,
    }));
    const classes = this.rowsOf('character_class').map(row => ({ playerClass: num(row[0]) }));
    return { races, classes };
  }

  teleportStops(): TeleportStop[] {
    return this.rowsOf('teleport_spot').map(row => ({
      id: num(row[0]),
      name: trim(row[1]),
      mapId: num(row[2]),
      position: [num(row[3]), num(row[4]), num(row[5])],
      orientation: num(row[6]),
      type: num(row[7]),
    }));
  }

  /**
   * The bus network as edges (from, to, price). The server treats it as
   * undirected and fares as the cheapest chain; no chain, no travel.
   */
  busRoutes(): BusLeg[] {
    return this.rowsOf('t_bus_route')
      .map(row => ({
        from: num(row[1]),
        to: num(row[2]),
        price: num(row[3]),
      }))
      .filter(edge => edge.from > 0 && edge.to > 0);
  }

  maps(): MapInfo[] {
    const statics = this.rowsOf('staticobject_spawns');
    const creatures = this.rowsOf('creature_spawns');
    const staticCounts = new Map<number, number>();
    for (const r of statics) {
      const m = num(r[SO_SPAWN_MAP]);
      staticCounts.set(m, (staticCounts.get(m) ?? 0) + 1);
    }
    const creatureCounts = new Map<number, number>();
    for (const r of creatures) {
      const m = num(r[CR_SPAWN_MAP]);
      creatureCounts.set(m, (creatureCounts.get(m) ?? 0) + 1);
    }

    const out: MapInfo[] = [];
    for (const [key, row] of this.keyedRows('map_info')) {
      out.push({
        id: key,
        name: str(row[this.mapNameCol]),
        world: str(row[this.mapWldCol]),
        staticObjects: staticCounts.get(key) ?? 0,
        creatures: creatureCounts.get(key) ?? 0,
      });
    }
    out.sort((a, b) => b.staticObjects + b.creatures - (a.staticObjects + a.creatures));
    return out;
  }

  /** Named zones; names from `String_Zones_<language>` by zone id. */
  zones(names: Map<number, string>): ZoneRow[] {
    const maps = new Map(this.maps().map(m => [m.id, m.name]));
    const staticCounts = new Map<number, number>();
    for (const r of this.rowsOf('staticobject_spawns')) {
      const m = num(r[SO_SPAWN_MAP]);
      staticCounts.set(m, (staticCounts.get(m) ?? 0) + 1);
    }

    const out: ZoneRow[] = [];
    for (const [key, row] of this.keyedRows('zones')) {
      const mapId = num(row[ZONE_MAP]);
      if (!maps.has(mapId)) continue;
      const x1 = num(row[ZONE_BOUNDS[0]]);
      const z1 = num(row[ZONE_BOUNDS[1]]);
      const x2 = num(row[ZONE_BOUNDS[2]]);
      const z2 = num(row[ZONE_BOUNDS[3]]);
      const sky = this.zoneSkyFirst;
      const models = /\.bdae$/i;
      const images = /\.(tga|png|pvr)$/i;
      out.push({
        id: key,
        name: names.get(key) || `zone ${key}`,
        parent: names.get(num(row[ZONE_PARENT])) ?? null,
        parentId: num(row[ZONE_PARENT]),
        priority: num(row[ZONE_PRIORITY]),
        icon: this.zoneIconCol < 0 ? '' : trim(row[this.zoneIconCol]),
        friendly: this.zoneIconCol < 0 ? 1 : num(row[this.zoneIconCol + ZONE_FRIENDLY_AFTER_ICON]),
        mapId,
        mapName: maps.get(mapId) ?? '',
        centre: [(x1 + x2) / 2, (z1 + z2) / 2],
        bounds: [x1, z1, x2, z2],
        hasScenery: (staticCounts.get(mapId) ?? 0) > 0,
        fogColor: num(row[ZONE_FOG_COLOR]),
        fogNear: num(row[ZONE_FOG_NEAR]),
        fogFar: num(row[ZONE_FOG_FAR]),
        sunColor: this.zoneColumn(row, ZONE_SUN_FROM_STRINGS),
        shadeColor: this.zoneColumn(row, ZONE_SHADE_FROM_STRINGS),
        skybox: sky < 0 ? '' : skyPath(row[sky + ZONE_SKY_DOME], models),
        skyHill: sky < 0 ? '' : skyPath(row[sky + ZONE_SKY_HILL], models),
        skySun: sky < 0 ? '' : skyPath(row[sky + ZONE_SKY_SUN], images),
        skyHalo: sky < 0 ? '' : skyPath(row[sky + ZONE_SKY_HALO], images),
        music: this.zoneColumn(row, ZONE_MUSIC_FROM_STRINGS),
        ambience: this.zoneColumn(row, ZONE_AMBIENCE_FROM_STRINGS),
      });
    }
    fillMissingAtmosphere(out);
    out.sort((a, b) => a.mapName.localeCompare(b.mapName) || a.name.localeCompare(b.name));
    return out;
  }

  setStrings(name: string, table: FTable): Map<number, string> {
    const map = new Map<number, string>();
    const keys = table.keys();
    for (let i = 0; i < table.rows; i++) {
      const row = table.row(i);
      map.set(keys[i], str(row[1]).replace(/\0+$/, ''));
    }
    this.strings.set(name, map);
    return map;
  }

  strings_(name: string): Map<number, string> | undefined {
    return this.strings.get(name);
  }

  string(name: string, id: number): string | null {
    return this.strings.get(name)?.get(id) ?? null;
  }

  // — model lookups ---------------------------------------------------

  /** Model path, scale and type for a static object entry. */
  staticModel(entry: number): { path: string | null; scale: number; type: number } {
    const proto = this.keyedRows('staticobject_proto').get(entry);
    if (!proto) return { path: null, scale: 1, type: 0 };
    const display = this.keyedRows('staticobject_displayinfo').get(num(proto[SO_PROTO_DISPLAY]));
    return {
      path: display ? str(display[SO_DISPLAY_PATH]) || null : null,
      scale: num(proto[SO_PROTO_SCALE]) || 1,
      type: num(proto[SO_PROTO_TYPE]),
    };
  }

  /** Six (node, `.beff`) pairs on the object's model; a pair missing either side attaches nothing. */
  staticEffects(entry: number): Array<{ node: string; effect: string }> {
    if (this.soEffectFirst < 0) return [];
    const proto = this.keyedRows('staticobject_proto').get(entry);
    if (!proto) return [];
    const display = this.keyedRows('staticobject_displayinfo').get(num(proto[SO_PROTO_DISPLAY]));
    if (!display) return [];

    const out: Array<{ node: string; effect: string }> = [];
    for (let i = 0; i < SO_DISPLAY_EFFECTS; i++) {
      const node = trim(display[this.soEffectFirst + i]);
      const effect = trim(display[this.soEffectFirst + SO_DISPLAY_EFFECTS + i]);
      if (node && effect) out.push({ node, effect });
    }
    return out;
  }

  /** Which festival an object belongs to, 0 for always-present scenery. */
  staticFestival(entry: number): number {
    const proto = this.keyedRows('staticobject_proto').get(entry);
    if (!proto || SO_PROTO_FESTIVAL >= proto.length) return 0;
    return num(proto[SO_PROTO_FESTIVAL]);
  }

  /** A creature's service flags, as the server also sends them; 0 for none. */
  npcServiceBits(entry: number): number {
    return num(this.keyedRows('creature_proto').get(entry)?.[CR_PROTO_FLAGS]) >>> 0;
  }

  /** The `chat_menu` row a creature opens its conversation with, or 0 where it has none. */
  greetingMenuOf(entry: number): number {
    return num(this.keyedRows('creature_proto').get(entry)?.[CR_PROTO_GREETING_MENU]);
  }

  /** A zone column counted back from the first string, or 0 where there is none. */
  private zoneColumn(row: Row, fromStrings: number): number {
    return this.zoneFirstString < 0 ? 0 : num(row[this.zoneFirstString + fromStrings]);
  }

  /** Every sound, the banks capping them and zones' fight music; empty without the tables. */
  soundCatalogue(): SoundCatalogue {
    const cues: SoundCue[] = [];
    if (this.tables.has('c_sound')) {
      expect(this.table('c_sound'), 'c_sound', [
        [SOUND_VARIANTS, 'u'],
        [SOUND_FLAGS, 'u'],
        [SOUND_PATH, 's'],
        [SOUND_VOLUME, 'f'],
        [SOUND_REACH, 'f'],
        [SOUND_BANK, 'u'],
      ]);
      for (const [id, row] of this.keyedRows('c_sound')) {
        const path = trim(row[SOUND_PATH]).split('\\').join('/');
        if (!path) continue;
        const flags = num(row[SOUND_FLAGS]);
        cues.push({
          id,
          path,
          variants: Math.max(1, num(row[SOUND_VARIANTS])),
          music: (flags & SOUND_FLAG_MUSIC) !== 0,
          positional: (flags & SOUND_FLAG_POSITIONAL) !== 0,
          loop: (flags & SOUND_FLAG_LOOP) !== 0,
          pitched: (flags & SOUND_FLAG_PITCHED) !== 0,
          volume: num(row[SOUND_VOLUME]) || 1,
          reach: num(row[SOUND_REACH]),
          bank: num(row[SOUND_BANK]),
        });
      }
    }
    const banks: SoundBankRow[] = [];
    if (this.tables.has('c_sound_bank')) {
      for (const [id, row] of this.keyedRows('c_sound_bank')) {
        const packed = num(row[SOUND_BANK_CAPACITY]);
        banks.push({ id, capacity: packed & 0xffff });
      }
    }
    const battleMusic: Array<[number, number]> = [];
    if (this.tables.has('ZoneSpecialMusic')) {
      for (const row of this.rowsOf('ZoneSpecialMusic')) {
        const cue = num(row[BATTLE_MUSIC_CUE]);
        if (cue) battleMusic.push([num(row[BATTLE_MUSIC_ZONE]), cue]);
      }
    }
    return { cues, banks, battleMusic };
  }

  /**
   * What a body says. Its model's own sound set first; a playable body with
   * none speaks with its race and sex's voice (sex read off the body worn).
   * Own choice: a race with no voice borrows the first race's, same sex.
   */
  unitSounds(entry: number, displayInfoId: number, race = -1, gender = -1): UnitSounds | null {
    if (!this.tables.has('sound_solution')) return null;
    const appearance = entry ? this.keyedRows('creature_appearance').get(entry) : undefined;
    const displayId = appearance ? num(appearance[CR_APPEARANCE_DISPLAY]) : displayInfoId;
    const own = this.displaySounds(displayId);
    if (own?.hurt) return own;

    const bodies = this.rowsOf('character_race').map(row => ({
      race: num(row[0]),
      male: num(row[RACE_MALE_DISPLAY]),
      female: num(row[RACE_FEMALE_DISPLAY]),
    }));
    const path = this.displayModel(displayId)?.path?.toLowerCase();
    const worn = path
      ? bodies
          .flatMap(body => [
            { race: body.race, sex: 0, display: body.male },
            { race: body.race, sex: 1, display: body.female },
          ])
          .find(side => this.displayModel(side.display)?.path?.toLowerCase() === path)
      : undefined;
    // A creature wearing no player's body keeps its own voice: a wolf does not borrow a man's.
    if (!worn && entry) return own;
    const sex = worn ? worn.sex : gender;
    const ofRace = worn ? worn.race : race;
    if (sex !== 0 && sex !== 1) return own;

    const sideOf = (body: (typeof bodies)[number]): number => (sex === 0 ? body.male : body.female);
    const ownRace = bodies.find(body => body.race === ofRace);
    for (const display of [ownRace ? sideOf(ownRace) : 0, ...bodies.map(sideOf)]) {
      const sounds = display ? this.displaySounds(display) : null;
      if (sounds?.hurt) return sounds;
    }
    return own;
  }

  /** The sound set of the model a display row wears, or null when it has none. */
  private displaySounds(displayId: number): UnitSounds | null {
    const display = this.keyedRows('creaturedisplayinfo').get(displayId);
    if (!display) return null;
    const model = this.keyedRows('creaturemodeldata').get(num(display[CR_DISPLAY_MODEL]));
    if (!model) return null;
    const setId = num(model[model.length + CR_MODEL_SOUNDS_FROM_END]);
    const set = this.keyedRows('sound_solution').get(setId);
    if (!set) return null;
    const out: UnitSounds = {};
    let any = false;
    UNIT_SOUND_STATES.forEach((state, i) => {
      const cue = num(set[1 + i]);
      if (cue) {
        out[state] = cue;
        any = true;
      }
    });
    return any ? out : null;
  }

  creatureNameStringId(entry: number): number {
    return num(this.keyedRows('creature_appearance').get(entry)?.[CR_APPEARANCE_NAME]);
  }

  /** Model, scale and skin for a creature entry; `creature_proto`'s scale multiplies the display row's. */
  creatureModel(entry: number): CreatureModel {
    const appearance = this.keyedRows('creature_appearance').get(entry);
    if (!appearance) return noCreatureModel();

    const resolved = this.displayModel(num(appearance[CR_APPEARANCE_DISPLAY]));
    if (!resolved) return noCreatureModel();

    const proto = this.keyedRows('creature_proto').get(entry);
    if (proto && num(proto[CR_PROTO_SCALE])) resolved.scale *= num(proto[CR_PROTO_SCALE]);
    return resolved;
  }

  /** By display id, for a body with no spawn entry and so no scale multiplier. */
  creatureDisplayModel(displayInfoId: number): CreatureModel {
    return this.displayModel(displayInfoId) ?? noCreatureModel();
  }

  /** The display row's own model, or null when there is no such row. */
  private displayModel(displayInfoId: number): CreatureModel | null {
    const display = this.keyedRows('creaturedisplayinfo').get(displayInfoId);
    if (!display) return null;
    const model = this.keyedRows('creaturemodeldata').get(num(display[CR_DISPLAY_MODEL]));
    return {
      path: model ? str(model[CR_MODEL_PATH]) || null : null,
      scale: (num(display[CR_DISPLAY_SCALE]) || DISPLAY_SCALE_PERCENT) / DISPLAY_SCALE_PERCENT,
      skin: str(display[CR_DISPLAY_SKIN]) || null,
    };
  }

  animationName(animationId: number): string | null {
    const row = this.keyedRows('c_animationdata').get(animationId);
    return row && typeof row[C_ANIM_NAME] === 'string' && row[C_ANIM_NAME]
      ? (row[C_ANIM_NAME] as string)
      : null;
  }

  /** A clip name as `c_animationdata` spells it, matched ignoring case. */
  animationNamed(name: string): string | null {
    const wanted = name.toLowerCase();
    for (const row of this.keyedRows('c_animationdata').values()) {
      const own = row[C_ANIM_NAME];
      if (typeof own === 'string' && own.toLowerCase() === wanted) return own;
    }
    return null;
  }

  /** The lowest visual showing only this particle file on impact, matched by file name. */
  impactVisualPlaying(file: string): number | null {
    const wanted = file.toLowerCase();
    let best: number | null = null;
    for (const id of this.keyedRows('c_spellvisual').keys()) {
      if (best !== null && id >= best) continue;
      const visual = this.spellVisual(id);
      if (!visual || visual.missile) continue;
      const only = PHASE_COLUMNS.every(p => p === 'impact' || visual.phases[p] === null);
      const effects = visual.phases.impact?.effects ?? [];
      if (!only || effects.length !== 1) continue;
      const file = effects[0]!.pathname.split('/').pop()!.toLowerCase();
      if (file === wanted) best = id;
    }
    return best;
  }

  /** Whether `c_animationdata` marks this clip as looping. */
  animationLoops(animationId: number): boolean {
    const row = this.keyedRows('c_animationdata').get(animationId);
    return row ? num(row[C_ANIM_LOOP]) !== 0 : false;
  }

  /** The lowest `c_spellvisual` id showing an effect file, in any phase or as its projectile. */
  visualWithEffect(effectPath: string): number | null {
    const wanted = effectPath.toLowerCase();
    const ids = [...this.keyedRows('c_spellvisual').keys()].sort((a, b) => a - b);
    for (const id of ids) {
      const visual = this.spellVisual(id);
      if (!visual) continue;
      const effects = [
        ...Object.values(visual.phases).flatMap(phase => phase?.effects ?? []),
        ...(visual.missile ? [visual.missile] : []),
      ];
      if (effects.some(effect => effect.pathname.toLowerCase() === wanted)) return id;
    }
    return null;
  }

  spellVisual(spellVisualId: number): SpellVisualData | null {
    if (!spellVisualId) return null;
    const row = this.keyedRows('c_spellvisual').get(spellVisualId);
    if (!row) return null;

    const phases = {} as Record<SpellPhase, SpellPhaseData | null>;
    PHASE_COLUMNS.forEach((phase, i) => {
      phases[phase] = this.visualPhase(num(row[1 + i]));
    });

    return {
      id: spellVisualId,
      phases,
      missile: this.visualEffect(num(row[VISUAL_MISSILE]), null),
      weaponStreak: num(row[VISUAL_STREAK]) & 0xff,
      impactDelayMs: num(row[VISUAL_IMPACT_DELAY]),
    };
  }

  /** One `c_spellvisualstate` row, with its particle files resolved. */
  private visualPhase(phaseId: number): SpellPhaseData | null {
    if (!phaseId) return null;
    const row = this.keyedRows('c_spellvisualstate').get(phaseId);
    if (!row) return null;

    const effects = ANCHOR_COLUMNS.map((anchor, i) =>
      this.visualEffect(num(row[PHASE_FIRST_EFFECT + i]), anchor),
    ).filter((e): e is SpellVisualEffect => e !== null);

    const casterClipId = num(row[PHASE_CLIP]);
    return {
      casterClipId,
      casterClip: casterClipId ? this.animationName(casterClipId) : null,
      casterClipLoops: casterClipId ? this.animationLoops(casterClipId) : false,
      wholeBody: num(row[PHASE_CLIP_BLEND]) === CLIP_BLEND_WHOLE_BODY,
      sound: num(row[PHASE_SOUND]),
      shake: num(row[PHASE_SHAKE]),
      effects,
    };
  }

  /** One `c_spellvisualeffect` row. `anchor` is null for a projectile. */
  private visualEffect(effectId: number, anchor: EffectAnchor | null): SpellVisualEffect | null {
    if (!effectId) return null;
    const row = this.keyedRows('c_spellvisualeffect').get(effectId);
    if (!row) return null;
    const pathname = str(row[EFFECT_PATH]);
    if (!pathname) return null;
    return {
      effectId,
      name: str(row[EFFECT_NAME]),
      pathname,
      placement: placementOf(num(row[EFFECT_PLACEMENT])),
      scale: (num(row[EFFECT_SCALE]) || EFFECT_SCALE_PERCENT) / EFFECT_SCALE_PERCENT,
      flight: flightOf(num(row[EFFECT_FLIGHT])),
      count: Math.max(1, num(row[EFFECT_PROJECTILES])),
      anchor,
    };
  }

  /** Cast time from `spell_new`: an instant spell with no release row swings through its opening phase. */
  spellCastingTime(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[CAST_TIME_COLUMN]) : 0;
  }

  /** What the spell book's card shows of a spell: its cost, cast time, cooldown and reach. */
  spellStats(spellId: number): SpellStats {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return { powerCost: 0, castMs: 0, cooldownMs: 0, range: 0, mount: false };
    return {
      powerCost: num(row[POWER_COST_COLUMN]),
      castMs: num(row[CAST_TIME_COLUMN]),
      cooldownMs: num(row[COOLDOWN_COLUMN]),
      range: num(row[MAX_RANGE_COLUMN]),
      mount: num(row[MOUNT_KIND_COLUMN]) > 0,
    };
  }

  /** An item's class and subclass for combat clips; an unknown entry is class 0, no suffix. */
  itemWeaponClass(entry: number): { itemClass: number; subClass: number } {
    const row = this.keyedRows('items').get(entry);
    if (!row) return { itemClass: 0, subClass: 0 };
    return { itemClass: num(row[ITEM_CLASS]), subClass: num(row[ITEM_SUBCLASS]) };
  }

  /**
   * The creature display a spell's aura turns its wearer into, from the spell's
   * effect slots: the effect labelled "Avatar" names a `creaturedisplayinfo` row
   * in its argument column. 0 when the spell changes no one's shape.
   */
  spellAvatarDisplay(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return 0;
    const effects = this.keyedRows('spell_effect');
    for (const slot of SPELL_EFFECT_SLOTS) {
      const effect = effects.get(num(row[slot]));
      if (!effect) continue;
      const label = effect[SPELL_EFFECT_LABEL];
      if (typeof label === 'string' && label.startsWith('Avatar'))
        return num(effect[SPELL_EFFECT_ARGUMENT]);
    }
    return 0;
  }

  /** Every item's entry and the `String_Item_<lang>` id naming it; those with no name are left out. */
  itemNames(): Array<{ entry: number; nameId: number }> {
    const found: Array<{ entry: number; nameId: number }> = [];
    for (const [entry, row] of this.keyedRows('items')) {
      const nameId = num(row[ITEM_NAME_STRING]);
      if (nameId > 0) found.push({ entry, nameId });
    }
    return found;
  }

  /** The `String_Item_<lang>` id naming an item, not the item's own id. */
  itemNameId(entry: number): number | null {
    const row = this.keyedRows('items').get(entry);
    if (!row) return null;
    const nameId = num(row[ITEM_NAME_STRING]);
    return nameId > 0 ? nameId : null;
  }

  /** What an item is, from its own row; a market row carries only the entry. Null if absent. */
  itemFacts(entry: number): ItemFacts | null {
    const row = this.keyedRows('items').get(entry);
    if (!row) return null;
    return {
      itemClass: num(row[ITEM_CLASS_COL]),
      subClass: num(row[ITEM_SUBCLASS_COL]),
      quality: num(row[ITEM_QUALITY]),
      requiredLevel: num(row[ITEM_LEVEL_NEEDED_COLUMN]),
      descriptionId: num(row[ITEM_DESCRIPTION_STRING]),
      inventoryType: num(row[ITEM_WORN_ON_COLUMN]),
      armour: num(row[ITEM_ARMOUR]),
      binding: num(row[ITEM_BINDING]),
      allowedClasses: num(row[ITEM_WEARER_CLASSES_COLUMN]),
      stats: itemStats(row),
      damage: itemDamage(row),
      delay: num(row[ITEM_DELAY]),
      block: num(row[ITEM_BLOCK]),
      spells: itemSpells(row),
      spellSlots: itemSpellSlots(row),
      startsQuest: num(row[ITEM_STARTS_QUEST]),
    };
  }

  /** The string id describing a spell; 0 where none. */
  spellDescriptionId(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[SPELL_DESCRIPTION_STRING]) : 0;
  }

  /** The spell visual id the spell's own row names. */
  spellVisualId(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[SPELL_VISUAL_COLUMN]) : 0;
  }

  /** The string id naming a spell, from `spell_new`'s name column, not the spell id. */
  spellNameId(spellId: number): number | null {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return null;
    const nameId = num(row[SPELL_NAME_STRING]);
    return nameId > 0 ? nameId : null;
  }

  /** A spell's rank in its chain; 0 when the row gives none. */
  spellRank(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[SPELL_RANK]) : 0;
  }

  /** Item icon file name: by entry first, by display id for the shared-look minority. */
  itemIcon(entry: number): string | null {
    const row = this.keyedRows('itemdisplayinfo').get(entry);
    const icon = row ? str(row[ITEM_DISPLAY_ICON]) : null;
    if (icon && icon !== '0') return icon;
    return this.itemIconByDisplayId(entry);
  }

  /**
   * For an item whose entry is not an `itemdisplayinfo` key. Only a
   * fallback: used first, it matches almost nothing and undresses everyone.
   */
  private itemIconByDisplayId(entry: number): string | null {
    const item = this.keyedRows('items').get(entry);
    if (!item) return null;
    const displayId = num(item[ITEM_LOOK_COLUMN]);
    if (!displayId || displayId === entry) return null;
    const row = this.keyedRows('itemdisplayinfo').get(displayId);
    if (!row) return null;
    const icon = str(row[ITEM_DISPLAY_ICON]);
    return icon && icon !== '0' ? icon : null;
  }

  /** Spell icon bare filename (caller resolves against ui/icons/spell/). */
  spellIcon(spellId: number): string | null {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return null;
    const icon = str(row[SPELL_ICON]);
    return icon && icon !== '0' ? icon : null;
  }

  /** Excludes mounts, passives (the never-cast flag) and business skills. */
  spellCastable(spellId: number): boolean {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return false;
    if (num(row[MOUNT_KIND_COLUMN]) > 0) return false;
    if (num(row[SPELL_FLAGS_COLUMN]) & SPELL_NEVER_CAST_FLAG) return false;
    const skillGroup = num(row[SPELL_SKILL_GROUP]);
    if (skillGroup === 0 || (skillGroup >= 23 && skillGroup <= 26)) return false;
    return true;
  }
}

/** The fog and light fields a zone may leave at zero to take from above. */
const FOG_FIELDS = ['fogColor', 'fogNear', 'fogFar', 'sunColor', 'shadeColor'] as const;

/** How far up a parent chain the fill looks before giving up. Own choice. */
const MOST_ZONE_LEVELS = 16;

/**
 * Fill each zero fog or light field from the nearest zone above that sets it, and a
 * missing sky whole, so the renderer sees final values. Filled from table
 * values only, so a looping parent chain cannot feed on itself.
 */
export function fillMissingAtmosphere(zones: ZoneRow[]): void {
  const given = new Map(zones.map(z => [z.id, { ...z }]));
  for (const zone of zones) {
    for (const field of FOG_FIELDS) {
      if (zone[field] !== 0) continue;
      let above = given.get(zone.parentId);
      for (let level = 0; above && level < MOST_ZONE_LEVELS; level++) {
        if (above.id === zone.id) break;
        if (above[field] !== 0) {
          zone[field] = above[field];
          break;
        }
        above = given.get(above.parentId);
      }
    }
  }

  // Most zones name no sky and sit in one that does (Silence in Arcadian
  // Forest); dome, hill, sun and halo are taken whole.
  for (const zone of zones) {
    if (zone.skybox) continue;
    let above = given.get(zone.parentId);
    for (let level = 0; above && level < MOST_ZONE_LEVELS; level++) {
      if (above.id === zone.id) break;
      if (above.skybox) {
        zone.skybox = above.skybox;
        zone.skyHill = above.skyHill;
        zone.skySun = above.skySun;
        zone.skyHalo = above.skyHalo;
        break;
      }
      above = given.get(above.parentId);
    }
  }
}
