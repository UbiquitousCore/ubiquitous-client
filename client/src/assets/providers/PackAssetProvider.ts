/** Every resource decoded from the user's own game file. */

import { logger } from '../../core/log';
import { ProviderNotReadyError, ResourceError, ResourceNotFoundError } from '../../core/errors';
import type { AssetProvider, AssetSource } from '../AssetProvider';
import type { IdOf, ResourceId, ResourceKind, UiMovie } from '../ids';
import type {
  Appearance,
  EffectData,
  EquipmentAttachment,
  ModelData,
  NetworkAppearance,
  ResourceTypes,
  SkeletonData,
  SoundClipData,
  TextureData,
  TileData,
  UiSkinArt,
  UiSkinData,
  UiFaces,
  ZoneIndex,
  ZoneInfo,
} from '../types';
import { FTable } from '../formats/ftable';
import { TILE_SIZE, WorldTables, type SpellVisualData, type ZoneRow } from '../formats/tables';
import {
  cropLoadingArt,
  decodeTexture,
  decodeTextureBitmap,
  STRAIGHT_ALPHA,
  encodeBitmap,
} from '../formats/texture';
import type { DecodedImage } from '../formats/image';
import {
  attachmentsFor,
  bodyLayers,
  compositeSkin,
  shippedHairColours,
  LOOK_ROW_FIRST_ITEM,
  LOOK_ROW_ITEMS,
  lookFrom,
  heldItemsOf,
  lookFromRow,
  modelStem,
  TEXTURE_DIR,
  visibleMeshes,
  type Look,
  type WornSlot,
} from '../formats/avatar';
import { type Footprints, bareScalpStyles, footprints, sheetMeshes } from '../formats/avatarSheet';
import { Library } from '../vfs/Library';

import { forgetIpa, reopenIpa } from '../vfs/ipaHandle';
import { listCachedBuilds, type ProgressFn } from '../vfs/PackStore';
import {
  UNLISTED_WORLD_ID,
  buildZone,
  mapPackName,
  unlistedWorlds,
  worldStem,
  zoneInfoOf,
} from './localZone';
import { MapSpawns, buildTile, type ModelBounds } from './localTile';
import { buildEffect } from './localEffect';
import { readBeff } from '../formats/beff';
import { decodeWav } from '../formats/wav';
import { parseSwf, swfPathToSvg, type SwfMovie } from '../formats/swf';
import { readTypefaceFamily } from '../formats/typeface';
import { facesByUse, pickUiFaces } from './uiFaces';
import { readUiStrings } from '../formats/uiStrings';
import { layerName } from '../formats/terrain';
import { readBdae, toAnimationData, toModelData, toSkeletonData } from './localModel';
import { interiorOf, withoutSharedFaces } from './interiorCompanion';
import { retainBuffers } from '../transferables';
import type { Bdae } from '../formats/bdae';

const log = logger('pack-provider');

/** The pack every sound file lives in. */
const SOUND_PACK = 'sound.bin';

/** Every interface movie, the set whose text fields decide the typefaces. */
const UI_MOVIES: readonly UiMovie[] = ['LGM', 'IGM', 'store'];

/**
 * A resource kind this provider cannot serve, unlike `ResourceNotFoundError`
 * (missing data). Never thrown today; the worker proxy rebuilds it by name.
 */
export class ResourceUnsupportedError extends ResourceError {
  constructor(kind: string) {
    super(kind, `PackAssetProvider cannot serve '${kind}' yet — no reader yet`);
    this.name = 'ResourceUnsupportedError';
  }
}

export interface PackAssetProviderOptions {
  /** Long-edge cap in pixels; 1024 by default. */
  maxTextureSize?: number;
  language?: string;
  onProgress?: ProgressFn;
}

const MASK_PREFIX = 'mask:';
const AVATAR_PREFIX = 'avatar:';

/** Class badges in `ui/icons/career/`; which is which was observed in play by the owner. */
const CLASS_ICON_FILES: Readonly<Record<number, string>> = {
  1: 'ui_warrior_online.png',
  2: 'ui_mage_online.png',
  3: 'ui_hunter_online.png',
  4: 'ui_priest_online.png',
};

/** A generic body beats an invisible one. */
const FALLBACK_PLAYER_MODEL_PATH = 'model/npc/character/human/male/human_m_h.bdae';

/**
 * The server's sixteen worn inventory positions; rings, trinkets and neck
 * show nothing, and a two-hander comes in the main hand.
 */
const INVENTORY_POSITION: Readonly<Partial<Record<WornSlot, number>>> = {
  head: 0,
  shoulders: 2,
  hands: 3,
  chest: 4,
  shirt: 5,
  back: 6,
  legs: 7,
  feet: 8,
  mainHand: 13,
  offHand: 14,
  ranged: 15,
};

const INVENTORY_LENGTH = 15;

/** How many item columns the appearance table carries. */
const LOOK_ROW_ITEM_COUNT = Object.keys(LOOK_ROW_ITEMS).length;

/**
 * The server's inventory or the appearance table's item columns, told apart
 * by length. Shorter is read as an inventory and warned about: a flat id
 * list would put its first item on the head.
 */
export function appearanceEquipment(values: readonly number[]): Partial<Record<WornSlot, number>> {
  const out: Partial<Record<WornSlot, number>> = {};
  const byInventory = (): void => {
    for (const [slot, at] of Object.entries(INVENTORY_POSITION) as Array<[WornSlot, number]>)
      out[slot] = values[at] ?? 0;
    out.twoHand = 0;
  };
  if (values.length >= INVENTORY_LENGTH) {
    byInventory();
  } else if (values.length >= LOOK_ROW_ITEM_COUNT) {
    for (const [slot, column] of Object.entries(LOOK_ROW_ITEMS) as Array<[WornSlot, number]>)
      out[slot] = values[column - LOOK_ROW_FIRST_ITEM] ?? 0;
  } else {
    // Still dressed, but flagged: this shape is a caller bug.
    log.once(
      'warn',
      'appearance-equipment:short-array',
      `equipment array has ${values.length} entries — too short to be a real ` +
        '16-slot inventory list or 12-column appearance row; slot mapping may be wrong',
    );
    byInventory();
  }
  return out;
}

/** Source ids for a build already sitting in browser storage. */
const CACHED_PREFIX = 'cached:';

/**
 * Bytes of parsed `.bdae` to keep: enough to outlive one model's fan-out
 * across ids. Invented, not profiled.
 */
const DOC_CACHE_BYTES = 32 * 1024 * 1024;

/** Counted: skeletons are small and speed every later clip on a model. Invented, not profiled. */
const SKELETON_CACHE_ENTRIES = 256;

/** Extracted together; map packs are added once the zone names its map. */
const CORE_PACKS = ['tables.bin', 'res.bin', 'res_t.bin', 'model_phy.bin'];
const EFFECT_PACKS = ['res.bin', 'res_t.bin'];

const AREA_CONFIG = '2d_texture/area.cnfg';

/** The shipped file uses CRLF. */
const LINE_BREAK = new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10));

/** Parse `area.cnfg`; a zone id of 0 is an unshipped region, kept because button order is picture order. */
export function parseAreaLinks(text: string): import('../types').AreaLinks {
  const regions: number[] = [];
  const buttons: Record<number, string> = {};
  const neighbours: Record<number, [number, number, number, number]> = {};
  const subAreas: Record<number, Array<{ topZoneId: number; zoneId: number }>> = {};
  let section = '';
  for (const raw of text.split(LINE_BREAK)) {
    const line = raw.trim();
    if (!line || line.startsWith('/')) continue;
    const header = /^Type\s*=\s*(\w+)/.exec(line);
    if (header) {
      section = header[1];
      continue;
    }
    const groups = [...line.matchAll(/\{([^}]*)\}/g)].map(match => match[1].trim());
    if (groups.length < 2) continue;
    const numbers = (value: string): number[] =>
      value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .map(part => Number.parseInt(part, 10))
        .filter(Number.isFinite);
    const first = numbers(groups[0])[0];
    if (first === undefined) continue;
    if (section === 'AreaZone') {
      regions.push(first);
      const button = groups[1].split(',')[0]?.trim();
      if (first > 0 && button) buttons[first] = button;
    } else if (section === 'ZoneRelation') {
      const dirs = numbers(groups[1]);
      if (first > 0) neighbours[first] = [dirs[0] ?? 0, dirs[1] ?? 0, dirs[2] ?? 0, dirs[3] ?? 0];
    } else if (section === 'ZoneSubArea') {
      // `{top zone} {top zone again, zone, x offset, y offset}`: one id says
      // where the gateway is drawn, the other where it leads.
      const [topZoneId, zoneId] = numbers(groups[1]);
      if (first > 0 && topZoneId && zoneId) (subAreas[first] ??= []).push({ topZoneId, zoneId });
    }
  }
  return { regions, neighbours, subAreas, mapped: [], buttons };
}

