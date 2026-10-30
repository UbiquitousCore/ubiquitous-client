/**
 * What exists, and where: resident tiles, the entities on them and the
 * player. Plain records, no ECS; the renderer observes it and is handed
 * nothing.
 */

import { coverHeight } from './groundCover';
import { logger } from '../core/log';
import type { ResourceSystem } from '../assets/ResourceSystem';
import type { Appearance, Placement, TileData, ZoneAtmosphere, ZoneInfo } from '../assets/types';
import { neutraliseTint } from './groundTint';
import { Terrain } from './Terrain';
import type { WaterAt } from './Terrain';
import { CollisionWorld, STEP_UP } from './CollisionWorld';
import type { OpenArea } from './CollisionWorld';
import { TileStreamer, tileKey, tileOf } from './TileStreamer';
import type { TileSink } from './TileStreamer';

/**
 * `lootable` and `emptied` are the server's names (`net/wireCodes.ts`);
 * `none` means not yet said, `unknown` a name this client lacks.
 */
export type Lootable = 'lootable' | 'emptied' | 'none' | 'unknown';

const log = logger('world');

export type EntityId = number;

/** A thing in the world, local or replicated. `model` is a resource path. */
export interface Entity {
  id: EntityId;
  networkId?: number;
  kind: Placement['kind'] | 'player';
  interactionIcon?: string;
  baseInteractionIcon?: string;
  npcFlags?: number;
  /** A placed object that can be gathered from; the server says which. */
  gatherable?: boolean;
  offersQuests?: boolean;
  questMark?: string;
  model: string;
  position: [number, number, number];
  /** Where the spawn-table object carrying this effect stands; see `Placement.owner`. */
  owner?: [number, number, number];
  rotation: [number, number, number, number];
  scale: [number, number, number];
  entry: number;
  appearance?: Appearance;
  /** The tile that brought this entity, evicted with it; undefined for the player. */
  tile?: string;
  version: number;
  network?: NetworkMotion;
  networkNameId?: number;
  networkName?: string;
  networkSubNameId?: number;
  /** The role under the name; '' once resolved to nothing, so it is not asked again. */
  networkSubName?: string;
  networkLevel?: number;
  /** Decides which of mana, vigor or morale its ring spends. */
  networkClass?: number;
  networkHealth?: number;
  networkMaxHealth?: number;
  networkPower?: number;
  networkMaxPower?: number;
  /** 0 hostile, 1 human, 2 neutral, arena factions above; decides the relationship colour. */
  networkFaction?: number;
  /** Its own animation timing speed; a wolf and a townsfolk do not share one. */
  networkBaseSpeed?: number;
  networkDead?: boolean;
  /** A training dummy: blows never make it hostile. */
  networkNeverFightsBack?: boolean;
  networkInCombat?: boolean;
  networkStealthed?: boolean;
  networkStunned?: boolean;
  /** Kept: the glow is re-asserted every frame, for bodies whose model loaded late. */
  networkLootable?: Lootable;
  /** Its current foe; null ends the fight and starts the countdown to `networkHomeYaw`. */
  networkFaceTarget?: EntityId | null;
  networkHomeYaw?: number;
  networkRestFor?: number;
  networkMoving?: boolean;
}

/** A player's update says where they were, so arriving proves nothing; a creature's route ending is the stop. */
export type NetworkMotionKind =
  /** One reported position, eased toward. The server's flag says if it moves. */
  | 'reported'
  /** A controller's path, replayed at the speed it gave. Empty route = stopped. */
  | 'route'
  /** One leg of a player still going. Walked, but arriving proves nothing. */
  | 'segment'
  /** A route with no usable speed, eased to its end. Arriving is the stop. */
  | 'collapsed';

