/**
 * Turning a decoded `.beff` into the renderer-neutral effect vocabulary.
 *
 * `formats/beff.ts` returns the file's fields as numbers and flags; this layer
 * names them in `types.ts` terms and resolves texture references, so the
 * renderer never sees a format detail.
 */

import type {
  EffectAffector,
  EffectBlend,
  EffectCurve,
  EffectData,
  EffectEmitter,
  EffectModel,
  EffectParticle,
  QuadAnchor,
  EffectVec3,
  EmitterShape,
  ParticleShape,
} from '../types';
import {
  BlendMode,
  QuadKind,
  SpawnShape,
  type BeffAffector,
  type BeffEmitter,
  type BeffFile,
  type BeffParticleLook,
  type BeffTrack,
} from '../formats/beff';
import type { Library } from '../vfs/Library';
import { Bdae } from '../formats/bdae';
import { unwrapBdae } from '../vfs/zip';

/** Effect models ship with everything else. */
const MODEL_PACKS = ['res.bin', 'res_t.bin'];

const EMITTER_SHAPES: Record<number, EmitterShape> = {
  [SpawnShape.point]: 'point',
  [SpawnShape.sphere]: 'sphere',
  [SpawnShape.disc]: 'disc',
  [SpawnShape.box]: 'box',
  [SpawnShape.carrier]: 'carrier',
};

const PARTICLE_SHAPES: Record<number, ParticleShape> = {
  [QuadKind.sprite]: 'sprite',
  [QuadKind.freeQuad]: 'freeQuad',
  [QuadKind.streak]: 'streak',
  [QuadKind.facingStreak]: 'facingStreak',
  [QuadKind.ribbon]: 'ribbon',
  [QuadKind.facingRibbon]: 'facingRibbon',
};

const BLENDS: Record<number, EffectBlend> = {
  [BlendMode.alpha]: 'alpha',
  [BlendMode.additive]: 'additive',
};

/** Anchor grid index 0, 1, 2 along one axis of the quad. */
const ANCHORS: QuadAnchor[] = ['center', 'start', 'end'];

/** A lifeFrames this large means the particle lives as long as the effect. */
const LIFELONG_FRAMES = 1_000_000;

/** Both sides store keys as `{ frame, value }`, so a track crosses as it is. */
const curve = <T>(t: BeffTrack<T>): EffectCurve<T> => t;

function affector(a: BeffAffector): EffectAffector {
  switch (a.kind) {
    case 'pull':
      return { kind: 'pull', strength: curve(a.strength), direction: curve(a.direction) };
    case 'speedScale':
      return { kind: 'speedScale', factor: curve(a.factor) };
    case 'wander':
      return {
        kind: 'wander',
        amplitude: [...a.amplitude] as EffectVec3,
        changeEveryFrames: a.changeEveryFrames,
      };
    case 'swirl':
      return {
        kind: 'swirl',
        strength: curve(a.strength),
        axis: curve(a.axis),
        swirlMode: a.swirlMode,
      };
  }
}

/** The two bits of an inherit mask: bit 0 moves with the emitter, bit 1 turns with it. */
const MOVES_BIT = 1;
const TURNS_BIT = 2;

const inherits = (mask: number) => ({
  movesWithEmitter: (mask & MOVES_BIT) !== 0,
  turnsWithEmitter: (mask & TURNS_BIT) !== 0,
});

function particle(p: BeffParticleLook, texture: string): EffectParticle {
  return {
    shape: PARTICLE_SHAPES[p.quadKind] ?? 'sprite',
    ...inherits(p.inheritMask),
    lifeFrames: p.lifeFrames,
    lifelong: p.lifeFrames >= LIFELONG_FRAMES,
    lifeJitter: p.lifeJitterPct,
    sizeJitter: p.sizeJitterPct,
    lockAspect: p.lockAspect,
    startTilt: [...p.startTilt] as EffectVec3,
    startTiltJitter: [...p.startTiltJitterPct] as EffectVec3,
    spinJitter: [...p.spinJitterPct] as EffectVec3,
    growJitter: p.growJitterPct,
    blend: BLENDS[p.blendMode] ?? 'alpha',
    anchorColumn: ANCHORS[p.anchorColumn] ?? 'center',
    anchorRow: ANCHORS[p.anchorRow] ?? 'center',
    mirrorU: p.mirrorU,
    mirrorV: p.mirrorV,
    uvQuarterTurns: p.uvQuarterTurns & 3,
    texture,
    tintR: curve(p.red),
    tintG: curve(p.green),
    tintB: curve(p.blue),
    opacityCurve: curve(p.opacity),
    sizeX: curve(p.width),
    sizeY: curve(p.height),
    spinX: curve(p.spinX),
    spinY: curve(p.spinY),
    spinZ: curve(p.spinZ),
    growX: curve(p.growX),
    growY: curve(p.growY),
  };
}

