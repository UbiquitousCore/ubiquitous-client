/**
 * Assembling one 64-unit tile out of the packs: ground, objects (`.itm`
 * tile-local positions plus indexed spawn tables), and collision — drawn and
 * solid built in the same pass so they cannot disagree.
 */

import { logger } from '../../core/log';
import type {
  Appearance,
  CollisionGeom,
  CollisionItem,
  Placement,
  TerrainTileData,
  TileData,
} from '../types';
import { TILE_SIZE, type WorldTables } from '../formats/tables';
import { TRN_SIDE, parseItm, parseTrn, tileName } from '../formats/terrain';
import type { ItmTile, TrnTile } from '../formats/terrain';
import { lookFromRow, visibleMeshes } from '../formats/avatar';
import { npcServiceIcon, objectServiceIcon } from '../serviceIcons';
import type { Library } from '../vfs/Library';
import type { PackReader } from '../vfs/zip';
import { interiorOf } from './interiorCompanion';
import { isDrawableModel, isEffect } from './surface';
import { PHY_PACKS, collisionGeoms } from './localModel';
import { itmRotation, mapPackName, offsetBy, placementScale, spawnRotation } from './localZone';

const log = logger('local-tile');

/** Column indices this module reads directly out of the spawn tables. */
const SO_SPAWN_ENTRY = 1;
const SO_SPAWN_MAP = 2;
const SO_SPAWN_XYZ = [3, 4, 5] as const;
const SO_SPAWN_ROT_Y = 7;
const SO_SPAWN_SCALE = 11;
const CR_SPAWN_ENTRY = 1;
const CR_SPAWN_MAP = 2;
const CR_SPAWN_XYZ = [3, 4, 5] as const;
const CR_SPAWN_O = 6;
const CR_DISPLAY_EXTRA = 7;
const CR_APPEARANCE_DISPLAY = 5;

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);

/** `'17,12'` — how a tile addresses itself in every map keyed by one. */
export function tileKey(tx: number, tz: number): string {
  return `${tx},${tz}`;
}

/**
 * Placements the server owns: each stands for a spot where ore can appear, and
 * what is drawn there is whatever the server announces for it, so the local
 * table places nothing.
 */
export const SERVER_PLACED_STATIC_ENTRIES: ReadonlySet<number> = new Set([52]);

/** One (node, effect) pair from `staticobject_displayinfo`. */
interface AttachedEffect {
  node: string;
  effect: string;
}

interface StaticSpawn {
  model: string;
  pos: [number, number, number];
  yaw: number;
  scale: number;
  entry: number;
  interactionIcon: string | null;
  effects: AttachedEffect[];
}

interface PlacedCreature {
  model: string;
  pos: [number, number, number];
  yaw: number;
  scale: number;
  entry: number;
  skin: string | null;
}

/** A map's spawn rows sorted into tiles once (100k rows in 2.2.0), not scanned per tile. */
export class MapSpawns {
  private readonly statics = new Map<string, StaticSpawn[]>();
  private readonly creatures = new Map<string, PlacedCreature[]>();

  private constructor(readonly mapId: number) {}

  static build(tables: WorldTables, mapId: number): MapSpawns {
    const index = new MapSpawns(mapId);

    for (const r of tables.rowsOf('staticobject_spawns')) {
      if (num(r[SO_SPAWN_MAP]) !== mapId) continue;
      const entry = num(r[SO_SPAWN_ENTRY]);
      if (SERVER_PLACED_STATIC_ENTRIES.has(entry)) continue;
      const { path, scale: protoScale, type } = tables.staticModel(entry);
      if (!path) continue;
      const pos: [number, number, number] = [
        num(r[SO_SPAWN_XYZ[0]]),
        num(r[SO_SPAWN_XYZ[1]]),
        num(r[SO_SPAWN_XYZ[2]]),
      ];
      // One uniform scale float at 1.0.2, scaleX/Y/Z from 1.1.4 on. The
      // scalar is the one drawn with — using the per-axis values instead
      // visibly stretches decorations.
      const spawnScale = num(r[SO_SPAWN_SCALE]);
      push(index.statics, pos, {
        model: path,
        pos,
        yaw: num(r[SO_SPAWN_ROT_Y]),
        scale: spawnScale || protoScale || 1,
        entry,
        interactionIcon: objectServiceIcon(type, true) ?? null,
        effects: tables.staticEffects(entry),
      });
    }

    for (const r of tables.rowsOf('creature_spawns')) {
      if (num(r[CR_SPAWN_MAP]) !== mapId) continue;
      const entry = num(r[CR_SPAWN_ENTRY]);
      const { path, scale, skin } = tables.creatureModel(entry);
      if (!path) continue;
      const pos: [number, number, number] = [
        num(r[CR_SPAWN_XYZ[0]]),
        num(r[CR_SPAWN_XYZ[1]]),
        num(r[CR_SPAWN_XYZ[2]]),
      ];
      push(index.creatures, pos, {
        model: path,
        pos,
        yaw: num(r[CR_SPAWN_O]),
        scale: scale || 1,
        entry,
        skin,
      });
    }

    log.debug(
      `map ${mapId}: ${index.statics.size} tiles with statics, ` +
        `${index.creatures.size} with creatures`,
    );
    return index;
  }

