/** Browser-side processed-resource cache (tiny interface: memory today,
 * IndexedDB tomorrow). Hit = sourceFingerprint + schemaVersion + key. */

// 2: `ZoneData` lost its terrain and placements, `ZoneInfo` gained an
// atmosphere, and the `collision` kind is gone — it ships inside `TileData`.
// 3: `MeshData.indices` is 16-bit where it fits, so a stored entry from an
// earlier version carries a wider array than the current reader produces.
export const CACHE_SCHEMA_VERSION = 3;

export interface ResourceCache {
  /** Scope subsequent operations to one source. Clears entries from others. */
  open(sourceFingerprint: string, schemaVersion: number): Promise<void>;
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Session-lifetime cache. This is what makes repeated loads of the same model
 * free within a session; persistence across reloads is the IndexedDB
 * implementation's job (Phase 5) and slots in behind this same interface.
 */
export class MemoryResourceCache implements ResourceCache {
  private entries = new Map<string, unknown>();
  private scope = '';

  async open(sourceFingerprint: string, schemaVersion: number): Promise<void> {
    const scope = `${sourceFingerprint}#${schemaVersion}`;
    if (scope !== this.scope) {
      this.entries.clear();
      this.scope = scope;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.entries.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.entries.set(key, value);
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}
