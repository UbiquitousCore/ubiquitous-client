/**
 * Dev-only terrain demo: paint heights and textures, level ground, move
 * scenery and NPC markers, then save the edits as a data-only patch the game
 * applies at load.
 *
 *     npm run dev
 *     open http://localhost:8780/dev/terrain-editor.html
 *
 * Reads the user's own .ipa through the same worker provider as the game.
 * Nothing here ships.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { WorkerAssetProvider } from '../src/assets/providers/WorkerAssetProvider';
import { tileId, zoneIndexId } from '../src/assets/ids';
import type { Placement, TileData, ZoneInfo } from '../src/assets/types';
import {
  TERRAIN_PATCH_ENABLED_KEY,
  TERRAIN_PATCH_KEY,
  TERRAIN_PATCH_VERSION,
  applyTerrainPatchToTile,
  patchTileKey,
  type TerrainPatch,
  type TerrainPatchPlacement,
  type TerrainPatchRemoval,
} from '../src/assets/terrainPatch';

const TILE = 64;
const SIDE = 65;
const CHUNKS = 8;

type Tool = 'raise' | 'lower' | 'flatten' | 'set' | 'level' | 'texture' | 'select';

interface Drop {
  model: string;
  position: [number, number, number];
  yaw: number;
  marker: THREE.Object3D;
}

interface ProxyRef {
  kind: 'existing' | 'drop';
  tileKey: string;
  placement: Placement | null;
  dropIndex: number;
}

const el = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`terrain-editor.html is missing #${id}`);
  return node as T;
};

const say = (text: string): void => {
  el('status').textContent = text;
};

const yawToQuat = (yaw: number): [number, number, number, number] => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const quatToYaw = (q: readonly [number, number, number, number]): number => 2 * Math.atan2(q[1], q[3]);

const provider = new WorkerAssetProvider({});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101418);
const camera = new THREE.PerspectiveCamera(60, 1, 0.5, 4000);
camera.position.set(-70.9 - 60, 60, -131.4 - 60);
const renderer = new THREE.WebGLRenderer({ antialias: true });
el('view').appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(-70.9, 14, -131.4);
controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x3a4a3a, 1.1));
const sun = new THREE.DirectionalLight(0xfff2dd, 1.6);
sun.position.set(-120, 180, -60);
scene.add(sun);
scene.add(new THREE.GridHelper(640, 20, 0x2a333d, 0x1c232b));

function resize(): void {
  const host = el('view');
  renderer.setSize(host.clientWidth, host.clientHeight);
  camera.aspect = host.clientWidth / host.clientHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);

const tiles = new Map<string, TileData>();
const tileMeshes = new Map<string, THREE.Mesh>();
const chunkOverlays = new Map<string, THREE.Mesh>();
const edits = new Map<string, Map<number, number>>();
const chunkEdits = new Map<string, Map<number, [string | null, string | null, string | null]>>();
const removals: TerrainPatchRemoval[] = [];
const drops: Drop[] = [];
const proxies: THREE.Object3D[] = [];
const proxyGroup = new THREE.Group();
scene.add(proxyGroup);

const KIND_COLOURS: Record<string, number> = {
  scenery: 0x9aa7b0,
  static: 0x4dc3ff,
  creature: 0xff5d5d,
  effect: 0xff9f1c,
};
const kindMaterials = new Map<string, THREE.Material>();
const selectedMaterial = new THREE.MeshLambertMaterial({ color: 0xffe14d });
for (const [kind, colour] of Object.entries(KIND_COLOURS)) {
  kindMaterials.set(kind, new THREE.MeshLambertMaterial({ color: colour, transparent: true, opacity: 0.75 }));
}
const dropMaterial = new THREE.MeshLambertMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.85 });

const brushRing = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1, 48),
  new THREE.MeshBasicMaterial({ color: 0xffcf4d, side: THREE.DoubleSide, transparent: true }),
);
brushRing.rotation.x = -Math.PI / 2;
brushRing.visible = false;
scene.add(brushRing);

let zones: ZoneInfo[] = [];
let selected: THREE.Object3D | null = null;
let dragging = false;
let painting = false;
let lastPaint = 0;
let downAt: [number, number] | null = null;

function tool(): Tool {
  return (el('tool') as HTMLSelectElement).value as Tool;
}

function brushRadius(): number {
  return Number((el('radius') as HTMLInputElement).value);
}

function isTyping(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
}

/** Grass low, rock mid, snow high — reads at a glance, owns no game art. */
function colourFor(y: number, out: [number, number, number]): void {
  const t = Math.min(1, Math.max(0, (y + 12) / 48));
  const low: [number, number, number] = [0.24, 0.42, 0.2];
  const mid: [number, number, number] = [0.5, 0.42, 0.32];
  const high: [number, number, number] = [0.85, 0.87, 0.9];
  const mix = (a: number, b: number, f: number): number => a + (b - a) * f;
  const c = t < 0.5 ? [mix(low[0], mid[0], t * 2), mix(low[1], mid[1], t * 2), mix(low[2], mid[2], t * 2)]
    : [mix(mid[0], high[0], (t - 0.5) * 2), mix(mid[1], high[1], (t - 0.5) * 2), mix(mid[2], high[2], (t - 0.5) * 2)];
  out[0] = c[0]; out[1] = c[1]; out[2] = c[2];
}

