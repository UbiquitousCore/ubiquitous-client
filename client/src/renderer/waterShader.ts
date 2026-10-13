/**
 * The water surface material.
 *
 * It draws with the water programs the mounted build ships once their text
 * and both textures have loaded, and with a plain translucent sheet of our
 * own until then, or for good where the build has no such program.
 */

import * as THREE from 'three';
import { adaptProgram, readSceneFog } from './packProgram';
import { GRADE_GLSL, withGrade } from './colourGrade';
import type { ProgramNames, ProgramText, StageWrap } from './packProgram';

/**
 * The build's two water programs, by entry name. `soft` fades its alpha by
 * a depth map; `plain` does not. Which one is worn follows the Graphics
 * setting, through the `uSoft` uniform.
 */
export const WATER_PROGRAMS: Readonly<Record<'soft' | 'plain', ProgramNames>> = {
  soft: { vertex: 'WaterSoftVS.glsl', fragment: 'WaterSoftFS.glsl' },
  plain: { vertex: 'WaterVS2.glsl', fragment: 'WaterFS2.glsl' },
};

/** How many times the ripple map repeats across one tile. Whole, so tiles meet without a seam. */
export const RIPPLE_REPEATS_PER_TILE = 3;

/** Drift of the two ripple layers, in texture repeats per second. Own choice. */
export const RIPPLE_DRIFT: readonly [readonly [number, number], readonly [number, number]] = [
  [0.013, 0.021],
  [-0.017, 0.009],
];

/**
 * Reflection gain and highlight shape handed to the loaded program. Own
 * choice, tuned by eye on the stream in the selection map: the strongest
 * reflection that still lets the stream bed read through the surface, with
 * a broad, faint highlight.
 */
export const REFLECTION_GAIN = 1.0;
export const HIGHLIGHT_SHARPNESS = 24;
export const HIGHLIGHT_GAIN = 0.25;

/** Water depth, in world units, at which the shore fade has run its course. Own choice. */
export const SHORE_DEPTH = 3;

/**
 * How much of the surface shows at a given depth: nothing at the waterline,
 * all of it from `SHORE_DEPTH` down. The square root keeps ankle-deep water
 * visible rather than letting the edge vanish over a long, shallow margin.
 */
export function shoreAlpha(depth: number): number {
  if (!(depth > 0)) return 0;
  return Math.sqrt(Math.min(1, depth / SHORE_DEPTH));
}

/**
 * The soft water program reads its depth map at one eighth of the second
 * texture coordinate: one map per tile of eight chunks.
 */
const DEPTH_COORD_SCALE = 8;

/** Second UV pointing at the spot on a two-texel ramp (centres 0.25, 0.75) holding the vertex's shore alpha. */
export function depthCoord(alpha: number): [number, number] {
  return [DEPTH_COORD_SCALE * (0.25 + 0.5 * alpha), DEPTH_COORD_SCALE * 0.5];
}

let ramp: THREE.DataTexture | null = null;

/** The ramp `depthCoord` addresses. One for the whole session, so never disposed. */
function shoreRamp(): THREE.DataTexture {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255]), 2, 1);
  ramp.magFilter = THREE.LinearFilter;
  ramp.minFilter = THREE.LinearFilter;
  ramp.generateMipmaps = false;
  ramp.wrapS = THREE.ClampToEdgeWrapping;
  ramp.wrapT = THREE.ClampToEdgeWrapping;
  ramp.needsUpdate = true;
  return ramp;
}

/** Display-space colour of the fallback sheet. Own choice. */
const FALLBACK_TINT: readonly [number, number, number] = [0.36, 0.52, 0.6];

/**
 * Shared by both paths: past the end of the scene's fog the surface fades
 * out, rather than drawing a fog-coloured sheet over the sky.
 */
const SCENE_FADE = `
  gl_FragColor.a *= 1.0 - clamp((vSheetDistance - uSceneFogRange.x)
    / max(uSceneFogRange.y - uSceneFogRange.x, 0.001), 0.0, 1.0);
`;

