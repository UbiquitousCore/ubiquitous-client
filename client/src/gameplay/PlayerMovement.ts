/**
 * Predicted player movement: input plus solid geometry. The server corrects
 * the result; it does not replace this. No Three.js; only the camera's yaw
 * is read.
 */

import type { CameraRig } from '../renderer/CameraRig';
import type { World } from '../world/World';
import type { CollisionWorld } from '../world/CollisionWorld';
import { closestPointXZ, STEP_UP } from '../world/CollisionWorld';
import type { InputState } from './Input';

export interface MovementSettings {
  /** World units per second. */
  walkSpeed: number;
  /** Radians per pixel of mouse drag. */
  lookSensitivity: number;
  zoomSensitivity: number;
  /** How high above the ground the camera looks. */
  eyeHeight: number;
}

/**
 * The server checks steps against it. Other speeds are ratios of it, so the
 * admin panel's speed scales them all.
 */
export const RUN_FORWARD_SPEED = 6;
/** Swimming forward, as a share of running forward: 3 against 6, as on the server. */
export const SWIM_FORWARD_RATIO = 0.5;
/** Backing up on land, as a share of running forward, as on the server. */
export const RUN_BACKWARD_RATIO = 0.4;
/** Backing up in water, as a share of swimming forward. */
export const SWIM_BACKWARD_RATIO = 0.5;

export const DEFAULT_MOVEMENT: MovementSettings = {
  walkSpeed: RUN_FORWARD_SPEED,
  lookSensitivity: 0.005,
  zoomSensitivity: 0.02,
  eyeHeight: 1.8,
};

/** Own choice, slim: at 0.6 visibly clear doorways would not fit the player. */
export const PLAYER_RADIUS = 0.4;

/** How tall the player is, for deciding which walls are in the way. */
export const PLAYER_HEIGHT = 1.9;

/**
 * Longest step per sweep: under `PLAYER_RADIUS` so walls cannot be tunnelled,
 * and at the 50° slope limit it climbs ~0.30, inside the 0.6 step.
 */
const MAX_SWEEP = 0.25;

/** Own choice: a little over `STEP_UP`, reaching ledges walking cannot. */
export const JUMP_APEX = 0.8;

/** Own choice: long enough for take-off, air and landing clips to show. */
export const JUMP_AIRTIME = 0.6;

/** From `apex = v² / 2g` and `airtime = 2v / g`; mounts use the same. */
export const JUMP_START_VELOCITY = (4 * JUMP_APEX) / JUMP_AIRTIME;
export const GRAVITY = -(8 * JUMP_APEX) / JUMP_AIRTIME ** 2;

/** Mount flourish hold time (~clip length; a timer stands in for a clip-end
 * signal). */
const MOUNT_FLOURISH_SECONDS = 1.85;

/** Guards normalisation only; when an approach ends is its owner's call. */
const AUTO_RUN_MIN_STEP = 1e-4;

/** Own choice: one gravity fraction under water, so a jump from the water clears the surface. */
export const BUOYANCY = 0.12;

/** Climb or dive per unit swum at full camera tilt. */
export const SWIM_PITCH_RATE = 0.8;

/**
 * Camera pitch bands for swimming forward: below `UP` the body climbs, above
 * `DIVE` it descends, between it holds depth. The top matches `MAX_PITCH`.
 */
const SWIM_UP_PITCH = 0.18;
const SWIM_DIVE_PITCH = 0.5;
const SWIM_MAX_PITCH = 1.25;

export type MoveDirection = 'idle' | 'forward' | 'backward' | 'strafeLeft' | 'strafeRight';

/** How the player gets about; `fly` is admin only, at the admin speed on every axis. */
export type Locomotion = 'ground' | 'swim' | 'air' | 'fly';

/** Mount speed ratio, one value for every mount. Mounts cannot swim — deep
 * water dismounts. */
export const MOUNT_SPEED_RATIO = 1.6;

/** Mount strafe ratio (= 1: mounted run plays the ordinary run clip). */
export const MOUNT_STRAFE_RATIO = 1;

