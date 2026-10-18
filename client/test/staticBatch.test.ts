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
  STATIC_BATCH_CELL,
  staticBatchCell,
  writeEntry,
  writeEntryFade,
} from '../src/renderer/staticBatch';
import type { NewStaticBatchEntry, StaticBatch } from '../src/renderer/staticBatch';

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

function placement(id: number, x: number): NewStaticBatchEntry {
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
    const entry = appendEntry(batch, placement(1, 10));

    expect(entry.row).toBe(0);
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

/** The x of every drawn row, in row order. */
function drawnXs(batch: StaticBatch): number[] {
  const xs: number[] = [];
  for (let i = 0; i < batch.mesh.count; i++) xs.push(positionOf(batch, i).x);
  return xs;
}

function hide(batch: StaticBatch, id: number, visible = false): void {
  const entry = batch.entries.find(e => e.id === id)!;
  entry.visible = visible;
  writeEntry(batch, entry.row);
}

describe('writeEntry', () => {
  it('moves a hidden placement past the drawn rows and back when shown', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));
    appendEntry(batch, placement(3, 3));

    hide(batch, 1);
    expect(batch.mesh.count).toBe(2);
    expect(drawnXs(batch).sort()).toEqual([2, 3]);

    hide(batch, 1, true);
    expect(batch.mesh.count).toBe(3);
    expect(drawnXs(batch).sort()).toEqual([1, 2, 3]);
  });

  it('keeps every entry at the row it names', () => {
    const { batch } = batchIn();
    for (let i = 1; i <= 6; i++) appendEntry(batch, placement(i, i));
    hide(batch, 2);
    hide(batch, 5);
    hide(batch, 2, true);
    removeEntry(batch, batch.entries.find(e => e.id === 4)!.row);

    batch.entries.forEach((entry, row) => expect(entry.row).toBe(row));
    for (let row = 0; row < batch.mesh.count; row++) {
      expect(positionOf(batch, row).x).toBe(batch.entries[row]!.object.position.x);
    }
    expect(batch.entries.slice(batch.drawn).map(e => e.id)).toEqual([5]);
  });

  it("carries a row's fade with it when the row moves", () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    const faded = appendEntry(batch, placement(2, 2));
    faded.fade = 0.25;
    writeEntryFade(batch, faded.row);

    hide(batch, 1);
    expect(faded.row).toBe(0);
    expect(batch.mesh.instanceColor!.getX(0)).toBeCloseTo(0.25, 6);
  });

  it('stops drawing the batch at all when every placement is hidden', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    hide(batch, 1);
    expect(batch.mesh.count).toBe(0);
    expect(batch.mesh.visible).toBe(false);
    hide(batch, 1, true);
    expect(batch.mesh.visible).toBe(true);
  });

  it('ignores an index that is not a row', () => {
    const { batch } = batchIn();
    expect(() => writeEntry(batch, 5)).not.toThrow();
  });
});

describe("a batch's bounds", () => {
  it('hold every shown placement, so three can cull the batch by them', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 10));
    appendEntry(batch, placement(2, -30));

    expect(batch.mesh.frustumCulled).toBe(true);
    expect(batch.mesh.boundingSphere).toBe(batch.sphere);
    // The triangle spans 0..1 in x and sits 0.5 up under the prototype transform.
    // Each placement's far end, a hair inside: the box's corners lie on the sphere.
    for (const end of [new THREE.Vector3(-29.99, 0.51, 0), new THREE.Vector3(10.99, 1.49, 0)]) {
      expect(batch.sphere.containsPoint(end)).toBe(true);
    }
  });

  it('are culled by a camera looking away and kept by one looking at them', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 50));
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    const frustum = new THREE.Frustum();
    const look = (x: number): boolean => {
      camera.lookAt(x, 0, 0);
      camera.updateMatrixWorld();
      frustum.setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
      );
      return frustum.intersectsObject(batch.mesh);
    };
    expect(look(50)).toBe(true);
    expect(look(-50)).toBe(false);
  });
});

describe('staticBatchCell', () => {
  it('puts placements either side of a cell edge in different batches', () => {
    expect(staticBatchCell(0, 0)).toBe(staticBatchCell(STATIC_BATCH_CELL - 0.01, 5));
    expect(staticBatchCell(-0.01, 0)).not.toBe(staticBatchCell(0, 0));
    expect(staticBatchCell(0, STATIC_BATCH_CELL)).not.toBe(staticBatchCell(0, 0));
  });
});

describe('removeEntry', () => {
  it('moves the last placement into the hole', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));
    appendEntry(batch, placement(3, 3));
    removeEntry(batch, 0);

    expect(batch.entries.map(e => e.id)).toEqual([3, 2]);
    expect(batch.mesh.count).toBe(2);
    expect(positionOf(batch, 0).x).toBe(3);
  });

  it('keeps hidden placements undrawn when a drawn one goes', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    appendEntry(batch, placement(2, 2));
    appendEntry(batch, placement(3, 3));
    hide(batch, 3);
    removeEntry(batch, batch.entries.find(e => e.id === 1)!.row);

    expect(batch.mesh.count).toBe(1);
    expect(drawnXs(batch)).toEqual([2]);
    expect(batch.entries.map(e => e.id)).toEqual([2, 3]);
  });

  it('refuses an index that is not a row', () => {
    const { batch } = batchIn();
    appendEntry(batch, placement(1, 1));
    removeEntry(batch, 4);
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
    const entry = (id: number): NewStaticBatchEntry => ({
      id,
      object: new THREE.Object3D(),
      visible: true,
    });
    const first = appendEntry(batch, entry(1)).row;
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
