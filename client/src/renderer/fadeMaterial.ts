/**
 * Dissolve fade in the opaque pass (dithered discard, no per-object opacity
 * or transparent-pass resort). Batched placements carry it in `instanceColor.r`;
 * single objects get a `fade` uniform via `fadeClone` for the fade duration.
 */

import * as THREE from 'three';

import { softenMap } from './foliageSoftness';
import {
  injectModelShadows,
  modelShadowGeneration,
  modelShadowsCompiled,
  takesModelShadows,
} from './modelShadows';

const NEWLINE = String.fromCharCode(10);

/** The uniform a fading object's own material is driven through. */
interface FadeUniform {
  value: number;
}

const FADE_VERTEX_PARS = ['varying float vInstanceFade;'].join(NEWLINE);

/** `color_vertex`, with the instance-colour multiply taken out: that channel is the fade. */
const COLOR_VERTEX_WITHOUT_INSTANCE = [
  '#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )',
  '  vColor = vec4( 1.0 );',
  '#endif',
  '#ifdef USE_COLOR_ALPHA',
  '  vColor *= color;',
  '#elif defined( USE_COLOR )',
  '  vColor.rgb *= color;',
  '#endif',
  '#ifdef USE_BATCHING_COLOR',
  '  vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );',
  '#endif',
  '#ifdef USE_INSTANCING_COLOR',
  '  vInstanceFade = instanceColor.r;',
  '#else',
  '  vInstanceFade = 1.0;',
  '#endif',
].join(NEWLINE);

const FADE_FRAGMENT_PARS = [
  'uniform float fade;',
  'varying float vInstanceFade;',
  // Interleaved gradient noise: a stable per-pixel threshold with no texture.
  'float fadeDither(vec2 p) {',
  '  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));',
  '}',
].join(NEWLINE);

const FADE_FRAGMENT = [
  '#include <alphatest_fragment>',
  '  {',
  '    float fadeAll = fade * vInstanceFade;',
  '    if (fadeAll < 0.999 && fadeDither(gl_FragCoord.xy) >= fadeAll) discard;',
  '  }',
].join(NEWLINE);

/** Whether a material carries the fade patch. */
export function isFadeMaterial(material: THREE.Material): boolean {
  return material.userData.fade !== undefined;
}

/** Add the fade to a stock material (idempotent); per-material closures, so `fadeClone` re-patches clones. */
export function patchFadeMaterial<M extends THREE.Material>(material: M): M {
  const uniform: FadeUniform = { value: 1 };
  material.userData.fade = uniform;
  material.onBeforeCompile = shader => {
    shader.uniforms.fade = uniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${NEWLINE}${FADE_VERTEX_PARS}`)
      .replace('#include <color_vertex>', COLOR_VERTEX_WITHOUT_INSTANCE);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${NEWLINE}${FADE_FRAGMENT_PARS}`)
      .replace('#include <alphatest_fragment>', FADE_FRAGMENT);
    if (takesModelShadows(material)) injectModelShadows(shader);
  };
  // Every patched material compiles to the same program family; the key is
  // the patch, not the closure instance. An unlit model reading the sun's
  // shadow map is a program of its own (`modelShadows.ts`).
  material.customProgramCacheKey = () =>
    takesModelShadows(material) && modelShadowsCompiled() ? 'fade-shadowed' : 'fade';
  return material;
}

/**
 * A material of the object's own for the length of a fade, driven through
 * `setFade`. Shares textures with the original; only the uniform is its own.
 * Null for a material that was never patched (the waterfall shader), which
 * simply does not fade.
 */
export function fadeClone(material: THREE.Material): THREE.Material | null {
  if (!isFadeMaterial(material)) return null;
  const clone = patchFadeMaterial(material.clone());
  // Re-patching drops what was layered on the fade; foliage's softness is.
  if (clone.userData.soft) softenMap(clone);
  return clone;
}

/** Spare fade clones per material, so each fade does not cost a fresh program setup. */
const spareClones = new WeakMap<THREE.Material, THREE.Material[]>();

/** Most spares kept per original; past this a returned clone is disposed. */
export const MAX_SPARE_CLONES = 64;

/**
 * A fade clone of `material`, reused if one is spare. Null for a material
 * that was never patched. Its fade starts at 1.
 */
export function acquireFadeClone(material: THREE.Material): THREE.Material | null {
  if (!isFadeMaterial(material)) return null;
  const spare = spareClones.get(material)?.pop();
  if (!spare) return fadeClone(material);
  // The original may have got its texture since this clone was made from it.
  const from = material as THREE.MeshBasicMaterial;
  const to = spare as THREE.MeshBasicMaterial;
  if (to.map !== from.map) {
    if ((to.map === null) !== (from.map === null)) to.needsUpdate = true;
    to.map = from.map;
  }
  to.color?.copy(from.color);
  to.opacity = from.opacity;
  // Kept aside while the model programs were recompiled: it recompiles now.
  if (to.userData.shadowGeneration !== modelShadowGeneration()) {
    to.userData.shadowGeneration = modelShadowGeneration();
    to.needsUpdate = true;
  }
  return spare;
}

/**
 * Hand a clone back for reuse, put back to how its original draws: anything
 * a fade, a ghost or a foliage companion changed on it is undone here, so
 * the next object to take it starts clean.
 */
export function releaseFadeClone(original: THREE.Material, clone: THREE.Material): void {
  if (clone === original) return;
  let spares = spareClones.get(original);
  if (!spares) {
    spares = [];
    spareClones.set(original, spares);
    // A disposed original takes its spares with it.
    const pool = spares;
    original.addEventListener('dispose', () => {
      for (const one of pool) one.dispose();
      pool.length = 0;
    });
  }
  if (spares.length >= MAX_SPARE_CLONES || spares.includes(clone)) {
    if (!spares.includes(clone)) clone.dispose();
    return;
  }
  setFade(clone, 1);
  if (clone.transparent !== original.transparent) {
    clone.transparent = original.transparent;
    clone.needsUpdate = true;
  }
  clone.opacity = original.opacity;
  clone.depthWrite = original.depthWrite;
  clone.polygonOffset = original.polygonOffset;
  clone.polygonOffsetFactor = original.polygonOffsetFactor;
  clone.polygonOffsetUnits = original.polygonOffsetUnits;
  spares.push(clone);
}

/** Drive a fading object's own material. No effect on an unpatched one. */
export function setFade(material: THREE.Material, fade: number): void {
  const uniform = material.userData.fade as FadeUniform | undefined;
  if (uniform) uniform.value = fade;
}

/** Stealth-state alpha: real transparency (handful of bodies, sorted pass is
 * affordable). depthWrite off; needsUpdate only on transparent flips. */
export function setGhostAlpha(material: THREE.Material, alpha: number): void {
  if (!material.transparent) {
    material.transparent = true;
    material.needsUpdate = true;
  }
  material.opacity = alpha;
  material.depthWrite = false;
}

/**
 * Put a ghosted material back the way the shared one it was cloned from is —
 * restored from that original rather than to assumed defaults, so a material
 * that was always transparent (a glass pane, a leaf card) stays that way.
 */
export function clearGhostAlpha(material: THREE.Material, original: THREE.Material): void {
  if (material.transparent !== original.transparent) {
    material.transparent = original.transparent;
    material.needsUpdate = true;
  }
  material.opacity = original.opacity;
  material.depthWrite = original.depthWrite;
}
