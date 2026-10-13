/**
 * The water shader bench: the build's own water program and our fallback on
 * the same plane, with the program's own inputs on sliders, a PNG capture and
 * a numeric fingerprint of the frame.
 *
 *     UBIQUITOUS_PACK_DIR=<packs-or-apps> npm run dev
 *     open /dev/shader-lab.html?dir=<packs-or-one.ipa>
 *
 * `?dir=` is either a directory holding the build's `.bin` packs, or the
 * `.ipa` itself; that folder must also be `UBIQUITOUS_PACK_DIR` when vite started.
 *
 * The point is to watch what the build's shader does when its inputs move, and
 * to put a number on how far our fallback is from it, so a clean-room shader
 * can be written against the observations. Nothing here reads the build's
 * shader source beyond handing it to the GPU. Dev only; nothing ships.
 */

import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import * as THREE from 'three';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { ResourceSystem } from '../src/assets/ResourceSystem';
import { MaterialCache } from '../src/renderer/MaterialCache';
import { attachWaterTextures, WATER_REFLECTION_TEXTURE } from '../src/renderer/WaterFactory';
import { WATER_PROGRAMS, createWaterMaterial, depthCoord } from '../src/renderer/waterShader';
import type { WaterMaterial } from '../src/renderer/waterShader';
import { buildTerrainTile } from '../src/renderer/TerrainFactory';
import type { BuiltTerrainTile } from '../src/renderer/TerrainFactory';
import { TERRAIN_PROGRAM, type TerrainMaterial } from '../src/renderer/terrainShader';
import {
  createWaterfallMaterial,
  prepareWaterfallTexture,
  WATERFALL_PROGRAM,
} from '../src/renderer/waterfallShader';
import type { WaterfallMaterial } from '../src/renderer/waterfallShader';
import { distance, fingerprint, mean } from './shaderCompare';
import '../src/ui/styles/global.css';

const params = new URLSearchParams(location.search);
const DIR = params.get('dir') ?? '';
const PACKS = ['res.bin', 'res_t.bin'];

const BUTTON =
  'rounded-chrome-sm border border-brass-600 px-2 py-0.5 text-micro text-brass-300 uppercase hover:bg-chrome-900 disabled:opacity-50';
const SLIDER = 'w-40 accent-brass-400';

/** A `#rrggbb` colour as three 0..1 channels. */
function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** A colour preset: gain, saturation, contrast, tint and gamma at once. */
interface Preset {
  name: string;
  gain: number;
  saturation: number;
  contrast: number;
  tint: string;
  gamma: number;
}

/** Colour presets to flip through, all aimed at the build's warm, bright read. */
const PRESETS: readonly Preset[] = [
  { name: 'neutral', gain: 1, saturation: 1, contrast: 1, tint: '#ffffff', gamma: 1 },
  { name: 'warm', gain: 1.1, saturation: 1.2, contrast: 1.3, tint: '#ffe6cc', gamma: 0.9 },
  { name: 'golden', gain: 1.15, saturation: 1.35, contrast: 1.5, tint: '#ffd9a0', gamma: 0.85 },
  { name: 'sunlit', gain: 1.15, saturation: 1.3, contrast: 1.5, tint: '#fff2d0', gamma: 0.85 },
  { name: 'vivid', gain: 1.05, saturation: 1.4, contrast: 1.6, tint: '#ffffff', gamma: 0.95 },
  { name: 'clean', gain: 1.05, saturation: 1.35, contrast: 1.4, tint: '#f0fff4', gamma: 0.95 },
  { name: 'deep', gain: 0.95, saturation: 1.45, contrast: 1.9, tint: '#e8f0ff', gamma: 1.05 },
  { name: 'cool', gain: 1, saturation: 1.25, contrast: 1.5, tint: '#e0f0ff', gamma: 0.95 },
];

