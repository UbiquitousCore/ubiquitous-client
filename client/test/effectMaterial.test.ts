/**
 * The particle material and its fog.
 *
 * Three's fog mixes toward the fog colour, and additive blending then adds
 * that colour over the whole quad, so a distant particle would be a glowing
 * square. Additive art instead fades the light it adds as the fog thickens.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ADDITIVE_FOG_FRAGMENT,
  createEffectMaterial,
  patchEffectShader,
} from '../src/renderer/effectMaterial';
import { INSTANCE_ALPHA } from '../src/renderer/EffectFactory';

/** The stock shader's outline: the includes the patch has to find. */
function stockShader() {
  return {
    vertexShader: 'void main() {\n  gl_Position = vec4(0.0);\n}',
    fragmentShader: [
      'void main() {',
      '  #include <color_fragment>',
      '  gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      '  #include <fog_fragment>',
      '}',
    ].join('\n'),
  };
}

describe('the particle shader patch', () => {
  it('fades additive light toward nothing with the fog, after the colour is written', () => {
    const shader = stockShader();
    patchEffectShader(shader, true);
    expect(shader.fragmentShader).not.toContain('#include <fog_fragment>');
    expect(shader.fragmentShader).toContain(ADDITIVE_FOG_FRAGMENT);
    expect(ADDITIVE_FOG_FRAGMENT).toContain('gl_FragColor.rgb *= 1.0 - fogFactor;');
    expect(ADDITIVE_FOG_FRAGMENT).not.toContain('fogColor');
    expect(shader.fragmentShader.indexOf('gl_FragColor = vec4')).toBeLessThan(
      shader.fragmentShader.indexOf(ADDITIVE_FOG_FRAGMENT),
    );
  });

  it("leaves alpha-blended art on Three's own fog", () => {
    const shader = stockShader();
    patchEffectShader(shader, false);
    expect(shader.fragmentShader).toContain('#include <fog_fragment>');
  });

  it('still multiplies the per-instance alpha in after the map is sampled', () => {
    const shader = stockShader();
    patchEffectShader(shader, true);
    expect(shader.vertexShader).toContain(`attribute float ${INSTANCE_ALPHA};`);
    expect(shader.fragmentShader).toContain(
      '#include <color_fragment>\n  diffuseColor.a *= vInstanceAlpha;',
    );
  });
});

describe('the particle material', () => {
  it('takes part in scene fog, additive by default and normal for alpha art', () => {
    const additive = createEffectMaterial('add');
    expect(additive.fog).toBe(true);
    expect(additive.blending).toBe(THREE.AdditiveBlending);
    expect(additive.transparent).toBe(true);
    expect(additive.depthWrite).toBe(false);
    const alpha = createEffectMaterial('alpha');
    expect(alpha.blending).toBe(THREE.NormalBlending);
    // The two compile to different fog, so they must not share a program.
    expect(additive.customProgramCacheKey()).not.toBe(alpha.customProgramCacheKey());
  });
});
