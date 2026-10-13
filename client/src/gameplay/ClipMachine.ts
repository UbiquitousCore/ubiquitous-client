/**
 * ClipMachine — which clip a body plays.
 *
 * A body works through a short queue of takes. The last take in the queue
 * is the body's loop, and shows whenever nothing is in front of it; any take
 * in front of it is a one-shot, played once and then dropped from the queue.
 *
 * Entering a state (a rig, a posture and a movement) looks up the state's
 * cue in that rig's chart, and the cue says what happens to the queue:
 *
 * - `carryOn` leaves it as it is;
 * - `settleInto(loop)` swaps the loop and lets a running one-shot finish;
 * - `switchTo(loop)` clears the queue down to the new loop, at once;
 * - `playThen(once, loop?)` puts a one-shot at the front, in place of any
 *   running one, over the new loop or the one already there.
 *
 * The charts are data, one entry per posture and movement. Cells marked
 * "seen in play" are settled by watching the game; the rest follow from the
 * clip names every playable race ships, and real-pack tests check them.
 *
 * Pure by design — no Three.js, no resources, no clock — so sequencing is
 * testable without a renderer.
 */

import type { ClipName } from '../assets/types';

export type { ClipName };

/** The clip a creature's own resting clip substitutes for. */
export const IDLE: ClipName = 'idle';

/** The body's posture, narrowed to what this client can distinguish. */
export type Posture =
  /** Moving under your own power, on foot or mounted. */
  | 'run'
  /**
   * Moving, but not at a run.
   *
   * Forward is `walk_forward` rather than a slowed `run_normal`. The player
   * never enters it — this client has no walk key — but almost every creature
   * the server moves is in it, which is why most creature models ship
   * `walk_forward` and fewer ship `run_normal`. Other directions share the
   * run's clips.
   */
  | 'walk'
  /**
   * Standing, or coming to a stop, on foot or mounted.
   *
   * Entered *with the direction still held*, it eases that gait back to idle
   * (`run_idle`, `move_left_idle`). At `stop` the one-shot layer is left
   * alone, which lets a landing finish instead of being cut off the frame the
   * body touches down.
   */
  | 'stand'
  /** In the air, having pushed off, on foot or mounted. */
  | 'jump'
  /** In the air, having walked off something. */
  | 'fall'
  /** Touching down while moving. */
  | 'landMoving'
  /** Touching down at a standstill. */
  | 'landStill'
  /**
   * Standing with a melee weapon drawn.
   *
   * A posture, not a one-shot: a body that has started swinging stays in its
   * guard between blows instead of dropping back to idle, and only stops when
   * the fight does.
   */
  | 'guardMelee'
  /**
   * Standing with a bow or wand up: `combat_load` nocks the arrow once and
   * `combat_aim` holds it there.
   */
  | 'guardRanged'
  /** In water deep enough to swim. */
  | 'swim'
  /** Admin fly. */
  | 'fly'
  /** A standing mount's in-place flourish: a mounted jump with movement stopped. */
  | 'flourish'
  /** Stunned: rooted where it stands, playing its stun loop. */
  | 'stunned';

/**
 * Whether a body has a weapon up, and which kind. Null means weapon down.
 *
 * Not a `Posture`: a stance outlives the postures it modifies. A body keeps
 * its guard through running, stopping and turning, and puts it away only when
 * the server says the fight is over.
 */
export type CombatStance = 'melee' | 'ranged' | null;

/**
 * The posture a body in `ground` should actually be in, given its stance.
 *
 * Only standing and travelling on foot are replaced. Jumping, landing,
 * swimming and flying keep their own postures: there is no aiming clip for a
 * body in mid-air to be in.
 */
export function combatPosture(stance: CombatStance, ground: Posture): Posture {
  if (stance === null) return ground;
  if (ground !== 'stand' && ground !== 'run' && ground !== 'walk') return ground;
  return stance === 'melee' ? 'guardMelee' : 'guardRanged';
}

