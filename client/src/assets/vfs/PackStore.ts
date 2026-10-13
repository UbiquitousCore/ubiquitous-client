/** Inflated-pack storage in origin-private FS (paid once per build, found
 * next time; nothing materialised up front). */

import { logger } from '../../core/log';
import { type ByteSource, blobSource, sliceSource } from './ByteSource';
import { METHOD_STORE, type PackEntry, type PackReader } from './zip';

const log = logger('packstore');

export interface MaterialiseProgress {
  pack: string;
  /** Bytes written so far, and the total expected. */
  done: number;
  total: number;
  /** Which pack of how many, during a whole-build extraction. */
  index?: number;
  count?: number;
  /** Bytes done and expected across the whole build, not just this pack. */
  overallDone?: number;
  overallTotal?: number;
}

export type ProgressFn = (p: MaterialiseProgress) => void;

/**
 * OPFS needs a secure context: over LAN `http://` packs re-extract on every
 * reload, so `whyNoStorage` says why. Without OPFS, packs live in memory.
 */
export async function opfsAvailable(): Promise<boolean> {
  try {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.storage?.getDirectory &&
      !!(await navigator.storage.getDirectory())
    );
  } catch {
    return false;
  }
}

/**
 * Why storage is unavailable, in terms that name the fix. Null when it works.
 */
export async function whyNoStorage(): Promise<string | null> {
  if (await opfsAvailable()) return null;
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    const origin = window.location.origin;
    return (
      `${origin} is not a secure context, so the browser gives this page ` +
      'no persistent storage. Nothing can be cached and the game will be ' +
      're-extracted on every reload.\n\n' +
      'Only https:// and localhost count.\n\n' +
      'Fixes, easiest first:\n' +
      '  1. Open it on the machine running the server, as http://localhost\n' +
      '  2. In Chrome: chrome://flags/#unsafely-treat-insecure-origin-as-secure,\n' +
      `     add ${origin}, set Enabled, relaunch\n` +
      '  3. Serve the client over https'
    );
  }
  return (
    'This browser gives the page no persistent storage (a private window ' +
    'will do that), so the game will be re-extracted on every reload.'
  );
}

/** One build already extracted to storage, and what is in it. */
export interface CachedBuild {
  key: string;
  packs: Array<{ name: string; size: number }>;
  totalBytes: number;
}

/** Builds already extracted here, offered so a returning player never sees the picker. */
export async function listCachedBuilds(): Promise<CachedBuild[]> {
  const root = await rootDir();
  if (!root) return [];
  const out: CachedBuild[] = [];
  try {
    // `entries()` is async-iterable on the directory handle.
    const dir = root as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
    };
    for await (const [key, handle] of dir.entries()) {
      if (handle.kind !== 'directory') continue;
      const packs: Array<{ name: string; size: number }> = [];
      const sub = handle as unknown as {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      };
      for await (const [name, entry] of sub.entries()) {
        if (entry.kind !== 'file' || !name.endsWith('.bin')) continue;
        const file = await (entry as FileSystemFileHandle).getFile();
        packs.push({ name, size: file.size });
      }
      if (packs.length) {
        packs.sort((a, b) => a.name.localeCompare(b.name));
        out.push({
          key,
          packs,
          totalBytes: packs.reduce((n, p) => n + p.size, 0),
        });
      }
    }
  } catch (err) {
    log.warn(`could not list cached builds: ${String(err)}`);
  }
  return out.sort((a, b) => b.totalBytes - a.totalBytes);
}

export class StorageQuotaError extends Error {
  constructor(needed: number, available: number) {
    super(
      'not enough browser storage: this build needs about ' +
        `${(needed / 1e9).toFixed(1)} GB and only ` +
        `${(available / 1e9).toFixed(1)} GB is available. Free some disk space, ` +
        'or clear other site data, and reload.',
    );
    this.name = 'StorageQuotaError';
  }
}

/** Persistent-storage request (once; eviction otherwise means re-extract). */
let persistRequested: Promise<boolean> | null = null;

export function requestPersistentStorage(): Promise<boolean> {
  persistRequested ??= (async () => {
    try {
      if (!navigator.storage?.persist) return false;
      if (await navigator.storage.persisted?.()) return true;
      const granted = await navigator.storage.persist();
      log.info(
        granted
          ? 'storage marked persistent'
          : 'storage is best-effort; extracted packs may be evicted',
      );
      return granted;
    } catch {
      return false;
    }
  })();
  return persistRequested;
}

/** Delete every extracted pack; Chrome's "Clear site data" does not reliably clear OPFS. */
export async function clearAllPacks(): Promise<void> {
  try {
    const root = await navigator.storage?.getDirectory?.();
    if (!root) return;
    await root.removeEntry('ubiquitous-packs', { recursive: true });
    log.info('cleared every extracted pack');
  } catch (err) {
    // Nothing there is the usual reason.
    log.debug(`nothing to clear: ${String(err)}`);
  }
}

