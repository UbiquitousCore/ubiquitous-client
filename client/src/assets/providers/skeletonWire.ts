/**
 * Skeleton/animation translation: node matrices (3 basis rows + translation),
 * conjugated quaternions, mixed whole-vector/per-component channels, and
 * an angle-about-the-bind-axis channel - all resolved so everything above
 * sees whole positions, quaternions and scales.
 */

import type { AnimationClipData, AnimationTrack, BoneData, SkeletonData, SkinData } from '../types';

/** Key-time units per second: an idle spanning 0..60 lasts two seconds. */
const KEY_UNITS_PER_SECOND = 30;

/**
 * What each channel kind a model file uses moves, by the number the file
 * gives it. Kinds 6 and 11-13 appear in no model in either build, so they
 * have no entry and a channel of one of them is skipped like any other
 * unknown kind.
 */
const Kind = {
  /** The whole shift from the bind position, three values per key. */
  shift: 1,
  /** The shift along one axis, one value per key. */
  alongX: 2,
  alongY: 3,
  alongZ: 4,
  /** The whole turn, a stored-conjugated quaternion per key. */
  turn: 5,
  /** One quaternion component, patched over the bind turn. */
  turnY: 7,
  turnZ: 8,
  /** A turn in radians about the bind turn's own axis. */
  angleOnBindAxis: 9,
  /** The whole size, three values per key. */
  size: 10,
  /** A morph weight; `member` names the target, since a controller may have more targets than curves. */
  blendWeight: 14,
} as const;

// — wire shapes -------------------------------------------------------

export interface WireNode {
  id?: string;
  name?: string;
  sid?: string;
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  children?: WireNode[];
}

export interface WireSkin {
  name?: string;
  source?: string;
  jointNames?: string[];
  bindPoses?: number[][];
  bindShape?: number[];
  weights?: Array<{ indices: number[]; weights: number[] }>;
}

export interface WireSkeleton {
  roots?: WireNode[];
  skins?: Record<string, WireSkin>;
}

interface WireSamplerSource {
  components?: number;
  values?: number[];
}
interface WireSampler {
  input?: WireSamplerSource;
  output?: WireSamplerSource;
}
interface WireChannel {
  target?: string;
  type?: number;
  member?: number | null;
}

/**
 * What a morph-weight channel's target resolves to: the mesh the controller
 * deforms, and how many blend shapes it has. Keyed by controller id.
 */
export type MorphBindings = Map<string, { mesh: string; targets: number }>;
export interface WireClip {
  id?: string;
  channels?: WireChannel[];
  samplers?: WireSampler[];
}

// — skeleton ----------------------------------------------------------

/** Stored quaternions are conjugated. Undo it once, here. */
function conjugate(q: number[] | undefined): [number, number, number, number] {
  if (!q || q.length < 4) return [0, 0, 0, 1];
  return [-q[0], -q[1], -q[2], q[3]];
}

function vec3(v: number[] | undefined, fallback: number): [number, number, number] {
  if (!v || v.length < 3) return [fallback, fallback, fallback];
  return [v[0], v[1], v[2]];
}

/** Widen a 3-basis-rows-plus-translation matrix into a 4x4. */
function widen(m: number[]): number[] {
  if (m.length === 16) return m;
  if (m.length !== 12) return IDENTITY_16.slice();
  return [m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, m[9], m[10], m[11], 1];
}

const IDENTITY_16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function toSkeleton(path: string, wire: WireSkeleton): SkeletonData {
  const bones: BoneData[] = [];
  const indexById = new Map<string, number>();
  const indexBySid = new Map<string, number>();
  const indexByName = new Map<string, number>();

  const walk = (node: WireNode, parent: number): void => {
    const id = node.id ?? node.name ?? `bone${bones.length}`;
    const index = bones.length;
    bones.push({
      id,
      name: node.name ?? id,
      sid: node.sid ?? '',
      position: vec3(node.translation, 0),
      quaternion: conjugate(node.rotation),
      scale: vec3(node.scale, 1),
      parent,
    });
    indexById.set(id, index);
    if (node.sid) indexBySid.set(node.sid, index);
    if (node.name) indexByName.set(node.name, index);
    for (const child of node.children ?? []) walk(child, index);
  };

  for (const root of wire.roots ?? []) walk(root, -1);

  const skins: SkinData[] = [];
  for (const skin of Object.values(wire.skins ?? {})) {
    const built = toSkin(skin, indexBySid, indexByName);
    if (built) skins.push(built);
  }

  return { path, bones, skins };
}

