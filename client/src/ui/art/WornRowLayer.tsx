/**
 * Screens shoulder to shoulder against one edge (the character screens),
 * not dimming the game; what they cover is reported to keep the hero clear.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { setViewCover } from '../hudStore';
import { uiScale } from '../optionsStore';
import { movie } from './pieceStore';

export interface WornRowLayerProps {
  children: ComponentChildren;
}

export function WornRowLayer({ children }: WornRowLayerProps): JSX.Element {
  const held = useRef<HTMLDivElement>(null);
  /** The widest the row has covered, reported until it closes, so the world does not slide per screen. */
  const most = useRef(0);

  // Measured while the row is up, not once for every draw of it. A watch
  // keyed on the children would be torn down and put back on every render,
  // losing the room it remembered, and the world would slide about
  // underneath as the screens were paged through.
  useEffect(() => {
    const on = held.current;
    if (!on) return;
    const measure = (): void => {
      const box = on.getBoundingClientRect();
      if (box.width <= 0) {
        setViewCover(null);
        return;
      }
      most.current = Math.max(most.current, box.right);
      setViewCover({ left: box.left, top: box.top, right: most.current, bottom: box.bottom });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return () => setViewCover(null);
    const watching = new ResizeObserver(measure);
    watching.observe(on);
    return () => {
      watching.disconnect();
      most.current = 0;
      setViewCover(null);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-window flex items-center justify-start">
      <div
        ref={held}
        className="pointer-events-auto flex h-full max-h-[100dvh] items-stretch py-2"
        // No taller than the screens themselves are: stretched to a tall
        // window they come out enormous, which is not a size the art was
        // ever drawn for.
        style={{
          maxHeight: `${(movie.value?.skin.height ?? 0) * uiScale()}px`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
