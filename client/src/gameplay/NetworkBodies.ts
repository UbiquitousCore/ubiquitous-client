/** Every server-owned body: spawn, move, animate, remove. Dependencies are narrowed so it tests without a GPU. */

import { logger } from '../core/log';
import type { IdOf } from '../assets/ids';
import type { NetworkAppearance } from '../assets/types';
import { EntityMovementState, NetworkEntityMap } from '../net/GameConnection';
import type { EntityMove, EntitySnapshot, EquippedHands } from '../net/GameConnection';
import { FIELD_IDS } from '../net/unitFields';
import { MOVED_ENOUGH_TO_FACE, gameYaw } from '../world/World';
import type { Entity, EntityId, NetworkMotionKind, World } from '../world/World';
import { EntityClips } from './EntityClips';
import { IdleFidgets } from './idleFidgets';
import { combatPosture, IDLE, stunnedPosture } from './ClipMachine';
import type { CombatStance, Movement, Posture } from './ClipMachine';
import { weaponsFromHands } from './weaponClips';
import type { EquippedWeapons } from './weaponClips';
import { RUN_FORWARD_SPEED } from './PlayerMovement';
import { npcServiceIcon, objectServiceIcon } from '../assets/serviceIcons';
import { DEATH_CLIP } from './actionClips';
import { GATHERABLE_STATIC_TYPE } from './npcInteraction';

const log = logger('net-bodies');

/** How long a removed object is left to dissolve before its body goes. */
export const STATIC_FADE_OUT_MS = 500;

/** Narrowed from `Renderer`, so a test can pass an object literal. */
export interface BodyViews {
  isAnimated(id: EntityId): boolean;
  clipOf(id: EntityId): string | null;
  clipLength(id: EntityId, clip: string): number | null;
  setEntityClip(id: EntityId, clip: string, rate?: number, once?: boolean): Promise<void>;
  poseEntityClip(id: EntityId, clip: string): Promise<void>;
  setEntityClipRate(id: EntityId, rate: number): void;
  setEntityWeapons(id: EntityId, weapons: EquippedWeapons | null): void;
  setEntityAction(
    id: EntityId,
    clip: string,
    options?: { hold?: boolean; allBody?: boolean },
  ): Promise<void>;
  clearEntityAction(id: EntityId): void;
  hasHeldAction(id: EntityId): boolean;
  fadeOutEntity?(id: EntityId): void;
  refreshAppearance(entity: Entity): Promise<void>;
  /** A `mountprototype` row to carry the body, 0 for none. */
  setEntityMount(id: EntityId, mountId: number): Promise<void>;
}

export interface BodyLookups {
  networkAppearance(input: Omit<IdOf<'networkAppearance'>, 'kind'>): Promise<NetworkAppearance>;
  staticObjectModel(entry: number): Promise<NetworkAppearance>;
  /** A clip as the animation table spells it, found by name; null when absent. */
  animationNamed(name: string): Promise<string | null>;
  equippedWeapons(equipment: readonly number[]): Promise<EquippedWeapons>;
}

export type WireIdLookup = (networkId: number) => string | undefined;

export type AppearanceInput = Omit<IdOf<'networkAppearance'>, 'kind'>;

/** For the local player's own body, resolved at apply time: it may not exist yet after a zone load. */
export type UnownedAppearance = (
  networkId: number,
  equipment: number[],
  weapons?: EquippedHands,
) => void;

/** Only a bound on a load that never completes; a crowd needs the headroom. */
const MAX_PENDING_ENTITY_EVENTS = 4096;

export type PendingEntityEvent =
  | { kind: 'spawned'; snapshot: EntitySnapshot }
  | { kind: 'appearance'; networkId: number; equipment: number[]; weapons?: EquippedHands }
  | { kind: 'moved'; move: EntityMove }
  | { kind: 'removed'; networkId: number }
  | { kind: 'dead'; networkId: number; position?: [number, number, number] }
  | { kind: 'mount'; networkId: number; mountId: number };

/** Ours, generous: one dropped landing message would otherwise leave a body in `jump_air` all session. */
const AIRBORNE_TIMEOUT = 3;

/** Own choice: nearer than this a creature takes the synced position and stands; further, it walks. */
export const SYNC_WALK_MIN = 0.5;

/** One server-owned body, for animation; outlives the world entity both ways, so keyed by network id. */
interface NetworkActor {
  readonly clips: EntityClips;
  posture: Posture;
  direction: Movement;
  airborne: number;
  lastReported: [number, number, number] | null;
  lastYaw: number | null;
  /** A creature's create packet has a spawn facing, which says nothing about its walk. */
  sendsFacing: boolean;
  /** For creatures, whose movement has no facing; otherwise they slide sideways. */
  derivedYaw: number | null;
  dead: boolean;
  /** The clip a corpse lies in, posed whenever its view is (re)built. */
  corpseClip: string | null;
  /** Whether the current view already lies in `corpseClip`. */
  posed: boolean;
  pendingEmote: string | null;
  /** The `mountprototype` row it rides, 0 on foot; held from before the body exists. */
  mount: number;
  /** Held until the body has a mixer, or it is lost. `hold` marks a cast wind-up. */
  pendingAction: { clip: string; hold: boolean; allBody: boolean } | null;
  releaseAction: boolean;
  wasMoving: boolean;
  /** For `ubiquitous.net()`: a request for a clip the model lacks is silently dropped. */
  asked: string | null;
  /** Null means weapon down; held between blows until the attack stops. */
  stance: CombatStance;
  rate: number;
  /** A creature's resting clip, replacing the `idle` loop. */
  restingClip: string | null;
  /** When this body next breaks up its idle; see `idleFidgets.ts`. */
  fidgets: IdleFidgets;
  /** What the look was resolved from; the server does not resend it with an equipment change. */
  appearanceInput: AppearanceInput | null;
  grounded: boolean;
  /** World ground revision used by the last ground pass. */
  groundRevision: number;
}

