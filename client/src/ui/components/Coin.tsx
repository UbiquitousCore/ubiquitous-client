import type { JSX } from 'preact';

import { uiSprites } from '../art/uiSprites';

/** Plain discs, until the coin art is cut from the player's own sheets. */
const FALLBACK = {
  gold: 'bg-brass-400',
  silver: 'bg-steel-400',
  copper: 'bg-parchment-700',
} as const;

export type CoinMetal = keyof typeof FALLBACK;

/** One coin's picture, sized by its container. Decorative: the amount beside it says what it is. */
export function Coin({ metal }: { metal: CoinMetal }): JSX.Element {
  const art = uiSprites.value.get(`coin-${metal}`);
  return art ? (
    <img src={art} alt="" data-coin={metal} className="size-full" draggable={false} />
  ) : (
    <span
      aria-hidden="true"
      data-coin={metal}
      className={`block size-full rounded-full ${FALLBACK[metal]}`}
    />
  );
}
