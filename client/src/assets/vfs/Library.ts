/** Mounted .ipa as a flat asset namespace (packs opened on demand, cached
 * by PackStore; central directories only up front). */

import { logger } from '../../core/log';
import { type ByteSource, blobSource } from './ByteSource';
import { StorageQuotaError, PackStore, listCachedBuilds, type ProgressFn } from './PackStore';
import { PackReader, type PackEntry } from './zip';

const log = logger('library');

/**
 * Packs the client mounts, earliest first. Anything else ending in .bin is
 * picked up too.
 */
export const KNOWN_PACK_ORDER = [
  'res.bin',
  'res_t.bin',
  'tables.bin',
  'sound.bin',
  'model_phy.bin',
  'conf.bin',
];

/** Model texture refs are not pack paths; basenames are effectively unique (37 collisions in 5,625, all UI icons). */
const TEXTURE_PACKS = ['res.bin', 'res_t.bin'];
const TEXTURE_EXT = ['.tga', '.png', '.pvr'];
/** A TrueType or OpenType file, single or a collection. */
const TYPEFACE_FILE = /\.(ttf|otf|ttc)$/i;

export interface PackInfo {
  name: string;
  /** Size once inflated. */
  size: number;
  compressedSize: number;
  /** True once this pack has been opened in this session. */
  open: boolean;
}

export interface LibraryInfo {
  label: string;
  sizeBytes: number;
  /** Build version parsed from the bundle, when it can be told. */
  version?: string;
  packs: PackInfo[];
}

export class Library {
  private readonly packs = new Map<string, PackReader>();
  /** The .ipa behind a stored mount, for packs never extracted; without it an unvisited map loads empty. */
  private ipaFallback: Library | null = null;
  /** Storage holds every pack (a finished `extractAll`, or a matching manifest). */
  private complete = false;
  private readonly opening = new Map<string, Promise<PackReader>>();
  private readonly members = new Map<string, PackEntry>();
  private readonly loose = new Map<string, PackEntry>();
  /** Not ZIP-shaped despite `.bin` (`res_i.bin`, `res_t_i.bin`), so they are not re-extracted per request. */
  private readonly bad = new Set<string>();
  private textureIndex: Map<string, [string, string]> | null = null;

  private constructor(
    private readonly ipa: PackReader,
    private readonly store: PackStore,
    readonly label: string,
    readonly sizeBytes: number,
    private onProgress?: ProgressFn,
  ) {}

  /** Mount a picked file: an .ipa, or one extracted pack, which mounts instantly. */
  static async mount(file: File, onProgress?: ProgressFn): Promise<Library> {
    const source = blobSource(file);
    const reader = await PackReader.open(source, file.name);

    // A cache key that changes when the file does, without hashing 1.6 GB.
    const key = `${sanitise(file.name)}-${file.size}`;
    const store = new PackStore(key);
    const lib = new Library(reader, store, file.name, file.size, onProgress);
    lib.scan();

    if (lib.members.size === 0) {
      throw new Error(`${file.name}: no .bin packs inside — is this an .ipa?`);
    }
    log.info(`mounted ${file.name}: ${lib.members.size} packs, ${lib.loose.size} loose files`);
    return lib;
  }

  /** Mount extracted packs directly, each under its own basename (registering all as `res.bin` would keep only the last). */
  static async mountPacks(files: File[]): Promise<Library> {
    if (files.length === 0) throw new Error('no packs given');

    const total = files.reduce((n, f) => n + f.size, 0);
    const label =
      files.length === 1
        ? files[0].name
        : `${files.length} packs (${files.map(f => f.name).join(', ')})`;
    const key = files.map(f => `${sanitise(f.name)}-${f.size}`).join('+');

    // Not everything handed over is a pack. A folder of extracted files can
    // include Apple's zip metadata, and one unreadable file must not fail the
    // whole mount — it is skipped, exactly as the .ipa path skips it.
    const readers = new Map<string, PackReader>();
    for (const file of files) {
      const name = basename(file.name).toLowerCase();
      try {
        readers.set(name, await PackReader.open(blobSource(file), name));
      } catch (err) {
        log.warn(`${name} is not a readable pack, skipping: ${String(err)}`);
      }
    }
    if (!readers.size) throw new Error('none of those files is a readable pack');

    // The first readable pack stands in as the container for `info()`; nothing
    // is ever materialised out of it, because these are already extracted.
    const first = [...readers.values()][0];
    const lib = new Library(first, new PackStore(key), label, total);
    for (const [name, reader] of readers) {
      lib.packs.set(name, reader);
      log.info(`${name}: ${reader.length} entries`);
    }
    return lib;
  }

