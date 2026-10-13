/**
 * The menu on the shipped bar: seven plaques with emblems and words, opened
 * from the hero's portrait; the open one wears its lit face. Entries and
 * order come from the screen spec.
 */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import type { PieceBox } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { useWornEdge, useWornShade, useWornTile } from '../art/wornTile';
import type { ScreenId } from '../screenIds';
import { SCREEN_IDS } from '../screenIds';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const MENU_SCREEN = 'menu';

/** The open plaque's words: light on a dark lit face (red in one build, pale gold in another). */
const OPEN = LIGHT;

/**
 * How wide the gold line down the bar's own edge is, in movie units.
 *
 * The band of leather goes inside it, so the line stays the bar's edge.
 */
const GOLD = 3;

/** Movie units below the bar top where rivets end; a riveted patch would tile into a pattern of rivets. */
const RIVETS = 16;

/** How far a plaque's rounded corner reaches in, in movie units. */
const CORNER = 7;

/** The bar stands in a row against one edge, not at a place on a stage. */
const ROW = { unplaced: true } as const;

/** One plaque as drawn, the words written on it, and whether it is the open one. */
export interface PlaqueAt {
  plaque: PieceBox;
  words?: PieceBox;
  open?: boolean;
}

/** The first plaque's top at rest; the open plaque's lit face stands proud of it. */
export function plaquesTopAtRest(plaques: readonly PlaqueAt[]): number {
  const resting = plaques.find(one => !one.open && one.words);
  const above = resting?.words ? resting.words.y - resting.plaque.y : undefined;
  return Math.min(
    ...plaques.map(one =>
      one.open && one.words && above !== undefined ? one.words.y - above : one.plaque.y,
    ),
  );
}

export interface ArtMenuBarProps {
  /** The screen already showing, marked as the one that is open. */
  activeId: ScreenId | null;
  onPick(id: ScreenId): void;
  onDismiss(): void;
}

