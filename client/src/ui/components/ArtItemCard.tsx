/**
 * The shipped item card, for the market, shops and the bag: a titled body
 * with strips of controls stacked under it, depending on where it opened.
 * Holding the compare control shows a second card for what is worn there,
 * with differences. Without the art the caller falls back.
 */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { heroClass, player } from '../hudStore';
import { equippedSlots, itemFacts, itemNames, itemTexts, spellTexts } from '../inventoryStore';
import { wantDialog } from '../art/pieceStore';
import { screenSpec } from '../art/uiSpec';
import type { ScreenSpec } from '../art/uiSpec';
import { meaningOf } from '../art/screenMeanings';
import { equipmentHomesFor, qualityTextClass } from '../items';
import { cardLines, holding, placeAlongside, placeBeside } from '../itemCard';
import type { CardLine, Tone } from '../itemCard';
import { INK, LIGHT, useWorn } from '../art/useWorn';
import { namedCoins } from '../money';
import type { Worn } from '../art/useWorn';
import type { ItemFacts } from '../../assets/types';
import type { AuctionListingView } from '../auctionStore';

/** Our name for this card. The spec says which dialog wears it. */
const SCREEN = 'goods';

/** Our name for the card that stands for something already worn. */
const WORN_SCREEN = 'equipped';

/** The card a thing you have opens: the comparison's dialog with its controls kept. */
export const HELD_CARD = 'held';

/** How many strips a card can stack. Two covers every card shape. */
const STRIPS = 2;

/** A card stands beside what opened it, never on the stage, so it must not stretch one. */
const FLOATS = { floats: true } as const;

/** Framed on the backdrop and anything over its edges, so the band and close mark show whole. */
const CARD = { floats: true, spills: true } as const;

/** What each tone of line is written in. Colours of the shipped card. */
const TONES: Record<Tone, string> = {
  plain: 'var(--color-card-plain)',
  gain: 'var(--color-card-gain)',
  loss: 'var(--color-card-loss)',
  note: 'var(--color-card-note)',
};

/** What a card standing for something worn says it is, above the name. */
const WORN_TONE = 'var(--color-card-worn)';

/** Words inset as a fraction, holding at any size; flush, a line reads as cut off. */
const INSET = '2%';

/**
 * A card's title: off the frame on both sides, not centred in its room (the
 * room runs the card's height, since the screen measures the name and moves
 * the rest down). Wraps at spaces, never mid-word.
 */
const TITLE: JSX.CSSProperties = {
  overflow: 'visible',
  overflowWrap: 'normal',
  wordBreak: 'normal',
  paddingLeft: INSET,
  paddingTop: INSET,
};

/**
 * How long the card takes to grow out of the corner it stands from: long
 * enough to read as a gesture, short enough to get out of the way.
 */
const OPENING = 150;

/** How long a card held up against another takes to slide in beside it. */
const ARRIVING = 140;

/** One thing the caller lets a player do from the card. */
export interface CardAction {
  /** Our name for it; the spec says where it goes and what it reads. */
  key: string;
  /** What it costs, in copper, for a control the screen writes a price on. */
  price?: number;
  onPick(): void;
}

/** A bag slot in a market row's shape, so one card serves both. */
export function cardFor(item: { id: string; entry: number; count: number }): AuctionListingView {
  const facts = itemFacts.value.get(item.entry);
  const said = facts?.descriptionId ? itemTexts.value.get(facts.descriptionId) : undefined;
  return {
    id: item.id,
    sellerName: player.value?.name ?? '',
    itemEntry: item.entry,
    itemCount: item.count,
    name: itemNames.value.get(item.entry) ?? `Item ${item.entry}`,
    startPrice: 0,
    listedAt: 0,
    expiresAt: 0,
    currentBid: 0,
    ...(facts ? { facts } : {}),
    ...(said ? { description: said } : {}),
  };
}