export interface NetworkMotion {
  kind?: NetworkMotionKind;
  /** The last path node, when there is a path. */
  target: [number, number, number];
  yaw?: number;
  path: Array<[number, number, number]>;
  /** Units per second actually travelled: base × (1 + increment). */
  speed: number;
  /** The message's base speed, before the bonus; the clip plays at rate 1 at this speed. */
  baseSpeed?: number;
  speedBonus?: number;
  velocity?: [number, number, number];
  extrapolate?: boolean;
  correction?: [number, number, number];
  moving: boolean;
  /** Recomputed per frame: a route has corners. */
  faceTravel?: boolean;
}

export interface Resting {
  y: number;
  swimming: boolean;
  /** The surface normal underfoot; flat on the water. */
  normal: [number, number, number];
}

/** A point on the ground: its height and the surface normal underfoot. */
export interface GroundPoint {
  y: number;
  normal: [number, number, number];
}

const FLAT_NORMAL: [number, number, number] = [0, 1, 0];

export interface WorldEvents {
  onZoneLoaded?(world: World): void;
  onEntityAdded?(entity: Entity): void;
  onEntityRemoved?(id: EntityId): void;
}

/** `zone` fires once the zone row arrives, `tiles` once the first ground is resident. */
export type LoadStage = 'zone' | 'tiles';

export interface WorldOptions {
  blockSize?: number;
  includeLocalCreatures?: boolean;
}

const IDENTITY_ROT: [number, number, number, number] = [0, 0, 0, 1];
const UNIT_SCALE: [number, number, number] = [1, 1, 1];

/**
 * Yaw conversion: the wire and the spawn tables store a yaw that draws as
 * `pi - yaw` about Y. Self-inverse.
 */
export function gameYaw(yaw: number): number {
  const a = Math.PI - yaw;
  return a > Math.PI ? a - Math.PI * 2 : a <= -Math.PI ? a + Math.PI * 2 : a;
}

const SMOOTHING_RATE = 14;
/** Past this, cut rather than glide across the map. */
const SNAP_DISTANCE = 30;
const ARRIVED = 0.001;

/** A frame too short to reach a node snaps onto it instead; a fiftieth of a player radius. */
export const NODE_SNAP_DISTANCE = 0.01;
const TURNED = 0.001;

/** Radians a second: a fixed rate, so a half turn takes two thirds of a second. */
export const TURN_RATE = Math.PI * 1.5;

/** Ms a body stands with nobody to look at before turning back to its spawn facing. */
export const FACE_HOME_DELAY = 4000;
export const MOVED_ENOUGH_TO_FACE = 1e-4;

const GROUND_READY_RADIUS = 1;

const DEFAULT_ATMOSPHERE: ZoneAtmosphere = {
  fogColor: [0.5, 0.62, 0.72],
  fogNear: 45,
  fogFar: 260,
  skybox: null,
};

const QUEST_STATUS_ICON: Partial<Record<string, string>> = {
  incomplete: 'ui/icons/head/ui_head_questunfinished.png',
  available: 'ui/icons/head/ui_head_questavailable.png',
  finished: 'ui/icons/head/ui_head_questfinished.png',
};

export class World implements TileSink {
  terrain = new Terrain();
  collision = new CollisionWorld();
  zone: ZoneInfo | null = null;
  atmosphere: ZoneAtmosphere = { ...DEFAULT_ATMOSPHERE };

  readonly entities = new Map<EntityId, Entity>();
  player: Entity | null = null;

  /**
   * Everything that can move or turn: creatures, players and anything not
   * placed by a tile, plus any object handed motion or a facing. Per-frame
   * passes walk this instead of `entities`, most of which is scenery.
   */
  private readonly _movers = new Set<Entity>();

  get movers(): ReadonlySet<Entity> {
    return this._movers;
  }

  /**
   * Movers further than `distance` from the player, in ground plane: the
   * bodies a distance-gated pass could skip. Read by `ubiquitous.inspect()`; with
   * no player there is nothing to be distant from.
   */
  distantMovers(distance: number): number {
    const at = this.player?.position;
    if (!at) return 0;
    const limit = distance * distance;
    let far = 0;
    for (const entity of this._movers) {
      const dx = entity.position[0] - at[0];
      const dz = entity.position[2] - at[2];
      if (dx * dx + dz * dz > limit) far++;
    }
    return far;
  }

