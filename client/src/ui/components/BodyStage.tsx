/** The hero's live body on the equipment tab, through a source `app/` installs; no Three.js here. */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** A staged body: an element to show, kept current and released by hand. */
export interface StagedBody {
  element: HTMLElement;
  /** Rebuild the clone when the hero's look changed underneath it. */
  sync(): void;
  dispose(): void;
}

/**
 * Stages the hero's body, or — given a unit's id — that unit's; or the
 * hero wearing other pieces, given their entries, for trying them on.
 */
export type BodyStageSource = (unitId?: string, tryOn?: readonly number[]) => StagedBody | null;

let stagedBodyOf: BodyStageSource = () => null;

/** The one engine seam this is allowed: ask it for the hero's staged body. */
export function setBodyStageSource(source: BodyStageSource): void {
  stagedBodyOf = source;
}

/**
 * The live body inside the equipment tab's frame. Empty — the frame as it
 * always was — while the hero has no built body yet, or where no source was
 * installed (the design lab renders without a game behind it).
 */
export function CharacterBody({
  unitId,
  tryOn,
}: { unitId?: string; tryOn?: readonly number[] } = {}): JSX.Element {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = host.current;
    if (!box) return;
    let staged: StagedBody | null = null;
    let live = true;
    const mount = (): void => {
      if (!live || staged) return;
      // Never throws outward: a staging failure retries on the next tick
      // rather than wedging the tab empty.
      let next: StagedBody | null = null;
      try {
        next = stagedBodyOf(unitId, tryOn);
      } catch {
        next = null;
      }
      staged = next;
      if (staged) box.replaceChildren(staged.element);
    };
    mount();
    // Afterwards the interval only keeps the staged body current — or keeps
    // asking, when the body was not built yet on the first try.
    const timer = window.setInterval(() => {
      if (!live) return;
      if (staged) staged.sync();
      else mount();
    }, 1000);
    return () => {
      live = false;
      window.clearInterval(timer);
      staged?.dispose();
      staged = null;
    };
  }, [unitId, tryOn?.join(',')]);

  return (
    <div
      ref={host}
      data-character-body
      className="flex h-full w-full items-center justify-center"
    />
  );
}
