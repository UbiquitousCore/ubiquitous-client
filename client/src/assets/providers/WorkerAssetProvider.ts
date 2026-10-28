/** A thin proxy to `assetWorker.ts`, so decoding stays off the frame loop; no logic here. */

import { Limiter } from '../../core/limiter';
import { logger } from '../../core/log';
import { ProviderNotReadyError, ResourceError, ResourceNotFoundError } from '../../core/errors';
import type { AssetProvider, AssetSource } from '../AssetProvider';
import { areaMapId } from '../ids';
import type { IdOf, ResourceId, ResourceKind } from '../ids';
import type { ResourceTypes } from '../types';
import type { SpellVisualData } from '../formats/tables';
import type { ProgressFn } from '../vfs/PackStore';
import type { WorkerRequest, WorkerResponse } from '../worker/assetWorker';
import { ResourceUnsupportedError } from './PackAssetProvider';

const log = logger('worker-provider');

/** Own choice: as many as `MaterialCache` keeps in flight, so none of its fetches waits here. */
export const TEXTURE_SLOTS = 6;

export interface WorkerAssetProviderOptions {
  onProgress?: ProgressFn;
}

/** Rebuild the error class the worker could not send across. */
function reviveError(e: { name: string; message: string }): Error {
  switch (e.name) {
    case 'ResourceNotFoundError':
      return new ResourceNotFoundError('', e.message);
    case 'ResourceUnsupportedError':
      return new ResourceUnsupportedError(e.message);
    case 'ProviderNotReadyError':
      return new ProviderNotReadyError(e.message);
    default: {
      const err = new ResourceError('', e.message);
      err.name = e.name;
      return err;
    }
  }
}

export class WorkerAssetProvider implements AssetProvider {
  readonly name = 'pack(worker)';

  private readonly worker: Worker;
  private readonly waiting = new Map<
    number,
    {
      resolve: (v: unknown) => void;
      reject: (e: unknown) => void;
    }
  >();
  private nextId = 1;
  private source: AssetSource | null = null;
  private readonly onProgress?: ProgressFn;
  /** Concurrent worker loads, so callers' nearest-first order is the worker's order. Eight is a guess. */
  private readonly loads = new Limiter(8);
  /**
   * Textures' own slots. In the eight above, each would wait behind whatever
   * tiles and models are queued and a zone stands grey, while decoding one is
   * a few milliseconds of the worker's time (1.1.4's PVRTC, measured).
   */
  private readonly textureLoads = new Limiter(TEXTURE_SLOTS);

