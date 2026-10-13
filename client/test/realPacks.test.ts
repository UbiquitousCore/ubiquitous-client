/**
 * The readers against real packs: the only proof of what the formats are.
 * Skips without game data. Set `UBIQUITOUS_PACK=/path/to/res.bin` (siblings found
 * beside it), `UBIQUITOUS_IPA=/path/to/game.ipa`, or leave a res.bin under .cache/
 * or work/cache/. Assertions quote only counts, dimensions and format names.
 */

import { existsSync, openAsBlob, readdirSync, statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

import { type ByteSource, bytesSource } from '../src/assets/vfs/ByteSource';
import { PackReader } from '../src/assets/vfs/zip';
import { planFor } from '../src/gameplay/spellShow';
import { parseSwf } from '../src/assets/formats/swf';
import { readTypefaceFamily } from '../src/assets/formats/typeface';
import { facesByUse, pickUiFaces } from '../src/assets/providers/uiFaces';
import type { EffectEmitter, UiSkinData } from '../src/assets/types';
import { FTable } from '../src/assets/formats/ftable';
import { WorldTables } from '../src/assets/formats/tables';
import { readGossip } from '../src/ui/npcGossip';
import type { GossipContext } from '../src/ui/npcGossip';
import { PHY_PACKS } from '../src/assets/providers/localModel';
import { PackAssetProvider, parseAreaLinks } from '../src/assets/providers/PackAssetProvider';
import { interiorOf, withoutSharedFaces } from '../src/assets/providers/interiorCompanion';
import { busFaresFrom } from '../src/gameplay/busRoutes';
import { dedupeRanks } from '../src/gameplay/SpellBook';
import { cueClips, cueFor } from '../src/gameplay/ClipMachine';
import type { Movement, Posture } from '../src/gameplay/ClipMachine';
import { combatClipName, familyOf, UNARMED } from '../src/gameplay/weaponClips';
import { heldKind } from '../src/assets/heldKinds';
import { useOf } from '../src/ui/items';
import { ACTION_CLIPS, GATHER_HELD_ITEMS } from '../src/gameplay/actionClips';
import { FIDGET_CLIPS } from '../src/gameplay/idleFidgets';
import { QUEST_GESTURES } from '../src/gameplay/questGestures';
import { LOOT_GLOW_EFFECT } from '../src/gameplay/loot';
import {
  ATTACK_CLIPS,
  REACTION_CLIPS,
  SPARK_FILES,
  SWING_LANDS_AFTER_MS,
} from '../src/gameplay/combatResults';
import { drawnRect } from '../src/world/mapArt';
import { decodeTexture } from '../src/assets/formats/texture';
import { THUMB_SIZE } from '../src/world/minimap';
import { isPvr, parseHeader } from '../src/assets/formats/pvrtc';
import { Bdae } from '../src/assets/formats/bdae';
import { parsePhy } from '../src/assets/formats/phy';
import { type BeffEmitter, readBeff } from '../src/assets/formats/beff';
import { layerName, parseItm, parseTrn, tileName } from '../src/assets/formats/terrain';
import { unwrapBdae } from '../src/assets/vfs/zip';
import * as THREE from 'three';
import { buildEffect } from '../src/assets/providers/localEffect';
import { EffectInstance, particlesFollow } from '../src/renderer/EffectFactory';
import { buildModel } from '../src/renderer/ModelFactory';
import { MaterialCache } from '../src/renderer/MaterialCache';
import { buildSkinnedModel, toThreeClip } from '../src/renderer/SkinnedModelFactory';
import { isSkinned } from '../src/renderer/modelSources';
import { toAnimationData, toModelData, toSkeletonData } from '../src/assets/providers/localModel';
import { toNodeAnimation } from '../src/assets/providers/skeletonWire';
import { toSurface } from '../src/assets/providers/surface';
import { UI_SPRITES, UI_SPRITE_NAMES, locateSprite } from '../src/ui/art/uiSprites';
import {
  bareScalpStyles,
  footprints,
  regionRect,
  sheetMeshes,
} from '../src/assets/formats/avatarSheet';
import {
  attachmentsFor,
  bodyLayers,
  heldItemsOf,
  lookFrom,
  lookFromRow,
  shippedHairColours,
  visibleMeshes,
} from '../src/assets/formats/avatar';
import { WATER_PROGRAMS, createWaterMaterial } from '../src/renderer/waterShader';
import { WATERFALL_PROGRAM, createWaterfallMaterial } from '../src/renderer/waterfallShader';
import {
  TERRAIN_PROGRAM,
  createTerrainMaterial,
  shareTerrainAttributes,
} from '../src/renderer/terrainShader';
import { buildWaterTile } from '../src/renderer/WaterFactory';
import { buildTerrainTile } from '../src/renderer/TerrainFactory';
import { type TerrainMaterial, weighMaskReads } from '../src/renderer/terrainShader';
import { Library } from '../src/assets/vfs/Library';
import { decodeWav } from '../src/assets/formats/wav';
import { cueFiles, indexCatalogue } from '../src/audio/cues';
import { zoneSoundAt } from '../src/audio/zoneSound';
import { zoneInfoOf } from '../src/assets/providers/localZone';
import { equipSound, handleSound } from '../src/gameplay/itemSounds';
import { MoveSounds } from '../src/gameplay/moveSounds';
import { impactSound, parrySound, swingSound } from '../src/gameplay/weaponSounds';
import { MapSpawns, buildTile } from '../src/assets/providers/localTile';
import { mapPackName } from '../src/assets/providers/localZone';
import { World } from '../src/world/World';

/** World packs a map's tiles may live in, looked for beside `res.bin`. */
const WORLD_PACKS = ['city.bin', 'land1.bin', 'middle_land.bin'];

/** `a * b` on the reader's 3x4 row-major matrices. */
function mul3x4(a: number[], b: number[]): number[] {
  const out = new Array<number>(12).fill(0);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      out[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
    out[9 + i] = a[i * 3] * b[9] + a[i * 3 + 1] * b[10] + a[i * 3 + 2] * b[11] + a[9 + i];
  }
  return out;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 'world/sandbox/items/-025_-016.itm' -> [-25, -16], for the `tileName` round trip. */
function tileFromName(name: string): [number, number] | null {
  const stem = name.split('/').pop()?.split('.')[0] ?? '';
  const parts = stem.split('_');
  if (parts.length !== 2) return null;
  const x = Number(parts[0]);
  const z = Number(parts[1]);
  return Number.isInteger(x) && Number.isInteger(z) ? [x, z] : null;
}

function findPack(name: string): string | null {
  // $UBIQUITOUS_PACK names one pack; its siblings live beside it, so a single
  // variable is enough to point the whole suite at an extracted build.
  const explicit = (process.env.UBIQUITOUS_PACK ?? '').trim();
  if (explicit && existsSync(explicit)) {
    const sibling = join(dirname(resolve(explicit)), name);
    if (existsSync(sibling)) return sibling;
  }

  const found: string[] = [];
  for (const base of [join(ROOT, '.cache'), join(ROOT, 'work', 'cache')]) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const p = join(base, dir, name);
      if (existsSync(p)) found.push(p);
    }
  }
  if (!found.length) return null;
  // Biggest = newest build = most to check against.
  found.sort((a, b) => statSync(b).size - statSync(a).size || a.localeCompare(b));
  return found[0];
}

/** Every copy of a pack on disk, one per extracted build. */
function allPacks(name: string): string[] {
  const found = new Set<string>();
  const explicit = findPack(name);
  if (explicit) found.add(explicit);
  for (const base of [join(ROOT, '.cache'), join(ROOT, 'work', 'cache')]) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base)) {
      const p = join(base, dir, name);
      if (existsSync(p)) found.add(p);
    }
  }
  return [...found];
}

/**
 * A count pinned per build, told apart by how many entries its res.bin
 * holds. A build not listed is not pinned, and the check is skipped.
 */
const RES_ENTRIES_BY_BUILD = { '2.2.0': 24126, '1.1.4': 16170 } as const;
type SupportedBuild = keyof typeof RES_ENTRIES_BY_BUILD;

function buildFor(entries: number): SupportedBuild | null {
  return (
    (Object.keys(RES_ENTRIES_BY_BUILD) as SupportedBuild[]).find(
      b => RES_ENTRIES_BY_BUILD[b] === entries,
    ) ?? null
  );
}

function pinnedFor<T>(entries: number, byBuild: Partial<Record<SupportedBuild, T>>): T | undefined {
  const build = buildFor(entries);
  return build ? byBuild[build] : undefined;
}

function unsupportedBuild(path: string, entries: number): string {
  return `${path} (${entries} entries, unsupported build)`;
}

const RES = findPack('res.bin');
const TABLES = findPack('tables.bin');
const PHY = findPack('model_phy.bin');
const SOUND = findPack('sound.bin');

/**
 * Meshes in the shipped collision data with no vertices or no faces, in 2.2.0.
 * They are dropped silently; the count is pinned so a reader regression that
 * started emptying meshes would fail here rather than quietly removing floors.
 */
const EMPTY_MESHES = 6;

const IPA = (() => {
  const p = (process.env.UBIQUITOUS_IPA ?? '').trim();
  return p && existsSync(p) ? resolve(p) : null;
})();

const handles: { close(): Promise<void> }[] = [];

/** The Node stand-in for `File.slice()`. */
async function fileSource(path: string): Promise<ByteSource> {
  const handle = await open(path, 'r');
  handles.push(handle);
  const { size } = await handle.stat();
  return {
    size,
    async read(offset, length) {
      const buf = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buf, 0, length, offset);
      return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
    },
  };
}

afterAll(async () => {
  await Promise.all(handles.map(h => h.close()));
});

describe.skipIf(!RES)('res.bin, from the user packs', () => {
  it('reads the central directory', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    // The shipped packs are tens of thousands of entries; anything in the
    // hundreds means the directory walk stopped early.
    expect(pack.length).toBeGreaterThan(1000);
    expect(pack.entries.some(e => e.name.toLowerCase().endsWith('.tga'))).toBe(true);
    expect(pack.entries.some(e => e.name.toLowerCase().endsWith('.bdae'))).toBe(true);
  });

  it('ships loading art named the way the game builds the path', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');

    // `2d_texture/<world>_<topZoneId>[_2x].tga`, not
    // `2d_texture/maps/`, which is the area-map screen and is keyed by zone
    // id alone. Getting these two confused puts a map on the loading screen.
    const named = (n: string): boolean =>
      pack.entries.some(e => e.name.toLowerCase() === `2d_texture/${n}.tga`);
    expect(named('city_471')).toBe(true); // a town, on world/city
    expect(named('city_471_2x')).toBe(true);
    expect(named('land1_403')).toBe(true); // its region
    expect(named('land1_403_2x')).toBe(true);

    // Two rungs, and they must really differ or picking by screen buys
    // nothing. Both are PVR containers despite the .tga extension.
    const sizeOf = async (n: string): Promise<number> =>
      decodeTexture(await pack.read(`2d_texture/${n}.tga`), 4096).info.width;
    expect(await sizeOf('city_471')).toBe(512);
    expect(await sizeOf('city_471_2x')).toBe(1024);
  });

  it('does not draw a morph controller target as geometry', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');

    // maincity_flag_02 is bunting: one real mesh, plus two blend-shape poses
    // that no node places or names. Drawing those puts the raw, untransformed
    // pose in the world -- ~50x oversize and still on the exporter's Z-up
    // axis, which is a giant upside-down banner floating beside the right one.
    const entry = pack.get('model/scene/build/main_city/maincity_flag_02.bdae');
    expect(entry).toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    const meshes = new Bdae(payload).meshes(true);
    expect(meshes.map(m => m.name)).toEqual(['Plane001-mesh']);

    // Bounds prove two things at once: it is the transformed mesh rather than
    // the raw target, and it is placed by the node that instances the morph
    // controller rather than by that node's parent. The controller hangs off
    // Plane001-node_PIVOT, 3.68 along x from Plane001-node, so matching the
    // parent leaves the bunting sitting entirely to one side of its anchor
    // instead of centred on it.
    const p = meshes[0].positions!;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < p.length; i += 3) {
      minX = Math.min(minX, p[i]);
      maxX = Math.max(maxX, p[i]);
    }
    expect(maxX).toBeLessThan(20);
    // Centred: the two ends are the same distance from the anchor.
    expect(Math.abs(minX + maxX)).toBeLessThan(0.5);
  });

  it('draws the church window shafts additive, and nothing else in the church', async () => {
    // The shafts wear the same blend material as foliage and cloth, and no
    // material parameter sets them apart; only the art's naming does
    // (`isLightShaft`). Additive is what lets the vertex colour's darkening
    // read as less light rather than as a grey haze.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const path = 'model/scene/build/human/building_church_town.bdae';
    const entry = pack.get(path);
    expect(entry).toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    const model = toModelData(new Bdae(payload), path, () => true);

    const additive = new Set<string>();
    for (const m of model.meshes) {
      for (const g of m.groups) {
        if (g.blend === 'additive') additive.add(m.name);
        // `light01-mesh` also carries the church's opaque cloth, which stays opaque.
        if (g.texture?.endsWith('other_footcloth.tga')) expect(g.blend).toBe('opaque');
      }
    }
    expect([...additive].sort()).toEqual([
      'light-mesh',
      'light01-mesh',
      'light02-mesh',
      'light03-mesh',
    ]);
  });

  it('reads the baked vertex lighting every mesh carries', async () => {
    // The scenery is lit by this, not by any light: the shipped shaders are
    // `texture * vColor0`. Dropping the channel renders every building evenly
    // lit at full texture brightness, and the church's window shafts read as
    // flat grey.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get('model/scene/build/human/building_church_town.bdae');
    expect(entry).toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    const meshes = new Bdae(payload).meshes(true);

    // Every mesh in this model has one, four bytes per vertex.
    for (const m of meshes) {
      expect(m.colors, m.name).toBeTruthy();
      expect(m.colors!.length, m.name).toBe(m.vertexCount * 4);
    }

    // It is real shading, not a white channel nobody filled in. The walls
    // carry many distinct browns.
    const walls = meshes.find(m => m.name === 'Objeact006-mesh')!;
    const distinct = new Set<string>();
    for (let i = 0; i < walls.colors!.length; i += 4) {
      distinct.add(`${walls.colors![i]},${walls.colors![i + 1]},${walls.colors![i + 2]}`);
    }
    expect(distinct.size).toBeGreaterThan(50);

    // And the shafts are tinted warm where the artist wanted them warm:
    // light02 holds pure white alongside a yellow (255,255,~180).
    const shaft = meshes.find(m => m.name === 'light02-mesh')!;
    let warm = 0;
    for (let i = 0; i < shaft.colors!.length; i += 4) {
      const r = shaft.colors![i],
        g = shaft.colors![i + 1],
        b = shaft.colors![i + 2];
      if (r === 255 && g === 255 && b < 220) warm++;
    }
    expect(warm).toBeGreaterThan(0);
  });

  it('blends a ProfileCOMMON material only when it binds a transparent sampler', async () => {
    // A material whose effect is embedded in the model names no shader file,
    // so the name-driven rules in `toSurface` have nothing to read. Drawn
    // opaque, a texture with an alpha channel gets a black border -- the
    // watermill's water among them.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get('model/scene/build/human/building_WaterMill_01.bdae');
    expect(entry).toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    const doc = new Bdae(payload);

    // The water plane, on its own material. Its shader *file* is empty and its
    // effect fragment is the tell.
    const water = doc.materialsByName().get('_4_-_Default2')!;
    expect(water.file).toBe('');
    expect(water.shader.startsWith('#ProfileCOMMON')).toBe(true);
    expect(water.transparent).toBe(true);
    expect(toSurface(water)).toMatchObject({ blend: 'blend', unlit: true });

    // Its neighbours on the same model name a shader file and are unchanged.
    const wall = doc.materialsByName().get('_4_-_Default')!;
    expect(wall.file).toBe('unlit_textured_solid.bdae');
    expect(wall.transparent).toBe(false);
    expect(toSurface(wall)).toMatchObject({ blend: 'opaque', unlit: true });

    // And the flag is not a synonym for "ProfileCOMMON": most of them do not
    // carry it, and those must stay opaque. Counted over the whole pack, 600
    // materials in 291 models are ProfileCOMMON and 138 of them in 95 models
    // bind the sampler -- pinned so a reader change cannot quietly move it.
    let profileCommon = 0,
      transparent = 0;
    const pcModels = new Set<string>(),
      transModels = new Set<string>();
    for (const e of pack.entries) {
      if (!/\.bdae$/i.test(e.name)) continue;
      const doc2 = new Bdae((await unwrapBdae(await pack.read(e))).payload);
      for (const m of doc2.materials()) {
        if (m.file !== '') {
          // Nothing outside the family carries the sampler, so matching
          // ProfileCOMMON and matching the sampler pick the same materials.
          expect(m.transparent, `${e.name} ${m.name}`).toBe(false);
          continue;
        }
        expect(m.shader.startsWith('#ProfileCOMMON'), `${e.name} ${m.name}`).toBe(true);
        profileCommon++;
        pcModels.add(e.name);
        if (m.transparent) {
          transparent++;
          transModels.add(e.name);
        }
      }
    }
    const pinned = pinnedFor(pack.length, {
      '2.2.0': [600, 291, 138, 95],
      '1.1.4': [442, 248, 111, 71],
    });
    if (pinned)
      expect([profileCommon, pcModels.size, transparent, transModels.size]).toEqual(pinned);
  }, 120_000);

  it('still draws a skinned mesh that no node names', async () => {
    // The same "nothing places it" condition, and the opposite answer: this
    // model is a single mesh driven by `_mesh-skin`, so dropping it would
    // delete the creature. Only morph models may lose an unplaced mesh.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get('model/npc/creature/puppy/puppy_skeleton/puppy_skeleton.bdae');
    expect(entry).toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    expect(new Bdae(payload).meshes(true).length).toBe(1);
  });

  it('parses every .beff in every build on disk, each ending exactly on its last byte', async () => {
    // The format has no offsets and no lengths, so ending on the final byte
    // is the only evidence the field order is right; readBeff throws otherwise.
    const skipped: string[] = [];
    for (const path of allPacks('res.bin')) {
      const pack = await PackReader.open(await fileSource(path), 'res.bin');
      if (!buildFor(pack.length)) {
        skipped.push(unsupportedBuild(path, pack.length));
        continue;
      }
      const effects = pack.entries.filter(e => !e.isDir && /\.beff$/i.test(e.name));
      expect(effects.length, path).toBeGreaterThan(500);
      const versions = new Set<number>();
      let emitters = 0;
      let spareSet = 0;
      for (const entry of effects) {
        const effect = readBeff(await pack.read(entry), entry.name);
        versions.add(effect.version);
        const walk = (emitter: BeffEmitter): void => {
          emitters++;
          if (emitter.settings.spareWord !== 0) spareSet++;
          emitter.children.forEach(walk);
        };
        for (const node of effect.nodes) if (node.kind === 'emitter') walk(node.emitter);
      }
      expect(emitters).toBeGreaterThan(0);
      expect(spareSet, `${path}: emitters with the spare word set`).toBe(0);
      for (const v of versions) expect([8, 9]).toContain(v);
    }
    if (skipped.length > 0) {
      console.warn(`[realPacks] skipped unsupported res.bin builds: ${skipped.join(', ')}`);
    }
  }, 300_000);

  it('decodes a spread of real textures to their declared size', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');

    // A spread of sizes rather than the first N, which would all be one atlas.
    const candidates = pack.entries.filter(e => !e.isDir && /\.tga$/i.test(e.name));
    const sample = [
      ...candidates.slice(0, 8),
      ...candidates.slice(Math.floor(candidates.length / 2), Math.floor(candidates.length / 2) + 8),
      ...candidates.slice(-8),
    ];

    let pvr = 0;
    let tga = 0;
    for (const entry of sample) {
      const bytes = await pack.read(entry);
      const { image, info } = decodeTexture(bytes);
      expect(image.width).toBe(info.width);
      expect(image.height).toBe(info.height);
      expect(image.pixels.length).toBe(info.width * info.height * 4);
      if (isPvr(bytes)) {
        pvr++;
        // The decoded size must match what the container declared, or the
        // mip walk has gone wrong.
        const h = parseHeader(bytes);
        expect(image.width).toBe(h.width);
        expect(image.height).toBe(h.height);
      } else {
        tga++;
      }
    }
    // Both paths should be exercised: the packs carry a mix, and an extension
    // that lies is the whole reason `decodeTexture` sniffs.
    expect(pvr + tga).toBe(sample.length);
    expect(pvr).toBeGreaterThan(0);
  }, 120_000);

  it('caps a large texture when asked', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const big = pack.entries.find(e => /\.tga$/i.test(e.name) && e.size > 2_000_000);
    if (!big) return; // A build without any 2048² textures is not a failure.

    const bytes = await pack.read(big);
    const { image } = decodeTexture(bytes, 512);
    expect(Math.max(image.width, image.height)).toBeLessThanOrEqual(512);
  }, 120_000);
});

