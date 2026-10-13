/**
 * The ground material: the build's own ground program once loaded, else a
 * simple lit stand-in; the sun's shadow map over either. Display values
 * throughout (textures uploaded undecoded).
 */

import * as THREE from 'three';
import { adaptProgram, forwardDepthColumns, readSceneFog } from './packProgram';
import { SUN_DIRECTION } from './skyMaterials';
import { GRADE_GLSL, withGrade } from './colourGrade';
import type { ProgramNames, ProgramText, StageWrap } from './packProgram';

/** The build's ground program, by entry name. */
export const TERRAIN_PROGRAM: ProgramNames = {
  vertex: 'TerrainVP.glsl',
  fragment: 'TerrainFP.glsl',
};

/** Mask UV for the shadow channel: 64 texels for 65 vertices, `u = maskUv * (n - 1) / n + 0.5 / n`. */
export function shadowUvTransform(texels: number): { scale: number; offset: number } {
  const n = Math.max(1, texels);
  return { scale: (n - 1) / n, offset: 0.5 / n };
}

/** The mask width every shipped tile uses, until a loaded mask says otherwise. */
const MASK_TEXELS = 64;

/**
 * How strong the shade's and the sun's light are on the loaded program,
 * times the zone's colours. Own choice, set by the owner by eye beside the
 * game with the admin panel's sliders.
 */
export const GROUND_AMBIENT = 1.01;
export const GROUND_DIFFUSE = 1.47;

const WHITE: readonly [number, number, number] = [1, 1, 1];

/** The light every ground tile is drawn in: one pair, shared, so a zone change reaches all of them. */
const GROUND_LIGHT = {
  ambient: { value: new THREE.Vector4(GROUND_AMBIENT, GROUND_AMBIENT, GROUND_AMBIENT, 1) },
  diffuse: { value: new THREE.Vector4(GROUND_DIFFUSE, GROUND_DIFFUSE, GROUND_DIFFUSE, 1) },
};

/** Light the ground in a zone's sun and shade colours (display values); white where it sets none. */
export function lightGround(
  sun: readonly [number, number, number] = WHITE,
  shade: readonly [number, number, number] = WHITE,
): void {
  GROUND_LIGHT.diffuse.value.set(sun[0], sun[1], sun[2], 1).multiplyScalar(GROUND_DIFFUSE).setW(1);
  GROUND_LIGHT.ambient.value
    .set(shade[0], shade[1], shade[2], 1)
    .multiplyScalar(GROUND_AMBIENT)
    .setW(1);
}

/**
 * The sun's real-time shadow takes the sun's share out of the ground's light
 * and leaves the shade's, so shadowed ground turns the zone's shade colour
 * (a blue shade under a yellow sun), not a darker yellow. Own choice: the
 * sun's share is reckoned as the sun colour times how squarely the ground
 * faces it, beside the shade colour.
 */
const SUN_SHADOW_PARS = /* glsl */ `
uniform vec4 uGroundAmbient;
uniform vec4 uGroundDiffuse;
uniform vec3 uGroundSunDir;
varying vec3 vGroundNormal;
`;

const SUN_SHADOW = /* glsl */ `
  #if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
    DirectionalLightShadow sunShadow = directionalLightShadows[ 0 ];
    float lit = getShadow(
      directionalShadowMap[ 0 ], sunShadow.shadowMapSize, sunShadow.shadowIntensity,
      sunShadow.shadowBias, sunShadow.shadowRadius, vDirectionalShadowCoord[ 0 ]);
    float facing = max(dot(normalize(vGroundNormal), uGroundSunDir), 0.0);
    vec3 allLight = max(uGroundAmbient.rgb + uGroundDiffuse.rgb * facing, vec3(1e-3));
    gl_FragColor.rgb *= mix(uGroundAmbient.rgb / allLight, vec3(1.0), lit);
  #endif
`;

/** The ground normal in world space, for `SUN_SHADOW`; `normal` names the attribute. */
const groundNormalFrom = (normal: string) =>
  `vGroundNormal = normalize((modelMatrix * vec4(${normal}.xyz, 0.0)).xyz);`;

