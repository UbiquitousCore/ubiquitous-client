/** The faces of the flash clips under a run of slots, one slot at a time. */

import { useEffect, useRef, useState } from 'preact/hooks';

import type { FaceRun } from '../art/faceRuns';
import { flashFace, justReady } from '../spellBarModel';

/**
 * The face each slot's flash is on: one plays for every slot whose own spell
 * has just come off cooldown, a face at a time until it has run out.
 */
export function useFlashes(cooling: readonly boolean[], run: FaceRun): Array<number | null> {
  const before = useRef<readonly boolean[]>(cooling);
  const started = useRef(new Map<number, number>());
  const [, tick] = useState(0);
  const now = performance.now();
  for (const slot of justReady(before.current, cooling)) started.current.set(slot, now);
  before.current = cooling;
  const faces = cooling.map((_, slot) => {
    const at = started.current.get(slot);
    return at === undefined ? null : flashFace(now - at, run);
  });
  const playing = faces.some(face => face !== null);
  useEffect(() => {
    if (!playing) {
      started.current.clear();
      return;
    }
    const frame = requestAnimationFrame(() => tick(count => count + 1));
    return () => cancelAnimationFrame(frame);
  });
  return faces;
}