/** `%04d` counts the sign: tile -1 is `-001`, not `-0001`. */
function thumbnailPart(value: number): string {
  return value < 0 ? `-${String(-value).padStart(3, '0')}` : String(value).padStart(4, '0');
}

interface SheetLayout {
  layout: Footprints;
  bareScalps: ReadonlySet<number>;
  hairColours: readonly number[];
}

/** Where the interface's words live, and in which language. */
const UI_STRINGS_FILE = 'strings/EN.bar';

export class PackAssetProvider implements AssetProvider {
  readonly name = 'pack(local)';

  private library: Library | null = null;
  private source: AssetSource | null = null;
  private tables: WorldTables | null = null;
  private tablesTask: Promise<WorldTables> | null = null;
  private readonly pending = new Map<string, File[]>();
  private readonly meshNameCache = new Map<string, string[]>();
  private readonly sheetLayoutCache = new Map<string, SheetLayout>();
  private readonly attachOffsetCache = new Map<string, Map<string, [number, number, number]>>();
  /** Static models each effect draws, and bounds stand-ins for models with no `.phy`; both cached, both never throwing. */
  private readonly effectModelCache = new Map<string, string[]>();
  private readonly modelBoundsCache = new Map<string, ModelBounds | null>();
  private readonly attachPointCache = new Map<string, Map<string, number[]>>();
  /** Spawn rows by tile, per map, built once: otherwise 100k rows scanned per tile. */
  private readonly spawnIndex = new Map<number, MapSpawns>();
  private readonly layerCache = new Map<string, DecodedImage | null>();
  /**
   * Parsed `.bdae` documents, newest-used last. One model is asked for
   * through several ids, each otherwise a ranged read, two inflates and a parse.
   */
  private readonly docs = new Map<string, { work: Promise<Bdae>; bytes: number }>();
  private docBytes = 0;
  /** So a clip does not re-derive the bind pose; `loadAnimation` calls below `ResourceSystem`'s cache. */
  private readonly skeletons = new Map<string, Promise<SkeletonData>>();
  /**
   * Buffers the caches hold, which must never be transferred: a detached
   * array reads as empty (`assets/transferables.ts`).
   */
  private readonly retained = new WeakSet<ArrayBuffer>();
  private readonly opts: Required<Omit<PackAssetProviderOptions, 'onProgress'>>;
  private readonly onProgress?: ProgressFn;

  constructor(opts: PackAssetProviderOptions = {}) {
    this.opts = {
      maxTextureSize: opts.maxTextureSize ?? 1024,
      language: opts.language ?? 'en',
    };
    this.onProgress = opts.onProgress;
  }

  async init(): Promise<void> {
    log.info('ready — waiting for a game file');
  }

  /** Files offered this session; a browser cannot enumerate the filesystem. */
  async listSources(): Promise<AssetSource[]> {
    const offered = [...this.pending.entries()].map(([id, files]) => describe(id, files));
    const cached = (await listCachedBuilds())
      // A partial build (out of room after `tables.bin`) fails on the first
      // model, which would read as a decoder bug.
      .filter(build => {
        const names = new Set(build.packs.map(p => p.name.toLowerCase()));
        return names.has('res.bin') && names.has('tables.bin');
      })
      .map(build => {
        const names = new Set(build.packs.map(p => p.name.toLowerCase()));
        // Offered, but flagged: without `model_phy.bin` there are no walls.
        const missing = names.has('model_phy.bin') ? '' : ' — NO COLLISION, re-extract';
        return {
          id: CACHED_PREFIX + build.key,
          label: `${build.key} (already extracted, ${build.packs.length} packs${missing})`,
          version: /-(\d+\.\d+\.\d+)-/.exec(build.key)?.[1],
          sizeBytes: build.totalBytes,
        };
      });
    return [...cached, ...offered];
  }

  async cachedBuilds(): Promise<AssetSource[]> {
    return (await this.listSources()).filter(s => s.id.startsWith(CACHED_PREFIX));
  }

  /** Hand over picked files; returns the id to mount. Not on `AssetProvider`: only the boot UI picks files. */
  offer(input: File | File[]): AssetSource {
    const files = Array.isArray(input) ? input : [input];
    if (files.length === 0) throw new ResourceError('mount', 'no file offered');
    const id = files.map(f => `${f.name}:${f.size}`).join('|');
    this.pending.set(id, files);
    return describe(id, files);
  }

  private loose: File[] = [];

  currentSource(): AssetSource | null {
    return this.source;
  }

  async useSource(id: string): Promise<AssetSource> {
    this.library?.dispose();
    this.tables = null;
    this.tablesTask = null;
    this.meshNameCache.clear();
    this.effectModelCache.clear();
    this.modelBoundsCache.clear();
    this.sheetLayoutCache.clear();
    this.layerCache.clear();
    this.spawnIndex.clear();
    this.docs.clear();
    this.skeletons.clear();
    this.docBytes = 0;

    if (id.startsWith(CACHED_PREFIX)) {
      this.library = await Library.mountCached(id.slice(CACHED_PREFIX.length));
      if (this.library.isComplete) {
        log.info('build is complete — the game file is not needed');
      } else {
        // An interrupted extraction: try to finish silently; the handle
        // usually returns as 'prompt', which needs the caller's gesture.
        const remembered = await reopenIpa(false);
        if (remembered) {
          await this.library.attachIpa(remembered, this.onProgress);
          await this.extractAll();
        } else {
          log.warn('extraction was never finished, and the game file is not available');
        }
      }
    } else {
      const files = this.pending.get(id);
      if (!files) throw new ResourceError('mount', `no offered file with id ${id}`);
      const packs = files.filter(f => /\.bin$/i.test(f.name));
      // The interface typefaces sit beside the packs as loose files.
      this.loose = files.filter(f => !/\.bin$/i.test(f.name) && !/\.ipa$/i.test(f.name));
      // By what was offered, not how many: extracted packs may have loose files beside them.
      const bundle = files.find(file => /\.ipa$/i.test(file.name));
      this.library = bundle
        ? await Library.mount(bundle, this.onProgress)
        : packs.length
          ? await Library.mountPacks(packs)
          : await Library.mount(files[0], this.onProgress);
    }

    // A newly chosen file is extracted whole, once: a browser cannot silently
    // re-grant last session's handle, so lazy extraction would ask again.
    if (!id.startsWith(CACHED_PREFIX) && !this.library.isComplete) {
      await this.extractAll();
    }

    const info = this.library.info();
    this.source = {
      id,
      label: info.label,
      version: info.version,
      sizeBytes: info.sizeBytes,
    };
    log.info(`mounted ${info.label}${info.version ? ` (${info.version})` : ''}`);
    return this.source;
  }