function newActor(random: () => number): NetworkActor {
  return {
    fidgets: new IdleFidgets(random),
    clips: new EntityClips(),
    mount: 0,
    posture: 'stand',
    direction: 'stop',
    airborne: 0,
    lastReported: null,
    lastYaw: null,
    sendsFacing: false,
    derivedYaw: null,
    dead: false,
    corpseClip: null,
    posed: false,
    pendingEmote: null,
    pendingAction: null,
    releaseAction: false,
    wasMoving: false,
    asked: null,
    stance: null,
    rate: 1,
    restingClip: null,
    appearanceInput: null,
    grounded: false,
    groundRevision: -1,
  };
}

/** Forward, backward or sideways, from facing against travel. */
export function directionOf(dx: number, dz: number, yaw: number): Movement {
  if (Math.hypot(dx, dz) < MOVED_ENOUGH_TO_FACE) return 'forward';
  // A body at yaw `a` faces `(sin a, cos a)`; its right is `(-cos a, sin a)`.
  const ahead = Math.sin(yaw) * dx + Math.cos(yaw) * dz;
  const beside = Math.sin(yaw) * dz - Math.cos(yaw) * dx;
  if (Math.abs(beside) > Math.abs(ahead)) return beside >= 0 ? 'right' : 'left';
  return ahead >= 0 ? 'forward' : 'backward';
}

function postureOf(state: EntityMovementState | undefined): Posture {
  switch (state) {
    case EntityMovementState.Jumping:
      return 'jump';
    case EntityMovementState.Falling:
      return 'fall';
    case EntityMovementState.Landed:
      return 'landStill';
    case EntityMovementState.LandedMoving:
      return 'landMoving';
    case EntityMovementState.Swimming:
      return 'swim';
    case EntityMovementState.Standing:
      return 'stand';
    default:
      return 'run';
  }
}

/** A walk covers about 0.4 of a run's ground (1.4 against 3.5 m/s). */
const WALK_PACE = 0.4;

/** Own choice: a quarter over the walk pace; much faster and the walk clip's feet slide. */
const RUN_FROM = WALK_PACE * 1.25;

/** `runSpeed` is the body's own, when the server described one, else the player's. */
export function gaitFor(speed: number, runSpeed: number | undefined): 'walk' | 'run' {
  const full = runSpeed !== undefined && runSpeed > 0 ? runSpeed : RUN_FORWARD_SPEED;
  return speed >= RUN_FROM * full ? 'run' : 'walk';
}

/** Own choice: past twice its pace a stride flickers, so faster bodies slide a little. */
const MAX_CLIP_RATE = 2;

/** Rounded to tenths: a new rate restarts the clip. `x * 10` lands on exact tenths. */
const CLIP_RATE_TENTHS = 10;

/**
 * The larger of `speed / baseSpeed` and `1 + speedBonus`, clamped to
 * [1, `MAX_CLIP_RATE`]. A clip is never slowed below its own pace.
 */
export function clipRateFor(speed: number, baseSpeed: number | undefined, speedBonus = 0): number {
  const haste = Number.isFinite(speedBonus) ? 1 + speedBonus : 1;
  const outpace =
    baseSpeed !== undefined && baseSpeed > 0 && Number.isFinite(speed) ? speed / baseSpeed : 1;
  const rate = Math.min(MAX_CLIP_RATE, Math.max(1, haste, outpace));
  return Math.round(rate * CLIP_RATE_TENTHS) / CLIP_RATE_TENTHS;
}

/**
 * How near the route's end the sync position must be to count as where the
 * walk ends. A stopped body still carries a `target`; following a distant one
 * snaps it across the zone.
 */
const SETTLE_RADIUS = 3;

function settleTarget(
  lastNode: [number, number, number],
  sync: [number, number, number] | undefined,
): [number, number, number] {
  if (!sync) return [...lastNode];
  const away = Math.hypot(sync[0] - lastNode[0], sync[2] - lastNode[2]);
  return away <= SETTLE_RADIUS ? [...sync] : [...lastNode];
}

/**
 * The ground under a body, never further down than `MAX_SETTLE_DROP`: the
 * search falls back to the heightmap (indoors, the field under the building).
 */
function groundUnder(world: World, x: number, y: number, z: number): number {
  const resting = world.restingFrom(x, y, z).y;
  return resting < y - MAX_SETTLE_DROP ? y : resting;
}

/** Ours: a real step or slope, never a storey (that is the search failing to the heightmap). */
const MAX_SETTLE_DROP = 3;

const AIRBORNE: ReadonlySet<Posture> = new Set<Posture>(['jump', 'fall']);

const ON_FOOT: ReadonlySet<Posture> = new Set<Posture>([
  'stand',
  'run',
  'walk',
  'guardMelee',
  'guardRanged',
]);

export class NetworkBodies {
  /** Server ids to the world's own; cleared on every zone change. */
  private readonly networkEntities = new NetworkEntityMap();

  /** False across a zone load: `World.loadZone` resets the world. */
  private networkReady = false;

  /** Events before the zone exists; unqueued, the zone reset would wipe them. */
  private pendingEntityEvents: PendingEntityEvent[] = [];