  staticsAt(tx: number, tz: number): readonly StaticSpawn[] {
    return this.statics.get(tileKey(tx, tz)) ?? [];
  }

  creaturesAt(tx: number, tz: number): readonly PlacedCreature[] {
    return this.creatures.get(tileKey(tx, tz)) ?? [];
  }
}

function push<T>(into: Map<string, T[]>, pos: readonly number[], value: T): void {
  const key = tileKey(Math.floor(pos[0] / TILE_SIZE), Math.floor(pos[2] / TILE_SIZE));
  const list = into.get(key);
  if (list) list.push(value);
  else into.set(key, [value]);
}

/** Model questions the tile builder asks without decoding geometry, as cacheable callbacks. */
export interface ModelQueries {
  /** Mesh names, for deciding which parts of a character to show. */
  meshNames(path: string): Promise<string[]>;
  /** Node name -> its position in model space, for hanging effects off. */
  attachOffsets(path: string): Promise<Map<string, [number, number, number]>>;
  /** Static `.bdae` models an effect draws (a fountain's basin blocks; its spray cannot). */
  effectModels?(path: string): Promise<string[]>;
  /** Model-space bounds of a model's static geometry; null where it has none or will not decode. */
  modelBounds?(path: string): Promise<ModelBounds | null>;
}

/** Model-space bounds of a model's static geometry. */
export interface ModelBounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** Where one solid object stands; `entry` is 0 for the map's own scenery. */
interface SolidPlacement {
  pos: [number, number, number];
  rot: [number, number, number, number];
  scale: [number, number, number];
  entry: number;
}