  async load<K extends ResourceKind>(id: IdOf<K>): Promise<ResourceTypes[K]> {
    if (!this.library) throw new ProviderNotReadyError('no game data mounted');

    // The generic K does not narrow through the switch; `ResourceTypes` checks the mapping.
    const target = id as ResourceId;
    switch (target.kind) {
      case 'zoneIndex':
        return (await this.loadZoneIndex()) as ResourceTypes[K];
      case 'creatureName':
        return (await this.creatureName(target.id)) as ResourceTypes[K];
      case 'creatureEntryName':
        return (await this.creatureEntryName(target.entry)) as ResourceTypes[K];
      case 'spellName':
        return (await this.spellName(target.id)) as ResourceTypes[K];
      case 'spellText':
        return (await this.spellText(target.id)) as ResourceTypes[K];
      case 'questText':
        return (await this.questText(target.id)) as ResourceTypes[K];
      case 'spellIcon':
        return (await this.spellIcon(target.id)) as ResourceTypes[K];
      case 'itemIcon':
        return (await this.itemIcon(target.id)) as ResourceTypes[K];
      case 'topbarIcon':
        return (await this.topbarIcon(target.name)) as ResourceTypes[K];
      case 'classIcon':
        return (await this.classIcon(target.classId)) as ResourceTypes[K];
      case 'uiSkin':
        return (await this.loadUiSkin(target.movie)) as ResourceTypes[K];
      case 'uiStrings':
        return (await this.loadUiStrings()) as ResourceTypes[K];
      case 'itemFacts':
        return (await this.itemFacts(target.id)) as ResourceTypes[K];
      case 'uiIcon':
        return (await this.loadUiIcon(target.name, target.movie)) as ResourceTypes[K];
      case 'uiFaces':
        return (await this.loadUiFaces()) as ResourceTypes[K];
      case 'shaderText':
        return (await this.loadShaderText(target.name)) as ResourceTypes[K];
      case 'spellCastable':
        return (await this.spellCastable(target.id)) as ResourceTypes[K];
      case 'spellRank':
        return (await this.spellRank(target.id)) as ResourceTypes[K];
      case 'spellVisual':
        return (await this.spellVisual(target.spellVisualId)) as ResourceTypes[K];
      case 'spellCastingTime':
        return (await this.spellCastingTime(target.id)) as ResourceTypes[K];
      case 'spellStats':
        return (await this.worldTables()).spellStats(target.id) as ResourceTypes[K];
      case 'spellVisualOf':
        return (await this.spellVisualOf(target.id)) as ResourceTypes[K];
      case 'itemWeaponClass':
        return (await this.itemWeaponClass(target.id)) as ResourceTypes[K];
      case 'heldItem':
        return (await this.heldItem(target.id)) as ResourceTypes[K];
      case 'itemName':
        return (await this.itemName(target.id)) as ResourceTypes[K];
      case 'itemText':
        return (await this.itemText(target.id)) as ResourceTypes[K];
      case 'mountList':
        return (await this.worldTables()).mounts() as ResourceTypes[K];
      case 'playableKinds':
        return (await this.loadPlayableKinds()) as ResourceTypes[K];
      case 'lookOptions':
        return (await this.loadLookOptions(target.model)) as ResourceTypes[K];
      case 'teleportStops':
        return (await this.worldTables()).teleportStops() as ResourceTypes[K];
      case 'storageUpgrades':
        return (await this.worldTables()).storageUpgrades() as ResourceTypes[K];

      case 'talents':
        return (await this.worldTables()).talents() as ResourceTypes[K];

      case 'spellString':
        return (await this.spellString(target.id)) as ResourceTypes[K];
      case 'soundCatalogue':
        return (await this.worldTables()).soundCatalogue() as ResourceTypes[K];
      case 'unitSounds':
        return (await this.worldTables()).unitSounds(
          target.entry,
          target.displayInfoId,
          target.race,
          target.gender,
        ) as ResourceTypes[K];
      case 'soundClip':
        return (await this.loadSoundClip(target.path)) as ResourceTypes[K];
      case 'busRoutes':
        return (await this.worldTables()).busRoutes() as ResourceTypes[K];
      case 'gossipMenu':
        return (await this.loadGossipMenu(target.id)) as ResourceTypes[K];
      case 'npcGreeting':
        return (await this.loadGossipMenu(
          (await this.worldTables()).greetingMenuOf(target.entry),
        )) as ResourceTypes[K];
      case 'areaMap':
        return (await this.loadAreaMap(target.zoneId, target.routes === true)) as ResourceTypes[K];
      case 'areaLinks':
        return (await this.loadAreaLinks()) as ResourceTypes[K];
      case 'minimap':
        return (await this.loadMinimap(target.mapId, target.tx, target.tz)) as ResourceTypes[K];
      case 'texture':
        return (await this.loadTexture(target.ref)) as ResourceTypes[K];
      case 'model':
        return (await this.loadModel(target.path)) as ResourceTypes[K];
      case 'skeleton':
        return (await this.loadSkeleton(target.path)) as ResourceTypes[K];
      case 'animation':
        return (await this.loadAnimation(target.path, target.modelPath)) as ResourceTypes[K];
      case 'animationName':
        return (await this.worldTables()).animationName(target.animationId) as ResourceTypes[K];
      case 'visualWithEffect':
        return (await this.worldTables()).visualWithEffect(target.effectPath) as ResourceTypes[K];
      case 'animationNamed':
        return (await this.worldTables()).animationNamed(target.name) as ResourceTypes[K];
      case 'impactVisual':
        return (await this.worldTables()).impactVisualPlaying(target.file) as ResourceTypes[K];
      case 'zone':
        return (await this.loadZone(target.zoneId)) as ResourceTypes[K];
      case 'tile':
        return (await this.loadTile(
          target.mapId,
          target.tx,
          target.tz,
          target.world,
        )) as ResourceTypes[K];
      case 'avatar':
        return (await this.loadAvatar(target)) as ResourceTypes[K];
      case 'networkAppearance':
        return (await this.loadNetworkAppearance(target)) as ResourceTypes[K];
      case 'staticObjectModel':
        return (await this.loadStaticObjectModel(target.entry)) as ResourceTypes[K];
      case 'splash':
        return (await this.loadSplash(target.zoneId, target.maxSize)) as ResourceTypes[K];
      case 'effect':
        return (await this.loadEffect(target.path)) as ResourceTypes[K];
      case 'attachPoint':
        return (await this.loadAttachPoint(target.path, target.node)) as ResourceTypes[K];
    }
  }

  dispose(): void {
    this.library?.dispose();
    this.library = null;
    this.source = null;
    this.tables = null;
    this.tablesTask = null;
    this.pending.clear();
    this.meshNameCache.clear();
    this.effectModelCache.clear();
    this.modelBoundsCache.clear();
    this.sheetLayoutCache.clear();
    this.layerCache.clear();
    this.spawnIndex.clear();
    this.docs.clear();
    this.skeletons.clear();
    this.docBytes = 0;
  }

  canExtractMore(): boolean {
    return this.library?.hasIpa ?? false;
  }

  /** A complete build cannot extract more and does not need to; not the broken case. */
  isComplete(): boolean {
    return this.library?.isComplete ?? false;
  }

  /** Extract the whole build, logging which pack is in flight. */
  private async extractAll(): Promise<void> {
    const lib = this.lib();
    const started = performance.now();
    await lib.extractAll({
      onPack: (name, i, n) => log.info(`extracting ${name} (${i + 1}/${n})`),
    });
    log.info(`extraction finished in ${((performance.now() - started) / 1000).toFixed(0)}s`);

    // Decode loading art while the user is already waiting; never a reason to fail a mount.
    try {
      await this.buildSplashCache();
    } catch (err) {
      log.debug(`loading art not cached: ${String(err)}`);
    }

    // A whole build needs no file; keeping the handle keeps a permission nobody asked for.
    if (lib.isComplete) {
      await forgetIpa();
      log.info('the game file is no longer needed and has been forgotten');
    }
  }

  async attachSource(file: File): Promise<void> {
    if (!this.library) throw new ProviderNotReadyError('no game data mounted');
    await this.library.attachIpa(file, this.onProgress);
  }

  async clearCache(): Promise<void> {
    await this.library?.clearCache();
  }

  private lib(): Library {
    if (!this.library) throw new ProviderNotReadyError('no game data mounted');
    return this.library;
  }

  private async worldTables(): Promise<WorldTables> {
    if (this.tables) return this.tables;
    if (this.tablesTask) return this.tablesTask;
    const lib = this.lib();
    this.tablesTask = (async () => {
      const tables = await WorldTables.load(async entry => {
        const pack = await lib.pack('tables.bin');
        const found = pack.get(entry);
        return found ? pack.read(found) : null;
      });
      this.tables = tables;
      this.tablesTask = null;
      return tables;
    })();
    return this.tablesTask;
  }

  /** A world's middle, from its terrain file names, for a world with no row. */
  private async middleOfWorld(stem: string): Promise<[number, number]> {
    const pack = await this.lib()
      .pack(`${stem}.bin`)
      .catch(() => null);
    if (!pack) return [0, 0];
    const wanted = new RegExp(`^world/${stem}/terrain/(-?\\d+)_(-?\\d+)\\.trn$`, 'i');
    let minX = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (const entry of pack.entries) {
      const at = wanted.exec(entry.name);
      if (!at) continue;
      const tx = Number(at[1]);
      const tz = Number(at[2]);
      minX = Math.min(minX, tx);
      minZ = Math.min(minZ, tz);
      maxX = Math.max(maxX, tx);
      maxZ = Math.max(maxZ, tz);
    }
    if (!Number.isFinite(minX)) return [0, 0];
    return [((minX + maxX) / 2 + 0.5) * TILE_SIZE, ((minZ + maxZ) / 2 + 0.5) * TILE_SIZE];
  }

  private async zoneNames(tables: WorldTables): Promise<Map<number, string>> {
    const stringsTable = `String_Zones_${this.opts.language}`;
    const cached = tables.strings_(stringsTable);
    if (cached) return cached;
    const pack = await this.lib().pack('tables.bin');
    const entry = pack.get(`tables/${stringsTable}.tbl`);
    if (!entry) {
      log.warn(`${stringsTable}.tbl missing — zones will be numbered`);
      return new Map();
    }
    return tables.setStrings(stringsTable, new FTable(await pack.read(entry)));
  }

  /** A creature's name: its appearance row, same entry, carries the string id. */
  async creatureEntryName(entry: number): Promise<string | null> {
    const tables = await this.worldTables();
    const id = tables.creatureNameStringId(entry);
    return id ? this.creatureName(id) : null;
  }