  private readonly networkActors = new Map<number, NetworkActor>();

  constructor(
    private readonly world: World,
    private readonly views: BodyViews,
    private readonly lookups: BodyLookups,
    private readonly wireIdFor: WireIdLookup = () => undefined,
    private readonly unownedAppearance: UnownedAppearance = () => {},
    private readonly random: () => number = Math.random,
  ) {}

  /** Creatures that stopped out of a fight since `takeStopped`; they often speak then. */
  private stopped: number[] = [];
  private readonly hands = new Map<EntityId, EquippedHands>();

  /** Asking empties it. */
  takeStopped(): number[] {
    const out = this.stopped;
    this.stopped = [];
    return out;
  }

  get ready(): boolean {
    return this.networkReady;
  }

  networkIdOf(local: EntityId): number | undefined {
    return this.networkEntities.network(local);
  }

  worldPosition(networkId: number): [number, number, number] | null {
    const local = this.networkEntities.local(networkId);
    if (local === undefined) return null;
    const entity = this.world.entities.get(local);
    return entity ? [...entity.position] : null;
  }

  localIdOf(networkId: number): EntityId | undefined {
    return this.networkEntities.local(networkId);
  }

  /** Creature entry, and the display row standing in for one; undefined when unknown. */
  voiceOf(
    networkId: number,
  ): { entry: number; displayInfoId: number; race: number; gender: number } | undefined {
    const input = this.networkActors.get(networkId)?.appearanceInput;
    return input
      ? {
          entry: input.entry,
          displayInfoId: input.displayInfoId,
          race: input.race,
          gender: input.gender,
        }
      : undefined;
  }

  handsOf(networkId: number): EquippedHands | undefined {
    const local = this.networkEntities.local(networkId);
    return local === undefined ? undefined : this.hands.get(local);
  }

  genderOf(networkId: number): number | undefined {
    return this.networkActors.get(networkId)?.appearanceInput?.gender;
  }

  healthOf(networkId: number): { health: number; maxHealth: number } | undefined {
    const local = this.networkEntities.local(networkId);
    if (local === undefined) return undefined;
    const entity = this.world.entities.get(local);
    const health = entity?.networkHealth;
    const maxHealth = entity?.networkMaxHealth;
    if (typeof health !== 'number' || typeof maxHealth !== 'number') return undefined;
    return { health, maxHealth };
  }

  /** A body's name for read-out lines; undefined when unknown or sent only as a string id. */
  nameOf(networkId: number): string | undefined {
    const local = this.networkEntities.local(networkId);
    if (local === undefined) return undefined;
    const entity = this.world.entities.get(local);
    const name = entity?.networkName;
    return typeof name === 'string' && name !== '' ? name : undefined;
  }

  /** Map the server id of the client-owned player body. Call after `open`. */
  linkSelf(networkId: number, local: EntityId): void {
    this.networkEntities.link(networkId, local);
  }

  /** Through the body's clip machine, so moving cancels it; held until the body can play it. */
  playAction(networkId: number, clip: string, hold: boolean, allBody = false): void {
    const actor = this.networkActors.get(networkId);
    if (!actor) return;
    actor.pendingAction = { clip, hold, allBody };
    actor.releaseAction = false;
  }

  /** A whole-body one-shot (emote, quest gesture): survives a guard coming down, ends on moving. */
  gesture(networkId: number, clip: string): void {
    const actor = this.networkActors.get(networkId);
    if (!actor || actor.dead) return;
    actor.pendingEmote = clip;
  }

  stopAction(networkId: number): void {
    const actor = this.networkActors.get(networkId);
    if (!actor) return;
    actor.pendingAction = null;
    actor.releaseAction = true;
  }

  /** The server says when attacking starts and stops, nothing between; a stance never expires. */
  stanceOf(networkId: number): CombatStance {
    return this.networkActors.get(networkId)?.stance ?? null;
  }

  setStance(networkId: number, stance: CombatStance): void {
    const actor = this.networkActors.get(networkId);
    if (actor) actor.stance = stance;
  }

  /** Seat a body on a mount (0 for none); a body not built yet is seated when it is. */
  setMount(networkId: number, mountId: number): void {
    this.take({ kind: 'mount', networkId, mountId });
  }

  private seat(networkId: number, mountId: number): void {
    const actor = this.actorFor(networkId);
    actor.mount = mountId;
    actor.clips.setMounted(mountId > 0);
    const local = this.networkEntities.local(networkId);
    if (local !== undefined) void this.views.setEntityMount(local, mountId);
  }

  /**
   * Point a body at its target (both server ids), or at nobody: an unknown or
   * null target turns it back to its spawn facing after a delay.
   */
  setFaceTarget(networkId: number, targetNetworkId: number | null): void {
    const local = this.networkEntities.local(networkId);
    if (local === undefined) return;
    const entity = this.world.entities.get(local);
    if (!entity) return;
    const targetLocal =
      targetNetworkId === null ? undefined : this.networkEntities.local(targetNetworkId);
    this.world.setFaceTarget(entity, targetLocal ?? null);
  }

  /** Stop accepting events (zone load, disconnect); queue until `open`. */
  close(): void {
    this.networkReady = false;
  }