function buildMesh(data: TileData): THREE.Mesh {
  const heights = data.terrain?.heights;
  const positions = new Float32Array(SIDE * SIDE * 3);
  const colours = new Float32Array(SIDE * SIDE * 3);
  const c: [number, number, number] = [0, 0, 0];
  for (let row = 0; row < SIDE; row++) {
    for (let col = 0; col < SIDE; col++) {
      const i = row * SIDE + col;
      const h = heights ? heights[i] : 0;
      positions[i * 3] = data.tile[0] * TILE + col;
      positions[i * 3 + 1] = h;
      positions[i * 3 + 2] = data.tile[1] * TILE + row;
      colourFor(h, c);
      colours[i * 3] = c[0]; colours[i * 3 + 1] = c[1]; colours[i * 3 + 2] = c[2];
    }
  }
  const indices: number[] = [];
  for (let row = 0; row < SIDE - 1; row++) {
    for (let col = 0; col < SIDE - 1; col++) {
      const a = row * SIDE + col;
      const b = a + 1;
      const d = a + SIDE;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

function chunkColour(triple: readonly (string | null)[], out: THREE.Color): void {
  let hash = 0;
  const key = triple.join('|');
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  out.setHSL((hash % 360) / 360, 0.65, 0.55);
}

/** One flat quad per chunk, tinted by which texture the chunk uses. */
function buildChunkOverlay(data: TileData): THREE.Mesh {
  const positions = new Float32Array(CHUNKS * CHUNKS * 4 * 3);
  const colours = new Float32Array(CHUNKS * CHUNKS * 4 * 3);
  const indices: number[] = [];
  const colour = new THREE.Color();
  const per = (SIDE - 1) / CHUNKS;
  let v = 0;
  for (let cz = 0; cz < CHUNKS; cz++) {
    for (let cx = 0; cx < CHUNKS; cx++) {
      const chunk = cz * CHUNKS + cx;
      if (data.terrain) chunkColour(data.terrain.chunkTextures[chunk] ?? [], colour);
      const x0 = data.tile[0] * TILE + cx * per;
      const z0 = data.tile[1] * TILE + cz * per;
      const x1 = x0 + per;
      const z1 = z0 + per;
      const corners: Array<[number, number]> = [[x0, z0], [x1, z0], [x0, z1], [x1, z1]];
      for (const [x, z] of corners) {
        const h = groundHeight(data, Math.min(data.tile[0] * TILE + TILE - 0.01, Math.max(data.tile[0] * TILE, x)),
          Math.min(data.tile[1] * TILE + TILE - 0.01, Math.max(data.tile[1] * TILE, z))) ?? 0;
        positions[v * 3] = x;
        positions[v * 3 + 1] = h + 0.4;
        positions[v * 3 + 2] = z;
        colours[v * 3] = colour.r; colours[v * 3 + 1] = colour.g; colours[v * 3 + 2] = colour.b;
        v++;
      }
      const b = v - 4;
      indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  mesh.visible = (el('showChunks') as HTMLInputElement).checked;
  return mesh;
}

function refreshChunkOverlay(key: string): void {
  const overlay = chunkOverlays.get(key);
  const data = tiles.get(key);
  if (!overlay || !data?.terrain) return;
  const colours = overlay.geometry.getAttribute('color') as THREE.BufferAttribute;
  const colour = new THREE.Color();
  for (let chunk = 0; chunk < CHUNKS * CHUNKS; chunk++) {
    chunkColour(data.terrain.chunkTextures[chunk] ?? [], colour);
    for (let k = 0; k < 4; k++) colours.setXYZ(chunk * 4 + k, colour.r, colour.g, colour.b);
  }
  colours.needsUpdate = true;
}

/** Bilinear on the grid; close enough to aim a drop or a brush ring. */
function groundHeight(data: TileData, x: number, z: number): number | null {
  const heights = data.terrain?.heights;
  if (!heights) return null;
  const lx = x - data.tile[0] * TILE;
  const lz = z - data.tile[1] * TILE;
  if (lx < 0 || lx > TILE || lz < 0 || lz > TILE) return null;
  const ix = Math.min(SIDE - 2, Math.max(0, Math.floor(lx)));
  const iz = Math.min(SIDE - 2, Math.max(0, Math.floor(lz)));
  const fx = lx - ix;
  const fz = lz - iz;
  const h = (col: number, row: number): number => heights[row * SIDE + col];
  const ha = h(ix, iz);
  const hb = h(ix + 1, iz);
  const hc = h(ix, iz + 1);
  const hd = h(ix + 1, iz + 1);
  return fx + fz <= 1 ? ha + (hb - ha) * fx + (hc - ha) * fz
    : hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
}

function refreshMesh(key: string): void {
  const mesh = tileMeshes.get(key);
  const data = tiles.get(key);
  if (!mesh || !data?.terrain) return;
  const positions = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const colours = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
  const c: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < SIDE * SIDE; i++) {
    positions.setY(i, data.terrain.heights[i]);
    colourFor(data.terrain.heights[i], c);
    colours.setXYZ(i, c[0], c[1], c[2]);
  }
  positions.needsUpdate = true;
  colours.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

function recordEdit(key: string, index: number, height: number): void {
  let tile = edits.get(key);
  if (!tile) {
    tile = new Map();
    edits.set(key, tile);
  }
  tile.set(index, height);
}

function recordChunkEdit(key: string, chunk: number, triple: [string | null, string | null, string | null]): void {
  let tile = chunkEdits.get(key);
  if (!tile) {
    tile = new Map();
    chunkEdits.set(key, tile);
  }
  tile.set(chunk, triple);
}

function paintHeights(point: THREE.Vector3, mode: Exclude<Tool, 'texture' | 'select'>, amount: number): void {
  const radius = brushRadius();
  const setY = Number((el('setY') as HTMLInputElement).value);
  let centreY = 0;
  if (mode === 'flatten' || mode === 'set' || mode === 'level') {
    if (mode === 'set') {
      centreY = setY;
    } else {
      // Level against the ring around the brush, so a cutting settles at its
      // neighbours' height instead of wherever the cursor first touched.
      let sum = 0;
      let count = 0;
      for (const data of tiles.values()) {
        if (!data.terrain) continue;
        const ox = data.tile[0] * TILE;
        const oz = data.tile[1] * TILE;
        for (let row = 0; row < SIDE; row += 2) {
          for (let col = 0; col < SIDE; col += 2) {
            const dist = Math.hypot(ox + col - point.x, oz + row - point.z);
            const inRing = mode === 'level'
              ? dist > radius && dist <= radius * 1.8
              : dist <= radius;
            if (inRing) {
              sum += data.terrain.heights[row * SIDE + col];
              count++;
            }
          }
        }
      }
      if (count === 0) return;
      centreY = sum / count;
    }
  }
  const dirty = new Set<string>();
  for (const [key, data] of tiles) {
    if (!data.terrain) continue;
    const ox = data.tile[0] * TILE;
    const oz = data.tile[1] * TILE;
    let changed = false;
    for (let row = 0; row < SIDE; row++) {
      for (let col = 0; col < SIDE; col++) {
        const dist = Math.hypot(ox + col - point.x, oz + row - point.z);
        if (dist > radius) continue;
        const falloff = 1 - dist / radius;
        const i = row * SIDE + col;
        const before = data.terrain.heights[i];
        const after = mode === 'raise' ? before + amount * falloff
          : mode === 'lower' ? before - amount * falloff
          : before + (centreY - before) * Math.min(1, amount * falloff * 2);
        if (after !== before) {
          data.terrain.heights[i] = after;
          recordEdit(key, i, after);
          changed = true;
        }
      }
    }
    if (changed) dirty.add(key);
  }
  for (const key of dirty) refreshMesh(key);
}

function paintTexture(point: THREE.Vector3): void {
  const ref = (el('texture') as HTMLSelectElement).value;
  if (!ref) {
    say('No texture chosen — load tiles first.');
    return;
  }
  const radius = brushRadius();
  for (const [key, data] of tiles) {
    if (!data.terrain) continue;
    const per = TILE / CHUNKS;
    let changed = false;
    for (let chunk = 0; chunk < CHUNKS * CHUNKS; chunk++) {
      const cx = (chunk % CHUNKS) * per + per / 2 + data.tile[0] * TILE;
      const cz = Math.floor(chunk / CHUNKS) * per + per / 2 + data.tile[1] * TILE;
      if (Math.hypot(cx - point.x, cz - point.z) > radius + per) continue;
      const triple: [string | null, string | null, string | null] = [ref, null, null];
      data.terrain.chunkTextures[chunk] = [...triple];
      recordChunkEdit(key, chunk, triple);
      changed = true;
    }
    if (changed) refreshChunkOverlay(key);
  }
}

/** Category from the model's own folders: model/npc/… reads as npc. */
function categoryOf(model: string): string {
  const parts = model.toLowerCase().split('/');
  if (parts[0] === 'model' && parts.length > 2) return parts[1];
  return parts.length > 1 ? parts[0] : 'other';
}

function refreshModels(): void {
  const models = new Map<string, string>();
  for (const data of tiles.values()) {
    for (const p of data.placements) {
      if (p.kind === 'effect' || models.has(p.model)) continue;
      models.set(p.model, categoryOf(p.model));
    }
  }
  const categories = [...new Set(models.values())].sort();
  const category = el('category') as HTMLSelectElement;
  const keep = category.value;
  category.innerHTML = '<option value="">all categories</option>';
  for (const c of categories) {
    const option = document.createElement('option');
    option.value = c;
    option.textContent = `${c}`;
    category.appendChild(option);
  }
  if (categories.includes(keep)) category.value = keep;
  filterModels();
  const kinds = new Set<string>();
  for (const data of tiles.values()) for (const p of data.placements) kinds.add(p.kind);
  say(`Loaded ${tiles.size} tile(s): ${models.size} placeable model(s). Kinds here: ${[...kinds].join(', ')}.`);
}

function filterModels(): void {
  const query = (el('modelSearch') as HTMLInputElement).value.toLowerCase();
  const category = (el('category') as HTMLSelectElement).value;
  const select = el('model') as HTMLSelectElement;
  const previous = select.value;
  select.innerHTML = '';
  let count = 0;
  const seen = new Set<string>();
  for (const data of tiles.values()) {
    for (const p of data.placements) {
      if (p.kind === 'effect' || seen.has(p.model)) continue;
      seen.add(p.model);
      if (category && categoryOf(p.model) !== category) continue;
      if (query && !p.model.toLowerCase().includes(query)) continue;
      const option = document.createElement('option');
      option.value = p.model;
      option.textContent = `[${categoryOf(p.model)}] ${p.model}`;
      select.appendChild(option);
      count++;
    }
  }
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
  el('modelCount').textContent = `${count} model(s)`;
}

function refreshTextures(): void {
  const select = el('texture') as HTMLSelectElement;
  const previous = select.value;
  select.innerHTML = '';
  const seen = new Set<string>();
  for (const data of tiles.values()) {
    if (!data.terrain) continue;
    for (const triple of data.terrain.chunkTextures) {
      for (const ref of triple) {
        if (!ref || seen.has(ref)) continue;
        seen.add(ref);
        const option = document.createElement('option');
        option.value = ref;
        option.textContent = ref.split('/').pop() ?? ref;
        select.appendChild(option);
      }
    }
  }
  if ([...select.options].some(o => o.value === previous)) select.value = previous;
}

function proxyMesh(placement: Placement, material: THREE.Material): THREE.Object3D {
  const [sx, sy, sz] = placement.scale;
  const height = Math.max(1, 2 * sy);
  const marker = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1, 2 * sx), height, Math.max(1, 2 * sz)), material);
  marker.position.set(placement.position[0], placement.position[1] + height / 2, placement.position[2]);
  marker.rotation.y = quatToYaw(placement.rotation);
  return marker;
}

function addExistingProxies(data: TileData): void {
  const key = patchTileKey(data.tile[0], data.tile[1]);
  data.placements.forEach(placement => {
    const marker = proxyMesh(placement, kindMaterials.get(placement.kind) ?? dropMaterial);
    const ref: ProxyRef = { kind: 'existing', tileKey: key, placement, dropIndex: -1 };
    marker.userData.proxy = ref;
    proxyGroup.add(marker);
    proxies.push(marker);
  });
}

function clearProxies(): void {
  for (const marker of proxies) proxyGroup.remove(marker);
  proxies.length = 0;
  selected = null;
  refreshSelection();
}

function dropMarker(drop: Drop): THREE.Object3D {
  const marker = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2), dropMaterial);
  marker.position.set(drop.position[0], drop.position[1] + 1.5, drop.position[2]);
  marker.rotation.y = drop.yaw;
  return marker;
}

