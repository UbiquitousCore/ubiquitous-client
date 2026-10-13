/**
 * The only vocabulary the game uses to ask for game data: what is wanted,
 * never where it comes from. Plain and structured-clonable, so it posts to
 * the Worker unchanged.
 */

export type ResourceId =
  | { readonly kind: 'creatureName'; readonly id: number }
  /** A creature's own name, by its entry rather than by a string id. */
  | { readonly kind: 'creatureEntryName'; readonly entry: number }
  | { readonly kind: 'spellName'; readonly id: number }
  | { readonly kind: 'spellText'; readonly id: number }
  /** A quest's title, details or one objective, by its own string id. */
  | { readonly kind: 'questText'; readonly id: number }
  | { readonly kind: 'spellIcon'; readonly id: number }
  /** By the item's entry: the display table is keyed by entry. */
  | { readonly kind: 'itemIcon'; readonly id: number }
  /** One of the target toolbar's action icons, by our own name for it
   * (`whisper`, `trade`, `follow`, ...) — not a game entry id, since these
   * are loose files, not table rows. */
  | { readonly kind: 'topbarIcon'; readonly name: string }
  /** A player class's badge picture, by the game's class number. */
  | { readonly kind: 'classIcon'; readonly classId: number }
  /** Every sound the tables describe, with the banks that cap them. */
  | { readonly kind: 'soundCatalogue' }
  /** One sound file, decoded, by its path in the sound pack. */
  | { readonly kind: 'soundClip'; readonly path: string }
  /**
   * What a body says when it attacks, is hurt, dies and so on: by creature
   * entry, or by display row for a body with no entry.
   */
  | {
      readonly kind: 'unitSounds';
      readonly entry: number;
      readonly displayInfoId: number;
      /** A character's race and sex, for a body the tables cannot place; -1 for none. */
      readonly race: number;
      readonly gender: number;
    }
  /** The list of zones the mounted game data contains. */
  | { readonly kind: 'zoneIndex' }
  /** Every rideable mount, from `mountprototype.tbl`. */
  | { readonly kind: 'mountList' }
  /** The races and classes a character can be made as. */
  | { readonly kind: 'playableKinds' }
  /** The looks one body offers: its skins, faces, hair styles and colours. */
  | { readonly kind: 'lookOptions'; readonly model: string }
  /** Named teleport stops from the local game tables. */
  | { readonly kind: 'teleportStops' }
  /** The bag and bank upgrade ladder, from the local tables. */
  | { readonly kind: 'storageUpgrades' }
  | { readonly kind: 'talents' }
  | { readonly kind: 'spellString'; readonly id: number }
  /** The bus network's legs, which decide what a teleport costs and whether it exists. */
  | { readonly kind: 'busRoutes' }
  | { readonly kind: 'gossipMenu'; readonly id: number }
  /** The menu a creature opens its conversation with, by creature entry. */
  | { readonly kind: 'npcGreeting'; readonly entry: number }
  /**
   * A region's map picture. `routes` asks for the one with the bus network
   * drawn in, which the build ships for the regions that have one.
   */
  | { readonly kind: 'areaMap'; readonly zoneId: number; readonly routes?: boolean }
  /** How the world map's regions are laid out and which ones adjoin. */
  | { readonly kind: 'areaLinks' }
  | { readonly kind: 'minimap'; readonly mapId: number; readonly tx: number; readonly tz: number }
  /** One zone: its label, its bounds and its atmosphere. Not any ground. */
  | { readonly kind: 'zone'; readonly zoneId: number }
  /** One 64-unit tile of a map; by map, not zone, so tiles under a zone seam decode once. */
  | {
      readonly kind: 'tile';
      readonly mapId: number;
      readonly tx: number;
      readonly tz: number;
      /** The world by pack name, for one the map tables never list (the selection map). */
      readonly world?: string;
    }
  /** One model, by its in-game resource path (e.g. 'model/npc/.../foo.bdae'). */
  | { readonly kind: 'model'; readonly path: string }
  /** One texture that a model or terrain tile carries. */
  | { readonly kind: 'texture'; readonly ref: string }
  /**
   * A composited character look. Used for the local player, who has no spawn
   * table row and so must ask for an explicit appearance.
   */
  | {
      readonly kind: 'avatar';
      readonly model: string;
      readonly skin: number;
      readonly face: number;
      readonly hairStyle: number;
      readonly hairColor: number;
    }
  /** A network entity's numeric appearance, resolved entirely from local tables. */
  | {
      readonly kind: 'networkAppearance';
      readonly entry: number;
      readonly displayInfoId: number;
      readonly race: number;
      readonly gender: number;
      readonly skin: number;
      readonly face: number;
      readonly hairStyle: number;
      readonly hairColor: number;
      readonly equipment: readonly number[];
      readonly animationId: number;
    }
  /** A replicated static object's model, from `staticobject_proto`; it has none of what `networkAppearance` reads. */
  | { readonly kind: 'staticObjectModel'; readonly entry: number }
  /** A model's bone hierarchy and per-mesh skin binding. */
  | { readonly kind: 'skeleton'; readonly path: string }
  /** One animation, resolved against the model's bind pose (both files are needed). */
  | {
      readonly kind: 'animation';
      readonly path: string;
      readonly modelPath: string;
    }
  | { readonly kind: 'animationName'; readonly animationId: number }
  /** The first spell visual that shows an effect file, by the file's path. */
  | { readonly kind: 'visualWithEffect'; readonly effectPath: string }
  /** A clip, by name, as the animation table spells it; null when absent. */
  | { readonly kind: 'animationNamed'; readonly name: string }
  /** The spell visual that plays only this particle file on impact. */
  | { readonly kind: 'impactVisual'; readonly file: string }
  | { readonly kind: 'spellCastable'; readonly id: number }
  /** A spell's rank from `spell_new`'s rank column; 0 where none. */
  | { readonly kind: 'spellRank'; readonly id: number }
  /** The spell's own cast time in milliseconds, from `spell_new`. */
  | { readonly kind: 'spellCastingTime'; readonly id: number }
  /** What the spell book's card says about a spell besides its words. */
  | { readonly kind: 'spellStats'; readonly id: number }
  /** The visual id a spell's row names; 0 for none. */
  | { readonly kind: 'spellVisualOf'; readonly id: number }
  /** An item's class and subclass, for picking a combat animation. */
  | { readonly kind: 'itemWeaponClass'; readonly id: number }
  /** An item drawn in its hand, as attachments, by its entry; held for show, never worn. */
  | { readonly kind: 'heldItem'; readonly id: number }
  | { readonly kind: 'itemName'; readonly id: number }
  /** One line of the item string table, by its own string id. */
  | { readonly kind: 'itemText'; readonly id: number }
  /** Everything one spell visual id describes: states, effects and missile. */
  | { readonly kind: 'spellVisual'; readonly spellVisualId: number }
  /** One particle effect, by its `.beff` resource path. */
  | { readonly kind: 'effect'; readonly path: string }
  /** One interface movie (`IGM`, `LGM`, `store`) in interface terms. */
  | { readonly kind: 'uiSkin'; readonly movie: UiMovie }
  /** One interface bitmap by linkage name, retina rung first. */
  | {
      readonly kind: 'uiIcon';
      readonly name: string;
      /** The sheet's movie: names collide across movies (`zhanshi`). */
      readonly movie?: UiMovie;
    }
  /** The interface's words in the build's order; captions are quoted by number. */
  | { readonly kind: 'uiStrings' }
  /** The interface typefaces (body and title), read from the mounted build, never copied here. */
  | { readonly kind: 'uiFaces' }
  /**
   * The text of one GPU program stage the build ships, by its entry name.
   * Read out of the mounted build; never copied into this repository.
   */
  | { readonly kind: 'shaderText'; readonly name: string }
  /**
   * What an item is, by its entry: the quality that colours its name, the
   * level it asks for, and the string that describes it.
   */
  | { readonly kind: 'itemFacts'; readonly id: number }
  /** One named node's model-space transform (a mount's `Dummy_ride`). */
  | { readonly kind: 'attachPoint'; readonly path: string; readonly node: string }
  /** Loading art: a zone's map art, or the general splash; `maxSize` is what the caller can use (art ships at 512, 1024, 2048). */
  | {
      readonly kind: 'splash';
      readonly zoneId?: number;
      readonly maxSize?: number;
    };

