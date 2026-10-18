/**
 * Repeated scenery instanced: one `InstancedMesh` per prototype mesh per
 * cell, all sharing a row per placement. Shown rows are kept at the front,
 * so `count` draws only those; removal swaps the last row in.
 * `disposeBatch` frees instance buffers only.
 */

import * as THREE from 'three';

import type { EntityId } from '../world/World';

export interface StaticBatchEntry {
  id: EntityId;
  /** Carries the placement's transform. Not in the scene graph. */
  object: THREE.Object3D;
  visible: boolean;
  /** How much of the placement is drawn, 0..1; see `fadeMaterial.ts`. Absent means 1. */
  fade?: number;
  /** The entry's row now; rows move as placements are shown, hidden and removed. */
  row: number;
}

/** A placement before it has a row. */
export type NewStaticBatchEntry = Omit<StaticBatchEntry, 'row'>;

/** One mesh of the prototype, drawn once per placement. */
export interface StaticBatchPart {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  /** The prototype mesh's own transform, applied under each placement's. */
  baseMatrix: THREE.Matrix4;
}

/** What `createStaticBatch` needs to know about one prototype mesh. */
export interface StaticBatchPartSource {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  baseMatrix: THREE.Matrix4;
}

export interface StaticBatch {
  /** Every part, in the prototype's own traversal order. Never empty. */
  parts: StaticBatchPart[];
  /** The first part's mesh. Kept current through a grow. */
  mesh: THREE.InstancedMesh;
  /** Shown entries first, then hidden ones; `entries[i].row === i`. */
  entries: StaticBatchEntry[];
  /** How many leading entries are shown, and so drawn. */
  drawn: number;
  capacity: number;
  /** The first part's geometry, material and transform. */
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  baseMatrix: THREE.Matrix4;
  /** Every part's extent in the prototype's own space. */
  localBox: THREE.Box3;
  /** World extent of everything ever shown; grows only, so it is never too small to cull by. */
  bounds: THREE.Box3;
  /** Shared by every part's mesh as its `boundingSphere`, for three's frustum test. */
  sphere: THREE.Sphere;
}

/**
 * Edge of the square cell a batch covers. Batches are per model and cell so
 * three can cull one the camera, or the sun's shadow camera, does not see.
 * Own choice, measured at High over eight headings in Waterby and Owl Wood:
 * cells of 64, 128 and 256 drew 742/717/713 and 512/508/506 calls over
 * 254k/264k/282k and 180k/183k/189k triangles. 128 sits between.
 */
export const STATIC_BATCH_CELL = 128;

/** The cell a placement at (x, z) batches in, as a key part. */
export function staticBatchCell(x: number, z: number): string {
  return `${Math.floor(x / STATIC_BATCH_CELL)},${Math.floor(z / STATIC_BATCH_CELL)}`;
}

const scratch = new THREE.Matrix4();
const scratchBox = new THREE.Box3();

/** A batch of one single-material mesh — the shape every batch had before parts. */
export function createStaticBatch(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  baseMatrix: THREE.Matrix4,
  parent: THREE.Object3D,
): StaticBatch {
  return createStaticBatchOf(name, [{ geometry, material, baseMatrix }], parent);
}

/** A batch drawing every one of `sources` per placement. */
export function createStaticBatchOf(
  name: string,
  sources: StaticBatchPartSource[],
  parent: THREE.Object3D,
): StaticBatch {
  if (sources.length === 0) throw new Error(`static batch ${name} has no parts`);
  const sphere = new THREE.Sphere().makeEmpty();
  const localBox = new THREE.Box3();
  const parts = sources.map(source => {
    const mesh = newMesh(name, source.geometry, source.material, 1, sphere);
    parent.add(mesh);
    if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
    localBox.union(scratchBox.copy(source.geometry.boundingBox!).applyMatrix4(source.baseMatrix));
    return {
      mesh,
      geometry: source.geometry,
      material: source.material,
      baseMatrix: source.baseMatrix.clone(),
    };
  });
  const first = parts[0]!;
  const batch: StaticBatch = {
    parts,
    mesh: first.mesh,
    entries: [],
    drawn: 0,
    capacity: 1,
    geometry: first.geometry,
    material: first.material,
    baseMatrix: first.baseMatrix,
    localBox,
    bounds: new THREE.Box3(),
    sphere,
  };
  for (const part of parts) part.mesh.userData.staticBatch = batch;
  return batch;
}

function newMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  capacity: number,
  sphere: THREE.Sphere,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.name = name;
  mesh.matrixAutoUpdate = false;
  // Trees and posts throw shadows when the renderer draws a shadow map.
  mesh.castShadow = true;
  // The red channel carries each row's fade; the shared material reads it as
  // that and never as a tint. Green and blue are along for the ride.
  const colours = new Float32Array(capacity * 3).fill(1);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  trackDirtyRows(mesh.instanceMatrix);
  trackDirtyRows(mesh.instanceColor);
  // Kept by `writeEntry`; three would otherwise measure every row each time it was null.
  mesh.boundingSphere = sphere;
  mesh.count = 0;
  mesh.visible = false;
  return mesh;
}

/** Rows written since the last upload, as one span: one row would otherwise re-upload all, per-row ranges cost more. */
interface DirtyRows {
  min: number;
  max: number;
}

const dirtyRows = new WeakMap<THREE.BufferAttribute, DirtyRows>();

function trackDirtyRows(attribute: THREE.BufferAttribute): void {
  const rows: DirtyRows = { min: Infinity, max: -Infinity };
  dirtyRows.set(attribute, rows);
  // Three clears the update ranges itself once they are uploaded; this is
  // what tells the span to start again from nothing.
  attribute.onUpload(() => {
    rows.min = Infinity;
    rows.max = -Infinity;
  });
}

