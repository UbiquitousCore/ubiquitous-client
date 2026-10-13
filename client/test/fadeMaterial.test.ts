/**
 * The dissolve a model fades in and out with, as far as a shader string can
 * be checked: where the fade comes from for a batch row and for a single
 * object, and that the instance colour no longer tints.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  fadeClone,
  isFadeMaterial,
  patchFadeMaterial,
  setFade,
} from '../src/renderer/fadeMaterial';

function compile(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: '#include <common>\nvoid main() {\n  #include <color_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n  #include <alphatest_fragment>\n}',
  };
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return shader;
}

describe('patchFadeMaterial', () => {
  it("reads a batch row's fade from the instance colour and never tints with it", () => {
    const material = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const shader = compile(material);
    expect(shader.vertexShader).toContain('vInstanceFade = instanceColor.r;');
    expect(shader.vertexShader).not.toContain('vColor.rgb *= instanceColor.rgb');
    // The vertex colour multiply itself is kept.
    expect(shader.vertexShader).toContain('vColor.rgb *= color;');
  });

  it('dissolves by a screen-space dither in the opaque pass', () => {
    const shader = compile(patchFadeMaterial(new THREE.MeshLambertMaterial()));
    expect(shader.fragmentShader).toContain('#include <alphatest_fragment>');
    expect(shader.fragmentShader).toContain('fadeDither(gl_FragCoord.xy) >= fadeAll) discard');
    expect(shader.fragmentShader).toContain('float fadeAll = fade * vInstanceFade;');
  });

  it("drives a single object through a uniform of the material's own", () => {
    const material = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const shader = compile(material);
    expect(shader.uniforms.fade!.value).toBe(1);
    setFade(material, 0.25);
    expect(shader.uniforms.fade!.value).toBe(0.25);
  });

  it('compiles every patched material to the same program family', () => {
    const a = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const b = patchFadeMaterial(new THREE.MeshBasicMaterial());
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
  });
});

describe('fadeClone', () => {
  it('gives the clone a uniform of its own, leaving the shared material at full fade', () => {
    const shared = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const own = fadeClone(shared)!;
    expect(own).not.toBe(shared);
    setFade(own, 0.4);
    expect(compile(own).uniforms.fade!.value).toBe(0.4);
    expect(compile(shared).uniforms.fade!.value).toBe(1);
  });

  it('declines a material that was never patched', () => {
    expect(isFadeMaterial(new THREE.ShaderMaterial())).toBe(false);
    expect(fadeClone(new THREE.ShaderMaterial())).toBeNull();
  });
});
