/**
 * The flowing-water material: its fallback, the switch to a loaded program,
 * and what that program is fed. The program text is a stand-in written here.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWaterfallMaterial, prepareWaterfallTexture } from '../src/renderer/waterfallShader';

const STAND_IN = {
  vertex: [
    'attribute vec2 TexCoord0;',
    'attribute vec4 Vertex;',
    'varying vec2 slide;',
    'void main() {',
    '  slide = TexCoord0;',
    '  gl_Position = vec4(Vertex.xyz, 1.0);',
    '}',
  ].join('\n'),
  fragment: [
    'varying vec2 slide;',
    'uniform sampler2D texture_diffuse;',
    'void main() { gl_FragColor = texture2D(texture_diffuse, slide); }',
  ].join('\n'),
};

describe('the flowing-water material', () => {
  it('stays on its own program until both the loaded text and the texture are in', () => {
    const m = createWaterfallMaterial(false);
    expect(m.path).toBe('fallback');
    m.useProgram(STAND_IN);
    expect(m.path).toBe('fallback');
    m.uniforms.map.value = new THREE.Texture();
    m.uniforms.uHasMap.value = 1;
    expect(m.choosePath()).toBe('loaded');
    expect(m.vertexShader).toContain('attribute vec4 position;');
    expect(m.vertexShader).toContain('attribute vec2 uv;');
  });

  it('keeps the fallback where the build ships no program', () => {
    const m = createWaterfallMaterial(true);
    m.useProgram(null);
    m.uniforms.uHasMap.value = 1;
    expect(m.choosePath()).toBe('fallback');
    expect(m.side).toBe(THREE.DoubleSide);
  });

  it('binds the texture and the clock once, for both programs', () => {
    const m = createWaterfallMaterial(false);
    const texture = new THREE.Texture();
    m.uniforms.map.value = texture;
    m.uniforms.uTime.value = 12;
    expect(m.uniforms.texture_diffuse.value).toBe(texture);
    expect(m.uniforms.time.value).toBe(12);
  });

  it('feeds the view as it draws, fog distance included', () => {
    const m = createWaterfallMaterial(false);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x808080, 5, 50);
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 0, 10);
    camera.updateMatrixWorld();
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    mesh.updateMatrixWorld();
    mesh.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, mesh.matrixWorld);
    m.onBeforeRender(null as never, scene, camera, mesh.geometry, mesh);
    expect(m.uniforms.fogstartend.value.toArray()).toEqual([5, 50]);
    const e = m.uniforms.WorldViewT.value.elements;
    expect(e[8] * 0 + e[9] * 0 + e[10] * 0 + e[11]).toBeCloseTo(10, 6);
    expect(m.uniformsNeedUpdate).toBe(true);
  });

  it('takes its texture undecoded and tiling', () => {
    const texture = new THREE.Texture();
    prepareWaterfallTexture(texture);
    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
    expect(texture.wrapS).toBe(THREE.RepeatWrapping);
    expect(texture.wrapT).toBe(THREE.RepeatWrapping);
  });
});
