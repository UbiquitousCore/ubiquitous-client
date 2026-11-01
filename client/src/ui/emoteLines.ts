/** The line the chat log writes for an emote, in the user's own words, by who did it and to whom. */

import { uiWords } from './art/pieceStore';
import { fill } from './art/wornWords';
import { earlierBuildLine, say } from './gameLines';

/** The game's emotes in the order its strings list them, by the keyword the server knows them by. */
export const EMOTE_ORDER = [
  'bow',
  'wave',
  'kiss',
  'work',
  'talk',
  'amaze',
  'no',
  'yes',
  'shout',
  'laugh',
  'point',
  'beg',
  'cheer',
  'applaud',
  'cry',
  'rude',
  'flex',
  'dance',
  'salute',
  'eat',
] as const;

/** Where each block of lines starts in 1.1.4's strings: one line per emote, in `EMOTE_ORDER`. */
const BLOCK_START = {
  theyToSomeone: 446,
  theyToEveryone: 466,
  youToSomeone: 521,
  youToEveryone: 541,
  theyToYou: 561,
} as const;

export interface EmoteSeen {
  emote: string;
  /** Who did it, or null for the player themself. */
  by: string | null;
  /** Who it was aimed at; `you` for the player, null for nobody. */
  at: string | null | { you: true };
}

/** What the log says, or null for an emote with no line in the user's strings. */
export function emoteLine(
  seen: EmoteSeen,
  words: readonly string[] = uiWords.value,
): string | null {
  const place = EMOTE_ORDER.indexOf(seen.emote as (typeof EMOTE_ORDER)[number]);
  if (place < 0) return null;
  const toYou = typeof seen.at === 'object' && seen.at !== null;
  const named = typeof seen.at === 'string' ? seen.at : null;
  const [block, values]: [keyof typeof BLOCK_START, string[]] =
    seen.by === null
      ? named
        ? ['youToSomeone', [named]]
        : ['youToEveryone', []]
      : toYou
        ? ['theyToYou', [seen.by]]
        : named
          ? ['theyToSomeone', [seen.by, named]]
          : ['theyToEveryone', [seen.by]];
  const sentence = say(earlierBuildLine(BLOCK_START[block] + place, ''), words);
  return sentence ? fill(sentence, ...values) : null;
}
