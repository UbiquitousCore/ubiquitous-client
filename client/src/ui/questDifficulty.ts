/**
 * How hard a quest is for this character, which is what colours its name.
 * Read off the quest's level less the character's; see `questDifficulty`.
 */
export type QuestDifficulty = 'trivial' | 'easy' | 'fair' | 'hard' | 'deadly';

/** A quest name's colour by difficulty. */
export const DIFFICULTY_TEXT: Record<QuestDifficulty, string> = {
  trivial: 'text-quest-trivial',
  easy: 'text-quest-easy',
  fair: 'text-notice',
  hard: 'text-quest-hard',
  deadly: 'text-row-blocked',
};

/**
 * The difficulty bands, easiest first, each with the largest level gap
 * (quest level less character level) it still covers. Own choice: two levels
 * either side counts as your level, and eight or more below is not worth the
 * walk.
 */
const DIFFICULTY_BANDS: ReadonlyArray<readonly [maxGap: number, band: QuestDifficulty]> = [
  [-8, 'trivial'],
  [-3, 'easy'],
  [2, 'fair'],
  [4, 'hard'],
  [Infinity, 'deadly'],
];

/** How hard a quest of `questLevel` is for a character of `playerLevel`. */
export function questDifficulty(questLevel: number, playerLevel: number): QuestDifficulty {
  const gap = questLevel - playerLevel;
  for (const [maxGap, band] of DIFFICULTY_BANDS) {
    if (gap <= maxGap) return band;
  }
  return 'deadly';
}