interface Bench {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  mesh: THREE.Mesh;
  game: WaterMaterial;
  fallback: WaterMaterial;
  /** One real ground tile, through the build's program and through ours. */
  ground: { build: BuiltTerrainTile | null; ours: BuiltTerrainTile | null };
  /** One flowing-water sheet, through the build's program and through ours. */
  flow: { build: WaterfallMaterial | null; ours: WaterfallMaterial | null };
  /** Which surface is on the bench, and which of its two paths is drawn. */
  subject: { kind: 'water' | 'terrain' | 'waterfall' };
  mode: { which: 'game' | 'fallback' };
  /** Draw the build's program and ours side by side, same camera and time. */
  compare: { on: boolean };
  /** Draw the build's reflection picture flat, full screen, on its own. */
  debug: { on: boolean };
  /** Draw with ripples (true) or flat (false), on both sides. */
  setWaves(on: boolean): void;
  /** Bind a flat grey in place of the sheet's texture, to see which path reads it. */
  setFlowMap(blank: boolean): void;
  /** Frame the current subject. */
  place(): void;
  frame(): void;
  pixels(): { data: Uint8Array; width: number; height: number };
  dispose(): void;
}

/** A plane lying on the ground with every attribute the water programs read. */
function buildWaterPlane(size = 80, segments = 64): THREE.BufferGeometry {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const count = geometry.getAttribute('position').count;
  const uv1 = new Float32Array(count * 2);
  const shore = new Float32Array(count);
  const normal = new Float32Array(count * 3);
  const colour = new Float32Array(count * 4);
  const depth = depthCoord(1);
  for (let i = 0; i < count; i++) {
    uv1[i * 2] = depth[0];
    uv1[i * 2 + 1] = depth[1];
    shore[i] = 1;
    normal[i * 3 + 1] = 1;
    colour[i * 4] = colour[i * 4 + 1] = colour[i * 4 + 2] = colour[i * 4 + 3] = 1;
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
  geometry.setAttribute('shore', new THREE.BufferAttribute(shore, 1));
  // The build's program declares these by their own names; `adaptStage` only
  // renames Vertex, TexCoord0 and TexCoord1, so they are supplied as they are.
  geometry.setAttribute('Normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('Color0', new THREE.BufferAttribute(colour, 4));
  geometry.computeBoundingSphere();
  return geometry;
}

/** The files to mount: the `.ipa` itself, or a directory holding its packs. */
async function sourceFiles(): Promise<File[]> {
  if (/\.ipa$/i.test(DIR)) {
    const got = await fetch(`/@fs/${DIR}`).catch(() => null);
    if (!got?.ok) throw new Error(`could not read ${DIR}; is its folder $UBIQUITOUS_PACK_DIR?`);
    return [new File([await got.blob()], DIR.split('/').pop() || 'game.ipa')];
  }
  const files: File[] = [];
  for (const name of PACKS) {
    const got = await fetch(`/@fs/${DIR}/${name}`).catch(() => null);
    if (!got?.ok) continue;
    const blob = await got.blob();
    if (blob.type.startsWith('text/')) continue;
    files.push(new File([blob], name));
  }
  if (!files.length) throw new Error(`${DIR} must hold ${PACKS.join(' or ')}, or be an .ipa`);
  return files;
}

async function mount(host: HTMLElement): Promise<Bench> {
  const files = await sourceFiles();

  const provider = new PackAssetProvider();
  await provider.useSource(provider.offer(files).id);
  const resources = new ResourceSystem(provider);
  const cache = new MaterialCache(resources);

  const game = createWaterMaterial();
  await attachWaterTextures(game, cache);
  // The bench side alone reads the build's programs, for the comparison.
  // The game never fetches them; its water draws our own program throughout.
  game.usePrograms({
    soft: await cache.programSource(WATER_PROGRAMS.soft).catch(() => null),
    plain: await cache.programSource(WATER_PROGRAMS.plain).catch(() => null),
  });
  // Our side takes the same textures but never the build's program, so the
  // two draw the same inputs through different code.
  const fallback = createWaterMaterial();
  await attachWaterTextures(fallback, cache);

  // The picture the reflection reads, laid out flat and full screen, so its
  // sky, horizon and land can be read off directly.
  const reflection = fallback.uniforms._ReflectionTex.value as THREE.Texture | null;

  // The real ripple map, and a flat one to stand in for "no waves", so either
  // side can be drawn without ripples while the reflection is mapped.
  const realBump = fallback.uniforms._BumpMap.value as THREE.Texture | null;
  const flatBump = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  flatBump.needsUpdate = true;
  const setWaves = (on: boolean): void => {
    if (!realBump) return;
    for (const material of [game, fallback]) material.bindBump(on ? realBump : flatBump);
  };
  const debugScene = new THREE.Scene();
  const debugCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  let debugGeometry: THREE.PlaneGeometry | null = null;
  let debugMaterial: THREE.MeshBasicMaterial | null = null;
  if (reflection) {
    debugGeometry = new THREE.PlaneGeometry(2, 2);
    debugMaterial = new THREE.MeshBasicMaterial({ map: reflection, depthTest: false });
    debugScene.add(new THREE.Mesh(debugGeometry, debugMaterial));
  }

  const geometry = buildWaterPlane();
  const mesh = new THREE.Mesh(geometry, game);
  const scene = new THREE.Scene();
  scene.add(mesh);

  // A real ground tile, built twice: once through the build's program, once
  // through our own. The subject switch draws one or the other.
  const ground: { build: BuiltTerrainTile | null; ours: BuiltTerrainTile | null } = {
    build: null,
    ours: null,
  };
  const waterFocus = new THREE.Vector3();
  const terrainFocus = new THREE.Vector3();
  const subject: { kind: 'water' | 'terrain' } = { kind: 'water' };
  const mode: { which: 'game' | 'fallback' } = { which: 'game' };
  try {
    const index = await resources.zoneIndex();
    const zone = index.zones.find(one => one.hasScenery) ?? index.zones[0];
    const tile = zone
      ? await resources.load({
          kind: 'tile',
          mapId: zone.mapId,
          world: zone.world,
          tx: Math.floor(zone.centre[0] / 64),
          tz: Math.floor(zone.centre[1] / 64),
        })
      : null;
    if (tile?.terrain) {
      for (const which of ['build', 'ours'] as const) {
        const built = buildTerrainTile(tile.terrain, cache);
        if (built) {
          // As with water, only the bench side reads the build's program.
          if (which === 'build') {
            const source = await cache.programSource(TERRAIN_PROGRAM).catch(() => null);
            for (const material of built.materials)
              (material as TerrainMaterial).useProgram(source);
          }
          built.mesh.visible = false;
          scene.add(built.mesh);
          ground[which] = built;
        }
      }
      const t = tile.terrain;
      let sum = 0;
      for (const height of t.heights) sum += height;
      terrainFocus.set(
        t.origin[0] + t.tileSize / 2,
        t.heights.length ? sum / t.heights.length : 0,
        t.origin[1] + t.tileSize / 2,
      );
    }
  } catch {
    // No ground in this build; the water bench still works.
  }

  // Flowing water: one sheet of the build's fountain art, the build's program
  // on one side and our sliding sheet on the other.
  const flow: { build: WaterfallMaterial | null; ours: WaterfallMaterial | null } = {
    build: null,
    ours: null,
  };
  const flowGeometry = new THREE.PlaneGeometry(12, 18, 1, 1);
  const flowTexture = await cache
    .rawTexture('texture/waterfull.tga', 'repeat', 'data')
    .catch(() => null);
  const flowReflection = await cache
    .rawTexture(WATER_REFLECTION_TEXTURE, 'repeat', 'data')
    .catch(() => null);
  let flowMesh: THREE.Mesh | null = null;
  if (flowTexture) {
    prepareWaterfallTexture(flowTexture);
    for (const [which, programs] of [
      ['build', true],
      ['ours', false],
    ] as const) {
      const material = createWaterfallMaterial(false);
      material.uniforms.map.value = flowTexture;
      material.uniforms.uHasMap.value = 1;
      if (flowReflection) material.bindReflection(flowReflection);
      if (programs) {
        const source = await cache.programSource(WATERFALL_PROGRAM).catch(() => null);
        material.useProgram(source);
      }
      flow[which] = material;
    }
    flowMesh = new THREE.Mesh(flowGeometry, flow.build!);
    flowMesh.visible = false;
    scene.add(flowMesh);
  }
  // A flat stand-in for the sheet's texture: whichever path stops changing
  // when it is bound is the path that reads `map`.
  const blankMap = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
  blankMap.needsUpdate = true;
  const setFlowMap = (blank: boolean): void => {
    if (!flowTexture) return;
    for (const material of [flow.build, flow.ours]) {
      if (!material) continue;
      material.uniforms.map.value = blank ? blankMap : flowTexture;
      material.choosePath();
    }
  };

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  const view = { azimuth: 0, elevation: 0.28, zoom: 1 };
  const focus = new THREE.Vector3();
  const place = (): void => {
    const terrain = subject.kind === 'terrain' && Boolean(ground.build);
    const waterfall = subject.kind === 'waterfall' && Boolean(flowMesh);
    focus.copy(terrain ? terrainFocus : waterFocus);
    const distance = (waterfall ? 26 : terrain ? 130 : 12) * view.zoom;
    const height = Math.sin(view.elevation) * distance;
    const radius = Math.cos(view.elevation) * distance;
    camera.position.set(
      focus.x + Math.sin(view.azimuth) * radius,
      focus.y + Math.max(0.5, height),
      focus.z + Math.cos(view.azimuth) * radius,
    );
    camera.lookAt(focus);
  };
  place();

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  host.append(renderer.domElement);

  // Drag to orbit: the only way to tell a surface-mapped reflection from a
  // screen-projected one is to move and watch which way it slides.
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  const down = (event: PointerEvent): void => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    renderer.domElement.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent): void => {
    if (!dragging) return;
    view.azimuth -= (event.clientX - lastX) * 0.006;
    view.elevation = Math.min(
      1.4,
      Math.max(0.05, view.elevation + (event.clientY - lastY) * 0.006),
    );
    lastX = event.clientX;
    lastY = event.clientY;
    place();
  };
  const up = (event: PointerEvent): void => {
    dragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
  };
  renderer.domElement.addEventListener('pointerdown', down);
  renderer.domElement.addEventListener('pointermove', move);
  renderer.domElement.addEventListener('pointerup', up);
  const wheel = (event: WheelEvent): void => {
    event.preventDefault();
    view.zoom = Math.min(8, Math.max(0.15, view.zoom * (1 + event.deltaY * 0.001)));
    place();
  };
  renderer.domElement.addEventListener('wheel', wheel, { passive: false });

  const resize = (): void => {
    const width = host.clientWidth || 960;
    const height = host.clientHeight || 540;
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const clock = new THREE.Clock();
  const compare = { on: false };
  const debug = { on: false };
  let raf = 0;
  /** Show one side of the current subject: the build's program or ours. */
  const show = (which: 'game' | 'fallback'): void => {
    const water = subject.kind === 'water';
    const terrain = subject.kind === 'terrain' && Boolean(ground.build && ground.ours);
    const waterfall = subject.kind === 'waterfall' && Boolean(flowMesh && flow.build && flow.ours);
    mesh.visible = water;
    if (ground.build) ground.build.mesh.visible = terrain && which === 'game';
    if (ground.ours) ground.ours.mesh.visible = terrain && which === 'fallback';
    if (flowMesh) flowMesh.visible = waterfall;
    if (waterfall) flowMesh!.material = which === 'game' ? flow.build! : flow.ours!;
    else if (water) mesh.material = which === 'game' ? game : fallback;
  };
  /** One camera, two halves: the build's program left, ours right. */
  const drawSplit = (): void => {
    const width = host.clientWidth || 960;
    const height = host.clientHeight || 540;
    const half = Math.floor(width / 2);
    renderer.setScissorTest(true);
    camera.aspect = half / height;
    camera.updateProjectionMatrix();
    for (const [which, at] of [
      ['game', 0],
      ['fallback', half],
    ] as const) {
      renderer.setViewport(at, 0, half, height);
      renderer.setScissor(at, 0, half, height);
      show(which);
      renderer.render(scene, camera);
    }
    renderer.setScissorTest(false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    show(mode.which);
  };
  const tick = (): void => {
    const t = clock.getElapsedTime();
    for (const material of [game, fallback]) material.uniforms.uTime.value = t;
    if (debug.on && subject.kind === 'water' && debugMaterial)
      renderer.render(debugScene, debugCamera);
    else if (compare.on) drawSplit();
    else {
      show(mode.which);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(tick);
  };
  tick();

  const pixels = (): { data: Uint8Array; width: number; height: number } => {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const data = new Uint8Array(size.x * size.y * 4);
    const gl = renderer.getContext();
    gl.readPixels(0, 0, size.x, size.y, gl.RGBA, gl.UNSIGNED_BYTE, data);
    return { data, width: size.x, height: size.y };
  };

  return {
    renderer,
    scene,
    camera,
    mesh,
    game,
    fallback,
    ground,
    subject,
    mode,
    compare,
    debug,
    setWaves,
    setFlowMap,
    place,
    frame: () => {
      show(mode.which);
      renderer.render(scene, camera);
    },
    pixels,
    dispose: () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', down);
      renderer.domElement.removeEventListener('pointermove', move);
      renderer.domElement.removeEventListener('pointerup', up);
      renderer.domElement.removeEventListener('wheel', wheel);
      geometry.dispose();
      flatBump.dispose();
      for (const tile of [ground.build, ground.ours]) {
        tile?.geometry.dispose();
        for (const material of tile.materials) material.dispose();
      }
      flowGeometry.dispose();
      flowTexture?.dispose();
      flowReflection?.dispose();
      blankMap.dispose();
      flow.build?.dispose();
      flow.ours?.dispose();
      debugGeometry?.dispose();
      debugMaterial?.dispose();
      game.dispose();
      fallback.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function Lab(): JSX.Element {
  const host = useRef<HTMLDivElement>(null);
  const benchRef = useRef<Bench | null>(null);
  const [note, setNote] = useState('Reading the build…');
  const [mode, setMode] = useState<'game' | 'fallback'>('game');
  const [soft, setSoft] = useState(true);
  const [refle, setRefle] = useState(1);
  const [sharpness, setSharpness] = useState(24);
  const [highlight, setHighlight] = useState(0.25);
  const [skyMode, setSkyMode] = useState(0);
  const [skyShift, setSkyShift] = useState(-0.16);
  const [skyScale, setSkyScale] = useState(1.3);
  const [skyGain, setSkyGain] = useState(1);
  const [skyTint, setSkyTint] = useState('#ffffff');
  const [skyGamma, setSkyGamma] = useState(1);
  const [skyContrast, setSkyContrast] = useState(1);
  const [skyMirror, setSkyMirror] = useState(true);
  const [skyFlipY, setSkyFlipY] = useState(true);
  const [skyYaw, setSkyYaw] = useState(0.5);
  const [skySaturation, setSkySaturation] = useState(1);
  const [rippleRepeat, setRippleRepeat] = useState(1.55);
  const [rippleStrength, setRippleStrength] = useState(0.4);
  const [compare, setCompare] = useState(false);
  const [skyDebug, setSkyDebug] = useState(false);
  const [noWaves, setNoWaves] = useState(false);
  const [blankFlow, setBlankFlow] = useState(false);
  const [subject, setSubject] = useState<'water' | 'terrain' | 'waterfall'>('water');
  const [groundBright, setGroundBright] = useState(0.75);
  const [groundAmbient, setGroundAmbient] = useState(0.95);
  const [groundDiffuse, setGroundDiffuse] = useState(0.4);
  const [groundShade, setGroundShade] = useState(1);
  const [groundSat, setGroundSat] = useState(0.9);
  const [groundCon, setGroundCon] = useState(1.1);
  const [groundWarm, setGroundWarm] = useState(-0.1);
  const [flowRate, setFlowRate] = useState(0.7);
  const [flowScale, setFlowScale] = useState(1.5);
  const [flowAlpha, setFlowAlpha] = useState(0.7);
  const [flowRipple, setFlowRipple] = useState(2.2);
  const [flowReflect, setFlowReflect] = useState(0.35);
  const [flowFoam, setFlowFoam] = useState(0.35);
  const [flowBright, setFlowBright] = useState(0.9);
  const [flowContrast, setFlowContrast] = useState(0.8);
  const [flowTint, setFlowTint] = useState('#b8e0ff');
  const compareWanted = useRef(false);
  const wavesWanted = useRef(true);
  const [measured, setMeasured] = useState('not measured');

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    void mount(el)
      .then(bench => {
        if (disposed) {
          bench.dispose();
          return;
        }
        benchRef.current = bench;
        bench.compare.on = compareWanted.current;
        bench.setWaves(wavesWanted.current);
        setNote(
          bench.game.path === 'fallback'
            ? 'This build ships no water program: both sides are our fallback.'
            : `Drawing the build's water (${bench.game.path}).`,
        );
      })
      .catch((err: unknown) => setNote(`Would not mount: ${String(err)}`));
    return () => {
      disposed = true;
      benchRef.current?.dispose();
      benchRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (benchRef.current) benchRef.current.mode.which = mode;
  }, [mode]);

  useEffect(() => {
    const bench = benchRef.current;
    if (!bench) return;
    bench.subject.kind = subject;
    bench.place();
  }, [subject]);

  useEffect(() => {
    const bench = benchRef.current;
    if (!bench) return;
    for (const tile of [bench.ground.build, bench.ground.ours]) {
      if (!tile) continue;
      for (const material of tile.materials as TerrainMaterial[]) {
        const u = material.uniforms;
        u.uGroundGain.value = groundBright;
        u.uGroundAmbientScale.value = groundAmbient;
        u.uGroundDiffuseScale.value = groundDiffuse;
        u.uGroundShade.value = groundShade;
        u.uGroundSaturation.value = groundSat;
        u.uGroundContrast.value = groundCon;
        u.uGroundWarmth.value = groundWarm;
      }
    }
  }, [groundBright, groundAmbient, groundDiffuse, groundShade, groundSat, groundCon, groundWarm]);

  useEffect(() => {
    const bench = benchRef.current;
    if (!bench) return;
    const [r, g, b] = rgbOf(flowTint);
    for (const material of [bench.flow.build, bench.flow.ours]) {
      if (!material) continue;
      const u = material.uniforms;
      u.uFlowRate.value = flowRate;
      u.uFlowScale.value = flowScale;
      u.uFlowAlpha.value = flowAlpha;
      u.uFlowRipple.value = flowRipple;
      u.uFlowReflect.value = flowReflect;
      u.uFlowFoam.value = flowFoam;
      u.uFlowBright.value = flowBright;
      u.uFlowContrast.value = flowContrast;
      u.uFlowTint.value.set(r, g, b);
    }
  }, [
    flowRate,
    flowScale,
    flowAlpha,
    flowRipple,
    flowReflect,
    flowFoam,
    flowBright,
    flowContrast,
    flowTint,
  ]);

  useEffect(() => {
    compareWanted.current = compare;
    const bench = benchRef.current;
    if (bench) bench.compare.on = compare;
  }, [compare]);

  useEffect(() => {
    const bench = benchRef.current;
    if (!bench) return;
    for (const material of [bench.game, bench.fallback]) {
      material.uniforms.uSoft.value = soft ? 1 : 0;
      material.uniforms.pramaRefle.value = refle;
      material.uniforms.SpecuRange.value = sharpness;
      material.uniforms.SpecuSreng.value = highlight;
      material.uniforms.uSkyMode.value = skyMode;
      material.uniforms.uSkyShift.value = skyShift;
      material.uniforms.uSkyScale.value = skyScale;
      material.uniforms.uSkyGain.value = skyGain;
      const [tr, tg, tb] = rgbOf(skyTint);
      material.uniforms.uSkyTint.value.set(tr, tg, tb);
      material.uniforms.uSkyGamma.value = skyGamma;
      material.uniforms.uSkyFlipY.value = skyFlipY ? 1 : 0;
      material.uniforms.uSkyYaw.value = skyYaw;
      material.uniforms.uSkyContrast.value = skyContrast;
      material.uniforms.uSkyMirror.value = skyMirror ? 1 : 0;
      material.uniforms.uSkySaturation.value = skySaturation;
      material.uniforms.uRippleRepeat.value = rippleRepeat;
      material.uniforms.uRippleStrength.value = rippleStrength;
      material.choosePath();
    }
  }, [
    soft,
    refle,
    sharpness,
    highlight,
    skyMode,
    skyShift,
    skyScale,
    skyGain,
    skyTint,
    skyGamma,
    skyFlipY,
    skyYaw,
    skyContrast,
    skyMirror,
    skySaturation,
    rippleRepeat,
    rippleStrength,
  ]);

  useEffect(() => {
    const bench = benchRef.current;
    if (bench) bench.debug.on = skyDebug;
  }, [skyDebug]);

  useEffect(() => {
    wavesWanted.current = !noWaves;
    benchRef.current?.setWaves(!noWaves);
  }, [noWaves]);

  useEffect(() => {
    benchRef.current?.setFlowMap(blankFlow);
  }, [blankFlow]);

  /** Draw one side and return whatever `read` makes of that frame. */
  const drawn = <T,>(which: 'game' | 'fallback', read: (bench: Bench) => T): T | null => {
    const bench = benchRef.current;
    if (!bench) return null;
    const previous = bench.mode.which;
    bench.mode.which = which;
    bench.frame();
    try {
      return read(bench);
    } finally {
      bench.mode.which = previous;
    }
  };

  /** A fingerprint of the frame now on screen. */
  const shot = (bench: Bench): number[] => {
    const { data, width, height } = bench.pixels();
    return fingerprint(data, width, height);
  };

  const capture = (): void => {
    const bench = benchRef.current;
    if (!bench) return;
    bench.frame();
    const link = document.createElement('a');
    link.href = bench.renderer.domElement.toDataURL('image/png');
    link.download = `shader-${subject}-${mode}-${Date.now()}.png`;
    link.click();
  };

  const measure = (): void => {
    const a = drawn('game', shot);
    const c = drawn('fallback', shot);
    if (a && c)
      setMeasured(`distance ${distance(a, c).toFixed(1)} (game mean ${mean(a).toFixed(1)})`);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-chrome-950 text-parchment-100">
      <div ref={host} className="relative min-h-0 flex-1 overflow-hidden"></div>
      <div className="text-body relative z-10 flex flex-wrap items-center gap-3 border-t border-brass-600 bg-chrome-900 px-3 py-2">
        <span className="text-brass-300">{note}</span>
        <label className="flex items-center gap-1">
          Surface
          <select
            className="rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1"
            value={subject}
            onChange={e => setSubject(e.currentTarget.value as 'water' | 'terrain')}
          >
            <option value="water">water</option>
            <option value="terrain">terrain</option>
            <option value="waterfall">waterfall</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Draw
          <select
            className="rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1"
            value={mode}
            onChange={e => setMode(e.currentTarget.value as 'game' | 'fallback')}
          >
            <option value="game">build's program</option>
            <option value="fallback">our fallback</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={compare}
            onChange={e => setCompare(e.currentTarget.checked)}
          />
          side by side
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={skyDebug}
            onChange={e => setSkyDebug(e.currentTarget.checked)}
          />
          show reflection
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soft} onChange={e => setSoft(e.currentTarget.checked)} />
          soft water
        </label>
        <label className="flex items-center gap-1">
          reflection
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={refle}
            onChange={e => setRefle(Number(e.currentTarget.value))}
          />
          {refle.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          sharpness
          <input
            className={SLIDER}
            type="range"
            min="1"
            max="128"
            step="1"
            value={sharpness}
            onChange={e => setSharpness(Number(e.currentTarget.value))}
          />
          {sharpness}
        </label>
        <label className="flex items-center gap-1">
          highlight
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={highlight}
            onChange={e => setHighlight(Number(e.currentTarget.value))}
          />
          {highlight.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          sky
          <select
            className="rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1"
            value={skyMode}
            onChange={e => setSkyMode(Number(e.currentTarget.value))}
          >
            <option value={0}>panorama</option>
            <option value={1}>panorama flipped</option>
            <option value={2}>planar</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          sky shift
          <input
            className={SLIDER}
            type="range"
            min="-0.5"
            max="0.5"
            step="0.01"
            value={skyShift}
            onChange={e => setSkyShift(Number(e.currentTarget.value))}
          />
          {skyShift.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          sky scale
          <input
            className={SLIDER}
            type="range"
            min="0.25"
            max="2"
            step="0.05"
            value={skyScale}
            onChange={e => setSkyScale(Number(e.currentTarget.value))}
          />
          {skyScale.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          sky gain
          <input
            className={SLIDER}
            type="range"
            min="0.25"
            max="2.5"
            step="0.05"
            value={skyGain}
            onChange={e => setSkyGain(Number(e.currentTarget.value))}
          />
          {skyGain.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          preset
          <select
            className="rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1"
            value=""
            onChange={e => {
              const preset = PRESETS.find(one => one.name === e.currentTarget.value);
              if (!preset) return;
              setSkyGain(preset.gain);
              setSkySaturation(preset.saturation);
              setSkyContrast(preset.contrast);
              setSkyTint(preset.tint);
              setSkyGamma(preset.gamma);
            }}
          >
            <option value="">pick…</option>
            {PRESETS.map(one => (
              <option key={one.name} value={one.name}>
                {one.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          tint
          <input type="color" value={skyTint} onChange={e => setSkyTint(e.currentTarget.value)} />
        </label>
        <label className="flex items-center gap-1">
          gamma
          <input
            className={SLIDER}
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            value={skyGamma}
            onChange={e => setSkyGamma(Number(e.currentTarget.value))}
          />
          {skyGamma.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={skyMirror}
            onChange={e => setSkyMirror(e.currentTarget.checked)}
          />
          sky mirror
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={skyFlipY}
            onChange={e => setSkyFlipY(e.currentTarget.checked)}
          />
          flip y
        </label>
        <label className="flex items-center gap-1">
          yaw
          <input
            className={SLIDER}
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            value={skyYaw}
            onChange={e => setSkyYaw(Number(e.currentTarget.value))}
          />
          {skyYaw.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={noWaves}
            onChange={e => setNoWaves(e.currentTarget.checked)}
          />
          no waves
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={blankFlow}
            onChange={e => setBlankFlow(e.currentTarget.checked)}
          />
          blank flow map
        </label>
        <label className="flex items-center gap-1">
          sky con
          <input
            className={SLIDER}
            type="range"
            min="0.5"
            max="3"
            step="0.05"
            value={skyContrast}
            onChange={e => setSkyContrast(Number(e.currentTarget.value))}
          />
          {skyContrast.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          sky sat
          <input
            className={SLIDER}
            type="range"
            min="0.5"
            max="2"
            step="0.05"
            value={skySaturation}
            onChange={e => setSkySaturation(Number(e.currentTarget.value))}
          />
          {skySaturation.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ripple x
          <input
            className={SLIDER}
            type="range"
            min="0.5"
            max="4"
            step="0.05"
            value={rippleRepeat}
            onChange={e => setRippleRepeat(Number(e.currentTarget.value))}
          />
          {rippleRepeat.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ripple
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={rippleStrength}
            onChange={e => setRippleStrength(Number(e.currentTarget.value))}
          />
          {rippleStrength.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground bright
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={groundBright}
            onChange={e => setGroundBright(Number(e.currentTarget.value))}
          />
          {groundBright.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground ambient
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={groundAmbient}
            onChange={e => setGroundAmbient(Number(e.currentTarget.value))}
          />
          {groundAmbient.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground sun
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={groundDiffuse}
            onChange={e => setGroundDiffuse(Number(e.currentTarget.value))}
          />
          {groundDiffuse.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground shade
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={groundShade}
            onChange={e => setGroundShade(Number(e.currentTarget.value))}
          />
          {groundShade.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground sat
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={groundSat}
            onChange={e => setGroundSat(Number(e.currentTarget.value))}
          />
          {groundSat.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground contrast
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={groundCon}
            onChange={e => setGroundCon(Number(e.currentTarget.value))}
          />
          {groundCon.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          ground warm
          <input
            className={SLIDER}
            type="range"
            min="-1"
            max="1"
            step="0.05"
            value={groundWarm}
            onChange={e => setGroundWarm(Number(e.currentTarget.value))}
          />
          {groundWarm.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow rate
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={flowRate}
            onChange={e => setFlowRate(Number(e.currentTarget.value))}
          />
          {flowRate.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow scale
          <input
            className={SLIDER}
            type="range"
            min="0.25"
            max="8"
            step="0.05"
            value={flowScale}
            onChange={e => setFlowScale(Number(e.currentTarget.value))}
          />
          {flowScale.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow alpha
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="1.5"
            step="0.05"
            value={flowAlpha}
            onChange={e => setFlowAlpha(Number(e.currentTarget.value))}
          />
          {flowAlpha.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow ripple
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="8"
            step="0.05"
            value={flowRipple}
            onChange={e => setFlowRipple(Number(e.currentTarget.value))}
          />
          {flowRipple.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow reflect
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={flowReflect}
            onChange={e => setFlowReflect(Number(e.currentTarget.value))}
          />
          {flowReflect.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow foam
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={flowFoam}
            onChange={e => setFlowFoam(Number(e.currentTarget.value))}
          />
          {flowFoam.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow bright
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="2"
            step="0.05"
            value={flowBright}
            onChange={e => setFlowBright(Number(e.currentTarget.value))}
          />
          {flowBright.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow contrast
          <input
            className={SLIDER}
            type="range"
            min="0"
            max="3"
            step="0.05"
            value={flowContrast}
            onChange={e => setFlowContrast(Number(e.currentTarget.value))}
          />
          {flowContrast.toFixed(2)}
        </label>
        <label className="flex items-center gap-1">
          flow tint
          <input type="color" value={flowTint} onChange={e => setFlowTint(e.currentTarget.value)} />
        </label>
        <button className={BUTTON} onClick={capture}>
          Capture PNG
        </button>
        <button className={BUTTON} onClick={measure}>
          Measure fallback
        </button>
        <span className="text-brass-400">{measured}</span>
      </div>
    </div>
  );
}

render(<Lab />, document.getElementById('shader-lab')!);