  private _membership = 0;

  /** Bumped whenever an entity is added or removed; the same size is not the same set. */
  get membership(): number {
    return this._membership;
  }

  /**
   * Never reused, even across a teleport: restarting per zone let a new
   * entity 5 inherit the old zone's view for id 5, left on screen.
   */
  private nextId: EntityId = 1;
  private readonly byTile = new Map<string, EntityId[]>();
  private readonly streamer: TileStreamer;
  private mapZones: ZoneInfo[] = [];
  private _groundRevision = 0;
  private readonly includeLocalCreatures: boolean;

  get groundRevision(): number {
    return this._groundRevision;
  }

  constructor(
    private readonly resources: ResourceSystem,
    private readonly events: WorldEvents = {},
    options: WorldOptions = {},
  ) {
    this.includeLocalCreatures = options.includeLocalCreatures ?? true;
    this.streamer = new TileStreamer(
      { tile: (mapId, tx, tz, world) => this.resources.tile(mapId, tx, tz, world) },
      this,
      { blockSize: options.blockSize },
    );
  }

  get blockSize(): number {
    return this.streamer.blockSize;
  }

  setTileWindow(blockSize: number): void {
    this.streamer.setBlockSize(blockSize);
  }

  get pendingTiles(): number {
    return this.streamer.pending;
  }

  /** Arrive in a zone: its weather, the player at its centre, and ground streamed around them. */
  async loadZone(
    id: number,
    playerModel: string,
    playerLook?: Appearance,
    onStage?: (stage: LoadStage) => void,
  ): Promise<void> {
    const data = await this.resources.zone(id);
    onStage?.('zone');

    this.reset();
    this.zone = data.info;
    this.atmosphere = data.info.atmosphere;
    await this.loadMapZones(data.info.mapId);
    this.streamer.setMap(data.info.mapId, data.info.world);

    const [x, z] = data.spawn;
    this.spawnPlayer(playerModel, x, z, playerLook);

    this.streamer.update(x, z);
    // Only the ground underfoot; the rest arrives during play.
    await this.streamer.whenSettled(GROUND_READY_RADIUS);
    onStage?.('tiles');

    if (this.player) {
      const resting = this.restingHeight(x, z, this.terrain.heightAt(x, z) ?? 0);
      this.setPosition(this.player, x, resting.y, z);
    }

    log.info(
      `${data.info.name}: ${this.terrain.tileCount} tiles resident, ` +
        `${this.streamer.pending} still arriving, ${this.entities.size} entities, ` +
        `${this.collision.triangleCount()} collision triangles`,
    );
    this.events.onZoneLoaded?.(this);
  }

  /** Keep the resident window on the player; call every frame. */
  update(): void {
    const p = this.player?.position;
    if (!p) return;
    this.streamer.update(p[0], p[2]);
    this.applyZoneAt(p[0], p[2]);
  }

  /** Move everything the server owns one frame, settling `networkMoving` for the animation layer. */
  updateNetwork(dt: number): void {
    const step = Math.max(0, dt);
    const blend = 1 - Math.exp(-SMOOTHING_RATE * step);
    for (const entity of this._movers) {
      const motion = entity.network;
      if (!motion) {
        // A standing body may still need to turn: a fight goes on around it.
        if (entity.networkFaceTarget !== undefined || entity.networkHomeYaw !== undefined) {
          this.faceWhileStanding(entity, step);
        }
        continue;
      }

      const [wasX, , wasZ] = entity.position;
      if (motion.path.length > 0) this.walkPath(entity, motion, step, blend);
      else if (motion.extrapolate === true && motion.moving && motion.velocity && motion.speed > 0)
        this.extrapolate(entity, motion, step);
      else this.easeToTarget(entity, motion, blend);

      // A sent facing wins; else this frame's travel (the leg being walked).
      if (motion.yaw !== undefined) {
        this.turnToward(entity, motion.yaw, step);
        continue;
      }
      const dx = entity.position[0] - wasX;
      const dz = entity.position[2] - wasZ;
      const travelled = Math.hypot(dx, dz) > MOVED_ENOUGH_TO_FACE;
      if (motion.faceTravel === true && travelled) {
        this.turnToward(entity, Math.atan2(dx, dz), step);
        // Travelling resets the countdown home.
        entity.networkRestFor = 0;
      } else if (!travelled) {
        this.faceWhileStanding(entity, step);
      }
    }
  }