describe.skipIf(!RES)('the portrait camera, in the user packs', () => {
  const PLAYABLE = [
    'model/npc/character/human/male/human_m_h.bdae',
    'model/npc/character/human/female/human_f_h.bdae',
    'model/ep1/npc/character/mendel/male/mendel_m_h.bdae',
    'model/ep1/npc/character/mendel/female/mendel_f_h.bdae',
  ];

  it('finds a portrait node or a head node on every playable body in every build', async () => {
    // `portraitFraming.ts` stands the camera on `Dummy_icon`, and frames a
    // body with none on its `Dummy_Head`: 1.1.4's Mendel woman is the one
    // playable body with only the head node.
    for (const path of allPacks('res.bin')) {
      const pack = await PackReader.open(await fileSource(path), 'res.bin');
      const lacking: string[] = [];
      for (const model of PLAYABLE) {
        const entry = pack.get(model);
        if (!entry) continue;
        const names = new Set(
          new Bdae((await unwrapBdae(await pack.read(entry))).payload).attachPoints().keys(),
        );
        if (!names.has('Dummy_icon-node')) lacking.push(model);
        expect(names.has('Dummy_icon-node') || names.has('Dummy_Head-node')).toBe(true);
      }
      expect(lacking.filter(model => !model.includes('/mendel/female/'))).toEqual([]);
    }
  }, 120_000);
});

describe.skipIf(!RES)('swing clips, from the user packs', () => {
  it('land their blow when the defender reacts', async () => {
    // For each swing clip, the frame where the body turns fastest: the sum
    // over every rotation curve of how far it moves per frame. That is where
    // the weapon comes through, and the median over every model's swings is
    // when the defender's reaction is timed to play.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const swing = new RegExp(
      `/anim/(${[...ATTACK_CLIPS.swings, ATTACK_CLIPS.critical].join('|')})_[^/]*\\.bdae$`,
      'i',
    );
    const entries = pack.entries.filter(e => swing.test(e.name));
    expect(entries.length).toBeGreaterThan(100);
    const peaks: number[] = [];
    for (const entry of entries) {
      const { payload } = await unwrapBdae(await pack.read(entry));
      const speed = new Map<number, number>();
      let start = Infinity;
      for (const clip of new Bdae(payload).animations()) {
        for (const sampler of clip.samplers) {
          const times = sampler.input.values;
          const values = sampler.output.values;
          const k = sampler.output.components;
          if (times.length < 2 || (k !== 4 && k !== 1)) continue;
          start = Math.min(start, times[0]);
          for (let i = 1; i < times.length; i++) {
            let moved = 0;
            for (let j = 0; j < k; j++)
              moved += Math.abs(values[i * k + j] - values[(i - 1) * k + j]);
            const frame = Math.round(times[i]);
            speed.set(frame, (speed.get(frame) ?? 0) + moved / (times[i] - times[i - 1] || 1));
          }
        }
      }
      let peak = -1;
      let fastest = -1;
      for (const [frame, s] of speed) if (s > fastest) [fastest, peak] = [s, frame];
      if (peak >= 0) peaks.push(peak - start);
    }
    peaks.sort((a, b) => a - b);
    const medianMs = (peaks[Math.floor(peaks.length / 2)] / 30) * 1000;
    expect(Math.abs(medianMs - SWING_LANDS_AFTER_MS)).toBeLessThanOrEqual(1000 / 30);
  }, 300_000);
});

describe.skipIf(!PHY)('model_phy.bin, from the user packs', () => {
  it('reads every .phy, and the meshes inside them', async () => {
    // Collision splits along a line worth knowing: a building's exterior is
    // mostly *primitives* (walls stored as flat planes) and its interior --
    // floors, stairs, upper storeys -- is mostly *meshes*. So "primitives load
    // and meshes do not" would read as "no collision indoors, everywhere",
    // and would show up here as a mesh count of zero rather than as an error.
    const pack = await PackReader.open(await fileSource(PHY!), 'model_phy.bin');
    const files = pack.entries.filter(e => !e.isDir && e.name.toLowerCase().endsWith('.phy'));
    expect(files.length).toBeGreaterThan(0);

    let failed = 0;
    let withMesh = 0;
    let meshes = 0;
    let primitives = 0;
    let empty = 0;
    for (const entry of files) {
      try {
        const geoms = parsePhy(await pack.read(entry));
        const m = geoms.filter(g => g.type === 'mesh');
        primitives += geoms.length - m.length;
        if (m.length) {
          withMesh++;
          meshes += m.length;
        }
        // A mesh with no vertices or no faces is dropped silently by
        // CollisionWorld.addMesh, which is the quiet version of the same
        // failure -- counted, not thrown, so a parse error stays
        // distinguishable from an empty mesh.
        for (const g of m) {
          if (!(g.vertices?.length ?? 0) || !(g.faces?.length ?? 0)) empty++;
        }
      } catch {
        failed++;
      }
    }
    expect(failed).toBe(0);
    expect(primitives).toBeGreaterThan(0);
    // A handful of meshes really are empty in the shipped data. Pinned so the
    // number cannot grow unnoticed -- a reader regression would show up as a
    // jump here long before anyone noticed a building they could walk through.
    expect(empty).toBeLessThanOrEqual(EMPTY_MESHES);
    // Roughly half the collision files carry mesh geometry; zero would mean
    // every building interior is missing.
    expect(withMesh).toBeGreaterThan(files.length / 4);
    expect(meshes).toBeGreaterThan(withMesh);
  }, 300_000);
});

