/**
 * The static batch: one instanced mesh per repeated model, written a row at
 * a time.
 *
 * What a wrong batch does is invisible until it is not: a placement drawn at
 * the origin, a hidden tuft that comes back, a removed tree that leaves a
 * ghost, or a field of grass that rewrites every row whenever one crosses the
 * cutoff. These pin the row bookkeeping without a WebGL context, which the
 * three.js objects here do not need.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  appendEntry,
  createStaticBatch,
  disposeBatch,
  removeEntry,
  writeEntry,
  writeEntryFade,
} from '../src/renderer/staticBatch';
import type { StaticBatch, StaticBatchEntry } from '../src/renderer/staticBatch';

function prototypeParts(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), 3),
  );
  return { geometry, material: new THREE.MeshBasicMaterial() };
}

function batchIn(parent = new THREE.Group()): { batch: StaticBatch; parent: THREE.Group } {
  const { geometry, material } = prototypeParts();
  const base = new THREE.Matrix4().makeTranslation(0, 0.5, 0);
  return { batch: createStaticBatch('grass', geometry, material, base, parent), parent };
}

function placement(id: number, x: number): StaticBatchEntry {
  const object = new THREE.Object3D();
  object.position.set(x, 0, 0);
  return { id, object, visible: true };
}

function positionOf(batch: StaticBatch, index: number): THREE.Vector3 {
  const m = new THREE.Matrix4();
  batch.mesh.getMatrixAt(index, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

describe('appendEntry', () => {
  it('writes the placement under the prototype transform', () => {
    const { batch } = batchIn();
    const index = appendEntry(batch, placement(1, 10));

    expect(index).toBe(0);
    expect(batch.mesh.count).toBe(1);
    expect(positionOf(batch, 0)).toEqual(new THREE.Vector3(10, 0.5, 0));
    // `needsUpdate` is write-only in three; the version it bumps is what the
    // uploader reads.
    expect(batch.mesh.instanceMatrix.version).toBeGreaterThan(0);
  });

  it('grows by doubling, keeps every row, and releases the outgrown mesh', () => {
    const { batch, parent } = batchIn();
    const first = batch.mesh;
    let released = 0;
    first.addEventListener('dispose', () => {
      released++;
    });

    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));
    appendEntry(batch, placement(3, 3));

    expect(batch.capacity).toBe(4);
    expect(released).toBe(1);
    expect(first.parent).toBeNull();
    expect(parent.children).toEqual([batch.mesh]);
    expect(batch.mesh.count).toBe(3);
    expect(positionOf(batch, 0).x).toBe(1);
    expect(positionOf(batch, 2).x).toBe(3);
  });
});

describe('writeEntry', () => {
  it('collapses a hidden placement and restores it, touching only that row', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));
    const before = batch.mesh.instanceMatrix.version;

    batch.entries[0]!.visible = false;
    writeEntry(batch, 0);

    const hidden = new THREE.Matrix4();
    batch.mesh.getMatrixAt(0, hidden);
    expect(new THREE.Vector3().setFromMatrixScale(hidden)).toEqual(new THREE.Vector3(0, 0, 0));
    expect(positionOf(batch, 1).x).toBe(2);
    expect(batch.mesh.instanceMatrix.version).toBeGreaterThan(before);

    batch.entries[0]!.visible = true;
    writeEntry(batch, 0);
    expect(positionOf(batch, 0).x).toBe(1);
  });

  it('ignores an index that is not a row', () => {
    const { batch } = batchIn();
    expect(() => writeEntry(batch, 5)).not.toThrow();
  });
});

describe('removeEntry', () => {
  it('moves the last placement into the hole and says which one moved', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));
    appendEntry(batch, placement(3, 3));

    const moved = removeEntry(batch, 0);

    expect(moved).toBe(3);
    expect(batch.entries.map(e => e.id)).toEqual([3, 2]);
    expect(batch.mesh.count).toBe(2);
    expect(positionOf(batch, 0).x).toBe(3);
  });

  it('removing the last placement moves nothing', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));

    expect(removeEntry(batch, 1)).toBeNull();
    expect(batch.entries.map(e => e.id)).toEqual([1]);
    expect(batch.mesh.count).toBe(1);
  });

  it('refuses an index that is not a row', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    expect(removeEntry(batch, 4)).toBeNull();
    expect(batch.entries).toHaveLength(1);
  });
});

describe('disposeBatch', () => {
  it('releases the instance buffers and leaves the shared parts alone', () => {
    const { batch, parent } = batchIn();
    appendEntry(batch, placement(1, 1));
    let meshDisposed = 0;
    let geometryDisposed = false;
    let materialDisposed = false;
    batch.mesh.addEventListener('dispose', () => {
      meshDisposed++;
    });
    batch.geometry.addEventListener('dispose', () => {
      geometryDisposed = true;
    });
    (batch.material as THREE.Material).addEventListener('dispose', () => {
      materialDisposed = true;
    });

    disposeBatch(batch);

    expect(meshDisposed).toBe(1);
    expect(parent.children).toEqual([]);
    expect(geometryDisposed).toBe(false);
    expect(materialDisposed).toBe(false);
  });
});

describe("a row's fade", () => {
  it('lives in the red channel of the instance colour, and rides through a grow', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const parent = new THREE.Group();
    const batch = createStaticBatch('t', geometry, material, new THREE.Matrix4(), parent);
    const entry = (id: number): StaticBatchEntry => ({
      id,
      object: new THREE.Object3D(),
      visible: true,
    });
    const first = appendEntry(batch, entry(1));
    batch.entries[first]!.fade = 0.25;
    writeEntryFade(batch, first);
    const read = (i: number) => batch.mesh.instanceColor!.getX(i);
    expect(read(first)).toBeCloseTo(0.25, 6);
    // Growing rewrites every row from its entry, fade included.
    appendEntry(batch, entry(2));
    appendEntry(batch, entry(3));
    expect(read(first)).toBeCloseTo(0.25, 6);
    expect(read(1)).toBe(1);
  });
});
