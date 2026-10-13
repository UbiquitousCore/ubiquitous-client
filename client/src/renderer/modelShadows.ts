/**
 * Real-time shadows on unlit models, darkened to the ground's floor so a
 * wall and the ground agree. Only sun-facing faces darken; faces turned away
 * are already painted as shade.
 */

import * as THREE from 'three';

import { SUN_DIRECTION } from './skyMaterials';

/** Shared by every unlit model material, so the renderer sets them once a frame. */
export const MODEL_SHADOW = {
  /** The sun's depth map, and the light's own matrix from world to map (three updates it in place). */
  uModelShadowMap: { value: null as THREE.Texture | null },
  uModelShadowMatrix: { value: new THREE.Matrix4() },
  uModelShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
  uModelSunDir: { value: SUN_DIRECTION.clone() },
};

/** How dark a sunlit surface goes in shadow: the ground's own floor. */
const SHADOW_FLOOR = 0.55;

/** Compiled to read the shadow map only while one exists: a sampler without a depth map makes WebGL refuse the draw. */
let compiled = false;
/** Bumped by every flip, so a material kept aside (a spare fade clone) can tell it is stale. */
let generation = 0;

export function modelShadowsCompiled(): boolean {
  return compiled;
}

export function modelShadowGeneration(): number {
  return generation;
}

export function setModelShadowsCompiled(on: boolean): void {
  if (on === compiled) return;
  compiled = on;
  generation++;
}

/** Whether a material takes the shadows: unlit (basic) materials, minus the sky. */
export function takesModelShadows(material: THREE.Material): boolean {
  return (
    (material as THREE.MeshBasicMaterial).isMeshBasicMaterial === true &&
    material.userData.sky !== true
  );
}

const VERTEX_PARS = /* glsl */ `
uniform mat4 uModelShadowMatrix;
varying vec3 vModelNormal;
varying vec4 vModelShadowCoord;
`;

/**
 * After `project_vertex`: the surface's world normal, and where it falls in
 * the shadow map — nudged along its normal so a surface does not shadow
 * itself.
 */
const VERTEX = /* glsl */ `
#include <project_vertex>
{
  #if defined( USE_ENVMAP ) || defined( USE_SKINNING )
    vModelNormal = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );
  #else
    vec3 modelNormal = vec3( normal );
    #ifdef USE_INSTANCING
      modelNormal = mat3( instanceMatrix ) * modelNormal;
    #endif
    vModelNormal = normalize( mat3( modelMatrix ) * modelNormal );
  #endif
  vec4 modelWorld = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    modelWorld = instanceMatrix * modelWorld;
  #endif
  modelWorld = modelMatrix * modelWorld;
  vModelShadowCoord = uModelShadowMatrix * vec4( modelWorld.xyz + vModelNormal * 0.08, 1.0 );
}
`;

const FRAGMENT_PARS = /* glsl */ `
uniform highp sampler2DShadow uModelShadowMap;
uniform vec2 uModelShadowTexel;
uniform vec3 uModelSunDir;
varying vec3 vModelNormal;
varying vec4 vModelShadowCoord;

// How much of the sun reaches this point, 0..1: five filtered comparisons
// against the sun's depth map. Outside the map, all of it.
float modelSunVisible() {
  vec3 c = vModelShadowCoord.xyz / vModelShadowCoord.w;
  if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;
  c.z -= 0.0006;
  vec2 t = uModelShadowTexel * 1.5;
  float s = texture( uModelShadowMap, c );
  s += texture( uModelShadowMap, vec3( c.xy + vec2( t.x, t.y ), c.z ) );
  s += texture( uModelShadowMap, vec3( c.xy + vec2( -t.x, t.y ), c.z ) );
  s += texture( uModelShadowMap, vec3( c.xy + vec2( t.x, -t.y ), c.z ) );
  s += texture( uModelShadowMap, vec3( c.xy + vec2( -t.x, -t.y ), c.z ) );
  return s / 5.0;
}

float modelShadow() {
  vec3 n = normalize( vModelNormal );
  n = gl_FrontFacing ? n : -n;
  float facing = smoothstep( 0.15, 0.85, dot( n, uModelSunDir ) * 0.5 + 0.5 );
  return mix( 1.0, ${SHADOW_FLOOR.toFixed(2)}, ( 1.0 - modelSunVisible() ) * facing );
}
`;

/** After `color_fragment`: the painted colour, darkened where the sun cannot reach. */
const FRAGMENT = /* glsl */ `
#include <color_fragment>
diffuseColor.rgb *= modelShadow();
`;

/**
 * Add the shadow lookup to an unlit material's program, when one is to be
 * compiled in (`modelShadowsCompiled`). Called from its `onBeforeCompile`.
 */
export function injectModelShadows(shader: THREE.WebGLProgramParametersWithUniforms): void {
  // Registered whether or not the lookup is compiled in. Three keeps a
  // program per material and key, but takes a material's uniforms only from
  // the last program it built: a material first built with the lookup, then
  // without, then back with it reuses the first program with the second's
  // uniforms. Without the map among them the sampler lands on the colour
  // texture's unit, WebGL refuses the draw, and the model vanishes.
  Object.assign(shader.uniforms, MODEL_SHADOW);
  if (!compiled) return;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${VERTEX_PARS}`)
    .replace('#include <project_vertex>', VERTEX);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FRAGMENT_PARS}`)
    .replace('#include <color_fragment>', FRAGMENT);
}
