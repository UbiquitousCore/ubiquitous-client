/**
 * Flowing water on models: the sheet's own art read as ripples over the pond's
 * reflected sky; nothing until the texture arrives.
 */
import * as THREE from 'three';
import { adaptProgram, forwardDepthColumns, readSceneFog } from './packProgram';
import { GRADE_GLSL, withGrade } from './colourGrade';
import type { ProgramNames, ProgramText, StageWrap } from './packProgram';

/** The build's flowing-water program, by entry name. */
export const WATERFALL_PROGRAM: ProgramNames = {
  vertex: 'WaterfallVP.glsl',
  fragment: 'WaterfallFP.glsl',
};

const FALLBACK_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform vec3 cameraPosition;
uniform float uTime;
uniform float uFlowRate;
uniform float uFlowScale;
varying vec2 vFlowUv;
varying vec3 vToEye;
varying float vDistance;
void main() {
  vFlowUv = uv * uFlowScale - vec2(0.0, fract(uTime * uFlowRate));
  vec3 world = (modelMatrix * vec4(position, 1.0)).xyz;
  vToEye = cameraPosition - world;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  vDistance = -view.z;
  gl_Position = projectionMatrix * view;
}
`;

const FALLBACK_FRAGMENT = withGrade(/* glsl */ `
precision highp float;
uniform sampler2D map;
uniform sampler2D _ReflectionTex;
uniform float uHasMap;
uniform float uHasReflection;
uniform float uFlowRipple;
uniform float uFlowReflect;
uniform float uFlowFoam;
uniform float uFlowAlpha;
uniform float uFlowBright;
uniform float uFlowContrast;
uniform vec3 uFlowTint;
uniform vec3 uFogColour;
uniform vec2 uSceneFogRange;
varying vec2 vFlowUv;
varying vec3 vToEye;
varying float vDistance;

// The reflected view ray, read as the pond's sky picture: the mapping is the
// water surface's, at its baked values.
vec3 reflectedSky(vec3 normal) {
  vec3 ray = reflect(normalize(-vToEye), normal);
  float theta = atan(ray.z, ray.x) * 0.15915494 * 0.5 + 0.5;
  float lifted = 1.0 - clamp(acos(clamp(ray.y, -1.0, 1.0)) * 0.31830989 * 1.6 - 0.05, 0.0, 1.0);
  vec3 reflected = texture2D(_ReflectionTex, vec2(1.0 - theta, lifted)).rgb;
  reflected = max(reflected * 1.3, vec3(0.0));
  float luma = dot(reflected, vec3(0.213, 0.715, 0.072));
  return mix(vec3(luma), reflected, 1.3);
}