export function ArtMenuBar(props: ArtMenuBarProps): JSX.Element | null {
  const spec = useWornScreen(MENU_SCREEN);
  return spec?.items?.length ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  activeId,
  onPick,
  onDismiss,
  spec,
}: ArtMenuBarProps & { spec: ScreenSpec }): JSX.Element | null {
  const held = useRef<HTMLDivElement>(null);
  const items = spec.items ?? [];
  const open = items.find(item => item.screen === activeId);

  // Opening takes focus so a keyboard lands in the menu rather than back
  // in the HUD; closing hands it to whatever opened it.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    held.current?.querySelector('button')?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onDismiss();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      hidden: spec.hidden ?? [],
      // The one whose screen is showing wears its lit face; the rest wear
      // the one they were drawn in.
      frames: open ? { [open.control]: spec.faces?.[open.control] ?? 1 } : {},
    },
    ROW,
  );

  /** The bar's panel: the widest part of that name, since plaque plates share it. */
  const named = spec.panels?.bar;
  const panel = named
    ? worn.parts
        .filter(part => part.path === named || part.name === named)
        .reduce<
          (typeof worn.parts)[number] | undefined
        >((big, part) => (part.box.w > (big?.box.w ?? 0) ? part : big), undefined)
    : undefined;

  /** Where the leather stops: the first plaque, whose plate would otherwise be found as the material. */
  const plaqueTop = plaquesTopAtRest(
    items.flatMap(item => {
      const part = worn.find(item.control);
      if (!part) return [];
      const words = worn.fieldOf(worn.find(item.text))?.box;
      return [{ plaque: part.box, ...(words ? { words } : {}), open: item === open }];
    }),
  );
  /** The bar's leather, found under the top cap's rivets; a see-through patch keeps the plain brown. */
  const leather = useWornTile(worn, {
    x: panel?.box.x ?? 0,
    y: RIVETS,
    w: panel?.box.w ?? 0,
    // Nothing at all until the plaques are known: better bare than
    // wearing a plaque for leather.
    h: Number.isFinite(plaqueTop) ? Math.max(0, plaqueTop - RIVETS) : 1,
  });

  /**
   * The plaques at rest, left and right: the open one wears a wider face
   * that hangs past the bar and says nothing about its edges.
   */
  const resting = items
    .filter(item => item.screen !== activeId)
    .map(item => worn.find(item.control))
    .filter((part): part is NonNullable<typeof part> => part !== undefined);
  const plaque = resting.length ? Math.max(...resting.map(part => part.box.x + part.box.w)) : 0;
  /** The bar's edge line, right of the plaques; the band must not cover it. */
  const edge = useWornEdge(worn, plaque);
  const lit = useWornShade(worn, open ? worn.find(open.control)?.box : undefined);

  if (!worn.image || !worn.frame) return null;

  /** Only screens this client has. The spec may name one it does not. */
  const known = (id: string): id is ScreenId => (SCREEN_IDS as readonly string[]).includes(id);

  return (
    <div
      ref={held}
      role="menu"
      aria-label="Screens"
      className="bg-chrome-900 motion-safe:animate-slide-in-left"
      style={{
        ...worn.placed,
        // Flush against whatever opens beside it: the picture reaches
        // past the bar's own panel, where the plaque that is open hangs
        // out, and that overhang is see-through everywhere else.
        ...(worn.frame
          ? {
              // Up to the bar's edge line, in drawn pixels (a percentage would be of the parent).
              marginRight: `${-((worn.frame.w - (edge ? edge.to : (panel?.box.x ?? 0) + (panel?.box.w ?? 0))) * worn.scale).toFixed(1)}px`,
            }
          : {}),
        ...(leather
          ? {
              backgroundImage: `url(${leather.url})`,
              backgroundRepeat: 'repeat',
              // At the size it was cut, so the grain is the grain the
              // screen was drawn with rather than a stretched copy of it.
              backgroundSize: `${(leather.w * worn.scale).toFixed(1)}px ${(leather.h * worn.scale).toFixed(1)}px`,
            }
          : {}),
      }}
    >
      {/* The bar's own panel, which the movie does not hold: it carries
          the cap at each end and the spine down the side, and the middle
          depends on how many entries are showing, which is not a thing
          the movie says. Drawn from the movie alone the middle is
          see-through, so this client's own leather goes behind it. */}

      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="relative block h-full w-auto"
        draggable={false}
      />

      {/* The band down the bar's edge: tooled leather with its rivets.
          The movie leaves a black strip there, like the middle, so the
          band is drawn over the picture rather than under it, and stops
          short of the line down the bar's own edge.

          In two pieces, above and below whichever plaque is open: that
          one wears a wider face that hangs out over the band and up to
          the line, and a band drawn across it would cover it. */}
      {(() => {
        if (!panel || !worn.frame || !resting.length) return null;
        // As wide as the margin on the other side, where the bar's own
        // edge cannot be found: the bar sets its plaques the same
        // distance in from both of its edges.
        const margin = Math.min(...resting.map(part => part.box.x)) - panel.box.x;
        const to = edge ? edge.from : plaque + Math.max(0, margin - GOLD);
        if (to <= plaque) return null;
        const dressed = leather
          ? {
              backgroundImage: `var(--texture-leather-border), url(${leather.url})`,
              backgroundRepeat: 'repeat-y, repeat',
              backgroundSize: `8px auto, ${(leather.w * worn.scale).toFixed(1)}px ${(leather.h * worn.scale).toFixed(1)}px`,
            }
          : {};
        const over = open ? worn.find(open.control)?.box : undefined;
        const tall = worn.frame.h;
        // Into the open plaque's own corners, which are rounded and so
        // see-through: stopped at its box exactly, the black the movie
        // leaves showed through them.
        const runs = over
          ? [
              { from: 0, to: over.y + CORNER },
              { from: over.y + over.h - CORNER, to: tall },
            ]
          : [{ from: 0, to: tall }];
        return runs
          .filter(run => run.to > run.from)
          .map(run => (
            <span
              key={`band.${run.from}`}
              aria-hidden="true"
              className="pointer-events-none absolute bg-chrome-900 [background-image:var(--texture-leather-border)] [background-size:8px_auto] bg-repeat-y"
              style={{
                left: `${(plaque / worn.frame!.w) * 100}%`,
                width: `${((to - plaque) / worn.frame!.w) * 100}%`,
                top: `${(run.from / tall) * 100}%`,
                height: `${((run.to - run.from) / tall) * 100}%`,
                // The rivets over the same leather the bar itself wears.
                ...dressed,
              }}
            />
          ));
      })()}

      {items.map(item => {
        const part = worn.find(item.control);
        if (!part) return null;
        return (
          <button
            key={item.control}
            type="button"
            role="menuitem"
            aria-current={item.screen === activeId ? 'true' : undefined}
            aria-label={item.says || item.screen}
            onClick={() => {
              if (known(item.screen)) onPick(item.screen);
            }}
            style={worn.box(part)}
            className="absolute cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-brass-300 active:brightness-90"
          />
        );
      })}

      {items.map(item => {
        const field = worn.fieldOf(worn.find(item.text));
        if (!field || !item.says) return null;
        return (
          <span
            key={`${item.control}.words`}
            style={
              item.screen === activeId && lit !== 'light'
                ? { ...worn.words(field), color: OPEN }
                : worn.words(field)
            }
          >
            {item.says}
          </span>
        );
      })}
    </div>
  );
}
