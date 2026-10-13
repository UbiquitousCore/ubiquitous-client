/**
 * Sampling an effect curve at a frame. Own choices: linear between keys,
 * held before the first and after the last; a loop repeats every (last -
 * first) frames, closing seamlessly for tracks that end where they start.
 */

import * as THREE from 'three';

import type { EffectCurve, EffectVec3 } from '../assets/types';

type Key<T> = { frame: number; value: T };

/**
 * The two keys around `frame` and how far between them it sits (0..1), after
 * wrapping a looping curve. `null` for a curve with no keys.
 */
function bracket<T>(curve: EffectCurve<T>, frame: number): [Key<T>, Key<T>, number] | null {
  const keys = curve.keys;
  const n = keys.length;
  if (n === 0) return null;
  const first = keys[0]!;
  const last = keys[n - 1]!;
  let t = frame;
  const period = last.frame - first.frame;
  if (curve.loop && period > 0) {
    const start = first.frame;
    t = start + ((((t - start) % period) + period) % period);
  }
  if (t <= first.frame) return [first, first, 0];
  if (t >= last.frame) return [last, last, 0];
  let hi = 1;
  while (keys[hi]!.frame <= t) hi++;
  const a = keys[hi - 1]!;
  const b = keys[hi]!;
  return [a, b, (t - a.frame) / (b.frame - a.frame)];
}

/** The value of a number curve at `frame`; `fallback` when it has no keys. */
export function curveAt(curve: EffectCurve<number>, frame: number, fallback = 0): number {
  const hit = bracket(curve, frame);
  if (!hit) return fallback;
  const [a, b, f] = hit;
  return a.value + (b.value - a.value) * f;
}

/** The value of a vector curve at `frame`, written into `out`. */
export function curveVec3At(
  curve: EffectCurve<EffectVec3>,
  frame: number,
  out: THREE.Vector3,
  fallback: EffectVec3 = [0, 0, 0],
): THREE.Vector3 {
  const hit = bracket(curve, frame);
  if (!hit) return out.fromArray(fallback);
  const [a, b, f] = hit;
  return out.set(
    a.value[0] + (b.value[0] - a.value[0]) * f,
    a.value[1] + (b.value[1] - a.value[1]) * f,
    a.value[2] + (b.value[2] - a.value[2]) * f,
  );
}

/** The frame of a curve's last key, or 0 for an empty curve. */
export function curveEnd(curve: EffectCurve<unknown>): number {
  const keys = curve.keys;
  return keys.length ? keys[keys.length - 1]!.frame : 0;
}
