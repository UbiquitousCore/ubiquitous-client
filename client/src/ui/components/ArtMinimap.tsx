/** The minimap: the movie's ring and compass over our stitched terrain, with marks; pressing opens the map. */
import type { JSX } from 'preact';

import { WornPiece } from '../art/WornPiece';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { mapState, minimapZoomStep, openMap, setMinimapZoomStep } from '../hudStore';
import { MINIMAP_ZOOMS } from '../../world/minimap';
import type { MapMarker } from '../mapModel';
import { arrowTurn, minimapBackground, minimapMark } from './minimapMarks';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const MINIMAP_SCREEN = 'minimap';

/** The minimap stands at its own size in the corner, not at a place on a stage. */
const CORNER = { unplaced: true } as const;

/** Own choice: the ground runs a unit under the ring's opening, so no backdrop shows. */
export const HOLE_RADIUS = 42;

/**
 * Where the opening's centre lies from the centre of the ring's box, in
 * movie units: dead centre. Raycast to the ring's opaque edge in 1.1.4's
 * interface art (centre 49.0, 50.0, radius 40.6, residual 0.3); the old
 * offset sat the ground 0.6 low and left the top edge thin.
 */
const HOLE_OFFSET = { x: 0, y: 0 };

/** How wide a service icon stands on the ground, in movie units. */
const ICON_SIZE = 10;

/** Null where there is no movie to wear, which means there is no minimap. */
export function ArtMinimap(): JSX.Element | null {
  const spec = useWornScreen(MINIMAP_SCREEN);
  return spec ? <Worn spec={spec} /> : null;
}

function Worn({ spec }: { spec: ScreenSpec }): JSX.Element | null {
  const worn = useWorn(spec.dialog, spec.frame, { hidden: spec.hidden ?? [] }, CORNER);
  const { markers, playerPosition, playerYaw, minimapUrl, minimapWindow, zoneName } =
    mapState.value;
  const step = minimapZoomStep.value;
  const frame = worn.frame;
  if (!frame || !worn.image) return null;

  const ring = worn.find(spec.frame as string);
  const centre = ring
    ? {
        x: ring.box.x + ring.box.w / 2 + HOLE_OFFSET.x,
        y: ring.box.y + ring.box.h / 2 + HOLE_OFFSET.y,
      }
    : { x: frame.w / 2 + HOLE_OFFSET.x, y: frame.h / 2 + HOLE_OFFSET.y };
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;
  const around = (offsetX: number, offsetY: number, size: number): JSX.CSSProperties => ({
    position: 'absolute',
    left: pct(centre.x + offsetX * HOLE_RADIUS - size / 2, frame.w),
    top: pct(centre.y + offsetY * HOLE_RADIUS - size / 2, frame.h),
    width: pct(size, frame.w),
    height: pct(size, frame.h),
  });
  const background = minimapUrl && minimapWindow ? minimapBackground(minimapWindow) : null;
  const halfWorld = minimapWindow?.halfWorld ?? 1;
  const arrowAt = spec.groups?.player;

  const place = (marker: MapMarker): JSX.Element | null => {
    if (marker.kind === 'player') return null;
    const mark = minimapMark(marker.kind, marker.position, playerPosition, halfWorld);
    if (!mark) return null;
    if (marker.kind === 'quest' && spec.pieces?.quest) {
      const piece = spec.pieces.quest;
      return (
        <WornPiece
          key={marker.id}
          dialog={piece.dialog ?? spec.dialog}
          part={piece.part}
          alt={marker.label}
          box={{
            ...around(mark.x, mark.y, ICON_SIZE),
            transform: mark.pointing ? `rotate(${mark.bearing}rad)` : undefined,
            pointerEvents: 'none',
          }}
        />
      );
    }
    return (
      <span
        key={marker.id}
        data-marker={marker.kind}
        title={marker.label}
        className="pointer-events-none"
        style={around(mark.x, mark.y, ICON_SIZE)}
      >
        {marker.iconUrl && <img src={marker.iconUrl} alt="" className="size-full object-contain" />}
      </span>
    );
  };

  const letters: Array<[string, string | undefined]> = [
    ['N', spec.groups?.north],
    ['E', spec.groups?.east],
    ['S', spec.groups?.south],
    ['W', spec.groups?.west],
  ];

  return (
    <div className="pointer-events-none fixed top-safe-t right-safe-r z-hud-float">
      <button
        type="button"
        aria-label={zoneName ? `Open full map, ${zoneName}` : 'Open full map'}
        title={zoneName || undefined}
        onClick={openMap}
        onWheel={event => {
          event.preventDefault();
          const next = step + (event.deltaY < 0 ? -1 : 1);
          setMinimapZoomStep(Math.max(0, Math.min(MINIMAP_ZOOMS.length - 1, next)));
        }}
        className="pointer-events-auto relative block cursor-pointer border-0 bg-transparent p-0"
        style={worn.sized}
      >
        <span
          data-map="disc"
          className="absolute overflow-hidden rounded-full bg-map-ground"
          style={around(0, 0, HOLE_RADIUS * 2)}
        >
          <span
            data-map="minimap-surface"
            className="absolute inset-0 block bg-no-repeat"
            style={{
              backgroundImage: minimapUrl ? `url("${minimapUrl}")` : undefined,
              backgroundSize: background?.size,
              backgroundPosition: background?.position,
            }}
          />
        </span>
        <img
          ref={worn.pictureRef}
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={worn.sized}
          draggable={false}
        />
        {letters.map(([letter, at]) => {
          const field = worn.fieldOf(worn.find(at));
          return field ? (
            <span key={letter} data-map="compass" style={worn.words(field, LIGHT)}>
              {letter}
            </span>
          ) : null;
        })}
        {arrowAt && (
          <WornPiece
            dialog={spec.dialog}
            part={arrowAt}
            within={frame}
            box={{
              transform: `rotate(${arrowTurn(playerYaw)}rad)`,
              transformOrigin: '50% 50%',
              pointerEvents: 'none',
            }}
          />
        )}
        {markers.map(place)}
      </button>
    </div>
  );
}