/** Mark one row of an instance attribute for upload. */
function markRow(attribute: THREE.BufferAttribute, row: number): void {
  const rows = dirtyRows.get(attribute);
  if (rows) {
    rows.min = Math.min(rows.min, row);
    rows.max = Math.max(rows.max, row);
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(
      rows.min * attribute.itemSize,
      (rows.max - rows.min + 1) * attribute.itemSize,
    );
  }
  attribute.needsUpdate = true;
}

/**
 * Write one placement's row from its object, first moving it across the
 * shown/hidden boundary if its visibility changed. A hidden row is past
 * `count` and is not written: it is rewritten when shown again.
 */
export function writeEntry(batch: StaticBatch, index: number): void {
  const entry = batch.entries[index];
  if (!entry) return;
  const wasShown = index < batch.drawn;
  if (entry.visible && !wasShown) {
    swapRows(batch, index, batch.drawn);
    batch.drawn++;
    setCount(batch);
  } else if (!entry.visible && wasShown) {
    swapRows(batch, index, batch.drawn - 1);
    batch.drawn--;
    setCount(batch);
  }
  if (!entry.visible) return;
  entry.object.updateMatrix();
  for (const part of batch.parts) {
    scratch.multiplyMatrices(entry.object.matrix, part.baseMatrix);
    part.mesh.setMatrixAt(entry.row, scratch);
    markRow(part.mesh.instanceMatrix, entry.row);
  }
  writeEntryFade(batch, entry.row);
  growBounds(batch, entry.object.matrix);
}

/** Write one placement's fade. Only the red channel means anything. */
export function writeEntryFade(batch: StaticBatch, index: number): void {
  const entry = batch.entries[index];
  if (!entry || index >= batch.drawn) return;
  for (const part of batch.parts) {
    const colours = part.mesh.instanceColor;
    if (!colours) continue;
    colours.setXYZ(index, entry.fade ?? 1, 1, 1);
    markRow(colours, index);
  }
}

/** Add a placement. Gives it its row and returns it. Grows the mesh when full. */
export function appendEntry(batch: StaticBatch, placement: NewStaticBatchEntry): StaticBatchEntry {
  const entry = placement as StaticBatchEntry;
  entry.row = batch.entries.length;
  batch.entries.push(entry);
  if (batch.entries.length > batch.capacity) grow(batch);
  writeEntry(batch, entry.row);
  return entry;
}

/** Remove the placement at `index`; the rows that fill its place say where they went. */
export function removeEntry(batch: StaticBatch, index: number): void {
  const last = batch.entries.length - 1;
  if (index < 0 || index > last) return;
  if (index < batch.drawn) {
    swapRows(batch, index, batch.drawn - 1);
    index = batch.drawn - 1;
    batch.drawn--;
  }
  swapRows(batch, index, last);
  batch.entries.pop();
  setCount(batch);
}

/** Exchange two rows: entries, their row numbers and every part's instance data. */
function swapRows(batch: StaticBatch, a: number, b: number): void {
  if (a === b) return;
  const entries = batch.entries;
  const first = entries[a]!;
  const second = entries[b]!;
  entries[a] = second;
  entries[b] = first;
  second.row = a;
  first.row = b;
  for (const part of batch.parts) {
    swapItems(part.mesh.instanceMatrix, a, b);
    if (part.mesh.instanceColor) swapItems(part.mesh.instanceColor, a, b);
  }
}

function swapItems(attribute: THREE.BufferAttribute, a: number, b: number): void {
  const array = attribute.array as Float32Array;
  const size = attribute.itemSize;
  for (let i = 0; i < size; i++) {
    const t = array[a * size + i]!;
    array[a * size + i] = array[b * size + i]!;
    array[b * size + i] = t;
  }
  markRow(attribute, a);
  markRow(attribute, b);
}

function growBounds(batch: StaticBatch, placement: THREE.Matrix4): void {
  const before = batch.bounds.isEmpty() ? null : batch.bounds.clone();
  batch.bounds.union(scratchBox.copy(batch.localBox).applyMatrix4(placement));
  if (before && before.equals(batch.bounds)) return;
  batch.bounds.getBoundingSphere(batch.sphere);
}

function setCount(batch: StaticBatch): void {
  for (const part of batch.parts) {
    part.mesh.count = batch.drawn;
    // A batch with nothing to draw would still cost a draw call.
    part.mesh.visible = batch.drawn > 0;
  }
}

/** Replace every part's mesh with one at least twice the size and write every shown row. */
function grow(batch: StaticBatch): void {
  const capacity = Math.max(batch.entries.length, batch.capacity * 2);
  for (const part of batch.parts) {
    const replacement = newMesh(
      part.mesh.name,
      part.geometry,
      part.material,
      capacity,
      batch.sphere,
    );
    replacement.userData.staticBatch = batch;
    replacement.castShadow = part.mesh.castShadow;
    part.mesh.parent?.add(replacement);
    part.mesh.removeFromParent();
    // Removing it from the scene graph does not release its instance buffers.
    // `dispose` drops `instanceMatrix` from the GPU and touches neither the
    // geometry nor the material, which the replacement now shares.
    part.mesh.dispose();
    part.mesh = replacement;
  }
  batch.mesh = batch.parts[0]!.mesh;
  batch.capacity = capacity;
  setCount(batch);
  for (let i = 0; i < batch.drawn; i++) writeEntry(batch, i);
}

/** Take an empty or abandoned batch out of the scene and off the GPU. */
export function disposeBatch(batch: StaticBatch): void {
  for (const part of batch.parts) {
    part.mesh.removeFromParent();
    part.mesh.dispose();
  }
}