  /** Take an entity event, or queue it; the queue holds events, so order survives. */
  take(event: PendingEntityEvent): void {
    if (!this.networkReady) {
      if (this.pendingEntityEvents.length >= MAX_PENDING_ENTITY_EVENTS) {
        // A zone load that never finished, most likely; keep the newest.
        this.pendingEntityEvents.shift();
        log.once(
          'warn',
          'entity-queue-full',
          `over ${MAX_PENDING_ENTITY_EVENTS} entity events queued during a zone load`,
        );
      }
      this.pendingEntityEvents.push(event);
      return;
    }
    this.apply(event, true);
  }

  /** `live`: just off the wire rather than replayed. Matters only to an appearance change. */
  private apply(event: PendingEntityEvent, live: boolean): void {
    if (event.kind === 'spawned') {
      this.spawnBody(event.snapshot);
      return;
    }

    if (event.kind === 'appearance') {
      this.changeAppearance(event.networkId, event.equipment, live, event.weapons);
      return;
    }

    if (event.kind === 'mount') {
      this.seat(event.networkId, event.mountId);
      return;
    }

    if (event.kind === 'removed') {
      this.networkActors.delete(event.networkId);
      const local = this.networkEntities.unlink(event.networkId);
      if (local === undefined) return;
      const entity = this.world.entities.get(local);
      // A tile-owned entity merged with its network identity (`staticTwin`):
      // only the tile may remove it; a despawn just drops the identity.
      if (entity?.tile !== undefined) entity.networkId = undefined;
      else if (entity?.kind === 'static' && this.views.fadeOutEntity) {
        this.views.fadeOutEntity(local);
        setTimeout(() => this.world.remove(local), STATIC_FADE_OUT_MS);
      } else this.world.remove(local);
      return;
    }

    if (event.kind === 'dead') {
      const actor = this.networkActors.get(event.networkId);
      if (!actor) return;
      // Sent twice per body; the second would replay the death.
      if (actor.dead) return;
      actor.dead = true;
      actor.posture = 'stand';
      actor.direction = 'stop';

      /*
       * A corpse does not finish its walk: placed where it died, grounded, and
       * stopped outright, or the route it was walking slides it away.
       * `lastReported` resets so the next sync measures from here.
       */
      const local = this.networkEntities.local(event.networkId);
      const entity = local === undefined ? undefined : this.world.entities.get(local);
      if (entity) {
        entity.networkDead = true;
        if (event.position) {
          const [x, y, z] = event.position;
          this.world.setPosition(entity, x, groundUnder(this.world, x, y, z), z);
        }
        this.world.stopNetworkMotion(entity);
      }
      actor.lastReported = event.position ? [...event.position] : actor.lastReported;

      void this.lookups.animationNamed(DEATH_CLIP).then(name => {
        if (this.networkActors.get(event.networkId) !== actor) return;
        actor.pendingEmote = name ?? 'idle';
        actor.corpseClip = name;
      });
      return;
    }

    this.applyMove(event.move);
  }

  /** A batch names only values that moved. */
  updateValues(update: { networkId: number; values: Record<string, number> }): void {
    const local = this.networkEntities.local(update.networkId);
    if (local === undefined) return;
    const entity = this.world.entities.get(local);
    if (!entity) return;
    const v = update.values;
    if (v[FIELD_IDS.level] !== undefined) entity.networkLevel = v[FIELD_IDS.level];
    if (v[FIELD_IDS.health] !== undefined) entity.networkHealth = v[FIELD_IDS.health];
    if (v[FIELD_IDS.maxHealth] !== undefined) entity.networkMaxHealth = v[FIELD_IDS.maxHealth];
    if (v[FIELD_IDS.power] !== undefined) entity.networkPower = v[FIELD_IDS.power];
    if (v[FIELD_IDS.maxPower] !== undefined) entity.networkMaxPower = v[FIELD_IDS.maxPower];
  }

