/**
 * The spell book on the shipped screen: a row per known spell, dragged onto
 * the bar. Tabs: spells, mounts (same rows), and talent trees.
 */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEmblem } from '../art/WornEmblem';
import { perTier } from './ArtTalentTree';
import { ArtTalentsWindow } from './ArtTalentsWindow';
import { WornStage } from '../art/WornStage';
import { WornChevrons } from '../art/WornChevrons';
import { WornRow } from '../art/WornRow';
import { iconUrl } from '../iconUrl';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import {
  assignBarSlot,
  castTimeLabel,
  getSpellIcon,
  getSpellName,
  getSpellRank,
  knownSpells,
  spellBar,
  spellCastTimes,
  mountSpells,
  spellIcons,
  talentPlaces,
  wantSpellDetails,
} from '../../gameplay/SpellBook';
import { startSpellDrag } from './spellDrag';
import { ArtSpellCard } from './ArtSpellCard';
import type { WhereOnPage } from './ArtTalentCard';
import { SpellDragGhost } from './SpellDragGhost';

/** The name every seat on the riding page carries, before its number. */
const SEAT = /\/rideskillbutton(\d+)$/;

/**
 * Where a seat sits on the riding page, from the number in its own name.
 *
 * The page is two across, and the numbers run across then down — so the
 * seat's own number says which place it is, whichever of them are drawn.
 */
function seatOf(path: string, across: number): { tier: number; column: number } {
  const at = Number(SEAT.exec(path)?.[1] ?? 0) - 1;
  return { tier: Math.floor(at / across) + 1, column: (at % across) + 1 };
}

/** The seats on the riding page its own tree leaves empty, and their arrows. */
function ridingHides(
  whole: readonly PiecePart[],
  standing: ReadonlyMap<string, { id: number; after: number }>,
): string[] {
  const seats = whole
    .filter(part => SEAT.test(part.path))
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
  const across = perTier(seats);
  const hidden: string[] = [];
  for (const seat of seats) {
    const { tier, column } = seatOf(seat.path, across);
    const place = standing.get(`${tier}:${column}`);
    if (!place) {
      hidden.push(seat.path);
      continue;
    }
    // The arrow out of a seat is drawn only where the place beside it
    // names this one as what comes before it.
    const next = standing.get(`${tier}:${column + 1}`);
    if (next?.after !== place.id) hidden.push(`${seat.path}/arrowBottom`);
    // Marks a place wears while it is being used. Nothing here is.
    hidden.push(`${seat.path}/hot`);
  }
  return hidden;
}

export const SPELLS_SCREEN = 'spells';