/** Everything needed to add one tile to the world. */
export async function buildTile(
  lib: Library,
  tables: WorldTables,
  mapId: number,
  tx: number,
  tz: number,
  spawns: MapSpawns,
  models: ModelQueries,
  /**
   * The world to take the tiles from, where the map tables do not list
   * it. A build ships worlds its own map table has no row for — the
   * ground the screens before the world stand on is one, present as a
   * pack and named by nothing — and those can only be asked for by name.
   */
  world?: string,
): Promise<TileData> {
  // The map's own pack holds the ground and the `.itm` scenery. Without it
  // there is no terrain here — but the spawn tables still place their
  // objects, so this is not a reason to return nothing.
  const named = world ? `${world}.bin` : null;
  const mapPack = named && lib.hasPack(named) ? named : mapPackName(tables, lib, mapId);
  if (!mapPack) {
    log.once(
      'warn',
      `no-pack:${mapId}`,
      `map ${mapId} has no tile pack — no terrain or map scenery`,
    );
  }
  const pack = mapPack ? await lib.pack(mapPack) : null;
  const stem = mapPack ? mapPack.replace(/\.bin$/i, '') : '';

  const placements: Placement[] = [];
  /** phy path -> every placement of it on this tile. */
  const byPhy = new Map<string, SolidPlacement[]>();

  const wantPhy = (model: string): string | null =>
    model && model.toLowerCase().endsWith('.bdae') ? `${model.slice(0, -5)}.phy` : null;

  const solid = (
    model: string,
    pos: [number, number, number],
    rot: [number, number, number, number],
    scale: [number, number, number],
    entry = 0,
  ): void => {
    const phyPath = wantPhy(model);
    if (!phyPath) return;
    const list = byPhy.get(phyPath);
    if (list) list.push({ pos, rot, scale, entry });
    else byPhy.set(phyPath, [{ pos, rot, scale, entry }]);
  };

  // An effect's static models stand where it does: the basin blocks while
  // the spray never can, and the `.beff` path itself names no `.phy`.
  const solidEffect = async (
    effect: string,
    pos: [number, number, number],
    rot: [number, number, number, number],
    scale: [number, number, number],
    entry = 0,
  ): Promise<void> => {
    let subs: string[];
    try {
      subs = (await models.effectModels?.(effect)) ?? [];
    } catch {
      return;
    }
    for (const sub of subs) solid(sub, pos, rot, scale, entry);
  };

  // — the map's own scenery ------------------------------------------
  // `.itm` is already per-tile: one file, positions relative to the header's
  // own base. The whole file belongs to this tile — an object leaning over the edge stays with the tile that
  // declared it rather than being clipped or duplicated.
  const itmEntry = pack ? pack.get(tileName(stem, 'items', tx, tz, 'itm')) : null;
  let doc: ItmTile | null = null;
  if (pack && itmEntry) {
    try {
      doc = parseItm(await pack.read(itmEntry));
    } catch {
      log.once(
        'warn',
        `itm:${stem}:${tx},${tz}`,
        `${stem} tile ${tx},${tz}: unreadable .itm — no scenery there`,
      );
    }
  }
  if (doc) {
    // The header's own base is what positions are relative to; the filename
    // may differ.
    const ox = doc.tile[0] * TILE_SIZE;
    const oz = doc.tile[1] * TILE_SIZE;
    const res = lib.hasPack('res.bin') ? await lib.pack('res.bin') : null;
    for (const it of doc.items) {
      // Effects ride in the same records as models, and are kept: a zone's
      // streetlights and fountains are effects placed this way.
      const effect = isEffect(it.model);
      if (!effect && !isDrawableModel(it.model)) continue;
      const position: [number, number, number] = [ox + it.pos[0], it.pos[1], oz + it.pos[2]];
      const rotation = itmRotation(it.rot);
      const scale = placementScale(it.scale);
      placements.push({
        model: it.model,
        position,
        rotation,
        scale,
        entry: 0,
        kind: effect ? 'effect' : 'scenery',
      });
      if (effect) {
        await solidEffect(it.model, position, rotation, scale);
        continue;
      }
      solid(it.model, position, rotation, scale);
      // A building that ships an interior is placed with it, at the same
      // spot. Interiors live in res.bin rather than the map pack.
      const insidePath = res ? interiorOf(it.model) : null;
      if (res && insidePath && res.has(insidePath)) {
        placements.push({
          model: insidePath,
          position,
          rotation,
          scale,
          entry: 0,
          kind: 'scenery',
        });
        solid(insidePath, position, rotation, scale);
      }
    }
  }

  // — spawn-table statics --------------------------------------------
  for (const s of spawns.staticsAt(tx, tz)) {
    const rotation = spawnRotation(s.yaw);
    const scale: [number, number, number] = [s.scale, s.scale, s.scale];
    placements.push({
      model: s.model,
      position: s.pos,
      rotation,
      scale,
      entry: s.entry,
      kind: 'static',
      interactionIcon: s.interactionIcon ?? undefined,
    });
    if (isEffect(s.model)) await solidEffect(s.model, s.pos, rotation, scale, s.entry);
    else solid(s.model, s.pos, rotation, scale, s.entry);

    // Object effects attach at position + node model-space offset (else
    // flames burn at the post foot, not the top).
    if (!s.effects.length) continue;
    const offsets = await models.attachOffsets(s.model);
    for (const { node, effect } of s.effects) {
      if (!isEffect(effect)) {
        log.once(
          'warn',
          `so-effect-ext:${effect}`,
          `staticobject_displayinfo names ${JSON.stringify(effect)}, which is ` +
            'not a .beff -- skipped',
        );
        continue;
      }
      const local = offsets.get(node);
      if (!local) {
        log.once(
          'warn',
          `so-effect-node:${s.model}:${node}`,
          `${s.model} has no node ${JSON.stringify(node)} for ${effect} -- ` +
            'the effect sits at the object origin',
        );
      }
      placements.push({
        model: effect,
        position: offsetBy(s.pos, local, rotation, s.scale),
        rotation,
        // A standalone effect takes the object's position and turn but not
        // its scale, so a scaled object does not scale its flame.
        scale: [1, 1, 1],
        entry: s.entry,
        kind: 'effect',
        owner: s.pos,
      });
    }
  }

  // — creatures ------------------------------------------------------
  for (const c of spawns.creaturesAt(tx, tz)) {
    const placement: Placement = {
      model: c.model,
      position: c.pos,
      rotation: spawnRotation(c.yaw),
      scale: [c.scale, c.scale, c.scale],
      entry: c.entry,
      kind: 'creature',
      interactionIcon: npcServiceIcon(tables.npcServiceBits(c.entry)),
    };
    // Humanoids composite a body atlas from their equipment; creatures naming
    // a skin are a colour variant that replaces the model's own images.
    let appearance: Appearance | undefined;
    try {
      appearance = appearanceFor(tables, c.entry, await models.meshNames(c.model));
    } catch {
      appearance = undefined;
    }
    if (!appearance && c.skin) {
      appearance = { skin: c.skin, meshes: [], skinReplacesAll: true, key: `skin:${c.skin}` };
    }
    placements.push(appearance ? { ...placement, appearance } : placement);
  }

  return {
    mapId,
    tile: [tx, tz],
    terrain: pack ? await terrainTile(pack, stem, tx, tz) : null,
    placements,
    collision: await collisionOf(lib, byPhy, models),
  };
}