function toSkin(
  skin: WireSkin,
  bySid: Map<string, number>,
  byName: Map<string, number>,
): SkinData | null {
  // 'source' is '#body_01-mesh'; the mesh names in ModelData have no '#'.
  const mesh = (skin.source ?? skin.name ?? '').replace(/^#/, '').replace(/-skin$/, '');
  const jointNames = skin.jointNames ?? [];
  const weights = skin.weights ?? [];
  if (mesh === '' || jointNames.length === 0 || weights.length === 0) return null;

  // Skins address joints by sid ('Bone7'); fall back to name for the few that
  // carry none. A joint that resolves to nothing is pinned to the root, which
  // is visibly wrong but does not corrupt the rest of the mesh.
  const joints = jointNames.map(n => bySid.get(n) ?? byName.get(n) ?? 0);

  const inverseBind = new Float32Array(jointNames.length * 16);
  const poses = skin.bindPoses ?? [];
  for (let j = 0; j < jointNames.length; j++) {
    inverseBind.set(widen(poses[j] ?? IDENTITY_16), j * 16);
  }

  const skinIndices = new Uint16Array(weights.length * 4);
  const skinWeights = new Float32Array(weights.length * 4);
  for (let v = 0; v < weights.length; v++) {
    const entry = weights[v];
    for (let k = 0; k < 4; k++) {
      skinIndices[v * 4 + k] = entry.indices[k] ?? 0;
      skinWeights[v * 4 + k] = entry.weights[k] ?? 0;
    }
  }

  return {
    mesh,
    joints,
    inverseBind,
    skinIndices,
    skinWeights,
    bindShape: Float32Array.from(widen(skin.bindShape ?? IDENTITY_16)),
  };
}

// — animation ---------------------------------------------------------

/** Everything one bone's channels contribute, before being made whole. */
interface BoneCurves {
  position?: Curve;
  scale?: Curve;
  rotation?: Curve;
  /** Per-axis shift patches, indexed 0..2 for x/y/z. */
  posComponent: Array<Curve | undefined>;
  /** Quaternion component patches; only y and z (1, 2) ship. */
  rotComponent: Array<Curve | undefined>;
  /** A `Kind.angleOnBindAxis` curve. */
  angle?: Curve;
}

interface Curve {
  times: number[];
  /** `stride` values per key. */
  values: number[];
  stride: number;
}

function readCurve(sampler: WireSampler | undefined): Curve | null {
  const times = sampler?.input?.values;
  const values = sampler?.output?.values;
  if (!times || !values || times.length === 0) return null;
  const stride =
    sampler?.output?.components ?? Math.max(1, Math.round(values.length / times.length));
  return { times, values, stride };
}

/** Sample a curve at `t`, holding the endpoints and lerping between keys. */
function sampleCurve(curve: Curve, t: number, out: number[]): void {
  const { times, values, stride } = curve;
  const last = times.length - 1;
  if (t <= times[0]) {
    for (let i = 0; i < stride; i++) out[i] = values[i];
    return;
  }
  if (t >= times[last]) {
    for (let i = 0; i < stride; i++) out[i] = values[last * stride + i];
    return;
  }
  let hi = 1;
  while (hi < last && times[hi] < t) hi++;
  const lo = hi - 1;
  const span = times[hi] - times[lo] || 1;
  const f = (t - times[lo]) / span;
  for (let i = 0; i < stride; i++) {
    const a = values[lo * stride + i];
    const b = values[hi * stride + i];
    out[i] = a + (b - a) * f;
  }
}

/** Resolve an animation to whole tracks: channels unioned per bone and evaluated at each key. */
export function toAnimationClip(
  name: string,
  clips: WireClip[],
  skeleton: SkeletonData,
): AnimationClipData {
  const boneById = new Map(skeleton.bones.map(b => [b.id, b]));
  const boneByName = new Map(skeleton.bones.map(b => [b.name, b]));
  const curves = new Map<string, BoneCurves>();

  for (const clip of clips) {
    const channels = clip.channels ?? [];
    const samplers = clip.samplers ?? [];
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const target = channel.target ?? '';
      const bone = boneById.get(target) ?? boneByName.get(target);
      if (!bone) continue;
      const curve = readCurve(samplers[i] ?? samplers[0]);
      if (!curve) continue;

      let entry = curves.get(bone.id);
      if (!entry) {
        entry = { posComponent: [], rotComponent: [] };
        curves.set(bone.id, entry);
      }
      assignChannel(entry, channel.type ?? 0, curve);
    }
  }

  const tracks: AnimationTrack[] = [];
  let durationTicks = 0;

  for (const [boneId, entry] of curves) {
    const bone = boneById.get(boneId)!;
    const times = unionTimes(entry);
    if (times.length === 0) continue;
    // Only curves that actually animate set the length. A single-key curve is
    // a constant pose and holds; letting one extend the clip would leave every
    // other bone frozen at its last key waiting for the loop to come round.
    if (times.length > 1) {
      durationTicks = Math.max(durationTicks, times[times.length - 1]);
    }
    tracks.push(...evaluate(bone, entry, times));
  }

  return {
    name,
    duration: (durationTicks || 1) / KEY_UNITS_PER_SECOND,
    tracks,
  };
}