  /** Transform to the world, state to the actor; recorded before the body exists. */
  private applyMove(move: EntityMove): void {
    const actor = this.actorFor(move.networkId);
    // Nothing moves a corpse: the death message is authoritative.
    if (actor.dead) return;
    // The wire's convention, in and out; `gameYaw` converts at this boundary.
    const facing = move.orientation === undefined ? undefined : gameYaw(move.orientation);

    if (move.position !== undefined) {
      // Server to server: against the drawn position, smoothing lag reads as backwards.
      const previous = actor.lastReported ?? move.position;
      const dx = move.position[0] - previous[0];
      const dz = move.position[2] - previous[2];

      // A bare position with no facing or moving flag is the far-ring sync:
      // a correction, not a description; never read a direction from it.
      const describesMovement = move.moving !== undefined || move.path !== undefined;

      if (facing !== undefined) {
        // A player: `velocity` is the instant's travel; differencing is the noisier fallback.
        actor.direction =
          move.velocity !== undefined
            ? directionOf(move.velocity[0], move.velocity[2], facing)
            : directionOf(dx, dz, facing);
      } else if (Math.hypot(dx, dz) > MOVED_ENOUGH_TO_FACE && !describesMovement) {
        // Far-ring sync: position only. Derive a facing, but leave `direction`
        // alone — somebody backing up goes on backing up.
        actor.derivedYaw = Math.atan2(dx, dz);
      } else if (describesMovement && Math.hypot(dx, dz) > MOVED_ENOUGH_TO_FACE) {
        // A creature: no facing on the wire at all, so it faces its travel.
        actor.derivedYaw = Math.atan2(dx, dz);
        actor.direction = 'forward';
      }
      actor.lastReported = [...move.position];
    }
    if (facing !== undefined) {
      actor.lastYaw = facing;
      // This body sends facings; never guess one from travel again.
      actor.sendsFacing = true;
      actor.derivedYaw = null;
    }

    // A player names its state, a creature only whether it moves, and the
    // far-ring sync neither, so the sync leaves posture alone. The dead keep
    // their pose whatever movement still arrives.
    if (!actor.dead) {
      const posture =
        move.state !== undefined
          ? postureOf(move.state)
          : move.moving !== undefined
            ? move.moving
              ? 'run'
              : 'stand'
            : null;
      if (posture !== null) {
        if (!AIRBORNE.has(posture) || !AIRBORNE.has(actor.posture)) actor.airborne = 0;
        actor.posture = posture;
      }
    }

    const local = this.networkEntities.local(move.networkId);
    const entity = local === undefined ? undefined : this.world.entities.get(local);
    if (!entity) return;

    const previousMotion = entity.network;
    // The third-ring sync: where the body is, not that it stopped.
    const sparsePosition =
      move.position !== undefined &&
      move.moving === undefined &&
      move.path === undefined &&
      move.target === undefined;

    // Only what the server said: a missing facing keeps the old one. From
    // `pathStep` on: earlier nodes are walked, and re-walking them reverses.
    const path = (move.path ?? [])
      .slice(Math.max(0, move.pathStep ?? 0))
      .map(node => [node.x, node.y, node.z] as [number, number, number]);

    // A waypoint mover ships no path; its route is the straight line to
    // `target`. Ignoring it left those creatures teleporting between updates.
    if (path.length === 0 && move.target !== undefined && move.moving !== false) {
      path.push([...move.target]);
    }

    /*
     * A position sync is not a stop: a routeless sync closer than
     * `SYNC_WALK_MIN` takes the position and stops; further, it is a
     * one-node route walked to (an exhausted route is itself the stop).
     */
    const syncPosition = move.position;
    const walksToSync =
      path.length === 0 &&
      move.moving === false &&
      syncPosition !== undefined &&
      entity.kind === 'creature' &&
      (move.speed ?? 0) > 0 &&
      Math.hypot(syncPosition[0] - entity.position[0], syncPosition[2] - entity.position[2]) >
        SYNC_WALK_MIN;
    if (walksToSync) {
      path.push([...syncPosition]);
      // Travelling, or the clip layer plays `idle` over the walk.
      if (!actor.dead) actor.posture = 'run';
    }

    /* A creature with a route is going forward. */
    if (!actor.sendsFacing && !actor.dead && (path.length > 0 || move.moving === true)) {
      actor.direction = 'forward';
    }

    // A player with a speed block is walked along it, not eased between snapshots.
    const replayBarePosition =
      path.length === 0 &&
      move.position !== undefined &&
      move.speed === undefined &&
      move.moving === undefined &&
      previousMotion?.moving === true &&
      previousMotion.speed > 0;
    const isSegment =
      !sparsePosition &&
      path.length === 0 &&
      move.position !== undefined &&
      (move.speed ?? (replayBarePosition ? previousMotion!.speed : 0)) > 0 &&
      move.moving !== false;
    if (isSegment) path.push([...move.position!]);

    // `collapsed` is `World`'s degraded route with no usable speed.
    const kind: NetworkMotionKind = isSegment ? 'segment' : path.length > 0 ? 'route' : 'reported';

    // Signed: the bonus can slow a body as well as haste it.
    const speedBonus = move.speedBonus ?? previousMotion?.speedBonus ?? 0;
    const travelSpeed = move.speed === undefined ? undefined : move.speed * (1 + speedBonus);

    this.world.setNetworkMotion(entity, {
      // The route's last node, preferring the server's finish position; the
      // message position is the walk's start.
      target:
        path.length > 0
          ? settleTarget(path[path.length - 1]!, move.target)
          : (move.position ?? [...entity.position]),
      // The message's facing, else the last one sent, unless the body stopped:
      // inheriting it at a leg's end pins the arrival heading. The fallback
      // keeps a reversing player facing forward through far-ring syncs.
      yaw:
        facing ??
        (move.moving === false
          ? undefined
          : actor.sendsFacing
            ? (actor.lastYaw ?? undefined)
            : undefined),
      // Only a creature never sends a facing; travel is the only answer.
      faceTravel: !actor.sendsFacing,
      kind,
      path,
      speed: travelSpeed ?? (replayBarePosition ? previousMotion!.speed : 0),
      baseSpeed: move.speed ?? previousMotion?.baseSpeed,
      speedBonus: move.speedBonus ?? previousMotion?.speedBonus,
      velocity: move.velocity ?? previousMotion?.velocity,
      extrapolate: sparsePosition && previousMotion?.moving === true,
      moving:
        move.moving ??
        (replayBarePosition ? previousMotion!.moving : (entity.networkMoving ?? false)),
    });
  }

  /** A zone load finished; every previous id pairing is stale. */
  open(): void {
    this.networkEntities.clear();
    // Actors are keyed by network id, which the server will reuse.
    this.networkActors.clear();
    this.networkReady = true;

    const queued = this.pendingEntityEvents;
    this.pendingEntityEvents = [];
    if (queued.length > 0) {
      log.info(`applying ${queued.length} entity event(s) held during the zone load`);
    }
    for (const event of queued) this.apply(event, false);
  }

