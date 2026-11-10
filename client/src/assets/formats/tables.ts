/** The parts of the world tables.bin describes. The tables carry no column
 * names, only a format string, so every column below is an index, and each
 * one read is checked against the format letter it should have. */

import { logger } from '../../core/log';
import { type ColumnLayout, type ColumnSpec, LayoutError, resolveLayout } from './columnLayout';
import { FTable, type Row } from './ftable';
import { TABLE_LAYOUTS, type TableColumns } from './tableLayouts';
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

/*
 * `c_sound` flag bits, by which rows set them. Bit 1 is set on exactly the
 * `m_` music rows. Bit 2 is set on the sounds that happen somewhere
 * (creatures, spells, weapons, objects) and on no interface, music or
 * ambience row. Bit 4 is set on music, ambience, the running objects (a
 * fountain, a volcano) and the files named `…_loop`. Bit 8 is set mostly on
 * creature, weapon and footstep sounds, the ones heard over and over; taking
 * it as "vary each play" is **own choice**.
 */
const SOUND_FLAG_MUSIC = 1;
const SOUND_FLAG_POSITIONAL = 2;
const SOUND_FLAG_LOOP = 4;
const SOUND_FLAG_PITCHED = 8;

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

/** The blend value for a clip that takes the whole body. */
const CLIP_BLEND_WHOLE_BODY = 2;

/** The effect's scale column is a percentage, like `creaturedisplayinfo`'s. */
const EFFECT_SCALE_PERCENT = 100;

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
  'spell_skillset',
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

/** Nine (kind, amount) pairs after their count. */
const ITEM_STAT_PAIRS = 9;
const ITEM_DAMAGE_COUNT = 2;
const ITEM_SPELLS_COUNT = 2;
const ITEM_SPELL_STRIDE = 6;
/** Where in a spell slot its trigger sits: the column after the spell's id. */
const ITEM_SLOT_WHEN = 1;

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

/** How a zone with no friendliness column is taken: 2 friendly, 1 neutral, 0 hostile. */
const ZONE_NEUTRAL = 1;

/** A sky field as a path, or ''; the column holds '0', bare directories and backslashes too. */
function skyPath(value: unknown, extensions: RegExp): string {
  const path = trim(value).replace(/\\/g, '/');
  return extensions.test(path) ? path : '';
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
/** Nine stat pairs are reserved; an amount of zero is an empty slot, not a +0. */
function itemStats(row: readonly unknown[], first: number): Array<{ kind: number; value: number }> {
  const out: Array<{ kind: number; value: number }> = [];
  for (let i = 0; i < ITEM_STAT_PAIRS; i += 1) {
    const kind = num(row[first + i * 2]);
    const value = num(row[first + i * 2 + 1]);
    if (kind > 0 && value > 0) out.push({ kind, value });
  }
  return out;
}

/** The spells an item carries. A slot holding no spell is not one. */
function itemSpells(row: readonly unknown[], first: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < ITEM_SPELLS_COUNT; i += 1) {
    const id = num(row[first + i * ITEM_SPELL_STRIDE]);
    if (id > 0) out.push(id);
  }
  return out;
}

/** Each spell slot holding a spell, with the trigger that says when it fires. */
function itemSpellSlots(
  row: readonly unknown[],
  first: number,
): Array<{ id: number; trigger: number }> {
  const out: Array<{ id: number; trigger: number }> = [];
  for (let i = 0; i < ITEM_SPELLS_COUNT; i += 1) {
    const at = first + i * ITEM_SPELL_STRIDE;
    const id = num(row[at]);
    if (id > 0) out.push({ id, trigger: num(row[at + ITEM_SLOT_WHEN]) });
  }
  return out;
}