export class PlayerMovement {
  /** Set by the last `update()` call; true when the player is moving. */
  moving = false;
  /** The player's current movement direction relative to facing. */
  direction: MoveDirection = 'idle';
  /** Radians; kept because the network wants the angle, not the quaternion. */
  yaw = 0;
  /** Wading counts as ground until the bed drops past `SWIM_DEPTH`. */
  locomotion: Locomotion = 'ground';
  /** Horizontal velocity this frame, for the wire; zero when still. */
  velocity: [number, number, number] = [0, 0, 0];
  /** Auto-run target (XZ only; re-aimed each frame at the live position).
   * Held input always wins and the approach is cancelled outright. */
  autoRunTo: [number, number, number] | null = null;

  private walkSpeed: number;
  /** The server's speed share (0 stunned); it pulls back longer steps. */
  private speedShare = 1;
  /** Null on the ground, not zero, which would be the top of a jump. */
  private verticalSpeed: number | null = null;
  /** Seconds left of a mount's in-place flourish; 0 when none is running. */
  private flourish = 0;
  /** A jump plays its take-off; a drop keeps the movement loop. */
  private airborneFrom: 'jump' | 'fall' | null = null;
  /** True for the one frame the body reaches the ground again. */
  private landedThisFrame = false;
  /** True for the one frame a jump press takes effect. */
  private jumpedThisFrame = false;
  private flying = false;
  /** Riding a mount. Set by `setMounted`; read by `speedFor`. */
  private mounted = false;
  /** Depth below the swim line, held as the surface height varies across chunks. */
  private diveDepth = 0;

  constructor(
    private readonly world: World,
    private readonly rig: CameraRig,
    private readonly settings: MovementSettings = DEFAULT_MOVEMENT,
  ) {
    this.walkSpeed = settings.walkSpeed;
  }

  /** Forget any jump in flight: a teleport would otherwise arrive mid-hop. */
  reset(): void {
    this.verticalSpeed = null;
    this.flourish = 0;
    this.airborneFrom = null;
    this.landedThisFrame = false;
    this.diveDepth = 0;
    this.locomotion = 'ground';
    this.direction = 'idle';
    this.moving = false;
    this.velocity = [0, 0, 0];
    // A zone change rebuilds the renderer's view from scratch, so a mount
    // that survived here would be a state the display no longer shows.
    this.mounted = false;
  }

  /** Face the entity, remembering the angle for anything that needs it. */
  private setYaw(player: Parameters<World['setYaw']>[0], yaw: number): void {
    this.yaw = yaw;
    this.world.setYaw(player, yaw);
  }

  /** Turn partway toward a live world position without changing camera or movement. */
  easeTowards(position: readonly [number, number, number], dt: number): void {
    const player = this.world.player;
    if (!player) return;
    const dx = position[0] - player.position[0];
    const dz = position[2] - player.position[2];
    if (Math.hypot(dx, dz) <= 1e-4) return;
    const targetYaw = Math.atan2(dx, dz);
    const delta = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
    // Turns through the normal direction interpolation rather than pinning
    // the body to a target. This caps only the stationary turn.
    const turn = Math.sign(delta) * Math.min(Math.abs(delta), dt * 8);
    this.setYaw(player, this.yaw + turn);
  }

  setSpeed(speed: number): void {
    this.walkSpeed = Math.max(0.5, speed);
  }

  /** Take the share of normal speed the server allows; see `speedShare`. */
  setSpeedShare(share: number): void {
    this.speedShare = Math.max(0, share);
  }

  /** Admin fly: no gravity, no ground, no walls. Space rises, shift descends. */
  setFlying(on: boolean): void {
    this.flying = on;
    this.verticalSpeed = null;
    this.diveDepth = 0;
    if (!on) this.locomotion = 'ground';
  }

  isFlying(): boolean {
    return this.flying;
  }

  /** Mounted: faster on the ground; the caller dismounts in deep water. */
  setMounted(on: boolean): void {
    this.mounted = on;
  }

  isMounted(): boolean {
    return this.mounted;
  }