/** The book stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtSpellsWindowProps {
  onClose(): void;
}

export function ArtSpellsWindow(props: ArtSpellsWindowProps): JSX.Element | null {
  const spec = useWornScreen(SPELLS_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({ onClose, spec }: ArtSpellsWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  const tabs = spec.tabs ?? [];
  const [open, setOpen] = useState(tabs[0]?.panel ?? 'spells');
  /** The spell whose card is open, and where its row is. */
  const [reading, setReading] = useState<{ spellId: number; at: WhereOnPage } | null>(null);
  const [page, setPage] = useState(0);
  const list = spec.lists?.spells;
  /** The right-edge tabs page the one list, since the wire gives spells no kind. */
  const perPage = spec.paging?.perPage ?? 0;
  const pageTabs = Object.keys(spec.faces ?? {}).filter(control => control.startsWith('btnPage'));
  /** Which of the mount page's own pages: mounts, riding skills, pets. */
  const [side, setSide] = useState(0);
  const sides = spec.sides ?? [];
  const showing = open === 'mounts' ? (sides[side]?.panel ?? '') : '';
  /**
   * What the list is showing: the spells the player knows, or, on the
   * mount page's first tab, the mounts — which are spells too, and wear
   * the same rows.
   */
  const all = showing === 'mounts' ? mountSpells.value : open === 'spells' ? knownSpells.value : [];
  const listed = open === 'spells' || showing === 'mounts';
  // A book that keeps no pages of its own lists everything on the one
  // page, and the list scrolls.
  const known = !listed
    ? []
    : perPage > 0
      ? all.slice(page * perPage, page * perPage + perPage)
      : all;
  const pages = perPage > 0 ? Math.max(1, Math.ceil(all.length / perPage)) : 1;
  const onBar = spellBar.value;

  /** What each row reads: the spell's name, and how long it takes to cast. */
  const columnsOf = (id: number): Record<string, string> => {
    const rank = getSpellRank(id);
    return {
      name: getSpellName(id),
      note: [
        rank && spec.formats?.rank ? `${spec.formats.rank} ${rank}` : '',
        castTimeLabel(spellCastTimes.value.get(id)) ?? '',
      ]
        .filter(Boolean)
        .join(' · '),
    };
  };

  /** Riding skills: a 2x4 tree from the talent table (the spec names which tree). */
  const riding = spec.rows?.riding;
  const rideSkills = talentPlaces.value.filter(place => place.classId === riding);
  const rideStanding = new Map(rideSkills.map(place => [`${place.tier}:${place.column}`, place]));
  useEffect(() => {
    wantSpellDetails(rideSkills.map(place => place.spells[0] ?? 0));
  }, [rideSkills.length]);

  /** Every page a tab of either kind opens, and the one that is up. */
  const pageNames = new Set([...tabs, ...sides].map(one => one.panel));
  const upNow = spec.panels?.[open === 'mounts' ? showing : open];

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: known, scroll: scroll.at, values: columnsOf });

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => ({
      withoutArt: sliceOf(whole).marks,
      shown: spec.shown ?? [],
      // The tab whose page is showing wears its lit face, and so does the
      // page down the side that is being looked at.
      frames: {
        ...Object.fromEntries(
          tabs.map(tab => [tab.control, tab.panel === open ? (spec.faces?.[tab.control] ?? 1) : 0]),
        ),
        ...Object.fromEntries(
          pageTabs.map((control, at) => [
            control,
            (open === 'mounts' ? at === side : at === page) ? (spec.faces?.[control] ?? 1) : 0,
          ]),
        ),
      },
      hidden: [
        ...(spec.hidden ?? []),
        ...sliceOf(whole).hidden,
        // Only the page that is up. The movie carries all of them, and
        // only a page a tab opens counts as one: the spec names other
        // parts of the screen here too, and hiding those hid the tree.
        // The mount page's own tabs pick between pages of its own, and
        // the first of those wears the list the spells wear.
        ...Object.entries(spec.panels ?? {})
          .filter(([which, where]) => pageNames.has(which) && where !== upNow)
          .map(([, where]) => where),
        // A page down the side there is nothing to put on: on the spell
        // list, one for each page it has; on the mount page, one for
        // each page of its own; nowhere else, none at all.
        ...(open === 'spells'
          ? pageTabs.slice(Math.max(1, pages))
          : open === 'mounts'
            ? pageTabs.slice(sides.length)
            : pageTabs),
        // The riding page's own seats: the ones its tree does not use,
        // and the arrow out of a seat nothing follows.
        ...ridingHides(whole, rideStanding),
      ],
    }),
    ROW,
  );
  // The talents have a page of their own in this build — a wide one,
  // laid out the other way round — so the tab opens that rather than
  // dressing this window's own panel with it.
  if (open === 'talents') {
    // On the movie's own screen rather than in the row beside the bar:
    // this page is the size of that whole screen, which is what makes it
    // a page rather than a panel.
    return (
      <WornStage>
        <ArtTalentsWindow onClose={() => setOpen(tabs[0]?.panel ?? 'spells')} />
      </WornStage>
    );
  }

  const slice = sliceOf(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  if (!worn.image || !worn.frame) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Spells"
      className="touch-none overflow-hidden"
      style={worn.placed}
      {...listGestures(worn, list, slice, scroll)}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="relative block h-full w-auto"
        draggable={false}
      />

      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        // The line that counts the points is a sentence with a hole in
        // it; it is written below with the figure in the hole.
        hidden={[spec.values?.points ?? '']}
        styleOf={where => {
          const tab = tabs.find(one => one.text === where);
          if (!tab || tab.panel !== open) return undefined;
          return tab.openTone ? { color: tab.openTone } : undefined;
        }}
      />

      {/* The three pages the screen keeps, and which one is showing. */}
      {tabs.map(tab => {
        const part = worn.find(tab.control);
        return part ? (
          <button
            key={tab.control}
            type="button"
            aria-current={tab.panel === open ? 'true' : undefined}
            aria-label={tab.caption || tab.panel}
            onClick={() => {
              setOpen(tab.panel);
              setPage(0);
            }}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}

      {/* The pages down the side: pages of the spell list, or, on the
          mount page, the three pages that page keeps of its own. */}
      {(open === 'spells'
        ? pageTabs.slice(0, pages)
        : open === 'mounts'
          ? pageTabs.slice(0, sides.length)
          : []
      ).map((control, at) => {
        const part = worn.find(control);
        const mine = open === 'mounts';
        if (!part) return null;
        // The picture the tab wears, at the point the tab keeps for it.
        const inside = worn.find(`${control}/displayCallback`);
        const inset = inside ? inside.box.x - part.box.x : 0;
        const icon = mine ? sides[at]?.icon : undefined;
        return (
          <div key={control}>
            {inside && icon ? (
              <WornEmblem
                worn={worn}
                at={inside}
                icon={icon}
                size={Math.max(1, part.box.w - inset * 2)}
              />
            ) : null}
            <button
              type="button"
              aria-current={(mine ? at === side : at === page) ? 'true' : undefined}
              aria-label={mine ? (sides[at]?.caption ?? sides[at]?.panel ?? '') : `Page ${at + 1}`}
              onClick={() => {
                if (mine) {
                  setSide(at);
                  setPage(0);
                } else setPage(at);
              }}
              style={worn.box(part)}
              className={HIT}
            />
          </div>
        );
      })}

      {/* Each spell, held and carried to a socket on the bar; a tap that
          carries it nowhere opens its card instead. */}
      {rows.map(({ row, item }) => (
        <button
          key={row.path}
          type="button"
          aria-label={getSpellName(item)}
          aria-current={onBar.includes(item) ? 'true' : undefined}
          onPointerDown={(event: PointerEvent) =>
            startSpellDrag(event, item, (spellId, slot) => {
              if (slot !== null) assignBarSlot(slot, spellId);
            })
          }
          onClick={(event: MouseEvent) => {
            const at = (event.currentTarget as HTMLElement).getBoundingClientRect();
            setReading({
              spellId: item,
              at: { left: at.left, top: at.top, right: at.right, bottom: at.bottom },
            });
          }}
          style={worn.box(row)}
          className={HIT}
        />
      ))}

      {list &&
        rows.map(({ row, fields, item }) => (
          <WornRow
            key={`${row.path}.words`}
            worn={worn}
            fields={fields}
            list={list}
            values={columnsOf(item)}
            icon={getSpellIcon(item)}
            tone={INK}
            // One already on the bar is marked, so the eye can tell.
            styleOf={what =>
              what === 'name' && onBar.includes(item) ? 'font-semibold' : undefined
            }
          />
        ))}

      {/* The marks that say the list runs on, each sliding the way it
          points. */}
      <WornChevrons
        worn={worn}
        list={list}
        slice={slice}
        labels={{ up: 'Earlier spells', down: 'Later spells' }}
        onStep={way => scroll.step(way === 'up' ? -1 : 1, slice.furthest)}
      />

      {/* The riding page: a picture and a rank in each seat its own
          little tree uses. What it teaches is a spell, and the picture
          is that spell's own. */}
      {showing === 'riding'
        ? worn.parts
            .filter(part => SEAT.test(part.path))
            .map(seat => {
              const across = perTier(worn.whole.filter(part => SEAT.test(part.path)));
              const { tier, column } = seatOf(seat.path, across);
              const place = rideStanding.get(`${tier}:${column}`);
              if (!place) return null;
              const socket = worn.find(`${seat.path}/btn`);
              // The point the movie gives the picture, inset inside
              // the ring: the picture goes in the socket, not over it.
              const inside = worn.find(`${seat.path}/displayCallback`);
              const inset = socket && inside ? inside.box.x - socket.box.x : 0;
              const rank = worn.fieldOf(worn.find(`${seat.path}/text`));
              const picture = spellIcons.value.get(place.spells[0] ?? 0);
              return (
                <div key={seat.path}>
                  {socket && picture ? (
                    <img
                      src={iconUrl(picture)}
                      alt=""
                      aria-hidden="true"
                      style={{
                        ...worn.box(inside ?? socket),
                        width: `${((socket.box.w - inset * 2) / worn.frame!.w) * 100}%`,
                        height: `${((socket.box.h - inset * 2) / worn.frame!.h) * 100}%`,
                        borderRadius: '50%',
                        // Nothing here has been learned — the wire says
                        // nothing about riding — so every
                        // skill is greyed.
                        filter: 'grayscale(1)',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                      }}
                      draggable={false}
                    />
                  ) : null}
                  {rank ? <span style={worn.words(rank, LIGHT)}>0</span> : null}
                </div>
              );
            })
        : null}

      <SpellDragGhost />

      {reading ? (
        <ArtSpellCard
          spellId={reading.spellId}
          beside={reading.at}
          onClose={() => setReading(null)}
        />
      ) : null}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the spell book"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}