  async creatureName(id: number): Promise<string | null> {
    const tables = await this.worldTables();
    const tableName = `String_Creature_${this.opts.language}`;
    const cached = tables.strings_(tableName);
    if (cached) return cached.get(id) ?? null;
    const pack = await this.lib().pack('tables.bin');
    const entry = pack.get(`tables/${tableName}.tbl`);
    if (!entry) return null;
    return tables.setStrings(tableName, new FTable(await pack.read(entry))).get(id) ?? null;
  }

  /** What a spell does, from `String_Spell_<lang>` via its row. */
  async spellText(id: number): Promise<string | null> {
    const tables = await this.worldTables();
    const said = tables.spellDescriptionId(id);
    if (!said) return null;
    const strings = await this.tableString(tables, `String_Spell_${this.opts.language}`);
    return strings.get(said) ?? null;
  }

  /** One spell-string line by its number; a talent place names its own line, the next is what it does. */
  async spellString(id: number): Promise<string | null> {
    if (!id) return null;
    const tables = await this.worldTables();
    const strings = await this.tableString(tables, `String_Spell_${this.opts.language}`);
    return strings.get(id) ?? null;
  }

  /**
   * A spell's name, via the spell row's `spellNameId` column, not the spell
   * id: those coincide for only about half of spells.
   */
  async spellName(id: number): Promise<string | null> {
    const tables = await this.worldTables();
    const nameId = tables.spellNameId(id);
    if (!nameId) return null;
    const strings = await this.tableString(tables, `String_Spell_${this.opts.language}`);
    return strings.get(nameId) ?? null;
  }

  /** A quest's text from `String_Quest_<lang>`, by plain string id. */
  async questText(id: number): Promise<string | null> {
    const tables = await this.worldTables();
    const tableName = `String_Quest_${this.opts.language}`;
    const cached = tables.strings_(tableName);
    if (cached) return cached.get(id) ?? null;
    const pack = await this.lib().pack('tables.bin');
    const entry = pack.get(`tables/${tableName}.tbl`);
    if (!entry) return null;
    return tables.setStrings(tableName, new FTable(await pack.read(entry))).get(id) ?? null;
  }

  async itemName(id: number): Promise<string | null> {
    const tables = await this.worldTables();
    const nameId = tables.itemNameId(id);
    if (!nameId) return null;
    const strings = await this.tableString(tables, `String_Item_${this.opts.language}`);
    return strings.get(nameId) ?? null;
  }

  async itemText(id: number): Promise<string | null> {
    if (!id) return null;
    const tables = await this.worldTables();
    const strings = await this.tableString(tables, `String_Item_${this.opts.language}`);
    return strings.get(id) ?? null;
  }

  async itemFacts(entry: number): Promise<ResourceTypes['itemFacts']> {
    if (!entry) return null;
    return (await this.worldTables()).itemFacts(entry);
  }

  /** Interface art at the best shipped rung (`_2x` preferred), capped at 512. */
  private async uiArt(
    ref: string,
    finestFirst = true,
    maxSize = 512,
    within?: string,
  ): Promise<UiSkinArt | null> {
    const dot = ref.lastIndexOf('.');
    const rung = (suffix: string): string =>
      dot < 0 ? `${ref}${suffix}` : `${ref.slice(0, dot)}${suffix}${ref.slice(dot)}`;
    // Fill matrices are authored against the base rung; finer sheets (up to
    // four times) draw at a fraction of their pixel size.
    const rungs: Array<{ path: string; scale: number }> = [
      { path: rung('_4x'), scale: 0.25 },
      { path: rung('_2x'), scale: 0.5 },
      { path: ref, scale: 1 },
    ];
    for (const candidate of finestFirst ? rungs : [...rungs].reverse()) {
      const found = await this.lib().resolveTexture(candidate.path);
      if (!found) continue;
      // Only textures really within the directory: a same-named picture
      // elsewhere drew screens as heaps of coins and swords.
      if (within && !found[1].toLowerCase().startsWith(`${within.toLowerCase()}/`)) continue;
      try {
        const { bytes } = await this.lib().readTexture(candidate.path);
        // The cap must leave the finest rung whole, or its scale is wrong.
        const image = await decodeTextureBitmap(bytes, maxSize);
        return { image, scale: candidate.scale };
      } catch {
        // Undecodable: try the next rung.
      }
    }
    return null;
  }

  /** The interface's words in the build's order; only the first group is the interface's. */
  async loadUiStrings(): Promise<readonly string[]> {
    const bytes = await this.lib().readFirst(['res.bin'], UI_STRINGS_FILE);
    if (!bytes) throw new ResourceNotFoundError('uiStrings');
    return readUiStrings(bytes)[0] ?? [];
  }

  /** One interface movie (`ui/<Movie>.swf`) in interface terms; bitmaps resolve through `uiIcon`. */
  async loadUiSkin(movie: string): Promise<UiSkinData> {
    const lib = this.lib();
    const bytes = await lib.readFirst(['res.bin'], `ui/${movie}.swf`);
    if (!bytes) throw new ResourceNotFoundError(`uiSkin:${movie}`);
    let parsed: SwfMovie;
    try {
      parsed = await parseSwf(bytes);
    } catch (err) {
      throw new ResourceError(`uiSkin:${movie}`, `could not parse interface movie: ${movie}`, err);
    }
    // A movie may name one character twice; the last name is the one the
    // shipped sheets use.
    const artOf = new Map(parsed.exports.map(e => [e.id, e.name] as const));
    const faceOf = new Map(parsed.fonts.map(f => [f.id, f.name] as const));
    const css = (r: number, g: number, b: number): string => `rgb(${r}, ${g}, ${b})`;
    return {
      movie,
      width: parsed.width,
      height: parsed.height,
      background: parsed.background,
      exports: parsed.exports.map(e => ({ id: e.id, name: e.name })),
      shapes: parsed.shapes.map(s => ({
        id: s.id,
        bounds: { ...s.bounds },
        fills: s.fills.map(f => {
          if (f.kind === 'solid')
            return { kind: 'solid' as const, css: css(f.r, f.g, f.b), opacity: f.a / 255 };
          if (f.kind === 'bitmap') {
            return {
              kind: 'bitmap' as const,
              imageId: f.imageId,
              art: artOf.get(f.imageId) ?? null,
              matrix: { ...f.matrix },
              repeating: f.repeating,
            };
          }
          return { kind: 'unsupported' as const };
        }),
        paths: s.paths.map(p => ({ fill: p.fill, d: swfPathToSvg(p) })),
      })),
      sprites: parsed.sprites.map(s => ({
        id: s.id,
        frameCount: s.frameCount,
        frames: s.frames.map(frame =>
          frame.map(p => ({
            depth: p.depth,
            characterId: p.characterId,
            matrix: { ...p.matrix },
            name: p.name,
            opacity: p.opacity,
            ...(p.clipDepth !== undefined ? { clipDepth: p.clipDepth } : {}),
          })),
        ),
      })),
      edits: parsed.edits.map(e => ({
        id: e.id,
        bounds: { ...e.bounds },
        varName: e.varName,
        sampleHtml: e.initialHtml,
        sizePx: e.fontHeight,
        color: e.color,
        face: e.fontId === null ? null : (faceOf.get(e.fontId) ?? null),
      })),
      root: parsed.root.map(frame =>
        frame.map(p => ({
          depth: p.depth,
          characterId: p.characterId,
          matrix: { ...p.matrix },
          name: p.name,
          opacity: p.opacity,
          ...(p.clipDepth !== undefined ? { clipDepth: p.clipDepth } : {}),
        })),
      ),
    };
  }

  /** One GPU program stage's text, decoded as the build stores it. */
  async loadShaderText(name: string): Promise<string> {
    const bytes = await this.lib().readFirst(['res.bin'], name);
    if (!bytes) throw new ResourceNotFoundError(`shader ${name}`);
    return new TextDecoder('utf-8').decode(bytes);
  }

  /** The interface typefaces, read from the build (never copied here) and paired by `pickUiFaces`. */
  async loadUiFaces(): Promise<UiFaces> {
    const lib = this.lib();
    const movies: SwfMovie[] = [];
    for (const movie of UI_MOVIES) {
      const bytes = await lib.readFirst(['res.bin'], `ui/${movie}.swf`);
      if (!bytes) continue;
      try {
        movies.push(await parseSwf(bytes));
      } catch (err) {
        log.debug(`could not read the typefaces ${movie} names: ${String(err)}`);
      }
    }
    // Files offered beside extracted packs first, then the bundle's own.
    const offered = await Promise.all(
      this.loose
        .filter(file => /\.(ttf|otf|ttc)$/i.test(file.name))
        .map(async file => new Uint8Array(await file.arrayBuffer())),
    );
    const bundled = (await lib.typefaces()).map(file => file.bytes);
    const shipped = [...offered, ...bundled].map(bytes => ({
      family: readTypefaceFamily(bytes),
      bytes,
    }));
    return pickUiFaces(facesByUse(movies), shipped);
  }