  /** Backing up and water are fixed ratios of `walkSpeed`, so the admin panel's speed scales them all. */
  private speedFor(direction: MoveDirection, locomotion: Locomotion): number {
    if (locomotion === 'fly') return this.walkSpeed;
    const swimming = locomotion === 'swim';
    const own = this.walkSpeed * this.speedShare;
    const base = swimming ? own * SWIM_FORWARD_RATIO : this.mounted ? own * MOUNT_SPEED_RATIO : own;
    if (direction === 'backward')
      return base * (swimming ? SWIM_BACKWARD_RATIO : RUN_BACKWARD_RATIO);
    if (this.mounted && (direction === 'strafeLeft' || direction === 'strafeRight')) {
      return base * MOUNT_STRAFE_RATIO;
    }
    return base;
  }

  getSpeed(): number {
    return this.walkSpeed;
  }

  /** A standing mount's in-place flourish; locomotion stays `'ground'`. */
  isFlourishing(): boolean {
    return this.mounted && this.flourish > 0;
  }

  /** Pushed off or walked off, while airborne; null on the ground. */
  airborneReason(): 'jump' | 'fall' | null {
    return this.locomotion === 'air' ? (this.airborneFrom ?? 'fall') : null;
  }

  /** True for the one frame a jump press takes effect, flourish included. */
  justJumped(): boolean {
    return this.jumpedThisFrame;
  }

  /** Whether the swimmer is under the line they float on. */
  isDiving(): boolean {
    return this.diveDepth > 0;
  }

  /** True for the single frame the body touches down. */
  justLanded(): boolean {
    return this.landedThisFrame;
  }

  update(input: InputState, dt: number): void {
    this.rig.orbit(
      -input.dragX * this.settings.lookSensitivity,
      input.dragY * this.settings.lookSensitivity,
    );
    if (input.wheel !== 0) this.rig.zoom(input.wheel * this.settings.zoomSensitivity);

    const player = this.world.player;
    if (!player) return;

    let dx = 0;
    let dz = 0;
    // An approach runs forward whatever the keys say; otherwise no key is down
    // and it would slide at no speed.
    let autoRun = false;
    if (input.forward || input.back || input.left || input.right) {
      const forward = this.rig.forward();
      const right = this.rig.right();
      if (input.forward) {
        dx += forward.x;
        dz += forward.y;
      }
      if (input.back) {
        dx -= forward.x;
        dz -= forward.y;
      }
      if (input.right) {
        dx += right.x;
        dz += right.y;
      }
      if (input.left) {
        dx -= right.x;
        dz -= right.y;
      }
    } else if (this.autoRunTo) {
      // Straight at it, in world space rather than camera space: an approach
      // aims at the body, not at wherever the camera happens to be pointing.
      const ax = this.autoRunTo[0] - player.position[0];
      const az = this.autoRunTo[2] - player.position[2];
      const flat = Math.hypot(ax, az);
      if (flat > AUTO_RUN_MIN_STEP) {
        dx = ax / flat;
        dz = az / flat;
        autoRun = true;
      }
    }

    // Both are single-frame facts, rebuilt below from this frame's motion.
    this.landedThisFrame = false;
    this.jumpedThisFrame = false;

    // Run down the flourish before this frame's input can start another.
    if (this.flourish > 0) this.flourish = Math.max(0, this.flourish - dt);

    // Observed in play by the owner: nothing refuses a jump. It needs ground,
    // and a body held still by the server cannot.
    if (input.jump && this.verticalSpeed === null && this.speedShare > 0) this.jump(input);

    // Fly overrides everything below: no ground, no water, no walls.
    if (this.flying) {
      this.locomotion = 'fly';
      const flySpeed = this.speedFor('forward', 'fly');
      const liftSpeed = this.flyLift(input) * flySpeed;
      const rise = liftSpeed * dt;
      const flat = Math.hypot(dx, dz);
      this.moving = flat > 0 || rise !== 0;
      this.direction = flat > 0 ? (autoRun ? 'forward' : directionFrom(input)) : 'idle';
      const step = flat > 0 ? (flySpeed * dt) / flat : 0;
      this.velocity =
        flat > 0 ? [(dx / flat) * flySpeed, liftSpeed, (dz / flat) * flySpeed] : [0, liftSpeed, 0];
      this.world.setPosition(
        player,
        player.position[0] + dx * step,
        player.position[1] + rise,
        player.position[2] + dz * step,
      );
      if (flat > 0) this.setYaw(player, Math.atan2(dx, dz));
      this.aimCamera(player);
      return;
    }

    // A body that may not move at all stands, rather than walking nowhere.
    const length = this.speedShare > 0 ? Math.hypot(dx, dz) : 0;
    this.moving = length > 0;
    if (length > 0) {
      // From the keys: the facing follows travel, so it would always read forward.
      this.direction = autoRun ? 'forward' : directionFrom(input);
      const speed = this.speedFor(this.direction, this.locomotion);
      this.velocity = [(dx / length) * speed, 0, (dz / length) * speed];
      this.walk(dx / length, dz / length, speed * dt, dt);
      // Face travel except when backing up (deliberate divergence; strafe
      // direction is not on the wire, so watchers cannot recover it).
      const facing = this.direction === 'backward' ? Math.atan2(-dx, -dz) : Math.atan2(dx, dz);
      this.setYaw(player, facing);
    } else {
      this.direction = 'idle';
      this.velocity = [0, 0, 0];
      // Still settle: a teleport leaves the player at someone else's height.
      const [x, y, z] = player.position;
      const settled = this.settle(x, z, y, dt);
      if (settled !== y) this.world.setPosition(player, x, settled, z);
    }

    this.aimCamera(player);
  }

