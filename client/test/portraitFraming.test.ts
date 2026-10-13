/**
 * The portrait camera: through the camera node a character model ships,
 * else on its head node, else from its box; and the still pose it is taken
 * in.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { framePortrait, headOf, shippedCamera } from '../src/renderer/portraitFraming';
import { holdStill } from '../src/renderer/portrait';

/** A body 2 tall, 0.6 wide, 0.4 deep, feet at the origin. */
function body(): THREE.Box3 {
  return new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.2), new THREE.Vector3(0.3, 2, 0.2));
}

const yaw = (radians: number) =>
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), radians);
const node = (name: string, at: [number, number, number]) => {
  const one = new THREE.Object3D();
  one.name = name;
  one.position.set(...at);
  return one;
};

describe('shippedCamera', () => {
  /** A rig whose icon node stands in front of the face, its −Y towards it. */
  function rig() {
    const root = new THREE.Group();
    const icon = node('Dummy_icon-node', [0, 1.7, 0.5]);
    // Turned so that local −Y is world −Z and local −Z is world +Y.
    icon.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(0, -1, 0),
      ),
    );
    root.add(icon);
    root.position.set(10, 0, 0);
    root.updateMatrixWorld(true);
    return root;
  }

  it('stands on the icon node and looks down its −Y', () => {
    const camera = shippedCamera(rig())!;
    expect(camera.position.toArray().map(v => +v.toFixed(6))).toEqual([10, 1.7, 0.5]);
    const looks = camera.target.clone().sub(camera.position);
    expect(looks.z).toBeCloseTo(-1, 6);
  });

  it('takes only the node spelt Dummy_icon, not a beast’s Dummy_Icon', () => {
    const beast = new THREE.Group();
    beast.add(node('Dummy_Icon-node', [1, 1, 1]));
    beast.updateMatrixWorld(true);
    expect(shippedCamera(beast)).toBeNull();
  });

  it('swings the node’s view round square to the body’s front, as far off and as high', () => {
    // The node stands off the body's right shoulder, 0.5 out and a little up,
    // looking at a point on the body’s axis at 1.7.
    const root = new THREE.Group();
    const at = new THREE.Vector3(-0.3, 2, 0.4);
    const icon = node('Dummy_icon-node', at.toArray() as [number, number, number]);
    icon.lookAt(new THREE.Vector3(0, 1.7, 0));
    // lookAt aims +Z; the node's −Y must aim instead.
    icon.rotateX(Math.PI / 2);
    root.add(icon);
    root.updateMatrixWorld(true);
    const shot = framePortrait(body(), yaw(0), shippedCamera(root));
    expect(shot.target.x).toBeCloseTo(0, 5);
    expect(shot.target.y).toBeCloseTo(1.7, 5);
    expect(shot.position.x).toBeCloseTo(0, 5);
    expect(shot.position.z).toBeCloseTo(0.5, 5);
    expect(shot.position.y).toBeCloseTo(2, 5);
    expect(shot.up.toArray()).toEqual([0, 1, 0]);
    expect(shot.fov).toBe(40);
    // Turned with the body.
    const back = framePortrait(body(), yaw(Math.PI), shippedCamera(root));
    expect(back.position.z).toBeCloseTo(-0.5, 5);
  });

  it('keeps the face in the middle whatever the body carries on its back', () => {
    // The same node, and a bow slung across the back reaching out past the
    // left shoulder and above the head: the body's box grows that way, and
    // the face must not follow it.
    const root = new THREE.Group();
    const icon = node('Dummy_icon-node', [-0.3, 2, 0.4]);
    icon.lookAt(new THREE.Vector3(0, 1.7, 0));
    icon.rotateX(Math.PI / 2);
    root.add(icon);
    root.updateMatrixWorld(true);
    const slung = body().union(
      new THREE.Box3(new THREE.Vector3(0.2, 0.8, -0.5), new THREE.Vector3(0.9, 2.4, -0.2)),
    );
    const head = new THREE.Vector3(0, 1.75, 0);
    const shot = framePortrait(slung, yaw(0), shippedCamera(root), head);
    expect(shot.target.x).toBeCloseTo(0, 5);
    expect(shot.target.z).toBeCloseTo(0, 5);
    expect(shot.target.y).toBeCloseTo(1.7, 5);
  });
});