  /** One interface bitmap by linkage name; null rather than throw, so the dialog still opens. */
  async loadUiIcon(name: string, movie?: string): Promise<UiSkinArt | null> {
    // The sharpest rung: dialogs fill a desktop pane. The movie's own
    // directory first: sheet names repeat across movies (`zhanshi`), and
    // only what is really under it, or a same-named picture matches.
    if (movie) {
      const own = await this.uiArtWithin(`ui/${movie}`, name);
      if (own) return own;
    }
    return this.uiArtWithin('ui/icons', name);
  }

  private uiArtWithin(directory: string, name: string): Promise<UiSkinArt | null> {
    return this.uiArt(`${directory}/${name}`, true, 4096, directory);
  }

  /** Null for a missing icon: unshipped item art is real, and a blank beats a failed bag. */
  async itemIcon(entry: number): Promise<ImageBitmap | null> {
    const tables = await this.worldTables();
    const icon = tables.itemIcon(entry);
    if (!icon) return null;
    return (await this.uiArt(`ui/icons/item/${icon}`))?.image ?? null;
  }

  async spellIcon(id: number): Promise<ImageBitmap | null> {
    const tables = await this.worldTables();
    const icon = tables.spellIcon(id);
    if (!icon) return null;
    return (await this.uiArt(`ui/icons/spell/${icon}`))?.image ?? null;
  }

  /** A target-toolbar icon, a loose file in `ui/icons/`; null where absent. */
  async topbarIcon(name: string): Promise<ImageBitmap | null> {
    return (await this.uiArt(`ui/icons/topbar/ui_topbar_${name}.png`))?.image ?? null;
  }

  /** A class badge by class number, from the `career` set; null where absent. */
  async classIcon(classId: number): Promise<ImageBitmap | null> {
    const file = CLASS_ICON_FILES[classId];
    if (!file) return null;
    return (await this.uiArt(`ui/icons/career/${file}`))?.image ?? null;
  }

  async spellCastable(spellId: number): Promise<boolean> {
    const tables = await this.worldTables();
    return tables.spellCastable(spellId);
  }

  async spellRank(spellId: number): Promise<number> {
    const tables = await this.worldTables();
    return tables.spellRank(spellId);
  }

  async spellVisual(spellVisualId: number): Promise<SpellVisualData | null> {
    const tables = await this.worldTables();
    return tables.spellVisual(spellVisualId);
  }

  async spellCastingTime(spellId: number): Promise<number> {
    const tables = await this.worldTables();
    return tables.spellCastingTime(spellId);
  }

  async spellVisualOf(spellId: number): Promise<number> {
    const tables = await this.worldTables();
    return tables.spellVisualId(spellId);
  }

  /** One item as it hangs drawn in its hand, with nothing else worn. */
  private async heldItem(entry: number): Promise<EquipmentAttachment[]> {
    const tables = await this.worldTables();
    const look = lookFrom();
    look.worn.mainHand = entry;
    return attachmentsFor(
      look,
      itemId => tables.keyedRows('itemdisplayinfo').get(itemId),
      modelId => tables.keyedRows('itemmodeldata').get(modelId),
      true,
      itemId => tables.itemWeaponClass(itemId),
    );
  }

  async itemWeaponClass(entry: number): Promise<{ itemClass: number; subClass: number }> {
    const tables = await this.worldTables();
    return tables.itemWeaponClass(entry);
  }

  private async loadGossipMenu(id: number): Promise<import('../types').GossipMenu> {
    const tables = await this.worldTables();
    return tables.gossipMenu(
      id,
      await this.tableString(tables, `String_Menu_${this.opts.language}`),
    );
  }

  /** A region's map picture, or with `routes` its bus-network picture where shipped. */
  private async loadAreaMap(
    zoneId: number,
    routes: boolean,
  ): Promise<import('../types').TextureData> {
    const tables = await this.worldTables();
    const rows = tables.zones(await this.zoneNames(tables));
    const row = rows.find(candidate => candidate.id === zoneId);
    if (!row) throw new ResourceNotFoundError(`areaMap:${zoneId}`);
    const top = this.topZoneOf(rows, row);
    const suffix = routes ? '_airline' : '';
    const refs = [
      `2d_texture/maps/${top.id}_2x${suffix}.tga`,
      `2d_texture/maps/${top.id}${suffix}.tga`,
    ];
    for (const ref of refs) {
      if (await this.lib().resolveTexture(ref)) {
        const { bytes } = await this.lib().readTexture(ref);
        return { ref, image: await decodeTextureBitmap(bytes, 2048) };
      }
    }
    throw new ResourceNotFoundError(`areaMap:${zoneId}${routes ? ':routes' : ''}`);
  }

  /**
   * The world map's index, `2d_texture/area.cnfg`: buttons, neighbours and
   * sub-areas. The world map is a drawing, so nothing else says this.
   */
  private async loadAreaLinks(): Promise<import('../types').AreaLinks> {
    const bytes = await this.lib().readFirst(['res.bin', 'res_t.bin'], AREA_CONFIG);
    if (!bytes) throw new ResourceNotFoundError(AREA_CONFIG);
    const links = parseAreaLinks(new TextDecoder().decode(bytes));

    // A region with no picture is a blank grid; only the packs can say.
    const tables = await this.worldTables();
    const rows = tables.zones(await this.zoneNames(tables));
    const mapped: number[] = [];
    for (const row of rows) {
      if (row.parentId > 0) continue;
      if (await this.lib().resolveTexture(`2d_texture/maps/${row.id}.tga`)) mapped.push(row.id);
    }
    return { ...links, mapped };
  }

  /** Minimap thumbnail from the map pack itself; the plain tile, not the `_1` indoor variant. */
  private async loadMinimap(
    mapId: number,
    tx: number,
    tz: number,
  ): Promise<import('../types').TextureData> {
    const id = `minimap:${mapId}:${tx},${tz}`;
    const tables = await this.worldTables();
    const stem = worldStem(tables, mapId);
    const packName = mapPackName(tables, this.lib(), mapId);
    if (!stem || !packName) throw new ResourceNotFoundError(id);
    const ref = `world/${stem}/thumbnails/${thumbnailPart(tx)}_${thumbnailPart(tz)}.tga`;
    const bytes = await this.lib().readFirst([packName], ref);
    if (!bytes) throw new ResourceNotFoundError(id);
    return { ref, image: await decodeTextureBitmap(bytes) };
  }

  private async tableString(tables: WorldTables, name: string): Promise<Map<number, string>> {
    const cached = tables.strings_(name);
    if (cached) return cached;
    const pack = await this.lib().pack('tables.bin');
    const candidates = [
      `tables/${name}.tbl`,
      `tables/${name.replace(/_[^_]+$/, '')}.tbl`,
      `tables/${name.toLowerCase()}.tbl`,
    ];
    let entry = candidates.map(path => pack.get(path)).find(Boolean);
    if (!entry) {
      const wanted = name.replace(/_[^_]+$/, '').toLowerCase();
      entry = pack.entries.find(
        candidate => !candidate.isDir && candidate.name.toLowerCase() === `tables/${wanted}.tbl`,
      );
    }
    if (!entry) return new Map();
    return tables.setStrings(name, new FTable(await pack.read(entry)));
  }

  /** What a character can be made as; race names come from the string table read here. */
  private async loadPlayableKinds(): Promise<ResourceTypes['playableKinds']> {
    const tables = await this.worldTables();
    const names = await this.tableString(tables, `String_Character_${this.opts.language}`);
    return tables.playableKinds(names);
  }

  /**
   * What one body can look like, found rather than assumed: each skin, face
   * and hair colour is an image shipped or not, each hair style a mesh
   * carried or not. Faces are counted against the first skin; every body
   * ships the same run per skin.
   */
  private async loadLookOptions(model: string): Promise<ResourceTypes['lookOptions']> {
    const lib = this.lib();
    const [stem] = modelStem(model);
    const pad = (value: number): string => String(value).padStart(2, '0');
    // Well past any shipped body, so the run ends with the build's data.
    const CEILING = 24;
    const found = async (name: (n: number) => string): Promise<number[]> => {
      const out: number[] = [];
      for (let option = 1; option <= CEILING; option++) {
        if (await lib.resolveTexture(`${TEXTURE_DIR}${name(option)}`)) out.push(option);
      }
      return out;
    };

    const skins = await found(n => `${stem}_body_${pad(n)}.tga`);
    const first = skins[0] ?? 1;
    const faces = await found(n => `${stem}_body_${pad(first)}_face_${pad(n)}.tga`);
    const hairColours = await found(n => `${stem}_hair_a_${pad(n)}.tga`);
    const hairStyles = [
      ...new Set(
        (await this.meshNames(model))
          .map(name => /^hair_(\d+)/i.exec(name.toLowerCase().replace('-mesh', '')))
          .filter((hit): hit is RegExpExecArray => hit !== null)
          .map(hit => Number(hit[1])),
      ),
    ].sort((a, b) => a - b);
    const { bareScalps } = await this.sheetLayout(model);
    const bareHairStyles = hairStyles.filter(style => bareScalps.has(style));

    return { skins, faces, hairStyles, bareHairStyles, hairColours };
  }