function dropAt(point: THREE.Vector3): void {
  const custom = (el('customModel') as HTMLInputElement).value.trim();
  const model = custom || (el('model') as HTMLSelectElement).value;
  if (!model) {
    say('No model chosen — load tiles first, or type a model path.');
    return;
  }
  const y = groundAtPoint(point) ?? point.y;
  const yaw = Number((el('yaw') as HTMLInputElement).value) * (Math.PI / 180);
  const drop: Drop = { model, position: [point.x, y, point.z], yaw, marker: new THREE.Object3D() };
  drop.marker = dropMarker(drop);
  const ref: ProxyRef = { kind: 'drop', tileKey: '', placement: null, dropIndex: drops.length };
  drop.marker.userData.proxy = ref;
  proxyGroup.add(drop.marker);
  proxies.push(drop.marker);
  drops.push(drop);
  refreshDrops();
  selectMarker(drop.marker);
}

function groundAtPoint(point: THREE.Vector3): number | null {
  const tx = Math.floor(point.x / TILE);
  const tz = Math.floor(point.z / TILE);
  const data = tiles.get(patchTileKey(tx, tz));
  return data ? groundHeight(data, point.x, point.z) : null;
}

function refreshDrops(): void {
  const list = el('drops');
  list.innerHTML = '';
  drops.forEach((drop, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = `${drop.model.split('/').pop()} @ ${drop.position.map(v => v.toFixed(1)).join(', ')}`;
    const remove = document.createElement('button');
    remove.textContent = '✕';
    remove.className = 'danger';
    remove.addEventListener('click', () => {
      proxyGroup.remove(drop.marker);
      proxies.splice(proxies.indexOf(drop.marker), 1);
      if (selected === drop.marker) selectMarker(null);
      drops.splice(index, 1);
      proxies.forEach(m => {
        const ref = m.userData.proxy as ProxyRef;
        if (ref.kind === 'drop' && ref.dropIndex > index) ref.dropIndex--;
      });
      refreshDrops();
    });
    item.append(label, remove);
    list.appendChild(item);
  });
  el('dropCount').textContent = `${drops.length} new / moved`;
}