/**
 * The posture a body in `ground` should be in while the server reports it
 * stunned or not. A stun takes over standing, walking, running and a held
 * guard; a body in the air, in the water or flying finishes what it is doing.
 */
export function stunnedPosture(stunned: boolean, ground: Posture): Posture {
  if (!stunned) return ground;
  return STUN_TAKES_OVER.has(ground) ? 'stunned' : ground;
}

const STUN_TAKES_OVER: ReadonlySet<Posture> = new Set<Posture>([
  'stand',
  'walk',
  'run',
  'guardMelee',
  'guardRanged',
]);

/** Movement states. */
export type Movement = 'stop' | 'forward' | 'backward' | 'left' | 'right';

/** Whose clips are being asked for: a body on its own feet, or a mount. */
export type Rig = 'foot' | 'mount';

/** What entering a state does to the queue of takes. */
export type Cue =
  | { readonly does: 'carryOn' }
  | { readonly does: 'settleInto'; readonly loop: ClipName }
  | { readonly does: 'switchTo'; readonly loop: ClipName }
  | { readonly does: 'playThen'; readonly once: ClipName; readonly loop?: ClipName };

const carryOn: Cue = { does: 'carryOn' };
const settleInto = (loop: ClipName): Cue => ({ does: 'settleInto', loop });
const switchTo = (loop: ClipName): Cue => ({ does: 'switchTo', loop });
const playThen = (once: ClipName, loop?: ClipName): Cue =>
  loop ? { does: 'playThen', once, loop } : { does: 'playThen', once };

/** Every clip a cue names, the one-shot first. */
export function cueClips(cue: Cue): ClipName[] {
  switch (cue.does) {
    case 'carryOn':
      return [];
    case 'playThen':
      return cue.loop ? [cue.once, cue.loop] : [cue.once];
    default:
      return [cue.loop];
  }
}

/**
 * One posture's cues. `each` answers every movement not named; a posture
 * with a cue for every movement names them all.
 */
type Line = Partial<Record<Movement, Cue>> & { readonly each?: Cue };

type Chart = Readonly<Record<Posture, Line>>;

/** A body on its own feet. */
const ON_FOOT: Chart = {
  run: {
    stop: carryOn,
    forward: switchTo('run_normal'),
    backward: switchTo('walk_backward'),
    left: switchTo('move_left'),
    right: switchTo('move_right'),
  },
  walk: {
    stop: carryOn,
    forward: switchTo('walk_forward'),
    backward: switchTo('walk_backward'),
    left: switchTo('move_left'),
    right: switchTo('move_right'),
  },
  stand: {
    stop: settleInto('idle'),
    forward: playThen('run_idle', 'idle'),
    // Seen in play: stopping after backing up goes straight to idle.
    backward: settleInto('idle'),
    left: playThen('move_left_idle', 'idle'),
    right: playThen('move_right_idle', 'idle'),
  },
  jump: {
    // Seen in play: a jump while backing up uses the forward take-off.
    each: playThen('jump_start', 'jump_air'),
    left: playThen('jump_start_left', 'jump_air_left'),
    right: playThen('jump_start_right', 'jump_air_right'),
  },
  // Seen in play: walking off a ledge keeps the stride looping until landing.
  // The packs' `jump_air_drop` clips go unused.
  fall: {
    stop: settleInto('jump_air'),
    forward: settleInto('run_normal'),
    backward: settleInto('walk_backward'),
    left: settleInto('move_left'),
    right: settleInto('move_right'),
  },
  landMoving: {
    each: playThen('jumplandrun'),
    // No backward landing ships; seen in play as the standing landing.
    backward: playThen('jump_land'),
    left: playThen('jumplandrun_left'),
    right: playThen('jumplandrun_right'),
  },
  landStill: {
    each: playThen('jump_land'),
    left: playThen('jump_land_left'),
    right: playThen('jump_land_right'),
  },
  // Seen in play: running with a weapon drawn is the unarmed run, and the
  // guard comes back on stopping.
  guardMelee: {
    stop: settleInto('combat_ready'),
    forward: switchTo('run_normal'),
    backward: switchTo('walk_backward'),
    left: switchTo('move_left'),
    right: switchTo('move_right'),
  },
  guardRanged: {
    stop: playThen('combat_load', 'combat_aim'),
    forward: switchTo('run_normal'),
    backward: switchTo('walk_backward'),
    left: switchTo('move_left'),
    right: switchTo('move_right'),
  },
  swim: {
    stop: switchTo('swim_idle'),
    forward: switchTo('swim_forward'),
    backward: switchTo('swim_backword'),
    left: switchTo('swim_left'),
    right: switchTo('swim_right'),
  },
  fly: { each: switchTo('jump_air') }, // Own choice: the game has no fly.
  flourish: { each: carryOn },
  stunned: { each: switchTo('stun') },
};

