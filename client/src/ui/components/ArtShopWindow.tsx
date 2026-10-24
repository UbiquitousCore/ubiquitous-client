/** The vendor screen: pages of cards whose card offers to buy them; the sell tab opens the bag. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornPiece } from '../art/WornPiece';
import { WornSlot } from '../art/WornSlot';
import { pageLabel, pagesFor, slotsOf } from '../art/wornSlots';
import type { ShopItem } from '../hudStore';
import { itemIcons } from '../inventoryStore';
import { bareCoins, namedCoins, purseOf } from '../money';
import { WornSum } from '../art/WornSum';
import { ArtItemCard, cardFor } from './ArtItemCard';

/** Our name for this screen. The spec says which dialog wears it. */
export const SHOP_SCREEN = 'shop';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtShopWindowProps {
  vendorName: string;
  balance: number;
  items: readonly ShopItem[];
  onBuy(item: ShopItem, quantity: number): void;
  /** What the second tab does here: open what you are carrying. */
  onSell(): void;
  onClose(): void;
}

export function ArtShopWindow(props: ArtShopWindowProps): JSX.Element | null {
  const spec = useWornScreen(SHOP_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  vendorName,
  balance,
  items,
  onBuy,
  onSell,
  onClose,
  spec,
}: ArtShopWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const [page, setPage] = useState(0);
  /** The thing whose card is open, and where the control that opened it is. */
  const [reading, setReading] = useState<{ item: ShopItem; at: { x: number; y: number } } | null>(
    null,
  );
  const grid = spec.grids?.goods;
  const list = spec.lists?.goods;

  const strip = spec.panels?.lessonStrip;
  // Every card carries the strip its lesson banner is drawn on. It is left out of the picture and drawn again, over
  // the card's picture, only for the cards that say something; `where` is the same screen with the strips in,
  // for where they stand.
  const states = (whole: Parameters<typeof slotsOf>[0], keepStrips: boolean) => {
    const cards = grid ? slotsOf(whole, { ...grid, driven: true }) : [];
    const perPage = cards.length || 1;
    const showing = items.slice(page * perPage, page * perPage + perPage);
    const coins = Object.values(list?.coins ?? {});
    return {
      // The tab whose page is showing wears its lit face.
      frames: Object.fromEntries(
        (spec.tabs ?? []).map(tab => [
          tab.control,
          tab.panel === 'buy' ? (spec.faces?.[tab.control] ?? 1) : 0,
        ]),
      ),
      shown: spec.shown ?? [],
      hidden: [
        ...(spec.hidden ?? []).filter(name => !keepStrips || name !== strip),
        // The purse's coins go with their figures, the way a card's does.
        ...bareCoins(spec.coins, purseOf(balance)),
        // A card with nothing on it is not a card: show as many as the
        // page has things for and no more.
        ...cards.slice(showing.length).map(card => card.path),
        // Every card carries a coin of each kind, one on top of another.
        // The price is written out with its coins beside it instead.
        ...cards.flatMap(card => coins.map(coin => `${card.path}/${coin}`)),
      ],
    };
  };
  const worn = useWorn(spec.dialog, spec.frame, whole => states(whole, false));
  const where = useWorn(spec.dialog, spec.frame, whole => states(whole, true));

  if (!worn.image || !worn.frame || !grid) return null;

  const cards = slotsOf(worn.parts, { ...grid, driven: true });

  /**
   * A card's picture box, built from the point the screen draws it at.
   *
   * The movie marks the spot and says nothing about the size, so a card
   * drawn against the mark alone comes out as a thing of no size at all.
   */
  const boxOf = (card: (typeof cards)[number]): (typeof cards)[number] => {
    const size = grid.size;
    if (!size) return card;
    const at = worn.parts.find(part => part.path === `${card.path}/${grid.face ?? ''}`) ?? card;
    return {
      ...card,
      box: { x: at.box.x + (size.dx ?? 0), y: at.box.y + (size.dy ?? 0), w: size.w, h: size.h },
    };
  };
  const perPage = slotsOf(worn.whole, { ...grid, driven: true }).length || 1;
  const pages = pagesFor(items.length, perPage);
  const showing = items.slice(page * perPage, page * perPage + perPage);
  const purse = purseOf(balance);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={vendorName}
      className="overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-full"
        draggable={false}
      />

      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        hidden={spec.hidden}
        styleOf={where => {
          const tab = (spec.tabs ?? []).find(one => one.text === where);
          if (!tab || tab.panel !== 'buy') return undefined;
          return tab.openTone ? { color: tab.openTone } : undefined;
        }}
      />

      {/* What is for sale, a page at a time. */}
      {showing.map((item, at) => {
        const card = cards[at];
        if (!card) return null;
        const money = worn.fieldOf(worn.find(`${card.path}/${list?.fields.price ?? ''}`));
        const named = worn.fieldOf(worn.find(`${card.path}/${list?.fields.name ?? ''}`));
        // The price runs from its own field to the far side of the coins
        // stacked beside it: each coin it has is written, figure then coin.
        const stack = worn.find(`${card.path}/${Object.values(list?.coins ?? {})[0] ?? ''}`);
        const priceRow =
          money && stack
            ? { ...money, box: { ...money.box, w: stack.box.x + stack.box.w - money.box.x } }
            : money;
        const inspect = worn.find(`${card.path}/${list?.does?.inspect ?? ''}`);
        const read = (event: MouseEvent): void => {
          const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
          setReading({ item, at: { x: on.right, y: on.top } });
        };
        return (
          <div key={card.path}>
            <button
              type="button"
              aria-label={item.name}
              onClick={read}
              style={worn.box(card)}
              className={HIT}
            />
            <WornSlot
              worn={worn}
              slot={boxOf(card)}
              icon={itemIcons.value.get(item.id) ?? null}
              name={itemIcons.value.get(item.id) ? undefined : item.name}
              count={item.stock ?? undefined}
            />
            {/* A lesson the player cannot take, or knows already, says so across its picture. */}
            {item.lesson && strip
              ? (() => {
                  const stripPart = where.find(`${card.path}/${strip}`);
                  const said =
                    item.lesson === 'learned' ? spec.words?.learned : spec.words?.cannotLearn;
                  return stripPart ? (
                    <>
                      <WornPiece
                        dialog={spec.dialog}
                        part={`${card.path}/${strip}`}
                        alone
                        movie={spec.movie}
                        box={worn.box(stripPart)}
                      />
                      <span
                        style={{
                          ...worn.words(stripPart, INK),
                          justifyContent: 'center',
                          pointerEvents: 'none',
                        }}
                      >
                        {said ?? (item.lesson === 'learned' ? 'Already learned' : "Can't learn")}
                      </span>
                    </>
                  ) : null;
                })()
              : null}
            {named ? (
              <span style={worn.words(named, INK)}>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">{item.name}</span>
              </span>
            ) : null}
            {priceRow ? (
              <span data-price="">
                <WornSum
                  worn={worn}
                  dialog={spec.dialog}
                  field={priceRow}
                  coins={Object.fromEntries(
                    Object.entries(list?.coins ?? {}).map(([coin, where]) => [
                      coin,
                      `${card.path}/${where}`,
                    ]),
                  )}
                  says={namedCoins(item.price)}
                  tone={INK}
                />
              </span>
            ) : null}
            {/* What the thing is: its card, rather than buying it. */}
            {inspect && list?.does?.inspect ? (
              <button
                type="button"
                aria-label={`About ${item.name}`}
                onClick={read}
                style={worn.box(inspect)}
                className={HIT}
              />
            ) : null}
          </div>
        );
      })}

      {/* What you are carrying, in the screen's own row of coins. */}
      {Object.entries(spec.purse ?? {}).map(([what, where]) => {
        const field = worn.fieldOf(worn.find(where));
        const said = purse[what as keyof typeof purse];
        return field && said ? (
          <span key={`purse.${what}`} style={worn.words(field, LIGHT)}>
            {said}
          </span>
        ) : null;
      })}

      {/* The pages, and which one is showing. */}
      {(['back', 'on'] as const).map(way => {
        const part = worn.find(spec.paging?.[way]);
        if (!part) return null;
        const at = way === 'back' ? page - 1 : page + 1;
        return (
          <button
            key={`page.${way}`}
            type="button"
            aria-label={way === 'back' ? 'Earlier page' : 'Later page'}
            disabled={at < 0 || at >= pages}
            onClick={() => setPage(Math.max(0, Math.min(at, pages - 1)))}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}
      {(() => {
        const field = worn.fieldOf(worn.find(spec.paging?.page));
        return field ? (
          <span style={worn.words(field, LIGHT)}>{pageLabel(page, pages)}</span>
        ) : null;
      })()}

      {/* The other page. The one you are on is not a way anywhere. */}
      {(spec.tabs ?? []).map(tab => {
        const part = worn.find(tab.control);
        return part && tab.panel !== 'buy' ? (
          <button
            key={tab.control}
            type="button"
            aria-label={tab.caption || tab.panel}
            onClick={onSell}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}

      {reading ? (
        <ArtItemCard
          listing={cardFor({ id: `shop.${reading.item.slot}`, entry: reading.item.id, count: 1 })}
          actions={[
            {
              key: 'purchase',
              price: reading.item.price,
              onPick: () => {
                onBuy(reading.item, 1);
                setReading(null);
              },
            },
          ]}
          anchor={reading.at}
          onClose={() => setReading(null)}
        />
      ) : null}
    </div>
  );
}