  /** One decoded sound; a build extracted before sounds were kept has none. */
  private async loadSoundClip(path: string): Promise<SoundClipData> {
    const bytes = await this.lib().readFirst([SOUND_PACK], path);
    if (!bytes) throw new ResourceNotFoundError(`soundClip:${path}`, `no sound ${path}`);
    try {
      return decodeWav(bytes);
    } catch (err) {
      throw new ResourceError(`soundClip:${path}`, `${path}: ${String(err)}`);
    }
  }

  hasSound(): boolean {
    return this.library?.hasPack(SOUND_PACK) ?? false;
  }

  private async loadZoneIndex(): Promise<ZoneIndex> {
    const tables = await this.worldTables();
    const names = await this.zoneNames(tables);
    const zones: ZoneInfo[] = tables.zones(names).map(zoneInfoOf);
    // Worlds the tables never name, such as the selection map.
    return { zones: [...zones, ...unlistedWorlds(tables, this.lib())] };
  }

  private async unlistedWorld(zoneId: number): Promise<ZoneInfo | null> {
    const tables = await this.worldTables();
    return unlistedWorlds(tables, this.lib()).find(zone => zone.id === zoneId) ?? null;
  }

  private async zoneRow(zoneId: number): Promise<ZoneRow> {
    const tables = await this.worldTables();
    const names = await this.zoneNames(tables);
    const zone = tables.zones(names).find(z => z.id === zoneId);
    if (!zone) throw new ResourceNotFoundError(`zone:${zoneId}`, `no such zone: ${zoneId}`);
    return zone;
  }

  private async loadZone(zoneId: number) {
    const tables = await this.worldTables();
    if (zoneId >= UNLISTED_WORLD_ID) {
      const world = await this.unlistedWorld(zoneId);
      if (!world) throw new ResourceNotFoundError(`zone:${zoneId}`, `no such zone: ${zoneId}`);
      await this.lib().prefetch([...CORE_PACKS, `${world.world}.bin`, `${world.world}_layer.bin`]);
      // The middle of whatever tiles the pack holds.
      const middle = await this.middleOfWorld(world.world ?? world.mapName);
      return { info: { ...world, centre: middle }, spawn: middle };
    }
    const zone = await this.zoneRow(zoneId);

    // Extract this map's packs together, not one blocking request at a time.
    const mapPack = mapPackName(tables, this.lib(), zone.mapId);
    if (!mapPack && !this.lib().hasIpa) {
      throw new ResourceError(
        `zone:${zoneId}`,
        `${zone.name} is on a map whose pack has never been extracted, and the ` +
          `game file is not available to extract it. Choose your .ipa again.`,
      );
    }
    await this.lib().prefetch([
      ...CORE_PACKS,
      ...(mapPack ? [mapPack, mapPack.replace(/\.bin$/i, '_layer.bin')] : []),
    ]);

    return buildZone(zone);
  }

  /** One tile of one map; no zone involved, so walking out of a zone loads more ground. */
  private async loadTile(mapId: number, tx: number, tz: number, world?: string): Promise<TileData> {
    const tables = await this.worldTables();
    let spawns = this.spawnIndex.get(mapId);
    if (!spawns) {
      spawns = MapSpawns.build(tables, mapId);
      this.spawnIndex.set(mapId, spawns);
    }
    return buildTile(
      this.lib(),
      tables,
      mapId,
      tx,
      tz,
      spawns,
      {
        meshNames: path => this.meshNames(path),
        attachOffsets: path => this.attachOffsets(path),
        effectModels: path => this.effectModels(path),
        modelBounds: path => this.modelBounds(path),
      },
      world,
    );
  }

  /** Buffers still held, so the worker copies rather than transfers them (`assets/transferables.ts`). */
  retainedBuffers(): { has(buffer: ArrayBuffer): boolean } {
    return this.retained;
  }

  /** Kept for its test: reuse is invisible from outside. */
  cacheStats(): { documents: number; documentBytes: number; skeletons: number } {
    return {
      documents: this.docs.size,
      documentBytes: this.docBytes,
      skeletons: this.skeletons.size,
    };
  }

  /**
   * A parsed `.bdae`, reused across ids, keyed on the lowercased path. The
   * promise is cached: `model` and `skeleton` arrive together under different ids.
   */
  private document(path: string): Promise<Bdae> {
    const key = path.toLowerCase();
    const hit = this.docs.get(key);
    if (hit) {
      // Newest-used last; eviction takes the coldest.
      this.docs.delete(key);
      this.docs.set(key, hit);
      return hit.work;
    }

    const entry = { work: Promise.resolve() as unknown as Promise<Bdae>, bytes: 0 };
    entry.work = readBdae(this.lib(), path)
      .then(doc => {
        // Sized only now; a failed read leaves no entry, so it can be retried.
        entry.bytes = doc.bytes.byteLength;
        this.docBytes += entry.bytes;
        this.retained.add(doc.bytes.buffer as ArrayBuffer);
        this.evictDocuments();
        return doc;
      })
      .catch(err => {
        this.docs.delete(key);
        throw err;
      });
    this.docs.set(key, entry);
    return entry.work;
  }

  private evictDocuments(): void {
    for (const [key, entry] of this.docs) {
      if (this.docBytes <= DOC_CACHE_BYTES) return;
      // Never the entry just added, or a model over budget could never be cached.
      if (entry.bytes === 0) continue;
      this.docs.delete(key);
      this.docBytes -= entry.bytes;
    }
  }

  private async loadModel(path: string): Promise<ModelData> {
    const doc = await this.document(path);
    const resolves = await this.textureResolver();
    const model = toModelData(doc, path, resolves);
    // A building with an interior drops the faces it covers (`interiorCompanion.ts`).
    const interiorPath = interiorOf(path);
    if (!interiorPath) return model;
    const interior = await this.document(interiorPath).catch(() => null);
    if (!interior) return model;
    return withoutSharedFaces(model, toModelData(interior, interiorPath, resolves));
  }

  private loadSkeleton(path: string): Promise<SkeletonData> {
    const key = path.toLowerCase();
    const hit = this.skeletons.get(key);
    if (hit) return hit;

    const work = this.document(path)
      .then(doc => {
        const skeleton = toSkeletonData(doc, path);
        // Held, so copied across the worker boundary, never moved: later clips resolve against it.
        retainBuffers(skeleton, this.retained);
        return skeleton;
      })
      .catch(err => {
        this.skeletons.delete(key);
        throw err;
      });
    this.skeletons.set(key, work);
    if (this.skeletons.size > SKELETON_CACHE_ENTRIES) {
      // Insertion order approximates use: a skeleton is asked for once, then read.
      const oldest = this.skeletons.keys().next().value;
      if (oldest !== undefined) this.skeletons.delete(oldest);
    }
    return work;
  }

  /** Animations resolve against the model's bind pose; the skeleton is cached, the clip is not. */
  private async loadAnimation(path: string, modelPath: string) {
    const [clipDoc, skeleton] = await Promise.all([
      this.document(path),
      this.loadSkeleton(modelPath),
    ]);
    return toAnimationData(clipDoc.animations(), skeleton, path);
  }

  /** Where a model's body parts lie on its skin sheet, and which hair styles are bare scalp. */
  private async sheetLayout(path: string): Promise<SheetLayout> {
    const cached = this.sheetLayoutCache.get(path);
    if (cached) return cached;
    const hairColours = shippedHairColours(path, await this.lib().textureNames());
    let sheet: SheetLayout = { layout: {}, bareScalps: new Set(), hairColours };
    try {
      const doc = await this.document(path);
      sheet = {
        layout: footprints(sheetMeshes(doc)),
        bareScalps: bareScalpStyles(doc.meshes(true)),
        hairColours,
      };
    } catch (err) {
      log.warn(`no skin-sheet layout for ${path}: ${String(err)}`);
    }
    if (!Object.keys(sheet.layout).length)
      log.once(
        'warn',
        `sheet-layout:${path}`,
        `${path}: no body regions found; only the base skin is painted`,
      );
    this.sheetLayoutCache.set(path, sheet);
    return sheet;
  }

  private async meshNames(path: string): Promise<string[]> {
    const cached = this.meshNameCache.get(path);
    if (cached) return cached;
    let names: string[] = [];
    try {
      names = (await this.document(path)).meshes(false).map(m => m.name);
    } catch {
      names = [];
    }
    this.meshNameCache.set(path, names);
    return names;
  }

