/**
 * The auction house on the shipped screen. What each part is comes from the
 * spec; words, behaviour and calls are ours. Without the art, the built
 * window, the tested path.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { ArtItemCard } from './ArtItemCard';
import { Dialog } from './Dialog';
import { iconUrl } from '../iconUrl';
import {
  equippedSlots,
  inventory,
  itemFacts,
  itemIcons,
  itemName,
  itemTexts,
} from '../inventoryStore';
import { equipmentHomesFor, qualityTextClass } from '../items';
import { money, player } from '../hudStore';
import { coinsOf, formatMoney, splitCoins } from '../money';
import type { PiecePart } from '../art/piecePlan';
import type { ComboSpec, ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import { WornChevrons } from '../art/WornChevrons';
import { WornRow } from '../art/WornRow';
import { WornSlot } from '../art/WornSlot';
import { pagesFor, slotsOf } from '../art/wornSlots';
import type { AuctionInteraction, AuctionListingView, AuctionSearch } from '../auctionStore';
import { cx } from './cx';

/** Our name for this screen. The spec says which dialog wears it. */
const SCREEN = 'auction';

/**
 * How long a listing has left, in the shape the column expects.
 *
 * Empty where the server has not said when it ends: a listing with no
 * expiry is not one that expires now, and `0M` reads as though it were.
 */
export function remainingTime(expiresAt: number): string {
  if (!expiresAt) return '';
  // The wire counts in seconds and the clock here counts in thousandths,
  // so the two have to be brought to the same unit before they are
  // subtracted. Taken as they come, every listing is a thousand times
  // further in the past than it is, and every row reads as expired.
  const left = Math.max(0, expiresAt * 1000 - Date.now());
  const hours = Math.floor(left / 3_600_000);
  const minutes = Math.floor((left % 3_600_000) / 60_000);
  return hours ? `${hours}H${minutes}M` : `${minutes}M`;
}

/** What a listing stands at: the bid so far, or the price it opened at. */
function bidOf(listing: { currentBid: number; startPrice: number }): number {
  return listing.currentBid || listing.startPrice;
}

/** What a listing costs: what it would take to have it now. */
function priceOf(listing: {
  buyoutPrice?: number;
  currentBid: number;
  startPrice: number;
}): number {
  return listing.buyoutPrice || listing.currentBid || listing.startPrice;
}

export interface ArtAuctionWindowProps extends AuctionInteraction {
  onClose(): void;
}

