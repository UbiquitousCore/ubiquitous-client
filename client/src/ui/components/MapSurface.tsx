/** The draggable, zoomable map picture; the movie's frame is a sibling, so its buttons stay put. */

import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';

import { cx } from './cx';
import { DRAG_THRESHOLD_PX, pannedTo, zoomedBy } from './mapView';
import type { MapView } from './mapView';

interface Press {
  x: number;
  y: number;
  panX: number;
  panY: number;
  pointer: number;
  panning: boolean;
}

/**
 * The next view, or what makes it from the one standing: wheel events
 * arrive faster than a frame, so each has to build on the last.
 */
export type ViewChange = MapView | ((view: MapView) => MapView);

export interface MapSurfaceProps {
  pictureUrl?: string | null;
  view: MapView;
  onView(change: ViewChange): void;
  children?: ComponentChildren;
}

export function MapSurface({ pictureUrl, view, onView, children }: MapSurfaceProps): JSX.Element {
  const [press, setPress] = useState<Press | null>(null);
  const sizeOf = (element: HTMLElement): { width: number; height: number } => {
    const box = element.getBoundingClientRect();
    return { width: box.width, height: box.height };
  };

  return (
    /*
     * `select-none`, or dragging selects place names. Capture waits for the
     * first move past a few pixels: captured on press, inner buttons would
     * never see their clicks.
     */
    <div
      data-map="viewport"
      className="absolute inset-0 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
      onWheel={event => {
        event.preventDefault();
        const size = sizeOf(event.currentTarget);
        onView(current => zoomedBy(current, event.deltaY, size));
      }}
      onPointerDown={event => {
        setPress({
          x: event.clientX,
          y: event.clientY,
          panX: view.pan.x,
          panY: view.pan.y,
          pointer: event.pointerId,
          panning: false,
        });
      }}
      onPointerMove={event => {
        if (!press || event.pointerId !== press.pointer) return;
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (!press.panning) {
          if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
          event.currentTarget.setPointerCapture(press.pointer);
          setPress({ ...press, panning: true });
        }
        const size = sizeOf(event.currentTarget);
        onView(current => pannedTo(current, { x: press.panX + dx, y: press.panY + dy }, size));
      }}
      onPointerUp={() => setPress(null)}
      onPointerCancel={() => setPress(null)}
    >
      {/* No easing while a finger is on it: a transition on `transform` makes
          the map chase the pointer a frame behind, which reads as sticking and
          jumping rather than as dragging. */}
      <div
        data-map="surface"
        data-dragging={press?.panning ? '' : undefined}
        className={cx(
          'absolute inset-0 origin-center bg-no-repeat',
          press?.panning ? 'transition-none' : 'transition-transform duration-75 ease-linear',
        )}
        style={{
          backgroundImage: pictureUrl ? `url("${pictureUrl}")` : undefined,
          backgroundSize: '100% 100%',
          transform: `translate(${view.pan.x}px, ${view.pan.y}px) scale(${view.zoom})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
