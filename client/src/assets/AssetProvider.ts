/** AssetProvider: one interface, one loading method (ResourceIds only above
 * this line; PackAssetProvider-in-Worker is the only implementation). */

import type { IdOf, ResourceId, ResourceKind } from './ids';
import type { ResourceTypes } from './types';
import type { SpellVisualData } from './formats/tables';

/**
 * A mountable body of game data (an .ipa or an extracted build). On the
 * interface so the boot UI never branches on provider type.
 */
export interface AssetSource {
  /** Opaque handle the provider understands (a path, a file id, a hash). */
  id: string;
  /** Human-readable label for the picker. */
  label: string;
  /** Detected game build, when the provider can tell. */
  version?: string;
  sizeBytes?: number;
}

export interface AssetProvider {
  /** For logs and diagnostics. */
  readonly name: string;

  /** Connect / warm up. Cheap and idempotent. Throws if unusable. */
  init(): Promise<void>;

  /** Sources this provider can serve from right now. */
  listSources(): Promise<AssetSource[]>;

  /** The source currently mounted, or null if none. */
  currentSource(): AssetSource | null;

  /** Mount a source. Invalidates anything cached from a previous source. */
  useSource(id: string): Promise<AssetSource>;

  /**
   * Produce one resource.
   *
   * Throws ResourceNotFoundError when the resource genuinely is not in the
   * mounted data, ResourceError for transport/decode failures, and
   * ProviderNotReadyError when no source is mounted.
   */
  load<K extends ResourceKind>(id: IdOf<K>): Promise<ResourceTypes[K]>;
  creatureName(id: number): Promise<string | null>;
  /** A creature's own name by its entry, for a body the server named by entry alone. */
  creatureEntryName(entry: number): Promise<string | null>;
  spellName(id: number): Promise<string | null>;
  /** What a spell does, in words — the line a card writes for an item that carries it. */
  spellText(id: number): Promise<string | null>;
  questText(id: number): Promise<string | null>;
  spellIcon(id: number): Promise<ImageBitmap | null>;
  itemIcon(entry: number): Promise<ImageBitmap | null>;
  /** One of the target toolbar's action icons, by our own name for it. */
  topbarIcon(name: string): Promise<ImageBitmap | null>;
  /** A player class's badge picture, by the game's class number. */
  classIcon(classId: number): Promise<ImageBitmap | null>;
  /** Everything one spell visual id describes, in a single read. */
  spellVisual(spellVisualId: number): Promise<SpellVisualData | null>;
  spellCastingTime(spellId: number): Promise<number>;
  /**
   * The spell visual id a spell's own row names, or 0 when it names none.
   *
   * The pointer, not the row: feed the answer to `spellVisual` for what it
   * describes.
   */
  spellVisualOf(spellId: number): Promise<number>;
  itemWeaponClass(entry: number): Promise<{ itemClass: number; subClass: number }>;
  itemName(id: number): Promise<string | null>;
  /**
   * One line of the item string table by string id — an item's description,
   * or a name when the caller already holds the string id rather than the
   * entry. `itemName` goes through the entry; this does not.
   */
  itemText(id: number): Promise<string | null>;

  /** Release connections/workers. Safe to call twice. */
  dispose(): void;
}

export type { ResourceId };