export type ResourceKind = ResourceId['kind'];

/** The shipped interface movies, by their own file stem under `ui/`. */
export type UiMovie = 'IGM' | 'LGM' | 'store';

/** Narrow a ResourceId to one kind. */
export type IdOf<K extends ResourceKind> = Extract<ResourceId, { kind: K }>;

/**
 * Stable string key for an id. Used for cache lookup, in-flight de-duplication
 * and log lines. Must be deterministic: same id in, same key out.
 */
export function resourceKey(id: ResourceId): string {
  switch (id.kind) {
    case 'creatureName':
      return `creatureName:${id.id}`;
    case 'creatureEntryName':
      return `creatureEntryName:${id.entry}`;
    case 'spellText':
      return `spellText:${id.id}`;
    case 'spellName':
      return `spellName:${id.id}`;
    case 'questText':
      return `questText:${id.id}`;
    case 'spellIcon':
      return `spellIcon:${id.id}`;
    case 'itemIcon':
      return `itemIcon:${id.id}`;
    case 'topbarIcon':
      return `topbarIcon:${id.name}`;
    case 'classIcon':
      return `classIcon:${id.classId}`;
    case 'zoneIndex':
      return 'zoneIndex';
    case 'mountList':
      return 'mountList';
    case 'playableKinds':
      return 'playableKinds';
    case 'lookOptions':
      return `lookOptions:${id.model}`;
    case 'teleportStops':
      return 'teleportStops';
    case 'storageUpgrades':
      return 'storageUpgrades';
    case 'talents':
      return 'talents';
    case 'spellString':
      return `spellString:${id.id}`;
    case 'busRoutes':
      return 'busRoutes';
    case 'soundCatalogue':
      return 'soundCatalogue';
    case 'soundClip':
      return `soundClip:${id.path.toLowerCase()}`;
    case 'unitSounds':
      return `unitSounds:${id.entry}:${id.displayInfoId}:${id.race}:${id.gender}`;
    case 'gossipMenu':
      return `gossipMenu:${id.id}`;
    case 'npcGreeting':
      return `npcGreeting:${id.entry}`;
    case 'areaMap':
      return `areaMap:${id.zoneId}${id.routes ? ':routes' : ''}`;
    case 'areaLinks':
      return 'areaLinks';
    case 'minimap':
      return `minimap:${id.mapId}:${id.tx},${id.tz}`;
    case 'zone':
      return `zone:${id.zoneId}`;
    case 'tile':
      return `tile:${id.world ?? id.mapId}:${id.tx},${id.tz}`;
    case 'model':
      return `model:${id.path.toLowerCase()}`;
    case 'texture':
      return `texture:${id.ref}`;
    case 'avatar':
      return `avatar:${id.model}|${id.skin}|${id.face}|${id.hairStyle}|${id.hairColor}`;
    case 'networkAppearance':
      return (
        `networkAppearance:${id.entry}|${id.displayInfoId}|${id.race}|${id.gender}|` +
        `${id.skin}|${id.face}|${id.hairStyle}|${id.hairColor}|${id.animationId}|${id.equipment.join(',')}`
      );
    case 'staticObjectModel':
      return `staticObjectModel:${id.entry}`;
    case 'skeleton':
      return `skeleton:${id.path.toLowerCase()}`;
    case 'animation':
      return `animation:${id.path.toLowerCase()}@${id.modelPath.toLowerCase()}`;
    case 'animationName':
      return `animationName:${id.animationId}`;
    case 'visualWithEffect':
      return `visualWithEffect:${id.effectPath.toLowerCase()}`;
    case 'animationNamed':
      return `animationNamed:${id.name.toLowerCase()}`;
    case 'impactVisual':
      return `impactVisual:${id.file.toLowerCase()}`;
    case 'spellCastable':
      return `spellCastable:${id.id}`;
    case 'spellRank':
      return `spellRank:${id.id}`;
    case 'spellCastingTime':
      return `spellCastingTime:${id.id}`;
    case 'spellStats':
      return `spellStats:${id.id}`;
    case 'spellVisualOf':
      return `spellVisualOf:${id.id}`;
    case 'itemWeaponClass':
      return `itemWeaponClass:${id.id}`;
    case 'heldItem':
      return `heldItem:${id.id}`;
    case 'itemName':
      return `itemName:${id.id}`;
    case 'itemText':
      return `itemText:${id.id}`;
    case 'spellVisual':
      return `spellVisual:${id.spellVisualId}`;
    case 'splash':
      return `splash:${id.zoneId ?? 'default'}@${id.maxSize ?? 0}`;
    case 'uiSkin':
      return `uiSkin:${id.movie}`;
    case 'uiIcon':
      return `uiIcon:${id.movie ?? ''}:${id.name.toLowerCase()}`;
    case 'uiStrings':
      return 'uiStrings';
    case 'uiFaces':
      return 'uiFaces';
    case 'shaderText':
      return `shaderText:${id.name.toLowerCase()}`;
    case 'itemFacts':
      return `itemFacts:${id.id}`;
    case 'effect':
      return `effect:${id.path.toLowerCase()}`;
    case 'attachPoint':
      return `attachPoint:${id.path.toLowerCase()}@${id.node}`;
  }
}