/** What a weapon hits for. An entry that tops out at nothing is not one. */
function itemDamage(
  row: readonly unknown[],
  first: number,
): Array<{ min: number; max: number; kind: number }> {
  const out: Array<{ min: number; max: number; kind: number }> = [];
  for (let i = 0; i < ITEM_DAMAGE_COUNT; i += 1) {
    const at = first + i * 3;
    const max = num(row[at + 1]);
    if (max > 0) out.push({ min: num(row[at]), max, kind: num(row[at + 2]) });
  }
  return out;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** Table strings are fixed-width and null-padded; the padding is not the name. */
const trim = (v: unknown): string => str(v).replace(/\0+$/, '');

/** An aura (1) of detail 50 seats its caster on a mount. */
const AURA_EFFECT = 1;
const MOUNT_DETAIL = 50;
/** An instant effect (0) of detail 8 calls the creature its argument names; pet spells are what carry one. */
const INSTANT_EFFECT = 0;
const SUMMON_DETAIL = 8;

/** Every table the client reads, decoded once per source (6 MB, cheap to hold). */
export class WorldTables {
  private readonly tables = new Map<string, FTable>();
  private readonly rows = new Map<string, Row[]>();
  private readonly keyed = new Map<string, Map<number, Row>>();
  private readonly strings = new Map<string, Map<number, string>>();

  /** Where each table's named columns sit in this build's formats. */
  columns!: TableColumns;

  /** One scale per placement in the oldest builds, one per axis since. Callers must use the scalar. */
  get spawnScaleAxes(): number {
    return this.columns.staticSpawns.scaleY >= 0 ? 3 : 1;
  }

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
    log.info(
      `tables loaded: ${w.rows.get('zones')!.length} zones, ` +
        `${w.rows.get('staticobject_spawns')!.length} static spawns`,
    );
    log.debug(`build fingerprint:\n${w.fingerprint().join('\n')}`);
    return w;
  }

  /** Find every table's named columns in the formats this build ships. */
  private schema(): void {
    const found: Record<string, unknown> = {};
    for (const [key, layout] of Object.entries(TABLE_LAYOUTS)) {
      // A table the build does not ship has no rows to read a column of.
      const format = this.tables.get(layout.table)?.format ?? layout.reference;
      try {
        const resolved = resolveLayout(layout as ColumnLayout<Record<string, ColumnSpec>>, format);
        for (const note of resolved.notes) {
          if (resolved.known) log.info(note);
          else log.warn(note);
        }
        found[key] = resolved.columns;
      } catch (error) {
        if (error instanceof LayoutError) throw new SchemaError(error.message);
        throw error;
      }
    }
    this.columns = found as TableColumns;
  }

  table(name: string): FTable {
    const t = this.tables.get(name);
    if (!t) throw new SchemaError(`table not loaded: ${name}`);
    return t;
  }

  /**
   * Every loaded table's shape (`name: rows cols format`), in load order,
   * for the boot log: the lines to compare when a build reads wrongly.
   */
  fingerprint(): string[] {
    const out: string[] = [];
    for (const [name, table] of this.tables) {
      out.push(
        `${name}: ${table.rows} rows, ${table.cols} cols, format ${JSON.stringify(table.format)}`,
      );
    }
    return out;
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
    const columns = (places: readonly number[]): number[] => places.map(at => num(row?.[at]));
    return {
      id,
      text: row ? (strings.get(num(row[this.columns.chatMenu.text])) ?? '') : '',
      scripts: columns(this.columns.chatMenu.scripts),
      subMenus: columns(this.columns.chatMenu.subMenus),
    };
  }

  /** Rideable mounts from `mountprototype`; the summon aura names the row. */
  mounts(): MountRow[] {
    const out: MountRow[] = [];
    for (const r of this.rowsOf('mountprototype')) {
      const model = trim(r[this.columns.mounts.model]);
      const texture = trim(r[this.columns.mounts.texture]);
      if (!model) continue;
      out.push({
        id: num(r[this.columns.mounts.id]),
        // Some rows carry the artist's export path; the pack has only the tail.
        model: model.replace(/^(?:\.\.\/)+mid_data\//, ''),
        texture,
        effect: trim(r[this.columns.mounts.effect]),
      });
    }
    return out;
  }

  /** What each step of bag or bank space gives, costs and needs first. */
  storageUpgrades(): StorageUpgradeRow[] {
    const c = this.columns.storageUpgrades;
    return this.rowsOf('storage_upgrade').map(row => ({
      storage: num(row[c.storage]),
      slots: num(row[c.slots]),
      currency: num(row[c.currency]),
      price: num(row[c.price]),
      item: num(row[c.item]),
      requires: num(row[c.requires]),
    }));
  }

  /** Each talent's grid place, tree, requirements, ranks, picture and words, and each class's trees. */
  talents(): TalentData {
    const c = this.columns.talents;
    const places = this.rowsOf('spell_talent').map(row => ({
      id: num(row[c.id]),
      tier: num(row[c.tier]),
      column: num(row[c.column]),
      classId: num(row[c.tree]),
      requires: num(row[c.requires]),
      after: num(row[c.after]),
      ranks: num(row[c.ranks]),
      spells: c.spells.map(at => num(row[at])).filter(spell => spell > 0),
      icon: trim(row[c.icon]),
      says: num(row[c.says]),
    }));
    const classes = this.columns.classes;
    const trees = this.rowsOf('character_class').map(row => ({
      classId: num(row[classes.id]),
      trees: classes.trees.map(at => num(row[at])).filter(tree => tree > 0),
    }));
    return { places, trees };
  }

  /**
   * Races and classes. A race row has its two bodies (by sex) and its name
   * id in `String_Character_<lang>`; a class row has no name, only trees.
   */
  playableKinds(raceNames: Map<number, string>): PlayableKinds {
    const races = this.rowsOf('character_race').map(row => ({
      race: num(row[this.columns.races.id]),
      maleDisplayInfoId: num(row[this.columns.races.maleDisplay]),
      femaleDisplayInfoId: num(row[this.columns.races.femaleDisplay]),
      nameTextId: num(row[this.columns.races.nameString]),
      name: raceNames.get(num(row[this.columns.races.nameString])) ?? null,
    }));
    const classes = this.rowsOf('character_class').map(row => ({
      playerClass: num(row[this.columns.classes.id]),
    }));
    return { races, classes };
  }

  teleportStops(): TeleportStop[] {
    const c = this.columns.teleports;
    return this.rowsOf('teleport_spot').map(row => ({
      id: num(row[c.id]),
      name: trim(row[c.name]),
      mapId: num(row[c.map]),
      position: [num(row[c.x]), num(row[c.y]), num(row[c.z])],
      orientation: num(row[c.orientation]),
      type: num(row[c.type]),
    }));
  }

  /**
   * The bus network as edges (from, to, price). The server treats it as
   * undirected and fares as the cheapest chain; no chain, no travel.
   */
  busRoutes(): BusLeg[] {
    const c = this.columns.busRoutes;
    return this.rowsOf('t_bus_route')
      .map(row => ({
        from: num(row[c.from]),
        to: num(row[c.to]),
        price: num(row[c.price]),
      }))
      .filter(edge => edge.from > 0 && edge.to > 0);
  }

  maps(): MapInfo[] {
    const statics = this.rowsOf('staticobject_spawns');
    const creatures = this.rowsOf('creature_spawns');
    const staticCounts = new Map<number, number>();
    for (const r of statics) {
      const m = num(r[this.columns.staticSpawns.map]);
      staticCounts.set(m, (staticCounts.get(m) ?? 0) + 1);
    }
    const creatureCounts = new Map<number, number>();
    for (const r of creatures) {
      const m = num(r[this.columns.creatureSpawns.map]);
      creatureCounts.set(m, (creatureCounts.get(m) ?? 0) + 1);
    }

    const out: MapInfo[] = [];
    for (const [key, row] of this.keyedRows('map_info')) {
      out.push({
        id: key,
        name: str(row[this.columns.mapInfo.name]),
        world: str(row[this.columns.mapInfo.world]),
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
      const m = num(r[this.columns.staticSpawns.map]);
      staticCounts.set(m, (staticCounts.get(m) ?? 0) + 1);
    }

    const out: ZoneRow[] = [];
    for (const [key, row] of this.keyedRows('zones')) {
      const mapId = num(row[this.columns.zones.map]);
      if (!maps.has(mapId)) continue;
      const c = this.columns.zones;
      const x1 = num(row[c.x1]);
      const z1 = num(row[c.z1]);
      const x2 = num(row[c.x2]);
      const z2 = num(row[c.z2]);
      const models = /\.bdae$/i;
      const images = /\.(tga|png|pvr)$/i;
      out.push({
        id: key,
        name: names.get(key) || `zone ${key}`,
        parent: names.get(num(row[this.columns.zones.parent])) ?? null,
        parentId: num(row[this.columns.zones.parent]),
        priority: num(row[this.columns.zones.priority]),
        icon: trim(row[c.icon]),
        friendly: c.friendly < 0 ? ZONE_NEUTRAL : num(row[c.friendly]),
        mapId,
        mapName: maps.get(mapId) ?? '',
        centre: [(x1 + x2) / 2, (z1 + z2) / 2],
        bounds: [x1, z1, x2, z2],
        hasScenery: (staticCounts.get(mapId) ?? 0) > 0,
        fogColor: num(row[this.columns.zones.fogColor]),
        fogNear: num(row[this.columns.zones.fogNear]),
        fogFar: num(row[this.columns.zones.fogFar]),
        sunColor: num(row[c.sunColor]),
        shadeColor: num(row[c.shadeColor]),
        skybox: skyPath(row[c.skyDome], models),
        skyHill: skyPath(row[c.skyHill], models),
        skySun: skyPath(row[c.skySun], images),
        skyHalo: skyPath(row[c.skyHalo], images),
        music: num(row[c.music]),
        ambience: num(row[c.ambience]),
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
    const display = this.keyedRows('staticobject_displayinfo').get(
      num(proto[this.columns.staticProto.display]),
    );
    return {
      path: display ? str(display[this.columns.staticDisplay.path]) || null : null,
      scale: num(proto[this.columns.staticProto.scale]) || 1,
      type: num(proto[this.columns.staticProto.type]),
    };
  }

  /** Six (node, `.beff`) pairs on the object's model; a pair missing either side attaches nothing. */
  staticEffects(entry: number): Array<{ node: string; effect: string }> {
    const { effectNodes, effectFiles } = this.columns.staticDisplay;
    const proto = this.keyedRows('staticobject_proto').get(entry);
    if (!proto) return [];
    const display = this.keyedRows('staticobject_displayinfo').get(
      num(proto[this.columns.staticProto.display]),
    );
    if (!display) return [];

    const out: Array<{ node: string; effect: string }> = [];
    for (let i = 0; i < effectNodes.length; i++) {
      const node = trim(display[effectNodes[i]!]);
      const effect = trim(display[effectFiles[i]!]);
      if (node && effect) out.push({ node, effect });
    }
    return out;
  }

  /** Which festival an object belongs to, 0 for always-present scenery. */
  staticFestival(entry: number): number {
    const proto = this.keyedRows('staticobject_proto').get(entry);
    if (!proto) return 0;
    return num(proto[this.columns.staticProto.festival]);
  }

  /** A creature's service flags, as the server also sends them; 0 for none. */
  npcServiceBits(entry: number): number {
    return (
      num(this.keyedRows('creature_proto').get(entry)?.[this.columns.creatureProto.flags]) >>> 0
    );
  }

  /** The `chat_menu` row a creature opens its conversation with, or 0 where it has none. */
  greetingMenuOf(entry: number): number {
    return num(
      this.keyedRows('creature_proto').get(entry)?.[this.columns.creatureProto.greetingMenu],
    );
  }

  /** Every sound, the banks capping them and zones' fight music; empty without the tables. */
  soundCatalogue(): SoundCatalogue {
    const cues: SoundCue[] = [];
    if (this.tables.has('c_sound')) {
      for (const [id, row] of this.keyedRows('c_sound')) {
        const path = trim(row[this.columns.sounds.path]).split('\\').join('/');
        if (!path) continue;
        const flags = num(row[this.columns.sounds.flags]);
        cues.push({
          id,
          path,
          variants: Math.max(1, num(row[this.columns.sounds.variants])),
          music: (flags & SOUND_FLAG_MUSIC) !== 0,
          positional: (flags & SOUND_FLAG_POSITIONAL) !== 0,
          loop: (flags & SOUND_FLAG_LOOP) !== 0,
          pitched: (flags & SOUND_FLAG_PITCHED) !== 0,
          volume: num(row[this.columns.sounds.volume]) || 1,
          reach: num(row[this.columns.sounds.reach]),
          bank: num(row[this.columns.sounds.bank]),
        });
      }
    }
    const banks: SoundBankRow[] = [];
    if (this.tables.has('c_sound_bank')) {
      for (const [id, row] of this.keyedRows('c_sound_bank')) {
        const packed = num(row[this.columns.soundBanks.capacity]);
        banks.push({ id, capacity: packed & 0xffff });
      }
    }
    const battleMusic: Array<[number, number]> = [];
    if (this.tables.has('ZoneSpecialMusic')) {
      for (const row of this.rowsOf('ZoneSpecialMusic')) {
        const cue = num(row[this.columns.battleMusic.cue]);
        if (cue) battleMusic.push([num(row[this.columns.battleMusic.zone]), cue]);
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
    const displayId = appearance
      ? num(appearance[this.columns.creatureAppearance.display])
      : displayInfoId;
    const own = this.displaySounds(displayId);
    if (own?.hurt) return own;

    const bodies = this.rowsOf('character_race').map(row => ({
      race: num(row[0]),
      male: num(row[this.columns.races.maleDisplay]),
      female: num(row[this.columns.races.femaleDisplay]),
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
    const model = this.keyedRows('creaturemodeldata').get(
      num(display[this.columns.creatureDisplay.model]),
    );
    if (!model) return null;
    const setId = num(model[this.columns.creatureModel.sounds]);
    const set = this.keyedRows('sound_solution').get(setId);
    if (!set) return null;
    const out: UnitSounds = {};
    let any = false;
    UNIT_SOUND_STATES.forEach((state, i) => {
      const cue = num(set[this.columns.soundSets.states[i]!]);
      if (cue) {
        out[state] = cue;
        any = true;
      }
    });
    return any ? out : null;
  }

  creatureNameStringId(entry: number): number {
    return num(
      this.keyedRows('creature_appearance').get(entry)?.[this.columns.creatureAppearance.name],
    );
  }

  /** Model, scale and skin for a creature entry; `creature_proto`'s scale multiplies the display row's. */
  creatureModel(entry: number): CreatureModel {
    const appearance = this.keyedRows('creature_appearance').get(entry);
    if (!appearance) return noCreatureModel();

    const resolved = this.displayModel(num(appearance[this.columns.creatureAppearance.display]));
    if (!resolved) return noCreatureModel();

    const proto = this.keyedRows('creature_proto').get(entry);
    if (proto && num(proto[this.columns.creatureProto.scale]))
      resolved.scale *= num(proto[this.columns.creatureProto.scale]);
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
    const model = this.keyedRows('creaturemodeldata').get(
      num(display[this.columns.creatureDisplay.model]),
    );
    return {
      path: model ? str(model[this.columns.creatureModel.path]) || null : null,
      scale:
        (num(display[this.columns.creatureDisplay.scale]) || DISPLAY_SCALE_PERCENT) /
        DISPLAY_SCALE_PERCENT,
      skin: str(display[this.columns.creatureDisplay.skin]) || null,
    };
  }

  animationName(animationId: number): string | null {
    const row = this.keyedRows('c_animationdata').get(animationId);
    return row &&
      typeof row[this.columns.animations.name] === 'string' &&
      row[this.columns.animations.name]
      ? (row[this.columns.animations.name] as string)
      : null;
  }

  /** A clip name as `c_animationdata` spells it, matched ignoring case. */
  animationNamed(name: string): string | null {
    const wanted = name.toLowerCase();
    for (const row of this.keyedRows('c_animationdata').values()) {
      const own = row[this.columns.animations.name];
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
    return row ? num(row[this.columns.animations.loop]) !== 0 : false;
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
    PHASE_COLUMNS.forEach(phase => {
      phases[phase] = this.visualPhase(num(row[this.columns.spellVisuals[phase]]));
    });

    return {
      id: spellVisualId,
      phases,
      missile: this.visualEffect(num(row[this.columns.spellVisuals.missile]), null),
      weaponStreak: num(row[this.columns.spellVisuals.streak]) & 0xff,
      impactDelayMs: num(row[this.columns.spellVisuals.impactDelay]),
    };
  }

  /** One `c_spellvisualstate` row, with its particle files resolved. */
  private visualPhase(phaseId: number): SpellPhaseData | null {
    if (!phaseId) return null;
    const row = this.keyedRows('c_spellvisualstate').get(phaseId);
    if (!row) return null;

    const effects = ANCHOR_COLUMNS.map((anchor, i) =>
      this.visualEffect(num(row[this.columns.spellVisualStates.effects[i]!]), anchor),
    ).filter((e): e is SpellVisualEffect => e !== null);

    const casterClipId = num(row[this.columns.spellVisualStates.clip]);
    return {
      casterClipId,
      casterClip: casterClipId ? this.animationName(casterClipId) : null,
      casterClipLoops: casterClipId ? this.animationLoops(casterClipId) : false,
      wholeBody: num(row[this.columns.spellVisualStates.clipBlend]) === CLIP_BLEND_WHOLE_BODY,
      sound: num(row[this.columns.spellVisualStates.sound]),
      shake: num(row[this.columns.spellVisualStates.shake]),
      effects,
    };
  }

  /** One `c_spellvisualeffect` row. `anchor` is null for a projectile. */
  private visualEffect(effectId: number, anchor: EffectAnchor | null): SpellVisualEffect | null {
    if (!effectId) return null;
    const row = this.keyedRows('c_spellvisualeffect').get(effectId);
    if (!row) return null;
    const pathname = str(row[this.columns.spellVisualEffects.path]);
    if (!pathname) return null;
    return {
      effectId,
      name: str(row[this.columns.spellVisualEffects.name]),
      pathname,
      placement: placementOf(num(row[this.columns.spellVisualEffects.placement])),
      scale:
        (num(row[this.columns.spellVisualEffects.scale]) || EFFECT_SCALE_PERCENT) /
        EFFECT_SCALE_PERCENT,
      flight: flightOf(num(row[this.columns.spellVisualEffects.flight])),
      count: Math.max(1, num(row[this.columns.spellVisualEffects.projectiles])),
      anchor,
    };
  }

  /** Cast time from `spell_new`: an instant spell with no release row swings through its opening phase. */
  spellCastingTime(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[this.columns.spells.castMs]) : 0;
  }

  /** What the spell book's card shows of a spell: its cost, cast time, cooldown and reach. */
  spellStats(spellId: number): SpellStats {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) {
      return {
        powerCost: 0,
        castMs: 0,
        cooldownMs: 0,
        range: 0,
        mount: false,
        pet: false,
        skillSet: 0,
        skillSetIcon: null,
      };
    }
    const skillSet = num(row[this.columns.spells.skillSet]);
    const icon = str(
      this.keyedRows('spell_skillset').get(skillSet)?.[this.columns.skillSets.icon] ?? '',
    );
    return {
      powerCost: num(row[this.columns.spells.powerCost]),
      castMs: num(row[this.columns.spells.castMs]),
      cooldownMs: num(row[this.columns.spells.cooldownMs]),
      range: num(row[this.columns.spells.range]),
      mount: num(row[this.columns.spells.mountKind]) > 0,
      pet: this.callsPet(row),
      skillSet,
      skillSetIcon: icon && icon !== '0' ? icon : null,
    };
  }

  /** An item's class and subclass for combat clips; an unknown entry is class 0, no suffix. */
  itemWeaponClass(entry: number): { itemClass: number; subClass: number } {
    const row = this.keyedRows('items').get(entry);
    if (!row) return { itemClass: 0, subClass: 0 };
    return {
      itemClass: num(row[this.columns.items.itemClass]),
      subClass: num(row[this.columns.items.subClass]),
    };
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
    for (const slot of this.columns.spells.effects) {
      const effect = effects.get(num(row[slot]));
      if (!effect) continue;
      const label = effect[this.columns.spellEffects.label];
      if (typeof label === 'string' && label.startsWith('Avatar'))
        return num(effect[this.columns.spellEffects.argument]);
    }
    return 0;
  }

  /** The `mountList` row a spell seats its caster on, from its effect slots; 0 when it summons no mount. */
  spellMountId(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return 0;
    const effects = this.keyedRows('spell_effect');
    for (const slot of this.columns.spells.effects) {
      const effect = effects.get(num(row[slot]));
      if (
        effect &&
        num(effect[this.columns.spellEffects.kind]) === AURA_EFFECT &&
        num(effect[this.columns.spellEffects.detail]) === MOUNT_DETAIL
      )
        return num(effect[this.columns.spellEffects.argument]);
    }
    return 0;
  }

  /** Every item's entry and the `String_Item_<lang>` id naming it; those with no name are left out. */
  itemNames(): Array<{ entry: number; nameId: number }> {
    const found: Array<{ entry: number; nameId: number }> = [];
    for (const [entry, row] of this.keyedRows('items')) {
      const nameId = num(row[this.columns.items.nameString]);
      if (nameId > 0) found.push({ entry, nameId });
    }
    return found;
  }

  /** The `String_Item_<lang>` id naming an item, not the item's own id. */
  itemNameId(entry: number): number | null {
    const row = this.keyedRows('items').get(entry);
    if (!row) return null;
    const nameId = num(row[this.columns.items.nameString]);
    return nameId > 0 ? nameId : null;
  }

  /** What an item is, from its own row; a market row carries only the entry. Null if absent. */
  itemFacts(entry: number): ItemFacts | null {
    const row = this.keyedRows('items').get(entry);
    if (!row) return null;
    return {
      itemClass: num(row[this.columns.items.itemClass]),
      subClass: num(row[this.columns.items.subClass]),
      quality: num(row[this.columns.items.quality]),
      requiredLevel: num(row[this.columns.items.levelNeeded]),
      descriptionId: num(row[this.columns.items.descriptionString]),
      inventoryType: num(row[this.columns.items.wornOn]),
      armour: num(row[this.columns.items.armour]),
      binding: num(row[this.columns.items.binding]),
      allowedClasses: num(row[this.columns.items.wearerClasses]),
      stats: this.columns.items.statsFirst < 0 ? [] : itemStats(row, this.columns.items.statsFirst),
      damage:
        this.columns.items.damageFirst < 0 ? [] : itemDamage(row, this.columns.items.damageFirst),
      delay: num(row[this.columns.items.delay]),
      block: num(row[this.columns.items.block]),
      spells:
        this.columns.items.spellsFirst < 0 ? [] : itemSpells(row, this.columns.items.spellsFirst),
      spellSlots:
        this.columns.items.spellsFirst < 0
          ? []
          : itemSpellSlots(row, this.columns.items.spellsFirst),
      startsQuest: num(row[this.columns.items.startsQuest]),
    };
  }

  /** The string id describing a spell; 0 where none. */
  spellDescriptionId(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[this.columns.spells.descriptionString]) : 0;
  }

  /** The spell visual id the spell's own row names. */
  spellVisualId(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[this.columns.spells.visual]) : 0;
  }

  /** The string id naming a spell, from `spell_new`'s name column, not the spell id. */
  spellNameId(spellId: number): number | null {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return null;
    const nameId = num(row[this.columns.spells.nameString]);
    return nameId > 0 ? nameId : null;
  }

  /** A spell's rank in its chain; 0 when the row gives none. */
  spellRank(spellId: number): number {
    const row = this.keyedRows('spell_new').get(spellId);
    return row ? num(row[this.columns.spells.rank]) : 0;
  }

  /** Item icon file name: by entry first, by display id for the shared-look minority. */
  itemIcon(entry: number): string | null {
    const row = this.keyedRows('itemdisplayinfo').get(entry);
    const icon = row ? str(row[this.columns.itemDisplay.icon]) : null;
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
    const displayId = num(item[this.columns.items.look]);
    if (!displayId || displayId === entry) return null;
    const row = this.keyedRows('itemdisplayinfo').get(displayId);
    if (!row) return null;
    const icon = str(row[this.columns.itemDisplay.icon]);
    return icon && icon !== '0' ? icon : null;
  }

  /** Spell icon bare filename (caller resolves against ui/icons/spell/). */
  spellIcon(spellId: number): string | null {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return null;
    const icon = str(row[this.columns.spells.icon]);
    return icon && icon !== '0' ? icon : null;
  }

  /** Excludes mounts, passives (the never-cast flag) and business skills. */
  spellCastable(spellId: number): boolean {
    const row = this.keyedRows('spell_new').get(spellId);
    if (!row) return false;
    if (num(row[this.columns.spells.mountKind]) > 0) return false;
    if (num(row[this.columns.spells.flags]) & SPELL_NEVER_CAST_FLAG) return false;
    const skillGroup = num(row[this.columns.spells.skillSet]);
    if (skillGroup === 0 && this.callsPet(row)) return true;
    if (skillGroup === 0 || (skillGroup >= 23 && skillGroup <= 26)) return false;
    return true;
  }

  private callsPet(row: Row): boolean {
    return this.columns.spells.effects.some(slot => {
      const effect = this.keyedRows('spell_effect').get(num(row[slot]));
      return (
        effect !== undefined &&
        num(effect[this.columns.spellEffects.kind]) === INSTANT_EFFECT &&
        num(effect[this.columns.spellEffects.detail]) === SUMMON_DETAIL
      );
    });
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