describe.skipIf(!TABLES)('tables.bin, from the user packs', () => {
  it('carries every combat clip by name, and a visual for each spark', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const clips = [
      ...ATTACK_CLIPS.swings,
      ATTACK_CLIPS.critical,
      ATTACK_CLIPS.shoot,
      ...Object.values(REACTION_CLIPS),
    ];
    for (const clip of clips) expect(tables.animationNamed(clip), clip).not.toBeNull();
    expect(tables.animationNamed('HURT_IDLE')).toBe(REACTION_CLIPS.flinchIdle);
    expect(tables.animationNamed('no_such_clip')).toBeNull();

    const sparks = Object.values(SPARK_FILES).map(file => tables.impactVisualPlaying(file));
    for (const visual of sparks) expect(visual).not.toBeNull();
    expect(new Set(sparks).size).toBe(sparks.length);
    for (const [i, file] of Object.values(SPARK_FILES).entries()) {
      const effects = tables.spellVisual(sparks[i]!)!.phases.impact!.effects;
      expect(effects.map(e => e.pathname.split('/').pop()!.toLowerCase())).toEqual([
        file.toLowerCase(),
      ]);
    }
  }, 60_000);

  it('gives every creature that chats a greeting with words in it', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const words = new FTable(await pack.read(pack.get('tables/String_Menu_en.tbl')!));
    tables.setStrings('String_Menu_en', words);
    const strings = tables.strings_('String_Menu_en')!;
    const chatting = [...tables.keyedRows('creature_proto').keys()].filter(
      entry => (tables.npcServiceBits(entry) & 1) !== 0,
    );
    expect(chatting.length).toBeGreaterThan(100);
    // A handful of rows name a string the build does not ship, and the
    // oldest build has one creature naming no row at all. Anything more is a
    // reader looking in the wrong column.
    const rows = chatting.map(entry => tables.gossipMenuRow(tables.greetingMenuOf(entry)));
    const worded = rows.filter(row => row !== null && strings.get(Number(row[1]))?.trim());
    expect(rows.filter(row => row !== null).length).toBeGreaterThanOrEqual(chatting.length - 1);
    expect(worded.length / chatting.length).toBeGreaterThan(0.97);
    // Menus under a greeting name rows the same way the greeting does.
    const under = tables
      .rowsOf('chat_menu')
      .flatMap(row => row.slice(8, 14).map(Number))
      .filter(id => id !== 0);
    expect(under.length).toBeGreaterThan(0);
    for (const id of under) expect(tables.gossipMenuRow(id), `menu ${id}`).not.toBeNull();
  }, 60_000);

  it('reads every conversation page with no markup left, and every choice to a column that is set', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const strings = tables.setStrings(
      'String_Menu_en',
      new FTable(await pack.read(pack.get('tables/String_Menu_en.tbl')!)),
    );
    const ids = tables.rowsOf('chat_menu').map(row => Number(row[0]));
    // Every branch a page can take: each condition met and not, and the
    // first and last of each set of lines.
    const players: GossipContext[] = [];
    for (const held of [true, false])
      for (const random of [0, 0.9])
        players.push({
          holdsQuest: () => held,
          hasAura: () => held,
          name: 'N',
          className: 'C',
          raceName: 'R',
          random: () => random,
        });
    const markup =
      /[\x12\x13]|\b(?:link_menu|randomtext|has_quest|not_has_quest|has_aura|topzone|moneycount)\b|teleport=/;
    let choices = 0;
    let unset = 0;
    let teleports = 0;
    for (const id of ids) {
      const menu = tables.gossipMenu(id, strings);
      for (const player of players) {
        const page = readGossip(menu, player);
        const said = page.text.map(span => span.text).join('');
        expect(said, `menu ${id}`).not.toMatch(markup);
        for (const choice of page.choices) {
          expect(choice.label, `menu ${id}`).not.toMatch(markup);
          if (choice.subMenuId !== 0)
            expect(tables.gossipMenuRow(choice.subMenuId), `menu ${id}`).not.toBeNull();
          if (player !== players[0]) continue;
          choices++;
          if (choice.teleport) teleports++;
          // A script slot names a script column, or a teleport sold from it.
          if (
            choice.scriptSlot > 0 &&
            !choice.teleport &&
            menu.scripts[choice.scriptSlot - 1] === 0
          )
            unset++;
        }
      }
    }
    // A few choices name a script slot the row leaves at 0 and sell no
    // teleport. They are pinned per build, told apart by the row count.
    const pinned = { 715: { teleports: 70, unset: 24 }, 595: { teleports: 70, unset: 12 } }[
      ids.length
    ];
    expect(choices).toBeGreaterThan(400);
    if (pinned) expect({ teleports, unset }).toEqual(pinned);
  }, 60_000);

  it('resolves the schema against the shipped tables', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');

    // This is the assertion with teeth: WorldTables.load() runs the same
    // shape-based column resolution the server does, and throws SchemaError if
    // any index it uses does not match the table's own format string. A build
    // whose columns moved fails here rather than rendering wrongly.
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });

    expect(tables.rowsOf('zones').length).toBeGreaterThan(0);
    expect([1, 3]).toContain(tables.spawnScaleAxes);

    const maps = tables.maps();
    expect(maps.length).toBeGreaterThan(0);
    expect(maps[0].name.length).toBeGreaterThan(0);

    const namesEntry = pack.get('tables/String_Zones_en.tbl');
    const names = namesEntry
      ? tables.setStrings('String_Zones_en', new FTable(await pack.read(namesEntry)))
      : new Map<number, string>();

    const zones = tables.zones(names);
    expect(zones.length).toBeGreaterThan(0);
    for (const z of zones) {
      expect(Number.isFinite(z.bounds[0])).toBe(true);
      expect(z.centre[0]).toBeCloseTo((z.bounds[0] + z.bounds[2]) / 2, 5);
      expect(z.mapName.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it('reads every zone its sky and map glyph, in every build on disk', async () => {
    // The sky is a block of six string columns that 2.2.0 moved two along;
    // read at 2.2.0's numbers, 1.1.4 handed the sun's texture over as the sky
    // model and every sky failed to load.
    const skipped: string[] = [];
    for (const path of allPacks('tables.bin')) {
      const resPath = join(dirname(path), 'res.bin');
      if (!existsSync(resPath)) {
        skipped.push(`${path} (no sibling res.bin to identify build)`);
        continue;
      }
      const res = await PackReader.open(await fileSource(resPath), 'res.bin');
      if (!buildFor(res.length)) {
        skipped.push(unsupportedBuild(path, res.length));
        continue;
      }
      const pack = await PackReader.open(await fileSource(path), 'tables.bin');
      const tables = await WorldTables.load(async entry => {
        const found = pack.get(entry);
        return found ? pack.read(found) : null;
      });
      const zones = tables.zones(new Map());
      if (!zones.length) continue;
      const withSky = zones.filter(z => z.skybox);
      // Most rows name no sky and take their parent's: once inherited, all
      // but a handful of zones have one.
      expect(withSky.length / zones.length).toBeGreaterThan(0.9);
      const byId = new Map(zones.map(z => [z.id, z]));
      // Silence names none; Arcadian Forest, which holds it, does.
      if (byId.has(79) && byId.has(403)) {
        expect(byId.get(79)!.skybox).toBe(byId.get(403)!.skybox);
        expect(byId.get(79)!.skybox).toMatch(/\.bdae$/i);
      }
      // The ground's sun and shade sit four and three numbers before the
      // strings in both builds, packed like the fog.
      if (byId.has(79) && byId.has(77)) {
        expect([byId.get(79)!.sunColor, byId.get(79)!.shadeColor]).toEqual([0xffffff, 0xc1e9f5]);
        expect([byId.get(77)!.sunColor, byId.get(77)!.shadeColor]).toEqual([0xb1fbf2, 0xe4966b]);
      }
      const lit = zones.filter(z => z.sunColor && z.shadeColor);
      expect(lit.length / zones.length).toBeGreaterThan(0.9);
      for (const z of lit) expect(Math.max(z.sunColor, z.shadeColor)).toBeLessThanOrEqual(0xffffff);
      for (const z of withSky) expect(z.skybox).toMatch(/\.bdae$/i);
      for (const z of zones.filter(z => z.skyHill)) expect(z.skyHill).toMatch(/\.bdae$/i);
      for (const z of zones.filter(z => z.skySun)) expect(z.skySun).toMatch(/\.(tga|png|pvr)$/i);
      const glyphs = zones.filter(z => z.icon);
      expect(glyphs.length).toBeGreaterThan(0);
      for (const z of glyphs) expect(z.icon).toMatch(/^board_/);
      // The disposition follows the icon column, which moves between builds: read
      // at a fixed column it came out 0 for every zone in 1.1.4.
      const dispositions = new Set(glyphs.map(z => z.friendly));
      expect(dispositions.has(0) && dispositions.has(2)).toBe(true);
    }
    if (skipped.length > 0) {
      console.warn(`[realPacks] skipped unsupported tables.bin builds: ${skipped.join(', ')}`);
    }
  }, 60_000);

  it('creatures do not all speak the player clip vocabulary', async () => {
    // The numbers behind `CLIP_FALLBACKS` in the renderer. A creature asked
    // for one of the player's clips misses often enough that "the NPC does not animate" is the normal case rather
    // than the exception. If these ratios move, that table needs revisiting.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');

    const folders = new Map<string, Set<string>>();
    for (const entry of pack.entries) {
      const cut = entry.name.indexOf('/anim/');
      if (cut < 0 || !entry.name.endsWith('.bdae')) continue;
      const folder = entry.name.slice(0, cut);
      if (!folder.includes('/creature/')) continue;
      const clip = entry.name.slice(cut + 6).replace(/\.bdae$/, '');
      const set = folders.get(folder) ?? new Set<string>();
      set.add(clip);
      folders.set(folder, set);
    }

    const total = folders.size;
    expect(total).toBeGreaterThan(50);
    const has = (clip: string): number =>
      [...folders.values()].filter(clips => clips.has(clip)).length;

    // Every creature idles. That is what every fallback chain ends at.
    expect(has('idle')).toBe(total);
    // More creatures walk than run, and the player's reverse and strafe clips
    // are the exception rather than the rule.
    expect(has('walk_forward') / total).toBeGreaterThan(0.8);
    expect(has('walk_backward') / total).toBeLessThan(0.3);
    expect(has('move_left') / total).toBeLessThan(0.3);
  }, 60_000);

  it('ships a hair colour for every playable body that paints hair', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const names = pack.entries.map(e => e.name);
    const bodies = names.filter(n =>
      /^model\/npc\/character\/[^/]+\/(?:male|female)\/[^/]+_h\.bdae$/.test(n),
    );
    expect(bodies.length).toBeGreaterThanOrEqual(8);
    for (const body of bodies) {
      const shipped = shippedHairColours(body, names);
      expect({ body, shipped: shipped.length > 0 }).toEqual({ body, shipped: true });
      // With no colour named, the hair painted is a file that is there.
      const hair = bodyLayers(
        body,
        lookFrom({ hairColor: 0 }),
        () => undefined,
        undefined,
        shipped,
      ).find(l => l.piece === 'hair');
      if (hair) expect(names.map(n => n.toLowerCase())).toContain(hair.ref.toLowerCase());
    }
  }, 60_000);

  it('ships every clip a character on foot asks for', async () => {
    // Every clip the on-foot chart names, with the weapon suffix a combat clip
    // gets at playback, has to name a clip that exists.
    // A miss is silent during play, so check them against every playable race.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const byFolder = new Map<string, Set<string>>();
    for (const entry of pack.entries) {
      const m = /^(model\/npc\/character\/[^/]+\/(?:male|female))\/anim\/([^/]+)\.bdae$/.exec(
        entry.name,
      );
      if (!m) continue;
      const set = byFolder.get(m[1]!) ?? new Set<string>();
      set.add(m[2]!);
      byFolder.set(m[1]!, set);
    }
    expect(byFolder.size).toBeGreaterThanOrEqual(8);

    const postures: Posture[] = [
      'run',
      'walk',
      'stand',
      'jump',
      'fall',
      'landMoving',
      'landStill',
      'guardMelee',
      'guardRanged',
      'swim',
      'fly',
      'flourish',
    ];
    const movements: Movement[] = ['stop', 'forward', 'backward', 'left', 'right'];
    const asked = new Set<string>();
    for (const posture of postures) {
      for (const movement of movements) {
        for (const clip of cueClips(cueFor('foot', posture, movement)))
          asked.add(combatClipName(clip, UNARMED));
      }
    }
    expect(asked.size).toBeGreaterThan(25);

    for (const [folder, clips] of byFolder) {
      const missing = [...asked].filter(clip => !clips.has(clip));
      expect({ folder, missing }).toEqual({ folder, missing: [] });
    }

    // Backing onto the ground plays the standing landing because no race
    // ships a landing of its own for travelling backwards.
    const landings = [...byFolder.values()]
      .flatMap(clips => [...clips])
      .filter(clip => /land/.test(clip));
    expect(landings.length).toBeGreaterThan(0);
    expect(landings.filter(clip => /back/.test(clip))).toEqual([]);
  }, 60_000);

  it("ships what an NPC stands doing, its idle variations and a quest giver's gestures", async () => {
    const tablePack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = tablePack.get(entry);
      return found ? tablePack.read(found) : null;
    });
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const byFolder = new Map<string, Set<string>>();
    for (const entry of pack.entries) {
      const cut = entry.name.indexOf('/anim/');
      if (cut < 0 || !entry.name.endsWith('.bdae')) continue;
      const folder = entry.name.slice(0, cut).toLowerCase();
      const set = byFolder.get(folder) ?? new Set<string>();
      set.add(entry.name.slice(cut + 6, -'.bdae'.length).toLowerCase());
      byFolder.set(folder, set);
    }
    const ships = (model: string, clip: string): boolean =>
      byFolder.get(model.toLowerCase().replace(/\/[^/]+$/, ''))?.has(clip.toLowerCase()) ?? false;

    // Every clip here is one the animation table names.
    for (const clip of [...FIDGET_CLIPS, ...Object.values(QUEST_GESTURES)]) {
      expect(tables.animationNamed(clip), clip).toBe(clip);
    }

    // The gestures ship in every playable race's folder.
    const races = [...byFolder.keys()].filter(f =>
      /^model\/npc\/character\/[^/]+\/(?:male|female)$/.test(f),
    );
    expect(races.length).toBeGreaterThanOrEqual(8);
    for (const folder of races) {
      const missing = Object.values(QUEST_GESTURES).filter(
        clip => !byFolder.get(folder)!.has(clip),
      );
      expect({ folder, missing }).toEqual({ folder, missing: [] });
    }

    // The `creature_spawns` column the server sends as `animationId`: every
    // value set names a table row, and nearly every placement's own model
    // ships the clip it names.
    const SPAWN_ANIMATION = 14;
    let standing = 0;
    let shipped = 0;
    let placed = 0;
    let fidgets = 0;
    for (const row of tables.rowsOf('creature_spawns')) {
      const model = tables.creatureModel(Number(row[1])).path;
      if (!model) continue;
      placed++;
      if (FIDGET_CLIPS.every(clip => ships(model, clip))) fidgets++;
      const id = Number(row[SPAWN_ANIMATION]);
      if (!id) continue;
      standing++;
      const clip = tables.animationName(id);
      expect(clip, `animation ${id}`).not.toBeNull();
      if (ships(model, clip!)) shipped++;
    }
    expect(standing).toBeGreaterThan(500);
    expect(standing / placed).toBeLessThan(0.2);
    expect(shipped / standing).toBeGreaterThan(0.97);
    // The idle variations ship for nearly every body placed in the world.
    expect(fidgets / placed).toBeGreaterThan(0.95);
  }, 120_000);

  it("ships the emote a duel's loser plays in every playable race's folder", async () => {
    // The id the server sends in `emote.performed` when a player loses a
    // duel: the beg emote in its emote table.
    const DUEL_LOSS_EMOTE = 121;
    const tablePack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = tablePack.get(entry);
      return found ? tablePack.read(found) : null;
    });
    const clip = tables.animationName(DUEL_LOSS_EMOTE);
    expect(clip).not.toBeNull();
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const races = new Set<string>();
    const shipping = new Set<string>();
    for (const entry of pack.entries) {
      const m = /^(model\/npc\/character\/[^/]+\/(?:male|female))\/anim\/([^/]+)\.bdae$/i.exec(
        entry.name,
      );
      if (!m) continue;
      races.add(m[1]!.toLowerCase());
      if (m[2]!.toLowerCase() === clip!.toLowerCase()) shipping.add(m[1]!.toLowerCase());
    }
    expect(races.size).toBeGreaterThanOrEqual(8);
    expect([...races].filter(folder => !shipping.has(folder))).toEqual([]);
  }, 120_000);

  it('ships the clips the mount chart asks for in most mount folders', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const byFolder = new Map<string, Set<string>>();
    for (const entry of pack.entries) {
      const m = /^(model\/npc\/creature\/mount\/[^/]+)\/anim\/([^/]+)\.bdae$/.exec(entry.name);
      if (!m) continue;
      const set = byFolder.get(m[1]!) ?? new Set<string>();
      set.add(m[2]!);
      byFolder.set(m[1]!, set);
    }
    expect(byFolder.size).toBeGreaterThanOrEqual(10);

    const postures: Posture[] = [
      'run',
      'walk',
      'stand',
      'jump',
      'fall',
      'landMoving',
      'landStill',
      'guardMelee',
      'guardRanged',
      'swim',
      'fly',
      'flourish',
    ];
    const movements: Movement[] = ['stop', 'forward', 'backward', 'left', 'right'];
    const asked = new Set<string>();
    for (const posture of postures) {
      for (const movement of movements) {
        for (const clip of cueClips(cueFor('mount', posture, movement))) asked.add(clip);
      }
    }
    const folders = [...byFolder.values()];
    for (const clip of asked) {
      const share = folders.filter(clips => clips.has(clip)).length / folders.length;
      expect({ clip, enough: share >= 0.8 }).toEqual({ clip, enough: true });
    }
    // A mount ships no sided take-off, so its sideways jump is the plain one.
    expect(folders.some(clips => clips.has('jump_start_left'))).toBe(false);
  }, 60_000);

  it('ships the ready stance of every weapon kind for every playable race', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const byFolder = new Map<string, Set<string>>();
    for (const entry of pack.entries) {
      const m = /^(model\/npc\/character\/[^/]+\/(?:male|female))\/anim\/([^/]+)\.bdae$/.exec(
        entry.name,
      );
      if (!m) continue;
      const set = byFolder.get(m[1]!) ?? new Set<string>();
      set.add(m[2]!);
      byFolder.set(m[1]!, set);
    }
    const families = new Set<string>();
    for (let subClass = 0; subClass < 32; subClass++) {
      for (const ranged of [false, true]) {
        const family = familyOf({ itemClass: 2, subClass }, ranged ? 'ranged' : 'melee');
        if (family) families.add(family);
      }
    }
    expect(families.size).toBeGreaterThanOrEqual(8);
    for (const [folder, clips] of byFolder) {
      const missing = [...families].filter(f => !clips.has(`combat_ready_${f}`));
      expect({ folder, missing }).toEqual({ folder, missing: [] });
    }
  }, 60_000);

  it('finds collision wherever this build happens to keep it', async () => {
    // Which pack holds the `.phy` files is a property of the BUILD, not of the
    // format: 2.2.0 has a `model_phy.bin`, 1.1.4 has none and keeps them in
    // `tables.bin` instead. Code that demanded `model_phy.bin` gave 1.1.4 no
    // collision anywhere — a world you walk straight through — and said only
    // that the pack was missing, which sounds like a broken extraction rather
    // than a different layout.
    const found: Array<{ pack: string; count: number }> = [];
    for (const name of PHY_PACKS) {
      const path = findPack(name);
      if (!path) continue;
      const pack = await PackReader.open(await fileSource(path), name);
      const count = pack.entries.filter(e => e.name.toLowerCase().endsWith('.phy')).length;
      if (count > 0) found.push({ pack: name, count });
    }

    // Whichever build the suite is pointed at, exactly one of them carries it.
    expect(found.length).toBeGreaterThan(0);
    expect(found[0]!.count).toBeGreaterThan(500);
  }, 60_000);

  it("an equipped item's own entry id indexes itemdisplayinfo", async () => {
    // What a character wears crosses the wire as item ENTRY ids, and this is
    // the table that turns one into meshes and a texture. Going through
    // `items.tbl` first — reading a display id out of it and looking *that* up
    // — is the natural-looking mistake, and it renders every character naked
    // because almost nothing it produces is a key here.
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });

    const display = tables.keyedRows('itemdisplayinfo');
    expect(display.size).toBeGreaterThan(0);

    // Read straight from the pack: `items.tbl` is deliberately not one of the
    // tables the client loads, precisely because nothing needs it to dress a
    // character. Columns are id, class, subClass.
    const itemsEntry = pack.get('tables/items.tbl');
    expect(itemsEntry).toBeTruthy();
    const items = new FTable(await pack.read(itemsEntry!));

    // Weapons and armour are the classes that put something on a body.
    const equippable = items.allRows().filter(row => row[1] === 2 || row[1] === 4);
    expect(equippable.length).toBeGreaterThan(0);

    const direct = equippable.filter(row => display.has(Number(row[0]))).length;
    expect(direct / equippable.length).toBeGreaterThan(0.8);
  }, 60_000);

  it('sorts every weapon in the item table into a kind', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const items = new FTable(await pack.read(pack.get('tables/items.tbl')!));
    const weapons = items.allRows().filter(row => row[1] === 2);
    expect(weapons.length).toBeGreaterThan(500);
    const unsorted = [
      ...new Set(weapons.filter(row => heldKind(2, Number(row[2])) === null).map(row => row[2])),
    ];
    expect(unsorted).toEqual([]);
  }, 60_000);

  it('puts the mining pick in the right hand, drawn', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const look = lookFrom();
    look.worn.mainHand = GATHER_HELD_ITEMS.get(23)!;
    const [pick, ...rest] = attachmentsFor(
      look,
      id => tables.keyedRows('itemdisplayinfo').get(id),
      id => tables.keyedRows('itemmodeldata').get(id),
      true,
      id => tables.itemWeaponClass(id),
    );
    expect(rest).toEqual([]);
    expect(pick?.model).toMatch(/old_miners_dig\.bdae$/);
    expect(pick?.node).toBe('Dummy_R_Hand-node');
  }, 60_000);

  it("names a held kind for nearly everything a creature's look holds", async () => {
    // A humanoid's combat clips follow what its hands hold; a hand the item
    // table cannot classify fights bare-handed with a weapon drawn.
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    let held = 0;
    let kinded = 0;
    for (const row of tables.keyedRows('creature_appearance').values()) {
      const display = tables.keyedRows('creaturedisplayinfo').get(Number(row[5]));
      const extra = display
        ? tables.keyedRows('creaturedisplayinfoextra').get(Number(display[7]))
        : undefined;
      if (!extra) continue;
      const hands = heldItemsOf(lookFromRow(extra), id => tables.itemWeaponClass(id));
      for (const hand of hands ? [hands.mainhand, hands.offhand, hands.ranged] : []) {
        if (!hand.entry) continue;
        held++;
        if (heldKind(hand.itemClass, hand.subClass) !== null) kinded++;
      }
    }
    // 1.1.4: 1,202 held, 1,153 with a kind.
    expect(held).toBeGreaterThan(500);
    expect(kinded / held).toBeGreaterThan(0.9);
  }, 60_000);

  it('reads the quest and spell-slot columns as what they hold', async () => {
    // The quest column names a quest, and a spell slot that fires while worn
    // is only ever on something worn: `useOf` offers "Use" on every other
    // spell an item carries.
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const quests = new FTable(await pack.read(pack.get('tables/quests.tbl')!));
    const knownQuests = new Set(quests.keys());
    const facts = [...tables.keyedRows('items').keys()].map(id => tables.itemFacts(id)!);

    const offering = facts.filter(one => one.startsQuest > 0);
    expect(offering.length).toBeGreaterThan(10);
    expect(offering.filter(one => !knownQuests.has(one.startsQuest))).toEqual([]);
    // No row both offers a quest and casts on use.
    expect(offering.filter(one => one.spellSlots.some(slot => slot.trigger === 1))).toEqual([]);

    const whileWorn = facts.filter(one => one.spellSlots.some(slot => slot.trigger === 2));
    expect(whileWorn.length).toBeGreaterThan(0);
    expect([...new Set(whileWorn.map(one => one.itemClass))].sort()).toEqual([2, 4]);
    expect(facts.filter(one => useOf(one) === 'cast').length).toBeGreaterThan(500);
  }, 60_000);

  /** Item rows offering Use, per build (by item count): on the card, and in the bag window (`useOf`). */
  const USE_SETS: Record<number, { card: number; bag: number }> = {
    5034: { card: 955, bag: 1026 },
    6515: { card: 1278, bag: 1436 },
  };

  it('offers Use on as many items in every build as its tables give', async () => {
    const skipped: string[] = [];
    for (const path of allPacks('tables.bin')) {
      const resPath = join(dirname(path), 'res.bin');
      if (!existsSync(resPath)) {
        skipped.push(`${path} (no sibling res.bin to identify build)`);
        continue;
      }
      const res = await PackReader.open(await fileSource(resPath), 'res.bin');
      if (!buildFor(res.length)) {
        skipped.push(unsupportedBuild(path, res.length));
        continue;
      }
      const pack = await PackReader.open(await fileSource(path), 'tables.bin');
      const tables = await WorldTables.load(async entry => {
        const found = pack.get(entry);
        return found ? pack.read(found) : null;
      });
      const facts = [...tables.keyedRows('items').keys()].map(id => tables.itemFacts(id)!);
      const card = facts.filter(one => one.inventoryType === 0 && useOf(one) === 'cast');
      const bag = facts.filter(one => useOf(one) !== null);
      const pinned = USE_SETS[facts.length];
      if (pinned) expect({ card: card.length, bag: bag.length }).toEqual(pinned);
      // A sample of shapes: every row of the kinds used as they are offers
      // Use, and no quest starter offers it for its quest alone.
      const kind = (itemClass: number, subClass: number) =>
        facts.filter(one => one.itemClass === itemClass && one.subClass === subClass);
      expect(kind(5, 0).length).toBeGreaterThan(0);
      expect(kind(5, 0).every(one => useOf(one) === 'byKind')).toBe(true);
      expect(kind(10, 1).every(one => useOf(one) !== null)).toBe(true);
      const starters = facts.filter(
        one =>
          one.startsQuest > 0 &&
          one.itemClass === 10 &&
          one.subClass !== 1 &&
          one.spellSlots.every(slot => !slot.id),
      );
      expect(starters.length).toBeGreaterThan(0);
      expect(starters.filter(one => useOf(one) !== null)).toEqual([]);
    }
    if (skipped.length > 0) {
      console.warn(`[realPacks] skipped unsupported tables.bin builds: ${skipped.join(', ')}`);
    }
  }, 120_000);

  it('every object-attached effect names a .beff and a node', async () => {
    // `staticobject_displayinfo` carries six (node, effect) pairs per object.
    // The columns are found by shape, so the failure mode is not an exception
    // but plausible-looking rubbish read out of the neighbouring column -- a
    // pair whose "effect" is not an effect, or whose halves do not agree.
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });

    let pairs = 0;
    const wrongExtension: string[] = [];
    for (const proto of tables.rowsOf('staticobject_proto')) {
      const entry = typeof proto[0] === 'number' ? proto[0] : 0;
      for (const { node, effect } of tables.staticEffects(entry)) {
        pairs++;
        if (!effect.toLowerCase().endsWith('.beff')) wrongExtension.push(effect);
        expect(node.length).toBeGreaterThan(0);
      }
    }

    expect(pairs).toBeGreaterThan(0);
    expect(wrongExtension).toEqual([]);

    // The check above is weaker than it looks: shifting the block by a column
    // moves both halves together, so the pairs it finds are fewer but still
    // self-consistent. What pins the start down is that the true offset is the
    // only one that accounts for *every* pair in the table -- any other loses
    // some. Counted here straight off the raw table, independently of the
    // resolution being tested.
    const raw = new FTable(await pack.read(pack.get('tables/staticobject_displayinfo.tbl')!));
    const width = 6;
    const counts: number[] = [];
    for (let start = 0; start + width * 2 <= raw.format.length; start++) {
      // Only a block that is string all the way through can be the pairs.
      // Without this the uint columns count too, since a number stringifies to
      // "0" and "0" is not empty -- which is exactly the sort of quiet
      // miscount this test exists to catch.
      const block = raw.format.slice(start, start + width * 2);
      if (block !== 's'.repeat(width * 2)) {
        counts.push(-1);
        continue;
      }
      let n = 0;
      for (let i = 0; i < raw.rows; i++) {
        const row = raw.row(i);
        for (let j = 0; j < width; j++) {
          const node = String(row[start + j] ?? '').replace(/\0+$/, '');
          const eff = String(row[start + width + j] ?? '').replace(/\0+$/, '');
          if (node && eff) n++;
        }
      }
      counts.push(n);
    }
    const best = Math.max(...counts);
    expect(pairs).toBe(best);
    expect(counts.filter(c => c === best)).toHaveLength(1);
  }, 60_000);

  it('every .tbl in the pack parses', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tbls = pack.entries.filter(e => !e.isDir && e.name.toLowerCase().endsWith('.tbl'));
    expect(tbls.length).toBeGreaterThan(0);

    const failures: string[] = [];
    for (const entry of tbls) {
      try {
        const t = new FTable(await pack.read(entry));
        // Reading the first and last row exercises the entry stride and the
        // string offsets, which is where a wrong header would show up.
        if (t.rows > 0) {
          t.row(0);
          t.row(t.rows - 1);
        }
      } catch (err) {
        failures.push(`${entry.name}: ${String(err)}`);
      }
    }
    expect(failures).toEqual([]);
  }, 120_000);
});