function selectMarker(marker: THREE.Object3D | null): void {
  if (selected) {
    const ref = selected.userData.proxy as ProxyRef;
    selected.traverse(o => {
      if (o instanceof THREE.Mesh) {
        o.material = ref.kind === 'drop' ? dropMaterial
          : (kindMaterials.get((ref.placement as Placement).kind) ?? dropMaterial);
      }
    });
  }
  selected = marker;
  if (selected) {
    selected.traverse(o => {
      if (o instanceof THREE.Mesh) o.material = selectedMaterial;
    });
  }
  refreshSelection();
}

function refreshSelection(): void {
  const info = el('selection');
  if (!selected) {
    info.textContent = 'Nothing selected. Use the select tool and click a box.';
    return;
  }
  const ref = selected.userData.proxy as ProxyRef;
  if (ref.kind === 'drop') {
    const drop = drops[ref.dropIndex];
    info.textContent = `New: ${drop.model}\n@ ${drop.position.map(v => v.toFixed(1)).join(', ')}\n` +
      `yaw ${(drop.yaw * 180 / Math.PI).toFixed(0)}°`;
    (el('yaw') as HTMLInputElement).value = String(Math.round(drop.yaw * 180 / Math.PI));
  } else {
    const p = ref.placement as Placement;
    const npc = p.kind === 'creature' ? ' (NPC)' : '';
    info.textContent = `${p.kind}${npc}: ${p.model}\n@ ${p.position.map(v => v.toFixed(1)).join(', ')}\n` +
      `yaw ${(quatToYaw(p.rotation) * 180 / Math.PI).toFixed(0)}° entry ${p.entry}`;
    (el('yaw') as HTMLInputElement).value = String(Math.round(quatToYaw(p.rotation) * 180 / Math.PI));
  }
}