  /** Model-space node positions (translations only), for effects; cached per model. */
  private async attachOffsets(path: string): Promise<Map<string, [number, number, number]>> {
    const cached = this.attachOffsetCache.get(path);
    if (cached) return cached;
    const out = new Map<string, [number, number, number]>();
    try {
      for (const [name, m] of (await this.document(path)).attachPoints()) {
        out.set(name, [m[9], m[10], m[11]]);
      }
    } catch {
      // No nodes: the effect falls back to the origin and says so.
    }
    this.attachOffsetCache.set(path, out);
    return out;
  }

  /** Static `.bdae` models an effect draws (a fountain's basin); unreadable reads as none. */
  private async effectModels(path: string): Promise<string[]> {
    const key = path.toLowerCase();
    const cached = this.effectModelCache.get(key);
    if (cached) return cached;
    let out: string[] = [];
    try {
      const bytes = await this.lib().readFirst(EFFECT_PACKS, path);
      if (bytes) {
        out = readBeff(bytes, path).nodes.flatMap(n =>
          n.kind === 'mesh' && n.meshPath.toLowerCase().endsWith('.bdae') ? [n.meshPath] : [],
        );
      }
    } catch {
      out = [];
    }
    this.effectModelCache.set(key, out);
    return out;
  }

  /** Model-space bounds of a model's static geometry; animated parts (sails) are not ground to stand on. */
  private async modelBounds(path: string): Promise<ModelBounds | null> {
    const key = path.toLowerCase();
    const cached = this.modelBoundsCache.get(key);
    if (cached !== undefined) return cached;
    let out: ModelBounds | null = null;
    try {
      const doc = await this.document(path);
      const min: [number, number, number] = [Infinity, Infinity, Infinity];
      const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      for (const m of doc.meshes(true)) {
        if (!m.positions || m.chain) continue;
        const p = m.positions;
        for (let i = 0; i < p.length; i += 3) {
          const x = p[i]!;
          const y = p[i + 1]!;
          const z = p[i + 2]!;
          if (x < min[0]) min[0] = x;
          if (y < min[1]) min[1] = y;
          if (z < min[2]) min[2] = z;
          if (x > max[0]) max[0] = x;
          if (y > max[1]) max[1] = y;
          if (z > max[2]) max[2] = z;
        }
      }
      if (min[0] !== Infinity) out = { min, max };
    } catch {
      out = null;
    }
    this.modelBoundsCache.set(key, out);
    return out;
  }

  /** A composited look; without one the default wears every slot's variant 0 at once. */
  private async loadAvatar(id: IdOf<'avatar'>): Promise<Appearance> {
    const tables = await this.worldTables();
    const look = lookFrom({
      skin: id.skin,
      face: id.face,
      hairStyle: id.hairStyle,
      hairColor: id.hairColor,
    });
    const items = (itemId: number) => tables.keyedRows('itemdisplayinfo').get(itemId);
    const itemModels = (modelId: number) => tables.keyedRows('itemmodeldata').get(modelId);
    const { visible, meshTextures } = visibleMeshes(await this.meshNames(id.model), look, items);
    const key = `avatar:${id.model}|${id.skin}|${id.face}|${id.hairStyle}|${id.hairColor}`;
    return {
      skin:
        `${AVATAR_PREFIX}player:${encodeURIComponent(id.model)}` +
        `:${id.skin}:${id.face}:${id.hairStyle}:${id.hairColor}`,
      meshes: visible,
      meshTextures,
      skinReplacesAll: false,
      hairColor: look.hairColor,
      attachments: attachmentsFor(look, items, itemModels, false, itemId =>
        tables.itemWeaponClass(itemId),
      ),
      key,
    };
  }

  /** A replicated static object's model, from `staticobject_proto` (not a creature table). */
  private async loadStaticObjectModel(entry: number): Promise<NetworkAppearance> {
    const tables = await this.worldTables();
    const resolved = tables.staticModel(entry);
    if (!resolved.path)
      throw new ResourceNotFoundError('staticObjectModel', `no static model for entry ${entry}`);
    return { model: resolved.path, scale: resolved.scale };
  }

  private async loadNetworkAppearance(id: IdOf<'networkAppearance'>): Promise<NetworkAppearance> {
    const tables = await this.worldTables();
    const resolved = id.entry
      ? tables.creatureModel(id.entry)
      : tables.creatureDisplayModel(id.displayInfoId);
    if (!resolved.path) {
      // A player id with an unresolvable display row still gets a body; a
      // creature entry with no model is a real data gap and stays an error.
      if (id.entry)
        throw new ResourceNotFoundError('networkAppearance', `no model for entry ${id.entry}`);
      log.once(
        'warn',
        `no-display:${id.displayInfoId}`,
        `no model for display ${id.displayInfoId}; using the fallback player body`,
      );
      resolved.path = FALLBACK_PLAYER_MODEL_PATH;
      resolved.scale = 1;
      resolved.skin = null;
    }

    if (id.entry) {
      const appearanceRow = tables.keyedRows('creature_appearance').get(id.entry);
      const displayId = appearanceRow ? Number(appearanceRow[5]) : id.displayInfoId;
      const display = tables.keyedRows('creaturedisplayinfo').get(displayId);
      const extra = display
        ? tables.keyedRows('creaturedisplayinfoextra').get(Number(display[7]))
        : undefined;
      if (extra) {
        const look = lookFromRow(extra);
        const items = (itemId: number) => tables.keyedRows('itemdisplayinfo').get(itemId);
        const itemModels = (modelId: number) => tables.keyedRows('itemmodeldata').get(modelId);
        const heldItems = heldItemsOf(look, itemId => tables.itemWeaponClass(itemId));
        const { visible, meshTextures } = visibleMeshes(
          await this.meshNames(resolved.path),
          look,
          items,
        );
        return {
          model: resolved.path,
          scale: resolved.scale,
          animationName: tables.animationName(id.animationId) ?? undefined,
          animationLoops: tables.animationLoops(id.animationId),
          ...(heldItems ? { heldItems } : {}),
          appearance: {
            skin: `${AVATAR_PREFIX}creature:${id.entry}`,
            meshes: visible,
            meshTextures,
            skinReplacesAll: false,
            key: `creature:${id.entry}`,
            attachments: attachmentsFor(look, items, itemModels, true, itemId =>
              tables.itemWeaponClass(itemId),
            ),
          },
        };
      }
      return {
        model: resolved.path,
        scale: resolved.scale,
        animationName: tables.animationName(id.animationId) ?? undefined,
        animationLoops: tables.animationLoops(id.animationId),
        appearance: resolved.skin
          ? { skin: resolved.skin, meshes: [], skinReplacesAll: true, key: `skin:${resolved.skin}` }
          : undefined,
      };
    }

    const look = lookFrom({
      skin: id.skin,
      face: id.face,
      hairStyle: id.hairStyle,
      hairColor: id.hairColor,
    });
    Object.assign(look.worn, appearanceEquipment(id.equipment));
    const items = (itemId: number) => tables.keyedRows('itemdisplayinfo').get(itemId);
    const itemModels = (modelId: number) => tables.keyedRows('itemmodeldata').get(modelId);
    const { visible, meshTextures } = visibleMeshes(
      await this.meshNames(resolved.path),
      look,
      items,
    );
    return {
      model: resolved.path,
      scale: resolved.scale,
      appearance: {
        skin: `${AVATAR_PREFIX}player:${encodeURIComponent(resolved.path)}:${id.skin}:${id.face}:${id.hairStyle}:${id.hairColor}:${id.equipment.join(',')}`,
        meshes: visible,
        meshTextures,
        skinReplacesAll: false,
        key: `network:${resolved.path}|${id.skin}|${id.face}|${id.hairStyle}|${id.hairColor}|${id.equipment.join(',')}`,
        attachments: attachmentsFor(look, items, itemModels, false, itemId =>
          tables.itemWeaponClass(itemId),
        ),
      },
    };
  }

  /** One node's full 12-float model-space matrix (a mount's `Dummy_ride`), cached per model. */
  private async loadAttachPoint(path: string, node: string): Promise<number[] | null> {
    const cached = this.attachPointCache.get(path);
    if (cached) return cached.get(node) ?? null;
    const out = new Map<string, number[]>();
    try {
      for (const [name, m] of (await this.document(path)).attachPoints()) {
        out.set(name, m);
      }
    } catch {}
    this.attachPointCache.set(path, out);
    return out.get(node) ?? null;
  }

  // — effects ---------------------------------------------------------

  /** One `.beff`, decoded and renamed into the neutral vocabulary. */
  private async loadEffect(path: string): Promise<EffectData> {
    const bytes = await this.lib().readFirst(EFFECT_PACKS, path);
    if (!bytes) throw new ResourceNotFoundError(`effect:${path}`);
    try {
      return await buildEffect(this.lib(), path, readBeff(bytes, path));
    } catch (err) {
      // Carry the reason: 1.0.2's effects are version 7, which this reader does not know.
      const why = err instanceof Error ? err.message : String(err);
      throw new ResourceError(`effect:${path}`, why, err);
    }
  }

