/** Asset worker side (PackAssetProvider off-main-thread; main half is
 * WorkerAssetProvider). Keeps decode stalls out of the frame loop. */

/// <reference lib="webworker" />

import { PackAssetProvider } from '../providers/PackAssetProvider';
import type { AssetSource } from '../AssetProvider';
import type { ResourceId } from '../ids';
import type { MaterialiseProgress } from '../vfs/PackStore';
import { transferablesOf } from '../transferables';

/**
 * One flat request shape rather than a union: a discriminated union does not
 * survive `Omit<_, 'id'>` on the calling side, and the plumbing is not worth
 * a mapped type.
 */
export interface WorkerRequest {
  id: number;
  op:
    | 'init'
    | 'offer'
    | 'listSources'
    | 'useSource'
    | 'load'
    | 'clearCache'
    | 'dispose'
    | 'attachSource'
    | 'canExtractMore'
    | 'isComplete'
    | 'hasSound'
    | 'splashes'
    | 'creatureName'
    | 'spellName'
    | 'questText'
    | 'itemName'
    | 'spellIcon'
    | 'itemIcon'
    | 'spellCastable'
    | 'spellRank'
    | 'spellVisual'
    | 'spellCastingTime'
    | 'spellVisualOf'
    | 'itemWeaponClass';
  files?: File[];
  sourceId?: string;
  resource?: ResourceId;
}

export type WorkerResponse =
  | { kind: 'result'; id: number; ok: true; value: unknown }
  | { kind: 'result'; id: number; ok: false; error: { name: string; message: string } }
  | { kind: 'progress'; progress: MaterialiseProgress };

const scope = self as unknown as DedicatedWorkerGlobalScope;

const provider = new PackAssetProvider({
  onProgress: progress => {
    const message: WorkerResponse = { kind: 'progress', progress };
    scope.postMessage(message);
  },
});

scope.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    let value: unknown;
    switch (req.op) {
      case 'init':
        await provider.init();
        break;
      case 'offer':
        value = provider.offer(req.files ?? []);
        break;
      case 'listSources':
        value = await provider.listSources();
        break;
      case 'useSource':
        value = await provider.useSource(req.sourceId ?? '');
        break;
      case 'load':
        value = await provider.load(req.resource as never);
        break;
      case 'attachSource':
        await provider.attachSource((req.files ?? [])[0]);
        break;
      case 'canExtractMore':
        value = provider.canExtractMore();
        break;
      case 'isComplete':
        value = provider.isComplete();
        break;
      case 'hasSound':
        value = provider.hasSound();
        break;
      case 'splashes':
        value = await provider.splashes();
        break;
      case 'creatureName':
        value = await provider.creatureName((req.resource as { id: number }).id);
        break;
      case 'spellName':
        value = await provider.spellName((req.resource as { id: number }).id);
        break;
      case 'questText':
        value = await provider.questText((req.resource as { id: number }).id);
        break;
      case 'itemName':
        value = await provider.load(req.resource as never);
        break;
      case 'spellIcon':
        value = await provider.spellIcon((req.resource as { id: number }).id);
        break;
      case 'itemIcon':
        value = await provider.itemIcon((req.resource as { id: number }).id);
        break;
      case 'spellCastable':
        value = await provider.spellCastable((req.resource as { id: number }).id);
        break;
      case 'spellRank':
        value = await provider.spellRank((req.resource as { id: number }).id);
        break;
      case 'spellVisual': {
        const r = req.resource as { spellVisualId: number };
        value = await provider.spellVisual(r.spellVisualId);
        break;
      }
      case 'spellCastingTime':
        value = await provider.spellCastingTime((req.resource as { id: number }).id);
        break;
      case 'spellVisualOf':
        value = await provider.spellVisualOf((req.resource as { id: number }).id);
        break;
      case 'itemWeaponClass':
        value = await provider.itemWeaponClass((req.resource as { id: number }).id);
        break;
      case 'clearCache':
        await provider.clearCache();
        break;
      case 'dispose':
        provider.dispose();
        break;
    }
    const response: WorkerResponse = { kind: 'result', id: req.id, ok: true, value };
    // Anything the provider is still holding — its parsed-document and
    // skeleton caches — is copied rather than moved, or answering once would
    // detach it out from under the next reader.
    scope.postMessage(response, transferablesOf(value, provider.retainedBuffers()));
  } catch (err) {
    const error = err as Error;
    const response: WorkerResponse = {
      kind: 'result',
      id: req.id,
      ok: false,
      // Errors do not survive structured clone with their class, so the name
      // is carried explicitly and rebuilt on the other side.
      error: { name: error?.name ?? 'Error', message: error?.message ?? String(err) },
    };
    scope.postMessage(response);
  }
});

export type { AssetSource };
