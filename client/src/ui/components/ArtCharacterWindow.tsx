/**
 * The character sheet in the shipped screen: a built page of sixteen body
 * places that take drops from the bag, and an attribute page drawn as it
 * ships (the wire sends little of it). Inspecting another player shows their
 * gear read-only, each card offering to try it on.
 */

import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';

import { ArtItemCard, cardFor, HELD_CARD } from './ArtItemCard';
import { ArtItemListWindow } from './ArtItemListWindow';
import { CharacterBody } from './BodyStage';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';
import type { Worn as WornPicture } from '../art/useWorn';
import { insideStrip, pageAfterSwipe } from '../art/wornPages';
import { isNamed } from '../art/piecePlan';
import { WornCaptions } from '../art/WornCaptions';
import { WornEmblem } from '../art/WornEmblem';
import { WornSlot } from '../art/WornSlot';
import { slotsOf } from '../art/wornSlots';
import {
  equippedSlots,
  inventory,
  inventoryActions,
  itemFacts,
  itemIcons,
  itemName,
} from '../inventoryStore';
import type { InventoryItem, StorageSlot } from '../inventoryStore';
import { EQUIPMENT_SLOTS, equipmentHomesFor } from '../items';
import { heldAction } from '../heldItem';
import { fill } from '../art/wornWords';
import {
  heroClass,
  heroGender,
  heroSheet,
  heroStats,
  isRaised,
  player,
  resourceForClass,
  worldUnits,
} from '../hudStore';
import type { HeroStatName, ResourceType, SheetFigure, Unit } from '../hudStore';
import type { Inspecting } from '../inspectStore';
import {
  dragOver,
  dropSlotAttribute,
  isDragOver,
  itemDrag,
  sameSlot,
  startItemDrag,
} from './dragItem';
import { ItemDetails } from './ItemDetails';
import { ItemDragGhost, socketItemOf } from './ItemSocket';
import { logger } from '../../core/log';

/** Our name for this screen. The spec says which dialog wears it. */
export const CHARACTER_SCREEN = 'character';

const log = logger('sheet');

/** The sheet stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

export interface ArtCharacterWindowProps {
  onClose(): void;
  /** Somebody else's sheet, to look at and not to change. Absent is the hero's own. */
  of?: Inspecting;
  /** On somebody else's sheet: try one of their pieces on, by its entry. */
  onTryOn?(entry: number): void;
}

/**
 * What is worn in one place. On the hero's own sheet it is the row itself;
 * on somebody else's, all this client knows of it is which item it is.
 */
interface Piece {
  id: string;
  entry: number;
  count: number;
  item?: InventoryItem;
}