export const zoneIndexId = (): IdOf<'zoneIndex'> => ({ kind: 'zoneIndex' });
export const mountListId = (): IdOf<'mountList'> => ({ kind: 'mountList' });

export const playableKindsId = (): IdOf<'playableKinds'> => ({ kind: 'playableKinds' });

export const lookOptionsId = (model: string): IdOf<'lookOptions'> => ({
  kind: 'lookOptions',
  model,
});
export const zoneId = (id: number): IdOf<'zone'> => ({ kind: 'zone', zoneId: id });
export const tileId = (mapId: number, tx: number, tz: number, world?: string): IdOf<'tile'> => ({
  kind: 'tile',
  mapId,
  tx,
  tz,
  ...(world ? { world } : {}),
});
export const modelId = (path: string): IdOf<'model'> => ({ kind: 'model', path });
export const textureId = (ref: string): IdOf<'texture'> => ({ kind: 'texture', ref });
export const teleportStopsId = (): IdOf<'teleportStops'> => ({ kind: 'teleportStops' });
export const storageUpgradesId = (): IdOf<'storageUpgrades'> => ({ kind: 'storageUpgrades' });
export const talentsId = (): IdOf<'talents'> => ({ kind: 'talents' });
export const spellStringId = (id: number): IdOf<'spellString'> => ({ kind: 'spellString', id });
export const busRoutesId = (): IdOf<'busRoutes'> => ({ kind: 'busRoutes' });
export const soundCatalogueId = (): IdOf<'soundCatalogue'> => ({ kind: 'soundCatalogue' });
export const soundClipId = (path: string): IdOf<'soundClip'> => ({ kind: 'soundClip', path });
export const unitSoundsId = (
  entry: number,
  displayInfoId: number,
  race = -1,
  gender = -1,
): IdOf<'unitSounds'> => ({ kind: 'unitSounds', entry, displayInfoId, race, gender });
export const gossipMenuId = (id: number): IdOf<'gossipMenu'> => ({ kind: 'gossipMenu', id });
export const npcGreetingId = (entry: number): IdOf<'npcGreeting'> => ({
  kind: 'npcGreeting',
  entry,
});
export const areaMapId = (zoneId: number, routes = false): IdOf<'areaMap'> =>
  routes ? { kind: 'areaMap', zoneId, routes } : { kind: 'areaMap', zoneId };