const FALLBACK_VERTEX = /* glsl */ `
  // ShaderMaterial declares position, normal and uv; the rest is ours.
  attribute vec3 color;
  attribute vec2 maskUv;
  uniform vec2 uShadowUv;

  varying vec2 vGroundUv;
  varying vec2 vShadowUv;
  varying vec3 vTint;
  varying vec3 vNormal;
  varying float vDistance;
  varying vec3 vGroundNormal;

  #include <common>
  #include <shadowmap_pars_vertex>

  void main() {
    ${groundNormalFrom('normal')}
    vGroundUv = uv;
    vShadowUv = maskUv * uShadowUv.x + vec2(uShadowUv.y);
    vTint = color;
    vec3 transformedNormal = normalMatrix * normal;
    vNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    vDistance = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    #include <shadowmap_vertex>
  }
`;

const FALLBACK_FRAGMENT = withGrade(/* glsl */ `
  uniform sampler2D uBase;
  uniform sampler2D uLayer1;
  uniform sampler2D uLayer2;
  uniform sampler2D uMask;
  uniform float uHasBase;
  uniform float uHas1;
  uniform float uHas2;
  uniform float uHasMask;
  uniform vec3 uSunDir;
  uniform vec3 uFogColour;
  uniform vec2 uSceneFogRange;
  uniform float uGroundGain;
  uniform float uGroundAmbientScale;
  uniform float uGroundDiffuseScale;
  uniform float uGroundShade;
  uniform float uGroundSaturation;
  uniform float uGroundContrast;
  uniform float uGroundWarmth;
  ${SUN_SHADOW_PARS}

  varying vec2 vGroundUv;
  varying vec2 vShadowUv;
  varying vec3 vTint;
  varying vec3 vNormal;
  varying float vDistance;

  #include <common>
  #include <packing>
  #include <shadowmap_pars_fragment>

  void main() {
    // The mask's red and green are how much of the first and second layer a
    // vertex shows; its blue is how much of the sun the vertex is out of.
    vec4 mask = uHasMask > 0.5 ? texture2D(uMask, vShadowUv) : vec4(0.0);
    vec3 ground = uHasBase > 0.5 ? texture2D(uBase, vGroundUv).rgb : vec3(0.52, 0.55, 0.45);
    if (uHas1 > 0.5) ground = mix(ground, texture2D(uLayer1, vGroundUv).rgb, mask.r);
    if (uHas2 > 0.5) ground = mix(ground, texture2D(uLayer2, vGroundUv).rgb, mask.g);
    float sun = max(dot(normalize(vNormal), uSunDir), 0.0);
    vec3 light =
      uGroundAmbient.rgb * uGroundAmbientScale + uGroundDiffuse.rgb * uGroundDiffuseScale * sun;
    vec3 colour = ground * vTint * (1.0 - mask.b * uGroundShade) * light * uGroundGain;
    // Tone: the build's ground reads less vivid and a shade warmer than a
    // plain lit multiply gives, so the plain one is pulled to match.
    float toneLuma = dot(colour, vec3(0.213, 0.715, 0.072));
    colour = mix(vec3(toneLuma), colour, uGroundSaturation);
    colour = max((colour - 0.5) * uGroundContrast + 0.5, vec3(0.0));
    colour *= vec3(1.0 + uGroundWarmth * 0.3, 1.0, 1.0 - uGroundWarmth * 0.3);
    float fog = clamp((vDistance - uSceneFogRange.x)
      / max(uSceneFogRange.y - uSceneFogRange.x, 0.001), 0.0, 1.0);
    gl_FragColor = vec4(mix(colour, uFogColour, fog), 1.0);
    ${SUN_SHADOW}
  }
`);

const LOADED_VERTEX_WRAP: StageWrap = {
  prelude: '#include <common>\n#include <shadowmap_pars_vertex>\nvarying vec3 vGroundNormal;',
  after: `
  ${groundNormalFrom('Normal')}
  vec3 transformedNormal = normalMatrix * Normal;
  vec4 worldPosition = modelMatrix * vec4(Vertex.xyz, 1.0);
  #include <shadowmap_vertex>
`,
};

