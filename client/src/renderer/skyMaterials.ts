/** What makes a mesh sky: never occluded, fogged or far-clipped, drawn first. */

import * as THREE from 'three';

/**
 * Toward the sun. Its bearing is measured: the ground's baked shadows fall
 * toward +x and +z, at 45° between them, so the sun stands the other way.
 * About 35° up is own choice; at 58° the sprite was always off-screen.
 */
export const SUN_DIRECTION = new THREE.Vector3(-0.579, 0.574, -0.579).normalize();

/** Drawn before the world (negative), and the sun just after the dome. */
export const SKY_RENDER_ORDER = -1000;
export const SUN_RENDER_ORDER = -999;

/** How far along {@link SUN_DIRECTION} the sun sprite is parked, and how big. */
export const SUN_DISTANCE = 30;
export const SUN_SIZE = 16;

/** Draw a subtree as sky: unculled (centred on the camera), first, no depth, unfogged. */
export function makeSky(object: THREE.Object3D): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.renderOrder = SKY_RENDER_ORDER;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const basic = material as THREE.MeshBasicMaterial;
      basic.fog = false;
      basic.depthWrite = false;
      basic.depthTest = false;
      // The sky takes no cast shadows; see `modelShadows.ts`.
      basic.userData.sky = true;
      basic.needsUpdate = true;
    }
  });
}

/** The sun sprite's material: additive, unfogged, and never depth-tested. */
export function sunMaterial(): THREE.SpriteMaterial {
  return new THREE.SpriteMaterial({
    blending: THREE.AdditiveBlending,
    transparent: true,
    fog: false,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * How tall the horizon layer stands, as a share of the height it is built
 * to. Own choice, by eye: at full height its peaks reach about 18 degrees
 * above the eye and read as a wall close behind the world rather than a
 * range far off.
 */
export const HILL_HEIGHT = 0.5;

/**
 * How a sky layer is washed toward the fog colour: all of `foot` at the
 * horizon, easing to `peak` at `reach` — the sine of the angle above the
 * horizon — and holding there above it.
 */
export interface SkyHaze {
  foot: number;
  peak: number;
  reach: number;
}

/**
 * The dome: all fog at the horizon, where fogged ground meets it, clearing
 * by about 20 degrees up. Own choice, so the far world fades into the sky
 * rather than standing against it in the fog's colour.
 */
export const DOME_HAZE: SkyHaze = { foot: 1, peak: 0, reach: 0.35 };

/**
 * The horizon layer: most at its foot, a little still at its peaks, which
 * are further off than anything in the world. Own choice. Its reach is its
 * own top, worked out from the model.
 */
export const HILL_HAZE = { foot: 0.75, peak: 0.35 } as const;

const HAZE_VERTEX_PARS = /* glsl */ `
uniform float uSkyHazeReach;
varying float vSkyRise;
`;
const HAZE_VERTEX = /* glsl */ `
#include <begin_vertex>
vSkyRise = clamp( normalize( position ).y / uSkyHazeReach, 0.0, 1.0 );
`;
const HAZE_FRAGMENT_PARS = /* glsl */ `
uniform vec3 uSkyHaze;
uniform float uSkyHazeFoot;
uniform float uSkyHazePeak;
varying float vSkyRise;
`;
const HAZE_FRAGMENT = /* glsl */ `
gl_FragColor.rgb = mix( gl_FragColor.rgb, uSkyHaze,
  mix( uSkyHazeFoot, uSkyHazePeak, smoothstep( 0.0, 1.0, vSkyRise ) ) );
#include <tonemapping_fragment>
`;

interface HazeUniforms {
  uSkyHaze: { value: THREE.Color };
  uSkyHazeFoot: { value: number };
  uSkyHazePeak: { value: number };
  uSkyHazeReach: { value: number };
}

/** Wash materials toward `haze` (the live fog colour) by height above the horizon; patched once per material. */
export function hazeSky(object: THREE.Object3D, haze: THREE.Color, how: SkyHaze): void {
  object.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const values = {
        uSkyHaze: { value: haze },
        uSkyHazeFoot: { value: how.foot },
        uSkyHazePeak: { value: how.peak },
        uSkyHazeReach: { value: Math.max(1e-3, how.reach) },
      };
      const patched = material.userData.skyHaze as HazeUniforms | undefined;
      if (patched) {
        for (const key of Object.keys(values) as (keyof HazeUniforms)[]) {
          (patched[key] as { value: unknown }).value = values[key].value;
        }
        continue;
      }
      const uniforms: HazeUniforms = values;
      material.userData.skyHaze = uniforms;
      const before = material.onBeforeCompile.bind(material);
      const key = material.customProgramCacheKey.bind(material);
      material.onBeforeCompile = (shader, renderer) => {
        before(shader, renderer);
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace(
            '#include <common>',
            `#include <common>
${HAZE_VERTEX_PARS}`,
          )
          .replace('#include <begin_vertex>', HAZE_VERTEX);
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
${HAZE_FRAGMENT_PARS}`,
          )
          .replace('#include <tonemapping_fragment>', HAZE_FRAGMENT);
      };
      material.customProgramCacheKey = () => `${key()}|sky-haze`;
      material.needsUpdate = true;
    }
  });
}

/**
 * Make a zone's horizon layer sky: drawn after the dome and before the
 * world, lower than it is built, and hazed toward `haze` (`HILL_HAZE`).
 */
export function makeSkyHill(object: THREE.Object3D, haze: THREE.Color): void {
  makeSky(object);
  // The layer's top, as the sine of the angle it stands above the horizon.
  const box = new THREE.Box3().setFromObject(object);
  const out = Math.max(
    Math.abs(box.min.x),
    Math.abs(box.max.x),
    Math.abs(box.min.z),
    Math.abs(box.max.z),
  );
  const reach = box.max.y / Math.hypot(box.max.y, out || 1);
  object.scale.y *= HILL_HEIGHT;
  object.traverse(child => {
    if ((child as THREE.Mesh).isMesh) child.renderOrder = SKY_RENDER_ORDER + 0.5;
  });
  hazeSky(object, haze, { ...HILL_HAZE, reach });
}