  /**
   * A standing mount flourishes instead. A swimmer jumps from the surface,
   * leaping out (observed in play by the owner).
   */
  private jump(input: InputState): void {
    if (this.mounted && directionFrom(input) === 'idle') {
      if (this.flourish > 0) return;
      this.flourish = MOUNT_FLOURISH_SECONDS;
      this.jumpedThisFrame = true;
      return;
    }
    const player = this.world.player;
    if (player && this.locomotion === 'swim') {
      const [x, , z] = player.position;
      const swimLine = this.world.waterAt(x, z).swimLine;
      if (swimLine !== null) this.world.setPosition(player, x, swimLine, z);
      this.diveDepth = 0;
    }
    this.verticalSpeed = JUMP_START_VELOCITY;
    this.airborneFrom = 'jump';
    this.jumpedThisFrame = true;
  }

  private aimCamera(player: NonNullable<World['player']>): void {
    this.rig.target.set(
      player.position[0],
      player.position[1] + this.settings.eyeHeight,
      player.position[2],
    );
  }

  /** Fly lift from held keys (fly mode only). */
  private flyLift(input: InputState): number {
    if (input.descend) return -1;
    return input.ascend ? 1 : 0;
  }

  /** Walk along a unit direction in sweeps, each resolving walls and ground, so nothing tunnels. */
  private walk(dirX: number, dirZ: number, distance: number, dt: number): void {
    const player = this.world.player;
    if (!player) return;

    const steps = Math.max(1, Math.ceil(distance / MAX_SWEEP));
    const stride = distance / steps;
    let [x, y, z] = player.position;

    for (let i = 0; i < steps; i++) {
      // A swimmer slides only on steep terrain, so it swims over sunken
      // bridges; waders keep full collision.
      const target =
        this.locomotion === 'swim'
          ? { x: x + dirX * stride, z: z + dirZ * stride }
          : resolveWalls(this.world.collision, x + dirX * stride, z + dirZ * stride, x, z, y);
      x = target.x;
      z = target.z;

      // Swimming forward pitches by the camera: how you dive and surface.
      if (this.locomotion === 'swim' && this.direction === 'forward') {
        const p = this.rig.elevation();
        const tilt =
          p < SWIM_UP_PITCH
            ? -(SWIM_UP_PITCH - p) / SWIM_UP_PITCH
            : p > SWIM_DIVE_PITCH
              ? (p - SWIM_DIVE_PITCH) / (SWIM_MAX_PITCH - SWIM_DIVE_PITCH)
              : 0;
        this.diveDepth = Math.max(0, this.diveDepth + tilt * SWIM_PITCH_RATE * stride);
      }

      y = this.settle(x, z, y, dt / steps);
    }

    this.world.setPosition(player, x, y, z);
  }

