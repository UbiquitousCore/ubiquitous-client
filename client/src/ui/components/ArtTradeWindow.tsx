/** A trade: two mirrored slot runs and purses, a confirm control; things are dropped onto the table. */

import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { acceptsDrops } from './dragItem';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornSlot } from '../art/WornSlot';
import { slotsOf } from '../art/wornSlots';
import { inventory, itemIcons, itemName, itemNames } from '../inventoryStore';
import type { InventoryItem } from '../inventoryStore';
import type { TradeItem } from '../tradeStore';
import { coinsOf } from '../money';

/** Our name for this screen. The spec says which dialog wears it. */
export const TRADE_SCREEN = 'trade';

/** How much of the view's width and height the table and bag may take together. */
const FIT_WIDE = 0.96;
const FIT_TALL = 0.9;

/** Our name for this window, for a drag that ends on it. */
const TABLE = 'trade';

export interface ArtTradeWindowProps {
  /** What this side is offering: ids into the player's own bag, and coin. */
  mine: { itemIds: readonly string[]; gold: number };
  theirs: { items: readonly TradeItem[]; gold: number };
  peerName: string | null;
  iConfirmed: boolean;
  theyConfirmed: boolean;
  notice: string | null;
  onOffer(itemIds: string[], gold: number): void;
  onConfirm(confirmed: boolean): void;
  onClose(): void;
  /** What stands to the table's right — the bag, which is where offers come from. */
  beside?: ComponentChildren;
}