  /** Attach an .ipa to a stored mount; what is missing extracts on demand. */
  async attachIpa(file: File, onProgress?: ProgressFn): Promise<void> {
    const ipa = await Library.mount(file, onProgress);
    this.ipaFallback = ipa;
    const extra = ipa.packNames().filter(n => !this.packs.has(n));
    log.info(`attached ${file.name}: ${extra.length} further packs available`);
  }

  /** Is there an .ipa behind this library for packs not yet extracted? */
  get hasIpa(): boolean {
    return this.ipaFallback !== null || this.members.size > 0;
  }

  /** Mount one extracted pack. */
  static mountPack(file: File): Promise<Library> {
    return Library.mountPacks([file]);
  }

  /** Mount a build already in browser storage; no picker, no extraction. */
  static async mountCached(key: string): Promise<Library> {
    const build = (await listCachedBuilds()).find(b => b.key === key);
    if (!build) throw new Error(`no extracted build named ${key}`);
    const store = new PackStore(key);

    // Open every pack first: an out-of-quota extraction leaves a truncated
    // file. A bad one is deleted so the next attempt re-extracts it.
    const files: File[] = [];
    const broken: string[] = [];
    for (const { name } of build.packs) {
      const file = await store.cachedPack(name);
      if (!file) continue;
      try {
        await PackReader.open(blobSource(file), name);
        files.push(new File([file], name));
      } catch (err) {
        broken.push(name);
        log.warn(`${key}/${name} is unusable (${String(err)}) — discarding it`);
        await store.remove(name);
      }
    }

    // A broken pack leaves the build incomplete, a state that recovers;
    // throwing sent users back to the picker holding good packs.
    if (broken.length) {
      log.warn(
        `${broken.join(', ')} did not survive extraction and ` +
          `${broken.length === 1 ? 'has' : 'have'} been discarded`,
      );
    }
    if (!files.length) throw new Error(`${key} has no readable packs in storage`);

    // Without these there is no game to start: tables names every zone and
    // res holds the models. Anything else missing is a gap, not a failure.
    const have = new Set(files.map(f => f.name.toLowerCase()));
    const essential = ['tables.bin', 'res.bin'].filter(n => !have.has(n));
    if (essential.length) {
      throw new Error(
        `${key} is missing ${essential.join(' and ')}, ` +
          'so there is nothing to start from. Choose your .ipa to re-extract.',
      );
    }

    const lib = await Library.mountPacks(files);

    // A manifest naming only packs that are actually here means the build was
    // extracted whole and the game file is not needed again. Anything else —
    // no manifest, or one naming a pack that has since gone — leaves the
    // library incomplete, and the caller has to finish the job.
    const manifest = await store.readManifest();
    lib.complete =
      broken.length === 0 && manifest !== null && manifest.every(n => have.has(n.toLowerCase()));

    log.info(
      `mounted ${key} from storage: ${files.length} packs, ` +
        `${(build.totalBytes / 1e6).toFixed(0)} MB` +
        (lib.complete ? ', complete' : ' — incomplete, extraction unfinished'),
    );
    return lib;
  }

  private scan(): void {
    for (const entry of this.ipa.entries) {
      if (entry.isDir) continue;
      const base = basename(entry.name).toLowerCase();
      if (base.endsWith('.bin') && isGamePack(entry.name)) {
        this.members.set(base, entry);
      } else {
        // Everything else in the .app bundle: icons, fonts, plists, the
        // Mach-O binary, the intro video — and Apple's zip metadata.
        this.loose.set(entry.name, entry);
      }
    }
  }

  info(): LibraryInfo {
    const packs: PackInfo[] = this.packNames().map(name => {
      // A pack mounted as a file of its own has no entry in a game file
      // to give its size: it is open, and that is all there is to say
      // about it.
      const entry = this.members.get(name);
      return {
        name,
        size: entry?.size ?? 0,
        compressedSize: entry?.compSize ?? 0,
        open: this.packs.has(name),
      };
    });
    return {
      label: this.label,
      sizeBytes: this.sizeBytes,
      version: /-(\d+\.\d+\.\d+)-/.exec(this.label)?.[1],
      packs,
    };
  }

