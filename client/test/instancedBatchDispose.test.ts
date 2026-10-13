/**
 * An orphaned static batch (outgrown, or emptied by tile eviction) must free
 * its instance attributes but never its geometry or material, which belong
 * to the shared prototype and are still drawn elsewhere.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

/** A prototype's geometry and material, shared by every batch that uses it. */
function prototypeParts(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0]), 3),
  );
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array([0, 1, 2]), 1));
  return { geometry, material: new THREE.MeshBasicMaterial() };
}

describe('orphaning a static batch', () => {
  it('releases the instance buffers of the mesh it replaces', () => {
    const { geometry, material } = prototypeParts();
    const outgrown = new THREE.InstancedMesh(geometry, material, 1);

    let released = 0;
    outgrown.addEventListener('dispose', () => {
      released++;
    });

    // What `appendEntry` does when the batch outgrows its capacity.
    const replacement = new THREE.InstancedMesh(geometry, material, 2);
    const parent = new THREE.Group();
    parent.add(outgrown);
    parent.add(replacement);
    outgrown.removeFromParent();
    outgrown.dispose();

    expect(released).toBe(1);
    // Detached from the scene *and* released. Either alone is a bug: the
    // first without the second is the leak, the second without the first
    // leaves a disposed mesh being drawn.
    expect(outgrown.parent).toBeNull();
    expect(parent.children).toEqual([replacement]);
  });

  it('leaves the shared geometry and material intact for the other batches', () => {
    const { geometry, material } = prototypeParts();
    const kept = new THREE.InstancedMesh(geometry, material, 4);
    const orphaned = new THREE.InstancedMesh(geometry, material, 1);

    let geometryDisposed = false;
    let materialDisposed = false;
    geometry.addEventListener('dispose', () => {
      geometryDisposed = true;
    });
    material.addEventListener('dispose', () => {
      materialDisposed = true;
    });

    orphaned.removeFromParent();
    orphaned.dispose();

    // The prototype owns both, and every other placement of this model is
    // still drawing them.
    expect(geometryDisposed).toBe(false);
    expect(materialDisposed).toBe(false);
    expect(kept.geometry.getAttribute('position')).toBeDefined();
    expect(kept.geometry.getIndex()).not.toBeNull();
    expect(kept.material).toBe(material);
  });

  it('keeps the instance attributes addressable, so a double dispose is harmless', () => {
    const { geometry, material } = prototypeParts();
    const orphaned = new THREE.InstancedMesh(geometry, material, 2);

    let released = 0;
    orphaned.addEventListener('dispose', () => {
      released++;
    });

    // `detach` can run for a batch that `appendEntry` already replaced.
    orphaned.dispose();
    orphaned.dispose();

    expect(released).toBe(2);
    expect(orphaned.instanceMatrix).not.toBeNull();
  });
});
