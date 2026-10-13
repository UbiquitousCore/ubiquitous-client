/**
 * Shadows on the unlit models, and the colour switch the post-effects buffer
 * needs, as far as a shader string can be checked without a GPU.
 *
 * The one that matters most: the shadow lookup must be compiled in only
 * while a shadow map exists. A shadow sampler with nothing real behind it
 * makes WebGL refuse the draw, and every unlit model — nearly all of them —
 * vanishes.
 */

import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';

import {
  acquireFadeClone,
  patchFadeMaterial,
  releaseFadeClone,
} from '../src/renderer/fadeMaterial';
import {
  injectModelShadows,
  modelShadowGeneration,
  setModelShadowsCompiled,
  takesModelShadows,
} from '../src/renderer/modelShadows';
import { makeSky } from '../src/renderer/skyMaterials';

afterEach(() => setModelShadowsCompiled(false));

function program(): THREE.WebGLProgramParametersWithUniforms {
  return {
    uniforms: {},
    vertexShader: '#include <common>\nvoid main() {\n#include <project_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n#include <color_fragment>\n}',
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
}

describe('model shadows', () => {
  it('compile no shadow lookup while there is no shadow map', () => {
    const shader = program();
    injectModelShadows(shader);
    expect(shader.fragmentShader).not.toContain('sampler2DShadow');
  });

  it('register the shadow uniforms even while the lookup is compiled out', () => {
    // Three keeps a program per material and key but takes the uniforms of
    // the last program it built. Built with the lookup, then without, then
    // with again, a material reuses its first program with the second
    // build's uniforms: if those lack the map, the sampler lands on the
    // colour texture's unit, WebGL refuses the draw, and the model vanishes
    // the moment real-time shadows come back on.
    const shader = program();
    injectModelShadows(shader);
    expect(Object.keys(shader.uniforms)).toContain('uModelShadowMap');
    expect(Object.keys(shader.uniforms)).toContain('uModelShadowMatrix');
  });

  it('read the shadow map once one exists', () => {
    setModelShadowsCompiled(true);
    const shader = program();
    injectModelShadows(shader);
    expect(shader.fragmentShader).toContain('sampler2DShadow uModelShadowMap');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb *= modelShadow()');
    expect(shader.vertexShader).toContain('vModelShadowCoord');
    expect(Object.keys(shader.uniforms)).toContain('uModelShadowMap');
  });

  it('fall on unlit models, and not on the sky or on lit materials', () => {
    const model = new THREE.MeshBasicMaterial();
    expect(takesModelShadows(model)).toBe(true);
    expect(takesModelShadows(new THREE.MeshLambertMaterial())).toBe(false);
    const dome = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    makeSky(dome);
    expect(takesModelShadows(dome.material)).toBe(false);
  });

  it('key the program on whether the lookup is compiled in', () => {
    const material = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const off = material.customProgramCacheKey();
    setModelShadowsCompiled(true);
    expect(material.customProgramCacheKey()).not.toBe(off);
  });

  it('recompile a fade clone kept aside while the lookup was switched', () => {
    const original = patchFadeMaterial(new THREE.MeshBasicMaterial());
    const clone = acquireFadeClone(original)!;
    releaseFadeClone(original, clone);
    const before = modelShadowGeneration();
    const versionBefore = clone.version;
    setModelShadowsCompiled(true);
    expect(modelShadowGeneration()).toBe(before + 1);
    expect(acquireFadeClone(original)).toBe(clone);
    expect(clone.version).toBeGreaterThan(versionBefore);
  });
});
