/** The unavailable face each control ships, turned into the lists a plan takes. */

import type { ScreenSpec } from './uiSpec';

export interface WornFaces {
  shown: string[];
  hidden: string[];
}

/**
 * Which of the parked faces to draw, given what can be done right now.
 *
 * Anything the caller says nothing about is taken as available, so a
 * screen only has to name what it knows is out of reach.
 */
export function unavailableFaces(
  spec: Pick<ScreenSpec, 'unavailable'>,
  can: Readonly<Record<string, boolean>>,
): WornFaces {
  const faces: WornFaces = { shown: [], hidden: [] };
  for (const [what, where] of Object.entries(spec.unavailable ?? {})) {
    // Named as hidden as well as shown: the face is parked in some
    // builds and drawn in others, and only saying both settles it.
    (can[what] === false ? faces.shown : faces.hidden).push(where);
  }
  return faces;
}