  private faceWhileStanding(entity: Entity, dt: number): void {
    // A corpse keeps the angle it fell at.
    if (entity.networkDead === true) return;
    const targetId = entity.networkFaceTarget;
    if (targetId !== undefined && targetId !== null) {
      const target = this.entities.get(targetId);
      if (target) {
        const dx = target.position[0] - entity.position[0];
        const dz = target.position[2] - entity.position[2];
        if (Math.hypot(dx, dz) > MOVED_ENOUGH_TO_FACE) {
          this.turnToward(entity, Math.atan2(dx, dz), dt);
        }
        entity.networkRestFor = 0;
        return;
      }
    }
    if (entity.networkHomeYaw === undefined) return;
    const waited = (entity.networkRestFor ?? 0) + dt * 1000;
    entity.networkRestFor = waited;
    if (waited < FACE_HOME_DELAY) return;
    this.turnToward(entity, entity.networkHomeYaw, dt);
  }

  /** Null and undefined both mean nobody; a body never in a fight has no home facing to return to. */
  setFaceTarget(entity: Entity, targetId: EntityId | null): void {
    this._movers.add(entity);
    if (entity.networkFaceTarget === targetId) return;
    entity.networkFaceTarget = targetId;
    entity.networkRestFor = 0;
  }

  private extrapolate(entity: Entity, motion: NetworkMotion, dt: number): void {
    const [vx, vy, vz] = motion.velocity!;
    const length = Math.hypot(vx, vy, vz);
    if (length <= 1e-6) return;
    this.setPosition(
      entity,
      entity.position[0] + (vx / length) * motion.speed * dt,
      entity.position[1] + (vy / length) * motion.speed * dt,
      entity.position[2] + (vz / length) * motion.speed * dt,
    );
  }

  /** Walk a route horizontally (the ground pass owns height); leftover distance carries on. */
  private walkPath(entity: Entity, motion: NetworkMotion, dt: number, blend: number): void {
    // No speed: a beeline, continuous if not the route.
    if (!(motion.speed > 0)) {
      log.once(
        'warn',
        `path-speed:${entity.id}`,
        `entity ${entity.id} was given a path with no speed; easing to its end instead`,
      );
      const end = motion.path[motion.path.length - 1]!;
      motion.path.length = 0;
      motion.target = [...end];
      motion.kind = 'collapsed';
      this.easeToTarget(entity, motion, blend);
      return;
    }

    let budget = motion.speed * dt;
    while (motion.path.length > 0 && budget > 0) {
      const node = motion.path[0]!;
      const dx = node[0] - entity.position[0];
      const dy = node[1] - entity.position[1];
      const dz = node[2] - entity.position[2];
      const distance = Math.hypot(dx, dz);
      if (distance <= budget || distance < NODE_SNAP_DISTANCE) {
        // Horizontal arrival; the ground pass corrects the height.
        this.setPosition(entity, node[0], entity.position[1] + dy, node[2]);
        motion.path.shift();
        budget -= distance;
        continue;
      }
      const scale = budget / distance;
      this.setPosition(
        entity,
        entity.position[0] + dx * scale,
        entity.position[1] + dy * scale,
        entity.position[2] + dz * scale,
      );
      budget = 0;
    }
    entity.networkMoving = motion.path.length > 0;
    // A spent route is the stop. A segment is not: catching up to a player
    // says nothing, so their flag stands.
    if (motion.kind === 'segment') entity.networkMoving = motion.moving;
    else if (motion.path.length === 0) motion.moving = false;
  }

