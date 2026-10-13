/**
 * Portrait framing: a front-facing headshot (observed in play by the owner).
 * A character with `Dummy_icon` (its -Y points at the face) is framed on that
 * line nearest the head's upright axis, from the node's distance and height,
 * squared to the body's front, 40° view; beasts' `Dummy_Icon` looks from the
 * side and is ignored. Own choices: head-node-only bodies framed from the
 * front, 5.5° up, three head-heights out; anything else from its box (84%
 * height, 1.1x its broadest extent, 35°); the front end may pull back further.
 */

import * as THREE from 'three';

export interface PortraitShot {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Which way is up in the picture. */
  up: THREE.Vector3;
  fov: number;
  near: number;
  far: number;
}

/** A line of sight a model ships: where it starts and a point along it, in the world. */
export interface ShippedCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

/** A body at yaw 0 faces +Z: `setYaw` builds its rotation from `atan2(dx, dz)`. */
const MODEL_FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** The field of view through a camera the model ships, and through one framed from the box. */
const SHIPPED_FIELD_OF_VIEW = 40;
const BOX_FIELD_OF_VIEW = 35;
const RISE = THREE.MathUtils.degToRad(5.5);
/** Where the face is, as a share of the body's height from its feet. */
const FACE_LINE = 0.84;
/** How far the camera stands, in lengths of the body's broadest level extent. */
const STANDS_OFF = 1.1;

/** The node the portrait camera stands on, and the head node, by name. */
const PORTRAIT_NODE = 'Dummy_icon-node';
const HEAD_NODE = 'Dummy_Head-node';
/** How far a head-framed camera stands, in heights of the head above its node. */
const HEADS_OFF = 3;

/**
 * The line of sight a model's `Dummy_icon` node gives, in the world, or
 * null where it has none: `target` is a point one unit down the node's −Y.
 */
export function shippedCamera(object: THREE.Object3D): ShippedCamera | null {
  const stands = named(object, PORTRAIT_NODE);
  if (!stands) return null;
  const position = stands.getWorldPosition(new THREE.Vector3());
  const back = new THREE.Vector3().setFromMatrixColumn(stands.matrixWorld, 1).normalize();
  return { position, target: position.clone().sub(back) };
}

/** Where the model's head node is in the world, or null where it has none. */
export function headOf(object: THREE.Object3D): THREE.Vector3 | null {
  return named(object, HEAD_NODE)?.getWorldPosition(new THREE.Vector3()) ?? null;
}

/** The first node under `object` called exactly `name`. */
function named(object: THREE.Object3D, name: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  object.traverse(node => {
    if (!found && node.name === name) found = node;
  });
  return found;
}

/**
 * The portrait camera for a body whose world box is `bounds`, turned by
 * `rotation`: along the line of sight it ships where it has one, else on
 * its head node `head` where it has one, else from its box; standing
 * `pullBack` times as far from what it looks at.
 */
export function framePortrait(
  bounds: THREE.Box3,
  rotation: THREE.Quaternion,
  shipped: ShippedCamera | null = null,
  head: THREE.Vector3 | null = null,
  pullBack = 1,
): PortraitShot {
  const shot = frameAt(bounds, rotation, shipped, head);
  if (pullBack === 1) return shot;
  const off = shot.position.clone().sub(shot.target).multiplyScalar(pullBack);
  return { ...shot, position: shot.target.clone().add(off), far: shot.far * pullBack };
}

/** The shot `framePortrait` takes before any pulling back. */
function frameAt(
  bounds: THREE.Box3,
  rotation: THREE.Quaternion,
  shipped: ShippedCamera | null,
  head: THREE.Vector3 | null,
): PortraitShot {
  const span = bounds.getSize(new THREE.Vector3());
  const lift = (toward: THREE.Vector3) =>
    toward.multiplyScalar(Math.cos(RISE)).addScaledVector(UP, Math.sin(RISE));
  const centre = bounds.getCenter(new THREE.Vector3());
  if (shipped) {
    // Where the node's line of sight passes nearest the body's upright axis:
    // through the head where the body has one, since its box grows with
    // whatever it carries — a bow slung across the back pulled the face to
    // one side of the picture.
    const axis = head ?? centre;
    const sight = shipped.target.clone().sub(shipped.position).normalize();
    const level = sight.x * sight.x + sight.z * sight.z;
    const along =
      level > 1e-6
        ? ((axis.x - shipped.position.x) * sight.x + (axis.z - shipped.position.z) * sight.z) /
          level
        : shipped.position.distanceTo(axis);
    const target = shipped.position.clone().addScaledVector(sight, along);
    const off = shipped.position.clone().sub(target);
    const position = target
      .clone()
      .addScaledVector(facingOf(rotation), Math.hypot(off.x, off.z))
      .addScaledVector(UP, off.y);
    const reach = position.distanceTo(centre) + span.length();
    return {
      position,
      target,
      up: UP.clone(),
      fov: SHIPPED_FIELD_OF_VIEW,
      near: reach / 1000,
      far: reach * 2,
    };
  }
  if (head) {
    const distance = Math.max(bounds.max.y - head.y, 1e-3) * HEADS_OFF;
    const position = head.clone().addScaledVector(lift(facingOf(rotation)), distance);
    return {
      position,
      target: head.clone(),
      up: UP.clone(),
      fov: SHIPPED_FIELD_OF_VIEW,
      near: distance / 50,
      far: distance * 4 + span.length(),
    };
  }
  const broadest = Math.max(span.x, span.z, 1e-3);
  const target = new THREE.Vector3(centre.x, bounds.min.y + span.y * FACE_LINE, centre.z);
  const distance = broadest * STANDS_OFF;
  const position = target.clone().addScaledVector(lift(facingOf(rotation)), distance);
  return {
    position,
    target,
    up: UP.clone(),
    fov: BOX_FIELD_OF_VIEW,
    near: distance / 50,
    far: distance * 4 + span.length(),
  };
}

/** Which way the body faces, level. */
function facingOf(rotation: THREE.Quaternion): THREE.Vector3 {
  const facing = MODEL_FORWARD.clone().applyQuaternion(rotation);
  facing.y = 0;
  return facing.lengthSq() < 1e-8 ? MODEL_FORWARD.clone() : facing.normalize();
}