/**
 * A mount, with its rider. Seen in play: strafing runs the mount forward; a
 * slow mount (another rider) keeps the loop it had; a mounted fight shows no
 * guard; another rider in deep water keeps its loop (the player dismounts).
 * No mount ships a sided take-off or running landing.
 */
const MOUNTED: Chart = {
  run: {
    stop: carryOn,
    backward: switchTo('walk_backward'),
    each: switchTo('run_normal'),
  },
  walk: { each: carryOn },
  stand: ON_FOOT.stand,
  jump: { each: playThen('jump_start', 'jump_air') },
  fall: {
    stop: settleInto('jump_air'),
    backward: settleInto('walk_backward'),
    each: settleInto('run_normal'),
  },
  landMoving: {
    backward: playThen('jump_land'),
    each: playThen('jumplandrun'),
  },
  landStill: { each: playThen('jump_land') },
  guardMelee: { each: carryOn },
  guardRanged: { each: carryOn },
  swim: { each: carryOn },
  fly: { each: carryOn },
  // Seen in play: the player's standing mount told to jump.
  flourish: { each: playThen('jump_in_place', 'idle') },
  stunned: { each: carryOn },
};

const CHARTS: Readonly<Record<Rig, Chart>> = { foot: ON_FOOT, mount: MOUNTED };

/** The cue for entering `posture` while doing `movement`. */
export function cueFor(rig: Rig, posture: Posture, movement: Movement): Cue {
  const line = CHARTS[rig][posture];
  return line[movement] ?? line.each ?? carryOn;
}

/** What the machine wants playing. */
export interface ClipRequest {
  /**
   * Widened to `string` on purpose: a one-shot can be an emote the server
   * named or a creature's own resting clip, neither of which is in `ClipName`.
   */
  clip: string;
  /** True for a one-shot: play it once and hold the last frame, do not loop. */
  once: boolean;
}

/**
 * How long a clip runs, in seconds. `null` while it is still loading, `0` for
 * a hold pose (one keyframe per track — several mounts ship those).
 */
export type DurationOf = (clip: string) => number | null;

/**
 * Longest a one-shot from the chart — a take-off, a landing, a settle — may
 * run before the loop takes over, and longest any one-shot may wait for its
 * clip to load. Own choice: twice the longest take-off or landing the packs
 * ship (1.03 s, in both builds), so none of those is cut, while a long
 * settle or a missing clip never strands the body on one pose. A one-shot
 * asked for from outside the chart (a gesture, an emote) plays all of its
 * known length.
 */
const CHART_ONE_SHOT_LIMIT = 2;

/**
 * A hold pose has no length to wait out, so a one-shot that is one shows for
 * this long before the queue moves on. Own choice.
 */
const HOLD_POSE_SHOWS = 0.3;

/** One clip in the queue. */
interface Take {
  clip: string;
  /** Asked for from outside the chart: runs its full length, and moving ends it. */
  asked: boolean;
  /** Seconds it has been at the front of the queue. */
  age: number;
  /** Its length once known; asked for again while the clip is loading. */
  length: number | null;
}