describe.skipIf(!RES)('BDAE models, from the user packs', () => {
  it("finds the butterfly's wings on a skin, with the clip that flaps them inside the same file", async () => {
    /*
     * Skinned scenery with no `anim/` sibling animates from its own embedded
     * clip (`ResourceSystem.animation`); checks it is skinned and the clip binds a bone.
     */
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    // Matched case-insensitively: the pack capitalises the file name.
    const entry = pack.entries.find(e => /broadleafforest_butterfly\.bdae$/i.test(e.name));
    expect(entry, 'butterfly model in res.bin').toBeTruthy();
    const path = entry!.name;
    const { payload } = await unwrapBdae(await pack.read(entry!));
    const doc = new Bdae(payload);

    const skeleton = toSkeletonData(doc, path);
    const model = toModelData(doc, path, () => true);
    const own = toAnimationData(doc.animations(), skeleton, path);
    console.log(
      `butterfly skins=${skeleton.skins.length} bones=${skeleton.bones.length} ` +
        `nodeClipTracks=${model.nodeClip?.tracks.length ?? 0} ownClipTracks=${own.tracks.length} ` +
        `duration=${own.duration.toFixed(2)}s targets=[${doc
          .animations()
          .flatMap(c => (c.channels ?? []).map(ch => ch.target))
          .join(', ')}]`,
    );
    expect(skeleton.skins.length).toBeGreaterThan(0);
    expect(own.tracks.length).toBeGreaterThan(0);
  });

  it("a skinned flag's own idle clip already sways it", async () => {
    /*
     * `desert_flag01` is a skinned two-bone model with only an embedded clip;
     * this drives it through the build and mixer path and checks a bone turns.
     * (Most flags have no animation; some sway by morph targets, below.)
     */
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const path = 'model/scene/build/desert_dungeon/desert_flag01.bdae';
    const entry = pack.get(path);
    expect(entry, 'desert_flag01 in res.bin').toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    const doc = new Bdae(payload);

    const skeleton = toSkeletonData(doc, path);
    expect(isSkinned(skeleton)).toBe(true);
    const model = toModelData(doc, path, () => true);
    const clipData = toAnimationData(doc.animations(), skeleton, path);
    expect(clipData.tracks.length).toBeGreaterThan(0);

    const built = buildSkinnedModel(
      model,
      skeleton,
      new MaterialCache({ texture: async () => null }),
      undefined,
      [0, 0, 0],
    );
    expect(built).toBeTruthy();
    const mesh = built!.object.getObjectByProperty('type', 'SkinnedMesh') as THREE.SkinnedMesh;
    expect(mesh, 'a SkinnedMesh in the built object').toBeTruthy();

    const mixer = new THREE.AnimationMixer(built!.object);
    mixer.clipAction(toThreeClip(clipData)).play();
    built!.object.updateMatrixWorld(true);
    const before = mesh.skeleton.bones.map(b => b.quaternion.clone());

    mixer.update(3);
    built!.object.updateMatrixWorld(true);
    const after = mesh.skeleton.bones.map(b => b.quaternion.clone());

    const moved = before.some((q, i) => q.angleTo(after[i]) > 0.01);
    expect(moved, 'a bone rotated after 3s of playback').toBe(true);
  });

  it('decodes a spread of models, checked against the files own redundancy', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const models = pack.entries.filter(e => !e.isDir && /\.bdae$/i.test(e.name));
    expect(models.length).toBeGreaterThan(100);

    // A spread across the pack rather than the first N, which would all come
    // from one directory and exercise one exporter setting.
    const step = Math.max(1, Math.floor(models.length / 60));
    const sample = models.filter((_, i) => i % step === 0).slice(0, 60);

    let withGeometry = 0;
    let skinned = 0;
    let animated = 0;
    const failures: string[] = [];

    for (const entry of sample) {
      try {
        const { payload } = await unwrapBdae(await pack.read(entry));
        const doc = new Bdae(payload);
        for (const m of doc.meshes(true)) {
          if (!m.positions || !m.indices) continue;
          withGeometry++;
          expect(m.positions.length % 3).toBe(0);
          // Indices must address vertices that exist, or the GPU reads garbage.
          for (let i = 0; i < m.indices.length; i += 997) {
            expect(m.indices[i]).toBeLessThan(m.positions.length / 3);
          }
          // Every group must lie inside the index buffer.
          for (const g of m.groups) {
            expect(g.start + g.count).toBeLessThanOrEqual(m.indices.length);
          }
          // The declared bounding box must contain the decoded positions. That
          // is the file stating the answer twice, and it is what catches a
          // wrong vertex stride or a missed transform.
          for (let i = 0; i < m.positions.length; i += 3) {
            expect(m.positions[i]).toBeGreaterThanOrEqual(m.boundingBox.min[0] - 1e-2);
            expect(m.positions[i]).toBeLessThanOrEqual(m.boundingBox.max[0] + 1e-2);
          }
        }
        if (Object.keys(doc.allSkins()).length) skinned++;
        if (doc.animations().length) animated++;
      } catch (err) {
        failures.push(entry.name + ': ' + String(err));
      }
    }

    expect(failures).toEqual([]);
    expect(withGeometry).toBeGreaterThan(0);
    expect(skinned + animated).toBeGreaterThan(0);
  }, 300_000);

  it('reads a character skeleton and its animation curves', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const model = pack.get('model/npc/character/human/male/human_m_h.bdae');
    if (!model) return; // A build without this character is not a failure.

    const { payload } = await unwrapBdae(await pack.read(model));
    const doc = new Bdae(payload);

    const roots = doc.nodeHierarchy();
    expect(roots.length).toBeGreaterThan(0);
    let bones = 0;
    const walk = (n: { children: unknown[] }): void => {
      bones++;
      for (const c of n.children) walk(c as { children: unknown[] });
    };
    for (const r of roots) walk(r);
    expect(bones).toBeGreaterThan(20);

    const skins = doc.allSkins();
    expect(Object.keys(skins).length).toBeGreaterThan(0);
    for (const skin of Object.values(skins)) {
      // Four influences per vertex, every joint index in range.
      for (const w of skin.weights.slice(0, 200)) {
        expect(w.weights).toHaveLength(4);
        for (const idx of w.indices) {
          if (idx !== 0) expect(idx).toBeLessThan(Math.max(1, skin.jointNames.length));
        }
      }
      // The stored weight count is in words, not records; reading it as
      // records gives five times too many entries for a 4-influence body and
      // every skinned mesh is then silently dropped.
      if (skin.maxInfluence > 0) {
        expect(skin.vertexCount).toBeGreaterThan(0);
      }
    }

    // Curves live in the anim/*.bdae files, not in the model.
    const anim = pack.entries.find(e => /human\/male\/anim\/.*\.bdae$/i.test(e.name));
    if (!anim) return;
    const clipDoc = new Bdae((await unwrapBdae(await pack.read(anim))).payload);
    const clips = clipDoc.animations();
    expect(clips.length).toBeGreaterThan(0);
    // A clip whose samplers resolve to nothing is the "nothing animated" bug:
    // the segment lookup or the self-relative source offset has gone wrong.
    const withCurves = clips.filter(c =>
      c.samplers.some(sm => sm.input.values.length > 0 && sm.output.values.length > 0),
    );
    expect(withCurves.length).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(!findPack('model_phy.bin'))('collision, the user .phy files', () => {
  it('parses them, with every face indexing a vertex that exists', async () => {
    const path = findPack('model_phy.bin')!;
    const pack = await PackReader.open(await fileSource(path), 'model_phy.bin');
    const phys = pack.entries.filter(e => !e.isDir && /\.phy$/i.test(e.name));
    expect(phys.length).toBeGreaterThan(0);

    let geoms = 0;
    let meshes = 0;
    let empty = 0;
    const step = Math.max(1, Math.floor(phys.length / 200));
    for (const entry of phys.filter((_, i) => i % step === 0)) {
      const blocks = parsePhy(await pack.read(entry));
      if (!blocks.length) {
        empty++;
        continue;
      }
      geoms += blocks.length;
      for (const g of blocks) {
        expect(g.position).toHaveLength(3);
        expect(g.halfSize.every(v => v >= 0)).toBe(true);
        if (g.type === 'mesh') {
          meshes++;
          for (const f of (g.faces ?? []).slice(0, 100)) {
            for (let k = 0; k < 3; k++) {
              expect(f[k]).toBeLessThan((g.vertices ?? []).length);
            }
          }
        }
      }
    }
    expect(geoms).toBeGreaterThan(0);
    expect(meshes).toBeGreaterThan(0);
    // A file that parses to nothing is a reader bug, not shipped data.
    expect(empty).toBeLessThan(phys.length * 0.05);
  }, 300_000);
});

describe.skipIf(!findPack('land1.bin'))('terrain, the user tiles', () => {
  it('every .trn and .itm sampled from a map pack parses', async () => {
    const path = findPack('land1.bin')!;
    const pack = await PackReader.open(await fileSource(path), 'land1.bin');

    const trns = pack.entries.filter(e => !e.isDir && /\.trn$/i.test(e.name));
    const itms = pack.entries.filter(e => !e.isDir && /\.itm$/i.test(e.name));
    expect(trns.length).toBeGreaterThan(0);
    expect(itms.length).toBeGreaterThan(0);

    const trnStep = Math.max(1, Math.floor(trns.length / 120));
    for (const entry of trns.filter((_, i) => i % trnStep === 0)) {
      const tile = parseTrn(await pack.read(entry));
      expect(tile.chunks).toHaveLength(64);
      if (tile.heights) {
        expect(tile.heights.length).toBe(65 * 65);
        for (const h of tile.heights) expect(Number.isFinite(h)).toBe(true);
      }
      for (const c of tile.chunks) {
        for (const t of c.textures) {
          expect(t).toBeGreaterThanOrEqual(-1);
          expect(t).toBeLessThan(tile.textures.length);
        }
      }
    }

    const itmStep = Math.max(1, Math.floor(itms.length / 120));
    let placements = 0;
    const failed: string[] = [];
    for (const entry of itms.filter((_, i) => i % itmStep === 0)) {
      try {
        const doc = parseItm(await pack.read(entry));
        placements += doc.count;
        for (const it of doc.items) expect(it.nameIndex).toBeLessThan(doc.names.length);
      } catch (err) {
        failed.push(entry.name + ': ' + String(err));
      }
    }
    expect(failed).toEqual([]);
    expect(placements).toBeGreaterThan(0);
  }, 300_000);

  /**
   * The streamer looks tiles up by composed name (one lookup, not 13,581), so
   * the name must match the pack byte for byte or every tile is silently empty.
   */
  it('composes the same tile paths the pack actually ships', async () => {
    const path = findPack('land1.bin')!;
    const pack = await PackReader.open(await fileSource(path), 'land1.bin');

    for (const [kind, ext] of [
      ['items', 'itm'],
      ['terrain', 'trn'],
    ] as const) {
      const entries = pack.entries.filter(
        e => !e.isDir && new RegExp(`\.${ext}$`, 'i').test(e.name),
      );
      expect(entries.length).toBeGreaterThan(0);

      const missed: string[] = [];
      for (const entry of entries) {
        const tile = tileFromName(entry.name);
        if (!tile) {
          missed.push(entry.name);
          continue;
        }
        if (!pack.get(tileName('land1', kind, tile[0], tile[1], ext))) missed.push(entry.name);
      }
      expect(missed).toEqual([]);
    }
  }, 300_000);
});

describe.skipIf(!IPA)('the .ipa itself', () => {
  it('finds the packs inside, and they are deflated', async () => {
    const ipa = await PackReader.open(await fileSource(IPA!), 'game.ipa');
    expect(ipa.length).toBeGreaterThan(0);

    const packs = ipa.entries.filter(e => !e.isDir && /\.bin$/i.test(e.name));
    expect(packs.length).toBeGreaterThan(0);

    const res = packs.find(e => /(^|\/)res\.bin$/i.test(e.name));
    expect(res).toBeDefined();

    // Apple's zip metadata is a .bin too, and must not be mistaken for a pack.
    const appleMeta = packs.find(e => /^meta-inf\//i.test(e.name));
    if (appleMeta) {
      expect(/payload\/[^/]+\.app\/[^/]+\.bin$/i.test(appleMeta.name)).toBe(false);
    }

    // This is the fact the whole PackStore design rests on: the packs are
    // stored deflated, so none of them can be seeked into in place. If a build
    // ever ships them stored, `PackStore.open` takes its cheap path instead
    // and this expectation is the thing that should be revisited.
    expect(res!.method).toBe(8);
    expect(res!.size).toBeGreaterThan(res!.compSize);
  }, 120_000);

  it('streams a pack out without holding it whole', async () => {
    const ipa = await PackReader.open(await fileSource(IPA!), 'game.ipa');
    // The smallest *game* pack, so the check is about the mechanism rather
    // than about spending a minute inflating 654 MB. The filter matters: the
    // smallest .bin in the bundle is META-INF/com.apple.FixedZipMetadata.bin,
    // which is Apple's zip index and not a pack at all.
    const smallest = ipa.entries
      .filter(e => !e.isDir && /payload\/[^/]+\.app\/[^/]+\.bin$/i.test(e.name) && e.size > 0)
      .sort((a, b) => a.size - b.size)[0];
    expect(smallest).toBeDefined();

    const reader = (await ipa.stream(smallest)).getReader();
    let total = 0;
    let chunks = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.length;
      chunks++;
    }
    expect(total).toBe(smallest.size);

    // And the inflated bytes really are a pack, readable end to end.
    const bytes = await ipa.read(smallest);
    expect(bytes.length).toBe(smallest.size);
    const inner = await PackReader.open(bytesSource(bytes), smallest.name);
    expect(inner.length).toBeGreaterThan(0);
    expect(chunks).toBeGreaterThan(0);
  }, 300_000);
});

describe.skipIf(!IPA || !RES)('the interface typefaces, in the user files', () => {
  it('ships a file for each of the two typefaces the movies letter most fields in', async () => {
    const ipa = await PackReader.open(await fileSource(IPA!), 'game.ipa');
    const files = ipa.entries.filter(e => !e.isDir && /\.(ttf|otf|ttc)$/i.test(e.name));
    expect(files.length).toBeGreaterThan(0);
    const shipped = [];
    for (const entry of files) {
      const bytes = await ipa.read(entry);
      const family = readTypefaceFamily(bytes);
      // Every typeface in the bundle names its family: a null here is the
      // reader failing on a real file.
      expect(family, entry.name).toBeTruthy();
      shipped.push({ family, bytes });
    }

    const res = await PackReader.open(await fileSource(RES!), 'res.bin');
    const movies = [];
    for (const movie of ['LGM', 'IGM', 'store']) {
      const entry = res.get(`ui/${movie}.swf`);
      if (entry) movies.push(await parseSwf(await res.read(entry)));
    }
    const byUse = facesByUse(movies);
    expect(byUse.length).toBeGreaterThanOrEqual(2);
    // Every field that names a typeface names one the movie defines.
    for (const movie of movies) {
      const defined = new Set(movie.fonts.map(font => font.id));
      for (const edit of movie.edits) {
        if (edit.fontId !== null) expect(defined.has(edit.fontId)).toBe(true);
      }
    }
    const faces = pickUiFaces(byUse, shipped);
    expect(faces.body).not.toBeNull();
    expect(faces.title).not.toBeNull();
    expect(faces.body!.family).not.toBe(faces.title!.family);
  }, 300_000);
});

describe.skipIf(!RES)('the bank chest glow', () => {
  it('draws ten shafts, one in each tenth of the circle', async () => {
    // A disc emitter that bursts ten particles at a time. With one particle
    // to each tenth of the disc, the ten never pile onto one side and read as
    // shafts around the chest rather than one overlapping clump.
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get('Effects/scene/build/other_bank.beff');
    expect(entry, 'other_bank.beff is in res.bin').toBeTruthy();

    const data = await buildEffect(
      { resolveTexture: async () => null } as never,
      'Effects/scene/build/other_bank.beff',
      readBeff(await pack.read(entry!), 'other_bank.beff'),
    );

    const instance = new EffectInstance(data, () => new THREE.MeshBasicMaterial());
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 2, 10);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld(true);
    for (let f = 0; f < 100; f++) instance.update(1 / 30, camera);

    const mesh = instance.object.children[0] as THREE.InstancedMesh;
    expect(mesh.count).toBe(10);

    const m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const bearings: number[] = [];
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m);
      bearings.push((Math.atan2(pos.z, pos.x) * 180) / Math.PI);
    }
    // Where the tenths start depends on how the emitter's node is turned.
    // If some start puts one shaft in every tenth, so does the bearing of
    // one of the shafts, so those are the only starts worth trying.
    const oneEach = (start: number): boolean =>
      new Set(bearings.map(b => Math.floor(((((b - start) % 360) + 360) % 360) / 36 + 1e-9)))
        .size === 10;
    expect(bearings.some(oneEach)).toBe(true);
  }, 120_000);
});

describe.skipIf(!RES)('scenery that animates itself', () => {
  /**
   * Node-animated models (blades, wheels, lids, wings; 47 of 99 effect
   * models) must not move when the animated node is left live: rebuilt
   * chain times baked vertices equals the fully baked mesh.
   */
  it('leaves the animated node live without moving the geometry', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const path = 'model/scene/build/human/building_windmill.bdae';
    const entry = pack.get(path);
    expect(entry, 'the windmill is in res.bin').toBeTruthy();

    const { payload } = await unwrapBdae(await pack.read(entry!));
    const doc = new Bdae(payload);

    // The animation targets a node by name, and that is the node left unbaked.
    const animated = doc.animatedNodeKeys();
    expect([...animated]).toContain('windmill-node');

    const splits = doc.placementSplits();
    const chained = [...splits.values()].flat().filter(p => p.chain);
    expect(chained.length, 'at least one mesh hangs off the animated node').toBeGreaterThan(0);
    for (const p of chained) {
      expect(p.chain!.some(n => n.animated && n.key === 'windmill-node')).toBe(true);
    }

    // Folding the whole rebuilt chain must reproduce the baked placement, or
    // the geometry has moved.
    for (const p of chained) {
      let composed = p.chain![0].local;
      for (let i = 1; i < p.chain!.length; i++) composed = mul3x4(composed, p.chain![i].local);
      for (let i = 0; i < 12; i++) expect(composed[i]).toBeCloseTo(p.world[i], 4);
    }

    // And the clip really is readable as node tracks.
    const clip = toNodeAnimation(doc.animations(), path);
    expect(clip, 'the windmill ships a node clip').toBeTruthy();
    expect(clip!.tracks.length).toBeGreaterThan(0);
    expect(clip!.tracks.every(t => t.bone === 'windmill-node')).toBe(true);
    expect(clip!.tracks.some(t => t.property === 'quaternion')).toBe(true);
    expect(clip!.duration).toBeGreaterThan(0);
  }, 120_000);

  it('builds a live object the mixer can turn', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const path = 'model/scene/build/human/building_windmill.bdae';
    const { payload } = await unwrapBdae(await pack.read(pack.get(path)!));
    const doc = new Bdae(payload);
    const model = toModelData(doc, path, () => true);

    expect(model.nodeClip, 'the clip travels with the model').toBeTruthy();
    expect(model.meshes.some(m => m.chain?.some(n => n.key === 'windmill-node'))).toBe(true);

    const built = buildModel(model, new MaterialCache({ texture: async () => null }));
    const live = built.object.getObjectByName('windmill-node');
    expect(live, 'an object exists for the clip to bind to').toBeTruthy();

    // Drive it, and check it actually moved. Binding silently does nothing if
    // the track path does not match an object, which is the failure this is
    // here to catch.
    const clip = toThreeClip(model.nodeClip!);
    const mixer = new THREE.AnimationMixer(built.object);
    mixer.clipAction(clip).play();

    built.object.updateMatrixWorld(true);
    const before = live!.quaternion.clone();
    mixer.update(clip.duration / 4);
    built.object.updateMatrixWorld(true);
    expect(live!.quaternion.angleTo(before)).toBeGreaterThan(0.01);
  }, 120_000);
});

describe.skipIf(!RES)('the ground the screens before the world stand on', () => {
  /** Every selection-ground piece decodes with geometry; empty groups would look like a scene that never loaded. */
  it('reads and builds every piece of it', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const pieces = [
      'model/scene/build/human/human_selection.bdae',
      'model/scene/build/human/human_selection01.bdae',
      'model/scene/build/human/human_selection_stone01.bdae',
      'model/scene/nature/humanselection/humanselection_tree01.bdae',
      'model/scene/nature/humanselection/human_grass01.bdae',
      'model/scene/nature/humanselection/human_grass03.bdae',
      'model/scene/nature/humanselection/human_grass05.bdae',
      'model/scene/nature/humanselection/human_grass07.bdae',
      'model/scene/sky/general_sky/humanselection_sky.bdae',
      'model/scene/sky/general_sky/humanselection_sky_hill.bdae',
    ];

    const materials = new MaterialCache({ texture: async () => null });
    for (const path of pieces) {
      const entry = pack.get(path);
      expect(entry, `${path} is in res.bin`).toBeTruthy();
      const { payload } = await unwrapBdae(await pack.read(entry!));
      const model = toModelData(new Bdae(payload), path, () => true);
      expect(model.meshes.length, `${path} has meshes`).toBeGreaterThan(0);

      const built = buildModel(model, materials);
      let drawn = 0;
      built.object.traverse(node => {
        if ((node as THREE.Mesh).isMesh) drawn++;
      });
      expect(drawn, `${path} builds something to draw`).toBeGreaterThan(0);
    }
  }, 120_000);
});

