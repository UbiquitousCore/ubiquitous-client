/**
 * A class's talent tree on the shipped page: the movie's grid filled with
 * the places the class has (from local tables), ranks from the server plus
 * staged points, unbought places greyed. Taller than its window, so drawn
 * apart and slid under it.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { TalentRow } from '../../assets/types';
import { talentPlaces } from '../../gameplay/SpellBook';
import type { WhereOnPage } from './ArtTalentCard';
import { talentRanks, talentStaged, withStaged } from '../../gameplay/talents';
import { INK, useWorn } from '../art/useWorn';
import { WornEmblem } from '../art/WornEmblem';
import { WornPiece } from '../art/WornPiece';
import type { PiecePart } from '../art/piecePlan';

/** How big the figures along the rule under the tree are, in movie units. */
const FIGURE = 14;
/** How deep the band at the foot of the tree is, where its rule is drawn. */
const BAND = 8;

/** The name every place in the grid carries, before its number. */
const PLACE = /(?:^|\/)talent(\d+)$/;

export interface ArtTalentTreeProps {
  /** The piece of the movie the tree belongs to. */
  dialog: string;
  /** The part the tree is drawn from, framed on itself. */
  part: string;
  /** Which of the class's trees to show, by the tree's own number. */
  tree: number | undefined;
  /** How far it has been slid, in the movie's own units, each way. */
  at: { x: number; y: number };
  /** The window it shows through, in movie units; everything is laid out as fractions of it. */
  room: { w: number; h: number };
  /** How big it came out in those units, so its holder knows how far it slides. */
  onSize(wide: number, tall: number): void;
  /** Pressing a place asks for it to be read, and says where on the page it is. */
  onPick?(place: TalentRow, beside: WhereOnPage): void;
}

