/** The target toolbar's icons, loose shipped files cached by action name; absent where unshipped. */

import { signal } from '@preact/signals';

/** Every icon this build asks for, by the same name it asks the pack for it
 * under (`ui_topbar_<name>.png`) — the one list both the resolver and the
 * menu's own draw order read from. */
export const TOPBAR_ICON_NAMES = [
  'whisper',
  'invite',
  'remove',
  'trade',
  'follow',
  'friend',
  'duel',
  'observe',
] as const;

export type TopbarIconName = (typeof TOPBAR_ICON_NAMES)[number];

export const topbarIcons = signal<ReadonlyMap<string, ImageBitmap>>(new Map());

export function setTopbarIcon(name: string, icon: ImageBitmap): void {
  if (topbarIcons.value.has(name)) return;
  topbarIcons.value = new Map(topbarIcons.value).set(name, icon);
}

/** The game's class numbers that have a badge picture: warrior, mage, ranger, monk. */
export const CLASS_IDS = [1, 2, 3, 4] as const;

/** Each class's badge picture, by the game's class number, once it decodes. */
export const classIcons = signal<ReadonlyMap<number, ImageBitmap>>(new Map());

export function setClassIcon(classId: number, icon: ImageBitmap): void {
  if (classIcons.value.has(classId)) return;
  classIcons.value = new Map(classIcons.value).set(classId, icon);
}