export function ArtCharacterWindow(props: ArtCharacterWindowProps): JSX.Element | null {
  const spec = useWornScreen(CHARACTER_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

/** The three things a class can spend; each has a bar of its own on the sheet. */
const SPENT: readonly ResourceType[] = ['mana', 'morale', 'vigor'];

/**
 * Each bar's face (full at the first face): only the bar for what this class
 * spends, filled from the wire's mana pool; a build without that bar uses mana's.
 */
export function sheetBars(
  hero: Pick<Unit, 'exp' | 'expToLevel' | 'health' | 'maxHealth' | 'mana' | 'maxMana'>,
  bars: NonNullable<ScreenSpec['bars']>,
  spends: ResourceType,
): { frames: Record<string, number>; hidden: string[] } {
  const share = (now: number, most: number): number => (most > 0 ? Math.min(1, now / most) : 0);
  const run = bars.frames;
  const pool = share(hero.mana ?? 0, hero.maxMana ?? 0);
  const full: Record<string, number> = {
    exp: share(hero.exp ?? 0, hero.expToLevel ?? 0),
    health: share(hero.health ?? 0, hero.maxHealth ?? 0),
  };
  const shown = bars.of[spends] ? spends : 'mana';
  full[shown] = pool;
  const hidden = SPENT.filter(one => one !== shown && bars.of[one]).map(one => bars.of[one]!);
  const frames: Record<string, number> = {};
  for (const [what, where] of Object.entries(bars.of)) {
    if (hidden.includes(where)) continue;
    frames[where] = run - Math.round((full[what] ?? 0) * run);
  }
  return { frames, hidden };
}

/** A drop onto the body: bag to body wears, body to bag removes, anything else nothing. */
export function bodyDrop(from: StorageSlot, to: StorageSlot | null): 'wear' | 'remove' | null {
  if (to === null) return null;
  if (from.area === 'equipment' && to.area === 'equipment') return null;
  if (from.area === 'equipment') return 'remove';
  if (to.area === 'equipment') return 'wear';
  return null;
}

/** The four attributes, in the order the sheet lists them. */
const STATS: readonly HeroStatName[] = ['strength', 'stamina', 'agility', 'wisdom'];

/** A figure as the page writes it: chances to two places ("95.00%"), the rest whole; empty until sent. */
export function sheetFigure(
  sheet: Partial<Record<SheetFigure, number>> | null,
  name: string | undefined,
): string {
  const value = name ? sheet?.[name as SheetFigure] : undefined;
  if (value === undefined) return '';
  return /Chance$|Mitigation$/.test(name!) ? `${(value / 100).toFixed(2)}%` : String(value);
}

function Worn({
  onClose,
  of: other,
  onTryOn,
  spec,
}: ArtCharacterWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const tabs = spec.tabs ?? [];
  const [open, setOpen] = useState(tabs[0]?.panel ?? '');
  const [reading, setReading] = useState<string | null>(null);
  /** The place whose list of candidates is open, if any. */
  const [choosing, setChoosing] = useState<number | null>(null);
  /** Where the list stands, and separately where a card stands, or the list moves per row read. */
  const [beside, setBeside] = useState<{ x: number; y: number } | null>(null);
  const [cardAt, setCardAt] = useState<{ x: number; y: number } | null>(null);

  const state = inventory.value;
  const grid = spec.grids?.equipment;
  /** The attribute page's own pages, swiped or dotted; it opens on the character's figures. */
  const sides = spec.sides ?? [];
  const strip = spec.panels?.strip;
  const home = Math.max(
    0,
    sides.findIndex(side => {
      const page = insideStrip(side.panel, strip);
      return (spec.values?.level ?? '').startsWith(`${page}/`);
    }),
  );
  const [page, setPage] = useState(home);
  const swipeFrom = useRef<number | null>(null);
  /** Counts the strip's picture loading, so it is measured once it is there. */
  const [, setStripLoads] = useState(0);

  const hero = other ? worldUnits.value.find(unit => unit.id === other.unitId) : player.value;
  const classId = other ? (other.classId ?? 0) : heroClass.value;
  const bars =
    spec.bars && hero
      ? sheetBars(hero, spec.bars, resourceForClass(classId))
      : { frames: {}, hidden: [] };
  // Only the player's own figures are ever sent, so somebody else's sheet
  // leaves the four attributes off as it always did.
  const stats = other ? null : heroStats.value;
  const statFields = new Set(
    STATS.flatMap(name => [spec.values?.[name], spec.values?.[`${name}Name`]]).filter(
      (path): path is string => path !== undefined,
    ),
  );

  const sheet = other ? null : heroSheet.value;
  const hiddenHere = (spec.hidden ?? []).filter(
    path =>
      !(stats && statFields.has(path)) &&
      !(sheet?.armor !== undefined && path === spec.values?.armor),
  );
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      hidden: [
        ...hiddenHere,
        // Only the page whose tab is open. The movie carries both at once.
        ...tabs.filter(tab => tab.panel !== open).map(tab => tab.panel),
        // The strip of attribute pages is drawn on its own, to slide.
        ...(strip ? [strip] : bars.hidden),
      ],
      // The tab whose page is showing wears its lit face, and each bar
      // the face that stands for how full it is.
      frames: {
        ...Object.fromEntries(
          tabs.map(tab => [tab.control, tab.panel === open ? (spec.faces?.[tab.control] ?? 1) : 0]),
        ),
        ...(strip ? {} : bars.frames),
      },
    },
    ROW,
  );
  /** The attribute pages, side by side, as a picture of their own. */
  const stripWorn = useWorn(
    strip,
    strip,
    {
      hidden: [...hiddenHere.map(path => insideStrip(path, strip)), ...bars.hidden],
      frames: bars.frames,
    },
    { floats: true },
  );

  const actions = inventoryActions();

  /** The drag ghost from a name and picture; an inventory row names only an entry, and threw. */
  const dragged = (item: InventoryItem) =>
    socketItemOf(item, itemName(item), itemIcons.value.get(item.entry) ?? null);
  const wornAt = (index: number): InventoryItem | undefined => equippedSlots.value[index];
  const readOnly = other !== undefined;
  const pieceAt = (index: number): Piece | undefined => {
    if (other) {
      const entry = other.equipment[index];
      return entry ? { id: `inspect.${index}`, entry, count: 1 } : undefined;
    }
    const item = wornAt(index);
    return item ? { id: item.id, entry: item.entry, count: item.count, item } : undefined;
  };
  if (!worn.image || !worn.frame) return null;

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';
  /** Press a thing in the list and the card for it opens beside that row. */
  const describe = (one: { id: string }, at: { x: number; y: number }): void => {
    log.info(`card: ${one.id} beside ${Math.round(at.x)},${Math.round(at.y)}`);
    setCardAt(at);
    setReading(one.id);
  };

  /** Whether the user's interface file carries the card a thing is described on. */
  const heldCard = useWornScreen(HELD_CARD) !== null;

  const readingItem =
    reading && !readOnly
      ? [...state.items, ...Object.values(equippedSlots.value)].find(item => item?.id === reading)
      : undefined;
  const readingPiece: Piece | undefined = readOnly
    ? Array.from({ length: other?.equipment.length ?? 0 }, (_, index) => pieceAt(index)).find(
        piece => piece?.id === reading,
      )
    : readingItem && {
        id: readingItem.id,
        entry: readingItem.entry,
        count: readingItem.count,
        item: readingItem,
      };
  // A press that describes nothing leaves no mark on screen, so it says so
  // here: the thing it named is not among what is carried or worn.
  if (reading && !readingPiece) log.info(`card: nothing held or worn is ${reading}`);

  const places =
    grid && open === spec.panels?.equipment
      ? slotsOf(worn.parts, { ...grid, driven: true, numbered: grid.numbered })
      : [];

  /** The equipment slot the place at this position in the run holds. */
  const slotOf = (at: number): number => {
    const named = grid?.holds?.[at];
    const slot =
      named === undefined ? -1 : EQUIPMENT_SLOTS.indexOf(named as (typeof EQUIPMENT_SLOTS)[number]);
    return slot < 0 ? at : slot;
  };

  /** What in the bag could go in one place on the body. */
  const candidates = (place: number): InventoryItem[] =>
    state.items.filter(
      one =>
        one.slot?.area === 'bag' &&
        equipmentHomesFor(itemFacts.value.get(one.entry)?.inventoryType ?? 0).includes(place),
    );

  const meter = (label: string | undefined, now: number, most: number): string =>
    label ? fill(spec.formats?.meter ?? '%s: %s / %s', label, now, most) : '';
  /** Only what the wire carries (the four attributes); a made-up figure is worse than a blank. */
  const gender = other ? (other.gender ?? 0) : heroGender.value;
  const said: Record<string, string> = hero
    ? {
        name: hero.name,
        // The interface keeps a word per class *and* gender, in that
        // order, and counts classes from the first one — the wire counts
        // them from one, so a warrior read as the second class.
        class: classId ? (spec.names?.classes?.[(classId - 1) * 2 + gender] ?? '') : '',
        level: fill(spec.formats?.level ?? '', hero.level),
        // How far along somebody else is, the wire never says.
        exp: other ? '' : meter(spec.formats?.exp, hero.exp ?? 0, hero.expToLevel ?? 0),
        health: meter(spec.formats?.health, hero.health ?? 0, hero.maxHealth ?? 0),
        // What a class spends is not called the same thing for all of
        // them, and the screen keeps a word for each.
        mana: meter(
          spec.formats?.[
            { morale: 'morale', vigor: 'vigor', mana: 'mana' }[resourceForClass(classId)] ?? 'mana'
          ],
          hero.mana ?? 0,
          hero.maxMana ?? 0,
        ),
        armor: sheet?.armor !== undefined ? String(sheet.armor) : '',
        ...(stats
          ? Object.fromEntries(
              STATS.flatMap(name => [
                [`${name}Name`, spec.formats?.[name] ?? ''],
                [name, String(stats[name].value)],
              ]),
            )
          : {}),
      }
    : {};
  /** The figures written in green: those with something on top of them. */
  const raised = new Set<string>(stats ? STATS.filter(name => isRaised(stats[name])) : []);

  /** A body place as a box: the movie gives only a point, so a size is supplied. */
  const boxOf = (place: (typeof places)[number]): (typeof places)[number] => {
    const size = grid?.size;
    if (!size) return place;
    const at = worn.parts.find(part => part.path === `${place.path}/${grid?.face}`) ?? place;
    return {
      ...place,
      box: {
        x: at.box.x + (size.dx ?? 0),
        y: at.box.y + (size.dy ?? 0),
        w: size.w,
        h: size.h,
      },
    };
  };

  /** The figures the character's own page writes, on the picture they belong to. */
  const saying = (on: WornPicture) =>
    Object.entries(said).map(([what, says]) => {
      const part = on.fieldOf(on.find(spec.values?.[what]));
      return part && says ? (
        <span
          key={`said.${what}`}
          style={{
            ...on.words(part, INK),
            ...(raised.has(what) && spec.tones?.raised ? { color: spec.tones.raised } : {}),
          }}
        >
          {says}
        </span>
      ) : null;
    });

  /** The attribute pages under their window, swiped a page at a time; `showing` false on the other tab. */
  const attributeStrip = (showing: boolean) => {
    const window_ = worn.find(spec.panels?.window);
    const frame = stripWorn.frame;
    // The two pictures measure from different corners, so the strip is
    // stood where the screen stands a field both of them carry: the one
    // the character's level is written in, on the page it opens on.
    const anchor = spec.values?.level;
    const onScreen = worn.whole.find(part => anchor && isNamed(part, anchor))?.box;
    const onStrip = stripWorn.find(anchor)?.box;
    const windowWhole = worn.whole.find(part => part.path === spec.panels?.window)?.box;
    if (!window_ || !frame || !stripWorn.image || !onScreen || !onStrip || !windowWhole)
      return null;
    const left = onScreen.x - windowWhole.x - onStrip.x;
    const top = onScreen.y - windowWhole.y - onStrip.y;
    const pageAt = (at: number) =>
      stripWorn.whole.find(part => part.path === insideStrip(sides[at]?.panel ?? '', strip))?.box
        .x ?? 0;
    const shift = pageAt(page) - pageAt(home);
    const captions = Object.fromEntries(
      Object.entries(spec.captions ?? {}).map(([where, what]) => {
        const inside = insideStrip(where, strip);
        const figure = sheetFigure(sheet, spec.figures?.[inside]);
        return [inside, figure ? `${what} ${figure}` : what];
      }),
    );
    return (
      <div
        className="touch-none overflow-hidden"
        // Kept mounted while the other page is open, only hidden: the strip's
        // lettering is sized from its picture, which is measured as it shows.
        style={{
          ...worn.box(window_),
          pointerEvents: 'auto',
          display: showing ? undefined : 'none',
        }}
        data-attribute-pages={sides.length}
        onPointerDown={(event: PointerEvent) => {
          swipeFrom.current = event.clientX;
        }}
        onPointerUp={(event: PointerEvent) => {
          const from = swipeFrom.current;
          swipeFrom.current = null;
          if (from !== null) setPage(at => pageAfterSwipe(at, sides.length, event.clientX - from));
        }}
        onPointerCancel={() => {
          swipeFrom.current = null;
        }}
      >
        <div
          className="absolute transition-transform duration-200"
          style={{
            left: `${left * worn.scale}px`,
            top: `${top * worn.scale}px`,
            width: `${frame.w * worn.scale}px`,
            height: `${frame.h * worn.scale}px`,
            transform: `translateX(${-shift * worn.scale}px)`,
          }}
        >
          <img
            ref={stripWorn.pictureRef}
            src={stripWorn.image.url}
            onLoad={() => setStripLoads(loads => loads + 1)}
            alt=""
            aria-hidden="true"
            className="block h-full w-full"
            draggable={false}
          />
          <WornCaptions worn={stripWorn} spec={{ ...spec, captions }} />
          {saying(stripWorn)}
        </div>
      </div>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={other ? `${other.name}'s character` : 'Character'}
      className="touch-none overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-auto"
        draggable={false}
      />

      {/* What the screen calls its own parts. The tab that is open is
          written light and the other keeps the colour it was drawn in,
          which is how the screen says which page you are looking at. */}
      <WornCaptions
        worn={worn}
        spec={spec}
        styleOf={where => {
          const tab = tabs.find(one => one.text === where);
          if (!tab || tab.panel !== open) return undefined;
          return tab.openTone ? { color: tab.openTone } : undefined;
        }}
      />

      {/* The two pages, and which one is showing. The open one is
          written light; the screen leaves the rest the colour they were
          drawn in, which is what tells them apart. */}
      {tabs.map(tab => {
        const part = worn.find(tab.control);
        return part ? (
          <button
            key={tab.control}
            type="button"
            aria-label={tab.caption || tab.panel}
            aria-current={tab.panel === open ? 'true' : undefined}
            data-tab={tab.control}
            onClick={() => {
              // Turning to the other page puts away whatever the last one
              // had open: a card describing something on a page you are no
              // longer looking at is a card about nothing.
              setReading(null);
              setChoosing(null);
              setOpen(tab.panel);
            }}
            style={worn.box(part)}
            className={hit}
          />
        ) : null;
      })}

      {/* What the character's own page says about them, on the strip of
          attribute pages where the screen has one. */}
      {strip
        ? attributeStrip(open === spec.panels?.attributes)
        : open === spec.panels?.attributes && saying(worn)}

      {/* A dot for each attribute page. The movie has one red face for all
          of them, so the dots of the pages not showing are greyed where they
          lie: only the page showing keeps its red. */}
      {open === spec.panels?.attributes &&
        sides.map((side, at) => {
          const part = worn.find(side.control);
          return part ? (
            <button
              key={side.control}
              type="button"
              aria-label={side.caption || `Page ${at + 1}`}
              aria-current={at === page ? 'true' : undefined}
              data-page={at}
              onClick={() => setPage(at)}
              style={worn.box(part)}
              className={
                at === page ? hit : `${hit} rounded-full backdrop-brightness-75 backdrop-grayscale`
              }
            />
          ) : null;
        })}

      {/* The hero's own body, where the screen leaves room for it. The
          build draws the character there and the movie leaves the space
          black, so an empty frame reads as a hole in the screen. */}
      {(() => {
        const part = worn.find(spec.groups?.body);
        return part ? (
          <div style={worn.box(part)} className="overflow-hidden">
            <CharacterBody unitId={other?.unitId} />
          </div>
        ) : null;
      })()}

      {/* What belongs in a place with nothing in it. The screen draws
          these itself, one picture per place, out of its own icons. */}
      {places.map((place, index) => {
        const empty = grid?.empty;
        return empty && !pieceAt(slotOf(index)) ? (
          <WornEmblem
            key={`${place.path}.empty`}
            worn={worn}
            at={worn.parts.find(part => part.path === `${place.path}/${empty.at ?? grid?.face}`)}
            icon={empty.icons[index]}
            size={empty.size}
          />
        ) : null;
      })}

      {/* Every place on the body, and what is worn there. */}
      {places.map((place, at) => {
        const index = slotOf(at);
        const where: StorageSlot = { area: 'equipment', index };
        const piece = pieceAt(index);
        const item = piece?.item;
        if (readOnly) {
          // Somebody else's: nothing moves, and a press only describes.
          return (
            <WornSlot
              key={place.path}
              worn={worn}
              slot={boxOf(place)}
              icon={piece ? (itemIcons.value.get(piece.entry) ?? null) : null}
              name={piece ? itemName(piece) : undefined}
              onClick={(event: MouseEvent) => {
                if (!piece) return;
                const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
                describe(piece, { x: on.right, y: on.top });
              }}
            />
          );
        }
        return (
          <WornSlot
            key={place.path}
            worn={worn}
            slot={boxOf(place)}
            icon={item ? (itemIcons.value.get(item.entry) ?? null) : null}
            name={item ? itemName(item) : undefined}
            lifted={sameSlot(itemDrag.value?.from ?? null, where)}
            over={isDragOver(where, dragOver.value)}
            data-drop-slot={dropSlotAttribute(where)}
            onPointerDown={(event: PointerEvent) => {
              if (!item) return;
              startItemDrag(event, dragged(item), where, {
                onDrop: (_payload, from, to) => {
                  if (bodyDrop(from, to) === 'remove') actions.unequip(item, to ?? undefined);
                },
              });
            }}
            onClick={(event: MouseEvent) => {
              const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
              setBeside({ x: on.right, y: on.top });
              // Nothing is described yet: pressing a place asks what
              // should go there, and what each of the answers is comes
              // from pressing it in the list — the one already worn
              // included, which the list shows at the top.
              setCardAt(null);
              setReading(null);
              if (item || candidates(index).length) setChoosing(index);
            }}
            className={item ? 'cursor-grab' : undefined}
          />
        );
      })}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label={other ? `Close ${other.name}'s sheet` : 'Close the character sheet'}
            onClick={onClose}
            style={worn.box(part)}
            className={hit}
          />
        ) : null;
      })()}

      <ItemDragGhost />

      {/* What could go in the place that was pressed. */}
      {choosing !== null && (
        <ArtItemListWindow
          choices={candidates(choosing)}
          wearing={wornAt(choosing) ?? null}
          beside={beside}
          // Pressing a thing opens its card beside the row; the list stays up behind it.
          onPick={describe}
          onRemove={describe}
          onClose={() => setChoosing(null)}
        />
      )}

      {/* What is being read, wearing the shipped card where the user's
          file has one and the built card where it has not: a thing pressed
          always says what it is. */}
      {readingItem && !heldCard ? (
        <div
          className="z-card pointer-events-auto fixed"
          style={{ left: `${cardAt?.x ?? 0}px`, top: `${cardAt?.y ?? 0}px` }}
        >
          <ItemDetails
            item={readingItem}
            name={itemName(readingItem)}
            equipped={readingItem.slot?.area === 'equipment'}
            onClose={() => setReading(null)}
          />
        </div>
      ) : null}
      {readingPiece && heldCard && (
        <ArtItemCard
          listing={cardFor(readingPiece)}
          wears={HELD_CARD}
          actions={(() => {
            // On somebody else's sheet the one thing a piece offers is to
            // be tried on.
            if (other && onTryOn && readingPiece)
              return [
                {
                  key: 'tryOn',
                  onPick: () => {
                    onTryOn(readingPiece.entry);
                    setReading(null);
                  },
                },
              ];
            if (!readingItem) return [];
            const does = heldAction(readingItem, itemFacts.value.get(readingItem.entry));
            return does
              ? [
                  {
                    key: does,
                    onPick: () => {
                      if (does === 'unequip') actions.unequip(readingItem);
                      else if (does === 'equip') actions.equip(readingItem);
                      else actions.use(readingItem);
                      setReading(null);
                    },
                  },
                ]
              : [];
          })()}
          anchor={cardAt}
          // Nothing to hold this up against: what the card describes is
          // the thing already being worn there.
          canCompare={false}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}
