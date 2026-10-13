import {
  approachStep,
  isStalled,
  serverReach,
  stopDistanceFor,
  trackProgress,
  type ApproachAction,
  type Intent,
  type Progress,
} from '../../../gameplay/approach';

interface DirectionInput {
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
}

export function heldDirection(input: DirectionInput): boolean {
  return input.forward || input.back || input.left || input.right;
}

export interface ApproachingBody {
  id: number;
  asked: Intent;
  stopDistance: number;
  reach: number;
  targetWhenAsked: string | null;
  progress: Progress | null;
}

export function beginApproach(args: {
  id: number;
  asked: Intent;
  targetKind: 'creature' | 'player' | 'static';
  holdsRangedWeapon: boolean;
  targetWhenAsked: string | null;
}): ApproachingBody {
  const { id, asked, targetKind, holdsRangedWeapon, targetWhenAsked } = args;
  return {
    id,
    asked,
    stopDistance: stopDistanceFor(asked, { kind: targetKind }, holdsRangedWeapon),
    reach: serverReach(asked, holdsRangedWeapon),
    targetWhenAsked,
    progress: null,
  };
}

export function updateApproachProgress(
  progress: Progress | null,
  here: [number, number, number] | null,
  there: [number, number, number] | null,
  nowSeconds: number,
): Progress | null {
  if (!here || !there) return progress;
  const gap = Math.hypot(there[0] - here[0], there[1] - here[1], there[2] - here[2]);
  return trackProgress(progress, gap, nowSeconds);
}

export function approachActionNow(args: {
  heroDead: boolean;
  directionHeld: boolean;
  here: [number, number, number] | null;
  there: [number, number, number] | null;
  stillWanted: boolean;
  retargeted: boolean;
  asked: Intent;
  now: Intent | 'none';
  stopDistance: number;
  reach: number;
  progress: Progress | null;
  nowSeconds: number;
  running: boolean;
}): ApproachAction {
  const {
    heroDead,
    directionHeld,
    here,
    there,
    stillWanted,
    retargeted,
    asked,
    now,
    stopDistance,
    reach,
    progress,
    nowSeconds,
    running,
  } = args;
  return approachStep({
    heroDead,
    directionHeld,
    here,
    there,
    stillWanted,
    retargeted,
    asked,
    now,
    stopDistance,
    reach,
    stalled: progress !== null && isStalled(progress, nowSeconds),
    running,
  });
}

export function followActionNow(args: {
  heroDead: boolean;
  directionHeld: boolean;
  here: [number, number, number] | null;
  there: [number, number, number] | null;
  stopDistance: number;
  running: boolean;
}): ApproachAction {
  const { heroDead, directionHeld, here, there, stopDistance, running } = args;
  return approachStep({
    heroDead,
    directionHeld,
    here,
    there,
    stillWanted: true,
    retargeted: false,
    asked: 'none',
    now: 'none',
    stopDistance,
    reach: Infinity,
    stalled: false,
    running,
  });
}