/** Turn shipped scenery into a removal plus a free drop, so the patch owns the move. */
function detachExisting(ref: ProxyRef): Drop | null {
  if (ref.kind !== 'existing' || !ref.placement) return drops[ref.dropIndex] ?? null;
  const data = tiles.get(ref.tileKey);
  if (!data) return null;
  const at = data.placements.indexOf(ref.placement);
  if (at < 0) return null;
  const [original] = data.placements.splice(at, 1);
  removals.push({
    tile: [data.tile[0], data.tile[1]],
    model: original.model,
    position: [...original.position],
  });
  const drop: Drop = {
    model: original.model,
    position: [...original.position],
    yaw: quatToYaw(original.rotation),
    marker: selected as THREE.Object3D,
  };
  ref.kind = 'drop';
  ref.dropIndex = drops.length;
  ref.placement = null;
  (selected as THREE.Object3D).traverse(o => {
    if (o instanceof THREE.Mesh) o.material = selectedMaterial;
  });
  drops.push(drop);
  refreshDrops();
  return drop;
}

function selectedDrop(): Drop | null {
  if (!selected) return null;
  const ref = selected.userData.proxy as ProxyRef;
  if (ref.kind === 'drop') return drops[ref.dropIndex] ?? null;
  return detachExisting(ref);
}

function deleteSelected(): void {
  if (!selected) return;
  const ref = selected.userData.proxy as ProxyRef;
  if (ref.kind === 'drop') {
    proxyGroup.remove(selected);
    proxies.splice(proxies.indexOf(selected), 1);
    drops.splice(ref.dropIndex, 1);
    proxies.forEach(m => {
      const other = m.userData.proxy as ProxyRef;
      if (other.kind === 'drop' && other.dropIndex > ref.dropIndex) other.dropIndex--;
    });
  } else if (ref.placement) {
    const data = tiles.get(ref.tileKey);
    if (data) {
      const at = data.placements.indexOf(ref.placement);
      if (at >= 0) {
        const [original] = data.placements.splice(at, 1);
        removals.push({ tile: [data.tile[0], data.tile[1]], model: original.model, position: [...original.position] });
      }
    }
    proxyGroup.remove(selected);
    proxies.splice(proxies.indexOf(selected), 1);
  }
  selectMarker(null);
  refreshDrops();
}

function currentPatch(): TerrainPatch {
  const tilesOut: TerrainPatch['tiles'] = {};
  for (const [key, samples] of edits) {
    const heights: Record<string, number> = {};
    for (const [index, height] of samples) heights[String(index)] = height;
    tilesOut[key] = { ...(tilesOut[key] ?? {}), heights };
  }
  for (const [key, chunks] of chunkEdits) {
    const painted: Record<string, [string | null, string | null, string | null]> = {};
    for (const [index, triple] of chunks) painted[String(index)] = triple;
    tilesOut[key] = { ...(tilesOut[key] ?? {}), chunks: painted };
  }
  const placements: TerrainPatchPlacement[] = drops.map(d => ({
    tile: [Math.floor(d.position[0] / TILE), Math.floor(d.position[2] / TILE)],
    model: d.model,
    position: d.position,
    rotation: yawToQuat(d.yaw),
  }));
  return {
    version: TERRAIN_PATCH_VERSION,
    name: (el('patchName') as HTMLInputElement).value.trim() || 'terrain-demo',
    mapId: Number((el('mapId') as HTMLInputElement).value),
    tiles: tilesOut,
    placements,
    removed: removals.map(r => ({ ...r, position: [...r.position] as [number, number, number] })),
  };
}

