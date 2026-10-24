/**
 * The Resource API: turn ids into resources through the provider,
 * de-duplicate concurrent requests, and cache.
 */

import { logger } from '../core/log';
import { ResourceError } from '../core/errors';
import type { AssetProvider, AssetSource } from './AssetProvider';
import {
  animationId,
  animationNameId,
  visualWithEffectId,
  animationNamedId,
  impactVisualId,
  modelId,
  resourceKey,
  skeletonId,
  textureId,
  tileId,
  zoneId,
  zoneIndexId,
  mountListId,
  playableKindsId,
  uiIconId,
  lookOptionsId,
  networkAppearanceId,
  staticObjectModelId,
  teleportStopsId,
  itemCatalogId,
  spellAvatarId,
  storageUpgradesId,
  talentsId,
  spellStringId,
  busRoutesId,
  soundCatalogueId,
  soundClipId,
  unitSoundsId,
  gossipMenuId,
  npcGreetingId,
  areaMapId,
  areaLinksId,
  minimapId,
  itemWeaponClassId,
  itemNameId,
  itemTextId,
  spellCastingTimeId,
  spellStatsId,
  spellVisualId,
  spellVisualOfId,
} from './ids';
import type { IdOf, ResourceId, ResourceKind, UiMovie } from './ids';
import type {
  AnimationClipData,
  ModelData,
  ResourceTypes,
  UiFaces,
  SkeletonData,
  MountRow,
  PlayableKinds,
  LookOptions,
  NetworkAppearance,
  SpellStats,
  TextureData,
  TileData,
  UiSkinArt,
  UiSkinData,
  ZoneData,
  ZoneIndex,
} from './types';
import type { SpellVisualData } from './formats/tables';
import { WEAPON_SLOT, familyOf } from '../gameplay/weaponClips';
import type { EquippedWeapons, WeaponType } from '../gameplay/weaponClips';
import { CACHE_SCHEMA_VERSION, MemoryResourceCache } from './cache/ResourceCache';
import type { ResourceCache } from './cache/ResourceCache';

const log = logger('resources');

/**
 * Resource kinds worth caching (asked for by identity, small enough to keep).
 * Values handed out are shared, not copied — nothing may mutate one. `texture`/
 * `splash` (GPU-bound) and `tile` (streamer-evicted) are deliberately absent.
 */
const CACHEABLE: ReadonlySet<ResourceKind> = new Set<ResourceKind>([
  'model',
  'zone',
  'zoneIndex',
  'skeleton',
  'animation',
  'avatar',
  'mountList',
  'playableKinds',
  'lookOptions',
  'networkAppearance',
  'staticObjectModel',
  'attachPoint',
  'effect',
  'creatureName',
  'creatureEntryName',
  'animationName',
  'visualWithEffect',
  'animationNamed',
  'impactVisual',
  // Read on every cast, and the same handful of ids all session.
  'spellVisual',
  'spellVisualOf',
  'spellAvatar',
  'spellCastable',
  'spellRank',
  'spellCastingTime',
  'spellStats',
  'spellName',
  'spellText',
  'questText',
  'itemWeaponClass',
  'soundCatalogue',
  'unitSounds',
]);