function emitter(e: BeffEmitter, textures: Map<string, string>): EffectEmitter {
  const { settings: s, tracks: t } = e;
  return {
    attachPoint: e.attachPoint,
    shape: EMITTER_SHAPES[s.spawnShape] ?? 'point',
    faceCamera: s.faceCamera,
    ...inherits(s.inheritMask),
    activeFrames: s.activeFrames,
    firstBurstFrame: s.firstBurstFrame,
    burstSpacing: s.burstEveryFrames,
    burstSpacingJitter: s.burstSpacingJitterPct,
    burstSizeJitter: s.burstSizeJitterPct,
    radialSpeedJitter: s.radialSpeedJitterPct,
    aimSpeedJitter: s.aimSpeedJitterPct,
    killParticlesWithEmitter: s.killParticlesWithEmitter,
    spawnSize: [curve(t.shapeSizeX), curve(t.shapeSizeY), curve(t.shapeSizeZ)],
    hollowPct: curve(t.hollowPct),
    emitterAngle: [curve(t.emitterAngleX), curve(t.emitterAngleY), curve(t.emitterAngleZ)],
    emitterOffset: [curve(t.emitterOffsetX), curve(t.emitterOffsetY), curve(t.emitterOffsetZ)],
    emitterScale: [curve(t.emitterScaleX), curve(t.emitterScaleY), curve(t.emitterScaleZ)],
    burstSize: curve(t.burstSize),
    radialSpeed: curve(t.radialSpeed),
    aimSpeed: curve(t.aimSpeed),
    spreadAngle: curve(t.spreadDegrees),
    aimAxis: curve(t.aimDirection),
    particle: particle(e.look, textures.get(e.look.textureName) ?? ''),
    affectors: e.affectors.map(affector),
    children: e.children.map(c => emitter(c, textures)),
  };
}

/** Every texture named anywhere in the effect, resolved against the packs. */
async function resolveTextures(lib: Library, effect: BeffFile): Promise<Map<string, string>> {
  const wanted = new Set<string>();
  const walk = (e: BeffEmitter): void => {
    if (e.look.textureName) wanted.add(e.look.textureName);
    for (const c of e.children) walk(c);
  };
  for (const node of effect.nodes) {
    if (node.kind === 'emitter') walk(node.emitter);
    else if (node.carrier) walk(node.carrier);
  }

  const out = new Map<string, string>();
  for (const name of wanted) {
    // Effects name a bare filename. `resolveTexture` already searches by
    // basename, so the name is its own reference when it resolves at all.
    const hit = await lib.resolveTexture(name).catch(() => null);
    if (hit) out.set(name, name);
  }
  return out;
}

/**
 * The named nodes of an effect's model.
 *
 * Read straight from the BDAE rather than through `ModelData`, which requires
 * drawable geometry and throws without it — and an effect's model may have
 * none at all.
 */
async function attachPoints(lib: Library, path: string): Promise<Record<string, number[]>> {
  try {
    const bytes = await lib.readFirst(MODEL_PACKS, path);
    if (!bytes) return {};
    const { payload } = await unwrapBdae(bytes);
    const doc = new Bdae(payload);
    return Object.fromEntries(doc.attachPoints());
  } catch {
    return {};
  }
}

export async function buildEffect(
  lib: Library,
  path: string,
  effect: BeffFile,
): Promise<EffectData> {
  const textures = await resolveTextures(lib, effect);

  const models: EffectModel[] = [];
  const emitters: EffectEmitter[] = [];
  for (const node of effect.nodes) {
    if (node.kind === 'emitter') {
      emitters.push(emitter(node.emitter, textures));
      continue;
    }
    models.push({
      model: node.meshPath,
      loop: node.meshRepeats,
      alpha: curve(node.meshOpacity),
      attachPoints: await attachPoints(lib, node.meshPath),
      animation: node.carrier ? emitter(node.carrier, textures) : null,
    });
  }

  return {
    path,
    // Own choice: the header delay is read as milliseconds.
    delayMin: effect.startDelayLow,
    delayMax: effect.startDelayHigh,
    models,
    emitters,
  };
}