  /**
   * The local tile-placed static this snapshot already is, matched on entry
   * and position (as `Game.networkTwinOf` does the other way round).
   */
  private staticTwin(snapshot: EntitySnapshot): Entity | undefined {
    const RADIUS_SQ = 4 * 4;
    for (const entity of this.world.entities.values()) {
      if (entity.kind !== 'static' || entity.tile === undefined) continue;
      if (entity.entry !== snapshot.entry || entity.networkId !== undefined) continue;
      const dx = entity.position[0] - snapshot.position[0];
      const dy = entity.position[1] - snapshot.position[1];
      const dz = entity.position[2] - snapshot.position[2];
      if (dx * dx + dy * dy + dz * dz <= RADIUS_SQ) return entity;
    }
    return undefined;
  }

  /** Identity, position and facing from the server; the model resolved locally. */
  private spawnBody(snapshot: EntitySnapshot): void {
    if (this.networkEntities.local(snapshot.networkId) !== undefined) return; // already known
    const input: AppearanceInput = {
      entry: snapshot.entry,
      displayInfoId: snapshot.displayInfoId,
      race: snapshot.race,
      gender: snapshot.gender,
      skin: snapshot.appearance.skin,
      face: snapshot.appearance.face,
      hairStyle: snapshot.appearance.hairStyle,
      hairColor: snapshot.appearance.hairColour,
      equipment: snapshot.equipment,
      animationId: snapshot.animationId,
    };
    this.actorFor(snapshot.networkId).appearanceInput = input;
    // Static objects have no `creature_proto` row; `networkAppearance` cannot resolve them.
    const resolveModel =
      snapshot.kind === 'staticObject'
        ? this.lookups.staticObjectModel(snapshot.entry)
        : this.lookups.networkAppearance(input);
    void resolveModel
      .then(look => {
        if (this.networkEntities.local(snapshot.networkId) !== undefined) return;
        const networkFields = {
          networkId: snapshot.networkId,
          npcFlags: snapshot.npcFlags,
          offersQuests: snapshot.offersQuests,
          gatherable:
            snapshot.kind === 'staticObject' &&
            snapshot.canInteract === true &&
            snapshot.staticObjectType === GATHERABLE_STATIC_TYPE
              ? true
              : undefined,
          questMark: 'none' as const,
          baseInteractionIcon:
            snapshot.npcFlags === undefined ? undefined : npcServiceIcon(snapshot.npcFlags),
          // No quest mark until the per-player status sweep says so: the
          // quest-giver flag would put "!" over every flagged trainer.
          interactionIcon:
            snapshot.kind === 'staticObject'
              ? objectServiceIcon(snapshot.staticObjectType, snapshot.canInteract)
              : snapshot.npcFlags === undefined
                ? undefined
                : npcServiceIcon(snapshot.npcFlags),
          appearance: look.appearance,
          networkNameId: snapshot.nameId,
          networkName: snapshot.name,
          networkSubNameId: snapshot.subNameId,
          networkLevel: snapshot.level,
          networkClass: snapshot.class,
          networkHealth: snapshot.health,
          networkMaxHealth: snapshot.maxHealth,
          networkPower: snapshot.power,
          networkMaxPower: snapshot.maxPower,
          networkFaction: snapshot.faction,
          networkBaseSpeed: snapshot.baseSpeed,
          networkDead: snapshot.dead,
          networkNeverFightsBack: snapshot.neverFightsBack,
          networkInCombat: snapshot.inCombat,
          networkLootable: snapshot.lootable,
        };
        // The local spawn table already places this static object; `staticTwin`
        // adds the network identity to it instead of drawing it twice.
        const twin = snapshot.kind === 'staticObject' ? this.staticTwin(snapshot) : undefined;
        const entity =
          twin ??
          this.world.add({
            kind:
              snapshot.kind === 'staticObject' ? 'static' : snapshot.entry ? 'creature' : 'player',
            model: look.model,
            position: [...snapshot.position],
            rotation: [0, 0, 0, 1],
            scale: [look.scale, look.scale, look.scale],
            entry: snapshot.entry,
            ...networkFields,
          });
        if (twin) {
          // An object's own head icon (summon stone, mailbox) is what any
          // quest mark falls back to; it goes only when the server says the
          // object cannot be used.
          const icon =
            snapshot.canInteract === false
              ? undefined
              : (networkFields.interactionIcon ?? twin.baseInteractionIcon);
          Object.assign(entity, networkFields, {
            interactionIcon: icon,
            baseInteractionIcon: icon,
          });
          entity.version++;
        }
        // A mount the body was given while its model resolved.
        const riding = this.networkActors.get(snapshot.networkId)?.mount ?? 0;
        if (riding > 0) void this.views.setEntityMount(entity.id, riding);
        // Already dead on first sight: posed, not played, once it has a view.
        if (snapshot.dead) {
          const actor = this.actorFor(snapshot.networkId);
          actor.dead = true;
          actor.posture = 'stand';
          actor.direction = 'stop';
          void this.lookups.animationNamed(DEATH_CLIP).then(name => {
            if (this.networkActors.get(snapshot.networkId) !== actor) return;
            actor.corpseClip = name;
          });
        }
        // The wire's convention, like the spawn tables; skipping `gameYaw` mirrors the body.
        this.world.setYaw(entity, gameYaw(snapshot.orientation));
        // Its home facing, restored after a fight.
        this.world.setHomeYaw(entity, gameYaw(snapshot.orientation));
        this.networkEntities.link(snapshot.networkId, entity.id);
        // A character asked for a bare clip name gets nothing. The server names
        // no kind for a creature; its entry does, and its hands are its look's.
        this.applyWeapons(
          entity.id,
          snapshot.kind === 'staticObject' ? snapshot.kind : snapshot.entry ? 'creature' : 'player',
          snapshot.equipment,
          snapshot.weapons ?? look.heldItems,
        );

        const actor = this.actorFor(snapshot.networkId);
        actor.lastReported ??= [...snapshot.position];
        actor.lastYaw ??= gameYaw(snapshot.orientation);
        // The spawn's animation replaces `idle`, always looped: playing the
        // non-looping ones once would stop talking NPCs talking.
        actor.restingClip = look.animationName ?? null;
      })
      .catch(err =>
        log.warn(
          `could not resolve network entity ${snapshot.entry}/${snapshot.displayInfoId}: ${String(err)}`,
        ),
      );
  }