export class ClipMachine {
  /** One-shots waiting to play, front first. At most one: each cue replaces it. */
  private front: Take[] = [];
  /** The take the queue ends in, which loops. Null before the first cue sets one. */
  private ending: string | null = null;
  /** The state last entered, so a repeated state cues nothing. */
  private entered: string | null = null;

  /** Forget everything. For a teleport, a zone change, a mount swap. */
  reset(): void {
    this.front = [];
    this.ending = null;
    this.entered = null;
  }

  /**
   * Advance one frame and say what should be playing.
   *
   * A state's cue applies once, on entry; after that the one-shot just runs
   * down. A state that repeats cues nothing, which is what stops a held
   * direction from re-triggering a take-off every frame.
   */
  update(
    posture: Posture,
    movement: Movement,
    rig: Rig,
    dt: number,
    durationOf: DurationOf,
  ): ClipRequest {
    const state = `${rig}:${posture}:${movement}`;
    if (state !== this.entered) {
      this.entered = state;
      this.follow(cueFor(rig, posture, movement), durationOf);
    } else {
      this.runDown(dt, durationOf);
    }
    // A one-shot asked for from outside the chart is a body standing and
    // doing something: moving ends it, even in the state it was already in.
    if (movement !== 'stop') this.front = this.front.filter(take => !take.asked);

    const playing = this.front[0];
    if (playing) return { clip: playing.clip, once: true };
    // Before any cue has set a loop, idling is the honest default.
    return { clip: this.ending ?? IDLE, once: false };
  }

  /**
   * Start a one-shot no state asked for.
   *
   * The server can tell a body to play a named animation — an emote, a spell's
   * gesture. It takes the front of the queue, as a cue's one-shot would.
   * Posture changes that leave the body standing — a guard coming down at the
   * end of a fight — let it play on; any movement ends it, and it never
   * starts over a body already moving. The loop behind it is untouched, which
   * lets the body settle back into whatever it was doing.
   */
  playOnce(clip: string, durationOf: DurationOf): void {
    this.front = [this.take(clip, true, durationOf)];
  }

  /** True while a one-shot is running. */
  get playingOneShot(): boolean {
    return this.front.length > 0;
  }

  private follow(cue: Cue, durationOf: DurationOf): void {
    switch (cue.does) {
      case 'carryOn':
        return;
      case 'settleInto':
        this.ending = cue.loop;
        return;
      case 'switchTo':
        this.front = [];
        this.ending = cue.loop;
        return;
      case 'playThen':
        this.front = [this.take(cue.once, false, durationOf)];
        if (cue.loop) this.ending = cue.loop;
    }
  }

  /** Age the front one-shot, and drop it once it has run its course. */
  private runDown(dt: number, durationOf: DurationOf): void {
    const take = this.front[0];
    if (!take) return;
    take.age += dt;
    // The length may only have arrived now, once the clip finished loading.
    take.length ??= durationOf(take.clip);
    if (take.age >= lastsFor(take)) this.front.shift();
  }

  private take(clip: string, asked: boolean, durationOf: DurationOf): Take {
    return { clip, asked, age: 0, length: durationOf(clip) };
  }
}

/** How long a one-shot stays at the front of the queue. */
function lastsFor(take: Take): number {
  if (take.length === null) return CHART_ONE_SHOT_LIMIT;
  if (take.length <= 0) return HOLD_POSE_SHOWS;
  return take.asked ? take.length : Math.min(take.length, CHART_ONE_SHOT_LIMIT);
}

/** The movement state, from this client's direction. */
export function movementOf(
  direction: 'idle' | 'forward' | 'backward' | 'strafeLeft' | 'strafeRight',
): Movement {
  switch (direction) {
    case 'forward':
      return 'forward';
    case 'backward':
      return 'backward';
    case 'strafeLeft':
      return 'left';
    case 'strafeRight':
      return 'right';
    default:
      return 'stop';
  }
}
