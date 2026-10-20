/**
 * One window at a time between the character window and what an NPC or a
 * world object opens: opening either puts the other away.
 */

import { effect } from '@preact/signals';

import { auctionInteraction, closeAuction } from './auctionStore';
import {
  closeCharacterWindow,
  closeGossip,
  closeShop,
  gossip,
  openScreen,
  openedBeside,
  shopInteraction,
} from './hudStore';
import { bankOpen, closeBank } from './inventoryStore';
import { closeMail, mailOpen } from './mailStore';
import { closeQuestConversation, questConversation } from './questStore';
import { closeSummonWindow, summonWindow } from './summonStore';

/** What is up: the character window, and each NPC window in `NPC_WINDOWS` order. */
export interface WindowsUp {
  menu: boolean;
  npc: readonly boolean[];
}

/**
 * What a change from `before` to `after` puts away. A window just opened
 * wins: the character window shuts the NPC windows, and an NPC window shuts
 * the character window and any other NPC window. Nothing is shut for the
 * character window opened beside a shop to sell from.
 */
export function windowsToShut(
  before: WindowsUp,
  after: WindowsUp,
  beside = false,
): { menu: boolean; npc: number[] } {
  const menuOpened = after.menu && !before.menu;
  const opened = after.npc.flatMap((up, at) => (up && !before.npc[at] ? [at] : []));
  if (menuOpened && !beside) {
    return { menu: false, npc: after.npc.flatMap((up, at) => (up ? [at] : [])) };
  }
  if (opened.length) {
    return {
      menu: after.menu && !beside,
      npc: after.npc.flatMap((up, at) => (up && !opened.includes(at) ? [at] : [])),
    };
  }
  return { menu: false, npc: [] };
}

const NPC_WINDOWS: ReadonlyArray<{ up(): boolean; shut(): void }> = [
  { up: () => shopInteraction.value !== null, shut: closeShop },
  { up: () => gossip.value !== null, shut: closeGossip },
  { up: () => mailOpen.value, shut: closeMail },
  { up: () => questConversation.value !== null, shut: closeQuestConversation },
  { up: () => bankOpen.value, shut: closeBank },
  { up: () => auctionInteraction.value !== null, shut: closeAuction },
  { up: () => summonWindow.value !== null, shut: closeSummonWindow },
];

/** Watch the windows and keep to one at a time; returns what stops watching. */
export function installWindowFocus(): () => void {
  let before: WindowsUp | null = null;
  return effect(() => {
    const after: WindowsUp = { menu: openScreen.value !== null, npc: NPC_WINDOWS.map(w => w.up()) };
    const was = before;
    before = after;
    if (!was) return;
    const shut = windowsToShut(was, after, openedBeside.peek());
    if (shut.menu) closeCharacterWindow();
    for (const at of shut.npc) NPC_WINDOWS[at]!.shut();
  });
}