/** A loaded patch joins the live edit state, and filters tiles as they arrive. */
function applyPatchToEditor(patch: TerrainPatch): void {
  const mapId = Number((el('mapId') as HTMLInputElement).value);
  if (patch.mapId !== mapId) {
    say(`Patch is for map ${patch.mapId}; the editor is on map ${mapId}.`);
    return;
  }
  for (const r of patch.removed ?? []) removals.push(r);
  for (const [key, tile] of Object.entries(patch.tiles)) {
    const data = tiles.get(key);
    if (!data?.terrain) continue;
    for (const [index, height] of Object.entries(tile.heights ?? {})) {
      const i = Number(index);
      if (Number.isInteger(i) && i >= 0 && i < data.terrain.heights.length) {
        data.terrain.heights[i] = height;
        recordEdit(key, i, height);
      }
    }
    for (const [index, triple] of Object.entries(tile.chunks ?? {})) {
      const i = Number(index);
      if (Number.isInteger(i) && i >= 0 && i < data.terrain.chunkTextures.length) {
        data.terrain.chunkTextures[i] = [...triple];
        recordChunkEdit(key, i, triple);
      }
    }
    refreshMesh(key);
    refreshChunkOverlay(key);
  }
  // Removals filter first so a re-added placement below never resurrects one.
  for (const data of tiles.values()) {
    const before = data.placements.length;
    data.placements = data.placements.filter(p =>
      !(patch.removed ?? []).some(r =>
        r.tile[0] === data.tile[0] && r.tile[1] === data.tile[1] && r.model === p.model &&
        Math.abs(r.position[0] - p.position[0]) < 0.5 &&
        Math.abs(r.position[1] - p.position[1]) < 0.5 &&
        Math.abs(r.position[2] - p.position[2]) < 0.5));
    if (data.placements.length !== before) {
      for (let i = proxies.length - 1; i >= 0; i--) {
        if ((proxies[i].userData.proxy as ProxyRef).kind === 'existing') {
          proxyGroup.remove(proxies[i]);
          proxies.splice(i, 1);
        }
      }
      if (selected && (selected.userData.proxy as ProxyRef).kind === 'existing') selectMarker(null);
      for (const other of tiles.values()) addExistingProxies(other);
    }
  }
  for (const p of patch.placements) {
    const drop: Drop = { model: p.model, position: [...p.position], yaw: quatToYaw(p.rotation ?? [0, 0, 0, 1]), marker: new THREE.Object3D() };
    drop.marker = dropMarker(drop);
    const ref: ProxyRef = { kind: 'drop', tileKey: '', placement: null, dropIndex: drops.length };
    drop.marker.userData.proxy = ref;
    proxyGroup.add(drop.marker);
    proxies.push(drop.marker);
    drops.push(drop);
  }
  (el('patchName') as HTMLInputElement).value = patch.name;
  refreshDrops();
  say(`Patch "${patch.name}" applied in the editor.`);
}

async function loadTiles(): Promise<void> {
  const mapId = Number((el('mapId') as HTMLInputElement).value);
  const radius = Math.max(1, Number((el('window') as HTMLInputElement).value));
  const cx = Number((el('cx') as HTMLInputElement).value);
  const cz = Number((el('cz') as HTMLInputElement).value);
  const ctx = Math.floor(cx / TILE);
  const ctz = Math.floor(cz / TILE);
  const half = Math.floor(radius / 2);
  say('Loading tiles…');
  const jobs: Array<Promise<void>> = [];
  for (let dx = -half; dx <= radius - half - 1; dx++) {
    for (let dz = -half; dz <= radius - half - 1; dz++) {
      const tx = ctx + dx;
      const tz = ctz + dz;
      const key = patchTileKey(tx, tz);
      if (tiles.has(key)) continue;
      jobs.push(
        provider.load(tileId(mapId, tx, tz)).then(
          data => {
            const stored = currentPatch();
            stored.mapId = mapId;
            applyTerrainPatchToTile(data, stored);
            tiles.set(key, data);
            const mesh = buildMesh(data);
            tileMeshes.set(key, mesh);
            scene.add(mesh);
            const overlay = buildChunkOverlay(data);
            chunkOverlays.set(key, overlay);
            scene.add(overlay);
            addExistingProxies(data);
          },
          (err: Error) => {
            say(`Tile ${key}: ${err.message}`);
          },
        ),
      );
    }
  }
  await Promise.all(jobs);
  refreshModels();
  refreshTextures();
  controls.target.set(cx, 14, cz);
}

async function loadZoneIndex(): Promise<void> {
  try {
    zones = (await provider.load(zoneIndexId())).zones;
    say(`Mounted: ${zones.length} zones known. Search one, or Load tiles directly.`);
  } catch (err) {
    say(`Zone index unavailable: ${(err as Error).message}. Map ids still work.`);
  }
}

function filterZones(): void {
  const query = (el('zoneSearch') as HTMLInputElement).value.toLowerCase();
  const select = el('zone') as HTMLSelectElement;
  select.innerHTML = '';
  const hits = zones.filter(z => !query || z.name.toLowerCase().includes(query)).slice(0, 200);
  for (const z of hits) {
    const option = document.createElement('option');
    option.value = String(z.id);
    option.textContent = `${z.name} — ${z.mapName} (map ${z.mapId})`;
    select.appendChild(option);
  }
  el('zoneCount').textContent = `${hits.length} zone(s)`;
}