void main() {
  if (uHasMap < 0.5) discard;
  // The sheet's own art is the ripple, not the colour: the build draws a water
  // skin over the fountain, so what the mesh carries is read as wave heights.
  vec4 sheet = texture2D(map, vFlowUv);
  vec2 ripple = (sheet.rg * 2.0 - 1.0) * uFlowRipple;
  vec3 normal = normalize(vec3(ripple.x, 1.0, ripple.y));
  vec3 reflected = uHasReflection > 0.5 ? reflectedSky(normal) : vec3(0.5);
  vec3 water = mix(vec3(0.03, 0.05, 0.06), reflected, clamp(uFlowReflect, 0.0, 1.0));
  // The sheet's own bright art rides over the water as foam.
  vec3 colour = mix(water, sheet.rgb, clamp(uFlowFoam, 0.0, 1.0));
  colour = max(colour * uFlowTint * uFlowBright, vec3(0.0));
  colour = max((colour - 0.5) * uFlowContrast + 0.5, vec3(0.0));
  float fog = clamp((vDistance - uSceneFogRange.x)
    / max(uSceneFogRange.y - uSceneFogRange.x, 0.001), 0.0, 1.0);
  gl_FragColor = vec4(mix(colour, uFogColour, fog), uFlowAlpha);
}
`);

const LOADED_VERTEX_WRAP: StageWrap = { rename: { Vertex: 'position', TexCoord0: 'uv' } };

const LOADED_FRAGMENT_WRAP: StageWrap = {
  // Blended rather than cut: the program writes a meaningful alpha. A
  // fragment with next to none is dropped so it does not touch depth.
  prelude: '',
  after: `  if (gl_FragColor.a < 0.02) discard;\n${GRADE_GLSL}`,
};

export type WaterfallPath = 'fallback' | 'loaded';

export class WaterfallMaterial extends THREE.RawShaderMaterial {
  declare uniforms: Record<string, THREE.IUniform>;
  private program: ProgramText | null = null;
  private drawing: WaterfallPath = 'fallback';

  constructor(doubleSided: boolean) {
    const map: THREE.IUniform<THREE.Texture | null> = { value: null };
    const time: THREE.IUniform<number> = { value: 0 };
    super({
      vertexShader: FALLBACK_VERTEX,
      fragmentShader: FALLBACK_FRAGMENT,
      // Blended, and still written to depth: water is a surface you see
      // through, not one you see past; left out of the depth buffer,
      // whatever is drawn afterwards paints over the fountain.
      transparent: true,
      depthWrite: true,
      side: doubleSided ? THREE.DoubleSide : THREE.FrontSide,
      uniforms: {
        map,
        uHasMap: { value: 0 },
        uTime: time,
        // Own choice, set by the owner by eye beside the build, to match its flowing water.
        uFlowRate: { value: 0.7 },
        uFlowScale: { value: 1.5 },
        uFlowAlpha: { value: 0.7 },
        uFlowRipple: { value: 2.2 },
        uFlowReflect: { value: 0.35 },
        uFlowFoam: { value: 0.35 },
        uFlowBright: { value: 0.9 },
        uFlowContrast: { value: 0.8 },
        uFlowTint: { value: new THREE.Vector3(0.72, 0.88, 1) },
        _ReflectionTex: { value: null },
        uHasReflection: { value: 0 },
        uSceneFogRange: { value: new THREE.Vector2() },
        uFogColour: { value: new THREE.Vector3() },
        // The loaded program's, by the names its text declares. The texture
        // and the clock are the same objects as ours, so both paths follow.
        texture_diffuse: map,
        time,
        textureenvcolor: { value: new THREE.Vector4(1, 1, 1, 1) },
        fogcolor: { value: new THREE.Vector4(0, 0, 0, 1) },
        fogstartend: { value: new THREE.Vector2() },
        WorldViewProjectionMatrix: { value: new THREE.Matrix4() },
        WorldViewT: { value: new THREE.Matrix4() },
      },
    });
  }

  get path(): WaterfallPath {
    return this.drawing;
  }

  /** Bind the pond's sky picture, which our sheet reflects. */
  bindReflection(texture: THREE.Texture): void {
    this.uniforms._ReflectionTex.value = texture;
    this.uniforms.uHasReflection.value = 1;
  }

  /** Hand over the build's program text, or null where it has none. */
  useProgram(source: { vertex: string | null; fragment: string | null } | null): void {
    this.program = adaptProgram(source, LOADED_VERTEX_WRAP, LOADED_FRAGMENT_WRAP);
    this.choosePath();
  }

  choosePath(): WaterfallPath {
    const next: WaterfallPath =
      this.program && this.uniforms.uHasMap.value > 0.5 ? 'loaded' : 'fallback';
    if (next !== this.drawing) {
      this.drawing = next;
      this.vertexShader = next === 'loaded' ? this.program!.vertex : FALLBACK_VERTEX;
      this.fragmentShader = next === 'loaded' ? this.program!.fragment : FALLBACK_FRAGMENT;
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
    const u = this.uniforms;
    readSceneFog(scene, u.fogcolor.value, u.fogstartend.value);
    u.uSceneFogRange.value.copy(u.fogstartend.value);
    u.uFogColour.value.set(u.fogcolor.value.x, u.fogcolor.value.y, u.fogcolor.value.z);
    u.WorldViewProjectionMatrix.value.multiplyMatrices(
      camera.projectionMatrix,
      object.modelViewMatrix,
    );
    forwardDepthColumns(object.modelViewMatrix, u.WorldViewT.value);
    // One material is shared by every mesh wearing it, so each draw re-sends.
    this.uniformsNeedUpdate = true;
  }
}

export function createWaterfallMaterial(doubleSided: boolean): WaterfallMaterial {
  return new WaterfallMaterial(doubleSided);
}

/**
 * The texture must tile, since the flowing coordinates run past 1, and is
 * uploaded without colour decoding because both paths work in display values.
 */
export function prepareWaterfallTexture(texture: THREE.Texture): void {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
}