/**
 * The morph-controller flags, against the user's files.
 *
 * Every number here is read off the shipped data. The shape of the thing:
 *
 *  - a morph controller lives in the *mesh-skin table*, told apart from a skin
 *    only by its `-morpher` name suffix, and carries three parallel arrays —
 *    target meshes by name, the same by mesh-table index, and a resting weight
 *    each;
 *  - the blend weight is animation channel **type 14**, naming the controller
 *    rather than any node, with the target index in the low byte of the
 *    channel's fourth word (a node channel leaves that byte 0xff);
 *  - a target is a whole *absolute* pose of the base mesh, same vertex count,
 *    same order — so the blend is COLLADA `NORMALIZED`, which is exactly
 *    Three's `morphTargetsRelative = false`.
 */
describe.skipIf(!RES)('morph-target flags, in the user files', () => {
  const FLAG_01 = 'model/scene/build/main_city/maincity_flag_01.bdae';
  const FLAG_03 = 'model/scene/build/main_city/maincity_flag_03.bdae';

  async function read(path: string): Promise<Bdae> {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get(path);
    expect(entry, `${path} in res.bin`).toBeTruthy();
    const { payload } = await unwrapBdae(await pack.read(entry!));
    return new Bdae(payload);
  }

  it('reads the controller record out of the mesh-skin table', async () => {
    const doc = await read(FLAG_01);
    const morphers = doc.morphers();
    expect(morphers.length).toBe(1);
    const [m] = morphers;
    expect(m.name).toBe('Plane001-mesh-morpher');
    // The source URL's leading '#' is stripped, so it matches a mesh name.
    expect(m.source).toBe('Plane001-mesh');
    expect(m.targets).toEqual(['Plane002-mesh', 'Plane003-mesh']);
    // The same targets again, as indices into the mesh table.
    expect(m.indices).toEqual([1, 2]);
    // Resting weights: this flag opens fully on its *second* blend shape, not
    // on the base pose. Starting both at zero would show a pose the flag
    // never rests in.
    expect(m.weights).toEqual([0, 1]);

    // A morpher is not a skin, and must not be read as one — read that way it
    // produces 69 bind poses out of the file header.
    expect(Object.keys(doc.allSkins())).toEqual([]);
    expect(isSkinned(toSkeletonData(doc, FLAG_01))).toBe(false);
  }, 120_000);

  it('gives the drawn mesh its blend shapes, in its own space', async () => {
    const doc = await read(FLAG_01);
    const meshes = doc.meshes(true);
    // Unchanged: the targets are still not drawn as geometry of their own.
    expect(meshes.map(m => m.name)).toEqual(['Plane001-mesh']);

    const mesh = meshes[0];
    expect(mesh.morph?.controller).toBe('Plane001-mesh-morpher');
    const targets = mesh.morph!.targets;
    expect(targets.map(t => t.name)).toEqual(['Plane002-mesh', 'Plane003-mesh']);
    expect(targets.map(t => t.weight)).toEqual([0, 1]);

    // Same vertex count and order as the base — a morph is a per-vertex
    // correspondence, and there is nothing to blend without one.
    for (const t of targets) {
      expect(t.positions.length).toBe(mesh.positions!.length);
    }

    // And in the base's space, not the exporter's. Raw, this model's targets
    // are 12.5x oversize on a Z-up axis; if the transform were skipped the
    // deltas would dwarf the mesh instead of nudging it.
    const extent = (a: Float32Array, c: number): number => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = c; i < a.length; i += 3) {
        lo = Math.min(lo, a[i]);
        hi = Math.max(hi, a[i]);
      }
      return hi - lo;
    };
    const width = extent(mesh.positions!, 0);
    for (const t of targets) {
      // The cloth lifts; it does not change how wide the flag is.
      expect(extent(t.positions, 0)).toBeCloseTo(width, 3);
      let worst = 0;
      for (let i = 0; i < t.positions.length; i += 3) {
        worst = Math.max(
          worst,
          Math.hypot(
            t.positions[i] - mesh.positions![i],
            t.positions[i + 1] - mesh.positions![i + 1],
            t.positions[i + 2] - mesh.positions![i + 2],
          ),
        );
      }
      // A sway, not a jump: every vertex moves, but less than the mesh is wide.
      expect(worst).toBeGreaterThan(0);
      expect(worst).toBeLessThan(width);
    }
  }, 120_000);

  it('turns the weight channels into morph tracks, by member not by order', async () => {
    const doc = await read(FLAG_03);
    const model = toModelData(doc, FLAG_03, () => true);
    const clip = model.nodeClip;
    expect(clip, 'flag_03 ships a morph clip').toBeTruthy();

    const morph = clip!.tracks.filter(t => t.property === 'morphInfluence');
    expect(morph.length).toBe(4);
    expect(morph.every(t => t.bone === 'Plane001-mesh')).toBe(true);

    // Five blend shapes, four curves. The clips are named `-weights`,
    // `-weights1`, `-weights2`, `-weights3`, but the members they drive are
    // 0, 1, 2 and *4* — Plane012 is never animated. Taking the clips in order
    // would point the last curve at the wrong pose.
    expect(morph.map(t => t.morphIndex).sort((a, b) => a! - b!)).toEqual([0, 1, 2, 4]);
    expect(doc.meshes(true)[1].morph!.targets.length).toBe(5);

    // Weights, and one key per value — not a vector track read as scalars.
    for (const t of morph) {
      expect(t.values.length).toBe(t.times.length);
      for (const v of t.values) expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(clip!.duration).toBeGreaterThan(1);
  }, 120_000);

  it('builds a mesh whose blend weights a real mixer moves', async () => {
    const doc = await read(FLAG_01);
    const model = toModelData(doc, FLAG_01, () => true);
    const built = buildModel(model, new MaterialCache({ texture: async () => null }));

    const mesh = built.object.getObjectByName('Plane001-mesh') as THREE.Mesh;
    expect(mesh, 'the flag mesh is in the built object').toBeTruthy();
    expect(mesh.geometry.morphAttributes.position?.length).toBe(2);
    // Absolute poses, not deltas — Three then evaluates
    // `base + sum w*(target - base)` over them.
    expect(mesh.geometry.morphTargetsRelative).toBe(false);
    expect(mesh.morphTargetInfluences).toEqual([0, 1]);
    expect(mesh.morphTargetDictionary).toEqual({ 'Plane002-mesh': 0, 'Plane003-mesh': 1 });

    // Bounds cover the swing, or the flag pops out at the edge of the screen.
    const rest = new THREE.Box3().setFromBufferAttribute(
      mesh.geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    const grown = mesh.geometry.boundingBox!;
    expect(grown.containsBox(rest)).toBe(true);
    expect(grown.equals(rest), 'the box covers more than the resting pose').toBe(false);

    // Now drive it. Binding is silent when the path does not resolve, which is
    // the whole failure this is here to catch.
    const clip = toThreeClip(model.nodeClip!);
    expect(clip.tracks.map(t => t.name)).toEqual([
      'Plane001-mesh.morphTargetInfluences[0]',
      'Plane001-mesh.morphTargetInfluences[1]',
    ]);
    const mixer = new THREE.AnimationMixer(built.object);
    mixer.clipAction(clip).play();
    built.object.updateMatrixWorld(true);

    const seen: number[][] = [];
    for (let i = 0; i < 8; i++) {
      mixer.update(clip.duration / 8);
      seen.push([...mesh.morphTargetInfluences!]);
    }
    const first = seen[0][0];
    expect(
      seen.some(w => Math.abs(w[0] - first) > 0.05),
      'the first blend weight actually moves',
    ).toBe(true);
    // In range the whole way: the curves run 0..0.8 and 1..0.
    for (const w of seen) {
      for (const v of w) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  }, 120_000);

  it('leaves every morph model in res.bin readable, and none half-read', async () => {
    /*
     * A survey of every morph model (27 in 2.2.0's res.bin), so a reader
     * change that drops controllers, mismatches vertex counts or loses weight
     * channels fails here.
     */
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    let models = 0;
    let controllers = 0;
    let animated = 0;
    for (const entry of pack.entries) {
      if (!entry.name.toLowerCase().endsWith('.bdae')) continue;
      let doc: Bdae;
      try {
        const { payload } = await unwrapBdae(await pack.read(entry));
        doc = new Bdae(payload);
      } catch {
        continue;
      }
      const morphers = doc.morphers();
      if (morphers.length === 0) continue;
      models++;
      controllers += morphers.length;

      for (const m of morphers) {
        // The three arrays are parallel by construction.
        expect(m.targets.length).toBe(m.indices.length);
        expect(m.targets.length).toBe(m.weights.length);
        expect(m.source).not.toBe('');
        expect(m.source.startsWith('#')).toBe(false);
      }

      // Every target the controller names has to survive into the mesh it
      // deforms — same count, same vertex count — or nothing can blend.
      const byName = new Map(doc.meshes(true).map(mesh => [mesh.name, mesh]));
      for (const m of morphers) {
        const mesh = byName.get(m.source);
        if (!mesh) continue;
        expect(mesh.morph?.targets.length, `${entry.name} ${m.name}`).toBe(m.targets.length);
        for (const t of mesh.morph!.targets) {
          expect(t.positions.length).toBe(mesh.positions!.length);
        }
      }

      const weights = doc
        .animations()
        .flatMap(c => c.channels)
        .filter(c => c.type === 14);
      if (weights.length === 0) continue;
      animated++;
      for (const c of weights) {
        // A weight channel names its controller and its member; a node channel
        // leaves the member byte at 0xff, which reads back as null.
        expect(
          morphers.some(m => m.name === c.target),
          `${entry.name}: ${c.target}`,
        ).toBe(true);
        expect(c.member).not.toBeNull();
      }
    }

    const pinned = pinnedFor(pack.length, {
      '2.2.0': [27, 46, 25],
      '1.1.4': [24, 43, 22],
    });
    if (pinned) expect([models, controllers, animated]).toEqual(pinned);
    // A controller with no curve on it holds its resting weights, so a model
    // can ship one and correctly stay still: `animated` is below `models`.
  }, 600_000);
});

describe.skipIf(!TABLES)('spell visuals, in the user tables', () => {
  /** The three spell-visual tables; a wrong fixed column yields plausible rubbish, not an error. */
  const load = async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    return WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
  };

  it('names a visual for the loot glow, and every action clip, in the user tables', async () => {
    const tables = await load();
    expect(tables.visualWithEffect(LOOT_GLOW_EFFECT)).not.toBeNull();
    const clips = new Set(
      [...tables.keyedRows('c_animationdata').keys()].map(id => tables.animationName(id)),
    );
    for (const clip of ACTION_CLIPS) expect(clips.has(clip)).toBe(true);
  });

  it('resolves a visual into phases, particle files and a missile', async () => {
    const tables = await load();

    const visuals = tables.keyedRows('c_spellvisual');
    expect(visuals.size).toBeGreaterThan(100);

    let withMissile = 0;
    let withStates = 0;
    let effects = 0;
    const wrongExtension: string[] = [];

    for (const id of visuals.keys()) {
      const visual = tables.spellVisual(id);
      expect(visual).not.toBeNull();
      // Seven phases, always, whether the row names them or not.
      expect(Object.keys(visual!.phases)).toHaveLength(7);

      if (visual!.missile) {
        withMissile++;
        // Column 8 is the missile and column 9 the weapon streak. Reading the
        // wrong one produces an effect id in the millions, which resolves to
        // nothing - so a pathname coming back at all is the check.
        expect(visual!.missile.pathname.length).toBeGreaterThan(0);
        if (!visual!.missile.pathname.toLowerCase().endsWith('.beff')) {
          wrongExtension.push(visual!.missile.pathname);
        }
        // Zero would fire nothing; the reader counts it as one.
        expect(visual!.missile.count).toBeGreaterThanOrEqual(1);
      }

      for (const state of Object.values(visual!.phases)) {
        if (!state) continue;
        withStates++;
        for (const effect of state.effects) {
          effects++;
          if (!effect.pathname.toLowerCase().endsWith('.beff')) {
            wrongExtension.push(effect.pathname);
          }
          // Every particle file in a phase sits somewhere on the body.
          expect(effect.anchor).not.toBeNull();
          // A percentage in the table, a multiplier here. Nothing in the build
          // is authored at more than a few times size.
          expect(effect.scale).toBeGreaterThan(0);
          expect(effect.scale).toBeLessThan(20);
        }
      }
    }

    // The build really does ship all three, so a chain that resolved nothing
    // would be a reader fault rather than a thin table.
    expect(withMissile).toBeGreaterThan(50);
    expect(withStates).toBeGreaterThan(200);
    expect(effects).toBeGreaterThan(200);
    expect(wrongExtension).toEqual([]);
  }, 60_000);

  it('trails every projectile whose own file leaves emitters behind it in flight, in every build', async () => {
    const skipped: string[] = [];
    for (const tablesPath of allPacks('tables.bin')) {
      const resPath = join(dirname(tablesPath), 'res.bin');
      if (!existsSync(resPath)) {
        skipped.push(`${tablesPath} (no sibling res.bin to identify build)`);
        continue;
      }
      const res = await PackReader.open(await fileSource(resPath), 'res.bin');
      if (!buildFor(res.length)) {
        skipped.push(unsupportedBuild(tablesPath, res.length));
        continue;
      }
      const tablePack = await PackReader.open(await fileSource(tablesPath), 'tables.bin');
      const tables = await WorldTables.load(async entry => {
        const found = tablePack.get(entry);
        return found ? tablePack.read(found) : null;
      });

      const counts = { missiles: 0, unreadable: 0, ribbon: 0, particlesOnly: 0, none: 0 };
      for (const id of tables.keyedRows('c_spellvisual').keys()) {
        const missile = tables.spellVisual(id)?.missile;
        if (!missile) continue;
        counts.missiles++;
        const entry = res.get(missile.pathname);
        if (!entry) {
          counts.unreadable++;
          continue;
        }
        const data = await buildEffect(
          { resolveTexture: async () => null } as never,
          missile.pathname,
          readBeff(await res.read(entry), missile.pathname),
        );
        // What stays in the world behind the effect as it flies.
        const left: EffectEmitter[] = [];
        const walk = (def: EffectEmitter): void => {
          if (def.shape !== 'carrier' && !particlesFollow(def, true)) left.push(def);
          def.children.forEach(walk);
        };
        data.emitters.forEach(walk);
        const ribbon = (def: EffectEmitter) =>
          def.particle.shape === 'ribbon' || def.particle.shape === 'facingRibbon';
        if (left.some(ribbon)) counts.ribbon++;
        else if (left.length > 0) counts.particlesOnly++;
        else counts.none++;
      }

      // Most projectiles trail something; the ones that trail nothing carry
      // their whole look with them (a streak drawn on the arrow, a thrown model).
      expect(counts.ribbon + counts.particlesOnly, tablesPath).toBeGreaterThan(counts.none);
      const pinned = pinnedFor(res.entries.length, {
        '2.2.0': { missiles: 82, unreadable: 0, ribbon: 37, particlesOnly: 32, none: 13 },
        '1.1.4': { missiles: 71, unreadable: 2, ribbon: 31, particlesOnly: 27, none: 11 },
      });
      if (pinned) expect(counts, tablesPath).toEqual(pinned);
    }
    if (skipped.length > 0) {
      console.warn(`[realPacks] skipped unsupported tables.bin builds: ${skipped.join(', ')}`);
    }
  }, 120_000);

  it('reads the lasting phase from its own column, not the impact phase', async () => {
    const tables = await load();

    // The phases are seven consecutive columns, so an off-by-one is
    // invisible except that spells draw the wrong thing: shields come out as
    // impact sparks. Somewhere in the build the two must genuinely differ.
    let differ = 0;
    for (const id of tables.keyedRows('c_spellvisual').keys()) {
      const visual = tables.spellVisual(id);
      const hit = visual?.phases.impact;
      const aura = visual?.phases.lasting;
      if (hit && aura && hit !== aura) differ++;
    }
    expect(differ).toBeGreaterThan(0);
  }, 60_000);

  it('streaks every streaked visual when it is released', async () => {
    const tables = await load();

    // A release always plans something, even with no release row to show,
    // so the streak a visual names is never left unshown.
    let streaked = 0;
    for (const id of tables.keyedRows('c_spellvisual').keys()) {
      const visual = tables.spellVisual(id)!;
      if (!visual.weaponStreak) continue;
      streaked++;
      for (const instant of [false, true]) {
        expect(planFor(visual, 'release', instant)?.streak, `visual ${id}`).toBe(
          visual.weaponStreak,
        );
      }
    }
    expect(streaked).toBeGreaterThan(10);
  }, 60_000);

  it('holds bursts and dropped files where the placement names say', async () => {
    const tables = await load();

    // Burst files are impacts, so most sit in the impact phase; dropped files
    // include every area-anchored file placed once in the world.
    const bursts = { impact: 0, all: 0 };
    let areaFiles = 0;
    let areaDropped = 0;
    for (const id of tables.keyedRows('c_spellvisual').keys()) {
      const { phases } = tables.spellVisual(id)!;
      for (const [phase, data] of Object.entries(phases)) {
        for (const effect of data?.effects ?? []) {
          if (effect.placement === 'burst') {
            bursts.all++;
            if (phase === 'impact') bursts.impact++;
          }
          if (effect.anchor === 'area') {
            areaFiles++;
            if (effect.placement === 'drop') areaDropped++;
          }
        }
      }
    }
    expect(bursts.impact / bursts.all).toBeGreaterThan(0.5);
    expect(areaDropped / areaFiles).toBeGreaterThan(0.5);
  }, 60_000);

  it('names caster animations that c_animationdata actually has', async () => {
    const tables = await load();

    // `casterClipId` is a `c_animationdata` id handed straight to the state
    // machine. If it were really an index into a small named set of caster
    // animations, the ids would all be under 14 and almost none of them
    // would resolve.
    let named = 0;
    let resolved = 0;
    for (const id of tables.keyedRows('c_spellvisual').keys()) {
      for (const state of Object.values(tables.spellVisual(id)?.phases ?? {})) {
        if (!state || !state.casterClipId) continue;
        named++;
        if (state.casterClip) resolved++;
      }
    }
    expect(named).toBeGreaterThan(100);
    expect(resolved / named).toBeGreaterThan(0.95);
  }, 60_000);

  it('names a spell through spell_new column 5, not the spell id', async () => {
    /*
     * The name string id is column 5 (short, capitalised, unpunctuated for
     * 1196/1211 castables; column 7 is the description). Spell ids double as
     * string ids for only 3700/6942 spells.
     */
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await load();
    const entry = pack.get('tables/String_Spell_en.tbl');
    if (!entry) return;
    const strings = tables.setStrings('String_Spell_en', new FTable(await pack.read(entry)));
    const spells = tables.keyedRows('spell_new');
    let castable = 0;
    let namedViaColumn5 = 0;
    for (const id of spells.keys()) {
      if (!tables.spellCastable(id)) continue;
      castable++;
      const nameId = tables.spellNameId(id);
      const text = nameId ? strings.get(nameId) : null;
      if (text && text.length <= 32 && /^[A-Z]/.test(text) && !text.includes('.'))
        namedViaColumn5++;
    }
    expect(castable).toBeGreaterThan(100);
    expect(namedViaColumn5 / castable).toBeGreaterThan(0.9);
  }, 60_000);

  it('gives every castable spell a rank, and dedupeRanks collapses a shipped chain to its top one', async () => {
    /*
     * Column 2 is a class's whole ability tree, not one chain; column 6 is the
     * rank, and every rank's column-5 name is the same bare name, so
     * `dedupeRanks` needs only the rank.
     */
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await load();
    const entry = pack.get('tables/String_Spell_en.tbl');
    const strings = tables.setStrings('String_Spell_en', new FTable(await pack.read(entry!)));
    const spells = tables.keyedRows('spell_new');

    let castable = 0;
    let withRank = 0;
    const names = new Map<number, string>();
    const ranks = new Map<number, number>();
    for (const id of spells.keys()) {
      if (!tables.spellCastable(id)) continue;
      castable++;
      const rank = tables.spellRank(id);
      if (rank > 0) {
        withRank++;
        ranks.set(id, rank);
      }
      const nameId = tables.spellNameId(id);
      const name = nameId ? strings.get(nameId) : null;
      if (name) names.set(id, name);
    }
    // Most of the castable table carries a real rank; the rest (companion
    // "-hold" spells, oddities with no series) fall back to rank 1 in
    // `dedupeRanks` rather than being lost.
    expect(withRank / castable).toBeGreaterThan(0.9);

    // One ability's ranks 1-11 from one generation of the data (the ids a
    // live character would actually hold at once): one name for all of them,
    // collapsing to the top rank.
    const chain = [10, 499, 500, 501, 502, 503, 504, 505, 506, 507, 508];
    const chainName = names.get(chain[0]);
    expect(chainName).toBeTruthy();
    expect(chain.every(id => names.get(id) === chainName)).toBe(true);
    expect(chain.map(id => ranks.get(id))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(dedupeRanks(chain, names, ranks)).toEqual([508]);
    // And a name no other castable spell shares is not a chain at all.
    const shared = new Map<string, number>();
    for (const name of names.values()) shared.set(name, (shared.get(name) ?? 0) + 1);
    const alone = [...names].find(([, name]) => shared.get(name) === 1);
    expect(alone, 'a castable spell with a name of its own').toBeTruthy();
    expect(dedupeRanks([...chain, alone![0]], names, ranks)).toEqual([508, alone![0]]);
  }, 60_000);

  it('carries a cast time and a visual id for the spells worth casting', async () => {
    const tables = await load();

    const spells = tables.keyedRows('spell_new');
    expect(spells.size).toBeGreaterThan(1000);

    let castable = 0;
    let withVisual = 0;
    let instant = 0;
    for (const id of spells.keys()) {
      if (!tables.spellCastable(id)) continue;
      castable++;
      if (tables.spellVisualId(id) > 0) withVisual++;
      const time = tables.spellCastingTime(id);
      // Milliseconds, and nothing in the game takes more than a minute.
      expect(time).toBeGreaterThanOrEqual(0);
      expect(time).toBeLessThan(60_000);
      if (time === 0) instant++;
    }

    expect(castable).toBeGreaterThan(100);
    // Nearly everything castable draws something, and the release state a
    // spell gets depends on whether it is instant - so both kinds must exist,
    // or that branch is never taken.
    expect(withVisual / castable).toBeGreaterThan(0.9);
    expect(instant).toBeGreaterThan(0);
    expect(instant).toBeLessThan(castable);
  }, 60_000);

  it('carries a cost, a cooldown and a reach for the spell book card', async () => {
    const tables = await load();
    let cooling = 0;
    let reaching = 0;
    let costing = 0;
    let castable = 0;
    for (const id of tables.keyedRows('spell_new').keys()) {
      if (!tables.spellCastable(id)) continue;
      castable++;
      const { powerCost, cooldownMs, range } = tables.spellStats(id);
      // A spell's cost, in points of its caster's power.
      expect(powerCost).toBeGreaterThanOrEqual(0);
      expect(powerCost).toBeLessThan(10_000);
      if (powerCost > 0) costing++;
      // Milliseconds, and nothing waits longer than a few hours.
      expect(cooldownMs).toBeGreaterThanOrEqual(0);
      expect(cooldownMs).toBeLessThanOrEqual(4 * 3_600_000);
      // World units, and nothing reaches further than a couple of hundred.
      expect(range).toBeGreaterThanOrEqual(0);
      expect(range).toBeLessThan(200);
      if (cooldownMs > 0) cooling++;
      if (range > 0) reaching++;
    }
    // Plenty of spells have each, and plenty have neither.
    // Nearly every castable spell costs something.
    expect(costing / castable).toBeGreaterThan(0.8);
    expect(cooling).toBeGreaterThan(50);
    expect(reaching).toBeGreaterThan(50);
    expect(cooling).toBeLessThan(castable);
    expect(reaching).toBeLessThan(castable);
  }, 60_000);

  it('walks a weapon ability from its spell id to the swing clip it plays', async () => {
    /*
     * The whole chain for spell 5815, with no special case: visual 3, opening
     * phase, animation 98 `combat_special`, suffixed by the held weapon
     * (`combat_special_dagger`).
     */
    const tables = await load();

    const visualId = tables.spellVisualId(5815);
    expect(visualId).toBe(3);

    const visual = tables.spellVisual(visualId);
    // Instant: no wind-up to hold, so the release state is the whole of it.
    expect(visual?.phases.windUp).toBeNull();
    const opening = visual?.phases.opening;
    expect(opening?.casterClipId).toBe(98);
    expect(opening?.casterClip).toBe('combat_special');
    // Whole body: a blow this heavy is not combined over a run.
    expect(opening?.wholeBody).toBe(true);
    // And it throws no particles of its own — the swing is the whole visual.
    expect(opening?.effects).toHaveLength(0);

    expect(
      combatClipName('combat_special', {
        mainhand: 'dagger',
        offhand: 'dagger',
        ranged: 'thrown',
      }),
    ).toBe('combat_special_dagger');
  }, 60_000);

  it('leaves the stealth family with no visual, because the build gives it none', async () => {
    /*
     * A stealth spell plays no animation, and that is not a fault in this
     * client: the shipped rows name no visual for any of the stealth spells,
     * so there is no animation, no particles and no sound to play when one is
     * cast. Pinned so that nobody "fixes" it by inventing a clip.
     */
    const tables = await load();
    for (const sneak of [5813, 5824, 5825, 5826]) {
      expect(tables.spellVisualId(sneak)).toBe(0);
    }
  }, 60_000);
});

describe.skipIf(!TABLES)('zone atmosphere', () => {
  /**
   * 68 of 2.2.0's 361 zones leave all fog fields zero, which would fog
   * everything black; zero means inherit from the nearest zone above.
   */
  it("fills a zone's missing fog from the zones above it", async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const namesEntry = pack.get('tables/String_Zones_en.tbl');
    const names = namesEntry
      ? tables.setStrings('String_Zones_en', new FTable(await pack.read(namesEntry)))
      : new Map<number, string>();
    const zones = tables.zones(names);
    const byId = new Map(zones.map(z => [z.id, z]));

    // A zone that sets its own values keeps them — inheritance must not
    // overwrite. Zone 621 carries real fog and sits under a zone that
    // carries none, so it is the case that would break first.
    const ownFog = zones.find(z => z.id === 621);
    expect(ownFog, 'zone 621 is in the table').toBeTruthy();
    expect(ownFog!.fogNear).toBeGreaterThan(0);
    expect(ownFog!.fogFar).toBeGreaterThan(ownFog!.fogNear);

    // What is left with nothing at all must be only zones with nowhere to
    // inherit from: no parent in the table. Anything else means the walk
    // stopped early.
    const empty = zones.filter(z => z.fogNear === 0 && z.fogFar === 0);
    for (const z of empty) {
      // Every ancestor must be fogless too; one with fog means the walk stopped early.
      for (
        let up = byId.get(z.parentId), hops = 0;
        up && hops < 16;
        up = byId.get(up.parentId), hops++
      ) {
        expect(up.fogNear === 0 && up.fogFar === 0, `zone #${z.id} missed fog from #${up.id}`).toBe(
          true,
        );
      }
    }
    // 68 ship all zeros; only a handful are genuinely rootless.
    expect(empty.length).toBeLessThan(10);

    // And at least one zone really did inherit rather than merely being fine
    // already — otherwise this test would pass with the fallback deleted.
    const inherited = zones.filter(z => {
      const parent = byId.get(z.parentId);
      return parent !== undefined && z.fogNear > 0 && parent.fogNear === z.fogNear;
    });
    expect(inherited.length).toBeGreaterThan(0);
  }, 60_000);
});

