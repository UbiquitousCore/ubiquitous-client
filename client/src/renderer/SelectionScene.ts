/**
 * The ground the screens before the world stand on: an ordinary map the
 * build ships, drawn as its data places it, in a scene and canvas of its
 * own (the world has a player and a streamer, which do not exist yet). Only
 * the camera, turning and haze are ours.
 */

import * as THREE from 'three';

import type { ResourceSystem } from '../assets/ResourceSystem';
import type {
  Appearance,
  EffectEmitter,
  EquipmentAttachment,
  Placement,
  TileData,
  ZoneInfo,
} from '../assets/types';
import { attachPointId, effectId } from '../assets/ids';
import { logger } from '../core/log';
import { TILE_SIZE } from '../world/Terrain';
import { MaterialCache } from './MaterialCache';
import { buildModel } from './ModelFactory';
import { DOME_HAZE, hazeSky, makeSky, makeSkyHill } from './skyMaterials';
import { buildSkinnedModel, toThreeClip } from './SkinnedModelFactory';
import { isSkinned, loadModelSources } from './modelSources';
import { buildTerrainTile } from './TerrainFactory';
import { buildWaterTile } from './WaterFactory';
import { EffectInstance } from './EffectFactory';
import { placementSeed } from './emitterSpawn';
import { createEffectMaterial } from './effectMaterial';
import { renderPortrait } from './portrait';

import { findAttachmentNode, itemEffectHost, placedEffectHosts, rowMatrix } from './attachPoints';
import type { RawTextureRequest } from './TerrainFactory';
import { installColourGrade } from './colourGrade';
import { needsPostEffects, PostEffects } from './postfx/PostEffects';
import type { PostSettings } from './postfx/PostEffects';
import {
  DAIS_FACING,
  WIDE_START_HEADING,
  blendPoses,
  closePose,
  groundHaze,
  stepViewProgress,
  turnWide,
  widePose,
} from './selectionFraming';

/** Own choice: the owner asked for character-list faces slightly further out than in-world frames. */
const SLOT_PULL_BACK = 1.3;

const log = logger('selection');

const MADE_EFFECT = 'Effects/character/buff/character_buff_levelup_01.beff';

/** The map has no row to set its haze, so: the warm grey the sky meets the ground in. */
const HAZE = 0xc9c0b4;

const HAZE_COLOUR = new THREE.Color(HAZE);

const SUN_DIRECTION = new THREE.Vector3(0.45, 0.85, 0.35).normalize();

export interface SelectionBody {
  model: string;
  appearance?: Appearance;
  scale?: number;
}

/** Tiles loaded around the dais (~580 units across), so the wide view never sees an edge. */
const TILES_OUT = 4;

/** How far out to search for the dais: the map's middle is not where it stands. */
const LOOK_OUT = 5;

/** Clear ground round a dais that counts as room: about half its width. */
const ELBOW_ROOM = 8;

interface Ground {
  mapId: number;
  world: string | undefined;
  middle: readonly [number, number] | number[];
  sky: string | null;
  hill: string | null;
}

/** The ground's name without underscores, `human_selection` → `humanselection_sky`; none if unshipped. */
function skyOf(mapName: string): string {
  return `model/scene/sky/general_sky/${mapName.replace(/_/g, '')}_sky.bdae`;
}

/** The dome's name with `_hill`, as the build names every horizon layer. */
function hillOf(mapName: string): string {
  return skyOf(mapName).replace(/\.bdae$/, '_hill.bdae');
}

export type SelectionView = 'wide' | 'close';

