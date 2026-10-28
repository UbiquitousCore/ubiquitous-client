/**
 * Textures reach the asset worker through their own slots: a texture asked
 * for while every general slot is held by tiles and models still goes out.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TEXTURE_SLOTS, WorkerAssetProvider } from '../src/assets/providers/WorkerAssetProvider';
import type { WorkerRequest } from '../src/assets/worker/assetWorker';

const posted: WorkerRequest[] = [];

class FakeWorker {
  addEventListener(): void {}
  postMessage(request: WorkerRequest): void {
    posted.push(request);
  }
}

const settle = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('WorkerAssetProvider texture lane', () => {
  afterEach(() => {
    posted.length = 0;
    vi.unstubAllGlobals();
  });

  it('sends a texture while tiles and models fill every general slot', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const provider = new WorkerAssetProvider();
    for (let i = 0; i < 20; i++) void provider.load({ kind: 'model', path: `m${i}.bdae` });
    await settle();
    const general = posted.length;
    expect(provider.queuedLoads).toBe(20 - general);

    void provider.load({ kind: 'texture', ref: 'near.tga' });
    await settle();
    expect(posted.at(-1)?.resource).toEqual({ kind: 'texture', ref: 'near.tga' });
  });

  it('holds textures past their own slot count', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const provider = new WorkerAssetProvider();
    for (let i = 0; i < TEXTURE_SLOTS + 3; i++)
      void provider.load({ kind: 'texture', ref: `t${i}.tga` });
    await settle();
    expect(posted).toHaveLength(TEXTURE_SLOTS);
  });
});
