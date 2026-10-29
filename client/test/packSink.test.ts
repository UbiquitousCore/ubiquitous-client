/**
 * Where `createWritable` is missing, a pack is still written to storage,
 * through a sync access handle, every chunk at its own offset.
 */

import { describe, expect, it } from 'vitest';

import { packSink } from '../src/assets/vfs/PackStore';

function syncOnlyHandle() {
  const file = new Uint8Array(16);
  let length = 7;
  const state = { closed: false, flushed: false };
  const handle = {
    createSyncAccessHandle: async () => ({
      write(data: Uint8Array, { at }: { at: number }): number {
        // Takes at most three bytes a call, as a real handle may write less than asked.
        const part = data.subarray(0, 3);
        file.set(part, at);
        length = Math.max(length, at + part.length);
        return part.length;
      },
      truncate(size: number) {
        length = size;
      },
      flush() {
        state.flushed = true;
      },
      close() {
        state.closed = true;
      },
    }),
  } as unknown as FileSystemFileHandle;
  return { handle, written: () => [...file.subarray(0, length)], state };
}

describe('packSink', () => {
  it('writes through a sync access handle where there is no createWritable', async () => {
    const { handle, written, state } = syncOnlyHandle();
    const sink = await packSink(handle);
    await sink.write(new Uint8Array([1, 2, 3, 4, 5]));
    await sink.write(new Uint8Array([6, 7]));
    await sink.close();
    expect(written()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(state).toEqual({ closed: true, flushed: true });
  });

  it('says so when the browser can write neither way', async () => {
    await expect(packSink({} as FileSystemFileHandle)).rejects.toThrow(/cannot write/);
  });
});