  constructor(opts: WorkerAssetProviderOptions = {}) {
    this.onProgress = opts.onProgress;
    this.worker = new Worker(new URL('../worker/assetWorker.ts', import.meta.url), {
      type: 'module',
      name: 'ubiquitous-assets',
    });
    this.worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.kind === 'progress') {
        this.onProgress?.(msg.progress);
        return;
      }
      const pending = this.waiting.get(msg.id);
      if (!pending) return;
      this.waiting.delete(msg.id);
      if (msg.ok) pending.resolve(msg.value);
      else pending.reject(reviveError(msg.error));
    });
    this.worker.addEventListener('error', event => {
      log.error(`asset worker failed: ${event.message}`);
      for (const [, p] of this.waiting) p.reject(new ResourceError('worker', event.message));
      this.waiting.clear();
    });
  }

  private send<T>(req: Omit<WorkerRequest, 'id'>): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage({ ...req, id } as WorkerRequest);
    });
  }

  async init(): Promise<void> {
    await this.send<void>({ op: 'init' });
  }

  listSources(): Promise<AssetSource[]> {
    return this.send<AssetSource[]>({ op: 'listSources' });
  }

  /** Builds already extracted in this browser, which need no .ipa. */
  async cachedBuilds(): Promise<AssetSource[]> {
    return (await this.listSources()).filter(s => s.id.startsWith('cached:'));
  }

  currentSource(): AssetSource | null {
    return this.source;
  }

  /** Hand the worker picked files; a `File` clones as a handle, not its bytes. */
  async offer(input: File | File[]): Promise<AssetSource> {
    const files = Array.isArray(input) ? input : [input];
    return this.send<AssetSource>({ op: 'offer', files });
  }

  async useSource(id: string): Promise<AssetSource> {
    this.source = await this.send<AssetSource>({ op: 'useSource', sourceId: id });
    return this.source;
  }

  load<K extends ResourceKind>(id: IdOf<K>): Promise<ResourceTypes[K]> {
    const lane = id.kind === 'texture' ? this.textureLoads : this.loads;
    return lane.run(() => this.send<ResourceTypes[K]>({ op: 'load', resource: id as ResourceId }));
  }

  /** Loads waiting for one of the worker's slots. */
  get queuedLoads(): number {
    return this.loads.pending;
  }

  /** Attach a game file to a session mounted from storage. */
  attachSource(file: File): Promise<void> {
    return this.send<void>({ op: 'attachSource', files: [file] });
  }

  /** Can this session still reach packs that have never been extracted? */
  canExtractMore(): Promise<boolean> {
    return this.send<boolean>({ op: 'canExtractMore' });
  }

  isComplete(): Promise<boolean> {
    return this.send<boolean>({ op: 'isComplete' });
  }

  /** Is there a sound pack to play from, extracted or still in the game file? */
  hasSound(): Promise<boolean> {
    return this.send<boolean>({ op: 'hasSound' });
  }

  splashes(): Promise<Array<[number, Blob]>> {
    return this.send<Array<[number, Blob]>>({ op: 'splashes' });
  }

  creatureName(id: number): Promise<string | null> {
    return this.send<string | null>({ op: 'load', resource: { kind: 'creatureName', id } });
  }

  creatureEntryName(entry: number): Promise<string | null> {
    return this.send<string | null>({ op: 'load', resource: { kind: 'creatureEntryName', entry } });
  }

  spellName(id: number): Promise<string | null> {
    return this.send<string | null>({ op: 'load', resource: { kind: 'spellName', id } });
  }

  spellText(id: number): Promise<string | null> {
    return this.send<string | null>({ op: 'load', resource: { kind: 'spellText', id } });
  }

  questText(id: number): Promise<string | null> {
    return this.send<string | null>({ op: 'load', resource: { kind: 'questText', id } });
  }

  itemName(id: number): Promise<string | null> {
    return this.load({ kind: 'itemName', id });
  }

  itemText(id: number): Promise<string | null> {
    return this.load({ kind: 'itemText', id });
  }

  itemIcon(entry: number): Promise<ImageBitmap | null> {
    return this.send<ImageBitmap | null>({ op: 'load', resource: { kind: 'itemIcon', id: entry } });
  }

  spellIcon(id: number): Promise<ImageBitmap | null> {
    return this.send<ImageBitmap | null>({ op: 'load', resource: { kind: 'spellIcon', id } });
  }

  topbarIcon(name: string): Promise<ImageBitmap | null> {
    return this.send<ImageBitmap | null>({ op: 'load', resource: { kind: 'topbarIcon', name } });
  }

  classIcon(classId: number): Promise<ImageBitmap | null> {
    return this.send<ImageBitmap | null>({ op: 'load', resource: { kind: 'classIcon', classId } });
  }

  spellVisual(spellVisualId: number): Promise<SpellVisualData | null> {
    return this.send<SpellVisualData | null>({
      op: 'load',
      resource: { kind: 'spellVisual', spellVisualId },
    });
  }

  spellCastingTime(id: number): Promise<number> {
    return this.send<number>({ op: 'load', resource: { kind: 'spellCastingTime', id } });
  }

  spellVisualOf(id: number): Promise<number> {
    return this.send<number>({ op: 'load', resource: { kind: 'spellVisualOf', id } });
  }

  itemWeaponClass(id: number): Promise<{ itemClass: number; subClass: number }> {
    return this.send<{ itemClass: number; subClass: number }>({
      op: 'load',
      resource: { kind: 'itemWeaponClass', id },
    });
  }

  spellCastable(spellId: number): Promise<boolean> {
    return this.send<boolean>({ op: 'load', resource: { kind: 'spellCastable', id: spellId } });
  }

  spellRank(spellId: number): Promise<number> {
    return this.send<number>({ op: 'load', resource: { kind: 'spellRank', id: spellId } });
  }

  storageUpgrades(): Promise<ResourceTypes['storageUpgrades']> {
    return this.load({ kind: 'storageUpgrades' });
  }

  itemCatalog(): Promise<ResourceTypes['itemCatalog']> {
    return this.load({ kind: 'itemCatalog' });
  }

  talents(): Promise<ResourceTypes['talents']> {
    return this.load({ kind: 'talents' });
  }

  spellString(id: number): Promise<ResourceTypes['spellString']> {
    return this.load({ kind: 'spellString', id });
  }

  teleportStops(): Promise<ResourceTypes['teleportStops']> {
    return this.load({ kind: 'teleportStops' });
  }

  gossipMenu(id: number): Promise<ResourceTypes['gossipMenu']> {
    return this.load({ kind: 'gossipMenu', id });
  }

  areaMap(zoneId: number, routes = false): Promise<ResourceTypes['areaMap'] | null> {
    return this.load(areaMapId(zoneId, routes));
  }

  busRoutes(): Promise<ResourceTypes['busRoutes']> {
    return this.load({ kind: 'busRoutes' });
  }

  areaLinks(): Promise<ResourceTypes['areaLinks'] | null> {
    return this.load({ kind: 'areaLinks' });
  }

  minimap(mapId: number, tx: number, tz: number): Promise<ResourceTypes['minimap'] | null> {
    return this.load({ kind: 'minimap', mapId, tx, tz });
  }

  clearCache(): Promise<void> {
    return this.send<void>({ op: 'clearCache' });
  }

  dispose(): void {
    void this.send<void>({ op: 'dispose' }).catch(() => {
      // Disposing a worker that already went away is not a failure.
    });
    this.worker.terminate();
    this.waiting.clear();
    this.source = null;
  }
}
