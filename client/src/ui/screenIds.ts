/** The screens the menu bar opens, in the order it lists them. */
export const SCREEN_IDS = [
  'bag',
  'character',
  'quests',
  'spells',
  'social',
  'team',
  'options',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];
