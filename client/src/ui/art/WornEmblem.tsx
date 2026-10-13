/** A spec'd icon file drawn at a point the movie marks without a size. */
import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';

import { emblems, wantEmblems } from './pieceStore';
import type { PiecePart } from './piecePlan';
import type { Worn } from './useWorn';
import { iconUrl } from '../iconUrl';

export interface WornEmblemProps {
  worn: Worn;
  /** The point the screen draws it at. */
  at: PiecePart | undefined;
  /** The file it lives in, under the build's own icon directory. */
  icon: string | undefined;
  /** How big the screen draws it, in the movie's own units. */
  size: number;
  /** True where the screen draws it greyed — something already dealt with. */
  grey?: boolean;
  /** Cut to a circle for a round socket. */
  round?: boolean;
  /** What it is, for anyone who cannot see it. */
  name?: string;
}

export function WornEmblem({
  worn,
  at,
  icon,
  size,
  grey,
  round,
  name,
}: WornEmblemProps): JSX.Element | null {
  useEffect(() => {
    if (icon) wantEmblems([icon]);
  }, [icon]);
  const picture = icon ? emblems.value.get(icon) : undefined;
  if (!at || !picture || !worn.frame) return null;
  return (
    <img
      src={iconUrl(picture)}
      alt={name ?? ''}
      aria-hidden={name ? undefined : 'true'}
      style={{
        position: 'absolute',
        left: `${(at.box.x / worn.frame.w) * 100}%`,
        top: `${(at.box.y / worn.frame.h) * 100}%`,
        width: `${(size / worn.frame.w) * 100}%`,
        height: `${(size / worn.frame.h) * 100}%`,
        // The build greys what has already been dealt with rather than
        // keeping a second picture for it.
        filter: grey ? 'grayscale(1)' : undefined,
        borderRadius: round ? '50%' : undefined,
        pointerEvents: 'none',
      }}
      draggable={false}
    />
  );
}