export function ArtTradeWindow(props: ArtTradeWindowProps): JSX.Element | null {
  const spec = useWornScreen(TRADE_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  mine,
  theirs,
  peerName,
  iConfirmed,
  theyConfirmed,
  notice,
  onOffer,
  onConfirm,
  onClose,
  beside,
  spec,
}: ArtTradeWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const [typing, setTyping] = useState<string | null>(null);
  /**
   * How far the table and the bag beside it are shrunk to fit the view
   * together. Each is drawn at the height the screen allows, and side by
   * side that can run wider than the window — which is what made the
   * trade need the browser zoomed out.
   */
  const row = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);

  /** Neither side may change what is on the table once one has confirmed. */
  const settled = iConfirmed || theyConfirmed;

  const offer = (itemIds: readonly string[], gold: number): void => onOffer([...itemIds], gold);

  // A thing dropped on the table joins what this side is offering. Taken
  // by name rather than by socket: the table is not somewhere it is kept.
  useEffect(
    () =>
      acceptsDrops<InventoryItem>(TABLE, item => {
        if (settled || mine.itemIds.includes(item.id)) return;
        offer([...mine.itemIds, item.id], mine.gold);
      }),
    [mine.itemIds, mine.gold, settled],
  );

  /** What the other side's purse reads, which decides its own coins. */
  const said = coinsOf(theirs.gold);
  const theirCoins: Record<string, string> = { theirGold: said.gold, theirSilver: said.silver };

  const worn = useWorn(spec.dialog, spec.frame, {
    hidden: [
      ...(spec.hidden ?? []),
      // The line telling you to check the table is shown only once one
      // side has said it is happy with it.
      ...(settled ? [] : [spec.groups?.waiting ?? '']),
      // A coin with no figure beside it reads as a sum of nothing.
      ...Object.entries(spec.coins ?? {}).flatMap(([what, where]) =>
        theirCoins[what] ? [] : [where],
      ),
    ].filter(Boolean),
  });

  useLayoutEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = (): void => {
      // The laid-out size, which a transform leaves alone.
      const wide = el.offsetWidth;
      const tall = el.offsetHeight;
      if (!wide || !tall) return;
      setFit(
        Math.min(
          1,
          (globalThis.innerWidth * FIT_WIDE) / wide,
          (globalThis.innerHeight * FIT_TALL) / tall,
        ),
      );
    };
    measure();
    globalThis.addEventListener('resize', measure);
    const watching = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    watching?.observe(el);
    return () => {
      globalThis.removeEventListener('resize', measure);
      watching?.disconnect();
    };
  }, [worn.image?.url]);

  const bag = inventory.value.items;
  const offered = mine.itemIds.flatMap(id => bag.find(item => item.id === id) ?? []);

  const runs = Object.entries(spec.grids ?? {}).map(([whose, grid]) => ({
    whose,
    grid,
    parts: slotsOf(worn.parts, grid),
  }));

  if (!worn.image || !worn.frame) return null;

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';

  const myCoins = coinsOf(mine.gold);
  const values: Record<string, string> = {
    peer: peerName ?? '',
    myGold: myCoins.gold,
    mySilver: myCoins.silver,
    theirGold: theirCoins.theirGold ?? '',
    theirSilver: theirCoins.theirSilver ?? '',
  };

  /** What a run of slots is showing, as a list of things and pictures. */
  const holding = (
    whose: string,
    at: number,
  ): { name: string; entry: number; count: number } | undefined => {
    if (whose === 'theirs') {
      const item = theirs.items[at];
      return item
        ? {
            name: itemNames.value.get(item.entry) ?? `Item ${item.entry}`,
            entry: item.entry,
            count: item.count,
          }
        : undefined;
    }
    const item = offered[at];
    return item ? { name: itemName(item), entry: item.entry, count: item.count } : undefined;
  };

  /** Take one of this side's own things back off the table. */
  const takeBack = (at: number): void => {
    if (settled) return;
    const item = offered[at];
    if (item)
      offer(
        mine.itemIds.filter(id => id !== item.id),
        mine.gold,
      );
  };

  /** The purse, in the two coins the screen takes. */
  const setCoin = (which: 'gold' | 'silver', figure: string): void => {
    const held = coinsOf(mine.gold);
    const gold = Number(which === 'gold' ? figure : held.gold) || 0;
    const silver = Number(which === 'silver' ? figure : held.silver) || 0;
    offer(mine.itemIds, gold * 10_000 + silver * 100);
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-window flex flex-col items-center justify-center gap-2 overflow-hidden bg-black/65 p-0 sm:p-4">
      {/* The table on the left and the bag against its right edge, both
          up for as long as the trade is. */}
      <div
        ref={row}
        // Each stands at its own size, so neither is stretched to the
        // other's height: the two share one scale, and the row as a whole
        // is shrunk to fit.
        className="flex shrink-0 items-start"
        style={{ transform: `scale(${fit})`, transformOrigin: 'center' }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trade"
          className="relative touch-none overflow-hidden"
          // The whole window takes a drop: the screen's own slots are where
          // the things land, but a finger is not that accurate.
          data-drop-target={settled ? undefined : TABLE}
        >
          <img
            ref={worn.pictureRef}
            src={worn.image.url}
            alt=""
            aria-hidden="true"
            className="block"
            // At the scale every screen is drawn at, the bag beside it
            // included; what the view has no room for, `fit` takes off.
            style={worn.sized}
            draggable={false}
          />

          <WornCaptions
            worn={worn}
            spec={spec}
            tone={LIGHT}
            // The line asking both sides to check the table breathes, the
            // way the screen breathes it.
            styleOf={where =>
              where === spec.groups?.waiting
                ? { animation: 'var(--animate-confirm-pulse)' }
                : undefined
            }
          />

          {Object.entries(spec.values ?? {}).map(([what, where]) => {
            const part = worn.fieldOf(worn.find(where));
            if (!part || !values[what]) return null;
            return (
              <span key={`value.${what}`} style={worn.words(part, LIGHT)}>
                {values[what]}
              </span>
            );
          })}

          {runs.map(({ whose, grid, parts }) =>
            parts.map((part, at) => {
              const held = holding(whose, at);
              return (
                <WornSlot
                  key={part.path}
                  worn={worn}
                  slot={part}
                  face={worn.parts.find(inside => inside.path === `${part.path}/${grid.face}`)}
                  countAt={worn.parts.find(inside => inside.path === `${part.path}/${grid.count}`)}
                  icon={held ? (itemIcons.value.get(held.entry) ?? null) : null}
                  name={held?.name}
                  count={held?.count}
                  onClick={() => {
                    if (whose === 'mine') takeBack(at);
                  }}
                  className={whose === 'mine' && held && !settled ? 'cursor-pointer' : undefined}
                />
              );
            }),
          )}

          {/* The purse this side is putting up, in the coins it takes. */}
          {Object.entries(spec.numbers ?? {}).map(([where, what]) => {
            const part = worn.find(where);
            if (!part || !worn.frame) return null;
            const which = what === 'myGold' ? 'gold' : 'silver';
            const shape: JSX.CSSProperties = {
              ...worn.box(part),
              fontSize: `${(Math.min(part.text?.sizePx ?? 12, part.box.h || 12) * worn.scale).toFixed(1)}px`,
            };
            return typing === what && !settled ? (
              <input
                key={where}
                type="number"
                min={0}
                autofocus
                value={coinsOf(mine.gold)[which]}
                aria-label={what}
                onInput={event => setCoin(which, (event.target as HTMLInputElement).value)}
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
                disabled={settled}
                onClick={() => setTyping(what)}
                style={shape}
                className={`${hit} cursor-text text-center text-parchment-100`}
              />
            );
          })}

          {Object.entries(spec.actions ?? {}).map(([where, what]) => {
            const part = worn.find(where);
            if (!part) return null;
            return (
              <button
                key={where}
                type="button"
                aria-label={what}
                aria-pressed={what === 'confirm' ? iConfirmed : undefined}
                onClick={() => {
                  if (what === 'confirm') onConfirm(!iConfirmed);
                }}
                style={worn.box(part)}
                className={hit}
              />
            );
          })}

          {(() => {
            const part = worn.find(spec.close);
            return part ? (
              <button
                type="button"
                aria-label="Close the trade"
                onClick={onClose}
                style={worn.box(part)}
                className={hit}
              />
            ) : null;
          })()}
        </div>
        {beside ? <div className="flex">{beside}</div> : null}
      </div>
      {notice && (
        <p role="status" className="text-center text-parchment-100">
          {notice}
        </p>
      )}
    </div>
  );
}