describe.skipIf(!TABLES)('the bus network, against the user route table', () => {
  /** Stops no chain of bus legs reaches have no fare, so they are never offered. */
  it('leaves some bus stops off the network entirely', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const legs = tables.busRoutes();
    const stops = tables.teleportStops().filter(stop => stop.type === 0);
    expect(legs.length).toBeGreaterThan(20);

    // Every stop a leg names, in either column. Derived here rather than in
    // src/: the client only ever asks what a fare from *this* stop costs.
    const onNetwork = new Set(legs.flatMap(leg => [leg.from, leg.to]));
    const stranded = stops.filter(stop => !onNetwork.has(stop.id));
    // Ten of 2.2.0's sixty-seven. Some being stranded is the fact the
    // reachability filter exists for; most are not.
    expect(stranded.length).toBeGreaterThan(0);
    expect(stranded.length).toBeLessThan(stops.length / 2);

    // One town's three stops: one is on the network and the other two are
    // not, so only one of them can ever be travelled to.
    const oneTown = [39, 40, 42];
    expect(oneTown.filter(id => onNetwork.has(id)).length).toBe(1);
  }, 60_000);

  it('reaches most of the world from any stop that is on it, by chains of legs', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const legs = tables.busRoutes();
    const onNetwork = [...new Set(legs.flatMap(leg => [leg.from, leg.to]))];

    // One component, not a set of islands: from any stop on the network you
    // can buy a ticket to every other, and the fare is a chain of hops rather
    // than a direct leg for almost all of them.
    const fares = busFaresFrom(legs, onNetwork[0]);
    expect(fares.size).toBe(onNetwork.length - 1);
    // Never negative: a chain that exists always has a fare. Zero is
    // legitimate: the table does ship free legs.
    for (const cost of fares.values()) expect(cost).toBeGreaterThanOrEqual(0);

    // The graph is undirected however the rows are written.
    const other = onNetwork[onNetwork.length - 1];
    expect(busFaresFrom(legs, other).get(onNetwork[0])).toBe(fares.get(other));
  }, 60_000);
});

describe.skipIf(!RES)('the map art, and the padding inside it', () => {
  /**
   * Every area map is 3:2 drawn into the corner of a square texture, with
   * white below it and a strip to the right. Miss that and the picture is a
   * third white, which also puts every marker on it a third out of place.
   */
  it('finds a 3:2 drawing inside every square map texture', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    let checked = 0;
    for (const id of [403, 71, 145, 317, 320, 324, 647]) {
      for (const ref of [`2d_texture/maps/${id}_2x.tga`, `2d_texture/maps/${id}.tga`]) {
        const entry = pack.get(ref);
        if (!entry) continue;
        const { image } = decodeTexture(await pack.read(entry));
        // Square on disk...
        expect(image.width, ref).toBe(image.height);
        const rect = drawnRect(image.width, image.height, (x, y) => {
          const at = (y * image.width + x) * 4;
          return {
            r: image.pixels[at],
            g: image.pixels[at + 1],
            b: image.pixels[at + 2],
            a: image.pixels[at + 3],
          };
        });
        // ...and 3:2 once the padding is off.
        expect(rect.width / rect.height, `${ref} aspect`).toBeCloseTo(1.5, 1);
        expect(rect.height, `${ref} height`).toBeLessThan(image.height);
        expect(rect.left, `${ref} left`).toBe(0);
        expect(rect.top, `${ref} top`).toBe(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(6);
  }, 180_000);

  /**
   * The world drawing sits in the top-left of its square, so the centre of
   * the texture is padding. Any rule that starts from the middle of the image
   * and grows outwards finds nothing here and the map comes up blank.
   */
  it('finds the world drawing, whose own centre is padding', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    for (const ref of ['2d_texture/maps/world.tga', '2d_texture/maps/world_2x.tga']) {
      const { image } = decodeTexture(await pack.read(pack.get(ref)!));
      const rect = drawnRect(image.width, image.height, (x, y) => {
        const at = (y * image.width + x) * 4;
        return {
          r: image.pixels[at],
          g: image.pixels[at + 1],
          b: image.pixels[at + 2],
          a: image.pixels[at + 3],
        };
      });
      expect(rect.left, ref).toBe(0);
      expect(rect.top, ref).toBe(0);
      expect(rect.width / rect.height, `${ref} aspect`).toBeCloseTo(1.5, 2);
      // The middle of the texture really is outside the drawing.
      expect(rect.height, `${ref} height`).toBeLessThan(image.height / 2);
    }
  }, 180_000);
});

describe.skipIf(!RES)('area.cnfg, from the user packs', () => {
  it('names regions the zone table actually has', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get('2d_texture/area.cnfg');
    expect(entry, 'the build ships the world map index').toBeTruthy();

    const links = parseAreaLinks(new TextDecoder().decode(await pack.read(entry!)));

    // Fifteen buttons in 2.2.0, several of them regions this build does not
    // ship — which is exactly why the zeroes are kept rather than filtered.
    expect(links.regions.length).toBeGreaterThan(10);
    expect(links.regions.some(id => id === 0)).toBe(true);

    // The sub-area rows carry both halves: region 403 reaches a town that is
    // a region of its own, with its own map and its own bus stops.
    const arcadian = links.subAreas[403] ?? [];
    expect(arcadian.length).toBeGreaterThan(0);
    for (const link of arcadian) {
      expect(link.topZoneId).toBeGreaterThan(0);
      expect(link.zoneId).toBeGreaterThan(0);
      expect(link.zoneId).not.toBe(link.topZoneId);
    }

    // Every neighbour named is itself a region the file lists, and nothing
    // claims to adjoin itself.
    const known = new Set(links.regions.filter(Boolean));
    for (const [zone, dirs] of Object.entries(links.neighbours)) {
      for (const id of dirs) {
        if (!id) continue;
        expect(known.has(id), `${zone} adjoins unlisted region ${id}`).toBe(true);
        expect(id).not.toBe(Number(zone));
      }
    }
  }, 60_000);

  it('ships the world map picture the region view draws', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const entry = pack.get('2d_texture/maps/world.tga');
    expect(entry).toBeTruthy();

    // Named .tga and actually PowerVR, like most of res.bin.
    const bytes = await pack.read(entry!);
    expect(isPvr(bytes)).toBe(true);
    const { image } = decodeTexture(bytes);
    expect(image.width).toBeGreaterThanOrEqual(1024);
  }, 60_000);
});

describe.skipIf(!TABLES)('the teleport map, against the user zone table', () => {
  async function realZones(): Promise<ReturnType<WorldTables['zones']>> {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const namesEntry = pack.get('tables/String_Zones_en.tbl');
    const names = namesEntry
      ? tables.setStrings('String_Zones_en', new FTable(await pack.read(namesEntry)))
      : new Map<number, string>();
    return tables.zones(names);
  }

  function inside(bounds: readonly number[], at: readonly number[]): boolean {
    return (
      at[0] >= Math.min(bounds[0], bounds[2]) &&
      at[0] <= Math.max(bounds[0], bounds[2]) &&
      at[2] >= Math.min(bounds[1], bounds[3]) &&
      at[2] <= Math.max(bounds[1], bounds[3])
    );
  }

  /** A top zone is priority 1 or 2, not rootless: six rootless 2.2.0 rows are placeholders with nonsense bounds. */
  it('separates the shipped regions from the rootless placeholders', async () => {
    const zones = await realZones();
    const byPriority = zones.filter(z => z.priority === 1 || z.priority === 2);
    const byParent = zones.filter(z => z.parentId <= 0);

    expect(byPriority.length).toBeGreaterThan(20);
    expect(byParent.length).toBeGreaterThan(byPriority.length);
    // Every priority top really is rootless; the extras are the placeholders.
    for (const zone of byPriority) expect(zone.parentId).toBeLessThanOrEqual(0);
  });

  it('gives nearly every bus stop a named zone on exactly one region', async () => {
    const pack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const zones = await realZones();
    // `type` 0 is a bus stop; 1 is a dungeon gate, which the map does not offer.
    const stops = tables.teleportStops().filter(stop => stop.type === 0);
    expect(stops.length).toBeGreaterThan(20);

    let named = 0;
    let homeless = 0;
    for (const stop of stops) {
      const tops = zones.filter(
        zone =>
          zone.mapId === stop.mapId &&
          (zone.priority === 1 || zone.priority === 2) &&
          inside(zone.bounds, stop.position),
      );
      // At most one region claims a stop once priority decides the winner.
      const top = tops.sort((a, b) => a.priority - b.priority).at(-1);
      if (!top) {
        homeless++;
        continue;
      }
      const detail = zones.find(
        zone =>
          zone.parentId === top.id && zone.priority === 13 && inside(zone.bounds, stop.position),
      );
      if (detail) named++;
    }

    // The two with no region at all are filler rows on map 0.
    expect(homeless).toBeLessThanOrEqual(2);
    expect(named / (stops.length - homeless)).toBeGreaterThan(0.9);
  }, 60_000);
});

describe.skipIf(!TABLES || !findPack('city.bin'))(
  'the minimap thumbnails, in the user world packs',
  () => {
    /** `%04d` naming, sign included; thumbnails live in the world pack, invisible to the texture index. */
    function part(value: number): string {
      return value < 0 ? `-${String(-value).padStart(3, '0')}` : String(value).padStart(4, '0');
    }

    it('resolves a tile in the pack that holds its terrain, not in res.bin', async () => {
      const world = await PackReader.open(await fileSource(findPack('city.bin')!), 'city.bin');
      const res = await PackReader.open(await fileSource(RES!), 'res.bin');

      const thumbnails = world.entries
        .filter(entry => !entry.isDir && entry.name.includes('/thumbnails/'))
        .map(entry => entry.name);
      expect(thumbnails.length).toBeGreaterThan(0);

      // Every name is `<x>_<z>.tga` under the world's own folder, and none of
      // them is in the texture packs.
      for (const name of thumbnails) {
        expect(name).toMatch(/^world\/[a-z0-9_]+\/thumbnails\/-?\d{3,4}_-?\d{3,4}(_1)?\.tga$/);
        expect(res.get(name)).toBeUndefined();
      }

      // Negative tiles are written `-001`, not `-0001`: the pack has the former
      // and not the latter, which is what makes padStart on the absolute value
      // the wrong answer.
      expect(thumbnails).toContain(`world/city/thumbnails/${part(-1)}_${part(-1)}.tga`);
      expect(thumbnails).not.toContain('world/city/thumbnails/-0001_-0001.tga');
    }, 60_000);

    it('decodes a tile at the size the minimap composites from', async () => {
      const world = await PackReader.open(await fileSource(findPack('city.bin')!), 'city.bin');
      const entry = world.entries.find(e => !e.isDir && e.name.includes('/thumbnails/'))!;
      const { image } = decodeTexture(await world.read(entry));

      expect(image.width).toBe(THUMB_SIZE);
      expect(image.height).toBe(THUMB_SIZE);
    }, 60_000);
  },
);