/** What the browser will let this origin store, and what it already uses. */
export async function storageEstimate(): Promise<{ quota: number; usage: number }> {
  try {
    const e = await navigator.storage?.estimate?.();
    return { quota: e?.quota ?? 0, usage: e?.usage ?? 0 };
  } catch {
    return { quota: 0, usage: 0 };
  }
}

/** Written once a build has been extracted whole. Not a pack; never mounted. */
const MANIFEST = '.extracted.json';

const splashName = (topZoneId: number): string => `splash-${topZoneId}.webp`;

/**
 * A typeface kept beside the packs. Prefixed so a listing can tell it from
 * a pack or loading art, and so no bundle file name can collide with either.
 */
const TYPEFACE_PREFIX = 'typeface-';

export class PackStore {
  /** `key` identifies the mounted build; packs from different .ipas never mix. */
  constructor(readonly key: string) {}

  /** A pack already in storage, or null. */
  async cachedPack(name: string): Promise<File | null> {
    const dir = await this.dir();
    if (!dir) return null;
    try {
      return await (await dir.getFileHandle(name)).getFile();
    } catch {
      return null;
    }
  }

  /** Delete one pack from storage, so a broken one is not offered again. */
  async remove(name: string): Promise<void> {
    const dir = await this.dir();
    if (!dir) return;
    try {
      await dir.removeEntry(name);
      log.warn(`${name}: removed from storage`);
    } catch {
      // Already gone.
    }
  }