  /** Every pack openable, from the game file and already open: a folder mount has no members. */
  packNames(): string[] {
    const every = new Set([...this.members.keys(), ...this.packs.keys()]);
    return [...every].sort((a, b) => {
      const ai = KNOWN_PACK_ORDER.indexOf(a);
      const bi = KNOWN_PACK_ORDER.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0) return -1;
      if (bi >= 0) return 1;
      return a.localeCompare(b);
    });
  }

  hasPack(name: string): boolean {
    const key = name.toLowerCase();
    return (
      this.members.has(key) || this.packs.has(key) || (this.ipaFallback?.hasPack(key) ?? false)
    );
  }

  /** Open a pack, extracting it once; concurrent callers share one extraction. */
  async pack(name: string): Promise<PackReader> {
    const key = name.toLowerCase();
    const open = this.packs.get(key);
    if (open) return open;

    const pending = this.opening.get(key);
    if (pending) return pending;

    if (this.bad.has(key)) throw new Error(`${key} is not a readable pack`);

    const entry = this.members.get(key);
    if (!entry) {
      // Not in this library. If an .ipa is attached it can still be extracted
      // from there — that is the whole point of keeping it around.
      if (this.ipaFallback?.hasPack(key)) {
        const reader = await this.ipaFallback.pack(key);
        this.packs.set(key, reader);
        return reader;
      }
      throw new Error(`no such pack: ${name}`);
    }

    const task = (async () => {
      try {
        const source = await this.store.open(this.ipa, entry, key, this.onProgress);
        const reader = await PackReader.open(source, key);
        this.packs.set(key, reader);
        log.info(`${key}: ${reader.length} entries`);
        return reader;
      } catch (err) {
        // Remember, so the next caller does not pay the extraction again to
        // reach the same conclusion.
        this.bad.add(key);
        log.warn(`${key} is not a readable pack: ${String(err)}`);
        throw err;
      } finally {
        this.opening.delete(key);
      }
    })();
    this.opening.set(key, task);
    return task;
  }

  /** Extract several packs at once; a failure does not fail the batch. */
  async prefetch(names: string[]): Promise<void> {
    const wanted = names.filter(n => this.hasPack(n) && !this.bad.has(n.toLowerCase()));
    if (!wanted.length) return;
    const started = performance.now();
    await Promise.all(wanted.map(n => this.pack(n).catch(() => null)));
    log.info(
      `prefetched ${wanted.length} packs in ` +
        `${((performance.now() - started) / 1000).toFixed(1)}s`,
    );
  }

  /** The iOS launch image (real PNGs, loose in the `.app`), landscape and @2x first; the fallback map art. */
  async launchImage(): Promise<{ name: string; bytes: Uint8Array } | null> {
    const wanted = [
      /Payload\/[^/]+\.app\/Default-Landscape@2x\.png$/i,
      /Payload\/[^/]+\.app\/Default-Landscape\.png$/i,
      /Payload\/[^/]+\.app\/Default@2x\.png$/i,
      /Payload\/[^/]+\.app\/Default-568h@2x\.png$/i,
      /Payload\/[^/]+\.app\/Default\.png$/i,
    ];
    for (const source of [this.ipa, this.ipaFallback?.ipa]) {
      if (!source) continue;
      for (const pattern of wanted) {
        const hit = source.entries.find(e => !e.isDir && pattern.test(e.name));
        if (!hit) continue;
        try {
          return { name: hit.name, bytes: await source.read(hit) };
        } catch (err) {
          log.debug(`could not read ${hit.name}: ${String(err)}`);
        }
      }
    }
    return null;
  }

  /** The `.app`'s typefaces, kept in storage too: a whole build never reopens the game file. */
  async typefaces(): Promise<Array<{ name: string; bytes: Uint8Array }>> {
    const out: Array<{ name: string; bytes: Uint8Array }> = [];
    const seen = new Set<string>();
    for (const source of [this.ipa, this.ipaFallback?.ipa]) {
      if (!source) continue;
      for (const entry of source.entries) {
        if (entry.isDir || !TYPEFACE_FILE.test(entry.name)) continue;
        const name = basename(entry.name);
        if (seen.has(name.toLowerCase())) continue;
        try {
          const bytes = await source.read(entry);
          seen.add(name.toLowerCase());
          out.push({ name, bytes });
          await this.store.writeTypeface(name, bytes);
        } catch (err) {
          log.debug(`could not read ${entry.name}: ${String(err)}`);
        }
      }
    }
    if (out.length) return out;
    return this.store.readTypefaces();
  }

  /** Where this build keeps its packs, and its decoded loading art. */
  get storage(): PackStore {
    return this.store;
  }

  /**
   * Does storage hold the whole build, so the game file is not needed? Not the
   * same question as `hasIpa`: a complete build has no file and needs none, so
   * keying boot on `hasIpa` prompts a healthy build for its `.ipa`.
   */
  get isComplete(): boolean {
    return this.complete;
  }

  /**
   * Extract every pack once, sequentially to bound peak memory. Up front
   * because a stored file handle comes back as 'prompt' after a restart and
   * needs a user gesture, so the .ipa cannot be reopened during boot.
   */
  async extractAll(
    opts: { skip?: readonly string[]; onPack?: (name: string, i: number, n: number) => void } = {},
  ): Promise<{ extracted: string[]; failed: string[] }> {
    const skip = new Set((opts.skip ?? []).map(n => n.toLowerCase()));
    const names = this.packNames().filter(n => !skip.has(n));

    // Nothing to extract *from*: this library was mounted over packs that are
    // already files. Claiming completeness here would write a manifest naming
    // no packs, which reads as "extracted whole" and is the opposite of true.
    if (!names.length) return { extracted: [], failed: [] };
    const extracted: string[] = [];
    const failed: string[] = [];

    // Byte progress comes from the store, which only knows about one pack.
    // Wrapping it here is what lets the screen say "0.6 of 1.5 GB" and "12 of
    // 41" as well as "45%", without any layer below learning about the batch.
    // The total is the inflated size, which is what actually gets written.
    const perPack = this.onProgress;
    const overallTotal = names.reduce((n, name) => n + (this.members.get(name)?.size ?? 0), 0);
    let overallBefore = 0;

    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      opts.onPack?.(name, i, names.length);
      const before = overallBefore;
      this.onProgress = perPack
        ? p =>
            perPack({
              ...p,
              index: i + 1,
              count: names.length,
              overallDone: before + p.done,
              overallTotal,
            })
        : undefined;
      try {
        await this.pack(name);
        extracted.push(name);
        overallBefore += this.members.get(name)?.size ?? 0;
      } catch (err) {
        // Out of quota is fatal for the rest: every remaining pack would fail
        // the same way, slowly. Anything else is only this pack's problem.
        if (err instanceof StorageQuotaError) throw err;
        failed.push(name);
        log.warn(`could not extract ${name}: ${String(err)}`);
      }
    }

    this.onProgress = perPack;

    // Only a clean run may claim the build is finished — a manifest naming a
    // pack that is not there is worse than no manifest at all.
    if (!failed.length) {
      await this.store.writeManifest(extracted);
      this.complete = true;
    }
    log.info(
      `extracted ${extracted.length}/${names.length} packs` +
        (failed.length ? `, ${failed.length} failed` : ''),
    );
    return { extracted, failed };
  }

  /** Packs that turned out not to be readable. */
  badPacks(): string[] {
    return [...this.bad];
  }

  /** Read one entry from one pack. */
  async read(packName: string, entryName: string): Promise<Uint8Array> {
    return (await this.pack(packName)).read(entryName);
  }

  /** Read an entry from whichever of `packs` has it. */
  async readFirst(packs: readonly string[], entryName: string): Promise<Uint8Array | null> {
    for (const name of packs) {
      if (!this.hasPack(name) || this.bad.has(name.toLowerCase())) continue;
      let reader;
      try {
        reader = await this.pack(name);
      } catch {
        continue; // Not a readable pack; `pack()` has already said so once.
      }
      const entry = reader.get(entryName);
      if (entry) return reader.read(entry);
    }
    return null;
  }

  // — textures --------------------------------------------------------

  private async buildTextureIndex(): Promise<Map<string, [string, string]>> {
    if (this.textureIndex) return this.textureIndex;
    const idx = new Map<string, [string, string]>();
    for (const packName of TEXTURE_PACKS) {
      if (!this.hasPack(packName)) continue;
      const reader = await this.pack(packName);
      for (const e of reader.entries) {
        if (e.isDir) continue;
        const lower = e.name.toLowerCase();
        if (!TEXTURE_EXT.some(ext => lower.endsWith(ext))) continue;
        const base = lower.split('/').pop()!;
        if (!idx.has(base)) idx.set(base, [packName, e.name]);
      }
    }
    this.textureIndex = idx;
    log.debug(`texture index: ${idx.size} distinct basenames`);
    return idx;
  }

  /** Map a model's texture reference to [pack, entry]. Null if missing. */
  async resolveTexture(ref: string): Promise<[string, string] | null> {
    if (!ref) return null;
    const path = ref.replace(/\\/g, '/');

    for (const packName of TEXTURE_PACKS) {
      if (!this.hasPack(packName)) continue;
      const reader = await this.pack(packName);
      if (reader.has(path)) return [packName, path];
    }

    const idx = await this.buildTextureIndex();
    let base = (path.split('/').pop() ?? path).toLowerCase();
    const direct = idx.get(base);
    if (direct) return direct;

    // A handful of references were written as URIs by the exporter, so spaces
    // in the artist's filename arrive percent-encoded: the shipped file is
    // "devil list_3_blue.tga" but the model asks for "devil%20list_3_blue.tga".
    if (base.includes('%')) {
      const unquoted = safeDecode(base);
      const hit = idx.get(unquoted);
      if (hit) return hit;
      base = unquoted;
    }

    // Models sometimes reference the artist's source file; the shipped asset
    // is the same name with a texture extension.
    const stem = base.replace(/\.[^./]*$/, '');
    for (const ext of TEXTURE_EXT) {
      const hit = idx.get(stem + ext);
      if (hit) return hit;
    }
    return null;
  }

  /** Resolve without awaiting; null until the index is warm, so warming is not optional. */
  resolveTextureSync(ref: string): [string, string] | null {
    if (!ref || !this.textureIndex) return null;
    const path = ref.split('\\').join('/');
    let base = (path.split('/').pop() ?? path).toLowerCase();
    const direct = this.textureIndex.get(base);
    if (direct) return direct;
    if (base.includes('%')) {
      const unquoted = safeDecode(base);
      const hit = this.textureIndex.get(unquoted);
      if (hit) return hit;
      base = unquoted;
    }
    const stem = base.replace(/\.[^./]*$/, '');
    for (const ext of TEXTURE_EXT) {
      const hit = this.textureIndex.get(stem + ext);
      if (hit) return hit;
    }
    return null;
  }

  /** Every texture's file name, lower-cased, across the texture packs. */
  async textureNames(): Promise<Iterable<string>> {
    return (await this.buildTextureIndex()).keys();
  }

  /** Build the texture index if it is not built yet. */
  async warmTextureIndex(): Promise<void> {
    await this.buildTextureIndex();
  }

  async readTexture(ref: string): Promise<{ pack: string; entry: string; bytes: Uint8Array }> {
    const hit = await this.resolveTexture(ref);
    if (!hit) throw new Error(`no such texture: ${ref}`);
    const [packName, entryName] = hit;
    return { pack: packName, entry: entryName, bytes: await this.read(packName, entryName) };
  }

  /** Discard every cached pack for this build. */
  clearCache(): Promise<void> {
    return this.store.clear();
  }

  dispose(): void {
    this.ipaFallback?.dispose();
    this.ipaFallback = null;
    this.packs.clear();
    this.opening.clear();
    this.textureIndex = null;
  }
}

/** Game pack test: Payload/<app>/<pack>.bin (excludes META-INF index). */
function isGamePack(path: string): boolean {
  const lower = path.toLowerCase().split('\\').join('/');
  if (lower.startsWith('meta-inf/')) return false;
  // Payload/<something>.app/<pack>.bin — one level inside the bundle.
  return /(^|\/)payload\/[^/]+\.app\/[^/]+\.bin$/.test(lower);
}

function basename(path: string): string {
  const parts = path.split(/[\/]/);
  return parts[parts.length - 1] || path;
}

function sanitise(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export type { ByteSource };