/** Where each known channel kind lands on a bone's curves. */
const PLACE_CHANNEL: Readonly<Record<number, (entry: BoneCurves, curve: Curve) => void>> = {
  [Kind.shift]: (e, c) => {
    e.position = c;
  },
  [Kind.alongX]: (e, c) => {
    e.posComponent[0] = c;
  },
  [Kind.alongY]: (e, c) => {
    e.posComponent[1] = c;
  },
  [Kind.alongZ]: (e, c) => {
    e.posComponent[2] = c;
  },
  [Kind.turn]: (e, c) => {
    e.rotation = c;
  },
  [Kind.turnY]: (e, c) => {
    e.rotComponent[1] = c;
  },
  [Kind.turnZ]: (e, c) => {
    e.rotComponent[2] = c;
  },
  [Kind.angleOnBindAxis]: (e, c) => {
    e.angle = c;
  },
  [Kind.size]: (e, c) => {
    e.scale = c;
  },
};

function assignChannel(entry: BoneCurves, kind: number, curve: Curve): void {
  PLACE_CHANNEL[kind]?.(entry, curve);
}

function unionTimes(entry: BoneCurves): number[] {
  const all = new Set<number>();
  const add = (c?: Curve): void => {
    if (c) for (const t of c.times) all.add(t);
  };
  add(entry.position);
  add(entry.rotation);
  add(entry.scale);
  add(entry.angle);
  for (const c of entry.posComponent) add(c);
  for (const c of entry.rotComponent) add(c);
  return [...all].sort((a, b) => a - b);
}

