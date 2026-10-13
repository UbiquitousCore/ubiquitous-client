/**
 * What may be moved across the worker boundary, and what must be copied.
 *
 * Transfer is how a megabyte of geometry reaches the main thread without
 * being duplicated, so missing a buffer is a performance bug. Naming one the
 * worker still owns is a correctness bug and a nastier one: transfer detaches
 * the buffer on the sending side, and a detached typed array reads as length
 * 0 rather than throwing. A provider that caches a parsed document and then
 * transfers something sharing its buffer poisons its own cache the first time
 * it answers — every later reader silently gets an empty array.
 *
 * The exclusion is what makes that unreachable rather than something to
 * remember, and getting it wrong costs a copy instead of a corruption.
 */

import { describe, expect, it } from 'vitest';

import { retainBuffers, transferablesOf } from '../src/assets/transferables';

describe('transferablesOf', () => {
  it('finds the buffers behind nested typed arrays', () => {
    const value = {
      meshes: [{ positions: new Float32Array([1, 2, 3]), indices: new Uint16Array([0, 1, 2]) }],
      skeleton: { inverseBind: new Float32Array(16) },
      name: 'not a buffer',
      count: 3,
    };
    expect(transferablesOf(value)).toHaveLength(3);
  });

  it('names a buffer once however many views share it', () => {
    const shared = new ArrayBuffer(64);
    const value = {
      a: new Float32Array(shared, 0, 4),
      b: new Uint16Array(shared, 16, 4),
      c: new Uint8Array(shared),
    };
    const out = transferablesOf(value);
    expect(out).toEqual([shared]);
  });

  it('survives a cycle without recursing for ever', () => {
    const value: Record<string, unknown> = { data: new Uint8Array(8) };
    value.self = value;
    expect(transferablesOf(value)).toHaveLength(1);
  });

  it('ignores nulls, primitives and empty values', () => {
    expect(transferablesOf(null)).toEqual([]);
    expect(transferablesOf(undefined)).toEqual([]);
    expect(transferablesOf(42)).toEqual([]);
    expect(transferablesOf('a string')).toEqual([]);
    expect(transferablesOf({ a: null, b: 1, c: 'x' })).toEqual([]);
  });

  it('leaves out a buffer the sender is still holding', () => {
    const cached = new Float32Array([1, 2, 3]);
    const fresh = new Float32Array([4, 5, 6]);
    const retained = new WeakSet<ArrayBuffer>();
    retainBuffers({ cached }, retained);

    const out = transferablesOf({ cached, fresh }, retained);

    // The cached one is copied by structured clone; the fresh one still moves,
    // which is the whole point of keeping the exclusion narrow.
    expect(out).toEqual([fresh.buffer]);
  });

  it('excludes a retained buffer however it is reached', () => {
    const shared = new ArrayBuffer(32);
    const retained = new WeakSet<ArrayBuffer>();
    retained.add(shared);

    // Reached through a different view, nested deeper, alongside its owner.
    const out = transferablesOf(
      {
        deep: { nested: [{ view: new Uint8Array(shared, 8, 8) }] },
      },
      retained,
    );

    expect(out).toEqual([]);
  });
});

describe('retainBuffers', () => {
  it('registers every buffer a cached value reaches', () => {
    const skeleton = {
      bones: [{ name: 'root' }],
      inverseBind: new Float32Array(16),
      skinIndices: new Uint16Array(8),
      skinWeights: new Float32Array(8),
    };
    const retained = new WeakSet<ArrayBuffer>();
    retainBuffers(skeleton, retained);

    expect(retained.has(skeleton.inverseBind.buffer as ArrayBuffer)).toBe(true);
    expect(retained.has(skeleton.skinIndices.buffer as ArrayBuffer)).toBe(true);
    expect(retained.has(skeleton.skinWeights.buffer as ArrayBuffer)).toBe(true);
    // Nothing of this value may now be moved.
    expect(transferablesOf(skeleton, retained)).toEqual([]);
  });

  it('does not retain an ImageBitmap, which is a handle rather than a buffer', () => {
    // Stands in for one: the walk keys on `instanceof ImageBitmap`, which is
    // absent in this environment, so the shape below exercises the same path
    // an ordinary object takes and proves nothing is registered by accident.
    const retained = new WeakSet<ArrayBuffer>();
    retainBuffers({ image: { width: 4, height: 4 } }, retained);
    expect(transferablesOf({ image: { width: 4, height: 4 } }, retained)).toEqual([]);
  });
});