/** Heightmap for one tile, ready to build a ground mesh from. */
async function terrainTile(
  pack: PackReader,
  stem: string,
  tx: number,
  tz: number,
): Promise<TerrainTileData | null> {
  const entry = pack.get(tileName(stem, 'terrain', tx, tz, 'trn'));
  if (!entry) return null;
  let doc: TrnTile;
  try {
    doc = parseTrn(await pack.read(entry));
  } catch {
    log.once(
      'warn',
      `trn:${stem}:${tx},${tz}`,
      `${stem} tile ${tx},${tz}: unreadable .trn — no ground there`,
    );
    return null;
  }
  if (doc.flat || !doc.heights) return null;

  return {
    tile: [tx, tz],
    origin: [tx * TILE_SIZE, tz * TILE_SIZE],
    side: TRN_SIDE,
    tileSize: TILE_SIZE,
    heights: doc.heights,
    colours: doc.colours,
    visible: doc.chunks.map(c => !c.isHole),
    water: waterLevels(doc),
    // No baked per-tile image: the renderer gets the chunk textures and the
    // packed mask instead.
    baseTexture: null,
    // Named by the pack the tile came out of rather than by map id:
    // the mask lives beside that pack, and a world the map tables have
    // no row for cannot be looked up by id at all.
    maskTexture: `mask:${stem}:${tx},${tz}`,
    chunkTextures: doc.chunks.map(c =>
      c.textures.map(i => (i >= 0 && i < doc.textures.length ? doc.textures[i] : null)),
    ),
  };
}

/** Per-chunk water level, or null where it lies below the ground (the shipped placeholder). */
function waterLevels(doc: TrnTile): Array<number | null> {
  const heights = doc.heights;
  if (!heights) return doc.chunks.map(() => null);
  const per = (TRN_SIDE - 1) / 8;
  return doc.chunks.map(c => {
    if (!c.hasWater) return null;
    const [cx, cz] = c.chunk;
    let lowest = Infinity;
    for (let r = 0; r <= per; r++) {
      for (let q = 0; q <= per; q++) {
        const v = heights[(cz * per + r) * TRN_SIDE + cx * per + q];
        if (v < lowest) lowest = v;
      }
    }
    return c.waterLevel > lowest ? c.waterLevel : null;
  });
}

/**
 * A stand-in solid for a model that ships no `.phy`: its bounds as a
 * cylinder, a box when long and thin. Small decor (grass, flowers) stays
 * walk-through rather than blocking every step.
 */
export function fallbackGeom(bounds: ModelBounds): CollisionGeom | null {
  const rx = (bounds.max[0] - bounds.min[0]) / 2;
  const rz = (bounds.max[2] - bounds.min[2]) / 2;
  const h = bounds.max[1] - bounds.min[1];
  // Own choice: neck-high and an arm's reach across reads as a structure.
  if (!Number.isFinite(rx + rz + h) || Math.min(rx, rz) < 0.75 || h < 0.8) return null;
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  const round = Math.max(rx, rz) <= Math.min(rx, rz) * 2;
  return {
    type: 'primitive',
    flags: 0,
    shape: round ? 'cylinder' : 'box',
    position: [cx, cy, cz],
    halfSize: [rx, h / 2, rz],
    rotY: 0,
  };
}

