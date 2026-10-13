/**
 * What makes a mesh part of the sky.
 *
 * Four flags per material and one render order per mesh. Any one of them wrong
 * shows as the sky disappearing behind terrain or washing to fog colour, and
 * none of them was checked by anything before.
 */

import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  DOME_HAZE,
  HILL_HEIGHT,
  hazeSky,
  makeSky,
  makeSkyHill,
  SKY_RENDER_ORDER,
  SUN_DIRECTION,
  sunMaterial,
} from '../src/renderer/skyMaterials';

function meshWith(material: THREE.Material | THREE.Material[]): THREE.Mesh {
  return new THREE.Mesh(new THREE.BufferGeometry(), material as THREE.Material);
}

describe('turning a model into sky', () => {
  it('stops it being culled, because the dome is centred on the camera', () => {
    const mesh = meshWith(new THREE.MeshBasicMaterial());

    makeSky(mesh);

    expect(mesh.frustumCulled).toBe(false);
  });

  it('draws it before the world', () => {
    const mesh = meshWith(new THREE.MeshBasicMaterial());

    makeSky(mesh);

    expect(mesh.renderOrder).toBe(SKY_RENDER_ORDER);
    expect(SKY_RENDER_ORDER).toBeLessThan(0);
  });

  it('takes it out of the depth buffer entirely, so the world paints over it', () => {
    const material = new THREE.MeshBasicMaterial();

    makeSky(meshWith(material));

    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
  });

  it('unfogs it, because fogging the sky leaves nothing to fog toward', () => {
    const material = new THREE.MeshBasicMaterial();

    makeSky(meshWith(material));

    expect(material.fog).toBe(false);
  });

  it('asks for the material to be recompiled, or none of it takes', () => {
    const material = new THREE.MeshBasicMaterial();
    // `needsUpdate` is write-only on a Three material; setting it bumps
    // `version`, which is the observable half.
    const before = material.version;

    makeSky(meshWith(material));

    expect(material.version).toBeGreaterThan(before);
  });

  it('does every material on a multi-material mesh, not just the first', () => {
    const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];

    makeSky(meshWith(materials));

    for (const m of materials) expect(m.fog).toBe(false);
  });

  it('reaches every mesh under the model, however deep', () => {
    const root = new THREE.Object3D();
    const middle = new THREE.Object3D();
    const material = new THREE.MeshBasicMaterial();
    middle.add(meshWith(material));
    root.add(middle);

    makeSky(root);

    expect(material.depthTest).toBe(false);
  });

  it('leaves a node that is not a mesh alone', () => {
    const plain = new THREE.Object3D();

    expect(() => makeSky(plain)).not.toThrow();
    // Still culled: only meshes are sky.
    expect(plain.frustumCulled).toBe(true);
  });
});

/** Run a material's patch over a stock basic program, as three would before compiling it. */
function compiled(material: THREE.Material): THREE.WebGLProgramParametersWithUniforms {
  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.basic.vertexShader,
    fragmentShader: THREE.ShaderLib.basic.fragmentShader,
  } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
}

/** A band like a horizon layer: 34 out, standing 11 above the eye. */
function band(material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-34, 0, -34, 34, 11, 34, 34, 0, -34], 3),
  );
  return new THREE.Mesh(geometry, material);
}

describe('hazing the sky toward the fog', () => {
  it('washes the colour toward the haze by height, before tone mapping', () => {
    const material = new THREE.MeshBasicMaterial();
    const haze = new THREE.Color(0.8, 0.7, 0.6);
    hazeSky(meshWith(material), haze, DOME_HAZE);
    const shader = compiled(material);
    expect(shader.uniforms.uSkyHaze!.value).toBe(haze);
    expect(shader.uniforms.uSkyHazeFoot!.value).toBe(DOME_HAZE.foot);
    expect(shader.vertexShader).toContain('vSkyRise =');
    expect(shader.fragmentShader).toMatch(/uSkyHaze[\s\S]*#include <tonemapping_fragment>/);
  });

  it('keeps the patch the material already carries, and compiles to a program of its own', () => {
    const material = new THREE.MeshBasicMaterial();
    let ran = false;
    material.onBeforeCompile = () => {
      ran = true;
    };
    const before = material.customProgramCacheKey();
    hazeSky(meshWith(material), new THREE.Color(), DOME_HAZE);
    compiled(material);
    expect(ran).toBe(true);
    expect(material.customProgramCacheKey()).not.toBe(before);
  });

  it('patches a material handed out again once, pointing it at the new haze', () => {
    const material = new THREE.MeshBasicMaterial();
    hazeSky(meshWith(material), new THREE.Color(1, 0, 0), DOME_HAZE);
    const blue = new THREE.Color(0, 0, 1);
    hazeSky(meshWith(material), blue, DOME_HAZE);
    const shader = compiled(material);
    expect(shader.uniforms.uSkyHaze!.value).toBe(blue);
    expect(shader.fragmentShader.match(/uniform vec3 uSkyHaze;/g)).toHaveLength(1);
  });
});

describe('the horizon layer', () => {
  it('stands lower than it is built, after the dome and before the world', () => {
    const mesh = band(new THREE.MeshBasicMaterial());
    const root = new THREE.Object3D();
    root.add(mesh);
    makeSkyHill(root, new THREE.Color());
    expect(root.scale.y).toBe(HILL_HEIGHT);
    expect(mesh.renderOrder).toBeGreaterThan(SKY_RENDER_ORDER);
    expect(mesh.renderOrder).toBeLessThan(0);
  });

  it('hazes up to its own top: the sine of the angle its peaks stand at', () => {
    const material = new THREE.MeshBasicMaterial();
    makeSkyHill(band(material), new THREE.Color());
    const reach = compiled(material).uniforms.uSkyHazeReach!.value as number;
    expect(reach).toBeCloseTo(11 / Math.hypot(11, 34), 3);
  });
});

describe('the sun sprite', () => {
  it('is additive and never depth-tested, so it sits on the dome', () => {
    const material = sunMaterial();

    expect(material.blending).toBe(THREE.AdditiveBlending);
    expect(material.transparent).toBe(true);
    expect(material.fog).toBe(false);
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
  });

  it('is a fresh material each time, because the old one gets disposed', () => {
    expect(sunMaterial()).not.toBe(sunMaterial());
  });
});

describe('the sun direction', () => {
  it('is a unit vector, so everything scaling along it agrees', () => {
    expect(SUN_DIRECTION.length()).toBeCloseTo(1, 6);
  });

  it('points up and over rather than along the ground', () => {
    expect(SUN_DIRECTION.y).toBeGreaterThan(0.5);
  });

  it('stands opposite the baked shadows, which fall toward +x and +z equally', () => {
    expect(SUN_DIRECTION.x).toBeLessThan(0);
    expect(SUN_DIRECTION.z).toBeCloseTo(SUN_DIRECTION.x, 6);
  });
});