function evaluate(bone: BoneData, entry: BoneCurves, times: number[]): AnimationTrack[] {
  const n = times.length;
  const hasPosition = !!entry.position || entry.posComponent.some(Boolean);
  const hasRotation = !!entry.rotation || !!entry.angle || entry.rotComponent.some(Boolean);
  const hasScale = !!entry.scale;

  const position = hasPosition ? new Float32Array(n * 3) : null;
  const quaternion = hasRotation ? new Float32Array(n * 4) : null;
  const scale = hasScale ? new Float32Array(n * 3) : null;

  const buf = [0, 0, 0, 0];
  // The bind rotation is stored conjugated on BoneData already; the axis for
  // an axis-angle channel must come from the file's unconjugated form.
  const bindStored: [number, number, number, number] = [
    -bone.quaternion[0],
    -bone.quaternion[1],
    -bone.quaternion[2],
    bone.quaternion[3],
  ];

  for (let k = 0; k < n; k++) {
    const t = times[k];

    if (position) {
      const p: [number, number, number] = [...bone.position];
      if (entry.position) {
        sampleCurve(entry.position, t, buf);
        p[0] = buf[0];
        p[1] = buf[1];
        p[2] = buf[2];
      }
      for (let a = 0; a < 3; a++) {
        const c = entry.posComponent[a];
        if (c) {
          sampleCurve(c, t, buf);
          p[a] = buf[0];
        }
      }
      position.set(p, k * 3);
    }

    if (scale) {
      const s: [number, number, number] = [...bone.scale];
      if (entry.scale) {
        sampleCurve(entry.scale, t, buf);
        s[0] = buf[0];
        s[1] = buf[1];
        s[2] = buf[2];
      }
      scale.set(s, k * 3);
    }

    if (quaternion) {
      let q: [number, number, number, number] = [...bindStored];
      if (entry.rotation) {
        sampleCurve(entry.rotation, t, buf);
        q = [buf[0], buf[1], buf[2], buf[3]];
      }
      for (let a = 0; a < 3; a++) {
        const c = entry.rotComponent[a];
        if (c) {
          sampleCurve(c, t, buf);
          q[a] = buf[0];
        }
      }
      if (entry.angle) {
        // An angle in radians about the bind turn's axis, recovered from
        // the bind quaternion's vector part.
        sampleCurve(entry.angle, t, buf);
        const sinHalf = Math.hypot(bindStored[0], bindStored[1], bindStored[2]);
        const ax = sinHalf > 1e-3 ? bindStored[0] / sinHalf : 0;
        const ay = sinHalf > 1e-3 ? bindStored[1] / sinHalf : 1;
        const az = sinHalf > 1e-3 ? bindStored[2] / sinHalf : 0;
        const half = buf[0] * 0.5;
        const sa = Math.sin(half);
        q = [ax * sa, ay * sa, az * sa, Math.cos(half)];
      }

      // Undo the stored conjugation, as for the bind pose.
      let x = -q[0],
        y = -q[1],
        z = -q[2],
        w = q[3];
      const len = Math.hypot(x, y, z, w) || 1;
      x /= len;
      y /= len;
      z /= len;
      w /= len;

      // Antipodal keys (q and -q are the same rotation) would interpolate the
      // long way round, through a near-zero quaternion, and snap the bone.
      if (k > 0) {
        const px = quaternion[(k - 1) * 4];
        const py = quaternion[(k - 1) * 4 + 1];
        const pz = quaternion[(k - 1) * 4 + 2];
        const pw = quaternion[(k - 1) * 4 + 3];
        if (px * x + py * y + pz * z + pw * w < 0) {
          x = -x;
          y = -y;
          z = -z;
          w = -w;
        }
      }
      quaternion[k * 4] = x;
      quaternion[k * 4 + 1] = y;
      quaternion[k * 4 + 2] = z;
      quaternion[k * 4 + 3] = w;
    }
  }

  const out: AnimationTrack[] = [];
  const t32 = Float32Array.from(times, t => t / KEY_UNITS_PER_SECOND);
  if (position) out.push({ bone: bone.id, property: 'position', times: t32, values: position });
  if (quaternion)
    out.push({ bone: bone.id, property: 'quaternion', times: t32, values: quaternion });
  if (scale) out.push({ bone: bone.id, property: 'scale', times: t32, values: scale });
  return out;
}

/**
 * A model's own node animation, with no skeleton: whole-value channels keyed
 * by target node name (e.g. windmill blades, watermill wheel, wings, chest
 * lid). Component channels and morph controllers handled as noted inline.
 */
export function toNodeAnimation(
  clips: WireClip[],
  path: string,
  morphs?: MorphBindings,
): AnimationClipData | null {
  const tracks: AnimationTrack[] = [];
  let durationTicks = 0;

  for (const clip of clips) {
    const channels = clip.channels ?? [];
    const samplers = clip.samplers ?? [];
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      const target = channel.target ?? '';
      if (!target) continue;

      const property =
        channel.type === Kind.shift
          ? 'position'
          : channel.type === Kind.turn
            ? 'quaternion'
            : channel.type === Kind.size
              ? 'scale'
              : channel.type === Kind.blendWeight
                ? 'morphInfluence'
                : null;
      if (!property) continue;

      const curve = readCurve(samplers[i] ?? samplers[0]);
      if (!curve) continue;
      const stride = property === 'quaternion' ? 4 : property === 'morphInfluence' ? 1 : 3;
      if (curve.stride !== stride) continue;
      if (curve.times.length < 2) continue;

      let bone = target;
      let morphIndex: number | undefined;
      if (property === 'morphInfluence') {
        const binding = morphs?.get(target);
        // A weight with no controller behind it, or one naming a target the
        // controller does not have, drives nothing — and a track bound to
        // nothing costs a mixer update every frame for no picture.
        if (!binding) continue;
        const member = channel.member ?? 0;
        if (!(member >= 0 && member < binding.targets)) continue;
        bone = binding.mesh;
        morphIndex = member;
      }

      durationTicks = Math.max(durationTicks, curve.times[curve.times.length - 1]);
      tracks.push({
        bone,
        property,
        times: Float32Array.from(curve.times, t => t / KEY_UNITS_PER_SECOND),
        values: Float32Array.from(curve.values),
        ...(morphIndex === undefined ? {} : { morphIndex }),
      });
    }
  }

  if (tracks.length === 0) return null;
  return {
    name:
      path
        .split('/')
        .pop()
        ?.replace(/\.bdae$/i, '') ?? path,
    duration: (durationTicks || 1) / KEY_UNITS_PER_SECOND,
    tracks,
  };
}