  /**
   * Put the body down after moving. Airborne, the ground is a floor to land
   * on; the swim line counts, so a jump into a lake ends swimming.
   */
  private settle(x: number, z: number, fromY: number, dt: number): number {
    const water = this.world.waterAt(x, z);
    const rest = this.world.restingHeight(x, z, fromY, STEP_UP);
    const swimmable = water.state === 'swimming' && water.swimLine !== null;

    if (this.verticalSpeed !== null) {
      // Under the surface the pull is a fraction of gravity, which is what
      // carries a swimmer clear of the water rather than just breaking it.
      const submerged = water.surface !== null && fromY < water.surface;
      this.verticalSpeed += GRAVITY * (submerged ? BUOYANCY : 1) * dt;
      const y = fromY + this.verticalSpeed * dt;
      // Water is landable: reaching the line clears gravity and lands you
      // swimming rather than sinking.
      const floor = swimmable ? Math.max(rest.y, water.swimLine!) : rest.y;
      if (this.verticalSpeed <= 0 && y <= floor) {
        this.verticalSpeed = null;
        this.diveDepth = 0;
        // Touchdown: the clip layer plays a landing one-shot — a landing
        // on the run while a move is held, a landing to a stand otherwise.
        this.landedThisFrame = true;
        this.airborneFrom = null;
      } else {
        this.locomotion = 'air';
        return y;
      }
    }

    if (swimmable) {
      // Hold the dive depth, never below the bed (`rest.y` here, since water won by depth).
      const bed = this.world.groundHeight(x, z, fromY, STEP_UP);
      const target = Math.max(bed, water.swimLine! - this.diveDepth);
      this.diveDepth = Math.max(0, water.swimLine! - target);
      this.locomotion = 'swim';
      return target;
    }

    this.diveDepth = 0;
    this.locomotion = rest.swimming ? 'swim' : 'ground';
    this.airborneFrom = null;
    return rest.y;
  }
}

/** Push a point out of walls; only the into-wall component is removed, so sliding survives. */
export function resolveWalls(
  collision: CollisionWorld,
  x: number,
  z: number,
  fromX: number,
  fromZ: number,
  feetY: number,
  radius = PLAYER_RADIUS,
): { x: number; z: number; blocked: boolean } {
  if (!collision.isLoaded()) return { x, z, blocked: false };

  // Reach far enough to catch a wall the sweep is about to end up beside.
  const reach = radius + Math.hypot(x - fromX, z - fromZ) + 0.5;
  // A wall is only in the way if it reaches above what can be stepped over
  // and starts below head height.
  const walls = collision.wallsNear(x, z, feetY + STEP_UP, feetY + PLAYER_HEIGHT, reach);
  if (walls.length === 0) return { x, z, blocked: false };

  let px = x;
  let pz = z;
  let blocked = false;
  const r2 = radius * radius;

  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const wall of walls) {
      // Horizontal facing. A triangle only counts as a wall when it is steep,
      // so this is never close to zero.
      const nl = Math.hypot(wall.n[0], wall.n[2]);
      if (nl < 1e-6) continue;
      const nx = wall.n[0] / nl;
      const nz = wall.n[2] / nl;

      // Laterally clear of the wall's footprint? Then it is not in the way,
      // whichever side of its plane we are on.
      const near = closestPointXZ(wall, px, pz);
      if (near.d2 >= r2) continue;

      const origin = wall.v[0];
      const here = (px - origin[0]) * nx + (pz - origin[2]) * nz;
      const came = (fromX - origin[0]) * nx + (fromZ - origin[2]) * nz;
      // Which side we belong on. Starting exactly on the plane is a tie; keep
      // whichever side we drifted to rather than picking one arbitrarily.
      const side = (came !== 0 ? came : here) >= 0 ? 1 : -1;

      const want = side * radius;
      if (side * here >= radius) continue; // already clear
      px += nx * (want - here);
      pz += nz * (want - here);
      moved = true;
      blocked = true;
    }
    if (!moved) break;
  }

  return { x: px, z: pz, blocked };
}

/** From the keys, not the velocity: facing follows travel, so travel always reads forward. */
function directionFrom(input: InputState): MoveDirection {
  if (input.forward) return 'forward';
  if (input.back) return 'backward';
  // Both held cancels in the movement vector, so the tiebreak never matters.
  if (input.left) return 'strafeLeft';
  if (input.right) return 'strafeRight';
  return 'idle';
}