export const areaLinksId = (): IdOf<'areaLinks'> => ({ kind: 'areaLinks' });
export const minimapId = (mapId: number, tx: number, tz: number): IdOf<'minimap'> => ({
  kind: 'minimap',
  mapId,
  tx,
  tz,
});
export const spellNameId = (id: number): IdOf<'spellName'> => ({ kind: 'spellName', id });
/** What a spell does, in words, for a card that carries it. */
export const spellTextId = (id: number): IdOf<'spellText'> => ({ kind: 'spellText', id });
export const itemIconId = (id: number): IdOf<'itemIcon'> => ({ kind: 'itemIcon', id });
export const topbarIconId = (name: string): IdOf<'topbarIcon'> => ({ kind: 'topbarIcon', name });
export const classIconId = (classId: number): IdOf<'classIcon'> => ({ kind: 'classIcon', classId });
export const spellVisualId = (id: number): IdOf<'spellVisual'> => ({
  kind: 'spellVisual',
  spellVisualId: id,
});
export const spellCastingTimeId = (id: number): IdOf<'spellCastingTime'> => ({
  kind: 'spellCastingTime',
  id,
});
export const spellStatsId = (id: number): IdOf<'spellStats'> => ({ kind: 'spellStats', id });
export const spellVisualOfId = (id: number): IdOf<'spellVisualOf'> => ({
  kind: 'spellVisualOf',
  id,
});
export const itemWeaponClassId = (id: number): IdOf<'itemWeaponClass'> => ({
  kind: 'itemWeaponClass',
  id,
});
export const heldItemId = (id: number): IdOf<'heldItem'> => ({ kind: 'heldItem', id });
export const itemNameId = (id: number): IdOf<'itemName'> => ({ kind: 'itemName', id });
export const itemTextId = (id: number): IdOf<'itemText'> => ({ kind: 'itemText', id });