function goToZone(): void {
  const select = el('zone') as HTMLSelectElement;
  const zone = zones.find(z => String(z.id) === select.value);
  if (!zone) {
    say('Pick a zone first.');
    return;
  }
  (el('mapId') as HTMLInputElement).value = String(zone.mapId);
  (el('cx') as HTMLInputElement).value = String(zone.centre[0].toFixed(1));
  (el('cz') as HTMLInputElement).value = String(zone.centre[1].toFixed(1));
  say(`Loading ${zone.name} on map ${zone.mapId}…`);
  void loadTiles();
}

function pickGround(e: PointerEvent): THREE.Vector3 | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  const hits = ray.intersectObjects([...tileMeshes.values()], false);
  return hits.length > 0 ? hits[0].point : null;
}

function pickProxy(e: PointerEvent): THREE.Object3D | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(pointer, camera);
  const hits = ray.intersectObjects(proxies, false);
  return hits.length > 0 ? hits[0].object : null;
}

function updateBrushRing(e: PointerEvent): void {
  const active = tool();
  if (active === 'select') {
    brushRing.visible = false;
    return;
  }
  const hit = pickGround(e);
  if (!hit) {
    brushRing.visible = false;
    return;
  }
  brushRing.visible = true;
  brushRing.position.copy(hit).add(new THREE.Vector3(0, 0.3, 0));
  const radius = brushRadius();
  brushRing.scale.set(radius, radius, 1);
}

function paintPointer(e: PointerEvent): void {
  const hit = pickGround(e);
  if (!hit) return;
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastPaint) / 1000);
  lastPaint = now;
  const active = tool();
  if (active === 'texture') {
    paintTexture(hit);
    return;
  }
  if (active === 'select') return;
  const strength = Number((el('strength') as HTMLInputElement).value);
  paintHeights(hit, active, strength * dt * 4);
}

renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', e => {
  if (e.button === 2) return;
  downAt = [e.clientX, e.clientY];
  if (tool() === 'select') {
    const hit = pickProxy(e);
    if (hit) {
      selectMarker(hit);
      dragging = true;
    } else {
      const ground = pickGround(e);
      if (ground) {
        // A drag on empty ground orbits; a click clears the selection.
      }
    }
    return;
  }
  painting = true;
  lastPaint = performance.now();
  paintPointer(e);
});

addEventListener('pointerup', (e: PointerEvent) => {
  if (dragging && tool() === 'select') {
    dragging = false;
    refreshSelection();
    void e;
    return;
  }
  if (downAt && tool() === 'select' && e.target === renderer.domElement) {
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
    if (moved < 4 && !pickProxy(e as PointerEvent)) selectMarker(null);
  }
  downAt = null;
  painting = false;
});

renderer.domElement.addEventListener('pointermove', e => {
  updateBrushRing(e);
  if (dragging && selected && tool() === 'select') {
    const hit = pickGround(e);
    if (hit) {
      const drop = selectedDrop();
      if (drop) {
        drop.position = [hit.x, groundAtPoint(hit) ?? hit.y, hit.z];
        selected.position.set(drop.position[0], drop.position[1] + 1.5, drop.position[2]);
      }
    }
    return;
  }
  if (painting) paintPointer(e);
});

// Dropping happens on click while the drop button is armed.
el('dropMode').addEventListener('click', () => {
  const button = el('dropMode') as HTMLButtonElement;
  const armed = button.dataset.armed === '1';
  button.dataset.armed = armed ? '0' : '1';
  button.textContent = armed ? 'Drop: off' : 'Drop: on (click ground)';
  renderer.domElement.style.cursor = armed ? '' : 'crosshair';
});

renderer.domElement.addEventListener('click', e => {
  if ((el('dropMode') as HTMLButtonElement).dataset.armed !== '1' || e.button === 2) return;
  const hit = pickGround(e);
  if (hit) dropAt(hit);
});

const keys = new Set<string>();

addEventListener('keydown', (e: KeyboardEvent) => {
  if (isTyping()) return;
  if (e.code === 'Delete' || e.code === 'Backspace') {
    if (selected && tool() === 'select') {
      deleteSelected();
      e.preventDefault();
    }
    return;
  }
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    rotateSelected(e.code === 'BracketRight' ? 15 : -15);
    return;
  }
  keys.add(e.code);
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(e.code)) e.preventDefault();
});

addEventListener('keyup', (e: KeyboardEvent) => {
  keys.delete(e.code);
});

function moveCamera(dt: number): void {
  if (keys.size === 0 || isTyping()) return;
  const speed = (keys.has('ShiftLeft') || keys.has('ShiftRight') ? 60 : 20) * dt;
  const forward = new THREE.Vector3().subVectors(controls.target, camera.position);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3(-forward.z, 0, forward.x);
  const delta = new THREE.Vector3();
  if (keys.has('KeyW')) delta.add(forward);
  if (keys.has('KeyS')) delta.sub(forward);
  if (keys.has('KeyA')) delta.sub(right);
  if (keys.has('KeyD')) delta.add(right);
  if (keys.has('KeyE')) delta.y += 1;
  if (keys.has('KeyQ')) delta.y -= 1;
  if (delta.lengthSq() === 0) return;
  delta.normalize().multiplyScalar(speed);
  camera.position.add(delta);
  controls.target.add(delta);
}