export class SelectionScene {
  private readonly scene = new THREE.Scene();
  /**
   * The sky's own pass. Not depth-off materials (the cache shares them, so
   * the hills would draw over the character), nor copies (late textures land
   * on the cached original).
   */
  private readonly skyScene = new THREE.Scene();
  private readonly gl: THREE.WebGLRenderer;
  private readonly materials: MaterialCache;
  private readonly ground = new THREE.Group();
  /** Water, kept out of the ground the camera tests for a clear way to stand. */
  private readonly water = new THREE.Group();
  private readonly ripples: THREE.ShaderMaterial[] = [];
  private readonly scenery: THREE.AnimationMixer[] = [];
  private readonly alight: EffectInstance[] = [];
  private readonly burnings = new Map<string, THREE.MeshBasicMaterial>();
  private readonly portraits = new Map<string, string | null>();
  private readonly sky = new THREE.Group();
  private readonly pivot = new THREE.Group();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 600);
  /** The frame through its own buffer, made the first time the settings ask for it. */
  private post: PostEffects | null = null;
  private readonly owned: { dispose(): void }[] = [];
  private readonly borrowed: RawTextureRequest[] = [];
  private body: THREE.Object3D | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private standing: string | null = null;
  private swap = 0;
  private closed = false;
  private readonly stand = new THREE.Vector3();
  private wanted: SelectionView = 'wide';
  private near = 0;
  private orbit = WIDE_START_HEADING;
  private waterClock = 0;
  /** Drives itself: the world's frame loop has not started yet. */
  private frameHandle: number | null = null;
  private lastFrameAt = 0;
  private mapName = '';

  constructor(
    private readonly resources: ResourceSystem,
    private readonly canvas: HTMLCanvasElement,
    /** Where to tell the player the ground is missing (read from the file, not the unpacked set). */
    private readonly trouble?: (says: string) => void,
    /** The player's tone mapping, read each frame, so the screens match the world. */
    private readonly postSettings?: () => PostSettings,
  ) {
    installColourGrade();
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.materials = new MaterialCache(resources);
    this.scene.add(this.ground, this.water, this.pivot);
    const haze = groundHaze(TILES_OUT, TILE_SIZE);
    this.scene.fog = new THREE.Fog(HAZE, haze.from, haze.to);
    this.skyScene.add(this.sky);
    // The art is lit already; more light washes it out.
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.copy(SUN_DIRECTION);
    this.scene.add(sun);
    // A few dome surfaces are lit and would be black without light.
    this.skyScene.add(new THREE.AmbientLight(0xffffff, 1.6));
    this.frameCamera();
  }

  /** Load the named map and start drawing; a build without it draws nothing and says so once. */
  async open(mapName: string): Promise<void> {
    this.mapName = mapName;
    this.run();
    // Listed where the map table lists it (sky, middle); otherwise taken by
    // pack name, as on the build most people run.
    const zone = await this.selectionZone(mapName);
    const ground: Ground = zone
      ? {
          mapId: zone.mapId,
          // A world the map tables never named: ask by its pack, not map id.
          world: zone.world,
          middle: zone.centre,
          sky: zone.atmosphere.skybox ?? skyOf(mapName),
          hill: zone.atmosphere.skyHill ?? hillOf(mapName),
        }
      : { mapId: -1, world: mapName, middle: [0, 0], sky: skyOf(mapName), hill: hillOf(mapName) };

    if (ground.sky) await this.addSky(ground.sky);
    if (ground.hill) await this.addSky(ground.hill, true);

    // Look for the dais: on this build the zone's middle is in the woods four tiles away.
    const found = await this.findDais(ground);
    if (this.closed) return;
    if (!found) {
      log.once(
        'warn',
        `selection:dais:${mapName}`,
        `nothing in ${mapName} names a dais to stand a character on`,
      );
      this.saySo();
      return;
    }

    const tiles: TileData[] = [];
    for (let x = found.tile[0] - TILES_OUT; x <= found.tile[0] + TILES_OUT; x++) {
      for (let z = found.tile[1] - TILES_OUT; z <= found.tile[1] + TILES_OUT; z++) {
        const tile = await this.resources.tile(ground.mapId, x, z, ground.world).catch(() => null);
        if (tile) tiles.push(tile);
      }
    }
    if (this.closed) return;

    for (const tile of tiles) this.addGround(tile);

    // The dais last: it says where the character stands and how high.
    const everything = tiles.flatMap(tile => tile.placements);
    const daisOf = (one: Placement): boolean => one === found.dais;
    for (const placement of everything.filter(one => !daisOf(one))) {
      await this.addPlacement(placement, false);
    }
    await this.addPlacement(found.dais, true);
    this.frameCamera();
  }

  /** Stand a body on the dais, or clear it; the caller resolves the look. */
  async showBody(body: SelectionBody | null): Promise<void> {
    const key = body ? `${body.model}#${body.appearance?.key ?? ''}` : null;
    if (key === this.standing) return;
    this.standing = key;
    const swap = ++this.swap;
    this.clearBody();
    if (!body) return;

    let sources;
    try {
      sources = await loadModelSources(this.resources, body.model);
    } catch (error) {
      log.warn(`could not read the body for the selection screen: ${String(error)}`);
      return;
    }
    if (this.closed || swap !== this.swap) return;

    // A skeleton binding no drawn mesh builds as scenery, as in the world.
    const skinned = isSkinned(sources.skeleton)
      ? buildSkinnedModel(sources.model, sources.skeleton, this.materials, body.appearance)
      : null;
    const built = skinned ?? buildModel(sources.model, this.materials, body.appearance);

    const object = built.object;
    if (body.scale && body.scale !== 1) object.scale.setScalar(body.scale);
    this.pivot.add(object);
    this.body = object;
    this.owned.push(...built.geometries);

    // Held items are separate models on the body's nodes; undressed, it stands in underclothes.
    await this.dress(object, body.model, body.appearance?.attachments);
    if (this.closed || swap !== this.swap) return;

    // The dais is framed, not the body, so every race is shown from one place.
    this.frameCamera();

    // Without its idle the character reads as a mannequin.
    if (skinned && sources.clipData) {
      const mixer = new THREE.AnimationMixer(object);
      mixer.clipAction(toThreeClip(sources.clipData)).play();
      this.mixer = mixer;
    }
  }

  /** The level-up effect, played on the dais when a character is made. */
  async celebrate(): Promise<void> {
    await this.addEffect({
      model: MADE_EFFECT,
      position: [this.stand.x, this.stand.y, this.stand.z],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1],
      entry: 0,
      kind: 'effect',
    });
  }

  /** Hang what a body carries, by the world's rules (mirrored shoulders, two-sided shells). */
  private async dress(
    body: THREE.Object3D,
    bodyPath: string,
    attachments: readonly EquipmentAttachment[] | undefined,
    keep: { dispose(): void }[] = this.owned,
  ): Promise<void> {
    for (const item of attachments ?? []) {
      const sources = await loadModelSources(this.resources, item.model).catch(() => null);
      if (this.closed) return;
      if (!sources) continue;

      // An item with its own picture wears it whole, uncomposited.
      const appearance = item.texture
        ? { skin: item.texture, meshes: [], skinReplacesAll: true, key: `item:${item.model}` }
        : undefined;
      const skinned = isSkinned(sources.skeleton)
        ? buildSkinnedModel(sources.model, sources.skeleton, this.materials, appearance)
        : null;
      const built = skinned ?? buildModel(sources.model, this.materials, appearance);
      const object = built.object;
      keep.push(...built.geometries);

      const host = await this.hostFor(body, bodyPath, item.node);
      if (this.closed) return;
      if (!host) {
        log.once(
          'warn',
          `dress:${item.node}`,
          `nothing on this body is called ${item.node}, so its ${item.slot} is not worn`,
        );
        continue;
      }

      if (item.mirrorX) object.scale.x *= -1;
      if (item.alignNode) {
        const matrix = await this.resources
          .tryGet<'attachPoint'>(attachPointId(item.model, item.alignNode))
          .catch(() => null);
        if (matrix) object.applyMatrix4(rowMatrix(matrix).invert());
      }
      if (item.slot === 'head' || item.slot === 'shoulders') {
        object.traverse(child => {
          const mesh = child as THREE.Mesh;
          const worn = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const one of worn) if (one) one.side = THREE.DoubleSide;
        });
      }
      host.add(object);

      // The item's own effects (a blade's rune), on nodes inside it.
      for (const effect of item.effects ?? []) {
        await this.light(object, item.model, effect.effect, effect.node);
        if (this.closed) return;
      }
    }
  }

  /** An effect on a node inside a worn item, hung as the world hangs it (`itemEffectHost`). */
  private async light(
    object: THREE.Object3D,
    model: string,
    path: string,
    node: string,
  ): Promise<void> {
    const data = await this.resources.tryGet<'effect'>(effectId(path)).catch(() => null);
    const matrix = await this.resources
      .tryGet<'attachPoint'>(attachPointId(model, node))
      .catch(() => null);
    if (!data || this.closed) return;
    const instance = new EffectInstance(
      data,
      def => this.burning(def),
      named => findAttachmentNode(object, named),
      named => findAttachmentNode(object, named),
    );
    (itemEffectHost(object, node, matrix) ?? object).add(instance.object);
    this.alight.push(instance);
  }

  /** The node an item hangs from, rebuilt from the provider's matrix where the skeleton dropped it. */
  private async hostFor(
    body: THREE.Object3D,
    bodyPath: string,
    node: string,
  ): Promise<THREE.Object3D | null> {
    const found = findAttachmentNode(body, node);
    if (found) return found;
    const matrix = await this.resources
      .tryGet<'attachPoint'>(attachPointId(bodyPath, node))
      .catch(() => null);
    if (!matrix) return null;
    const stood = new THREE.Group();
    stood.applyMatrix4(rowMatrix(matrix));
    stood.matrixAutoUpdate = false;
    body.add(stood);
    return stood;
  }

  /** A portrait for a screen's circle, photographed (`renderPortrait`) and cached by look. */
  async portrait(body: SelectionBody): Promise<string | null> {
    const key = `${body.model}#${body.appearance?.key ?? ''}`;
    const known = this.portraits.get(key);
    if (known !== undefined) return known;

    let sources;
    try {
      sources = await loadModelSources(this.resources, body.model);
    } catch (error) {
      log.once('warn', `portrait:${body.model}`, `no picture of ${body.model}: ${String(error)}`);
      return null;
    }
    if (this.closed) return null;

    const skinned = isSkinned(sources.skeleton)
      ? buildSkinnedModel(sources.model, sources.skeleton, this.materials, body.appearance)
      : null;
    const built = skinned ?? buildModel(sources.model, this.materials, body.appearance);
    // Dressed: a portrait without the helm is of somebody else.
    const borrowed: { dispose(): void }[] = [];
    await this.dress(built.object, body.model, body.appearance?.attachments, borrowed);
    await this.dressed(built.object);
    if (this.closed) {
      for (const geometry of built.geometries) geometry.dispose();
      for (const one of borrowed) one.dispose();
      return null;
    }
    const url = renderPortrait(this.gl, built.object, undefined, SLOT_PULL_BACK);
    for (const geometry of built.geometries) geometry.dispose();
    for (const one of borrowed) one.dispose();
    this.portraits.set(key, url);
    return url;
  }

  /** Wait, within reason, for a body's textures, or the portrait is a black cut-out kept all session. */
  private async dressed(object: THREE.Object3D): Promise<void> {
    const waiting = (): boolean => {
      let pending = false;
      object.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || pending) return;
        const worn = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        if (worn.some(one => one && this.materials.isPending(one))) pending = true;
      });
      return pending;
    };
    for (let tries = 0; tries < 120 && waiting(); tries++) {
      await new Promise(done => setTimeout(done, 25));
      if (this.closed) return;
    }
  }

  /** Turned by hand only: the build's screens leave a character facing its maker. */
  turnBy(radians: number): void {
    this.pivot.rotation.y += radians;
  }

  releaseTurn(): void {}

  frame(dt: number): void {
    if (this.closed) return;
    this.resize();
    this.moveCamera(dt);
    this.waterClock += dt;
    for (const ripple of this.ripples) ripple.uniforms.uTime.value = this.waterClock;
    this.mixer?.update(dt);
    for (const moving of this.scenery) moving.update(dt);
    for (const burning of this.alight) burning.update(dt, this.camera);
    this.sky.position.copy(this.camera.position);
    // Clearing depth between sky and world stops an 80-unit dome swallowing the character.
    const settings = this.postSettings?.();
    if (settings && needsPostEffects(settings)) {
      this.post ??= this.makePost();
      this.post.set(settings);
      this.post.render();
      return;
    }
    this.gl.autoClear = false;
    this.gl.clear();
    this.gl.render(this.skyScene, this.camera);
    this.gl.clearDepth();
    this.gl.render(this.scene, this.camera);
  }

  private makePost(): PostEffects {
    const post = new PostEffects(this.gl, this.skyScene, this.scene, this.camera, true);
    const size = this.gl.getSize(new THREE.Vector2());
    post.setSize(size.x, size.y, this.gl.getPixelRatio());
    return post;
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    this.clearBody();
    for (const burning of this.alight) burning.dispose();
    this.alight.length = 0;
    for (const owned of this.owned) owned.dispose();
    this.owned.length = 0;
    for (const borrowed of this.borrowed) {
      this.materials.releaseRawTexture(borrowed.ref, borrowed.wrap, borrowed.kind);
    }
    this.borrowed.length = 0;
    this.materials.dispose();
    this.post?.dispose();
    this.post = null;
    this.gl.dispose();
  }

  private run(): void {
    if (this.frameHandle !== null || this.closed) return;
    const tick = (now: number): void => {
      if (this.closed) return;
      const dt = this.lastFrameAt === 0 ? 0 : Math.min(0.1, (now - this.lastFrameAt) / 1000);
      this.lastFrameAt = now;
      this.frame(dt);
      this.frameHandle = requestAnimationFrame(tick);
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  private clearBody(): void {
    this.mixer?.stopAllAction();
    this.mixer = null;
    if (this.body) {
      this.body.removeFromParent();
      this.body = null;
    }
    this.pivot.rotation.y = DAIS_FACING;
  }

  /** An interrupted extraction can lack this map's pack; say so, since nothing drawn looks broken. */
  private saySo(): void {
    this.trouble?.(
      'The ground these screens stand on is a part of the game file that has not been ' +
        'unpacked. Choose the game file again to finish unpacking it.',
    );
  }

  private async selectionZone(mapName: string): Promise<ZoneInfo | null> {
    const index = await this.resources.zoneIndex().catch(() => null);
    if (!index) return null;
    const wanted = mapName.toLowerCase();
    const on = index.zones.filter(zone => zone.mapName.toLowerCase() === wanted);
    if (!on.length) return null;
    // Where a map has several zones, the one with scenery.
    return on.find(zone => zone.hasScenery) ?? on[0];
  }

  /**
   * The dais: a placement named after the map (`human_selection.bdae`). This
   * map has two and one is hemmed in by houses, so every ring is searched and
   * the one with room wins.
   */
  private async findDais(
    ground: Ground,
  ): Promise<{ dais: Placement; tile: [number, number] } | null> {
    const named = (ground.world ?? this.mapName).toLowerCase();
    const middle: [number, number] = [
      Math.floor(ground.middle[0] / TILE_SIZE),
      Math.floor(ground.middle[1] / TILE_SIZE),
    ];
    const candidates: DaisStanding[] = [];
    for (let out = 0; out <= LOOK_OUT; out++) {
      for (const [x, z] of ring(middle, out)) {
        const tile = await this.resources.tile(ground.mapId, x, z, ground.world).catch(() => null);
        if (this.closed) return null;
        if (!tile) continue;
        for (const dais of tile.placements.filter(one => named_(one.model).startsWith(named))) {
          candidates.push({ dais, tile: [x, z], near: tile.placements });
        }
      }
    }
    return clearestStand(candidates, ground.middle);
  }

  /** A floor's height by raycasting down; the box would reach whatever stands on it. */
  private floorOf(object: THREE.Object3D, x: number, z: number, box: THREE.Box3): number {
    const above = Number.isFinite(box.max.y) ? box.max.y + 1 : (object.position.y ?? 0) + 1;
    const ray = new THREE.Raycaster(
      new THREE.Vector3(x, above, z),
      new THREE.Vector3(0, -1, 0),
      0,
      above - (Number.isFinite(box.min.y) ? box.min.y : above - 1) + 2,
    );
    const hit = ray.intersectObject(object, true)[0];
    return hit ? hit.point.y : (box.max.y ?? object.position.y ?? 0);
  }

  /** One effect the map places (a brazier's fire), built and clocked as the world does. */
  private async addEffect(placement: Placement): Promise<void> {
    const data = await this.resources.tryGet<'effect'>(effectId(placement.model)).catch(() => null);
    if (!data || this.closed) return;

    // Emitters hang off nodes the effect names, with their own transforms;
    // hosts and hostless emitters share one group.
    const stands = new THREE.Group();
    stands.position.set(...placement.position);
    stands.quaternion.set(...placement.rotation);
    stands.scale.set(...placement.scale);

    // Models before particles: a brazier's fire is a model with a clip, and
    // the emitters hang off nodes inside it.
    const roots: THREE.Object3D[] = [];
    const modelRoots: Array<THREE.Object3D | null> = [];
    for (const node of data.models) {
      const model = await this.resources.model(node.model).catch(() => null);
      if (this.closed) return;
      if (!model) {
        modelRoots.push(null);
        continue;
      }
      const built = buildModel(model, this.materials);
      stands.add(built.object);
      roots.push(built.object);
      modelRoots.push(built.object);
      this.owned.push(...built.geometries);
      if (model.nodeClip && model.nodeClip.tracks.length > 0) {
        const mixer = new THREE.AnimationMixer(built.object);
        const action = mixer.clipAction(toThreeClip(model.nodeClip));
        action.setLoop(node.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !node.loop;
        action.play();
        this.scenery.push(mixer);
      }
    }

    const { attach, findDrawable } = placedEffectHosts(data.models, roots, stands);

    const instance = new EffectInstance(
      data,
      def => this.burning(def),
      attach,
      findDrawable,
      false,
      modelRoots,
      false,
      placementSeed(placement.model, placement.position),
    );
    stands.add(instance.object);
    this.ground.add(stands);
    this.alight.push(instance);
  }

  private burning(def: EffectEmitter): THREE.Material {
    const key = `${def.particle.texture}|${def.particle.blend}`;
    const known = this.burnings.get(key);
    if (known) return known;
    const material = createEffectMaterial(def.particle.blend);
    this.burnings.set(key, material);
    this.owned.push(material);
    if (def.particle.texture) {
      void this.materials
        .rawTexture(def.particle.texture)
        .then(map => {
          if (!map) return;
          material.map = map;
          material.needsUpdate = true;
        })
        .catch(() => undefined);
    }
    return material;
  }

  private addGround(tile: TileData): void {
    if (!tile.terrain) return;
    const built = buildTerrainTile(tile.terrain, this.materials);
    if (built) {
      this.ground.add(built.mesh);
      this.owned.push(built.geometry, ...built.materials);
      this.borrowed.push(...built.textures);
    }
    // The selection ground has a lake and a fall; without water their beds draw dry.
    const wet = buildWaterTile(tile.terrain, this.materials);
    if (wet) {
      this.water.add(wet.mesh);
      this.owned.push(wet.geometry, wet.material);
      this.ripples.push(wet.material);
    }
  }

  /** One placement; effects and creatures are left out. */
  private async addPlacement(placement: Placement, isTheDais: boolean): Promise<void> {
    if (placement.kind === 'effect') {
      await this.addEffect(placement);
      return;
    }
    if (placement.kind === 'creature') return;
    try {
      const model = await this.resources.model(placement.model);
      if (this.closed) return;
      const built = buildModel(model, this.materials);
      const object = built.object;

      // Scenery animates from a clip inside the model file (windmill sails).
      if (model.nodeClip && model.nodeClip.tracks.length > 0) {
        const mixer = new THREE.AnimationMixer(object);
        mixer.clipAction(toThreeClip(model.nodeClip)).play();
        this.scenery.push(mixer);
      }
      object.position.set(...placement.position);
      object.quaternion.set(...placement.rotation);
      object.scale.set(...placement.scale);
      this.ground.add(object);
      this.owned.push(...built.geometries);

      if (isTheDais) {
        object.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(object);
        // The middle of the dais: its origin is off to one side.
        const middle = box.getCenter(new THREE.Vector3());
        const across = Number.isFinite(middle.x) ? middle.x : placement.position[0];
        const along = Number.isFinite(middle.z) ? middle.z : placement.position[2];
        // The floor, by looking down at the middle: the box top is the braziers'.
        this.stand.set(across, this.floorOf(object, across, along, box), along);
        this.pivot.position.copy(this.stand);
        this.frameCamera();
      }
    } catch (error) {
      log.once(
        'warn',
        `selection:${placement.model}`,
        `the selection map wants ${placement.model}, which this build has not got`,
      );
      void error;
    }
  }

  /** The zone's dome or horizon layer, in the sky pass, lowered and hazed like the world's (`makeSkyHill`). */
  private async addSky(path: string, hill = false): Promise<void> {
    try {
      const model = await this.resources.model(path);
      if (this.closed) return;
      const built = buildModel(model, this.materials);
      if (hill) makeSkyHill(built.object, HAZE_COLOUR);
      else {
        makeSky(built.object);
        hazeSky(built.object, HAZE_COLOUR, DOME_HAZE);
      }
      this.sky.add(built.object);
      this.owned.push(...built.geometries);
    } catch (error) {
      log.once('warn', `selection:${path}`, `the selection map has no sky at ${path}`);
      void error;
    }
  }

  /** Settle camera and body on the dais (`selectionFraming`). */
  private frameCamera(): void {
    this.pivot.rotation.y = DAIS_FACING;
    this.camera.updateProjectionMatrix();
    this.moveCamera(0);
  }

  /** Ask for a view; the camera moves there over about a second. */
  watch(view: SelectionView): void {
    this.wanted = view;
  }

  /** The far view keeps circling even when hidden, so returning to it never jumps. */
  private moveCamera(dt: number): void {
    this.orbit = turnWide(this.orbit, dt);
    // Called with no time on loads; that must not finish a move.
    this.near = stepViewProgress(this.near, this.wanted === 'close', dt);
    const pose = blendPoses(widePose(this.stand, this.orbit), closePose(this.stand), this.near);
    this.camera.position.copy(pose.eye);
    this.camera.lookAt(pose.target);
  }

  /** Follow the element the canvas is stretched across. */
  private resize(): void {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (width === 0 || height === 0) return;
    const size = this.gl.getSize(new THREE.Vector2());
    if (size.x === width && size.y === height) return;
    this.gl.setSize(width, height, false);
    this.post?.setSize(width, height, this.gl.getPixelRatio());
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}

function named_(model: string): string {
  const base = model.toLowerCase().split('/').pop() ?? model.toLowerCase();
  return base.replace(/\.[^.]*$/, '');
}

/** A dais the map holds, with whatever else stands on its tile. */
export interface DaisStanding {
  dais: Placement;
  tile: [number, number];
  near: readonly Placement[];
}

/** The dais with the fewest things crowding it; ties go to the one nearer the middle. */
export function clearestStand(
  candidates: readonly DaisStanding[],
  middle: readonly number[] | number[],
): { dais: Placement; tile: [number, number] } | null {
  let best: { found: DaisStanding; crowd: number; away: number } | null = null;
  for (const found of candidates) {
    const crowd = found.near.filter(
      one => one !== found.dais && flatApart(one, found.dais) < ELBOW_ROOM,
    ).length;
    const away = Math.hypot(found.dais.position[0] - middle[0], found.dais.position[2] - middle[1]);
    if (!best || crowd < best.crowd || (crowd === best.crowd && away < best.away)) {
      best = { found, crowd, away };
    }
  }
  return best ? { dais: best.found.dais, tile: best.found.tile } : null;
}

function flatApart(one: Placement, other: Placement): number {
  return Math.hypot(one.position[0] - other.position[0], one.position[2] - other.position[2]);
}

/** The ring of tiles exactly `out` from the middle, for an outward search. */
function ring(middle: [number, number], out: number): Array<[number, number]> {
  if (out === 0) return [middle];
  const [cx, cz] = middle;
  const tiles: Array<[number, number]> = [];
  for (let x = cx - out; x <= cx + out; x++) {
    for (let z = cz - out; z <= cz + out; z++) {
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) === out) tiles.push([x, z]);
    }
  }
  return tiles;
}