describe.skipIf(!RES)('character skin sheets, read from the shipped models', () => {
  /** Characters built from separate limb meshes over one body mesh. */
  const characters = async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const out: Array<{ name: string; doc: Bdae }> = [];
    for (const e of pack.entries) {
      if (!/\/npc\/character\/.+_h\.bdae$/i.test(e.name)) continue;
      const doc = new Bdae((await unwrapBdae(await pack.read(e))).payload);
      if (doc.meshes(false).some(m => /^body_\d+/i.test(m.name))) out.push({ name: e.name, doc });
    }
    return out;
  };

  it('finds every stretch of the figure on every character', async () => {
    const found = await characters();
    expect(found.length).toBeGreaterThan(4);
    for (const { name, doc } of found) {
      const f = footprints(sheetMeshes(doc));
      expect(Object.keys(f).sort(), name).toEqual([
        'foot',
        'forearm',
        'hand',
        'head',
        'shin',
        'skirt',
        'thigh',
        'torso',
      ]);
    }
  }, 60_000);

  it('finds at most a couple of bare-scalp hair styles on each character, never all of them', async () => {
    for (const { name, doc } of await characters()) {
      const styles = doc.meshes(false).filter(m => /^hair_\d+/i.test(m.name)).length;
      const bare = bareScalpStyles(doc.meshes(true));
      expect(styles, name).toBeGreaterThan(4);
      expect(bare.size, name).toBeLessThanOrEqual(2);
    }
  }, 60_000);

  it('lays each region inside the sheet, apart from the ones it must not touch', async () => {
    for (const { name, doc } of await characters()) {
      const f = footprints(sheetMeshes(doc));
      for (const size of [128, 256]) {
        const rect = (covers: Array<keyof typeof f>, hips = false) =>
          regionRect(
            covers.map(c => f[c]),
            size,
            size,
            hips,
          )!;
        const face = rect(['head']);
        const gloves = rect(['forearm', 'hand']);
        const chest = rect(['torso']);
        const boots = rect(['shin', 'foot']);
        const trousers = rect(['thigh', 'shin'], true);
        const robe = rect(['torso', 'skirt']);
        for (const r of [face, gloves, chest, boots, trousers, robe]) {
          expect(r[0], name).toBeGreaterThanOrEqual(0);
          expect(r[1], name).toBeGreaterThanOrEqual(0);
          expect(r[2], name).toBeLessThanOrEqual(size);
          expect(r[3], name).toBeLessThanOrEqual(size);
          expect(r[2] - r[0], name).toBeGreaterThan(0);
          expect(r[3] - r[1], name).toBeGreaterThan(0);
        }
        const overlaps = (a: number[], b: number[]) =>
          a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
        // The chest's sleeves share rows with the gloves, and boots share the
        // shins with trousers; these pairs never meet.
        const apart: Array<[string, number[], number[]]> = [
          ['face/gloves', face, gloves],
          ['face/chest', face, chest],
          ['face/boots', face, boots],
          ['chest/boots', chest, boots],
        ];
        for (const [pair, a, b] of apart) expect(overlaps(a, b), `${name} ${pair}`).toBe(false);
        const inside = (a: number[], b: number[]) =>
          a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
        expect(inside(chest, robe), name).toBe(true);
        expect(inside(rect(['skirt'], true), robe), name).toBe(true);
        // Trousers reach up over the hips, into the chest's region.
        expect(overlaps(trousers, chest), name).toBe(true);
      }
    }
  }, 60_000);
});

describe.skipIf(!RES || !TABLES)('character looks, against the user item tables', () => {
  const MODEL = 'model/npc/character/human/male/human_m_h.bdae';
  const setup = async () => {
    const tablesPack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = tablesPack.get(entry);
      return found ? tablesPack.read(found) : null;
    });
    const res = await PackReader.open(await fileSource(RES!), 'res.bin');
    const doc = new Bdae((await unwrapBdae(await res.read(MODEL))).payload);
    const meshes = doc.meshes(true).map(m => m.name);
    const display = tables.keyedRows('itemdisplayinfo');
    const models = tables.keyedRows('itemmodeldata');
    /** Every armour item of an inventory type that has a display row. */
    const ofType = (inventoryType: number): number[] =>
      [...tables.keyedRows('items').keys()].filter(
        id => display.has(id) && tables.itemFacts(id)?.inventoryType === inventoryType,
      );
    return {
      tables,
      meshes,
      ofType,
      items: (id: number) => display.get(id),
      models: (id: number) => models.get(id),
    };
  };
  const wearing = (slot: 'head' | 'chest' | 'legs' | 'hands' | 'feet', id: number) => {
    const look = lookFrom();
    look.worn[slot] = id;
    return look;
  };

  it('never paints a helmet that is worn as its own mesh', async () => {
    const { ofType, items, models } = await setup();
    let separate = 0;
    for (const id of ofType(1)) {
      const look = wearing('head', id);
      const hung = attachmentsFor(look, items, models).length > 0;
      const painted = bodyLayers(MODEL, look, items).some(l => l.piece === 'head');
      expect(hung && painted, `item ${id}`).toBe(false);
      if (hung) separate++;
    }
    expect(separate).toBeGreaterThan(100);
  }, 60_000);

  it('gives every pair of gauntlets and tall boots a thicker limb mesh of its own', async () => {
    const { ofType, items, meshes } = await setup();
    let outer = 0;
    for (const id of [...ofType(8), ...ofType(7)]) {
      const look = wearing(ofType(8).includes(id) ? 'hands' : 'feet', id);
      const limbs = visibleMeshes(meshes, look, items).visible.filter(n =>
        /^lower(arm|leg)_/.test(n),
      );
      // Gauntlets: hands art on a forearm variant from the outer range up.
      const outerVariant = Number(items(id)?.[1] ?? 0) >= 20;
      const gauntlets =
        outerVariant && bodyLayers(MODEL, look, items).some(l => l.piece === 'hands');
      // A bare forearm and shin, plus the item's own over one of them.
      if (limbs.length > 2 || gauntlets) outer++;
      if (gauntlets)
        expect(
          limbs.filter(n => n.startsWith('lowerarm_')),
          `item ${id}`,
        ).toHaveLength(2);
    }
    expect(outer).toBeGreaterThan(300);
  }, 60_000);

  it('numbers limb meshes no higher than 22 and item model rows above that, so a display number says which it is', async () => {
    const { tables, meshes } = await setup();
    const res = await PackReader.open(await fileSource(RES!), 'res.bin');
    const limbNumbers = new Set<number>();
    for (const entry of res.entries.filter(
      e => !e.isDir && /^model\/npc\/character\/.*\.bdae$/i.test(e.name),
    )) {
      const names =
        entry.name === MODEL
          ? meshes
          : new Bdae((await unwrapBdae(await res.read(entry))).payload)
              .meshes(true)
              .map(m => m.name);
      for (const name of names) {
        const limb = /^lower(?:arm|leg)_(\d+)/i.exec(name);
        if (limb) limbNumbers.add(Number(limb[1]));
      }
    }
    expect(Math.max(...limbNumbers)).toBe(22);
    const models = tables.keyedRows('itemmodeldata');
    expect(Math.min(...models.keys())).toBeGreaterThan(22);
    for (const row of tables.keyedRows('itemdisplayinfo').values()) {
      const n = Number(row[1] ?? 0);
      if (n > 0 && n <= 22) expect(limbNumbers.has(n), `display number ${n}`).toBe(true);
    }
  }, 300_000);

  it('finds long chest pieces and legwear of both kinds', async () => {
    const { ofType, items, meshes } = await setup();
    const worn = new Map<string, number>();
    for (const [slot, type] of [
      ['chest', 5],
      ['legs', 6],
    ] as const) {
      for (const id of ofType(type)) {
        const { longMesh, visible } = visibleMeshes(meshes, wearing(slot, id), items);
        const key = `${slot}:${longMesh ?? 'legs'}`;
        worn.set(key, (worn.get(key) ?? 0) + 1);
        // Legs or a long mesh, never both.
        expect(visible.includes('upperleg_01-mesh'), `item ${id}`).toBe(longMesh === null);
      }
    }
    expect(worn.get('chest:skirt')).toBeGreaterThan(50);
    expect(worn.get('legs:skirt')).toBeGreaterThan(50);
    expect(worn.get('legs:special')).toBeGreaterThan(5);
    expect(worn.get('chest:legs')).toBeGreaterThan(100);
  }, 60_000);
});

describe.skipIf(!RES || !TABLES)('capes, on every body in every build', () => {
  /** Every build on disk whose res.bin has a tables.bin beside it. */
  const builds = allPacks('res.bin')
    .map(res => ({ res, tables: join(dirname(res), 'tables.bin') }))
    .filter(b => existsSync(b.tables));
  /** The item the owner wore and saw nothing of. */
  const COARSE_CLOTH_CAPE = 5714;

  it('hangs a cape off every body that has one to wear, for every back item, and a bare back otherwise', async () => {
    expect(builds.length).toBeGreaterThan(0);
    for (const build of builds) {
      const tablesPack = await PackReader.open(await fileSource(build.tables), 'tables.bin');
      const tables = await WorldTables.load(async entry => {
        const found = tablesPack.get(entry);
        return found ? tablesPack.read(found) : null;
      });
      const res = await PackReader.open(await fileSource(build.res), 'res.bin');
      const display = tables.keyedRows('itemdisplayinfo');
      const items = (id: number) => display.get(id);
      const backItems = [...tables.keyedRows('items').keys()].filter(
        id => tables.itemFacts(id)?.inventoryType === 14,
      );
      expect(backItems, build.res).toContain(COARSE_CLOTH_CAPE);
      // One of each kind of display row, plus the owner's: which cape it
      // names, if any, and in which art.
      const kinds = new Map<string, number>([['owner', COARSE_CLOTH_CAPE]]);
      for (const id of backItems) {
        const row = display.get(id);
        const key = `${row?.[1] ?? '-'}|${row?.[3] ?? ''}`;
        if (!kinds.has(key)) kinds.set(key, id);
      }
      expect(kinds.size, build.res).toBeGreaterThan(2);

      const bodies = res.entries
        .map(e => e.name)
        .filter(n => /^model\/npc\/character\/[^/]+\/(male|female)\/[^/]+_h\.bdae$/i.test(n));
      let caped = 0;
      for (const path of bodies) {
        const doc = new Bdae((await unwrapBdae(await res.read(res.get(path)!))).payload);
        const names = doc.meshes(true).map(m => m.name);
        if (!names.includes('cape_01-mesh')) continue;
        const capes = names.filter(n => /^cape_0[2-9]-mesh$/.test(n));
        const bare = visibleMeshes(names, lookFrom(), items);
        expect(bare.visible, path).toContain('cape_01-mesh');
        for (const cape of capes) expect(bare.visible, path).not.toContain(cape);

        if (capes.length === 0) continue;
        caped++;
        const model = toModelData(doc, path, () => true);
        for (const id of backItems) {
          const look = lookFrom();
          look.worn.back = id;
          const { visible, meshTextures } = visibleMeshes(names, look, items);
          const worn = visible.filter(n => capes.includes(n));
          expect(worn, `${path} item ${id}`).toHaveLength(1);
          expect(visible, `${path} item ${id}`).not.toContain('cape_01-mesh');
          expect(res.has(meshTextures[worn[0]]), `${path} item ${id} art`).toBe(true);
        }
        for (const id of kinds.values()) {
          const look = lookFrom();
          look.worn.back = id;
          const { visible, meshTextures } = visibleMeshes(names, look, items);
          const drawn: Array<{ mesh: string; texture: string | null }> = [];
          const materials = {
            get: (spec: { texture: string | null }) => {
              const material = new THREE.MeshBasicMaterial();
              material.name = spec.texture ?? '';
              return material;
            },
          } as unknown as MaterialCache;
          const built = buildModel(model, materials, {
            skin: 'sheet',
            meshes: visible,
            meshTextures,
            skinReplacesAll: false,
            key: `cape:${id}`,
          });
          built.object.traverse(node => {
            const mesh = node as THREE.Mesh;
            if (!mesh.isMesh || !/^cape_/.test(mesh.name)) return;
            const worn = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const one of worn) drawn.push({ mesh: mesh.name, texture: one.name });
          });
          const cape = Object.keys(meshTextures)[0];
          expect(drawn.length, `${path} item ${id}`).toBeGreaterThan(0);
          expect(
            drawn.every(d => d.mesh === cape && d.texture === meshTextures[cape]),
            `${path} item ${id}`,
          ).toBe(true);
        }
      }
      // Six of the eight playable bodies carry a cape; the elf woman and the
      // undead man have only the bare back.
      expect(caped, build.res).toBe(6);
    }
  }, 120_000);
});

describe.skipIf(RES || TABLES || IPA)('game data', () => {
  it('is not configured, so the real-data checks were skipped', () => {
    // Present so a clean checkout reports "skipped" rather than silently
    // running nothing at all.
    expect(RES).toBeNull();
  });
});

describe.skipIf(!RES)('the interface sprites, found in the user movie', () => {
  it('finds every sprite, on a sheet large enough to cut it from', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const parsed = await parseSwf(await pack.read('ui/IGM.swf'));
    const artOf = new Map(parsed.exports.map(e => [e.id, e.name] as const));
    const film = {
      ...parsed,
      movie: 'IGM',
      edits: [],
      shapes: parsed.shapes.map(shape => ({
        ...shape,
        paths: [],
        fills: shape.fills.map(fill =>
          fill.kind === 'bitmap'
            ? {
                kind: 'bitmap' as const,
                imageId: fill.imageId,
                art: artOf.get(fill.imageId) ?? null,
                matrix: fill.matrix,
                repeating: fill.repeating,
              }
            : { kind: 'unsupported' as const },
        ),
      })),
    } as unknown as UiSkinData;
    for (const name of UI_SPRITE_NAMES) {
      const spec = UI_SPRITES[name];
      const rect = locateSprite(film, spec);
      // Menu icons, coins and the touch stick exist in every build; a surface
      // may be absent from one, which then draws its plain fallback.
      if (!/^(menu|coin|stick)-/.test(name) && !rect) continue;
      expect(rect, name).not.toBeNull();
      const bytes = await pack.read(`ui/${spec.movie}/${spec.sheet}`);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      expect(view.getUint32(0)).toBe(0x89504e47);
      expect(view.getUint32(16), name).toBeGreaterThanOrEqual(rect!.x + rect!.w);
      expect(view.getUint32(20), name).toBeGreaterThanOrEqual(rect!.y + rect!.h);
    }
  });
});

describe.skipIf(!RES)('the GPU programs in res.bin', () => {
  // Bench-only: the game never loads these programs (see docs/PROVENANCE.md).
  // What this pins is the bench adaptor — that our materials bind everything
  // the shipped text uses, so the comparison draws what the build describes.
  /** Uniform names a stage declares and also uses, which the material has to bind. */
  function usedUniforms(adapted: string): string[] {
    const declared = [
      ...adapted.matchAll(/\buniform\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(\w+)\s*;/g),
    ].map(m => m[1]);
    return declared.filter(
      name => (adapted.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length > 1,
    );
  }

  /** Attribute names a stage declares. */
  function attributes(adapted: string): string[] {
    return [
      ...adapted.matchAll(/\battribute\s+(?:(?:lowp|mediump|highp)\s+)?\w+\s+(\w+)\s*;/g),
    ].map(m => m[1]);
  }

  async function source(pack: PackReader, names: { vertex: string; fragment: string }) {
    const text = async (name: string) => {
      const entry = pack.get(name);
      return entry ? new TextDecoder().decode(await pack.read(entry)) : null;
    };
    return { vertex: await text(names.vertex), fragment: await text(names.fragment) };
  }

  it('ships the water programs, and the water material binds everything they use', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    for (const which of ['soft', 'plain'] as const) {
      const material = createWaterMaterial();
      material.uniforms.uSoft.value = which === 'soft' ? 1 : 0;
      material.usePrograms({ [which]: await source(pack, WATER_PROGRAMS[which]) });
      material.bindBump(new THREE.Texture());
      material.bindReflection(new THREE.Texture());
      expect(material.path).toBe(which);
      for (const stage of [material.vertexShader, material.fragmentShader]) {
        for (const name of usedUniforms(stage))
          expect(material.uniforms, name).toHaveProperty(name);
      }
      const built = buildWaterTile({
        tile: [0, 0],
        origin: [0, 0],
        side: 9,
        tileSize: 64,
        heights: new Float32Array(81),
        colours: null,
        visible: [],
        water: new Array(64).fill(1),
        chunkTextures: [],
        baseTexture: null,
        maskTexture: null,
      })!;
      for (const name of attributes(material.vertexShader)) {
        expect(built.geometry.getAttribute(name), name).toBeDefined();
      }
    }
  });

  it('ships the flowing-water program, and the material binds everything it uses', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const material = createWaterfallMaterial(false);
    material.useProgram(await source(pack, WATERFALL_PROGRAM));
    material.uniforms.uHasMap.value = 1;
    expect(material.choosePath()).toBe('loaded');
    for (const stage of [material.vertexShader, material.fragmentShader]) {
      for (const name of usedUniforms(stage)) expect(material.uniforms, name).toHaveProperty(name);
    }
    // Model geometry carries three's names; the program is renamed onto them.
    expect(attributes(material.vertexShader).sort()).toEqual(['position', 'uv']);
  });

  it('ships the ground program, and the material binds everything it uses', async () => {
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const material = createTerrainMaterial();
    material.useProgram(await source(pack, TERRAIN_PROGRAM));
    expect(material.path).toBe('loaded');
    for (const stage of [material.vertexShader, material.fragmentShader]) {
      for (const name of usedUniforms(stage)) expect(material.uniforms, name).toHaveProperty(name);
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, size] of [
      ['position', 3],
      ['normal', 3],
      ['uv', 2],
      ['maskUv', 2],
      ['color', 3],
    ] as const) {
      geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(size * 3), size));
    }
    shareTerrainAttributes(geometry);
    for (const name of attributes(material.vertexShader)) {
      expect(geometry.getAttribute(name), name).toBeDefined();
    }
  });
});

