import { tapAction, tappedBody, type TapAction } from '../../../gameplay/npcInteraction';

export interface TapPoint {
  x: number;
  y: number;
  at: number;
}

/** Whether this tap counts as the second in a double tap, and the new tap memory. */
export function nextTapState(args: {
  previous: TapPoint | null;
  x: number;
  y: number;
  at: number;
  doubleTapMs: number;
  tapSlop: number;
}): { next: TapPoint; isSecondTap: boolean } {
  const { previous, x, y, at, doubleTapMs, tapSlop } = args;
  const next = { x, y, at };
  const isSecondTap =
    previous !== null &&
    at - previous.at <= doubleTapMs &&
    Math.hypot(x - previous.x, y - previous.y) <= tapSlop * 2;
  return { next, isSecondTap };
}

/** What a world tap lands on, and whether it selects or acts. */
export function tapSelection(args: {
  bodyId: number | null;
  iconId: number | null;
  lastTapped: number | null;
  isSecondTap: boolean;
}): { id: number; action: TapAction } | null {
  const { bodyId, iconId, lastTapped, isSecondTap } = args;
  const id = tappedBody(bodyId, iconId);
  if (id === null) return null;
  const action = tapAction({
    alreadyTargeted: lastTapped === id,
    markWasHit: iconId === id,
    doubleTap: isSecondTap,
  });
  return { id, action };
}

/** A pointer that went down on the world and has not come up. */
export interface PressedPointer {
  id: number;
  x: number;
  y: number;
}

/**
 * The press to track for a pointer-down, or null when it is not one.
 *
 * One pointer at a time: a second finger during a look-drag is a pinch or a
 * stray. Left and right mouse buttons both tap; a middle click is neither.
 */
export function pressFor(
  current: PressedPointer | null,
  event: {
    pointerId: number;
    pointerType: string;
    button: number;
    clientX: number;
    clientY: number;
  },
): PressedPointer | null {
  if (current !== null) return null;
  if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 2) return null;
  return { id: event.pointerId, x: event.clientX, y: event.clientY };
}

/** Whether a release ends the press as a tap: same pointer, not dragged past the slop. */
export function releaseIsTap(
  press: PressedPointer,
  event: { pointerId: number; clientX: number; clientY: number },
  tapSlop: number,
): boolean {
  return (
    press.id === event.pointerId &&
    Math.hypot(event.clientX - press.x, event.clientY - press.y) <= tapSlop
  );
}