  private easeToTarget(entity: Entity, motion: NetworkMotion, blend: number): void {
    const target = motion.target;
    const [dx, dy, dz] = [
      target[0] - entity.position[0],
      target[1] - entity.position[1],
      target[2] - entity.position[2],
    ];
    const distance = Math.hypot(dx, dy, dz);
    // Too far to ease (teleport, respawn); never cut a collapsed route.
    if (distance > SNAP_DISTANCE && motion.kind !== 'collapsed')
      this.setPosition(entity, ...target);
    else if (distance > ARRIVED) {
      this.setPosition(
        entity,
        entity.position[0] + dx * blend,
        entity.position[1] + dy * blend,
        entity.position[2] + dz * blend,
      );
    }
    // Only a collapsed route's arrival is a stop, judged horizontally: the
    // ground pass owns height, and a disputed Y would run on the spot forever.
    entity.networkMoving =
      motion.kind === 'collapsed' ? Math.hypot(dx, dz) > ARRIVED : motion.moving;
  }

  /**
   * Turn the short way at a fixed rate: easing by a fraction never arrives
   * and makes a route's corner read as a spin.
   */
  private turnToward(entity: Entity, yaw: number, dt: number): void {
    const current = Math.atan2(
      2 * entity.rotation[3] * entity.rotation[1],
      1 - 2 * entity.rotation[1] * entity.rotation[1],
    );
    let delta = yaw - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    if (Math.abs(delta) <= TURNED) return;
    const step = TURN_RATE * Math.max(0, dt);
    this.setYaw(entity, Math.abs(delta) <= step ? yaw : current + Math.sign(delta) * step);
  }

  /** Hand an entity to the server's movement; `updateNetwork` moves it. */
  setNetworkMotion(entity: Entity, motion: NetworkMotion): void {
    this._movers.add(entity);
    entity.network = motion;
    entity.networkMoving = motion.path.length > 0 || motion.moving;
  }

  /** The facing a body turns back to once nobody is left to look at. */
  setHomeYaw(entity: Entity, yaw: number): void {
    this._movers.add(entity);
    entity.networkHomeYaw = yaw;
  }

  /** Drop the route as well as the flag, or anything advancing the interpolator replays it. */
  stopNetworkMotion(entity: Entity): void {
    entity.network = undefined;
    entity.networkMoving = false;
  }

  reset(): void {
    for (const id of [...this.entities.keys()]) this.remove(id);
    this.entities.clear();
    this._movers.clear();
    this.byTile.clear();
    this.terrain.clear();
    this.collision.clear();
    this.player = null;
  }

  /**
   * Positions of spawn-table objects the server left out (festival scenery
   * out of season); never map scenery. Not cleared by `reset`: it arrives on
   * world entry, before the zone load. `clearHidden` forgets it on a map change.
   */
  private hidden: Array<[number, number, number]> = [];

  private static readonly HIDDEN_RADIUS = 0.5;

  setHidden(positions: ReadonlyArray<[number, number, number]>): void {
    this.hidden = positions.map(p => [...p] as [number, number, number]);
    if (this.hidden.length === 0) return;

    // Placed objects go now; arriving ones are caught in `addTile`.
    const r = World.HIDDEN_RADIUS;
    for (const [id, entity] of [...this.entities]) {
      if (!this.hides(entity.kind, entity.entry, entity.owner ?? entity.position)) continue;
      const [x, , z] = entity.position;
      this.collision.removeMatching({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r }, [
        entity.model.replace(/\.bdae$/i, '.phy'),
      ]);
      this.remove(id);
      this.entities.delete(id);
    }
  }

  clearHidden(): void {
    this.hidden = [];
  }

