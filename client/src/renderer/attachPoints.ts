/** Where things hang off a body: the named node (exporters vary the names) or the provider's matrix for a dropped one. */

import * as THREE from 'three';

/**
 * A matrix as the provider gives it: three rows of orientation and the
 * position at the end, rather than four columns.
 */
export function rowMatrix(matrix: readonly number[]): THREE.Matrix4 {
  return new THREE.Matrix4().set(
    matrix[0],
    matrix[1],
    matrix[2],
    matrix[9],
    matrix[3],
    matrix[4],
    matrix[5],
    matrix[10],
    matrix[6],
    matrix[7],
    matrix[8],
    matrix[11],
    0,
    0,
    0,
    1,
  );
}

/** Match the source model's UID despite exporter case/suffix differences. */
export function findAttachmentNode(body: THREE.Object3D, wanted: string): THREE.Object3D | null {
  const names = [wanted, wanted.endsWith('-node') ? wanted.slice(0, -5) : `${wanted}-node`];
  for (const name of names) {
    const exact = body.getObjectByName(name);
    if (exact) return exact;
  }
  const normalise = (name: string): string =>
    name
      .toLowerCase()
      .replace(/[-_ ]node$/, '')
      .replace(/[-_ ]/g, '');
  const target = normalise(wanted);
  let found: THREE.Object3D | null = null;
  body.traverse(object => {
    if (!found && normalise(object.name) === target) found = object;
  });
  // One model in the user's files numbers a mount node (`…01`) where every
  // other model leaves the number off; take that node when nothing else fits.
  if (!found) {
    body.traverse(object => {
      if (!found && normalise(object.name) === `${target}01`) found = object;
    });
  }
  return found;
}

/**
 * Where a placed effect's emitters hang: a named point the effect's models
 * carry, as a holder of its own in `group`; else a node of that name drawn
 * in `roots`; else nowhere. Holders are shared by emitters naming the same
 * point. `findDrawable` is the second test alone.
 */
export function placedEffectHosts(
  models: ReadonlyArray<{ attachPoints: Readonly<Record<string, readonly number[]>> }>,
  roots: readonly THREE.Object3D[],
  group: THREE.Object3D,
): {
  attach(uid: string): THREE.Object3D | null;
  findDrawable(uid: string): THREE.Object3D | null;
} {
  const hosts = new Map<string, THREE.Object3D>();
  const findDrawable = (uid: string): THREE.Object3D | null => {
    for (const root of roots) {
      const found = root.getObjectByName(uid);
      if (found) return found;
    }
    return null;
  };
  const attach = (uid: string): THREE.Object3D | null => {
    const made = hosts.get(uid);
    if (made) return made;
    for (const model of models) {
      const matrix = model.attachPoints[uid];
      if (!matrix) continue;
      const host = new THREE.Group();
      host.applyMatrix4(rowMatrix(matrix));
      host.matrixAutoUpdate = false;
      group.add(host);
      hosts.set(uid, host);
      return host;
    }
    // Some effects hang off visible geometry rather than a dummy.
    const found = findDrawable(uid);
    if (found) hosts.set(uid, found);
    return found;
  };
  return { attach, findDrawable };
}

/**
 * The node a worn item's effect hangs from: the named node in the item, or a
 * holder made at the provider's matrix where the model drops it (a staff's
 * tip); null when there is neither.
 */
export function itemEffectHost(
  item: THREE.Object3D,
  node: string,
  matrix: readonly number[] | null | undefined,
): THREE.Object3D | null {
  const found = findAttachmentNode(item, node);
  if (found || !matrix) return found;
  const host = new THREE.Group();
  host.name = node;
  host.applyMatrix4(rowMatrix(matrix));
  host.matrixAutoUpdate = false;
  item.add(host);
  return host;
}
