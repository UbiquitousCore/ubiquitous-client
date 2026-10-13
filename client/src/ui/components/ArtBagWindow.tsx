/** The bag on the shipped screen: paged slots, the purse, cards on press, and drags to other windows. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { ArtAskBox } from './ArtAskBox';
import { ArtItemCard, cardFor } from './ArtItemCard';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornPiece } from '../art/WornPiece';
import { WornSlot } from '../art/WornSlot';
import { pageLabel, pagesFor, slotsOf } from '../art/wornSlots';
import { money } from '../hudStore';
import { bareCoins, formatMoney, namedCoins, purseOf } from '../money';
import { Coin } from './Coin';
import type { PiecePart } from '../art/piecePlan';
import { fill } from '../art/wornWords';
import {
  bagUpgrade,
  equippedSlots,
  inventory,
  inventoryActions,
  itemFacts,
  itemIcons,
  itemName,
} from '../inventoryStore';
import type { InventoryItem, StorageSlot } from '../inventoryStore';
import { equipmentHomesFor } from '../items';
import { heldAction } from '../heldItem';
import { HELD_CARD } from './ArtItemCard';
import {
  dragOver,
  dropSlotAttribute,
  isDragOver,
  itemDrag,
  sameSlot,
  startItemDrag,
} from './dragItem';
import { ItemDragGhost, socketItemOf } from './ItemSocket';
import { logger } from '../../core/log';

const log = logger('bag');

/** Our name for this screen. The spec says which dialog wears it. */
export const BAG_SCREEN = 'bag';

/** Our names for the message boxes the offer asks in. The spec says which dialog wears them. */
export const BAG_ASK_SCREEN = 'bagUpgradeAsk';
export const BAG_SHORT_SCREEN = 'bagUpgradeShort';
/** Our name for the message box asking before a thing is thrown away. */
export const DISCARD_ASK_SCREEN = 'discardAsk';

/** The question is worded in whole gold, so an uneven price is asked at the gold above. */
function askedPrice(copper: number): { words: 'gold'; figure: number } {
  return { words: 'gold', figure: Math.ceil(copper / 10_000) };
}

/** The bag stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

export interface ArtBagWindowProps {
  onClose(): void;
  /**
   * Beside a trade: what is already on the table, and putting a thing on
   * it. The bag then has no close of its own — it goes with the table —
   * and a press on a thing offers it rather than describing it.
   */
  trading?: { offered: readonly string[]; offer(item: InventoryItem): void };
}