  /** Opened ways, kept because their tiles stream: a door must not return with its tile. */
  private readonly barriers = new Map<string, { area: OpenArea; models: string[] }>();

  /**
   * A gated way is open. Named models leave the world with their collision;
   * with none named, walls in the box stop blocking and stay drawn.
   */
  openBarrier(name: string, area: OpenArea, models: readonly string[] = []): void {
    this.barriers.set(name, { area, models: [...models] });
    this.collision.openArea(name, area);
    if (models.length === 0) return;

    this.collision.removeMatching(area, models);
    for (const [id, entity] of [...this.entities]) {
      if (entity.kind === 'creature' || entity.kind === 'player') continue;
      if (!this.barred(entity.model, entity.position)) continue;
      this.remove(id);
      this.entities.delete(id);
    }
    this._groundRevision++;
  }

  clearBarriers(): void {
    this.barriers.clear();
    this.collision.closeAllAreas();
  }

  private barred(model: string, position: readonly [number, number, number]): boolean {
    for (const { area, models } of this.barriers.values()) {
      if (models.length === 0) continue;
      if (position[0] < area.minX || position[0] > area.maxX) continue;
      if (position[2] < area.minZ || position[2] > area.maxZ) continue;
      if (models.some(name => model.includes(name))) return true;
    }
    return false;
  }

  /**
   * Vertical reach of a hidden position, looser than horizontal: a flag's
   * stars are separate placements at the top of its pole.
   */
  private static readonly HIDDEN_HEIGHT = 12;

  /** Whether the server left out a placement's object; `entry` 0 is map scenery, never left out. */
  private hides(
    kind: Entity['kind'] | undefined,
    entry: number | undefined,
    position: readonly [number, number, number],
  ): boolean {
    if (this.hidden.length === 0) return false;
    if (kind === 'creature' || kind === 'player' || !entry) return false;
    const r = World.HIDDEN_RADIUS;
    for (const [x, y, z] of this.hidden) {
      if (
        Math.abs(position[0] - x) <= r &&
        Math.abs(position[1] - y) <= World.HIDDEN_HEIGHT &&
        Math.abs(position[2] - z) <= r
      )
        return true;
    }
    return false;
  }

  addTile(data: TileData): void {
    this._groundRevision++;
    const [tx, tz] = data.tile;
    const key = tileKey(tx, tz);
    // A tile arriving twice must replace, not double.
    this.dropTile(tx, tz);

    if (data.terrain) this.terrain.add(neutraliseTint(data.terrain, this.hidden));
    if (data.collision.length > 0) {
      const solid = data.collision.filter(
        item => !this.hides(undefined, item.entry, item.pos) && !this.barred(item.path, item.pos),
      );
      if (solid.length > 0) this.collision.addGroup(key, solid);
    }

    const ids: EntityId[] = [];
    for (const p of data.placements) {
      if (this.hides(p.kind, p.entry, p.owner ?? p.position)) continue;
      if (p.kind !== 'creature' && this.barred(p.model, p.position)) continue;
      // Online, the server owns creatures; a local copy is a duplicate.
      if (!this.includeLocalCreatures && p.kind === 'creature') continue;
      const position: [number, number, number] = [...p.position];
      // Table creatures' Y is authored; settle them on terrain (neighbour
      // collision may not have arrived).
      if (p.kind === 'creature') {
        position[1] = this.restingFrom(position[0], position[1], position[2]).y;
      }
      if (p.kind === 'scenery') {
        position[1] = coverHeight(
          p.model,
          position[1],
          this.terrain.heightAt(position[0], position[2]),
        );
      }
      ids.push(
        this.add({
          kind: p.kind,
          model: p.model,
          position,
          rotation: [...p.rotation],
          scale: [...p.scale],
          entry: p.entry,
          owner: p.owner ? [...p.owner] : undefined,
          interactionIcon: p.interactionIcon,
          appearance: p.appearance,
          tile: key,
        }).id,
      );
    }
    if (ids.length > 0) this.byTile.set(key, ids);
  }

