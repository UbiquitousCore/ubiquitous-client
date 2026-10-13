/**
 * Where a particle is born, which way it launches, and how jitter widens a
 * value, in emitter space. Own choices: even spread over volume and area; a
 * disc lies in XZ; a burst of n splits a disc into n sectors with a random
 * bearing in each; box sizes are full edges; spread tilts outward through
 * the birth point; draws come from `seededRandom` by effect and emitter, so a
 * spell replays the same particles (observed in play by the owner) and
 * placed copies differ (`placementSeed`); jitter is symmetric, triangular,
 * never crossing zero, its sign ignored (it is a per-field habit).
 */

import * as THREE from 'three';

import type { EmitterShape } from '../assets/types';

export type Random = () => number;

/**
 * A repeatable stream of draws in 0..1 for `key`: the same key always gives
 * the same sequence. The key is hashed with 32-bit FNV-1a and the stream is a
 * xorshift32 generator started from that hash.
 */
export function seededRandom(key: string): Random {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  // xorshift32 never leaves zero, so a zero hash starts from a fixed odd value.
  let state = hash || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

/**
 * The seed of an effect placed in the world: its path and where it stands,
 * to the hundredth of a unit, so the same placement always draws alike.
 */
export function placementSeed(path: string, at: readonly number[]): string {
  return `${path}@${at.map(value => Math.round(value * 100) / 100).join(',')}`;
}

/** Which particle of its burst this is: `index` of `count`. */
export interface BurstSlot {
  index: number;
  count: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const scratch = new THREE.Vector3();
const side = new THREE.Vector3();

/** A uniformly random unit vector. */
export function randomUnit(random: Random, out: THREE.Vector3): THREE.Vector3 {
  const y = random() * 2 - 1;
  const a = random() * Math.PI * 2;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  return out.set(r * Math.cos(a), y, r * Math.sin(a));
}

/** A birth position in the shape; `outward` is the unit direction from the centre, or zero. `hollow` is the empty share of the radius. */
export function spawnPosition(
  shape: EmitterShape,
  size: THREE.Vector3,
  hollow: number,
  slot: BurstSlot,
  random: Random,
  position: THREE.Vector3,
  outward: THREE.Vector3,
): void {
  const h = Math.min(1, Math.max(0, hollow));
  switch (shape) {
    case 'sphere': {
      randomUnit(random, outward);
      // Even over the shell's volume between radius h and 1.
      const r = Math.cbrt(h ** 3 + random() * (1 - h ** 3));
      position.set(outward.x * size.x * r, outward.y * size.y * r, outward.z * size.z * r);
      break;
    }
    case 'disc': {
      const sector = (Math.PI * 2) / Math.max(1, slot.count);
      const bearing = (slot.index + random()) * sector;
      outward.set(Math.cos(bearing), 0, Math.sin(bearing));
      // Even over the ring's area between radius h and 1.
      const r = Math.sqrt(h * h + random() * (1 - h * h));
      position.set(outward.x * size.x * r, 0, outward.z * size.z * r);
      break;
    }
    case 'box':
      position.set((random() - 0.5) * size.x, (random() - 0.5) * size.y, (random() - 0.5) * size.z);
      outward.copy(position);
      break;
    default:
      position.set(0, 0, 0);
      outward.set(0, 0, 0);
  }
  if (outward.lengthSq() < 1e-12 || position.lengthSq() < 1e-12) outward.set(0, 0, 0);
  else outward.normalize();
}

/**
 * The launch direction: `aim` normalised (straight up when it is zero),
 * tilted by a random angle up to `spreadRadians`, evenly over the cone's
 * solid angle. The tilt leans towards `outward` when it is non-zero and not
 * along the aim.
 */
export function launchDirection(
  aim: THREE.Vector3,
  spreadRadians: number,
  outward: THREE.Vector3,
  random: Random,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (aim.lengthSq() < 1e-12) out.copy(UP);
  else out.copy(aim).normalize();
  const spread = Math.min(Math.PI, Math.abs(spreadRadians));
  if (spread < 1e-6) return out;

  const cosTilt = 1 - random() * (1 - Math.cos(spread));
  const tilt = Math.acos(Math.min(1, Math.max(-1, cosTilt)));

  // The direction to lean in, perpendicular to the aim.
  side.copy(outward).addScaledVector(out, -outward.dot(out));
  if (side.lengthSq() < 1e-8) {
    randomUnit(random, scratch);
    side.copy(scratch).addScaledVector(out, -scratch.dot(out));
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0).addScaledVector(out, -out.x);
  }
  side.normalize();
  return out.multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt)).normalize();
}

/** The radial launch direction: `outward`, or a random one when there is none. */
export function radialDirection(
  outward: THREE.Vector3,
  random: Random,
  out: THREE.Vector3,
): THREE.Vector3 {
  if (outward.lengthSq() > 1e-12) return out.copy(outward);
  return randomUnit(random, out);
}

/** `base` spread at random either way by up to `percent` of itself; see the header. */
export function jittered(base: number, percent: number, random: Random): number {
  const reach = Math.abs(percent) / 100;
  if (reach === 0) return base;
  // Two even draws summed peak in the middle: -1..1, centred on 0.
  const offset = random() + random() - 1;
  return base * Math.max(0, 1 + reach * offset);
}