export function ArtAuctionWindow(props: ArtAuctionWindowProps): JSX.Element | null {
  // No spec or no movie means no build is mounted, in which case nothing
  // else on screen has its art either. Nothing is drawn rather than a
  // second auction house of our own invention.
  const spec = useWornScreen(SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

/** The screen itself, once there is a spec and a movie to draw it from. */
function Worn({
  listings,
  total,
  status,
  onBrowse,
  onList,
  onBid,
  onBuyout,
  onCancel,
  onClose,
  spec,
}: ArtAuctionWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const panelNames = Object.keys(spec.panels ?? {});
  const [tab, setTab] = useState((spec.tabs ?? [])[0]?.control ?? '');
  const showing = (spec.tabs ?? []).find(entry => entry.control === tab);
  const panel = showing?.panel ?? panelNames[0] ?? '';
  const [openCombo, setOpenCombo] = useState<{
    path: string;
    of: string;
    control: string;
    offers: string[];
  } | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  /** What a dropdown offers, narrowed by the choice showing in the one it follows. */
  const offeredBy = (combo: ComboSpec): string[] =>
    combo.optionsBy && combo.follows
      ? (combo.optionsBy[chosen[combo.follows] ?? ''] ?? Object.values(combo.optionsBy)[0] ?? [])
      : (combo.options ?? []);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [typing, setTyping] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [selling, setSelling] = useState<string | null>(null);
  const [bagPage, setBagPage] = useState(0);
  const [asking, setAsking] = useState<{ id: string; buy: boolean } | null>(null);
  /** A listing the player is reading, and a bag item they are reading. */
  const [reading, setReading] = useState<string | null>(null);
  /** Where the row that opened the card was, so the card can stand beside it. */
  const [beside, setBeside] = useState<{ x: number; y: number } | null>(null);
  const [inspecting, setInspecting] = useState<string | null>(null);
  /** Whether anything was searched yet: unasked and empty look alike but mean opposite things. */
  const [asked, setAsked] = useState(false);
  const [page, setPage] = useState(0);
  /**
   * The first row of the page that is on screen.
   *
   * The run of rows the screen draws is shorter than a page, so a page is
   * scrolled through it.
   */
  const scroll = useListScroll();
  /** The server's match count, so pages are known without asking for them. */
  const counted = asked ? (total ?? listings.length) : 0;
  const perPage = spec.paging?.perPage ?? 0;
  const pages = perPage > 0 ? Math.ceil(counted / perPage) : counted ? 1 : 0;
  /** Turn to another page, which means asking the market for it. */
  const turnTo = (wanted: number): void => {
    const held = Math.max(0, Math.min(wanted, Math.max(0, pages - 1)));
    if (held === page) return;
    setPage(held);
    scroll.reset();
    onBrowse(searchFrom(held * (perPage || 0)));
  };

  const panelOf = (name: string): string => spec.panels?.[name] ?? '';
  // Each panel lays its listing out its own way: one keeps a single price
  // block per row, another keeps two.
  const list = spec.lists?.[panel];

  /**
   * What each tab lists. Two of them share one panel — the screen draws a
   * single list — and the difference is whose listings go in it.
   */
  const me = player.value?.name?.toLowerCase();
  const is = (name: string | undefined): boolean => me !== undefined && name?.toLowerCase() === me;
  const shownFor = (which: string): typeof listings => {
    // Without a name to match against, a tab that narrows by owner would
    // narrow to nothing, which reads as a market with nothing in it.
    if (me === undefined) return listings;
    const entry = (spec.tabs ?? []).find(candidate => candidate.control === which);
    if (entry?.caption === 'myAuctions') return listings.filter(one => is(one.sellerName));
    if (entry?.caption === 'myBids') return listings.filter(one => is(one.highestBidder));
    return listings;
  };
  const forTab = asked ? shownFor(tab) : [];

  /** What each column of a row reads, which is also what its coins say. */
  const columnsOf = (listing: AuctionListingView): Record<string, string> => ({
    name: listing.itemCount > 1 ? `${listing.name} x${listing.itemCount}` : listing.name,
    level: listing.facts?.requiredLevel ? String(listing.facts.requiredLevel) : '',
    remaining: remainingTime(listing.expiresAt),
    seller: listing.sellerName,
    priceGold: coinsOf(bidOf(listing)).gold,
    priceSilver: coinsOf(bidOf(listing)).silver,
    buyGold: listing.buyoutPrice ? coinsOf(listing.buyoutPrice).gold : '',
    buySilver: listing.buyoutPrice ? coinsOf(listing.buyoutPrice).silver : '',
  });

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, {
      within: panelOf(panel),
      list,
      items: forTab,
      scroll: scroll.at,
      values: columnsOf,
    });

  /** Every dropdown of the screen, which are drawn open and hidden. */
  const comboListsIn = (whole: readonly PiecePart[]): string[] =>
    whole
      .filter(part => (spec.combos ?? []).some(combo => part.path.endsWith(`/${combo.list}`)))
      .map(part => part.path);

  /**
   * The window is the part the screen draws as its own backdrop. Measured
   * over everything instead it comes out as wide as the runs of slots the
   * screen scrolls behind a mask, and every panel sits in a fraction of it.
   */
  const worn = useWorn(spec.dialog, spec.frame, whole => {
    const slice = sliceOf(whole);
    return {
      // A dropdown is parked, and so is every slot in it.
      shownInside: openCombo ? [openCombo.path] : [],
      shown: [panelOf(panel)],
      // The tab being shown wears its lit face — the parchment one — so
      // the screen says which of the four is open. The spec says which
      // face that is, control by control.
      frames: tab ? { [tab]: spec.faces?.[tab] ?? 1 } : {},
      // A row's own art is the bar under it, which belongs only under the
      // row a player has chosen.
      withoutArt: [...(list?.rowArt === false ? slice.keptRows : []), ...slice.marks],
      hidden: [
        ...(spec.hidden ?? []),
        ...panelNames.filter(name => name !== panel).map(panelOf),
        ...comboListsIn(whole).filter(path => path !== openCombo?.path),
        // Rows with nothing in them, coins no price names, and the marks
        // saying the list runs on in a direction it does not.
        ...slice.hidden,
      ].filter(Boolean),
    };
  });

  const slice = sliceOf(worn.whole);
  const comboPaths = comboListsIn(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  /** The screen's own item slots, in the run it keeps them in. */
  const bagRun = slotsOf(worn.parts, {
    slot: spec.bag?.slot ?? '',
    within: spec.bag?.run,
    // A dropdown holds slots of the same name, and they are not the
    // player's bag.
    except: (spec.combos ?? []).map(combo => combo.list),
  });
  const perBagPage = bagRun.length || 1;
  const bagPages = pagesFor(inventory.value.bagSlotCount, perBagPage);
  const onBagPage = Math.min(bagPage, bagPages - 1);

  const bagItems = inventory.value.items.filter(item => item.slot?.area === 'bag');
  const toList = bagItems.find(item => item.id === selling) ?? null;
  /** What is in each slot of the page showing, by where the server put it. */
  const inBagSlot = (at: number): (typeof bagItems)[number] | undefined =>
    bagItems.find(item => item.slot?.index === onBagPage * perBagPage + at);

  if (!worn.image || !worn.frame) return null;
  const frame = worn.frame;
  const box = worn.box;
  const words = worn.words;
  const find = worn.find;
  const fieldOf = worn.fieldOf;

  /** The search for a page: choices are numbers an item row carries; narrowing is the server's, as paging is. */
  const searchFrom = (offset: number): AuctionSearch => {
    const meant = (control: string) => spec.conditions?.[chosen[control] ?? ''];
    const search: AuctionSearch = { offset, limit: spec.paging?.perPage ?? 0 };
    for (const combo of spec.combos ?? []) {
      const found = meant(combo.control);
      if (!found) continue;
      // The narrower choice wins: picking a kind of armour within armour
      // means that kind, not both conditions at once.
      if (found.kinds?.length) search.kinds = found.kinds;
      if (found.quality !== undefined) search.quality = found.quality;
    }
    const least = Number(numbers.levelLow);
    const most = Number(numbers.levelHigh);
    if (Number.isFinite(least) && numbers.levelLow) search.minLevel = least;
    if (Number.isFinite(most) && numbers.levelHigh) search.maxLevel = most;
    return search;
  };

  const act = (what: string): void => {
    if (what === 'reset') {
      // The conditions go, and so does the answer to them: the screen
      // returns to asking for conditions rather than showing the last
      // search's rows under an empty set of them.
      setChosen({});
      setNumbers({});
      setPage(0);
      scroll.reset();
      setAsked(false);
    } else if (what === 'search') {
      setPage(0);
      scroll.reset();
      setAsked(true);
      onBrowse(searchFrom(0));
    } else if (what === 'list' && toList?.slot) {
      // The fields are coins — so many gold, so many silver — and the
      // game counts in the smallest of them.
      const coins = (gold: string | undefined, silver: string | undefined): number =>
        Number(gold ?? 0) * 10_000 + Number(silver ?? 0) * 100;
      const hours = Number(/^(\d+)/.exec(chosen.btnAuctionTime ?? '')?.[1] ?? 24);
      onList(
        toList.slot,
        toList.id,
        coins(numbers.startPrice, numbers.startSilver),
        hours,
        coins(numbers.buyoutPrice, numbers.buyoutSilver) || undefined,
      );
      setSelling(null);
      setNumbers({});
    }
  };

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';

  return (
    <div className="pointer-events-auto fixed inset-0 z-window flex flex-col items-center justify-center gap-2 bg-black/65 p-0 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Auction house"
        className="relative touch-none overflow-hidden"
        {...listGestures(worn, list, slice, scroll)}
      >
        {/* A hand-held screen gives the window the whole of itself: a
            screen drawn for a phone, shown in a window on a phone, is
            unreadable twice over. A desk has room to spare, so there it
            stays a window with the world visible around it. */}
        <img
          ref={worn.pictureRef}
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="block h-auto max-h-[100dvh] w-full sm:max-h-[85vh] sm:w-auto"
          draggable={false}
        />

        {/* Captions. The places are the spec's, the words are ours. */}
        {Object.entries(spec.captions ?? {}).map(([where, what]) => {
          const part = fieldOf(find(where));
          if (!part) return null;
          // What the screen says instead of a list is not said over one.
          if (where === spec.emptyNote && asked) return null;
          // Only the spec's word. What a field carries is whatever was
          // typed into it while the screen was being laid out — "asdasd",
          // "99" — and none of it was ever meant to be read.
          const caption = what;
          if (!caption) return null;
          // The open tab's words are written dark, because the tab under
          // them has turned to parchment; the shut ones keep the pale
          // colour the dark face was drawn for.
          const open = showing?.text !== undefined && where === showing.text;
          return (
            <span
              key={`caption.${where}`}
              style={open ? { ...words(part), color: 'var(--color-tab-open)' } : words(part)}
            >
              {caption}
            </span>
          );
        })}

        {/* The arrows that turn a list of more than one page. */}
        {(['back', 'on'] as const).map(which => {
          const part = find(spec.paging?.[which]);
          if (!part) return null;
          const beyond = which === 'back' ? page <= 0 : page >= pages - 1;
          return (
            <button
              key={`page.${which}`}
              type="button"
              aria-label={which === 'back' ? 'Previous page' : 'Next page'}
              disabled={beyond}
              onClick={() => turnTo(page + (which === 'back' ? -1 : 1))}
              style={box(part)}
              className={cx(hit, beyond && 'cursor-default opacity-50')}
            />
          );
        })}

        {/* Tabs. */}
        {(spec.tabs ?? []).map(entry => {
          const part = find(entry.control);
          return part ? (
            <button
              key={entry.control}
              type="button"
              data-tab={entry.control}
              // Named by the words written on the tab, which is what a
              // player reads it as.
              aria-label={spec.captions?.[entry.text ?? ''] || entry.caption}
              aria-current={tab === entry.control ? 'true' : undefined}
              onClick={() => {
                setTab(entry.control);
                setOpenCombo(null);
                scroll.reset();
              }}
              style={box(part)}
              className={hit}
            />
          ) : null;
        })}

        {/* Dropdowns, and the choice showing in each. */}
        {(spec.combos ?? []).map(combo => {
          const control = find(combo.control);
          if (!control) return null;
          const listPath = comboPaths.find(
            path => path.startsWith(`${panelOf(panel)}/`) && path.endsWith(`/${combo.list}`),
          );
          if (!listPath) return null;
          return (
            <button
              key={combo.control}
              type="button"
              aria-label={combo.of}
              aria-expanded={openCombo?.path === listPath}
              onClick={() =>
                setOpenCombo(
                  openCombo?.path === listPath
                    ? null
                    : {
                        path: listPath,
                        of: combo.of,
                        control: combo.control,
                        offers: offeredBy(combo),
                      },
                )
              }
              style={box(control)}
              className={hit}
            />
          );
        })}
        {(spec.combos ?? []).map(combo => {
          const value = fieldOf(find(combo.value));
          // Nothing chosen is still something shown: the screen opens on
          // the first of what it offers, which is the one that narrows
          // nothing.
          const showing = chosen[combo.control] ?? offeredBy(combo)[0];
          return value && showing ? (
            <span key={`chosen.${combo.control}`} style={words(value, LIGHT)}>
              {showing}
            </span>
          ) : null;
        })}
        {/* Controls that take a number. */}
        {Object.entries(spec.numbers ?? {}).map(([where, what]) => {
          const part = find(where);
          if (!part) return null;
          const shape: JSX.CSSProperties = {
            ...box(part),
            width: part.box.w ? `${(part.box.w / frame.w) * 100}%` : '10%',
            height: part.box.h ? `${(part.box.h / frame.h) * 100}%` : '4%',
            fontSize: `${(Math.min(part.text?.sizePx ?? 12, part.box.h || 12) * worn.scale).toFixed(1)}px`,
          };
          return typing === what ? (
            <input
              key={where}
              type="number"
              min={0}
              autofocus
              value={numbers[what] ?? ''}
              aria-label={what}
              onInput={event =>
                setNumbers(was => ({ ...was, [what]: (event.target as HTMLInputElement).value }))
              }
              onBlur={() => setTyping(null)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === 'Escape') setTyping(null);
              }}
              style={shape}
              className="border border-brass-400 bg-chrome-950 px-1 text-parchment-100"
            />
          ) : (
            <button
              key={where}
              type="button"
              aria-label={what}
              onClick={() => setTyping(what)}
              style={shape}
              className={`${hit} cursor-text text-center text-parchment-100`}
            >
              {numbers[what] ?? ''}
            </button>
          );
        })}

        {/* Controls that do something. */}
        {Object.entries(spec.actions ?? {}).map(([where, what]) => {
          const part = find(where);
          if (!part || !where.startsWith(panelOf(panel))) return null;
          return (
            <button
              key={where}
              type="button"
              disabled={what === 'list' && !toList}
              aria-label={what}
              onClick={() => act(what)}
              style={box(part)}
              className={`${hit} disabled:cursor-not-allowed`}
            />
          );
        })}

        {/* The listing. */}
        {rows.map(({ row, item: listing }) => {
          const price = priceOf(listing);
          return (
            <button
              key={row.path}
              type="button"
              aria-label={`${listing.name}, ${formatMoney(price)}`}
              onClick={event => {
                const at = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setBeside({ x: at.left + at.height / 2, y: at.top + at.height / 2 });
                setReading(listing.id);
              }}
              style={box(row)}
              className={hit}
            ></button>
          );
        })}
        {/* The words a row shows, placed against the window rather than
            inside the row: a box given as a fraction of the screen has to
            be measured against the screen, and inside the row it would be
            a fraction of the row instead — a sliver, cropping the words. */}
        {list &&
          rows.map(({ row, fields, item: listing }) => (
            <WornRow
              key={`${row.path}.words`}
              worn={worn}
              fields={fields}
              list={list}
              values={columnsOf(listing)}
              icon={itemIcons.value.get(listing.itemEntry) ?? null}
              // A thing's name is written in the colour of what it is,
              // here as on its card. The list is on parchment, where a
              // light colour would wash out, so it is given the same dark
              // edge the interface gives its own words over the world.
              styleOf={what =>
                what === 'name' && listing.facts?.quality
                  ? `${qualityTextClass(listing.facts.quality)} text-shadow-world`
                  : undefined
              }
            />
          ))}

        {/* The marks that say the list runs on, each sliding the way it
            points. */}
        <WornChevrons worn={worn} list={list} slice={slice} />

        {/* The bag, and the slot an item is dropped on to sell it. */}
        {bagRun.map((slot, index) => {
          const item = inBagSlot(index);
          if (!item) return null;
          return (
            <WornSlot
              key={slot.path}
              worn={worn}
              slot={slot}
              face={worn.parts.find(inside => inside.path === `${slot.path}/${spec.bag?.face}`)}
              countAt={worn.parts.find(inside => inside.path === `${slot.path}/${spec.bag?.count}`)}
              icon={itemIcons.value.get(item.entry) ?? null}
              name={itemName(item)}
              count={item.count}
              draggable
              onDragStart={() => setHeld(item.id)}
              onDragEnd={() => setHeld(null)}
              onClick={(event: MouseEvent) => {
                const at = (event.currentTarget as HTMLElement).getBoundingClientRect();
                setBeside({ x: at.right, y: at.top });
                setInspecting(item.id);
              }}
              className="cursor-grab"
            />
          );
        })}
        {(() => {
          const slot = find(spec.bag?.sell);
          if (!slot) return null;
          const icon = toList ? itemIcons.value.get(toList.entry) : undefined;
          return (
            <div
              onDragOver={event => event.preventDefault()}
              onDrop={event => {
                event.preventDefault();
                if (held) setSelling(held);
                setHeld(null);
              }}
              style={box(slot)}
              className="flex items-center justify-center"
            >
              {icon && toList && (
                <img
                  src={iconUrl(icon)}
                  alt={itemName(toList)}
                  className="max-h-full max-w-full object-contain"
                  draggable={false}
                />
              )}
            </div>
          );
        })()}
        {(() => {
          const where = fieldOf(find(spec.bag?.name));
          if (!where || !toList) return null;
          // Named the way a thing is named everywhere else on this
          // screen: in the colour of what it is, over the dark edge that
          // keeps a light colour legible on parchment.
          const quality = itemFacts.value.get(toList.entry)?.quality;
          return (
            <span
              className={quality ? `${qualityTextClass(quality)} text-shadow-world` : undefined}
              style={quality ? { ...words(where, LIGHT), color: undefined } : words(where, LIGHT)}
            >
              {itemName(toList)}
            </span>
          );
        })()}
        {([spec.bag?.pageBack, spec.bag?.pageOn] as const).map((where, index) => {
          const part = find(where);
          return part ? (
            <button
              key={`page.${index}`}
              type="button"
              aria-label={index === 0 ? 'Previous page' : 'Next page'}
              onClick={() =>
                setBagPage(page =>
                  index === 0 ? Math.max(0, page - 1) : Math.min(bagPages - 1, page + 1),
                )
              }
              style={box(part)}
              className={hit}
            />
          ) : null;
        })}

        {/* What the player is carrying, and how much is on offer. */}
        {Object.entries(spec.purse ?? {}).map(([what, where]) => {
          const part = find(where);
          if (!part) return null;
          const carried = splitCoins(money.value);
          // A running total is written into a sentence the screen owns;
          // a page is written as one of so many.
          const text =
            what === 'gold' || what === 'silver' || what === 'copper'
              ? String(carried[what])
              : what === 'page'
                ? `${pages ? page + 1 : 0}/${pages}`
                : (spec.formats?.total ?? '%d').replace('%d', String(counted));
          return (
            <span key={what} style={words(part, LIGHT)}>
              {text}
            </span>
          );
        })}

        {(() => {
          const part = find(spec.close);
          return part ? (
            <button
              type="button"
              aria-label="Close the auction house"
              onClick={onClose}
              style={box(part)}
              className={hit}
            />
          ) : null;
        })()}

        {/* What a listing is, wearing the shipped item card. */}
        {reading &&
          (() => {
            const listing = listings.find(entry => entry.id === reading);
            if (!listing) return null;
            const mine = is(listing.sellerName);
            const card = (
              <ArtItemCard
                listing={listing}
                actions={
                  mine
                    ? [
                        {
                          key: 'withdraw',
                          onPick: () => (onCancel(listing.id), setReading(null)),
                        },
                      ]
                    : [
                        ...(listing.buyoutPrice !== undefined
                          ? [
                              {
                                key: 'buy',
                                onPick: () => {
                                  setAsking({ id: listing.id, buy: true });
                                  setReading(null);
                                },
                              },
                            ]
                          : []),
                        {
                          key: 'bid',
                          onPick: () => {
                            setAsking({ id: listing.id, buy: false });
                            setReading(null);
                          },
                        },
                      ]
                }
                anchor={beside}
                // Only worth offering where there is something of the
                // same kind already worn to hold it up against.
                canCompare={equipmentHomesFor(listing.facts?.inventoryType ?? 0).some(
                  slot => equippedSlots.value[slot],
                )}
                onClose={() => setReading(null)}
              />
            );
            return (
              card ?? (
                <Dialog label={listing.name} size="md">
                  <h2 className="font-title text-sm text-parchment-100">{listing.name}</h2>
                  <Button onClick={() => setReading(null)}>Close</Button>
                </Dialog>
              )
            );
          })()}

        {/* What an item in the bag is, before it is put up for sale. */}
        {/* A thing in the bag opens the same card a thing in the market
            does — the screen has one card, and a second one written by
            hand would drift from it. What it offers is different: the one
            thing you can do with your own item here is put it up. */}
        {inspecting &&
          (() => {
            const item = bagItems.find(one => one.id === inspecting);
            if (!item) return null;
            const facts = itemFacts.value.get(item.entry);
            const listing: AuctionListingView = {
              id: item.id,
              sellerName: player.value?.name ?? '',
              itemEntry: item.entry,
              itemCount: item.count,
              name: itemName(item),
              startPrice: 0,
              listedAt: 0,
              expiresAt: 0,
              currentBid: 0,
              ...(facts ? { facts } : {}),
              ...(facts?.descriptionId && itemTexts.value.get(facts.descriptionId)
                ? { description: itemTexts.value.get(facts.descriptionId) }
                : {}),
            };
            return (
              <ArtItemCard
                listing={listing}
                actions={[
                  {
                    key: 'auction',
                    onPick: () => {
                      setSelling(item.id);
                      setInspecting(null);
                    },
                  },
                ]}
                anchor={beside}
                canCompare={equipmentHomesFor(facts?.inventoryType ?? 0).some(
                  slot => equippedSlots.value[slot],
                )}
                onClose={() => setInspecting(null)}
              />
            );
          })()}

        {asking &&
          (() => {
            const listing = listings.find(entry => entry.id === asking.id);
            if (!listing) return null;
            const price = asking.buy
              ? (listing.buyoutPrice ?? listing.startPrice)
              : listing.currentBid + 1;
            return (
              <ConfirmDialog
                question={asking.buy ? 'Buy this outright?' : 'Place a bid?'}
                subject={listing.name}
                confirmLabel={asking.buy ? 'Buy' : 'Bid'}
                onCancel={() => setAsking(null)}
                onConfirm={() => {
                  if (asking.buy) onBuyout(listing.id);
                  else onBid(listing.id, price);
                  setAsking(null);
                }}
              >
                {formatMoney(price)}
              </ConfirmDialog>
            );
          })()}
        {/* The open list, and the cover that keeps a press from reaching
              what is under it. Drawn last so nothing sits above them. */}
        {openCombo && (
          <button
            type="button"
            aria-label="Close the list"
            onClick={() => setOpenCombo(null)}
            className="absolute inset-0 cursor-default border-0 bg-transparent p-0"
          />
        )}
        {openCombo &&
          (() => {
            // What a list offers comes from the control that opened it,
            // not from the list: two controls on different panels can
            // share one list and mean different things by it.
            const offered = openCombo.offers;
            return worn.parts
              .filter(part => part.path.startsWith(`${openCombo.path}/`) && /\d+$/.test(part.path))
              .sort((a, b) => a.box.y - b.box.y)
              .map((slot, index) =>
                offered[index] ? (
                  <button
                    key={slot.path}
                    type="button"
                    onClick={() => {
                      setChosen(was => {
                        const next = { ...was, [openCombo.control]: offered[index] };
                        for (const other of spec.combos ?? []) {
                          if (other.follows === openCombo.control) delete next[other.control];
                        }
                        return next;
                      });
                      setOpenCombo(null);
                    }}
                    style={box(slot)}
                    className={`${hit} hover:bg-brass-300/20`}
                  >
                    <span
                      style={{
                        fontSize: `${(Math.min(10, slot.box.h) * worn.scale).toFixed(1)}px`,
                        color: LIGHT,
                      }}
                    >
                      {offered[index]}
                    </span>
                  </button>
                ) : null,
              );
          })()}
      </div>
      {status && (
        <p role="status" className="text-center text-parchment-100">
          {status}
        </p>
      )}
    </div>
  );
}