  /**
   * Re-dress a body; the message carries only equipment. An unowned id is the
   * local player's, but only when live: during a replay it is a body from the
   * zone just left.
   */
  private changeAppearance(
    networkId: number,
    equipment: number[],
    live: boolean,
    hands?: EquippedHands,
  ): void {
    const actor = this.networkActors.get(networkId);
    const input = actor?.appearanceInput;
    if (!actor || !input) {
      if (live) this.unownedAppearance(networkId, equipment, hands);
      else log.debug(`dropping appearance for ${networkId}, gone with the last zone`);
      return;
    }
    const wanted: AppearanceInput = { ...input, equipment };
    void this.lookups
      .networkAppearance(wanted)
      .then(look => {
        if (!look.appearance) return;
        // Identity, not presence: the id may belong to someone else after a zone reset.
        if (this.networkActors.get(networkId) !== actor) return;
        const local = this.networkEntities.local(networkId);
        if (local === undefined) return;
        const entity = this.world.entities.get(local);
        if (!entity) return;
        actor.appearanceInput = wanted;
        this.applyWeapons(entity.id, 'player', equipment, hands);
        this.world.setAppearance(entity, look.appearance);
        void this.views.refreshAppearance(entity);
      })
      .catch(err => log.warn(`could not refresh entity ${networkId} appearance: ${String(err)}`));
  }

  /**
   * Put bodies on the ground the client has; the server's Y can be stale while
   * local tiles load. Never applied to a jump or fall.
   */
  settle(): void {
    const groundRevision = this.world.groundRevision;
    for (const [networkId, actor] of this.networkActors) {
      if (AIRBORNE.has(actor.posture)) continue;
      const local = this.networkEntities.local(networkId);
      if (local === undefined) continue;
      const entity = this.world.entities.get(local);
      if (!entity || entity.kind !== 'creature') continue;
      if (!entity.networkMoving && actor.grounded && actor.groundRevision === groundRevision)
        continue;

      const [x, y, z] = entity.position;
      const resting = this.world.restingFrom(x, y, z);
      // A settle may lift a body any distance but drop it only a step: indoors
      // the search falls back to the heightmap under the building, and taking
      // it sinks the body out of the world a tick at a time.
      if (resting.y < y - MAX_SETTLE_DROP) {
        actor.grounded = true;
        actor.groundRevision = groundRevision;
        continue;
      }
      if (resting.y !== y) {
        this.world.setPosition(entity, x, resting.y, z);
        // Tell the interpolator, or its ease-back fights the settle; a route's
        // end height is left alone mid-route.
        const motion = entity.network;
        if (motion && motion.path.length === 0) motion.target[1] = resting.y;
      }
      actor.grounded = true;
      actor.groundRevision = groundRevision;
    }
  }

  report(): Array<Record<string, unknown>> {
    const rows: Array<Record<string, unknown>> = [];
    for (const [networkId, actor] of this.networkActors) {
      const local = this.networkEntities.local(networkId);
      const entity = local === undefined ? undefined : this.world.entities.get(local);
      rows.push({
        networkId,
        wire: this.wireIdFor(networkId) ?? '',
        model: entity?.model.split('/').pop() ?? '(no body yet)',
        posture: actor.posture,
        health: entity?.networkHealth ?? null,
        maxHealth: entity?.networkMaxHealth ?? null,
        direction: actor.direction,
        moving: entity?.networkMoving ?? null,
        stance: actor.stance,
        yaw: actor.lastYaw === null ? null : Number(actor.lastYaw.toFixed(3)),
        path: entity?.network?.path.length ?? 0,
        motion: entity?.network?.kind ?? null,
        target: entity?.network
          ? entity.network.target.map(n => Number(n.toFixed(1))).join(', ')
          : null,
        speed: entity?.network?.speed ?? null,
        // A gap that does not shrink at `speed` to zero means a stuck or unreachable target.
        at: entity ? entity.position.map(n => Number(n.toFixed(1))).join(', ') : null,
        gap: entity?.network
          ? Number(
              Math.hypot(
                entity.network.target[0] - entity.position[0],
                entity.network.target[2] - entity.position[2],
              ).toFixed(2),
            )
          : null,
        baseSpeed: entity?.networkBaseSpeed ?? null,
        // Movement message's base, falling back to the create block's, as the clip layer does.
        rate: Number(
          clipRateFor(
            entity?.network?.speed ?? 0,
            entity?.network?.baseSpeed ?? entity?.networkBaseSpeed,
            entity?.network?.speedBonus,
          ).toFixed(2),
        ),
        dead: actor.dead,
        // Differs from the playing clip when the model lacks it and the request was dropped.
        asked: actor.asked,
        clip: local === undefined ? null : this.views.clipOf(local),
        animated: local === undefined ? false : this.views.isAnimated(local),
      });
    }
    return rows;
  }