/** The mask with each upper layer's weight zeroed where it has no texture, which would otherwise blend black. */
const GROUND_MASK = /* glsl */ `
uniform float uHas1;
uniform float uHas2;
vec4 groundMask(sampler2D mask, vec2 uv) {
  vec4 m = texture2D(mask, uv);
  m.r *= uHas1;
  m.g *= uHas2;
  return m;
}
`;

/** Send every read of the mask sampler (`texture4`) through `groundMask`. */
export function weighMaskReads(fragment: string): string {
  return fragment.replace(/\btexture2D(\s*\(\s*texture4\b)/g, 'groundMask$1');
}

const LOADED_FRAGMENT_WRAP: StageWrap = {
  prelude: `#include <common>\n#include <packing>\n#include <shadowmap_pars_fragment>\n${GROUND_MASK}\n${SUN_SHADOW_PARS}`,
  // The ground is opaque whatever alpha the program leaves behind.
  after: `${SUN_SHADOW}\n  gl_FragColor.a = 1.0;\n${GRADE_GLSL}`,
};

/**
 * Attribute names the loaded program declares, and the geometry attributes
 * that carry them. Three declares its own names for a ShaderMaterial, so the
 * loaded names are added to the geometry as second names for the same data.
 */
const LOADED_ATTRIBUTES: ReadonlyArray<[loaded: string, ours: string]> = [
  ['Vertex', 'position'],
  ['Normal', 'normal'],
  ['TexCoord0', 'uv'],
  ['TexCoord1', 'maskUv'],
  ['Color0', 'color'],
];

/** Give a ground geometry the attribute names the loaded program reads. Shares the buffers. */
export function shareTerrainAttributes(geometry: THREE.BufferGeometry): void {
  for (const [loaded, ours] of LOADED_ATTRIBUTES) {
    const attribute = geometry.getAttribute(ours);
    if (attribute) geometry.setAttribute(loaded, attribute);
  }
}

export interface TerrainMaterialOptions {
  /** Direction the scene's sun comes from, for the lit term. */
  sunDirection?: THREE.Vector3;
}

export type TerrainPath = 'fallback' | 'loaded';

/** Texture slots: the base, the layer the mask's red channel blends in, and the one its green does. */
export type GroundSlot = 0 | 1 | 2;

const SLOT_FLAGS = ['uHasBase', 'uHas1', 'uHas2'] as const;

const toModelRotation = new THREE.Matrix4();

/**
 * One material per distinct texture triple in a tile. Textures arrive later;
 * the fallback draws until every one the chunk names has.
 */
export class TerrainMaterial extends THREE.ShaderMaterial {
  declare uniforms: Record<string, THREE.IUniform>;
  private program: ProgramText | null = null;
  private drawing: TerrainPath = 'fallback';
  private readonly expected = new Set<string>();

  constructor(opts: TerrainMaterialOptions = {}) {
    const sun = (opts.sunDirection ?? SUN_DIRECTION).clone().normalize();
    const base: THREE.IUniform<THREE.Texture | null> = { value: null };
    const layer1: THREE.IUniform<THREE.Texture | null> = { value: null };
    const layer2: THREE.IUniform<THREE.Texture | null> = { value: null };
    const mask: THREE.IUniform<THREE.Texture | null> = { value: null };
    const shadow = shadowUvTransform(MASK_TEXELS);
    super({
      // `lights` for the sun's shadow map alone; with shadows off the shadow
      // chunks compile to nothing.
      lights: true,
      vertexShader: FALLBACK_VERTEX,
      fragmentShader: FALLBACK_FRAGMENT,
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
        uBase: base,
        uLayer1: layer1,
        uLayer2: layer2,
        uMask: mask,
        uHasBase: { value: 0 },
        uHas1: { value: 0 },
        uHas2: { value: 0 },
        uHasMask: { value: 0 },
        uSunDir: { value: sun },
        uGroundSunDir: { value: sun },
        // Own choice, set by the owner by eye beside the build, to match its ground's level and tone.
        uGroundGain: { value: 0.75 },
        uGroundAmbientScale: { value: 0.95 },
        uGroundDiffuseScale: { value: 0.4 },
        uGroundShade: { value: 1 },
        uGroundSaturation: { value: 0.9 },
        uGroundContrast: { value: 1.1 },
        uGroundWarmth: { value: -0.1 },
        uGroundAmbient: GROUND_LIGHT.ambient,
        uGroundDiffuse: GROUND_LIGHT.diffuse,
        uShadowUv: { value: new THREE.Vector2(shadow.scale, shadow.offset) },
        uFogColour: { value: new THREE.Vector3() },
        uSceneFogRange: { value: new THREE.Vector2() },
        // The loaded program's, by the names its text declares. The textures
        // are the same objects as ours, so both paths follow each binding.
        texture1: base,
        texture2: layer1,
        texture3: layer2,
        texture4: mask,
        texture_matrix: { value: shadowMatrix(shadow, new THREE.Matrix4()) },
        light_direction: { value: sun },
        light_ambient_color: GROUND_LIGHT.ambient,
        light_diffuse_color: GROUND_LIGHT.diffuse,
        fogcolor: { value: new THREE.Vector4(0, 0, 0, 1) },
        fogstartend: { value: new THREE.Vector2() },
        WorldViewProjectionMatrix: { value: new THREE.Matrix4() },
        WorldViewT: { value: new THREE.Matrix4() },
        World: { value: new THREE.Matrix4() },
      },
    });
  }

  get path(): TerrainPath {
    return this.drawing;
  }

  /** Name the slots, and whether a mask, this material will be given. */
  expect(slots: readonly GroundSlot[], mask: boolean): void {
    for (const slot of slots) this.expected.add(SLOT_FLAGS[slot]);
    if (mask) this.expected.add('uHasMask');
  }

  /** A texture that will not arrive: draw as if the slot were empty, except the base, which keeps the stand-in. */
  unavailable(what: GroundSlot | 'mask'): void {
    if (what === 0) return;
    this.expected.delete(what === 'mask' ? 'uHasMask' : SLOT_FLAGS[what]);
    this.choosePath();
  }

  bindLayer(slot: GroundSlot, texture: THREE.Texture): void {
    this.uniforms[(['uBase', 'uLayer1', 'uLayer2'] as const)[slot]].value = texture;
    this.uniforms[SLOT_FLAGS[slot]].value = 1;
    this.choosePath();
  }

  bindMask(texture: THREE.Texture): void {
    this.uniforms.uMask.value = texture;
    this.uniforms.uHasMask.value = 1;
    const width = (texture.image as { width?: number } | null)?.width;
    const shadow = shadowUvTransform(width && width > 0 ? width : MASK_TEXELS);
    this.uniforms.uShadowUv.value.set(shadow.scale, shadow.offset);
    shadowMatrix(shadow, this.uniforms.texture_matrix.value);
    this.choosePath();
  }

  /** Hand over the build's program text, or null where it has none. */
  useProgram(source: { vertex: string | null; fragment: string | null } | null): void {
    const weighed = source?.fragment
      ? { ...source, fragment: weighMaskReads(source.fragment) }
      : source;
    this.program = adaptProgram(weighed, LOADED_VERTEX_WRAP, LOADED_FRAGMENT_WRAP);
    this.choosePath();
  }

  choosePath(): TerrainPath {
    const ready = [...this.expected].every(flag => this.uniforms[flag].value > 0.5);
    const next: TerrainPath = this.program && ready ? 'loaded' : 'fallback';
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
    // The loaded program turns normals with this, so it carries no translation.
    u.World.value.copy(toModelRotation.extractRotation(object.matrixWorld));
    this.uniformsNeedUpdate = true;
  }
}

function shadowMatrix(
  shadow: { scale: number; offset: number },
  out: THREE.Matrix4,
): THREE.Matrix4 {
  return out.makeScale(shadow.scale, shadow.scale, 1).setPosition(shadow.offset, shadow.offset, 0);
}

export function createTerrainMaterial(opts: TerrainMaterialOptions = {}): TerrainMaterial {
  return new TerrainMaterial(opts);
}
