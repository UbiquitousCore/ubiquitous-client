/**
 * The gesture a quest giver makes when the server takes a quest from the
 * player or back from them.
 *
 * The files name no clip for either moment. The two here are this client's
 * own choice, picked by name from the emotes every playable race's folder
 * ships. TODO: confirm against play (the owner saw a gesture at both).
 */

/** Which clip plays for each moment. Own choice. */
export const QUEST_GESTURES = {
  /** The player has taken the quest: the giver sends them off. */
  accepted: 'emote_salute',
  /** The player has handed it in: the giver approves. */
  handedIn: 'emote_yes',
} as const;

export interface QuestGesture {
  /** Network id of the body that gestures. */
  giver: number;
  clip: string;
}

/**
 * Remembers which giver the player asked, so the answer can be played on the
 * right body once the server confirms. A refusal answers with an error that
 * names no quest, so an ask the server refused simply never fires.
 */
export class QuestGestures {
  private readonly accepts = new Map<number, number>();
  private readonly handIns = new Map<number, number>();

  accepting(giver: number, questId: number): void {
    this.accepts.set(questId, giver);
  }

  handingIn(giver: number, questId: number): void {
    this.handIns.set(questId, giver);
  }

  /** The player is dropping the quest: its removal is not a hand-in. */
  dropping(questId: number): void {
    this.handIns.delete(questId);
  }

  /** The server sent the quest's row: an accept it has taken, if one was asked. */
  updated(questId: number): QuestGesture | null {
    const giver = this.accepts.get(questId);
    if (giver === undefined) return null;
    this.accepts.delete(questId);
    return { giver, clip: QUEST_GESTURES.accepted };
  }

  /** The server took the quest out of the log: a hand-in, if one was asked. */
  removed(questId: number): QuestGesture | null {
    this.accepts.delete(questId);
    const giver = this.handIns.get(questId);
    if (giver === undefined) return null;
    this.handIns.delete(questId);
    return { giver, clip: QUEST_GESTURES.handedIn };
  }
}
