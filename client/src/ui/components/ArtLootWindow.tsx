/** The loot screen in shipped art: rows, take-all and close. Falls back without art. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { ListingSpec, ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import type { Worn } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornChevrons } from '../art/WornChevrons';
import { WornRow } from '../art/WornRow';
import { isNamed } from '../art/piecePlan';
import type { PiecePart } from '../art/piecePlan';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import { uiSprites } from '../art/uiSprites';
import type { UiSpriteName } from '../art/uiSprites';
import { qualityTextClass } from '../items';
import { splitCoins } from '../money';
import { ArtItemCard, HELD_CARD, cardFor } from './ArtItemCard';
import type { SocketItem } from './ItemSocket';

/** Our name for this screen. The spec says which dialog wears it. */
export const LOOT_SCREEN = 'loot';

/** One thing on the body, as this window needs it. */
export interface LootEntry {
  /** The row's own slot on the body, which is what taking it names back. */
  slot: number;
  /** Which thing it is, for the card that says what it is. */
  entry: number;
  item: SocketItem;
}

export interface ArtLootWindowProps {
  /** Whose body it is, for the plaque across the top. */
  title: string;
  /** The coin on the body, already written out in words. */
  money?: string;
  entries: readonly LootEntry[];
  onTake(slot: number): void;
  onTakeMoney(): void;
  /** Take the coin and every row. Absent when there is nothing to take. */
  onTakeAll?(): void;
  onClose(): void;
  /** The money on the body in copper, for writing it in coins. */
  copper?: number;
}

/** A row: the coin (taking the first row in place of the screen's unrecorded coin strip) or one thing. */
type LootLine = { money: string } | { entry: LootEntry };

