/** The shipped slider: a 51-face clip (full first) turned to the value; presses and drags map back to it. */

import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';

import { useWorn } from './useWorn';

export interface WornSliderProps {
  /** The piece of the movie the clip is drawn inside. */
  dialog: string;
  /** The clip itself, which is also what the picture is framed on. */
  part: string;
  /** How many faces the clip has, full to empty. */
  frames: number;
  /** How far along it is, in [0, 1]. */
  at: number;
  /** Where it is drawn, as a box on whatever it is placed inside. */
  box: JSX.CSSProperties;
  /** What it is called, for anyone who cannot see where it sits. */
  label: string;
  /** What it reads at the moment, for the same reason. */
  says: string;
  onSet(at: number): void;
}

export function WornSlider({
  dialog,
  part,
  frames,
  at,
  box,
  label,
  says,
  onSet,
}: WornSliderProps): JSX.Element | null {
  const held = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // The first face is full and the last is empty, so the face wanted is
  // the run less however much of it is filled.
  const face = Math.max(0, Math.min(frames - 1, Math.round((1 - at) * (frames - 1))));
  const worn = useWorn(dialog, part, { frames: { [part]: face } }, { floats: true });

  if (!worn.image) return null;

  /** Where along the slider a pointer is, as a fraction of it. */
  const along = (event: PointerEvent): number => {
    const on = held.current?.getBoundingClientRect();
    if (!on || on.width <= 0) return at;
    return Math.max(0, Math.min(1, (event.clientX - on.left) / on.width));
  };

  return (
    <div
      ref={held}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuetext={says}
      aria-valuenow={Math.round(at * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ ...box, touchAction: 'none', cursor: 'pointer' }}
      onPointerDown={(event: PointerEvent) => {
        dragging.current = true;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        onSet(along(event));
      }}
      onPointerMove={(event: PointerEvent) => {
        if (dragging.current) onSet(along(event));
      }}
      onPointerUp={() => {
        dragging.current = false;
      }}
      onPointerCancel={() => {
        dragging.current = false;
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'ArrowLeft') onSet(Math.max(0, at - 0.1));
        if (event.key === 'ArrowRight') onSet(Math.min(1, at + 0.1));
      }}
    >
      <img
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none block h-full w-full"
        draggable={false}
      />
    </div>
  );
}