function rotateSelected(degrees: number): void {
  const drop = selectedDrop();
  if (!drop || !selected) return;
  drop.yaw += (degrees * Math.PI) / 180;
  selected.rotation.y = drop.yaw;
  if (tool() === 'select') refreshSelection();
  else (el('yaw') as HTMLInputElement).value = String(Math.round((drop.yaw * 180) / Math.PI));
}

el('rotLeft').addEventListener('click', () => rotateSelected(-15));
el('rotRight').addEventListener('click', () => rotateSelected(15));
el('deleteSel').addEventListener('click', () => deleteSelected());
el('groundSel').addEventListener('click', () => {
  const drop = selectedDrop();
  if (!drop || !selected) return;
  const point = new THREE.Vector3(drop.position[0], drop.position[1], drop.position[2]);
  drop.position = [point.x, groundAtPoint(point) ?? point.y, point.z];
  selected.position.set(drop.position[0], drop.position[1] + 1.5, drop.position[2]);
  refreshSelection();
});

el('yaw').addEventListener('input', () => {
  const drop = selected ? selectedDrop() : null;
  if (!drop || !selected) return;
  drop.yaw = (Number((el('yaw') as HTMLInputElement).value) * Math.PI) / 180;
  selected.rotation.y = drop.yaw;
  refreshSelection();
});

el('pick').addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.ipa,.bin';
  input.multiple = true;
  input.addEventListener('change', async () => {
    const files = [...(input.files ?? [])];
    if (files.length === 0) return;
    say('Mounting…');
    try {
      await provider.init();
      await provider.useSource((await provider.offer(files)).id);
      await loadZoneIndex();
      filterZones();
    } catch (err) {
      say(`Mount failed: ${(err as Error).message}`);
    }
  });
  input.click();
});

el('load').addEventListener('click', () => {
  void loadTiles();
});

el('zoneSearch').addEventListener('input', () => filterZones());
el('goZone').addEventListener('click', () => goToZone());
el('modelSearch').addEventListener('input', () => filterModels());
el('category').addEventListener('change', () => filterModels());
el('showChunks').addEventListener('change', () => {
  const show = (el('showChunks') as HTMLInputElement).checked;
  for (const overlay of chunkOverlays.values()) overlay.visible = show;
});

el('save').addEventListener('click', () => {
  const patch = currentPatch();
  try {
    localStorage.setItem(TERRAIN_PATCH_KEY, JSON.stringify(patch));
    localStorage.setItem(TERRAIN_PATCH_ENABLED_KEY, (el('enabled') as HTMLInputElement).checked ? '1' : '0');
  } catch (err) {
    say(`Save failed: ${(err as Error).message}`);
    return;
  }
  const sampleCount = Object.values(patch.tiles).reduce(
    (n, t) => n + Object.keys(t.heights ?? {}).length + Object.keys(t.chunks ?? {}).length, 0);
  say(`Saved "${patch.name}": ${sampleCount} edited samples/chunks, ${patch.placements.length} object(s), ` +
    `${patch.removed?.length ?? 0} removal(s). Re-enter the zone in the game to walk it.`);
});

el('download').addEventListener('click', () => {
  const patch = currentPatch();
  const blob = new Blob([JSON.stringify(patch, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${patch.name}.terrain-patch.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

el('loadPatch').addEventListener('click', () => {
  el('filePatch').click();
});

el('filePatch').addEventListener('change', async () => {
  const input = el('filePatch') as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const patch = JSON.parse(await file.text()) as TerrainPatch;
    applyPatchToEditor(patch);
  } catch (err) {
    say(`Could not read patch: ${(err as Error).message}`);
  }
  input.value = '';
});

el('clear').addEventListener('click', () => {
  edits.clear();
  chunkEdits.clear();
  removals.length = 0;
  for (const drop of drops) {
    proxyGroup.remove(drop.marker);
    proxies.splice(proxies.indexOf(drop.marker), 1);
  }
  drops.length = 0;
  selectMarker(null);
  refreshDrops();
  tiles.clear();
  for (const mesh of tileMeshes.values()) scene.remove(mesh);
  tileMeshes.clear();
  for (const overlay of chunkOverlays.values()) scene.remove(overlay);
  chunkOverlays.clear();
  clearProxies();
  void loadTiles().then(() => say('Edits discarded; tiles reloaded from the .ipa.'));
  try {
    localStorage.removeItem(TERRAIN_PATCH_KEY);
  } catch {
    return;
  }
});

el('enabled').addEventListener('change', () => {
  try {
    localStorage.setItem(TERRAIN_PATCH_ENABLED_KEY, (el('enabled') as HTMLInputElement).checked ? '1' : '0');
  } catch {
    return;
  }
});

try {
  (el('enabled') as HTMLInputElement).checked = localStorage.getItem(TERRAIN_PATCH_ENABLED_KEY) !== '0';
} catch {
  /* a fresh profile keeps the default */
}

const clock = new THREE.Clock();

function frame(): void {
  requestAnimationFrame(frame);
  moveCamera(Math.min(0.1, clock.getDelta()));
  controls.update();
  renderer.render(scene, camera);
}

resize();
frame();