/** Which places the grid has, in reading order: across, then down. */
function gridOf(parts: readonly PiecePart[]): PiecePart[] {
  return parts
    .filter(part => PLACE.test(part.path))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

/** Places per tier: the grid's short side, with positions rounded so one column is not counted twice. */
export function perTier(sockets: readonly PiecePart[]): number {
  const across = new Set(sockets.map(one => Math.round(one.box.x))).size;
  const down = new Set(sockets.map(one => Math.round(one.box.y))).size;
  return Math.max(1, Math.min(across || 1, down || 1));
}

/** A socket's grid seat from the number in its name, not its list position (unused sockets are not drawn). */
function seatOf(socket: PiecePart, across: number): { tier: number; column: number } {
  const at = Number(PLACE.exec(socket.path)?.[1] ?? 0) - 1;
  return { tier: Math.floor(at / across) + 1, column: (at % across) + 1 };
}

/** What a tree hides: non-tree parts, absent places, dead-end arrows, in-use marks; from the whole screen, applied to each piece planned. */
function hidesFor(
  whole: readonly PiecePart[],
  part: string,
  standing: ReadonlyMap<string, TalentRow>,
): string[] {
  const onPath = (path: string): boolean => part === path || part.startsWith(`${path}/`);
  const outside = whole
    .filter(one => {
      const cut = one.path.lastIndexOf('/');
      const parent = cut < 0 ? '' : one.path.slice(0, cut);
      if (one.path === part || one.path.startsWith(`${part}/`)) return false;
      return parent === '' || onPath(parent);
    })
    .map(one => one.path);
  const grid = gridOf(whole);
  const across = perTier(grid);
  const hidden: string[] = [];
  for (const socket of grid) {
    const { tier, column } = seatOf(socket, across);
    const place = standing.get(`${tier}:${column}`);
    // A place this class does not have is not drawn at all: an empty
    // socket reads as somewhere a point can go.
    if (!place) {
      hidden.push(socket.path);
      continue;
    }
    // An arrow is drawn only where it leads to a place that names this
    // one as what comes before it. A socket carries one for every way a
    // tree can branch, and the rest are put away: drawn as they come,
    // the page is a thicket of arrows leading nowhere.
    const follows = (way: number, on: number): boolean =>
      standing.get(`${tier + on}:${column + way}`)?.after === place.id;
    const wanted = new Set<string>();
    if (follows(0, 1)) wanted.add('arrowBottom');
    if (follows(-1, 0)) wanted.add('arrowLeft');
    if (follows(1, 0)) wanted.add('arrowRight');
    if (follows(-1, 1)) wanted.add('arrowLeftUp');
    if (follows(1, 1)) wanted.add('arrowRightUp');
    for (const arrow of whole) {
      if (!arrow.path.startsWith(`${socket.path}/`)) continue;
      const name = arrow.path.slice(socket.path.length + 1);
      if (name.startsWith('arrow') && !wanted.has(name)) hidden.push(arrow.path);
    }
    // The marks a place wears while it is being used or is barred. The
    // rank is written beside the socket instead.
    for (const mark of ['bluemask', 'redmask', 'hot', 'cnt', 'cntback', 'rectcooldown']) {
      hidden.push(`${socket.path}/btn/${mark}`);
    }
  }
  // The long arrow the movie keeps for a link that skips a row. Nothing
  // draws one — a place always follows the place beside it — and left
  // in, it hangs off the top corner reaching from nowhere to nowhere.
  hidden.push(`${part}/arrowBottomLarge`, 'arrowBottomLarge');
  return [...outside, ...hidden];
}

export function ArtTalentTree({
  dialog,
  part,
  tree,
  at,
  room,
  onSize,
  onPick,
}: ArtTalentTreeProps): JSX.Element | null {
  const places = talentPlaces.value.filter(place => place.classId === tree);
  // What each place shows is what is learned and what is staged on it.
  const ranks = withStaged(talentRanks.value, talentStaged.value);
  /** What stands where, by the place's own row and column. */
  const standing = new Map<string, TalentRow>(
    places.map(place => [`${place.tier}:${place.column}`, place]),
  );

  /** The tree's drawn height, since words are sized in movie units. */
  const held = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const on = held.current;
    if (!on || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => {
      const tall = on.getBoundingClientRect().height;
      setDrawn(was => (Math.abs(was - tall) < 0.5 ? was : tall));
    };
    measure();
    const watching = new ResizeObserver(measure);
    watching.observe(on);
    return () => watching.disconnect();
  }, []);

  // The tree alone: the page's own sheet lies under it too, and brought
  // down to fit the window it shows as a strip of a second page along
  // the band at the foot.
  const worn = useWorn(
    dialog,
    part,
    whole => ({ hidden: hidesFor(whole, part, standing), only: part }),
    { floats: true },
  );

  const grid = gridOf(worn.parts);
  /** The same list the plan was given, for each place drawn on its own. */
  const without = hidesFor(worn.whole, part, standing);
  // From the whole grid, not what is left of it: a class that uses only
  // one column would otherwise read as a grid one place wide.
  const across = perTier(gridOf(worn.whole));
  /** The picture's top strip belongs to the page (leather and chain), so the tree lifts by it. */
  const above = grid.length
    ? Math.max(0, Math.min(...grid.map(socket => socket.box.y)) - (worn.frame?.y ?? 0))
    : 0;
  const wide = worn.frame?.w ?? 0;
  const tall = worn.frame?.h ?? 0;
  /** How far the tree comes down to fit across the window it shows through. */
  const fit = wide > room.w && room.w > 0 ? room.w / wide : 1;
  /** What a movie unit is worth on the page, once it has been drawn. */
  const unit = tall ? drawn / tall : 0;
  if (wide && tall) onSize(wide, tall);

  if (!worn.image || !worn.frame) return null;
  const frame = worn.frame;

  return (
    <div
      ref={held}
      className="absolute"
      style={{
        // As a fraction of the window it shows through, so it lands on
        // the page's own grid however big the page is drawn, and no
        // wider than that window: a tree longer than its page is brought
        // down to fit rather than run off the end of it.
        left: `${((-at.x * fit) / room.w) * 100}%`,
        top: `${((-(at.y + above) * fit) / room.h) * 100}%`,
        width: `${((wide * fit) / room.w) * 100}%`,
        height: `${((tall * fit) / room.h) * 100}%`,
        pointerEvents: onPick ? 'auto' : 'none',
      }}
    >
      {/* The rule the tiers are counted along, which the movie draws at
          the foot of the tree rather than on the page. Only that band of
          the tree's own picture is shown: the rest of it is the page's
          parchment over again. */}
      <div
        className="absolute inset-x-0 bottom-0 overflow-hidden"
        style={{ height: `${(BAND / tall) * 100}%` }}
      >
        <img
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="absolute bottom-0 left-0 w-full"
          style={{ height: `${(tall / BAND) * 100}%` }}
          draggable={false}
        />
      </div>

      <div className="absolute inset-0">
        {grid.map(socket => {
          const { tier, column } = seatOf(socket, across);
          const place = standing.get(`${tier}:${column}`);
          if (!place) return null;
          const socketAt = worn.find(`${socket.path}/btn`);
          // The spot the movie keeps for the picture, authored as the
          // hole inside the ring: the picture fills it exactly. A movie
          // that marks only a point gets the ring less that inset.
          const inside = worn.find(`${socket.path}/displayCallback`);
          const spot = inside?.spot;
          const inset = socketAt && inside ? inside.box.x - socketAt.box.x : 0;
          const rank = worn.fieldOf(worn.find(`${socket.path}/text`));
          return (
            <div key={socket.path}>
              {/* The place itself, drawn alone: cut out of the page with
                  the page's own sheet under it, and brought down to fit
                  the window, it came out as a second, smaller page laid
                  over the first. */}
              <WornPiece
                dialog={dialog}
                part={socket.path}
                without={without}
                within={frame}
                alone
              />
              {socketAt ? (
                <WornEmblem
                  worn={worn}
                  at={spot && inside ? { ...inside, box: spot } : (inside ?? socketAt)}
                  icon={place.icon}
                  size={Math.max(1, spot ? Math.min(spot.w, spot.h) : socketAt.box.w - inset * 2)}
                  round
                  // A place nobody has taken is greyed.
                  grey={!ranks.get(place.id)}
                />
              ) : null}
              {rank ? (
                <span
                  style={{
                    ...worn.words(rank, INK),
                    fontSize: `${(FIGURE * 0.8 * unit).toFixed(1)}px`,
                  }}
                >
                  {ranks.get(place.id) ?? 0}
                </span>
              ) : null}
              {socketAt && onPick ? (
                <button
                  type="button"
                  aria-label={`${place.ranks} rank${place.ranks === 1 ? '' : 's'}`}
                  onClick={(event: MouseEvent) => {
                    event.stopPropagation();
                    const { left, top, right, bottom } = (
                      event.currentTarget as HTMLElement
                    ).getBoundingClientRect();
                    onPick(place, { left, top, right, bottom });
                  }}
                  style={worn.box(socketAt)}
                  className="absolute cursor-pointer rounded-full border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-brass-300 active:brightness-110"
                />
              ) : null}
            </div>
          );
        })}

        {/* What each tier costs to reach, written under it: the page
            draws the rule itself and this writes the figures along
            it. Taken from the places themselves, so a tree with a gap in
            it still counts up the way it climbs. */}
        {[...new Map(places.map(place => [place.tier, place.requires])).entries()]
          .filter(([, cost]) => cost > 0)
          .map(([tier, cost]) => {
            const under = grid.find(socket => seatOf(socket, across).tier === tier);
            if (!under || !worn.frame) return null;
            return (
              <span
                key={`rule.${tier}`}
                className="absolute flex items-end justify-center"
                style={{
                  left: `${(under.box.x / worn.frame.w) * 100}%`,
                  width: `${(under.box.w / worn.frame.w) * 100}%`,
                  // Along the bottom of the tree's own picture, under
                  // the rule the page draws there.
                  top: `${((worn.frame.h - FIGURE * 1.4) / worn.frame.h) * 100}%`,
                  height: `${((FIGURE * 1.4) / worn.frame.h) * 100}%`,
                  fontSize: `${(FIGURE * unit).toFixed(1)}px`,
                  color: INK,
                  whiteSpace: 'nowrap',
                }}
              >
                {cost}
              </span>
            );
          })}
      </div>
    </div>
  );
}
