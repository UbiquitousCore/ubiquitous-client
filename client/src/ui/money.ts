/** Money: copper on the wire, 100 to a silver, 10,000 to a gold; only coins present are named. */

const GOLD = 10_000;
const SILVER = 100;

/** A sum split into three coins, in one place so screens agree. */
export function splitCoins(copper: number): { gold: number; silver: number; copper: number } {
  const total = Math.max(0, Math.round(copper));
  return {
    gold: Math.floor(total / GOLD),
    silver: Math.floor((total % GOLD) / SILVER),
    copper: total % SILVER,
  };
}

/** A sum of gold and silver, as the wire carries it. */
export function moneyOf(gold: number, silver: number): number {
  return Math.max(0, Math.trunc(gold)) * GOLD + Math.max(0, Math.trunc(silver)) * SILVER;
}

/**
 * A price in the coins it has, as figures, and no others.
 *
 * A hundred and two copper is a silver and two copper, and forty silver
 * is forty silver: a coin with nothing in it is not named at all.
 */
export function namedCoins(copper: number): Partial<Record<'gold' | 'silver' | 'copper', string>> {
  const split = splitCoins(copper);
  const named: Partial<Record<'gold' | 'silver' | 'copper', string>> = {};
  for (const coin of ['gold', 'silver', 'copper'] as const) {
    if (split[coin]) named[coin] = String(split[coin]);
  }
  return named;
}

export function formatMoney(copper: number): string {
  const named = namedCoins(copper);
  const parts = (['gold', 'silver', 'copper'] as const)
    .filter(coin => named[coin])
    .map(coin => `${named[coin]} ${coin}`);
  return parts.length ? parts.join(' ') : '0 copper';
}
/** Coins written top down, only those present: forty silver shows no gold. Every worn screen uses this. */
export function coinsOf(copper: number): { gold: string; silver: string; copper: string } {
  const total = Math.max(0, Math.round(copper));
  const { gold, silver, copper: rest } = splitCoins(total);
  return {
    gold: gold ? String(gold) : '',
    silver: gold || silver ? String(silver) : '',
    copper: total ? String(rest) : '',
  };
}

/** As `coinsOf`, but an empty purse reads "0" on its lowest coin rather than blank. */
export function purseOf(copper: number): { gold: string; silver: string; copper: string } {
  const coins = coinsOf(copper);
  return coins.copper ? coins : { ...coins, copper: '0' };
}

/** Coin pictures with nothing written beside them, from the spec's per-coin list. */
export function bareCoins(
  pictures: Readonly<Record<string, string>> | undefined,
  written: { gold: string; silver: string; copper: string },
): string[] {
  return Object.entries(pictures ?? {})
    .filter(([coin]) => coin in written && !written[coin as keyof typeof written])
    .map(([, path]) => path);
}
