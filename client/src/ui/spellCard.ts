/** The spell card's four stat lines (cost, reach, cast time, cooldown); an empty one stays empty, not zero. */
import type { SpellStats } from '../assets/types';
import { castTimeLabel } from '../gameplay/SpellBook';

/** The card's four lines, by what each one's picture says it is for. */
export interface SpellCardLines {
  cost: string;
  range: string;
  cast: string;
  cooldown: string;
}

/** The build's own words for the labels it has, where the spec found them. */
export interface SpellCardWords {
  range?: string;
}

/** "8s", "3 min", "1 h": a cooldown as long as it is, in its largest whole unit. */
export function cooldownLabel(ms: number): string {
  const seconds = ms / 1000;
  if (seconds >= 3600 && seconds % 3600 === 0) return `${seconds / 3600} h`;
  if (seconds >= 60 && seconds % 60 === 0) return `${seconds / 60} min`;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

export function spellCardLines(
  stats: SpellStats | undefined,
  words: SpellCardWords,
): SpellCardLines {
  if (!stats) return { cost: '', range: '', cast: '', cooldown: '' };
  return {
    cost: stats.powerCost > 0 ? String(stats.powerCost) : '',
    range: stats.range > 0 ? `${words.range ?? 'Range:'} ${Math.round(stats.range)}` : '',
    cast: castTimeLabel(stats.castMs) ?? '',
    cooldown: stats.cooldownMs > 0 ? `${cooldownLabel(stats.cooldownMs)} cooldown` : '',
  };
}