const FALLBACK_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
attribute float shore;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;
uniform mat4 projectionMatrix;
uniform vec3 cameraPosition;
uniform vec2 uRippleOffset;
uniform vec2 uRippleOffset2;
varying float vShore;
varying vec3 vToEye;
varying vec2 vRippleUv;
varying vec2 vRippleUv2;
varying float vSheetDistance;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vToEye = cameraPosition - world.xyz;
  vSheetDistance = length(vToEye);
  vShore = shore;
  vRippleUv = uv + uRippleOffset;
  vRippleUv2 = uv + uRippleOffset2;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Our own water surface, written from what the build's program does to the
 * picture rather than from its source: it reflects the build's reflection
 * image through a ripple normal, holds more of it at a glancing angle, and
 * adds a broad highlight. `docs/PROVENANCE.md` records what each input is.
 */
const FALLBACK_FRAGMENT = withGrade(/* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform vec3 uFogColour;
uniform vec2 uSceneFogRange;
uniform sampler2D uRipple;
uniform sampler2D _ReflectionTex;
uniform float uHasBump;
uniform float uHasReflection;
uniform float uSkyMode;
uniform float uSkyShift;
uniform float uSkyScale;
uniform float uSkyGain;
uniform vec3 uSkyTint;
uniform float uSkyGamma;
uniform float uSkyFlipY;
uniform float uSkyYaw;
uniform float uSkyContrast;
uniform float uSkyMirror;
uniform float uSkySaturation;
uniform float uRippleRepeat;
uniform float uRippleRepeat2;
uniform float uRippleStrength;
uniform float uWaterLift;
uniform float pramaRefle;
uniform float SpecuRange;
uniform float SpecuSreng;
varying float vShore;
varying vec3 vToEye;
varying vec2 vRippleUv;
varying vec2 vRippleUv2;
varying float vSheetDistance;
void main() {
  // Two ripple layers crossing, so the water rises and falls instead of one
  // pattern scrolling past; flat water where the build ships no ripple map.
  vec2 ripple = vec2(0.0);
  if (uHasBump > 0.5) {
    vec2 rippleA = texture2D(uRipple, vRippleUv * uRippleRepeat).rg * 2.0 - 1.0;
    vec2 rippleB = texture2D(uRipple, vRippleUv2 * uRippleRepeat2).rg * 2.0 - 1.0;
    ripple = (rippleA + rippleB) * 0.5;
  }
  vec3 normal = normalize(vec3(ripple.x * uRippleStrength, 1.0, ripple.y * uRippleStrength));
  vec3 eye = normalize(vToEye);
  // The reflected view ray, read as a sky. Three readings are kept side by
  // side while the right one is found: a panorama upright, a panorama turned
  // over, and a flat projection. Shift and scale slide the horizon until it
  // matches. The bench chooses through these uniforms.
  vec3 ray = reflect(normalize(-vToEye), normal);
  float theta = atan(ray.z, ray.x) * 0.15915494 * uSkyYaw + 0.5;
  if (uSkyMirror > 0.5) theta = 1.0 - theta;
  float phi = acos(clamp(ray.y, -1.0, 1.0)) * 0.31830989;
  float lifted = clamp(phi * uSkyScale + uSkyShift, 0.0, 1.0);
  if (uSkyFlipY > 0.5) lifted = 1.0 - lifted;
  vec2 sky = uSkyMode < 0.5
    ? vec2(theta, lifted)
    : (uSkyMode < 1.5
      ? vec2(theta, 1.0 - lifted)
      : ray.xz / max(abs(ray.y), 0.08) * 0.25 + 0.5);
  vec3 reflected = uHasReflection > 0.5 ? texture2D(_ReflectionTex, sky).rgb : uTint;
  // What the build does to the picture before it is drawn: warm or cool it,
  // curve it, brighten it, expand it and enrich it.
  reflected = max(reflected * uSkyTint, vec3(0.0));
  reflected = pow(reflected, vec3(uSkyGamma));
  reflected *= uSkyGain;
  // Expand about the middle so the build's deep water and bright sky come
  // back; a plain gain only lifts everything together.
  reflected = max((reflected - 0.5) * uSkyContrast + 0.5, vec3(0.0));
  float reflectedLuma = dot(reflected, vec3(0.213, 0.715, 0.072));
  reflected = mix(vec3(reflectedLuma), reflected, uSkySaturation);
  // At full reflection the surface is all sky; at none it is nearly black.
  float reflection = clamp(pramaRefle, 0.0, 1.0);
  // With no reflection at all the build's surface is nearly black; a build
  // that ships no reflection image keeps the water's own colour instead.
  vec3 base = uHasReflection > 0.5 ? vec3(0.03, 0.05, 0.06) : uTint;
  vec3 colour = mix(base, reflected, reflection);
  // A lift toward the build's lighter blue, which a gain alone does not reach.
  colour = mix(colour, vec3(0.62, 0.78, 0.92), uWaterLift);
  // A broad highlight riding the ripples.
  vec3 halfDir = normalize(eye + vec3(0.35, 0.6, 0.25));
  float spec = pow(max(dot(normal, halfDir), 0.0), max(SpecuRange, 1.0)) * SpecuSreng;
  colour += vec3(spec);
  float fog = clamp((vSheetDistance - uSceneFogRange.x)
    / max(uSceneFogRange.y - uSceneFogRange.x, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(mix(colour, uFogColour, fog), vShore * mix(0.98, 0.78, abs(eye.y)));
  ${SCENE_FADE}
}
`);

/** Attribute names the loaded programs declare, mapped to what the geometry carries. */
const LOADED_ATTRIBUTES: Readonly<Record<string, string>> = {
  Vertex: 'position',
  TexCoord0: 'uv',
  TexCoord1: 'uv1',
};

const LOADED_VERTEX_WRAP: StageWrap = {
  rename: LOADED_ATTRIBUTES,
  prelude: 'varying highp float vSheetDistance;',
  after: '  vSheetDistance = distance(CameraPosition, position.xyz);',
};

const LOADED_FRAGMENT_WRAP: StageWrap = {
  prelude: `uniform vec2 uSceneFogRange;\nvarying highp float vSheetDistance;`,
  after: `${SCENE_FADE}\n${GRADE_GLSL}`,
};

export type WaterPath = 'fallback' | 'soft' | 'plain';

type StageSources = { vertex: string | null; fragment: string | null } | null;

/** Raw text for the build's water programs, where it has them. */
export interface WaterSources {
  soft?: StageSources;
  plain?: StageSources;
}

const eye = new THREE.Vector3();
const toModel = new THREE.Matrix4();

export class WaterMaterial extends THREE.RawShaderMaterial {
  declare uniforms: Record<string, THREE.IUniform>;
  private readonly programs: Partial<Record<'soft' | 'plain', ProgramText>> = {};
  private drawing: WaterPath = 'fallback';

  constructor() {
    super({
      vertexShader: FALLBACK_VERTEX,
      fragmentShader: FALLBACK_FRAGMENT,
      transparent: true,
      // Visible from underneath as well as from above.
      side: THREE.DoubleSide,
      // Transparent surfaces must not occlude each other or the riverbed.
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSoft: { value: 1 },
        uHasBump: { value: 0 },
        uHasReflection: { value: 0 },
        uSkyMode: { value: 0 },
        uSkyShift: { value: -0.05 },
        uSkyScale: { value: 1.6 },
        uSkyGain: { value: 1.3 },
        uSkyTint: { value: new THREE.Vector3(1, 1, 1) },
        uSkyGamma: { value: 1 },
        uSkyFlipY: { value: 1 },
        uSkyYaw: { value: 0.5 },
        uSkyContrast: { value: 1 },
        uSkyMirror: { value: 1 },
        uSkySaturation: { value: 1.3 },
        uRippleRepeat: { value: 2.0 },
        uRippleRepeat2: { value: 1.0 },
        uRippleStrength: { value: 0.6 },
        uWaterLift: { value: 0.25 },
        uSceneFogRange: { value: new THREE.Vector2() },
        // The fallback's own.
        uTint: { value: new THREE.Vector3(...FALLBACK_TINT) },
        uFogColour: { value: new THREE.Vector3() },
        uRipple: { value: null },
        uRippleOffset: { value: new THREE.Vector2() },
        uRippleOffset2: { value: new THREE.Vector2() },
        // The loaded programs', by the names their text declares.
        WorldViewProjectionMatrix: { value: new THREE.Matrix4() },
        CameraPosition: { value: new THREE.Vector3() },
        WaveMapOffset: { value: new THREE.Vector2() },
        WaveMapOffset2: { value: new THREE.Vector2() },
        _DepthMapOffset: { value: new THREE.Vector2() },
        pramaRefle: { value: REFLECTION_GAIN },
        SpecuRange: { value: HIGHLIGHT_SHARPNESS },
        SpecuSreng: { value: HIGHLIGHT_GAIN },
        _BumpMap: { value: null },
        _ReflectionTex: { value: null },
        _DepthMap: { value: shoreRamp() },
        fogcolor: { value: new THREE.Vector4(0, 0, 0, 1) },
      },
    });
  }

  /** Which program is on the surface now. */
  get path(): WaterPath {
    return this.drawing;
  }

  /** Hand over the build's program text; any of it may be missing. */
  usePrograms(sources: WaterSources): void {
    for (const which of ['soft', 'plain'] as const) {
      const adapted = adaptProgram(
        sources[which] ?? null,
        LOADED_VERTEX_WRAP,
        LOADED_FRAGMENT_WRAP,
      );
      if (adapted) this.programs[which] = adapted;
    }
    this.choosePath();
  }

  bindBump(texture: THREE.Texture): void {
    this.uniforms._BumpMap.value = texture;
    this.uniforms.uRipple.value = texture;
    this.uniforms.uHasBump.value = 1;
    this.choosePath();
  }

  bindReflection(texture: THREE.Texture): void {
    this.uniforms._ReflectionTex.value = texture;
    this.uniforms.uHasReflection.value = 1;
    this.choosePath();
  }

  /**
   * Put the right program on the surface.
   *
   * The loaded one waits for both of its textures: an unbound sampler reads
   * opaque black, and a black sheet over a lake is worse than the fallback.
   */
  choosePath(): WaterPath {
    const wanted = this.uniforms.uSoft.value > 0.5 ? 'soft' : 'plain';
    const program = this.programs[wanted];
    const textured = this.uniforms.uHasBump.value > 0.5 && this.uniforms.uHasReflection.value > 0.5;
    const next: WaterPath = program && textured ? wanted : 'fallback';
    if (next !== this.drawing) {
      this.drawing = next;
      this.vertexShader = program && next !== 'fallback' ? program.vertex : FALLBACK_VERTEX;
      this.fragmentShader = program && next !== 'fallback' ? program.fragment : FALLBACK_FRAGMENT;
      this.needsUpdate = true;
    }
    return next;
  }

  override onBeforeRender(
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    _geometry: THREE.BufferGeometry,
    object: THREE.Object3D,
  ): void {
    this.choosePath();
    const u = this.uniforms;
    const time = u.uTime.value as number;
    const [first, second] = RIPPLE_DRIFT;
    // Whole repeats drop out: the map tiles, and small numbers keep their precision.
    u.WaveMapOffset.value.set(fract(first[0] * time), fract(first[1] * time));
    u.WaveMapOffset2.value.set(fract(second[0] * time), fract(second[1] * time));
    u.uRippleOffset.value.copy(u.WaveMapOffset.value);
    u.uRippleOffset2.value.copy(u.WaveMapOffset2.value);
    readSceneFog(scene, u.fogcolor.value, u.uSceneFogRange.value);
    u.uFogColour.value.set(u.fogcolor.value.x, u.fogcolor.value.y, u.fogcolor.value.z);
    u.WorldViewProjectionMatrix.value.multiplyMatrices(
      camera.projectionMatrix,
      object.modelViewMatrix,
    );
    // The loaded program takes the eye in the surface's own space.
    camera.getWorldPosition(eye);
    u.CameraPosition.value.copy(eye.applyMatrix4(toModel.copy(object.matrixWorld).invert()));
    this.uniformsNeedUpdate = true;
  }
}

function fract(v: number): number {
  return v - Math.floor(v);
}

export function createWaterMaterial(): WaterMaterial {
  return new WaterMaterial();
}
