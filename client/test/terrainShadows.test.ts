/**
 * The ground material: the sun's shadow map when the renderer draws one, the
 * switch to a loaded ground program, and where the mask's shadow is read.
 * Program text here is a stand-in written for the test.
 */

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  createTerrainMaterial,
  GROUND_AMBIENT,
  GROUND_DIFFUSE,
  lightGround,
  shadowUvTransform,
  shareTerrainAttributes,
} from '../src/renderer/terrainShader';

describe('the terrain material and real-time shadows', () => {
  it('asks Three for the light uniforms and reads the first directional shadow', () => {
    const material = createTerrainMaterial();
    expect(material.lights).toBe(true);
    expect(material.uniforms.directionalLightShadows).toBeDefined();
    expect(material.uniforms.directionalShadowMatrix).toBeDefined();
    expect(material.vertexShader).toContain('#include <shadowmap_vertex>');
    expect(material.fragmentShader).toContain('directionalShadowMap[ 0 ]');
    // Guarded, so with shadows off none of it is compiled in.
    expect(material.fragmentShader).toContain(
      '#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0',
    );
    // In shadow the ground keeps the shade's light, never black.
    expect(material.fragmentShader).toContain('mix(uGroundAmbient.rgb / allLight, vec3(1.0), lit)');
    expect(material.uniforms.uGroundAmbient).toBe(material.uniforms.light_ambient_color);
    expect(material.uniforms.uGroundDiffuse).toBe(material.uniforms.light_diffuse_color);
  });
});

const STAND_IN = {
  vertex: 'attribute vec4 Vertex;\nvoid main() { gl_Position = Vertex; }',
  fragment:
    'uniform sampler2D texture1;\nvoid main() { gl_FragColor = texture2D(texture1, vec2(0.5)); }',
};

describe('the terrain material and the loaded ground program', () => {
  it('waits for every texture its chunk names before switching over', () => {
    const material = createTerrainMaterial();
    material.expect([0, 2], true);
    material.useProgram(STAND_IN);
    expect(material.path).toBe('fallback');
    material.bindLayer(0, new THREE.Texture());
    material.bindLayer(2, new THREE.Texture());
    expect(material.path).toBe('fallback');
    material.bindMask(new THREE.Texture({ width: 64, height: 64 } as never));
    expect(material.path).toBe('loaded');
    // The same texture objects serve both programs.
    expect(material.uniforms.texture1.value).toBe(material.uniforms.uBase.value);
    expect(material.uniforms.texture4.value).toBe(material.uniforms.uMask.value);
  });

  it('keeps the sun shadow on the loaded program too', () => {
    const material = createTerrainMaterial();
    material.useProgram(STAND_IN);
    expect(material.path).toBe('loaded');
    expect(material.vertexShader).toContain('#include <shadowmap_vertex>');
    expect(material.vertexShader).toContain('vGroundNormal = normalize(');
    expect(material.fragmentShader).toContain('mix(uGroundAmbient.rgb / allLight, vec3(1.0), lit)');
  });

  it('keeps the fallback where the build ships no ground program', () => {
    const material = createTerrainMaterial();
    material.useProgram(null);
    expect(material.path).toBe('fallback');
  });

  it('gives the geometry the loaded names as second names for the same data', () => {
    const geometry = new THREE.BufferGeometry();
    const position = new THREE.BufferAttribute(new Float32Array(9), 3);
    geometry.setAttribute('position', position);
    geometry.setAttribute('maskUv', new THREE.BufferAttribute(new Float32Array(6), 2));
    shareTerrainAttributes(geometry);
    expect(geometry.getAttribute('Vertex')).toBe(position);
    expect(geometry.getAttribute('TexCoord1')).toBe(geometry.getAttribute('maskUv'));
  });
});

describe('where the shadow channel of a tile mask is read', () => {
  it('puts the first and last vertex on the centres of the first and last texel', () => {
    const { scale, offset } = shadowUvTransform(64);
    expect(0 * scale + offset).toBeCloseTo(0.5 / 64, 10);
    expect(1 * scale + offset).toBeCloseTo(63.5 / 64, 10);
  });

  it('follows the width of the mask that actually loaded', () => {
    const material = createTerrainMaterial();
    material.bindMask(new THREE.Texture({ width: 32, height: 32 } as never));
    const { scale, offset } = shadowUvTransform(32);
    expect(material.uniforms.uShadowUv.value.toArray()).toEqual([scale, offset]);
    const e = material.uniforms.texture_matrix.value.elements;
    expect([e[0], e[12]]).toEqual([scale, offset]);
  });
});

describe('the ground’s light', () => {
  it('is the zone’s sun and shade at the ground’s strengths, on every tile at once', () => {
    const one = createTerrainMaterial();
    const two = createTerrainMaterial();
    lightGround([1, 0.5, 0], [0, 0.5, 1]);
    try {
      for (const material of [one, two]) {
        expect(material.uniforms.light_diffuse_color.value.toArray()).toEqual([
          GROUND_DIFFUSE,
          GROUND_DIFFUSE * 0.5,
          0,
          1,
        ]);
        expect(material.uniforms.light_ambient_color.value.toArray()).toEqual([
          0,
          GROUND_AMBIENT * 0.5,
          GROUND_AMBIENT,
          1,
        ]);
      }
    } finally {
      lightGround();
    }
    expect(one.uniforms.light_ambient_color.value.toArray()).toEqual([
      GROUND_AMBIENT,
      GROUND_AMBIENT,
      GROUND_AMBIENT,
      1,
    ]);
  });
});
