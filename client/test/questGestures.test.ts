/**
 * The giver gestures once the server has taken the quest: on accepting it,
 * and on handing it in. A click the server refuses gets no gesture.
 */

import { describe, expect, it } from 'vitest';

import { QUEST_GESTURES, QuestGestures } from '../src/gameplay/questGestures';

const GIVER = 7007;
const QUEST = 620;

describe('the gesture a quest giver makes', () => {
  it('sends the player off once the server confirms the accept', () => {
    const gestures = new QuestGestures();
    gestures.accepting(GIVER, QUEST);
    expect(gestures.updated(QUEST)).toEqual({ giver: GIVER, clip: QUEST_GESTURES.accepted });
    // Once: the next progress update on the same quest is not another accept.
    expect(gestures.updated(QUEST)).toBeNull();
  });

  it('approves once the server takes the quest back, not on the update before it', () => {
    const gestures = new QuestGestures();
    gestures.handingIn(GIVER, QUEST);
    // The server restates the row before it removes it.
    expect(gestures.updated(QUEST)).toBeNull();
    expect(gestures.removed(QUEST)).toEqual({ giver: GIVER, clip: QUEST_GESTURES.handedIn });
    expect(gestures.removed(QUEST)).toBeNull();
  });

  it('makes no gesture for a quest nobody asked about', () => {
    const gestures = new QuestGestures();
    expect(gestures.updated(QUEST)).toBeNull();
    expect(gestures.removed(QUEST)).toBeNull();
  });

  it('makes no gesture when a refused hand-in is followed by dropping the quest', () => {
    // A full bag refuses the hand-in and removes nothing. Dropping the quest
    // afterwards is a removal too, and the giver has nothing to approve of.
    const gestures = new QuestGestures();
    gestures.handingIn(GIVER, QUEST);
    gestures.dropping(QUEST);
    expect(gestures.removed(QUEST)).toBeNull();
  });

  it('answers the giver asked last', () => {
    const gestures = new QuestGestures();
    gestures.accepting(GIVER, QUEST);
    gestures.accepting(GIVER + 1, QUEST);
    expect(gestures.updated(QUEST)?.giver).toBe(GIVER + 1);
  });
});
