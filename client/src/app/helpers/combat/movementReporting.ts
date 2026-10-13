import type { Posture } from '../../../gameplay/ClipMachine';
import { EntityMovementState } from '../../../net/GameConnection';

/** Posture + locomotion become the movement state the wire understands. */
export function movementStateForPosture(
  posture: Posture,
  moving: boolean,
  direction: string,
): EntityMovementState {
  switch (posture) {
    case 'jump':
    case 'flourish':
      return EntityMovementState.Jumping;
    case 'fall':
      return EntityMovementState.Falling;
    case 'landStill':
      return EntityMovementState.Landed;
    case 'landMoving':
      return EntityMovementState.LandedMoving;
    case 'swim':
      return direction === 'idle' ? EntityMovementState.Standing : EntityMovementState.Swimming;
    case 'stand':
      return EntityMovementState.Standing;
    default:
      return moving ? EntityMovementState.Walking : EntityMovementState.Standing;
  }
}

interface TimedReportArgs {
  now: number;
  lastSent: number;
  intervalMs: number;
  lastState: EntityMovementState | null;
  state: EntityMovementState;
  moving: boolean;
  velocity: [number, number, number];
}

interface TimedReport {
  sentAt: number;
  state: EntityMovementState;
  velocity: [number, number, number] | undefined;
  speed: number | undefined;
}

/** Whether to send a timed movement report now, and the payload for it. */
export function decideTimedPositionReport(args: TimedReportArgs): TimedReport | null {
  const { now, lastSent, intervalMs, lastState, state, moving, velocity } = args;
  const changed = state !== lastState;
  if (!changed && now - lastSent < intervalMs) return null;

  const [vx, vy, vz] = velocity;
  return {
    sentAt: now,
    state,
    velocity: moving ? [vx, vy, vz] : undefined,
    speed: moving ? Math.hypot(vx, vz) : undefined,
  };
}