export interface ArtItemCardProps {
  listing: AuctionListingView;
  actions: readonly CardAction[];
  /** Which card: the market row's (a thing for sale) or the bag slot's (yours, to wear or use). */
  wears?: string;
  /** Offered only for something worn, where something is already worn there. */
  canCompare?: boolean;
  /** What was pressed to open it, on screen. The card opens beside it. */
  anchor?: { x: number; y: number } | null;
  onClose(): void;
}

/** Lines gathered into rows: a continuation shares its row (one sentence in two colours). */
function rowsOf(lines: CardLine[]): CardLine[][] {
  const rows: CardLine[][] = [];
  for (const line of lines) {
    if (line.joined && rows.length) rows[rows.length - 1]!.push(line);
    else rows.push([line]);
  }
  return rows;
}

/** The card's lines in the movie's box, scrolled (with marks) rather than spilled. */
function Lines({
  lines,
  style,
  sizePx,
  align,
  onOverflow,
}: {
  lines: CardLine[];
  style: JSX.CSSProperties;
  sizePx: number;
  align: string;
  /** Told whether the words run past the box, whenever that may change. */
  onOverflow(over: boolean): void;
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  useLayoutEffect(() => {
    const on = box.current;
    // A pixel of rounding is not more to read.
    const runs = Boolean(on && on.scrollHeight > on.clientHeight + 1);
    setOver(runs);
    onOverflow(runs);
  });
  return (
    <div
      ref={box}
      style={{
        ...style,
        // Scrolled only once there is more than fits, so a card that says
        // everything in its room wears no bar.
        overflowY: over ? 'auto' : 'hidden',
        overflowX: 'hidden',
        // What a card says is scrolled inside the card. Once it has no
        // further to go the wheel stops there rather than carrying on
        // into whatever is behind it — a card is read where it stands,
        // not while the screen under it slides away.
        overscrollBehavior: 'contain',
        scrollBehavior: 'smooth',
        paddingLeft: INSET,
      }}
      className="flex flex-col gap-[2%]"
    >
      {rowsOf(lines).map((row, at) => (
        <span
          key={`${at}:${row[0]!.text}`}
          className="flex w-full justify-between gap-[6%] whitespace-normal"
          style={{ textAlign: align, fontSize: `${sizePx}px` }}
        >
          <span>
            {row.map((line, piece) => (
              <span key={`${piece}:${line.text}`} style={{ color: TONES[line.tone] }}>
                {piece ? ` ${line.text}` : line.text}
              </span>
            ))}
          </span>
          {/* The far column of the one line written in two. */}
          {row[0]!.far ? <span style={{ color: TONES[row[0]!.tone] }}>{row[0]!.far}</span> : null}
        </span>
      ))}
    </div>
  );
}

/** The card for what is worn where the offer would go; each figure carries the difference. */
function ArtWornCard({
  facts,
  name,
  describedAs,
  against,
  unit,
  left,
  top,
  placed,
  from,
  onWidth,
}: {
  facts: ItemFacts;
  name: string;
  describedAs?: string;
  against: ItemFacts | null;
  unit: number;
  left: number;
  top: number;
  /** Drawn but hidden until placed: placement needs its width, or it flashes in the corner. */
  placed: boolean;
  /** The side of the card it stands on, which is the side it comes in from. */
  from: 'left' | 'right';
  onWidth(width: number): void;
}): JSX.Element | null {
  const spec = screenSpec(WORN_SCREEN);
  useEffect(() => {
    if (spec) wantDialog(spec.dialog);
  }, [spec]);
  const [over, setOver] = useState(false);
  const worn = useWorn(
    spec?.dialog,
    spec?.frame,
    { hidden: [...(spec?.hidden ?? []), ...(over ? [] : runsOn(spec))] },
    CARD,
  );
  const width = worn.frame ? worn.frame.w * unit : 0;
  useEffect(() => {
    if (width) onWidth(width);
  }, [width, onWidth]);

  if (!spec?.card || !worn.image || !worn.frame) return null;
  const card = spec.card;
  const said = worn.fieldOf(worn.find(card.equipped));
  const title = worn.fieldOf(worn.find(card.title));
  const text = worn.find(card.body);
  const lines = cardLines(
    {
      facts,
      describedAs,
      does: whatItDoes(facts),
      level: player.value?.level ?? 0,
      playerClass: heroClass.value,
      against,
    },
    spec,
  );

  // The card makes room for what it says at the top: the name drops below
  // the rule under that line, and what the card says drops with the name.
  // What it says keeps its foot where it was rather than following, or it
  // would be pushed through the bottom of the card and onto the screen.
  const drop = said && title ? said.box.y + said.box.h + 14 - title.box.y : 0;
  /** Moved down by that much, keeping the room it was given. */
  const down = (style: JSX.CSSProperties, box: { y: number }): JSX.CSSProperties =>
    drop && worn.frame ? { ...style, top: `${((box.y + drop) / worn.frame.h) * 100}%` } : style;
  /** Moved down but not lengthened: its foot stays inside the card. */
  const squeezed = (style: JSX.CSSProperties, box: { y: number; h: number }): JSX.CSSProperties =>
    drop && worn.frame
      ? {
          ...down(style, box),
          height: `${(Math.max(0, box.h - drop) / worn.frame.h) * 100}%`,
        }
      : style;

  return (
    <div
      className="pointer-events-auto absolute motion-safe:animate-[var(--arriving)]"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        visibility: placed ? undefined : 'hidden',
        ['--arriving' as string]: `slide-in-from-${from} ${ARRIVING}ms ease-out`,
      }}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block"
        draggable={false}
      />
      {said && <span style={worn.words(said, WORN_TONE)}>{spec.formats?.equippedTitle ?? ''}</span>}
      {title && (
        <span
          className={facts.quality ? qualityTextClass(facts.quality) : undefined}
          style={{
            ...down(worn.words(title, LIGHT, true), title.box),
            ...TITLE,
            ...(facts.quality ? { color: undefined } : {}),
          }}
        >
          {name}
        </span>
      )}
      {text && (
        <Lines
          lines={lines}
          style={squeezed(worn.box(text), text.box)}
          sizePx={(text.text?.sizePx ?? 12) * unit}
          align={text.text?.align ?? 'left'}
          onOverflow={setOver}
        />
      )}
    </div>
  );
}

