/**
 * Quests shared inside a party: the offers waiting on this player's answer,
 * and what to say when a party member answers one of this player's own.
 */

import { signal } from '@preact/signals';

import type { SharedQuestAnswer, SharedQuestOffer } from '../net/GameConnection';

export type { SharedQuestAnswer, SharedQuestOffer };

/**
 * Offers waiting on an answer, oldest first. One per quest: the server keeps
 * only the latest sharer of a quest, so a second offer of it replaces the first.
 */
export const sharedQuestOffers = signal<readonly SharedQuestOffer[]>([]);

export function offerSharedQuest(offer: SharedQuestOffer): void {
  sharedQuestOffers.value = [
    ...sharedQuestOffers.value.filter(held => held.questId !== offer.questId),
    offer,
  ];
}

/** The offer is answered, one way or the other; it leaves the queue. */
export function settleSharedQuest(questId: number): void {
  sharedQuestOffers.value = sharedQuestOffers.value.filter(held => held.questId !== questId);
}

export function resetSharedQuests(): void {
  sharedQuestOffers.value = [];
}

/** What one party member did with a shared quest, as a line for chat. */
export function sharedQuestAnswerLine(answer: SharedQuestAnswer, title: string): string {
  const who = answer.memberName || 'A party member';
  switch (answer.result) {
    case 'accepted':
      return `${who} accepted ${title}.`;
    case 'declined':
      return `${who} declined ${title}.`;
    case 'alreadyHas':
      return `${who} already has ${title}.`;
    case 'notEligible':
      return `${who} cannot take ${title}.`;
    case 'outOfReach':
      return `${who} is too far away to share ${title} with.`;
    default:
      return `${who} did not take ${title}.`;
  }
}

// Handlers rather than direct calls: `ui/` may not reach into the network
// layer, and `Game` holds the connection. The default does nothing, so the
// prompt rendered with no game behind it is inert rather than broken.

export interface QuestShareActions {
  answer(questId: number, accept: boolean): void;
}

const NOTHING: QuestShareActions = { answer: () => {} };

let actions: QuestShareActions = NOTHING;

export function setQuestShareActions(next: QuestShareActions): void {
  actions = next;
}

export function questShareActions(): QuestShareActions {
  return actions;
}