export function ArtBagWindow(props: ArtBagWindowProps): JSX.Element | null {
  const spec = useWornScreen(BAG_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

/**
 * A drop onto the body is a wear request: the server refuses a plain move
 * there silently. Let go over nothing, a thing from the bag is thrown away,
 * which is asked about first.
 */
export function bagDrop(
  from: StorageSlot,
  to: StorageSlot | null,
): 'wear' | 'move' | 'discard' | null {
  if (to === null) return from.area === 'bag' ? 'discard' : null;
  if (to.area === from.area && to.index === from.index) return null;
  if (from.area === 'equipment') return null;
  return to.area === 'equipment' ? 'wear' : 'move';
}

function Worn({
  onClose,
  trading,
  spec,
}: ArtBagWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const [page, setPage] = useState(0);
  const [reading, setReading] = useState<string | null>(null);
  const [beside, setBeside] = useState<{ x: number; y: number } | null>(null);
  /** Which message box the offer has open: the question, or that the purse is short. */
  const [asking, setAsking] = useState<'ask' | 'short' | null>(null);
  const askBox = useWornScreen(BAG_ASK_SCREEN);
  /** The thing let go over nothing, while the box asks whether to throw it away. */
  const [discarding, setDiscarding] = useState<InventoryItem | null>(null);
  const discardBox = useWornScreen(DISCARD_ASK_SCREEN);

  const state = inventory.value;
  const grid = Object.values(spec.grids ?? {})[0];
  /** How much room the bag has, or nothing where the game has not said. */
  const room = state.bagSlotCount > 0 ? state.bagSlotCount : null;

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => ({
      hidden: [
        ...(bagUpgrade.value ? [] : Object.keys(spec.actions ?? {})),
        ...(spec.hidden ?? []),
        // A coin goes with its figure: one with nothing written beside it
        // reads as a sum the screen failed to fill in.
        ...bareCoins(spec.coins, purseOf(money.value)),
        // The build hides the tail of a run the store has no room for.
        // Drawn anyway, those slots look like somewhere a thing can go.
        ...(grid && room !== null
          ? slotsOf(whole, grid)
              .filter((_slot, index) => {
                const perPage = slotsOf(whole, grid).length || 1;
                return page * perPage + index >= room;
              })
              .map(slot => slot.path)
          : []),
      ],
    }),
    ROW,
  );

  const actions = inventoryActions();

  /** The drag ghost from a name and picture; an inventory row names only an entry, and threw. */
  const dragged = (item: InventoryItem) =>
    socketItemOf(item, itemName(item), itemIcons.value.get(item.entry) ?? null);
  /** What the card offers to do with the thing it describes. */
  const heldActions = (item: InventoryItem, done: () => void) => {
    const does = heldAction(item, itemFacts.value.get(item.entry));
    if (!does) return [];
    return [
      {
        key: does,
        onPick: () => {
          if (does === 'equip') actions.equip(item);
          else if (does === 'unequip') actions.unequip(item);
          else actions.use(item);
          done();
        },
      },
    ];
  };
  const itemAt = (slot: StorageSlot): InventoryItem | undefined =>
    state.items.find(item => item.slot?.area === slot.area && item.slot.index === slot.index);

  const upgrade = bagUpgrade.value;
  /**
   * How many places the offer adds.
   *
   * The ladder's rung says the size the bag ends up at; what the screen
   * writes is what it gains, which is the difference.
   */
  const gains = upgrade ? upgrade.slots - state.bagSlotCount : 0;

  if (!worn.image || !worn.frame || !grid) return null;

  const slots = slotsOf(worn.parts, grid);
  const perPage = slotsOf(worn.whole, grid).length || 1;
  /**
   * The offer's own art, wherever the movie parks it: at the top of the
   * dialog in one build, on each of its numbered pages in another, where
   * the first page's is the one.
   */
  const inOffer = (name: string | undefined, within = ''): PiecePart | undefined =>
    name
      ? worn.whole
          .filter(part => part.path === name || part.path.endsWith(`/${name}`))
          .filter(part => !within || part.path.startsWith(`${within}/`))
          .sort((a, b) => a.path.localeCompare(b.path))[0]
      : undefined;
  const tab = inOffer(spec.panels?.upgrade);
  const offerCoin = tab ? inOffer(spec.groups?.upgradeCoin, tab.path) : undefined;
  /** The offer to buy more stands in the first place past the bag's size. */
  const every = slotsOf(worn.whole, grid);
  /** Which page the first place the bag has not got would fall on. */
  const shortAt = room === null ? -1 : Math.floor(room / perPage);
  /** Pages: the bag's places, plus one when an offer falls past a full last page. */
  const pages = Math.max(
    pagesFor(room ?? perPage, perPage),
    upgrade && room !== null ? shortAt + 1 : 0,
  );
  const at = Math.min(page, pages - 1);
  const spot = room !== null && at === shortAt ? every[room % perPage] : undefined;

  /** Ask the server for the next rung. */
  const buy = (): void => {
    if (!upgrade) return;
    // What the server is asked for is the size the bag ends up at, which
    // is what the ladder's rung says.
    log.info(`bag: asking for ${upgrade.slots} slots`);
    actions.upgrade('bag', upgrade.slots);
  };
  const price = upgrade ? askedPrice(upgrade.price) : null;

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';
  const readingItem = reading ? state.items.find(item => item.id === reading) : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Bag"
      className="touch-none overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        // Beside a trade it stands at its own size, at the scale the table
        // is drawn at; stretched to the table's height it came out at a
        // scale of its own.
        className={trading ? 'block' : 'block h-full w-auto'}
        style={trading ? worn.sized : undefined}
        draggable={false}
      />

      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

      {slots.map((slot, index) => {
        const where: StorageSlot = { area: 'bag', index: at * perPage + index };
        if (room !== null && where.index >= room) return null;
        const item = itemAt(where);
        return (
          <WornSlot
            key={slot.path}
            worn={worn}
            slot={slot}
            face={worn.parts.find(inside => inside.path === `${slot.path}/${grid.face}`)}
            countAt={worn.parts.find(inside => inside.path === `${slot.path}/${grid.count}`)}
            icon={item ? (itemIcons.value.get(item.entry) ?? null) : null}
            name={item ? itemName(item) : undefined}
            count={item?.count}
            lifted={
              sameSlot(itemDrag.value?.from ?? null, where) ||
              (item !== undefined && trading?.offered.includes(item.id) === true)
            }
            over={isDragOver(where, dragOver.value)}
            data-drop-slot={dropSlotAttribute(where)}
            onPointerDown={(event: PointerEvent) => {
              if (item)
                startItemDrag(event, dragged(item), where, {
                  onDrop: (_payload, from, to) => {
                    const does = bagDrop(from, to);
                    log.info(`bag: drop asks to ${does ?? 'do nothing'}`);
                    if (does === 'wear') actions.equip(item, to ?? undefined);
                    else if (does === 'move' && to) actions.move(from, to);
                    // Never unasked: with no box to ask in, nothing is
                    // thrown away. Nor beside a trade, where letting go
                    // short of the table is a miss, not a choice.
                    else if (does === 'discard' && discardBox && !trading) setDiscarding(item);
                  },
                });
            }}
            onClick={(event: MouseEvent) => {
              if (!item) return;
              if (trading) {
                if (!trading.offered.includes(item.id)) trading.offer(item);
                return;
              }
              const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
              setBeside({ x: on.right, y: on.top });
              setReading(item.id);
            }}
            className={item ? 'cursor-grab' : undefined}
          />
        );
      })}

      {/* The offer to make the bag bigger, where there is one: how many
          places it adds and what it costs. It hangs off the bag's own
          corner, so it is drawn as a piece of its own. */}
      {upgrade && tab && spot ? (
        <div
          style={{
            position: 'absolute',
            // In the first place the bag does not have yet: the offer
            // stands where the room it buys would go.
            left: `${(spot.box.x / worn.frame.w) * 100}%`,
            top: `${(spot.box.y / worn.frame.h) * 100}%`,
            width: `${(spot.box.w / worn.frame.w) * 100}%`,
            height: `${(spot.box.h / worn.frame.h) * 100}%`,
          }}
        >
          <WornPiece
            dialog={spec.dialog}
            part={tab.path}
            box={{ width: '100%', height: '100%' }}
            // The one coin the plate carries is drawn beside each figure
            // of the price instead.
            without={offerCoin ? [offerCoin.path] : []}
          />
          {(['slots', 'price'] as const).map(what => {
            const found = inOffer(spec.values?.[what], tab.path);
            if (!found) return null;
            // The price runs on over the coin it no longer shares a place
            // with.
            const field =
              what === 'price' && offerCoin
                ? {
                    ...found,
                    // Kept on the plate: a field authored a hair past its
                    // edge would lose the first figure off it.
                    box: {
                      ...found.box,
                      x: Math.max(found.box.x, tab.box.x),
                      w: offerCoin.box.x + offerCoin.box.w - Math.max(found.box.x, tab.box.x),
                    },
                  }
                : found;
            const coins = namedCoins(upgrade.price);
            // Placed inside the offer itself: its own fields are given
            // where they sit in it, which is off the bag's own edge.
            return (
              <span
                key={`upgrade.${what}`}
                {...(what === 'price' ? { 'data-price': '' } : {})}
                className="absolute flex items-center justify-center gap-px text-parchment-100"
                style={{
                  left: `${((field.box.x - tab.box.x) / tab.box.w) * 100}%`,
                  top: `${((field.box.y - tab.box.y) / tab.box.h) * 100}%`,
                  width: `${(field.box.w / tab.box.w) * 100}%`,
                  height: `${(field.box.h / tab.box.h) * 100}%`,
                  // A price in more than one coin is written smaller, so
                  // it stays on the plate the one figure was sized for.
                  fontSize: `${(
                    (field.text?.sizePx ?? 12) *
                    worn.scale *
                    (what === 'price' && Object.keys(coins).length > 1 ? 0.8 : 1)
                  ).toFixed(1)}px`,
                  color: field.text?.color ?? undefined,
                  whiteSpace: 'nowrap',
                }}
              >
                {what === 'slots'
                  ? fill(spec.formats?.slots ?? '%d', gains)
                  : (['gold', 'silver', 'copper'] as const)
                      .filter(coin => coins[coin])
                      .map(coin => (
                        <span key={coin} className="flex h-full items-center gap-px">
                          {coins[coin]}
                          <span className="block aspect-square h-3/4">
                            <Coin metal={coin} />
                          </span>
                        </span>
                      ))}
              </span>
            );
          })}
          <button
            type="button"
            aria-label={`${fill(spec.formats?.slots ?? '%d', gains)}: ${formatMoney(upgrade.price)}`}
            onClick={() => {
              // The money this server keeps is asked about first; a rung
              // priced in anything else is the server's to refuse.
              if (askBox && upgrade.currency === 0) setAsking('ask');
              else buy();
            }}
            className={`${hit} inset-0`}
          />
        </div>
      ) : null}

      {/* Turning the bag over. */}
      {([grid.pageBack, grid.pageOn] as const).map((where, which) => {
        const part = where ? worn.find(where) : undefined;
        const beyond = which === 0 ? at <= 0 : at >= pages - 1;
        return part ? (
          <button
            key={`page.${which}`}
            type="button"
            aria-label={which === 0 ? 'previous page' : 'next page'}
            disabled={beyond}
            onClick={() => setPage(Math.min(pages - 1, Math.max(0, at + (which === 0 ? -1 : 1))))}
            style={worn.box(part)}
            className={`${hit}${beyond ? 'cursor-default opacity-50' : ''}`}
          />
        ) : null;
      })}

      {(() => {
        const part = grid.page ? worn.fieldOf(worn.find(grid.page)) : undefined;
        return part ? <span style={worn.words(part, LIGHT)}>{pageLabel(at, pages)}</span> : null;
      })()}

      {/* What the player is carrying. The coins with no figure are not
          drawn, so each figure here has its coin beside it. */}
      {Object.entries(spec.purse ?? {}).map(([what, where]) => {
        const part = worn.fieldOf(worn.find(where));
        const said = purseOf(money.value)[what as 'gold' | 'silver' | 'copper'] ?? '';
        return part && said ? (
          <span key={what} style={worn.words(part, LIGHT)}>
            {said}
          </span>
        ) : null;
      })}

      {(() => {
        const part = trading ? undefined : worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the bag"
            onClick={onClose}
            style={worn.box(part)}
            className={hit}
          />
        ) : null;
      })()}

      <ItemDragGhost />

      {asking === 'ask' && upgrade && price ? (
        <ArtAskBox
          screen={BAG_ASK_SCREEN}
          label="Make the bag bigger"
          words={price.words}
          fills={[price.figure]}
          onAccept={() => {
            if (money.value < upgrade.price) {
              setAsking('short');
              return;
            }
            setAsking(null);
            buy();
          }}
          onDecline={() => setAsking(null)}
        />
      ) : null}
      {asking === 'short' ? (
        <ArtAskBox
          screen={BAG_SHORT_SCREEN}
          label="Not enough money"
          acceptLabel="OK"
          onAccept={() => setAsking(null)}
        />
      ) : null}

      {discarding ? (
        <ArtAskBox
          screen={DISCARD_ASK_SCREEN}
          label="Throw this away"
          name={itemName(discarding)}
          acceptLabel="Yes"
          onAccept={() => {
            setDiscarding(null);
            actions.destroy(discarding);
          }}
          onDecline={() => setDiscarding(null)}
        />
      ) : null}

      {readingItem && (
        <ArtItemCard
          listing={cardFor(readingItem)}
          wears={HELD_CARD}
          actions={heldActions(readingItem, () => setReading(null))}
          anchor={beside}
          canCompare={equipmentHomesFor(cardFor(readingItem).facts?.inventoryType ?? 0).some(
            slot => equippedSlots.value[slot],
          )}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  );
}