export interface AvatarLook {
  skin?: number;
  face?: number;
  hairStyle?: number;
  hairColor?: number;
}

export const skeletonId = (path: string): IdOf<'skeleton'> => ({ kind: 'skeleton', path });

export const animationId = (path: string, modelPath: string): IdOf<'animation'> => ({
  kind: 'animation',
  path,
  modelPath,
});
export const animationNameId = (id: number): IdOf<'animationName'> => ({
  kind: 'animationName',
  animationId: id,
});
export const visualWithEffectId = (effectPath: string): IdOf<'visualWithEffect'> => ({
  kind: 'visualWithEffect',
  effectPath,
});
export const animationNamedId = (name: string): IdOf<'animationNamed'> => ({
  kind: 'animationNamed',
  name,
});
export const impactVisualId = (file: string): IdOf<'impactVisual'> => ({
  kind: 'impactVisual',
  file,
});

export const avatarLookId = (model: string, look: AvatarLook = {}): IdOf<'avatar'> => ({
  kind: 'avatar',
  model,
  skin: look.skin ?? 1,
  face: look.face ?? 1,
  hairStyle: look.hairStyle ?? 2,
  hairColor: look.hairColor ?? 1,
});
export const networkAppearanceId = (
  appearance: Omit<IdOf<'networkAppearance'>, 'kind'>,
): IdOf<'networkAppearance'> => ({ kind: 'networkAppearance', ...appearance });
export const staticObjectModelId = (entry: number): IdOf<'staticObjectModel'> => ({
  kind: 'staticObjectModel',
  entry,
});

export const uiSkinId = (movie: UiMovie): IdOf<'uiSkin'> => ({ kind: 'uiSkin', movie });
export const uiIconId = (name: string, movie?: UiMovie): IdOf<'uiIcon'> => ({
  kind: 'uiIcon',
  name,
  ...(movie ? { movie } : {}),
});
export const uiStringsId = (): IdOf<'uiStrings'> => ({ kind: 'uiStrings' });
export const uiFacesId = (): IdOf<'uiFaces'> => ({ kind: 'uiFaces' });
export const shaderTextId = (name: string): IdOf<'shaderText'> => ({ kind: 'shaderText', name });
export const itemFactsId = (entry: number): IdOf<'itemFacts'> => ({ kind: 'itemFacts', id: entry });

export const splashId = (zoneId?: number, maxSize?: number): IdOf<'splash'> => ({
  kind: 'splash',
  zoneId,
  maxSize,
});
export const effectId = (path: string): IdOf<'effect'> => ({ kind: 'effect', path });
export const attachPointId = (path: string, node: string): IdOf<'attachPoint'> => ({
  kind: 'attachPoint',
  path,
  node,
});