  dropTile(tx: number, tz: number): void {
    this._groundRevision++;
    const key = tileKey(tx, tz);
    this.terrain.remove(tx, tz);
    this.collision.removeGroup(key);
    const ids = this.byTile.get(key);
    if (!ids) return;
    this.byTile.delete(key);
    for (const id of ids) this.remove(id);
  }

  // — entities --------------------------------------------------------

  add(spec: Omit<Entity, 'id' | 'version'>): Entity {
    const entity: Entity = {
      ...spec,
      baseInteractionIcon: spec.baseInteractionIcon ?? spec.interactionIcon,
      id: this.nextId++,
      version: 0,
    };
    this.entities.set(entity.id, entity);
    this._membership++;
    if (entity.kind === 'creature' || entity.kind === 'player' || entity.tile === undefined) {
      this._movers.add(entity);
    }
    this.events.onEntityAdded?.(entity);
    return entity;
  }

  remove(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) return;
    this.entities.delete(id);
    this._membership++;
    this._movers.delete(entity);
    this.events.onEntityRemoved?.(id);
  }

  setPosition(entity: Entity, x: number, y: number, z: number): void {
    entity.position[0] = x;
    entity.position[1] = y;
    entity.position[2] = z;
    entity.version++;
  }

  setYaw(entity: Entity, yaw: number): void {
    const half = yaw / 2;
    entity.rotation[0] = 0;
    entity.rotation[1] = Math.sin(half);
    entity.rotation[2] = 0;
    entity.rotation[3] = Math.cos(half);
    entity.version++;
  }

  setAppearance(entity: Entity, appearance: Appearance): void {
    entity.appearance = appearance;
    entity.version++;
  }

  setQuestStatus(entity: Entity, status: string): void {
    entity.questMark = status;

    // Dedicated head icons (mailbox, storage, summon stone) never yield to quest status.
    if (entity.kind === 'static' && entity.baseInteractionIcon !== undefined) {
      entity.version++;
      return;
    }

    // Observed in play by the owner: gossip wins over an in-progress quest
    // mark; a quest to pick up or hand in wins over gossip.
    const hasGossip = ((entity.npcFlags ?? 0) & (1 << 0)) !== 0;
    entity.interactionIcon =
      hasGossip && status === 'incomplete'
        ? 'ui/icons/head/ui_head_chat.png'
        : (QUEST_STATUS_ICON[status] ?? entity.baseInteractionIcon);
    entity.version++;
  }

  // — zones, which decide only the weather -----------------------------

  /** The smallest zone containing a position (zones nest); only weather asks. */
  zoneAt(x: number, z: number): ZoneInfo | null {
    for (const z0 of this.mapZones) {
      const [x1, z1, x2, z2] = z0.bounds;
      if (
        x >= Math.min(x1, x2) &&
        x <= Math.max(x1, x2) &&
        z >= Math.min(z1, z2) &&
        z <= Math.max(z1, z2)
      )
        return z0;
    }
    return null;
  }

  private async loadMapZones(mapId: number): Promise<void> {
    try {
      const index = await this.resources.zoneIndex();
      this.mapZones = index.zones
        .filter(z => z.mapId === mapId)
        .sort((a, b) => zoneArea(a) - zoneArea(b));
    } catch {
      this.mapZones = [];
    }
  }

  /** Adopt the weather of the zone walked into; leaving every zone keeps the last. */
  private applyZoneAt(x: number, z: number): void {
    const found = this.zoneAt(x, z);
    if (!found || found.id === this.zone?.id) return;
    this.zone = found;
    this.atmosphere = found.atmosphere;
    log.debug(`entered ${found.name}`);
  }

  /**
   * The highest surface within `stepUp` of `fromY`, terrain or collision.
   * That rule alone puts you on a bridge from its ramp and under it from the ravine.
   */
  groundHeight(x: number, z: number, fromY?: number, stepUp = STEP_UP): number {
    return this.groundPoint(x, z, fromY, stepUp).y;
  }

  /** `groundHeight` plus the surface normal; the step test is what makes tunnels work. */
  groundPoint(x: number, z: number, fromY?: number, stepUp = STEP_UP): GroundPoint {
    return this.groundChoice(x, z, fromY, stepUp).point;
  }

  /** Wood where the winning surface is a wooden deck, floor or bridge; ground elsewhere. */
  surfaceAt(x: number, z: number, fromY?: number): 'ground' | 'wood' {
    return this.groundChoice(x, z, fromY, STEP_UP).wood ? 'wood' : 'ground';
  }

  private groundChoice(
    x: number,
    z: number,
    fromY: number | undefined,
    stepUp: number,
  ): { point: GroundPoint; wood: boolean } {
    const terrainY = this.terrain.heightAt(x, z);
    const from = fromY ?? this.player?.position[1] ?? terrainY ?? 0;
    // No tile yet means stay put, not y = 0: a brisk walk outruns streaming.
    const terrainPoint: GroundPoint = {
      y: terrainY ?? from,
      normal: terrainY === null ? FLAT_NORMAL : (this.terrain.normalAt(x, z) ?? FLAT_NORMAL),
    };
    const onTerrain = { point: terrainPoint, wood: false };
    if (!this.collision.isLoaded()) return onTerrain;

    const terrainQualifies = terrainY !== null && terrainY <= from + stepUp;
    const hit = this.collision.groundAt(x, z, from, stepUp);

    if (hit !== null && hit.y > (terrainQualifies ? terrainPoint.y : -Infinity)) {
      return {
        point: { y: hit.y, normal: [hit.normal[0], hit.normal[1], hit.normal[2]] },
        wood: hit.wood,
      };
    }
    // A hole in the collision data: answer with the heightmap.
    return onTerrain;
  }

  /** Decided from the ground, not the body's Y, which would flicker as it settles. */
  waterAt(x: number, z: number, fromY?: number): WaterAt {
    const from = fromY ?? this.player?.position[1] ?? 0;
    return this.terrain.waterStateAt(x, z, this.groundHeight(x, z, from));
  }

  /** Where a body at `y` comes to rest; water wins over ground when deep enough to swim. */
  restingFrom(x: number, y: number, z: number): Resting {
    const terrainY = this.terrain.heightAt(x, z);
    return this.restingHeight(x, z, Math.max(y, terrainY ?? y));
  }

  restingHeight(x: number, z: number, fromY: number, stepUp = STEP_UP): Resting {
    // Ground first, collision included, then water: the other order swims
    // you through bridges over deep water.
    const ground = this.groundPoint(x, z, fromY, stepUp);
    const water = this.terrain.waterStateAt(x, z, ground.y);
    if (water.state === 'swimming' && water.swimLine !== null) {
      return { y: water.swimLine, swimming: true, normal: FLAT_NORMAL };
    }
    return { y: ground.y, swimming: false, normal: ground.normal };
  }

  tileReport(): { centre: [number, number] | null; resident: number; pending: number } {
    const p = this.player?.position;
    return {
      centre: p ? tileOf(p[0], p[2]) : this.streamer.centreTile,
      resident: this.terrain.tileCount,
      pending: this.streamer.pending,
    };
  }

  private spawnPlayer(model: string, x: number, z: number, appearance?: Appearance): void {
    this.player = this.add({
      kind: 'player',
      // No tile: the player is not evicted with the ground they stand on.
      model,
      position: [x, 0, z],
      rotation: [...IDENTITY_ROT],
      scale: [...UNIT_SCALE],
      entry: 0,
      appearance,
    });
  }
}

function zoneArea(z: ZoneInfo): number {
  const [x1, z1, x2, z2] = z.bounds;
  return Math.abs(x2 - x1) * Math.abs(z2 - z1);
}