  /** Record the build as extracted whole; without the manifest every start keeps the file on hand. */
  async writeManifest(names: readonly string[]): Promise<void> {
    const dir = await this.dir();
    if (!dir) return;
    try {
      const handle = await dir.getFileHandle(MANIFEST, { create: true });
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify({ version: 1, packs: [...names] }));
      await writable.close();
    } catch (err) {
      // Not fatal: the build still works, it just cannot prove it is complete.
      log.warn(`could not write the extraction manifest: ${String(err)}`);
    }
  }

  /** The pack list this build was extracted with, or null if never finished. */
  async readManifest(): Promise<string[] | null> {
    const dir = await this.dir();
    if (!dir) return null;
    try {
      const file = await (await dir.getFileHandle(MANIFEST)).getFile();
      const parsed = JSON.parse(await file.text()) as { packs?: unknown };
      return Array.isArray(parsed.packs) ? (parsed.packs as string[]) : null;
    } catch {
      return null;
    }
  }

  /** Loading art decoded once at extraction (per top zone), ready to show. */
  async writeSplash(topZoneId: number, blob: Blob): Promise<void> {
    const dir = await this.dir();
    if (!dir) return;
    try {
      const handle = await dir.getFileHandle(splashName(topZoneId), { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (err) {
      log.warn(`could not store loading art for zone ${topZoneId}: ${String(err)}`);
    }
  }

  /** Every piece of loading art in storage, by top zone id. */
  async readSplashes(): Promise<Array<[number, Blob]>> {
    const dir = await this.dir();
    if (!dir) return [];
    const out: Array<[number, Blob]> = [];
    try {
      const entries = dir as unknown as {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      };
      for await (const [name, handle] of entries.entries()) {
        const match = /^splash-(\d+)\.webp$/.exec(name);
        if (!match || handle.kind !== 'file') continue;
        out.push([Number(match[1]), await (handle as FileSystemFileHandle).getFile()]);
      }
    } catch (err) {
      log.debug(`could not read stored loading art: ${String(err)}`);
    }
    return out;
  }

  /**
   * Keep one of the bundle's typefaces beside the packs.
   *
   * The typefaces are loose files in the bundle, not pack members, so a
   * build that no longer needs the game file would otherwise have none.
   */
  async writeTypeface(name: string, bytes: Uint8Array): Promise<void> {
    const dir = await this.dir();
    if (!dir) return;
    try {
      const handle = await dir.getFileHandle(TYPEFACE_PREFIX + name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(bytes as unknown as BufferSource);
      await writable.close();
    } catch (err) {
      log.warn(`could not store typeface ${name}: ${String(err)}`);
    }
  }

  /** Every typeface kept by `writeTypeface`, by the file name it had in the bundle. */
  async readTypefaces(): Promise<Array<{ name: string; bytes: Uint8Array }>> {
    const dir = await this.dir();
    if (!dir) return [];
    const out: Array<{ name: string; bytes: Uint8Array }> = [];
    try {
      const entries = dir as unknown as {
        entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
      };
      for await (const [name, handle] of entries.entries()) {
        if (!name.startsWith(TYPEFACE_PREFIX) || handle.kind !== 'file') continue;
        const file = await (handle as FileSystemFileHandle).getFile();
        out.push({
          name: name.slice(TYPEFACE_PREFIX.length),
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      }
    } catch (err) {
      log.debug(`could not read stored typefaces: ${String(err)}`);
    }
    return out;
  }

  /** Every pack this build has in storage. */
  async cachedNames(): Promise<string[]> {
    const builds = await listCachedBuilds();
    return builds.find(b => b.key === this.key)?.packs.map(p => p.name) ?? [];
  }

  /** A seekable pack: stored in the .ipa (in place), already in OPFS, or inflated into OPFS (or memory). */
  async open(
    ipa: PackReader,
    entry: PackEntry,
    name: string,
    onProgress?: ProgressFn,
  ): Promise<ByteSource> {
    if (entry.method === METHOD_STORE) {
      // Nothing to inflate: address the member where it lies.
      const { at } = await ipa.dataOffset(entry);
      log.debug(`${name}: stored in the .ipa, addressing in place`);
      return sliceSource(ipa.source, at, entry.size);
    }

    const dir = await this.dir();
    if (dir) {
      const existing = await this.cached(dir, name, entry.size);
      if (existing) {
        log.info(`${name}: ${mb(entry.size)} MB from storage`);
        return blobSource(existing);
      }

      await requestPersistentStorage();
      const { quota, usage } = await storageEstimate();
      const free = quota - usage;
      // Refuse early and legibly rather than failing half way through a
      // 654 MB write, which leaves a partial file and a confusing error.
      if (quota > 0 && free < entry.size * 1.1) {
        throw new StorageQuotaError(entry.size, free);
      }

      const file = await this.materialise(dir, ipa, entry, name, onProgress);
      if (file) return blobSource(file);
      // materialise() only returns null after logging why. If it was the
      // quota, say so plainly instead of trying the same bytes in memory.
      const after = await storageEstimate();
      if (after.quota > 0 && after.quota - after.usage < entry.size) {
        throw new StorageQuotaError(entry.size, after.quota - after.usage);
      }
    }

    // No storage at all: hold it in memory for this session. Fine for a small
    // pack, and the only option for one; a 654 MB pack this way is a last
    // resort and says so.
    const level = entry.size > 128e6 ? log.warn : log.info;
    level(`${name}: no persistent storage, inflating ${mb(entry.size)} MB into memory`);
    const bytes = await ipa.read(entry);
    onProgress?.({ pack: name, done: bytes.length, total: entry.size });
    return blobSource(new Blob([bytes as BlobPart]));
  }

  /** Drop every cached pack for this build. */
  async clear(): Promise<void> {
    const root = await rootDir();
    if (!root) return;
    try {
      await root.removeEntry(this.key, { recursive: true });
    } catch {
      // Nothing cached yet, which is not a failure.
    }
  }

  private async dir(): Promise<FileSystemDirectoryHandle | null> {
    const root = await rootDir();
    if (!root) return null;
    try {
      return await root.getDirectoryHandle(this.key, { create: true });
    } catch (err) {
      log.warn(`storage unavailable: ${String(err)}`);
      return null;
    }
  }

  /**
   * A previously materialised pack, if it is there and the right size.
   *
   * The size check is what makes a half-written file from an interrupted
   * session harmless: it will not match, so it is written again.
   */
  private async cached(
    dir: FileSystemDirectoryHandle,
    name: string,
    expect: number,
  ): Promise<File | null> {
    try {
      const handle = await dir.getFileHandle(name);
      const file = await handle.getFile();
      if (file.size === expect) return file;
      log.warn(`${name}: cached copy is ${file.size} bytes, expected ${expect} -- re-extracting`);
    } catch {
      // Not cached.
    }
    return null;
  }

  private async materialise(
    dir: FileSystemDirectoryHandle,
    ipa: PackReader,
    entry: PackEntry,
    name: string,
    onProgress?: ProgressFn,
  ): Promise<File | null> {
    // `createWritable()` buffers into a swap file and only replaces the real
    // one on `close()`, so an interrupted extraction leaves nothing behind
    // that could be mistaken for a finished pack. The size check on the way
    // back in catches anything that slips through anyway.
    const started = performance.now();
    try {
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      const reader = (await ipa.stream(entry)).getReader();
      let done = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          await writable.write(chunk.value as BufferSource);
          done += chunk.value.length;
          onProgress?.({ pack: name, done, total: entry.size });
        }
      } catch (err) {
        await writable.abort();
        throw err;
      }
      await writable.close();

      const file = await (await dir.getFileHandle(name)).getFile();
      const secs = (performance.now() - started) / 1000;
      log.info(
        `${name}: extracted ${mb(file.size)} MB in ${secs.toFixed(1)}s` +
          ` (${(file.size / 1e6 / secs).toFixed(0)} MB/s)`,
      );
      return file;
    } catch (err) {
      log.warn(`${name}: could not cache to storage (${String(err)})`);
      try {
        await dir.removeEntry(name);
      } catch {
        // Already gone, or never created.
      }
      return null;
    }
  }
}

async function rootDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!navigator.storage?.getDirectory) return null;
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle('ubiquitous-packs', { create: true });
  } catch {
    return null;
  }
}

function mb(bytes: number): string {
  return (bytes / 1e6).toFixed(0);
}