describe('framePortrait from the head node', () => {
  it('looks at the head from the front, three head-heights off', () => {
    const head = new THREE.Vector3(0, 1.6, 0);
    const shot = framePortrait(body(), yaw(0), null, head);
    expect(shot.target.toArray()).toEqual([0, 1.6, 0]);
    expect(shot.position.distanceTo(head)).toBeCloseTo(3 * 0.4, 6);
    expect(shot.position.z).toBeGreaterThan(1);
    expect(shot.position.y).toBeGreaterThan(head.y);
  });

  it('finds the head node by its name', () => {
    const root = new THREE.Group();
    root.add(node('Dummy_Head_Effect-node', [0, 2.4, 0]), node('Dummy_Head-node', [0, 1.7, 0]));
    root.position.set(10, 0, 0);
    root.updateMatrixWorld(true);
    expect(headOf(root)?.toArray()).toEqual([10, 1.7, 0]);
    expect(headOf(new THREE.Group())).toBeNull();
  });
});

describe('framePortrait from the box', () => {
  it('looks level at 84% of the height, square from the front, a little above', () => {
    const shot = framePortrait(body(), yaw(0));
    expect(shot.target.toArray().map(v => +v.toFixed(6))).toEqual([0, 1.68, 0]);
    expect(shot.position.x).toBeCloseTo(0, 6);
    expect(shot.position.z).toBeGreaterThan(0.5);
    expect(shot.position.y).toBeGreaterThan(shot.target.y);
    expect(shot.fov).toBe(35);
  });

  it('stands 1.1 of the broadest level extent away, and turns with the body', () => {
    const long = new THREE.Box3(new THREE.Vector3(-0.4, 0, -1.5), new THREE.Vector3(0.4, 1, 1.5));
    const shot = framePortrait(long, yaw(Math.PI));
    expect(shot.position.distanceTo(shot.target)).toBeCloseTo(3.3, 6);
    expect(shot.position.z).toBeLessThan(-3);
  });
});

describe('holdStill', () => {
  it('stands each bone as its file does for the picture, then puts the clip’s pose back', () => {
    const bone = new THREE.Bone();
    bone.userData.rest = { position: [0, 1, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
    bone.position.set(5, 5, 5);
    bone.quaternion.setFromEuler(new THREE.Euler(0.3, 0, 0));
    const mesh = new THREE.SkinnedMesh();
    const root = new THREE.Group();
    root.add(bone, mesh);
    const moved = bone.quaternion.clone();

    const back = holdStill(root);
    expect(bone.position.toArray()).toEqual([0, 1, 0]);
    expect(bone.quaternion.toArray()).toEqual([0, 0, 0, 1]);
    // Drawn whatever bounds it took in another pose.
    expect(mesh.frustumCulled).toBe(false);

    back();
    expect(bone.position.toArray()).toEqual([5, 5, 5]);
    expect(bone.quaternion.equals(moved)).toBe(true);
    expect(mesh.frustumCulled).toBe(true);
  });
});

describe('pulling the portrait camera back', () => {
  it('stands further off along the same line, looking at the same point', () => {
    const head = new THREE.Vector3(0, 1.7, 0);
    const near = framePortrait(body(), yaw(0), null, head);
    const far = framePortrait(body(), yaw(0), null, head, 1.3);
    expect(far.target.toArray()).toEqual(near.target.toArray());
    const nearOff = near.position.clone().sub(near.target);
    const farOff = far.position.clone().sub(far.target);
    expect(farOff.length()).toBeCloseTo(nearOff.length() * 1.3, 6);
    expect(farOff.clone().normalize().dot(nearOff.clone().normalize())).toBeCloseTo(1, 6);
    expect(far.fov).toBe(near.fov);
  });

  it('leaves the shot alone when not asked to', () => {
    const shot = framePortrait(body(), yaw(0));
    const same = framePortrait(body(), yaw(0), null, null, 1);
    expect(same.position.toArray()).toEqual(shot.position.toArray());
  });
});