describe.skipIf(!TABLES || !RES)('festival objects the server leaves out, on the user maps', () => {
  /**
   * The server hides spawn-table objects by where they stand, and on the
   * shipped maps some of the map's own scenery stands within reach of one:
   * a railing's origin a hand's width from a festive lamp. Everything the
   * map places must survive every festival object being hidden.
   */
  it('hides festival objects and nothing the map places', async () => {
    const names = ['res.bin', 'tables.bin', 'model_phy.bin', ...WORLD_PACKS].filter(n =>
      findPack(n),
    );
    const files = await Promise.all(
      names.map(async n => new File([await openAsBlob(findPack(n)!)], n)),
    );
    const lib = await Library.mountPacks(files);
    const tables = await WorldTables.load(async entry => {
      const pack = await lib.pack('tables.bin');
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const noQueries = { meshNames: async () => [], attachOffsets: async () => new Map() };

    let scenery = 0;
    let nearHidden = 0;
    let hiddenStatics = 0;
    for (const map of tables.maps()) {
      if (!mapPackName(tables, lib, map.id)) continue;
      const tiles = new Set<string>();
      for (const r of tables.rowsOf('staticobject_spawns')) {
        if (r[2] !== map.id || !tables.staticFestival(r[1] as number)) continue;
        tiles.add(`${Math.floor((r[3] as number) / 64)},${Math.floor((r[5] as number) / 64)}`);
      }
      const spawns = MapSpawns.build(tables, map.id);
      for (const key of tiles) {
        const [tx, tz] = key.split(',').map(Number);
        const data = await buildTile(lib, tables, map.id, tx, tz, spawns, noQueries);
        const hidden = data.placements
          .filter(p => p.kind === 'static' && tables.staticFestival(p.entry))
          .map(p => p.position);
        const world = new World({} as ConstructorParameters<typeof World>[0]);
        world.setHidden(hidden);
        world.addTile(data);

        const mapOwn = data.placements.filter(p => p.entry === 0 && p.kind !== 'creature');
        const kept = [...world.entities.values()].filter(e => e.entry === 0);
        expect(kept.length).toBe(mapOwn.length);
        scenery += mapOwn.length;
        hiddenStatics += hidden.length;
        nearHidden += mapOwn.filter(p =>
          hidden.some(
            h => Math.abs(h[0] - p.position[0]) <= 0.5 && Math.abs(h[2] - p.position[2]) <= 0.5,
          ),
        ).length;
        expect(
          [...world.entities.values()].some(
            e => e.kind === 'static' && tables.staticFestival(e.entry),
          ),
        ).toBe(false);
      }
    }
    expect(hiddenStatics).toBeGreaterThan(0);
    expect(scenery).toBeGreaterThan(0);
    // The case this guards: map scenery that stands on a hidden spot.
    expect(nearHidden).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(!TABLES || !RES || !WORLD_PACKS.some(n => findPack(n)))(
  'ground textures the user maps name but the build lacks',
  () => {
    /**
     * Some chunks name a ground texture that is in none of the packs. The
     * ground material must draw those chunks with the layers that do exist:
     * one left waiting for the missing file draws its base texture alone, a
     * square of the wrong ground the size of a chunk. The program is handed
     * over directly, as the bench does; the game path draws our own program.
     */
    it('draws every chunk whose base exists with the loaded ground program', async () => {
      const names = ['res.bin', 'res_t.bin', 'tables.bin', ...WORLD_PACKS].filter(n => findPack(n));
      const files = await Promise.all(
        names.map(async n => new File([await openAsBlob(findPack(n)!)], n)),
      );
      const lib = await Library.mountPacks(files);
      await lib.warmTextureIndex();
      const tables = await WorldTables.load(async entry => {
        const pack = await lib.pack('tables.bin');
        const found = pack.get(entry);
        return found ? pack.read(found) : null;
      });
      const res = await lib.pack('res.bin');
      const text = async (name: string) => {
        const entry = res.get(name);
        return entry ? new TextDecoder().decode(await res.read(entry)) : null;
      };
      const program = {
        vertex: await text(TERRAIN_PROGRAM.vertex),
        fragment: await text(TERRAIN_PROGRAM.fragment),
      };
      const has = (ref: string) => ref.startsWith('mask:') || lib.resolveTextureSync(ref) !== null;
      const cache = {
        rawTexture: async (ref: string) =>
          has(ref) ? new THREE.Texture({ width: 256, height: 256 } as never) : null,
      } as unknown as MaterialCache;
      const noQueries = { meshNames: async () => [], attachOffsets: async () => new Map() };

      let tilesChecked = 0;
      let missingLayers = 0;
      for (const map of tables.maps()) {
        const packName = mapPackName(tables, lib, map.id);
        if (!packName || tilesChecked >= 20) continue;
        const pack = await lib.pack(packName);
        const stem = packName.replace(/\.bin$/i, '');
        const spawns = MapSpawns.build(tables, map.id);
        for (const entry of pack.entries) {
          if (tilesChecked >= 20) break;
          const tile = /\/terrain\/(-?\d+)_(-?\d+)\.trn$/i.exec(entry.name);
          if (!tile || !entry.name.startsWith(`world/${stem}/`)) continue;
          const doc = parseTrn(await pack.read(entry), false);
          const lacking = doc.chunks.filter(
            c => !c.isHole && c.textures.slice(1).some(i => i >= 0 && !has(doc.textures[i])),
          ).length;
          if (!lacking) continue;
          const data = await buildTile(
            lib,
            tables,
            map.id,
            Number(tile[1]),
            Number(tile[2]),
            spawns,
            noQueries,
          );
          if (!data.terrain) continue;
          const built = buildTerrainTile(data.terrain, cache);
          if (!built) continue;
          await new Promise(done => setTimeout(done, 0));
          missingLayers += lacking;
          tilesChecked++;
          for (const material of built.materials as TerrainMaterial[]) {
            material.useProgram(program);
            const base = material.uniforms.uHasBase.value > 0.5;
            expect(material.path).toBe(base ? 'loaded' : 'fallback');
          }
        }
      }
      expect(missingLayers).toBeGreaterThan(0);
    }, 300_000);
  },
);

describe.skipIf(
  !RES || !WORLD_PACKS.some(n => findPack(n) && findPack(n.replace('.bin', '_layer.bin'))),
)('upper ground layers with nothing to draw, on the user maps', () => {
  /**
   * A chunk can leave an upper layer empty, or name one the build lacks,
   * while its blend mask is non-zero there. The ground program must weigh
   * such a layer at zero rather than blend an unbound slot in as black.
   */
  it('finds such chunks, and the ground program reads every mask sample through the weights', async () => {
    const names = [
      'res.bin',
      'res_t.bin',
      ...WORLD_PACKS,
      ...WORLD_PACKS.map(n => n.replace('.bin', '_layer.bin')),
    ].filter(n => findPack(n));
    const files = await Promise.all(
      names.map(async n => new File([await openAsBlob(findPack(n)!)], n)),
    );
    const lib = await Library.mountPacks(files);
    await lib.warmTextureIndex();

    let affected = 0;
    for (const packName of WORLD_PACKS) {
      const stem = packName.replace('.bin', '');
      if (!lib.hasPack(packName) || !lib.hasPack(`${stem}_layer.bin`)) continue;
      const pack = await lib.pack(packName);
      const layers = await lib.pack(`${stem}_layer.bin`);
      const trns = pack.entries.filter(e => /\/terrain\/-?\d+_-?\d+\.trn$/i.test(e.name));
      const step = Math.max(1, Math.floor(trns.length / 200));
      for (const entry of trns.filter((_, i) => i % step === 0)) {
        const [, tx, tz] = /(-?\d+)_(-?\d+)\.trn$/i.exec(entry.name)!.map(Number);
        const doc = parseTrn(await pack.read(entry), false);
        const masks = await Promise.all(
          [0, 1].map(async l => {
            const found = layers.get(layerName(stem, tx, tz, l));
            return found ? layers.read(found) : null;
          }),
        );
        for (const c of doc.chunks) {
          if (c.isHole) continue;
          const [cx, cz] = c.chunk;
          for (const slot of [1, 2]) {
            const i = c.textures[slot];
            if (i >= 0 && lib.resolveTextureSync(doc.textures[i])) continue;
            const mask = masks[slot - 1];
            if (!mask) continue;
            let lit = false;
            for (let r = 0; r < 32 && !lit; r++) {
              for (let q = 0; q < 32; q++) {
                if (mask[(cz * 32 + r) * 256 + cx * 32 + q]) {
                  lit = true;
                  break;
                }
              }
            }
            if (lit) affected++;
          }
        }
      }
    }
    expect(affected).toBeGreaterThan(0);

    const res = await lib.pack('res.bin');
    const fragment = new TextDecoder().decode(await res.read(res.get(TERRAIN_PROGRAM.fragment)!));
    const weighed = weighMaskReads(fragment);
    expect(weighed).not.toMatch(/texture2D\s*\(\s*texture4\b/);
    expect(weighed).toMatch(/groundMask\s*\(\s*texture4\b/);
    const material = createTerrainMaterial();
    material.useProgram({
      vertex: new TextDecoder().decode(await res.read(res.get(TERRAIN_PROGRAM.vertex)!)),
      fragment,
    });
    expect(material.fragmentShader).toContain('m.g *= uHas2;');
  }, 300_000);
});

describe.skipIf(!RES || !TABLES)('a building shell and the interior placed with it', () => {
  /** A building that ships an interior never stands on a tile without it. */
  it('places the interior with the building, at the same spot', async () => {
    const names = ['res.bin', 'tables.bin', ...WORLD_PACKS].filter(n => findPack(n));
    const files = await Promise.all(
      names.map(async n => new File([await openAsBlob(findPack(n)!)], n)),
    );
    const lib = await Library.mountPacks(files);
    const tables = await WorldTables.load(async entry => {
      const pack = await lib.pack('tables.bin');
      const found = pack.get(entry);
      return found ? pack.read(found) : null;
    });
    const noQueries = { meshNames: async () => [], attachOffsets: async () => new Map() };
    const shells: string[] = [];
    let unaccompanied = 0;
    for (const map of tables.maps()) {
      if (!mapPackName(tables, lib, map.id)) continue;
      const spawns = MapSpawns.build(tables, map.id);
      for (let tx = -1; tx <= 1; tx++)
        for (let tz = -1; tz <= 1; tz++) {
          const data = await buildTile(lib, tables, map.id, tx, tz, spawns, noQueries);
          for (const p of data.placements) {
            const inside = interiorOf(p.model);
            if (
              !inside ||
              !data.placements.some(q => q.model.toLowerCase() === inside.toLowerCase())
            )
              continue;
            const twin = data.placements.filter(
              q =>
                q.model.toLowerCase() === inside.toLowerCase() &&
                q.position.every((v, k) => v === p.position[k]) &&
                q.rotation.every((v, k) => v === p.rotation[k]),
            );
            if (twin.length === 1) shells.push(p.model);
            else unaccompanied++;
          }
        }
    }
    expect(shells.length).toBeGreaterThan(0);
    expect(shells.some(m => m.toLowerCase().endsWith('building_inn.bdae'))).toBe(true);
    expect(unaccompanied).toBe(0);
  }, 300_000);

  /** The inn's shell drops the faces its interior redraws in the same plane; the interior is untouched. */
  it('hands out the shell without the faces its interior draws', async () => {
    const buildingPath = 'model/scene/build/human/building_inn.bdae';
    const interiorPath = interiorOf(buildingPath)!;
    const pack = await PackReader.open(await fileSource(RES!), 'res.bin');
    const raw = async (path: string) => {
      const { payload } = await unwrapBdae(await pack.read(pack.get(path)!));
      return toModelData(new Bdae(payload), path, () => true);
    };
    const faces = (m: { meshes: { indices: ArrayLike<number> }[] }) =>
      m.meshes.reduce((n, mesh) => n + mesh.indices.length / 3, 0);

    const provider = new PackAssetProvider();
    const names = ['res.bin', 'res_t.bin'].filter(n => findPack(n));
    const files = await Promise.all(
      names.map(async n => new File([await openAsBlob(findPack(n)!)], n)),
    );
    await provider.useSource(provider.offer(files).id);
    const shell = await provider.load({ kind: 'model', path: buildingPath });
    const interior = await provider.load({ kind: 'model', path: interiorPath });

    const shipped = await raw(buildingPath);
    expect(faces(shell)).toBeLessThan(faces(shipped));
    // The outside is all still there: every face gone was one the interior covers.
    expect(faces(withoutSharedFaces(shipped, interior))).toBe(faces(shell));
    expect(withoutSharedFaces(shell, interior)).toBe(shell);
    expect(faces(interior)).toBe(faces(await raw(interiorPath)));
  }, 120_000);
});

describe.skipIf(!SOUND)('sound.bin, from the user packs', () => {
  it('decodes every sound it ships, as sound rather than noise', async () => {
    const pack = await PackReader.open(await fileSource(SOUND!), 'sound.bin');
    const files = pack.entries.filter(e => !e.isDir && e.name.toLowerCase().endsWith('.wav'));
    expect(files.length).toBeGreaterThan(500);

    // Recorded sound changes a little from one sample to the next. A decoder
    // reading nibbles in the wrong order, the wrong channel's bytes or the
    // wrong step table turns it into noise, where the step between
    // neighbours is as large as the signal itself (a ratio near 1 or more).
    // One squeal can come close to that honestly, so the ratio is judged per
    // coding, by its median. Near-silent files say nothing and are left out.
    const ratios = new Map<number, number[]>();
    for (const entry of files) {
      const bytes = await pack.read(entry);
      const pcm = decodeWav(bytes);
      expect(pcm.channels.length, entry.name).toBeGreaterThanOrEqual(1);
      expect(pcm.channels.length, entry.name).toBeLessThanOrEqual(2);
      expect(pcm.sampleRate, entry.name).toBeGreaterThanOrEqual(8000);
      const samples = pcm.channels[0];
      expect(samples.length, entry.name).toBeGreaterThan(0);

      let level = 0;
      let step = 0;
      let peak = 0;
      for (let i = 1; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]));
        level += Math.abs(samples[i]);
        step += Math.abs(samples[i] - samples[i - 1]);
      }
      expect(peak, entry.name).toBeLessThanOrEqual(1);
      if (level / samples.length < 0.01) continue;
      // The format tag, where every shipped file keeps it: straight after
      // the 20 bytes of RIFF header and fmt chunk header.
      const coding = bytes[20] | (bytes[21] << 8);
      const list = ratios.get(coding) ?? [];
      list.push(step / level);
      ratios.set(coding, list);
    }
    // Linear PCM, IMA ADPCM and Microsoft ADPCM.
    expect([...ratios.keys()].sort((a, b) => a - b)).toEqual([1, 2, 0x11]);
    for (const [coding, list] of ratios) {
      list.sort((a, b) => a - b);
      expect(list[list.length >> 1], `coding ${coding}`).toBeLessThan(0.45);
    }
  }, 300_000);
});

describe.skipIf(!SOUND || !TABLES)('the sound tables, against sound.bin', () => {
  async function load(): Promise<{ tables: WorldTables; sounds: PackReader }> {
    const tablePack = await PackReader.open(await fileSource(TABLES!), 'tables.bin');
    const tables = await WorldTables.load(async entry => {
      const found = tablePack.get(entry);
      return found ? tablePack.read(found) : null;
    });
    return { tables, sounds: await PackReader.open(await fileSource(SOUND!), 'sound.bin') };
  }

  it('finds a file for nearly every sound, trying the siblings of a missing variant', async () => {
    const { tables, sounds } = await load();
    const { cues } = tables.soundCatalogue();
    expect(cues.length).toBeGreaterThan(500);
    let silent = 0;
    for (const cue of cues) {
      const files = cueFiles(cue, 0);
      if (!files.some(path => sounds.has(path))) silent++;
    }
    // A few rows name whole families the build does not ship (23 of 978 in
    // 2.2.0); they stay silent. Bounded, so a reader that started misnaming
    // files shows here.
    expect(silent).toBeLessThan(cues.length / 30);
  }, 120_000);

  it('gives the zones music that is music, and puts some in every region', async () => {
    const { tables } = await load();
    const index = indexCatalogue(tables.soundCatalogue());
    const zones = tables.zones(new Map()).map(zoneInfoOf);
    const withMusic = zones.filter(zone => zone.sound.music);
    expect(withMusic.length).toBeGreaterThan(20);
    for (const zone of withMusic)
      expect(index.byId.get(zone.sound.music)?.music, `${zone.id}`).toBe(true);
    for (const zone of zones.filter(z => z.sound.ambience)) {
      expect(index.byId.get(zone.sound.ambience)?.loop, `${zone.id}`).toBe(true);
    }
    // Standing in the middle of a region with music, something plays.
    const regions = withMusic.filter(zone => zone.parentId < 0);
    expect(regions.length).toBeGreaterThan(5);
    for (const region of regions) {
      const here = zoneSoundAt(zones, region.mapId, ...region.centre);
      expect(here?.music, `${region.id}`).toBeGreaterThan(0);
    }
    // A fight's music is music too.
    for (const [, cue] of index.battleMusic) expect(index.byId.get(cue)?.music).toBe(true);
  }, 120_000);

  it('has every sound handling an item or moving about can ask for', async () => {
    const { tables } = await load();
    const index = indexCatalogue(tables.soundCatalogue());
    // Each entry is one sound: the first name of it the catalogue has plays.
    const wanted: string[][] = [];

    // Every kind of item in the user's own item table, put on, taken off,
    // picked up and set down.
    const kinds = new Set<string>();
    for (const row of tables.rowsOf('items')) {
      kinds.add(`${row[1]}:${row[2]}:${row[11]}`);
    }
    for (const kind of kinds) {
      const [itemClass, subClass, inventoryType] = kind.split(':').map(Number);
      const item = { itemClass, subClass, inventoryType };
      if (inventoryType > 0) wanted.push([equipSound(item, true)], [equipSound(item, false)]);
      wanted.push([handleSound(item, true)], [handleSound(item, false)]);
    }

    // Every footstep, stroke and landing, on foot and on each mount's feet.
    const mounts = [
      null,
      ...new Set(
        tables
          .mounts()
          .map(m => m.effect)
          .filter(Boolean),
      ),
    ];
    for (const mount of mounts) {
      for (const surface of ['ground', 'wood'] as const) {
        for (const [landed, wading, backward] of [
          [true, false, false],
          [true, true, false],
          [false, false, false],
          [false, true, false],
          [false, false, true],
        ]) {
          const heard = new MoveSounds().step(
            {
              locomotion: 'ground',
              moving: !landed,
              backward,
              jumped: false,
              landed,
              wading,
              surface,
              underwater: false,
              mount,
            },
            0.02,
          );
          wanted.push(...heard.sounds.map(choice => [...choice]));
        }
      }
    }
    for (const underwater of [false, true]) {
      const heard = new MoveSounds().step(
        {
          locomotion: 'swim',
          moving: true,
          backward: false,
          jumped: false,
          landed: false,
          wading: false,
          surface: 'ground',
          underwater,
          mount: null,
        },
        0.02,
      );
      wanted.push(...heard.sounds.map(choice => [...choice]));
    }

    // Every weapon family's swing, blow, hard blow and parry.
    for (const family of ['edge', 'blunt', 'dagger', 'fist', 'parry', 'arrow', 'wand'] as const) {
      wanted.push(
        [swingSound(family)],
        [impactSound(family, false)],
        [impactSound(family, true)],
        [parrySound(family)],
      );
    }

    const silent = wanted.filter(choice => !choice.some(name => index.byName.has(name)));
    expect([...new Set(silent.map(choice => choice.join(' | ')))]).toEqual([]);
  }, 120_000);

  it('gives bodies voices that point at real sounds', async () => {
    const { tables } = await load();
    const index = indexCatalogue(tables.soundCatalogue());
    // A voice can name a sound the catalogue has no row for, and that line
    // stays unsaid; most name real ones.
    let voiced = 0;
    let lines = 0;
    let real = 0;
    for (const entry of tables.keyedRows('creature_appearance').keys()) {
      const voice = tables.unitSounds(entry, 0);
      if (!voice) continue;
      voiced++;
      for (const cue of Object.values(voice)) {
        lines++;
        if (index.byId.has(cue!)) real++;
      }
    }
    expect(voiced).toBeGreaterThan(100);
    expect(real / lines).toBeGreaterThan(0.6);
    // Every playable body speaks, in its own voice.
    for (const race of tables.playableKinds(new Map()).races) {
      for (const display of [race.maleDisplayInfoId, race.femaleDisplayInfoId]) {
        expect(tables.unitSounds(0, display)?.hurt, `display ${display}`).toBeGreaterThan(0);
      }
    }
  }, 120_000);
});

describe.skipIf(!TABLES)('whose voice a body speaks with, in every build', () => {
  it('reads a character’s sex off the body it wears, and lends a voiceless race one', async () => {
    for (const path of allPacks('tables.bin')) {
      const pack = await PackReader.open(await fileSource(path), 'tables.bin');
      const tables = await WorldTables.load(async entry => {
        const found = pack.get(entry);
        return found ? pack.read(found) : null;
      });
      if (!tables.soundCatalogue().cues.length) continue;
      const files = new Map(tables.soundCatalogue().cues.map(cue => [cue.id, cue.path]));
      const hurt = (entry: number, display: number, race: number, gender: number): string =>
        files.get(tables.unitSounds(entry, display, race, gender)?.hurt ?? 0) ?? '';
      for (const race of tables.playableKinds(new Map()).races) {
        // Whatever sex the record claims, the body's own decides.
        expect(hurt(0, race.maleDisplayInfoId, race.race, 1), `${path} ${race.race}`).toMatch(
          /_male_/,
        );
        expect(hurt(0, race.femaleDisplayInfoId, race.race, 0), `${path} ${race.race}`).toMatch(
          /_female_/,
        );
      }
    }
  }, 120_000);
});