/** The bounds stand-in for one `.phy` path, or null where there is nothing to stand in. */
async function fallbackFor(models: ModelQueries, phyPath: string): Promise<CollisionGeom | null> {
  if (!models.modelBounds) return null;
  let bounds: ModelBounds | null;
  try {
    bounds = await models.modelBounds(phyPath.replace(/\.phy$/i, '.bdae'));
  } catch {
    return null;
  }
  return bounds ? fallbackGeom(bounds) : null;
}

/** Collision for everything solid on the tile, looked up ignoring case (`maincity_Inn.phy`). */
async function collisionOf(
  lib: Library,
  byPhy: Map<string, SolidPlacement[]>,
  models: ModelQueries,
): Promise<CollisionItem[]> {
  const items: CollisionItem[] = [];
  if (byPhy.size === 0) return items;
  // Every pack that might hold collision for this build, in order: 1.1.4
  // keeps its `.phy` files in `tables.bin`, not `model_phy.bin`. See
  // `PHY_PACKS`.
  const packs: PackReader[] = [];
  for (const name of PHY_PACKS) {
    if (!lib.hasPack(name)) continue;
    try {
      packs.push(await lib.pack(name));
    } catch {
      // A pack that will not open contributes nothing; the others still can.
    }
  }

  // One parse per path: a tile placing one model a hundred times read it a
  // hundred times. A path with no `.phy` stands its bounds in instead,
  // where they are big enough to be a structure.
  const geoms = new Map<string, CollisionGeom[]>();
  let resolved = 0;
  let stoodIn = 0;
  const wanted = [...byPhy.keys()];
  for (const phyPath of wanted) {
    let bytes: Uint8Array | null = null;
    for (const pack of packs) {
      const entry = pack.get(phyPath);
      if (!entry) continue;
      try {
        bytes = await pack.read(entry);
      } catch {
        bytes = null;
      }
      if (bytes) break;
    }
    if (bytes) {
      geoms.set(phyPath, collisionGeoms(bytes));
      resolved++;
      continue;
    }
    const stood = await fallbackFor(models, phyPath);
    if (stood) {
      geoms.set(phyPath, [stood]);
      stoodIn++;
    }
  }

  for (const [phyPath, placed] of byPhy) {
    const g = geoms.get(phyPath);
    if (!g) continue;
    for (const p of placed) {
      items.push(
        p.entry
          ? { path: phyPath, pos: p.pos, rot: p.rot, scale: p.scale, geoms: g, entry: p.entry }
          : { path: phyPath, pos: p.pos, rot: p.rot, scale: p.scale, geoms: g },
      );
    }
  }

  // A tile that asked for collision and got none back is the silent failure
  // worth naming: no pack resolving nothing looks identical from the
  // outside — you walk through the world and nothing says why.
  if (resolved === 0 && stoodIn === 0) {
    if (packs.length === 0) {
      log.once(
        'warn',
        'no-phy',
        `no collision pack — the world will have no collision. Looked for ${PHY_PACKS.join(', ')}`,
      );
    } else {
      log.once(
        'warn',
        'phy-none-resolved',
        `collision packs are mounted but none of ${byPhy.size} path(s) are in them ` +
          `— the world will have no collision. First asked for: ${wanted[0]}`,
      );
    }
  }
  return items;
}

/** Which meshes to show and which skin to use for a creature, or undefined. */
function appearanceFor(
  tables: WorldTables,
  entry: number,
  meshNames: string[],
): Appearance | undefined {
  const appearance = tables.keyedRows('creature_appearance').get(entry);
  if (!appearance) return undefined;
  const display = tables
    .keyedRows('creaturedisplayinfo')
    .get(num(appearance[CR_APPEARANCE_DISPLAY]));
  if (!display) return undefined;
  const extra = tables.keyedRows('creaturedisplayinfoextra').get(num(display[CR_DISPLAY_EXTRA]));
  if (!extra) return undefined;

  const look = lookFromRow(extra);
  const items = (id: number) => tables.keyedRows('itemdisplayinfo').get(id);
  const { visible, meshTextures } = visibleMeshes(meshNames, look, items);
  return {
    // Resolved by the provider into a composited atlas.
    skin: `avatar:creature:${entry}`,
    meshes: visible,
    meshTextures,
    skinReplacesAll: false,
    // Hair is one texture per colour, not a tint, so the colour has to travel
    // as far as the material. `lookFromRow` has already read it out of
    // `creaturedisplayinfoextra`; without it every NPC would wear colour 1,
    // which is indigo on human hair.
    hairColor: look.hairColor,
    key: `creature:${entry}`,
  };
}
