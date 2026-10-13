/**
 * Repeated scenery instanced: one `InstancedMesh` per prototype mesh, all
 * sharing a row per placement. Removal swaps the last row in.
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
}

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
  entries: StaticBatchEntry[];
  capacity: number;
  /** The first part's geometry, material and transform. */
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  baseMatrix: THREE.Matrix4;
}

/** A hidden placement collapses to nothing rather than being removed, so its row stays addressable. */
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const scratch = new THREE.Matrix4();

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
  const parts = sources.map(source => {
    const mesh = newMesh(name, source.geometry, source.material, 1);
    parent.add(mesh);
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
    capacity: 1,
    geometry: first.geometry,
    material: first.material,
    baseMatrix: first.baseMatrix,
  };
  for (const part of parts) part.mesh.userData.staticBatch = batch;
  return batch;
}

function newMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material | THREE.Material[],
  capacity: number,
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
  // Instances span the whole resident window, so a per-mesh sphere would
  // almost never cull and would cost a recompute on every write.
  mesh.frustumCulled = false;
  mesh.count = 0;
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

/** Write one placement's row from its object and visibility. */
export function writeEntry(batch: StaticBatch, index: number): void {
  const entry = batch.entries[index];
  if (!entry) return;
  if (entry.visible) entry.object.updateMatrix();
  for (const part of batch.parts) {
    if (entry.visible) {
      scratch.multiplyMatrices(entry.object.matrix, part.baseMatrix);
      part.mesh.setMatrixAt(index, scratch);
    } else {
      part.mesh.setMatrixAt(index, HIDDEN);
    }
    markRow(part.mesh.instanceMatrix, index);
  }
  writeEntryFade(batch, index);
}

/** Write one placement's fade. Only the red channel means anything. */
export function writeEntryFade(batch: StaticBatch, index: number): void {
  const entry = batch.entries[index];
  if (!entry) return;
  for (const part of batch.parts) {
    const colours = part.mesh.instanceColor;
    if (!colours) continue;
    colours.setXYZ(index, entry.fade ?? 1, 1, 1);
    markRow(colours, index);
  }
}

/** Add a placement. Returns its index. Grows the mesh when full. */
export function appendEntry(batch: StaticBatch, entry: StaticBatchEntry): number {
  batch.entries.push(entry);
  const index = batch.entries.length - 1;
  if (batch.entries.length > batch.capacity) {
    grow(batch);
  } else {
    setCount(batch);
    writeEntry(batch, index);
  }
  return index;
}

/**
 * Remove the placement at `index` by moving the last one into its place.
 * Returns the id of the placement that moved, or null if none did.
 */
export function removeEntry(batch: StaticBatch, index: number): EntityId | null {
  const last = batch.entries.length - 1;
  if (index < 0 || index > last) return null;
  let moved: EntityId | null = null;
  if (index !== last) {
    batch.entries[index] = batch.entries[last]!;
    moved = batch.entries[index]!.id;
  }
  batch.entries.pop();
  setCount(batch);
  if (moved !== null) writeEntry(batch, index);
  return moved;
}

function setCount(batch: StaticBatch): void {
  for (const part of batch.parts) part.mesh.count = batch.entries.length;
}

/** Replace every part's mesh with one at least twice the size and write every row. */
function grow(batch: StaticBatch): void {
  const capacity = Math.max(batch.entries.length, batch.capacity * 2);
  for (const part of batch.parts) {
    const replacement = newMesh(part.mesh.name, part.geometry, part.material, capacity);
    replacement.userData.staticBatch = batch;
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
  for (let i = 0; i < batch.entries.length; i++) writeEntry(batch, i);
}

/** Take an empty or abandoned batch out of the scene and off the GPU. */
export function disposeBatch(batch: StaticBatch): void {
  for (const part of batch.parts) {
    part.mesh.removeFromParent();
    part.mesh.dispose();
  }
}
