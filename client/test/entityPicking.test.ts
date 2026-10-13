/**
 * Picking a unit out of the scene graph.
 *
 * The raycast descends into a body's whole subtree, and by the time a fight
 * is under way that subtree holds far more than the body: attached spell
 * effects, auras, weapon particles, an interaction billboard floating above
 * the head. Only the body selects the body — otherwise a large effect on a
 * character would swallow every click near them, their own included.
 *
 * `ownerOfPick` is the rule, tested directly: building a real raycast needs a
 * camera, a canvas and a GPU, and none of them are the part under test.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  isPickableEntity,
  markNotPickable,
  ownerOfPick,
  refreshSkinnedBounds,
} from '../src/renderer/picking';
import type { Entity } from '../src/world/World';

/** A body root the way the renderer builds one. */
function body(id: number): THREE.Object3D {
  const root = new THREE.Group();
  root.userData.entityId = id;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  root.add(mesh);
  return root;
}

function entityGroup(...children: THREE.Object3D[]): THREE.Group {
  const group = new THREE.Group();
  for (const child of children) group.add(child);
  return group;
}

/** The fields `isPickableEntity` reads; everything else is filler. */
function entity(kind: Entity['kind'], interactionIcon?: string): Entity {
  return {
    id: 1,
    kind,
    model: '',
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
    entry: 0,
    version: 0,
    interactionIcon,
  };
}

describe('what a raycast is allowed to land on', () => {
  it('always allows a creature or a player', () => {
    expect(isPickableEntity(entity('creature'))).toBe(true);
    expect(isPickableEntity(entity('player'))).toBe(true);
  });

  it('refuses plain scenery, static or not', () => {
    expect(isPickableEntity(entity('scenery'))).toBe(false);
    expect(isPickableEntity(entity('static'))).toBe(false);
  });

  it('allows a static object only once it has something to click', () => {
    // The bank, a mailbox, a notice board — anything `staticInteractionIcon`
    // gave a head icon to, which is what makes it a target and not scenery.
    expect(isPickableEntity(entity('static', 'ui/icons/head/ui_head_storage.png'))).toBe(true);
  });

  it('allows a static object that can be gathered from, which wears no icon', () => {
    expect(isPickableEntity({ ...entity('static'), gatherable: true })).toBe(true);
  });

  it('refuses nothing at all', () => {
    expect(isPickableEntity(undefined)).toBe(false);
  });
});

describe('who owns a raycast hit', () => {
  it('names the entity when the body itself was hit', () => {
    const root = body(7);
    const group = entityGroup(root);
    expect(ownerOfPick(root.children[0]!, group)).toBe(7);
  });

  it('names it through equipment attached to the body', () => {
    const root = body(7);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1));
    root.children[0]!.add(sword);
    const group = entityGroup(root);
    // A weapon is part of the silhouette and selects the body wearing it.
    expect(ownerOfPick(sword, group)).toBe(7);
  });

  it('disowns a hit inside an attached spell effect', () => {
    const root = body(7);
    const halo = new THREE.Group();
    markNotPickable(halo);
    const particles = new THREE.Mesh(new THREE.PlaneGeometry(8, 8));
    halo.add(particles);
    root.add(halo);
    const group = entityGroup(root);

    // Not "selects the body it hangs off": the hit is discarded outright, so
    // the pass goes on to whatever is behind it.
    expect(ownerOfPick(particles, group)).toBeNull();
  });

  it('disowns a hit inside a weapon effect, however deep', () => {
    const root = body(7);
    const hand = new THREE.Group();
    root.children[0]!.add(hand);
    const glow = new THREE.Group();
    markNotPickable(glow);
    const inner = new THREE.Group();
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(4, 4));
    inner.add(quad);
    glow.add(inner);
    hand.add(glow);

    expect(ownerOfPick(quad, entityGroup(root))).toBeNull();
  });

  it('lets a body behind an effect be selected', () => {
    // The near body carries a large effect,
    // and the far body is the one the player is aiming at. With the effect
    // ignored, the far body's own hit is the one that answers.
    const near = body(1);
    const halo = new THREE.Group();
    markNotPickable(halo);
    halo.add(new THREE.Mesh(new THREE.PlaneGeometry(8, 8)));
    near.add(halo);
    const far = body(2);
    const group = entityGroup(near, far);

    const hits = [halo.children[0]!, far.children[0]!];
    const picked = hits.map(hit => ownerOfPick(hit, group)).find(id => id !== null);
    expect(picked).toBe(2);
  });

  it('stops at the render group rather than walking out of the scene', () => {
    const root = body(7);
    const group = entityGroup(root);
    const scene = new THREE.Scene();
    scene.userData.entityId = 99;
    scene.add(group);
    expect(ownerOfPick(root.children[0]!, group)).toBe(7);
  });

  it('reports nothing for an object under no entity at all', () => {
    const loose = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    const group = entityGroup(loose);
    expect(ownerOfPick(loose, group)).toBeNull();
  });
});

describe('picking a body whose pose has changed', () => {
  /** A one-bone pillar, two units tall, standing on the origin. */
  function pillar(): { root: THREE.Group; bone: THREE.Bone } {
    const geometry = new THREE.BoxGeometry(0.5, 2, 0.5).translate(0, 1, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute(
      'skinIndex',
      new THREE.Uint16BufferAttribute(new Uint16Array(count * 4), 4),
    );
    const weights = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) weights[i * 4] = 1;
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone();
    mesh.add(bone);
    mesh.bind(new THREE.Skeleton([bone]), new THREE.Matrix4());
    const root = new THREE.Group();
    root.add(mesh);
    root.updateMatrixWorld(true);
    return { root, bone };
  }

  /** Straight down onto the ground, a unit and a half out along +X. */
  const downAt = (x: number) =>
    new THREE.Raycaster(new THREE.Vector3(x, 10, 0), new THREE.Vector3(0, -1, 0));

  it('hits a body that fell over after its bounds were first measured', () => {
    const { root, bone } = pillar();
    // Measured standing, as a first frame or a first click does.
    expect(downAt(0).intersectObject(root, true).length).toBeGreaterThan(0);

    // Lies down along +X, as a corpse does.
    bone.rotation.z = -Math.PI / 2;
    root.updateMatrixWorld(true);
    refreshSkinnedBounds(root);

    expect(downAt(1.5).intersectObject(root, true).length).toBeGreaterThan(0);
  });
});
