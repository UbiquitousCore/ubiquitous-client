/**
 * Camera framing before the world loads: `wide` while signing in (above the
 * dais, panning right), `close` once signed in (in front of the body, at its
 * chest), blended on an eased curve. Observed in play by the owner; the
 * starting heading (windmill on the left) and the haze are own choices.
 */

import * as THREE from 'three';

/** Which way a body on the dais faces, about the vertical axis. */
export const DAIS_FACING = 0.75;

/** How far in front of the body the close camera stands, and how high. */
export const CLOSE_DISTANCE = 5.2;
export const CLOSE_HEIGHT = 1.7;
/** How high up the body the close camera looks. */
export const CLOSE_TARGET_HEIGHT = 1.1;

/** How high above the dais the wide camera stands. */
export const WIDE_HEIGHT = 4;
/** How far ahead the wide camera looks, and how far below its own height. */
export const WIDE_LOOK_AHEAD = 7;
export const WIDE_LOOK_DROP = 0.8;
/**
 * How far right of the close view's line the wide camera first looks, in
 * radians. Enough that the windmill beyond the dais starts on the left of
 * the screen rather than behind the sign-in panel.
 */
export const WIDE_START_OFFSET = 0.3;
/**
 * The wide camera's first heading: out past the dais, a little right of
 * the way the close camera will look, so the first move to the close view
 * pulls back along nearly the line of sight rather than swinging round.
 */
export const WIDE_START_HEADING = DAIS_FACING + Math.PI - WIDE_START_OFFSET;
/** How fast the wide camera's heading turns, in radians a second. */
export const WIDE_TURN_RATE = 0.045;

/**
 * The wide camera's heading `dt` seconds on. It pans to the right: with +Y
 * up, a heading that grows looks further left, so the heading shrinks.
 */
export function turnWide(heading: number, dt: number): number {
  return heading - WIDE_TURN_RATE * dt;
}

/** How long a move between the two views takes, in seconds. */
export const VIEW_BLEND_SECONDS = 1.6;

/** An eye and the point it looks at. */
export interface CameraPose {
  eye: THREE.Vector3;
  target: THREE.Vector3;
}

/** The wide view from a dais, with the camera's heading at `heading`. */
export function widePose(stand: THREE.Vector3, heading: number): CameraPose {
  const eye = new THREE.Vector3(stand.x, stand.y + WIDE_HEIGHT, stand.z);
  const target = new THREE.Vector3(
    eye.x + Math.sin(heading) * WIDE_LOOK_AHEAD,
    eye.y - WIDE_LOOK_DROP,
    eye.z + Math.cos(heading) * WIDE_LOOK_AHEAD,
  );
  return { eye, target };
}

/** The close view of a body standing on a dais and facing `facing`. */
export function closePose(stand: THREE.Vector3, facing: number = DAIS_FACING): CameraPose {
  return {
    eye: new THREE.Vector3(
      stand.x + Math.sin(facing) * CLOSE_DISTANCE,
      stand.y + CLOSE_HEIGHT,
      stand.z + Math.cos(facing) * CLOSE_DISTANCE,
    ),
    target: new THREE.Vector3(stand.x, stand.y + CLOSE_TARGET_HEIGHT, stand.z),
  };
}

/** Step view progress (0 wide, 1 close) at a steady rate from wherever it is; zero time moves nothing. */
export function stepViewProgress(progress: number, towardClose: boolean, dt: number): number {
  const step = dt / VIEW_BLEND_SECONDS;
  return towardClose ? Math.min(1, progress + step) : Math.max(0, progress - step);
}

/** The pose shown at a given blend progress: eased, flat at both ends. */
export function blendPoses(wide: CameraPose, close: CameraPose, progress: number): CameraPose {
  const p = Math.min(1, Math.max(0, progress));
  const k = p * p * (3 - 2 * p);
  return {
    eye: wide.eye.clone().lerp(close.eye, k),
    target: wide.target.clone().lerp(close.target, k),
  };
}

/** Own choice: haze total at the loaded ground's nearest edge, starting at half that. */
export function groundHaze(tilesOut: number, tileSize: number): { from: number; to: number } {
  const to = tilesOut * tileSize;
  return { from: to / 2, to };
}
