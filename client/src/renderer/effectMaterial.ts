import * as THREE from 'three';
import { INSTANCE_ALPHA } from './EffectFactory';

const NEWLINE = String.fromCharCode(10);

/** Additive particles fade to nothing in fog, not toward fog colour, or a spark becomes a glowing tile. */
export const ADDITIVE_FOG_FRAGMENT = [
  '#ifdef USE_FOG',
  '  #ifdef FOG_EXP2',
  '    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );',
  '  #else',
  '    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );',
  '  #endif',
  '  gl_FragColor.rgb *= 1.0 - fogFactor;',
  '#endif',
].join(NEWLINE);

/** A fourth colour channel (an attribute, multiplied after sampling) and light-removing fog for additive art. */
export function patchEffectShader(
  shader: { vertexShader: string; fragmentShader: string },
  additive: boolean,
): void {
  shader.vertexShader = shader.vertexShader.replace(
    'void main() {',
    [
      `attribute float ${INSTANCE_ALPHA};`,
      'varying float vInstanceAlpha;',
      'void main() {',
      `  vInstanceAlpha = ${INSTANCE_ALPHA};`,
    ].join(NEWLINE),
  );
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', ['varying float vInstanceAlpha;', 'void main() {'].join(NEWLINE))
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>${NEWLINE}  diffuseColor.a *= vInstanceAlpha;`,
    );
  if (additive)
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      ADDITIVE_FOG_FRAGMENT,
    );
}

/** One particle material for a texture and blend mode; the caller caches it. */
export function createEffectMaterial(blend: string): THREE.MeshBasicMaterial {
  const additive = blend !== 'alpha';
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    // Additive is most of them: the art is lit sprites on black, and alpha
    // blending them over the scene reads as grey boxes.
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  material.onBeforeCompile = shader => patchEffectShader(shader, additive);
  // Three keys compiled programs by the hook's source text, which is the
  // same for both kinds; the fog they compile to is not.
  material.customProgramCacheKey = () => (additive ? 'effect-additive' : 'effect-alpha');
  return material;
}