  // — loading art -----------------------------------------------------

  /** Zone loading art per top zone, 512 or 1024 by usable pixels; falls back to `splash.tga`. */
  private async loadSplash(zone?: number, maxSize?: number): Promise<TextureData> {
    const ref = zone === undefined ? null : await this.splashRef(zone, maxSize ?? 1024);
    if (ref) {
      const { bytes } = await this.lib().readTexture(ref);
      const full = await decodeTextureBitmap(bytes, maxSize ?? 1024);
      return { ref, image: await cropLoadingArt(full) };
    }

    // No art for this region: the launch image is a real PNG.
    const launch = await this.lib().launchImage();
    if (!launch) throw new ResourceNotFoundError(`splash:${zone ?? 'default'}`);
    const blob = new Blob([launch.bytes as BlobPart], { type: 'image/png' });
    return { ref: `splash:${launch.name}`, image: await createImageBitmap(blob) };
  }

  /** Decode every zone's loading art once, as WebP the browser hands straight to CSS. */
  private async buildSplashCache(): Promise<void> {
    const store = this.lib().storage;
    const tables = await this.worldTables();
    const names = await this.zoneNames(tables);
    const rows = tables.zones(names);

    const tops = new Set<number>();
    for (const row of rows) tops.add(this.topZoneOf(rows, row).id);

    let stored = 0;
    for (const id of tops) {
      const ref = await this.splashRef(id, 1024).catch(() => null);
      if (!ref) continue;
      try {
        const { bytes } = await this.lib().readTexture(ref);
        const image = await cropLoadingArt(await decodeTextureBitmap(bytes, 1024));
        const blob = await encodeBitmap(image);
        image.close();
        if (blob) {
          await store.writeSplash(id, blob);
          stored++;
        }
      } catch (err) {
        log.debug(`no loading art cached for zone ${id}: ${String(err)}`);
      }
    }
    log.info(`loading art: ${stored} zones cached`);
  }

  async splashes(): Promise<Array<[number, Blob]>> {
    return this.library ? this.library.storage.readSplashes() : [];
  }

  private topZoneOf<T extends { id: number; parentId: number }>(rows: T[], row: T): T {
    let top = row;
    for (let hops = 0; hops < 8 && top.parentId > 0; hops++) {
      const parent = rows.find(z => z.id === top.parentId);
      if (!parent) break;
      top = parent;
    }
    return top;
  }

  private async splashRef(zone: number, wanted: number): Promise<string | null> {
    const tables = await this.worldTables();
    const names = await this.zoneNames(tables);
    const rows = tables.zones(names);

    const row = rows.find(z => z.id === zone);
    if (!row) return null;

    const world = worldStem(tables, row.mapId);
    if (!world) return null;

    const top = this.topZoneOf(rows, row);

    const order =
      wanted > 512
        ? [`${world}_${top.id}_2x`, `${world}_${top.id}`]
        : [`${world}_${top.id}`, `${world}_${top.id}_2x`];
    for (const name of order) {
      const ref = `2d_texture/${name}.tga`;
      if (await this.lib().resolveTexture(ref)) return ref;
    }
    return null;
  }

  private async textureResolver(): Promise<(ref: string) => boolean> {
    const lib = this.lib();
    await lib.warmTextureIndex();
    return (ref: string) => lib.resolveTextureSync(ref) !== null;
  }

  private async loadTexture(ref: string): Promise<TextureData> {
    if (ref.startsWith(MASK_PREFIX)) return this.loadGroundMask(ref);
    if (ref.startsWith(AVATAR_PREFIX)) return this.loadAvatarSkin(ref);

    const lib = this.lib();
    let bytes: Uint8Array;
    try {
      ({ bytes } = await lib.readTexture(ref));
    } catch {
      throw new ResourceNotFoundError(`texture:${ref}`);
    }
    try {
      return { ref, image: await decodeTextureBitmap(bytes, this.opts.maxTextureSize) };
    } catch (err) {
      throw new ResourceError(`texture:${ref}`, `could not decode texture: ${ref}`, err);
    }
  }

  /**
   * A tile's ground mask as the shader reads it: `_0.msk` in red, `_1.msk`
   * in green, `.shw` in blue; a missing layer stays 0.
   */
  private async loadGroundMask(ref: string): Promise<TextureData> {
    const [, stem, tileRaw] = ref.split(':');
    const [tx, tz] = tileRaw.split(',').map(Number);

    const lib = this.lib();
    const layerPack = `${stem}_layer.bin`;
    if (!lib.hasPack(layerPack)) throw new ResourceNotFoundError(`texture:${ref}`);

    const planes: Array<Uint8Array | null> = [];
    let size = 0;
    for (const layer of [0, 1, null]) {
      const bytes = await lib.readFirst([layerPack], layerName(stem, tx, tz, layer));
      if (!bytes) {
        planes.push(null);
        continue;
      }
      const side = Math.round(Math.sqrt(bytes.length));
      if (side * side !== bytes.length) planes.push(null);
      else if (size === 0 || side === size) {
        size = side;
        planes.push(bytes);
      } else {
        planes.push(null); // mismatched resolutions: drop this one
      }
    }
    if (!size) throw new ResourceNotFoundError(`texture:${ref}`);

    const px = new Uint8ClampedArray(new ArrayBuffer(size * size * 4));
    for (let c = 0; c < 3; c++) {
      const plane = planes[c];
      if (!plane) continue;
      for (let i = 0; i < size * size; i++) px[i * 4 + c] = plane[i];
    }
    for (let i = 0; i < size * size; i++) px[i * 4 + 3] = 255;

    return { ref, image: await createImageBitmap(new ImageData(px, size, size)) };
  }

  private async loadAvatarSkin(ref: string): Promise<TextureData> {
    const tables = await this.worldTables();
    const parts = ref.split(':');
    const items = (itemId: number) => tables.keyedRows('itemdisplayinfo').get(itemId);

    let modelPath: string;
    let look: Look;
    if (parts[1] === 'creature') {
      const entry = Number(parts[2]);
      const { path } = tables.creatureModel(entry);
      if (!path) throw new ResourceNotFoundError(`texture:${ref}`);
      modelPath = path;
      const appearance = tables.keyedRows('creature_appearance').get(entry);
      const display = appearance
        ? tables.keyedRows('creaturedisplayinfo').get(Number(appearance[5]))
        : undefined;
      const extra = display
        ? tables.keyedRows('creaturedisplayinfoextra').get(Number(display[7]))
        : undefined;
      if (!extra) throw new ResourceNotFoundError(`texture:${ref}`);
      look = lookFromRow(extra);
    } else {
      modelPath = decodeURIComponent(parts[2]);
      look = lookFrom({
        skin: Number(parts[3]),
        face: Number(parts[4]),
        hairStyle: Number(parts[5]),
        hairColor: Number(parts[6]),
      });
      // The local player's own ref carries no equipment segment.
      if (parts[7] !== undefined) {
        const equipment = parts[7].split(',').map(Number);
        Object.assign(look.worn, appearanceEquipment(equipment));
      }
    }

    // The composite is synchronous; decode every layer first.
    const { layout, bareScalps, hairColours } = await this.sheetLayout(modelPath);
    await this.warmLayers(
      bodyLayers(modelPath, look, items, bareScalps, hairColours).map(l => l.ref),
    );
    const { image } = compositeSkin(
      modelPath,
      look,
      items,
      r => this.layer(r),
      layout,
      bareScalps,
      hairColours,
    );
    return {
      ref,
      image: await createImageBitmap(
        new ImageData(image.pixels, image.width, image.height),
        STRAIGHT_ALPHA,
      ),
    };
  }

  /** One decoded body layer, synchronously from the cache `warmLayers` fills. */
  private layer(ref: string): DecodedImage | null {
    return this.layerCache.get(ref) ?? null;
  }

  async warmLayers(refs: string[]): Promise<void> {
    const lib = this.lib();
    await Promise.all(
      refs.map(async ref => {
        if (this.layerCache.has(ref)) return;
        try {
          const { bytes } = await lib.readTexture(ref);
          this.layerCache.set(ref, decodeTexture(bytes).image);
        } catch {
          this.layerCache.set(ref, null);
        }
      }),
    );
  }
}

function describe(id: string, files: File[]): AssetSource {
  const label =
    files.length === 1
      ? files[0].name
      : `${files.length} packs (${files.map(f => f.name).join(', ')})`;
  return {
    id,
    label,
    version: /-(\d+\.\d+\.\d+)-/.exec(label)?.[1],
    sizeBytes: files.reduce((n, f) => n + f.size, 0),
  };
}
