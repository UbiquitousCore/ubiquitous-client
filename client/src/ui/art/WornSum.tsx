/** A sum laid out as the screen does at run time (figure then coin, largest first, centred), for screens that stack their coins. */

import type { JSX } from 'preact';

import type { PiecePart } from './piecePlan';
import { INK, useWorn } from './useWorn';
import type { Worn } from './useWorn';

/** The gap the screen leaves between a figure and the coin beside it. */
const SPACE = 2;

export type Coin = 'gold' | 'silver' | 'copper';

/** The coins from the largest down, which is the order a sum is read in. */
const ORDER: readonly Coin[] = ['gold', 'silver', 'copper'];

/**
 * The most figures a letter writes for one coin. Observed in play by the
 * owner: a letter writes the sum riding with it in full, every coin exact,
 * and caps it only at 9,999,999 gold.
 */
const MOST_FIGURES = 7;

/**
 * What a letter writes for the sum riding with it: every coin it has,
 * exactly, and never a mark in place of a coin. A coin whose figures run
 * past `MOST_FIGURES` reads as that many nines.
 */
export function fitCoins(says: Partial<Record<Coin, string>>): Partial<Record<Coin, string>> {
  const out: Partial<Record<Coin, string>> = {};
  for (const coin of ORDER) {
    const figures = says[coin];
    if (!figures) continue;
    out[coin] = figures.length > MOST_FIGURES ? '9'.repeat(MOST_FIGURES) : figures;
  }
  return out;
}

export interface WornSumProps {
  worn: Worn;
  /** The dialog the coin art is found in. */
  dialog: string;
  /** The field the row is centred in. */
  field: PiecePart;
  /** Where each coin's art sits inside that dialog. */
  coins: Partial<Record<Coin, string>>;
  /** What each coin's figure reads; a coin it does not name is left out. */
  says: Partial<Record<Coin, string>>;
  tone?: string;
}

export function WornSum({
  worn,
  dialog,
  field,
  coins,
  says,
  tone = INK,
}: WornSumProps): JSX.Element | null {
  // One call per coin, always in the same order: what a screen shows
  // changes as money is added and the number of hooks may not.
  const art: Record<Coin, ReturnType<typeof useWorn>> = {
    gold: useWorn(coins.gold ? `${dialog}/${coins.gold}` : undefined, undefined, {}),
    silver: useWorn(coins.silver ? `${dialog}/${coins.silver}` : undefined, undefined, {}),
    copper: useWorn(coins.copper ? `${dialog}/${coins.copper}` : undefined, undefined, {}),
  };

  const size = Math.min(field.text?.sizePx ?? 12, field.box.h || Infinity) * worn.scale;
  const shown = ORDER.filter(coin => says[coin] !== undefined && says[coin] !== '');
  if (!shown.length) return null;

  return (
    <span
      style={{
        ...worn.box(field),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: `${SPACE * worn.scale}px`,
        fontSize: `${size.toFixed(1)}px`,
        color: field.text?.color ?? tone,
        lineHeight: 1.1,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
      }}
    >
      {shown.map(coin => {
        const picture = art[coin].image;
        return (
          <span
            key={coin}
            data-coin={coin}
            style={{ display: 'flex', alignItems: 'center', gap: `${SPACE * worn.scale}px` }}
          >
            <span>{says[coin]}</span>
            {picture && (
              <img
                src={picture.url}
                alt=""
                aria-hidden="true"
                style={{
                  width: `${(picture.width / picture.height) * size}px`,
                  height: `${size}px`,
                }}
                draggable={false}
              />
            )}
          </span>
        );
      })}
    </span>
  );
}