/** The parts of a card that say its words run on, drawn only while they do. */
function runsOn(spec: ScreenSpec | null | undefined): string[] {
  return [spec?.marks?.above, spec?.marks?.below, spec?.panels?.bar].filter(
    (name): name is string => Boolean(name),
  );
}

/** What the spells a thing carries do, in whatever words have arrived. */
function whatItDoes(facts: ItemFacts | null): string[] {
  const said = spellTexts.value;
  return (facts?.spells ?? []).flatMap(id => {
    const words = said.get(id);
    return words ? [words] : [];
  });
}

/** What is worn where this thing would go, and what each of them is. */
function wornAgainst(inventoryType: number): Array<{ entry: number; facts: ItemFacts }> {
  const slots = equippedSlots.value;
  const known = itemFacts.value;
  return equipmentHomesFor(inventoryType).flatMap(slot => {
    const item = slots[slot];
    const facts = item ? known.get(item.entry) : undefined;
    return item && facts ? [{ entry: item.entry, facts }] : [];
  });
}

export function ArtItemCard({
  listing,
  actions,
  anchor,
  canCompare = false,
  wears = SCREEN,
  onClose,
}: ArtItemCardProps): JSX.Element | null {
  const spec = screenSpec(wears);
  const wanted = spec?.dialog ?? meaningOf(wears)?.dialog;
  useEffect(() => {
    if (wanted) wantDialog(wanted);
  }, [wanted]);
  /**
   * Pressing away puts the card away and carries on to what was pressed, so
   * a second row swaps cards in one press. Nothing behind is dimmed.
   */
  const standing = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (event: PointerEvent): void => {
      const at = event.target;
      if (at instanceof Node && standing.current?.contains(at)) return;
      onClose();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [onClose]);
  /** The room the card stands in, in view terms; inside a moved box, that box. */
  const [room, setRoom] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const at = standing.current?.getBoundingClientRect();
    const next = at && at.width > 0 && at.height > 0 ? at : null;
    setRoom(now =>
      now &&
      next &&
      now.x === next.left &&
      now.y === next.top &&
      now.w === next.width &&
      now.h === next.height
        ? now
        : next
          ? { x: next.left, y: next.top, w: next.width, h: next.height }
          : null,
    );
  });
  /** Whether the control that holds one thing against another is down. */
  const [comparing, setComparing] = useState(false);
  const [wornWidth, setWornWidth] = useState(0);
  /** Whether what the card says runs past its foot, which is when it says so. */
  const [over, setOver] = useState(false);

  const card = spec?.card;
  /** What the card offers and on which piece; an action with no strip belongs to the body. */
  const offered = actions.flatMap(action => {
    const where = card?.actions?.[action.key];
    return where ? [{ ...action, where, on: where.strip ?? 'body' }] : [];
  });
  const strips = [
    ...new Set(offered.flatMap(action => (action.where.strip ? [action.where.strip] : []))),
  ].slice(0, STRIPS);
  /** Coins a written price leaves out: a coin with nothing in it is not drawn. */
  const unpriced = offered.flatMap(action => {
    if (!action.where.price) return [];
    const named = namedCoins(action.price ?? 0);
    return (['gold', 'silver', 'copper'] as const).flatMap(coin =>
      named[coin]
        ? []
        : [action.where.price!.coins[coin], action.where.price!.amounts[coin]].filter(
            (path): path is string => path !== undefined,
          ),
    );
  });
  const everyStrip = [
    ...new Set(
      Object.values(card?.actions ?? {}).flatMap(where => (where.strip ? [where.strip] : [])),
    ),
  ];
  const off = [
    ...(spec?.hidden ?? []),
    ...(over ? [] : runsOn(spec)),
    ...everyStrip,
    ...(canCompare || !card?.compare ? [] : [card.compare]),
    // Hide controls for actions not offered. By control, not by action: one
    // control puts on, takes off or uses depending on the thing.
    ...Object.values(card?.actions ?? {})
      .map(where => where.control)
      .filter(control => !offered.some(action => action.where.control === control)),
  ];

  // The body, framed on its own backdrop so nothing beyond it is drawn and
  // everything in it is placed against the card's own edges.
  const body = useWorn(spec?.dialog, card?.body ? spec?.frame : undefined, { hidden: off }, CARD);
  // The close is drawn in the body, where the movie puts it; it is only
  // asked for here so the same number of hooks runs whatever the card
  // is showing.
  useWorn(undefined, undefined, {}, FLOATS);
  // One picture per strip, each framed on itself, so it can be put where
  // it belongs rather than where the movie parks it.
  const worn: Worn[] = [
    useWorn(
      strips[0] ? spec?.dialog : undefined,
      strips[0],
      {
        shownInside: strips[0] ? [strips[0]] : [],
        hidden: [
          ...(spec?.hidden ?? []),
          ...(canCompare || !card?.compare ? [] : [card.compare]),
          ...everyStrip.filter(name => name !== strips[0]),
          ...unpriced,
        ],
      },
      FLOATS,
    ),
    useWorn(
      strips[1] ? spec?.dialog : undefined,
      strips[1],
      {
        shownInside: strips[1] ? [strips[1]] : [],
        hidden: [
          ...(spec?.hidden ?? []),
          ...(canCompare || !card?.compare ? [] : [card.compare]),
          ...everyStrip.filter(name => name !== strips[1]),
          ...unpriced,
        ],
      },
      FLOATS,
    ),
  ];

  if (!spec || !card || !body.image || !body.frame) return null;

  /** Body and close mark where the movie puts them; the parked strips stacked under the body. */
  const pieces: Array<{ key: string; worn: Worn; x: number; y: number }> = [
    { key: 'body', worn: body, x: body.frame.x, y: body.frame.y },
  ];
  // Its picture is the body's own: the close is drawn there, and only
  // the control over it is put on here.
  const shutAt = body.find(spec.close);
  // A strip laps over the edge of whatever is above it, which is how one
  // border shows between them rather than two. The movie laps the first
  // one over the body, and that lap is kept as the rest are stacked.
  const foot = body.frame.y + body.frame.h;
  const lap = Math.max(0, foot - (worn[0]?.frame?.y ?? foot));
  let below = foot - lap;
  for (const [at, strip] of strips.entries()) {
    const drawn = worn[at];
    if (!drawn.image || !drawn.frame) continue;
    pieces.push({ key: strip, worn: drawn, x: drawn.frame.x, y: below });
    below += drawn.frame.h - lap;
  }

  const left = Math.min(...pieces.map(piece => piece.x));
  const top = Math.min(...pieces.map(piece => piece.y));
  const wide = Math.max(...pieces.map(piece => piece.x + piece.worn.frame!.w)) - left;
  const tall = below + lap - top;
  /** Shown (not drawn) pixels per card unit, from the body; drawn pixels made the card too big. */
  const unit = body.image.width / body.frame.w / body.sharper;

  const title = body.fieldOf(body.find(card.title));
  const text = body.find(card.body);

  const facts = listing.facts ?? null;
  const lines = cardLines(
    {
      facts,
      describedAs: listing.description,
      does: whatItDoes(facts),
      level: player.value?.level ?? 0,
      playerClass: heroClass.value,
    },
    spec,
  );

  const space = room ?? { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
  const pressed = anchor ? { x: anchor.x - space.x, y: anchor.y - space.y } : null;
  /** Brought down to fit a small view rather than running off its edges. */
  const fits = Math.min(1, (space.w * 0.9) / (wide * unit), (space.h * 0.9) / (tall * unit));
  const shown = unit * fits;
  const size = { w: wide * shown, h: tall * shown };
  const beside = pressed ? placeBeside(pressed, size, space) : null;
  const held = comparing ? wornAgainst(facts?.inventoryType ?? 0) : [];
  const alongside =
    beside && wornWidth
      ? placeAlongside(
          { left: beside.left, top: beside.top, w: size.w },
          wornWidth,
          held.length,
          space,
        )
      : [];

  return (
    <div
      ref={standing}
      className="pointer-events-none fixed inset-0 z-dialog"
      // Whatever is under the pointer takes the wheel. Inside a card that
      // is the card; the screen behind stays where it was put.
      onWheel={event => event.stopPropagation()}
    >
      {held.map((other, at) => (
        <ArtWornCard
          key={other.entry}
          facts={other.facts}
          name={itemNames.value.get(other.entry) ?? ''}
          describedAs={
            other.facts.descriptionId ? itemTexts.value.get(other.facts.descriptionId) : undefined
          }
          against={facts}
          unit={shown}
          left={alongside[at]?.left ?? 0}
          top={alongside[at]?.top ?? 0}
          placed={Boolean(alongside[at])}
          from={(alongside[at]?.left ?? 0) < (beside?.left ?? 0) ? 'right' : 'left'}
          onWidth={setWornWidth}
        />
      ))}
      <div
        role="dialog"
        aria-label={listing.name}
        className="pointer-events-auto absolute motion-safe:animate-[scale-in_var(--opening)_ease-out]"
        style={{
          width: `${size.w}px`,
          height: `${size.h}px`,
          // The card grows out of the corner it stands from over `OPENING`.
          ['--opening' as string]: `${OPENING}ms`,
          ...(beside
            ? { left: `${beside.left}px`, top: `${beside.top}px`, transformOrigin: beside.from }
            : { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }),
        }}
      >
        {pieces.map(piece => (
          <div
            key={piece.key}
            className="absolute"
            style={{ left: `${(piece.x - left) * shown}px`, top: `${(piece.y - top) * shown}px` }}
          >
            {/* Words are sized against the picture they sit on, so every
                picture has to be measured, not just the body's. */}
            <img
              ref={piece.worn.pictureRef}
              src={piece.worn.image!.url}
              alt=""
              aria-hidden="true"
              className="block"
              draggable={false}
            />

            {piece.key === 'body' && (
              <>
                {title && (
                  <span
                    // A name is coloured by what the item is, which is the
                    // first thing the screen says about it.
                    className={facts?.quality ? qualityTextClass(facts.quality) : undefined}
                    style={{
                      // The field was given room for three lines, so a
                      // long name uses them rather than being cut off.
                      ...body.words(title, LIGHT, true),
                      ...TITLE,
                      ...(facts?.quality ? { color: undefined } : {}),
                    }}
                  >
                    {listing.name}
                  </span>
                )}
                {text && (
                  <Lines
                    lines={lines}
                    style={body.box(text)}
                    sizePx={(text.text?.sizePx ?? 12) * shown}
                    align={text.text?.align ?? 'left'}
                    onOverflow={setOver}
                  />
                )}
              </>
            )}

            {piece.key === 'body' && shutAt && (
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                style={body.box(shutAt)}
                className="absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90"
              />
            )}

            {/* Held under a finger, switched under a pointer. The screen
                was drawn for a touch, where holding is the only way to
                read one card against another and keep both hands on the
                glass; with a mouse there is nothing to keep hold of, and
                holding a button down to read is a poor way to spend a
                hand. See `holding`. */}
            {canCompare &&
              card.compare &&
              (() => {
                const control = piece.worn.find(card.compare);
                return control ? (
                  <button
                    type="button"
                    aria-label="Compare with what is worn"
                    aria-pressed={comparing}
                    onPointerDown={event =>
                      setComparing(holding(event) ? true : showing => !showing)
                    }
                    onPointerUp={event => holding(event) && setComparing(false)}
                    onPointerLeave={event => holding(event) && setComparing(false)}
                    onPointerCancel={event => holding(event) && setComparing(false)}
                    // A button reached by the keyboard is pressed, never
                    // held, so it switches whatever the pointer would do.
                    onKeyDown={event => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      setComparing(showing => !showing);
                    }}
                    style={piece.worn.box(control)}
                    className="absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90"
                  />
                ) : null;
              })()}

            {offered
              .filter(action => action.on === piece.key)
              .map(action => {
                const control = piece.worn.find(action.where.control);
                return control ? (
                  <button
                    key={action.key}
                    type="button"
                    // Named by the words the screen writes on it, and by
                    // our own name for it where the screen writes none:
                    // a control nobody can name is a control a screen
                    // reader cannot offer.
                    aria-label={action.where.says || action.key}
                    onClick={action.onPick}
                    style={piece.worn.box(control)}
                    className="absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90"
                  />
                ) : null;
              })}
            {/* A button's words sit beside it rather than inside: a box
                given as a fraction of the picture has to be measured
                against the picture, not against the button. */}
            {offered
              .filter(action => action.on === piece.key)
              .map(action => {
                const label = piece.worn.fieldOf(piece.worn.find(action.where.label));
                return label && action.where.says ? (
                  <span key={`${action.key}.says`} style={piece.worn.words(label)}>
                    {action.where.says}
                  </span>
                ) : null;
              })}
            {offered
              .filter(action => action.on === piece.key && action.where.price)
              .flatMap(action => {
                const named = namedCoins(action.price ?? 0);
                return (['gold', 'silver', 'copper'] as const).map(coin => {
                  const field = piece.worn.fieldOf(
                    piece.worn.find(action.where.price!.amounts[coin]),
                  );
                  return field && named[coin] ? (
                    <span key={`${action.key}.${coin}`} style={piece.worn.words(field, INK)}>
                      {named[coin]}
                    </span>
                  ) : null;
                });
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
