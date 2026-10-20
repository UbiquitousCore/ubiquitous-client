/** One named part drawn on its own, for placing somewhere the movie does not. */

import type { JSX } from 'preact';

import { useWorn } from './useWorn';
import type { PiecePart } from './piecePlan';
import type { UiMovie } from '../../assets/ids';

/** Top-level dialog parts not holding `part`, left out so a tour hint does not glow over it. */
export function besides(whole: readonly PiecePart[], part: string): string[] {
  const found = whole.find(one => one.path === part) ?? whole.find(one => one.name === part);
  if (!found) return [];
  const top = found.path.split('/')[0]!;
  // Hiding goes by name, so a stranger sharing a name with something
  // inside the part stays, or it would take that with it.
  const inside = new Set(whole.filter(one => one.path.startsWith(`${top}/`)).map(one => one.name));
  return whole
    .filter(one => !one.path.includes('/') && one.path !== top && !inside.has(one.name))
    .map(one => one.path);
}

export interface WornPieceProps {
  /** The piece of the movie the part belongs to. */
  dialog: string;
  /** The part itself, which is also what the picture is framed on. */
  part: string;
  /** Where it goes, as a box on whatever it is placed inside. */
  box?: JSX.CSSProperties;
  /** What it is, for anyone who cannot see it. Decoration says nothing. */
  alt?: string;
  /** Parts stacked on it to leave out (coins share one spot). */
  without?: readonly string[];
  /** The box it stands in, in movie units, so it lands on the same grid as its neighbours. */
  within?: { x: number; y: number; w: number; h: number };
  /**
   * True to draw the part without anything else of the piece that lies
   * under it — the sheet a screen paints behind its parts.
   */
  alone?: boolean;
  /** Which movie it belongs to. The in-game one unless said otherwise. */
  movie?: UiMovie;
  /** The face it wears, where it has more than one; its first otherwise. */
  face?: number;
}

export function WornPiece({
  dialog,
  part,
  box,
  alt,
  without,
  within,
  alone,
  movie,
  face,
}: WornPieceProps): JSX.Element | null {
  const worn = useWorn(
    dialog,
    part,
    whole => ({
      hidden: [...(without ?? []), ...besides(whole, part)],
      ...(alone ? { only: part } : {}),
      ...(face !== undefined ? { frames: { [part]: face } } : {}),
    }),
    { floats: true, movie },
  );
  // A part this piece does not hold is not drawn as the whole piece:
  // without it there is nothing to draw at all. A piece that is one
  // drawing with nothing named inside it — a frame, a rule — holds no
  // parts at all, and that is not the same as not holding this one.
  const there =
    worn.whole.length === 0 || worn.whole.some(one => one.path === part || one.name === part);
  if (!worn.image || !there) return null;
  const mine = worn.frame;
  const placed =
    within && mine
      ? {
          position: 'absolute' as const,
          left: `${((mine.x - within.x) / within.w) * 100}%`,
          top: `${((mine.y - within.y) / within.h) * 100}%`,
          width: `${(mine.w / within.w) * 100}%`,
          height: `${(mine.h / within.h) * 100}%`,
        }
      : // A box that says how big wins over the size it was drawn at.
        box?.width
        ? {}
        : worn.sized;
  return (
    <img
      src={worn.image.url}
      alt={alt ?? ''}
      aria-hidden={alt ? undefined : 'true'}
      className="block"
      style={{ ...placed, ...box }}
      draggable={false}
    />
  );
}