export class ResourceSystem {
  private inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly provider: AssetProvider,
    private readonly cache: ResourceCache = new MemoryResourceCache(),
  ) {}

  get providerName(): string {
    return this.provider.name;
  }

  /**
   * What failed and how often, for the end of a zone load. Most is genuinely
   * absent data: 2.2.0 terrain names ground textures the build lacks.
   */
  failureSummary(): Array<[string, number]> {
    return log.repeats();
  }

  async init(): Promise<void> {
    await this.provider.init();
    await this.rescope();
  }

  storageUpgrades(): Promise<ResourceTypes['storageUpgrades']> {
    return this.get(storageUpgradesId());
  }

  /** The display a spell's aura turns its wearer into, or 0; a missing row is "none", not an error. */
  async spellAvatar(id: number): Promise<number> {
    try {
      return await this.get(spellAvatarId(id));
    } catch {
      return 0;
    }
  }

  itemCatalog(): Promise<ResourceTypes['itemCatalog']> {
    return this.get(itemCatalogId());
  }

  talents(): Promise<ResourceTypes['talents']> {
    return this.get(talentsId());
  }

  spellString(id: number): Promise<ResourceTypes['spellString']> {
    return this.get(spellStringId(id));
  }

  teleportStops(): Promise<ResourceTypes['teleportStops']> {
    return this.get(teleportStopsId());
  }

  gossipMenu(id: number): Promise<ResourceTypes['gossipMenu']> {
    return this.get(gossipMenuId(id));
  }

  /** What a creature says first when a player talks to it. */
  npcGreeting(entry: number): Promise<ResourceTypes['npcGreeting']> {
    return this.get(npcGreetingId(entry));
  }

  itemName(id: number): Promise<string | null> {
    return this.get(itemNameId(id));
  }
  itemText(id: number): Promise<string | null> {
    return this.get(itemTextId(id));
  }

  areaMap(zoneId: number, routes = false): Promise<ResourceTypes['areaMap'] | null> {
    return this.tryGet(areaMapId(zoneId, routes));
  }

  busRoutes(): Promise<ResourceTypes['busRoutes']> {
    return this.get(busRoutesId());
  }

  soundCatalogue(): Promise<ResourceTypes['soundCatalogue']> {
    return this.get(soundCatalogueId());
  }

  /**
   * One sound file, decoded. Not cached here: decoded music runs to tens of
   * megabytes, and the audio layer keeps what it plays.
   */
  soundClip(path: string): Promise<ResourceTypes['soundClip']> {
    return this.get(soundClipId(path));
  }

  unitSounds(
    entry: number,
    displayInfoId: number,
    race = -1,
    gender = -1,
  ): Promise<ResourceTypes['unitSounds']> {
    return this.get(unitSoundsId(entry, displayInfoId, race, gender));
  }

  areaLinks(): Promise<ResourceTypes['areaLinks'] | null> {
    return this.tryGet(areaLinksId());
  }

  minimap(mapId: number, tx: number, tz: number): Promise<ResourceTypes['minimap'] | null> {
    return this.tryGet(minimapId(mapId, tx, tz));
  }

  listSources(): Promise<AssetSource[]> {
    return this.provider.listSources();
  }

  currentSource(): AssetSource | null {
    return this.provider.currentSource();
  }

  async useSource(id: string): Promise<AssetSource> {
    const source = await this.provider.useSource(id);
    this.inFlight.clear();
    await this.rescope();
    return source;
  }

  /** Point the cache at the mounted source so entries cannot cross builds. */
  private async rescope(): Promise<void> {
    const source = this.provider.currentSource();
    await this.cache.open(source ? source.id : 'none', CACHE_SCHEMA_VERSION);
  }

  async get<K extends ResourceKind>(id: IdOf<K>): Promise<ResourceTypes[K]> {
    const key = resourceKey(id);

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<ResourceTypes[K]>;

    const work = this.resolve(id, key);
    this.inFlight.set(key, work);
    try {
      return await work;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async resolve<K extends ResourceKind>(
    id: IdOf<K>,
    key: string,
  ): Promise<ResourceTypes[K]> {
    const cacheable = CACHEABLE.has(id.kind);
    if (cacheable) {
      const hit = await this.cache.get<ResourceTypes[K]>(key);
      if (hit !== undefined) {
        log.debug(`cache hit ${key}`);
        return hit;
      }
    }

    const started = performance.now();
    const value = await this.provider.load(id);
    log.debug(`loaded ${key} in ${Math.round(performance.now() - started)}ms`);

    if (cacheable) await this.cache.put(key, value);
    return value;
  }

  /**
   * Best-effort variant for things the game can carry on without — a missing
   * texture should not abort a zone load. Returns null and logs instead.
   */
  async tryGet<K extends ResourceKind>(id: IdOf<K>): Promise<ResourceTypes[K] | null> {
    try {
      return await this.get(id);
    } catch (err) {
      const key = resourceKey(id as ResourceId);
      const why = err instanceof ResourceError ? err.message : String(err);
      // One line per distinct failure, not per placement that hits it. A
      // single missing ground texture is named by dozens of chunks, and
      // dozens of identical lines say no more than one does — while costing
      // real time, because every one of them is retained by DevTools.
      log.once('warn', `${key}: ${why}`, `${key}: ${why}`);
      return null;
    }
  }

  // — convenience accessors -------------------------------------------
  // Named methods so call sites read as intent ("give me the wolf model")
  // rather than as id construction.

  zoneIndex(): Promise<ZoneIndex> {
    return this.get(zoneIndexId());
  }

  /** Every rideable mount, from `mountprototype.tbl`. Empty on a build without it. */
  mountList(): Promise<MountRow[]> {
    return this.get(mountListId());
  }

  /**
   * What a character can be made as. Empty lists on a build whose tables
   * carry no such rows, which leaves the screen offering nothing rather
   * than offering something invented.
   */
  playableKinds(): Promise<PlayableKinds> {
    return this.get(playableKindsId());
  }

  /** What one body can be made to look like. Empty lists where it ships none. */
  lookOptions(model: string): Promise<LookOptions> {
    return this.get(lookOptionsId(model));
  }

  creatureName(id: number): Promise<string | null> {
    return this.get({ kind: 'creatureName', id });
  }

  creatureEntryName(entry: number): Promise<string | null> {
    return this.get({ kind: 'creatureEntryName', entry });
  }

  spellText(id: number): Promise<string | null> {
    return this.tryGet({ kind: 'spellText', id });
  }

  spellName(id: number): Promise<string | null> {
    return this.get({ kind: 'spellName', id });
  }

  /** A quest title, details or objective: all plain ids in one table. */
  questText(id: number): Promise<string | null> {
    return this.get({ kind: 'questText', id });
  }

  /**
   * What an item is, by its entry: quality, the level it asks for, and the
   * string that describes it. Null where the build carries no such item.
   */
  itemFacts(entry: number): Promise<ResourceTypes['itemFacts']> {
    return this.tryGet({ kind: 'itemFacts', id: entry });
  }

  itemIcon(entry: number): Promise<ImageBitmap | null> {
    return this.get({ kind: 'itemIcon', id: entry });
  }

  spellIcon(id: number): Promise<ImageBitmap | null> {
    return this.get({ kind: 'spellIcon', id });
  }

  /** One of the target toolbar's action icons, by our own name for it. */
  topbarIcon(name: string): Promise<ImageBitmap | null> {
    return this.get({ kind: 'topbarIcon', name });
  }

  /** A player class's badge picture, by the game's class number. */
  classIcon(classId: number): Promise<ImageBitmap | null> {
    return this.get({ kind: 'classIcon', classId });
  }

  /**
   * One interface movie's display-list structure (see `UiSkinData`).
   * Best-effort like everything else the interface wears: a dialog whose
   * movie is missing falls back to its own styling rather than failing.
   */
  uiSkin(movie: UiMovie): Promise<UiSkinData | null> {
    return this.tryGet({ kind: 'uiSkin', movie });
  }

  /** One interface bitmap by linkage name. Null when not shipped. */
  uiIcon(name: string, movie?: UiMovie): Promise<UiSkinArt | null> {
    return this.tryGet(uiIconId(name, movie));
  }

  /**
   * Every word the interface shows, in the order the build numbered them.
   * Empty where the mounted build ships none, which leaves each screen to
   * its own styling rather than failing.
   */
  async uiStrings(): Promise<readonly string[]> {
    return (await this.tryGet({ kind: 'uiStrings' })) ?? [];
  }

  /** The interface's own typefaces; each is null where the build ships none. */
  async uiFaces(): Promise<UiFaces> {
    return (await this.tryGet({ kind: 'uiFaces' })) ?? { body: null, title: null };
  }

  /** One GPU program stage's text by entry name, or null where the build ships none. */
  shaderText(name: string): Promise<string | null> {
    return this.tryGet({ kind: 'shaderText', name });
  }

  /**
   * Everything one spell visual id describes: the seven cast states, their
   * particle slots, and the missile. Null when the build ships no such row.
   */
  spellVisual(id: number): Promise<SpellVisualData | null> {
    return this.tryGet(spellVisualId(id));
  }

  /**
   * How long a spell takes to cast, in milliseconds.
   *
   * The spell's own figure, not how long a particular cast took. The cast
   * release picks its visual from this, so the two must not be confused.
   */
  spellCastingTime(id: number): Promise<number> {
    return this.get(spellCastingTimeId(id));
  }

  /** A spell's cast time, cooldown and reach, for the card the spell book opens. */
  spellStats(id: number): Promise<SpellStats> {
    return this.get(spellStatsId(id));
  }

  /**
   * The spell visual id a spell's own row names. 0 when it names none, and 0
   * when the mounted build ships no spell table at all — both mean "this cast
   * has no visual", which is a thing spells are allowed to be rather than an
   * error worth throwing over.
   */
  async spellVisualOf(id: number): Promise<number> {
    try {
      return await this.get(spellVisualOfId(id));
    } catch {
      return 0;
    }
  }

  /** An equipped item's class and subclass, for picking its combat clips. */
  itemWeaponClass(entry: number): Promise<{ itemClass: number; subClass: number }> {
    return this.get(itemWeaponClassId(entry));
  }

  /** What each hand plays, from the items in the equipment's hand slots (`familyOf`). */
  async equippedWeapons(equipment: readonly number[]): Promise<EquippedWeapons> {
    const of = async (slot: number, ranged: boolean): Promise<WeaponType> => {
      const reach = ranged ? 'ranged' : 'melee';
      const entry = equipment[slot] ?? 0;
      if (!entry) return familyOf(null, reach);
      try {
        return familyOf(await this.itemWeaponClass(entry), reach);
      } catch {
        // A build with no `items.tbl` still animates, just unarmed.
        return familyOf(null, reach);
      }
    };
    const [mainhand, offhand, ranged] = await Promise.all([
      of(WEAPON_SLOT.mainhand, false),
      of(WEAPON_SLOT.offhand, false),
      of(WEAPON_SLOT.ranged, true),
    ]);
    return { mainhand, offhand, ranged };
  }

  async spellCastable(spellId: number): Promise<boolean> {
    try {
      const result = await this.get({ kind: 'spellCastable', id: spellId });
      return result as unknown as boolean;
    } catch {
      return true; // If the table isn't available, include the spell.
    }
  }

  /** A spell's rank within its own ability chain. 0 if unknown. */
  async spellRank(spellId: number): Promise<number> {
    try {
      return await this.get({ kind: 'spellRank', id: spellId });
    } catch {
      return 0;
    }
  }

  networkAppearance(input: Omit<IdOf<'networkAppearance'>, 'kind'>): Promise<NetworkAppearance> {
    return this.get(networkAppearanceId(input));
  }

  /** A server-replicated static object's model, by `staticobject_proto` entry. */
  staticObjectModel(entry: number): Promise<NetworkAppearance> {
    return this.get(staticObjectModelId(entry));
  }

  animationName(id: number): Promise<string | null> {
    return this.get(animationNameId(id));
  }

  /** The first spell visual that shows this effect file, or null when none does. */
  visualWithEffect(effectPath: string): Promise<number | null> {
    return this.get(visualWithEffectId(effectPath));
  }

  /** A clip as the animation table spells it, found by name; null when absent. */
  animationNamed(name: string): Promise<string | null> {
    return this.get(animationNamedId(name));
  }

  /** The spell visual that plays only this particle file on impact, or null. */
  impactVisual(file: string): Promise<number | null> {
    return this.get(impactVisualId(file));
  }

  zone(id: number): Promise<ZoneData> {
    return this.get(zoneId(id));
  }

  /** One tile; best-effort, since window corners routinely fall off the map. */
  tile(mapId: number, tx: number, tz: number, world?: string): Promise<TileData | null> {
    return this.tryGet(tileId(mapId, tx, tz, world));
  }

  model(path: string): Promise<ModelData> {
    return this.get(modelId(path));
  }

  texture(ref: string): Promise<TextureData | null> {
    return this.tryGet(textureId(ref));
  }

  /** A model's bone hierarchy and skin binding, or null if it has none. */
  skeleton(path: string): Promise<SkeletonData | null> {
    return this.tryGet(skeletonId(path));
  }

  /** One of a model's clips, from the `anim/` directory beside it (a game-data convention). */
  async animation(modelPath: string, clip = 'idle'): Promise<AnimationClipData | null> {
    const dir = modelPath.slice(0, modelPath.lastIndexOf('/'));
    if (!dir) return null;
    const sibling = await this.tryGet(animationId(`${dir}/anim/${clip}.bdae`, modelPath));
    if (sibling || clip !== 'idle') return sibling;
    // Skinned scenery — a butterfly's wings ride a skin, not a node chain —
    // has no `anim` directory: its one animation is inside the model file,
    // keyed to the same bones. That is the resting clip and nothing else, so
    // only the idle asks here; a character missing a named clip is not
    // answered with whatever its own file happens to hold.
    const own = await this.tryGet(animationId(modelPath, modelPath));
    return own && own.tracks.length > 0 ? own : null;
  }

  dispose(): void {
    this.inFlight.clear();
    this.provider.dispose();
  }
}