  /**
   * Hand a body's held items to the renderer. A creature with described hands
   * resolves like a player (humanoid NPCs ship suffixed clips); one without
   * gets `null` and keeps a beast's bare names.
   */
  private applyWeapons(
    local: EntityId,
    kind: string | undefined,
    equipment: number[],
    hands?: EquippedHands,
  ): void {
    if (kind === 'staticObject') return;
    if (hands) this.hands.set(local, hands);
    else this.hands.delete(local);
    if (kind === 'creature') {
      this.views.setEntityWeapons(local, hands ? weaponsFromHands(hands, 'creature') : null);
      return;
    }
    if (hands) {
      this.views.setEntityWeapons(local, weaponsFromHands(hands));
      return;
    }
    void this.lookups
      .equippedWeapons(equipment)
      .then(weapons => this.views.setEntityWeapons(local, weapons))
      .catch(() => {
        /* unarmed still animates */
      });
  }

  private actorFor(networkId: number): NetworkActor {
    let actor = this.networkActors.get(networkId);
    if (!actor) {
      actor = newActor(this.random);
      this.networkActors.set(networkId, actor);
    }
    return actor;
  }

  /** The player's clip machine, fed from network posture and direction instead. */
  updateClips(dt: number): void {
    for (const [networkId, actor] of this.networkActors) {
      const local = this.networkEntities.local(networkId);
      if (local === undefined) continue;
      const entity = this.world.entities.get(local);
      if (!entity) continue;

      // No mixer yet: clear the record so the first clip is re-issued once there is.
      if (!this.views.isAnimated(local)) {
        actor.clips.invalidate();
        actor.posed = false;
        continue;
      }

      const durationOf = (clip: string): number | null => this.views.clipLength(local, clip);

      if (actor.dead) {
        if (actor.pendingEmote !== null) {
          const deathClip = actor.pendingEmote;
          actor.pendingEmote = null;
          void this.views.setEntityClip(local, deathClip, 1, true);
          actor.posed = true;
        } else if (!actor.posed && actor.corpseClip !== null) {
          void this.views.poseEntityClip(local, actor.corpseClip);
          actor.posed = true;
        }
        continue;
      }

      if (actor.pendingEmote !== null) {
        actor.clips.playOnce(actor.pendingEmote, durationOf);
        actor.pendingEmote = null;
      }

      // Combat clips skip the sequencer: they run on the upper body over the movement level.
      if (actor.releaseAction) {
        this.views.clearEntityAction(local);
        actor.releaseAction = false;
      }
      if (actor.pendingAction !== null) {
        const { clip, hold, allBody } = actor.pendingAction;
        actor.pendingAction = null;
        void this.views.setEntityAction(local, clip, { hold, allBody });
      }

      if (AIRBORNE.has(actor.posture)) {
        actor.airborne += dt;
        if (actor.airborne > AIRBORNE_TIMEOUT) {
          log.once(
            'warn',
            `airborne:${networkId}`,
            `network entity ${networkId} was airborne for ${AIRBORNE_TIMEOUT}s with no landing`,
          );
          actor.posture = 'stand';
          actor.airborne = 0;
        }
      }

      // The world's answer, not the server's flag: a creature at its path's
      // end has stopped, or it runs on the spot.
      const moving = entity.networkMoving === true;
      if (actor.wasMoving && !moving && entity.kind === 'creature' && !entity.networkInCombat) {
        this.stopped.push(networkId);
      }
      actor.wasMoving = moving;
      const speed = entity.network?.speed ?? 0;
      // Walking has its own row (`walk_forward`), not a slowed run.
      const gait: Posture = gaitFor(speed, entity.networkBaseSpeed);

      // Moving ends a chant (the server interrupts it too); swings play over the run.
      if (moving && this.views.hasHeldAction(local)) {
        this.views.clearEntityAction(local);
      }
      const grounded = ON_FOOT.has(actor.posture);
      const posture: Posture = grounded
        ? // A drawn weapon replaces the standing and running postures and only
          // those: a body in the air or in the water is not holding a guard.
          stunnedPosture(
            entity.networkStunned === true,
            combatPosture(actor.stance, moving ? gait : 'stand'),
          )
        : actor.posture;
      /*
       * A moving body is never in the stop row; an unset direction while the
       * world moves it would fall through to `idle` and slide.
       */
      const movement: Movement = !moving
        ? 'stop'
        : actor.direction === 'stop'
          ? 'forward'
          : actor.direction;

      // Only on plain idle: a body sitting, working or talking keeps at it.
      const idling =
        entity.kind === 'creature' &&
        !moving &&
        posture === 'stand' &&
        actor.restingClip === null &&
        !actor.clips.busy &&
        !this.views.hasHeldAction(local);
      const fidget = actor.fidgets.update(dt, idling);
      if (fidget) actor.clips.playOnce(fidget, durationOf);

      const want = actor.clips.update(posture, movement, dt, durationOf);
      // Timed against the latest movement message's speed; the create block is the fallback.
      const rate = clipRateFor(
        speed,
        entity.network?.baseSpeed ?? entity.networkBaseSpeed,
        entity.network?.speedBonus,
      );
      if (!want) {
        if (moving && rate !== actor.rate) {
          actor.rate = rate;
          void this.views.setEntityClipRate(local, rate);
        }
        continue;
      }
      actor.rate = rate;
      // `idle` is the tables' word for standing; this body stands doing something else.
      const clip =
        want.clip === IDLE && !want.once && actor.restingClip !== null
          ? actor.restingClip
          : want.clip;
      actor.asked = clip;
      void this.views.setEntityClip(local, clip, want.once ? 1 : rate, want.once);
    }
  }
}