export function ArtLootWindow(props: ArtLootWindowProps): JSX.Element | null {
  const spec = useWornScreen(LOOT_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

type Coin = 'gold' | 'silver' | 'copper';

const COIN_SPRITE: Record<Coin, UiSpriteName> = {
  gold: 'coin-gold',
  silver: 'coin-silver',
  copper: 'coin-copper',
};

function Worn({
  title,
  money,
  copper = 0,
  entries,
  onTake,
  onTakeMoney,
  onTakeAll,
  onClose,
  spec,
}: ArtLootWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  /** The thing whose card is open, and where its picture is. */
  const [reading, setReading] = useState<{ entry: LootEntry; at: { x: number; y: number } } | null>(
    null,
  );
  const list = Object.values(spec.lists ?? {})[0];
  const lines: LootLine[] = [
    ...(money !== undefined ? [{ money }] : []),
    ...entries.map(entry => ({ entry })),
  ];
  const takeAll = Object.entries(spec.actions ?? {}).find(([, does]) => does === 'takeAll')?.[0];
  const slice = (whole: Parameters<typeof listSlice>[0]) =>
    listSlice(whole, { list, items: lines, scroll: scroll.at });

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => ({
      withoutArt: slice(whole).marks,
      hidden: [
        ...(spec.hidden ?? []),
        ...slice(whole).hidden,
        // Every row carries the mark the screen lights a chosen row with.
        // Drawn as shipped every row reads as chosen, and nothing on a
        // body is chosen: a press takes it.
        ...(list?.chosen ? slice(whole).keptRows.map(path => `${path}/${list.chosen}`) : []),
        // Take-all with nothing to take is not drawn at all, the
        // way the built window leaves its button out.
        ...(!onTakeAll && takeAll ? [takeAll] : []),
      ],
    }),
    { floats: true },
  );
  const shown = slice(worn.whole);
  const rows = rowsIn(worn.parts, shown);

  if (!worn.image || !worn.frame || !list) return null;

  const hit =
    'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300 disabled:cursor-default';

  // Only the coins that are there, largest first, as the words name them.
  const split = splitCoins(copper);
  const coins = (['gold', 'silver', 'copper'] as const)
    .filter(coin => split[coin] > 0)
    .map(coin => ({ coin, figure: split[coin], url: uiSprites.value.get(COIN_SPRITE[coin]) }));
  const coinUrl = coins[0]?.url;
  const field = (fields: readonly PiecePart[]) =>
    worn.fieldOf(fields.find(part => isNamed(part, list.fields.name ?? '')));
  const takeAllPart = worn.find(takeAll);
  const closePart = worn.find(spec.close);

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-loot-worn
        className="pointer-events-auto relative touch-none overflow-hidden"
        {...listGestures(worn, list, shown, scroll)}
      >
        <img
          ref={worn.pictureRef}
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="block max-h-[85dvh] max-w-[92vw]"
          style={worn.sized}
          draggable={false}
        />

        {/* The title and the take-all words. The places are the spec's, the
          words are the user's file's. */}
        <WornCaptions
          worn={worn}
          spec={spec}
          tone={LIGHT}
          hidden={!onTakeAll && takeAll ? [takeAll] : undefined}
        />

        {rows.map(({ row, fields, item }) => {
          const slot = pictureSlot(fields, list);
          if ('money' in item) {
            return (
              <Fragmentish key={row.path}>
                <button
                  type="button"
                  data-loot-money
                  aria-label={`Take ${item.money}`}
                  onClick={onTakeMoney}
                  style={worn.box(row)}
                  className={hit}
                />
                {slot && coinUrl ? (
                  <img
                    src={coinUrl}
                    alt=""
                    aria-hidden="true"
                    style={{ ...worn.box(slot), objectFit: 'contain', pointerEvents: 'none' }}
                    draggable={false}
                  />
                ) : null}
                <MoneyWords worn={worn} field={field(fields)} words={item.money} coins={coins} />
              </Fragmentish>
            );
          }
          const { entry } = item;
          return (
            <Fragmentish key={row.path}>
              <button
                type="button"
                data-loot-slot={entry.slot}
                data-loot-quality={entry.item.quality}
                aria-label={entry.item.name}
                onClick={() => onTake(entry.slot)}
                style={worn.box(row)}
                className={hit}
              />
              <WornRow
                worn={worn}
                fields={fields}
                list={list}
                values={{ name: entry.item.name }}
                icon={entry.item.icon}
                // Names in this interface are written in the colour of what
                // the thing is, which the field cannot carry: it changes
                // with the thing.
                styleOf={() => qualityTextClass(entry.item.quality)}
              />
              {/* The picture says what the thing is, on the card a thing
                you have opens; the rest of the row takes it. Over the row,
                so a press on the picture never reaches the row. */}
              {slot ? (
                <button
                  type="button"
                  aria-label={`About ${entry.item.name}`}
                  onClick={(event: MouseEvent) => {
                    const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
                    setReading({ entry, at: { x: on.right, y: on.top } });
                  }}
                  style={worn.box(slot)}
                  className={hit}
                />
              ) : null}
              {slot && entry.item.count > 1 ? (
                <span
                  className="pointer-events-none absolute flex items-end justify-end text-parchment-100 text-shadow-world"
                  style={{
                    ...worn.box(slot),
                    fontSize: `${(9 * worn.scale).toFixed(1)}px`,
                    lineHeight: 1,
                  }}
                >
                  {entry.item.count}
                </span>
              ) : null}
            </Fragmentish>
          );
        })}

        <WornChevrons
          worn={worn}
          list={list}
          slice={shown}
          onStep={way => scroll.step(way === 'up' ? -1 : 1, shown.furthest)}
        />

        {onTakeAll && takeAllPart ? (
          <button
            type="button"
            aria-label="Take all"
            onClick={onTakeAll}
            style={worn.box(takeAllPart)}
            className={hit}
          />
        ) : null}

        {closePart ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={worn.box(closePart)}
            className={hit}
          />
        ) : null}
      </div>
      {reading ? (
        <ArtItemCard
          listing={cardFor({
            id: reading.entry.item.id,
            entry: reading.entry.entry,
            count: reading.entry.item.count,
          })}
          wears={HELD_CARD}
          actions={[]}
          anchor={reading.at}
          onClose={() => setReading(null)}
        />
      ) : null}
    </>
  );
}

/** Money as figures beside the build's coins; in words until every coin picture arrives. */
function MoneyWords({
  worn,
  field,
  words,
  coins,
}: {
  worn: Worn;
  field: PiecePart | undefined;
  words: string;
  coins: readonly { coin: Coin; figure: number; url: string | undefined }[];
}): JSX.Element | null {
  if (!field) return null;
  const pictured = coins.length > 0 && coins.every(one => one.url);
  // The field was authored dark for a light plate and the plate is dark
  // here, as it is for every name in this list.
  return (
    <span
      data-loot-money-words
      className="text-brass-300"
      style={{ ...worn.words(field), color: undefined, gap: '0.25em' }}
    >
      {pictured
        ? coins.map(({ coin, figure, url }) => (
            <span key={coin} className="inline-flex items-center gap-[0.1em]">
              {figure}
              <img
                src={url}
                alt=""
                aria-hidden="true"
                className="h-[1.1em] w-auto"
                draggable={false}
              />
            </span>
          ))
        : words}
    </span>
  );
}

/** The part of a row the thing's own picture goes in. */
function pictureSlot(fields: readonly PiecePart[], list: ListingSpec): PiecePart | undefined {
  const icon = list.icon;
  return icon ? fields.find(part => part.draws && isNamed(part, icon)) : undefined;
}

/** A fragment that takes a key, which `preact`'s own shorthand cannot. */
function Fragmentish({ children }: { children: (JSX.Element | null)[] }): JSX.Element {
  return <>{children}</>;
}
