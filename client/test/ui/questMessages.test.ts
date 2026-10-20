/**
 * What the screen says when a quest moves.
 *
 * The wording is `"objective  done/wanted"` with two spaces, the
 * count clamped so an overshoot reads `5/5`, and yellow once a thing is done.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { QuestRecord } from '../../src/net/GameConnection';
import {
  QUEST_BANNER_LIFETIME_MS,
  QUEST_MESSAGE_LIFETIME_MS,
  QUEST_MESSAGE_MAX_LINES,
  announceQuestAccepted,
  announceQuestCompleted,
  announceQuestProgress,
  clearQuestMessages,
  expireQuestMessages,
  objectiveLine,
  objectiveLines,
  questMessages,
  questText,
  setQuestText,
} from '../../src/ui/questStore';

function quest(over: Partial<QuestRecord> = {}): QuestRecord {
  return {
    id: 620,
    name: 'Quest 620',
    status: 'incomplete',
    titleStringId: 6920,
    objectives: [
      {
        index: 0,
        killed: 0,
        triggered: 0,
        held: 0,
        objectiveItem: 0,
        objectiveItemCount: 0,
        goalCount: 5,
        objectiveStringId: 6927,
      },
    ],
    ...over,
  };
}

beforeEach(() => {
  clearQuestMessages();
  questText.value = new Map();
  setQuestText(6920, 'Sample Errand');
  setQuestText(6927, 'Kill the wolves');
});

describe('every objective a quest asks for', () => {
  it('writes one "objective  done/wanted" line per objective, in slot order', () => {
    setQuestText(6928, 'Gather pelts');
    const slot = (index: number, done: number, wanted: number, stringId: number) => ({
      index,
      killed: done,
      triggered: 0,
      held: 0,
      objectiveItem: 0,
      objectiveItemCount: 0,
      goalCount: wanted,
      objectiveStringId: stringId,
    });
    const lines = objectiveLines(
      quest({ objectives: [slot(1, 3, 12, 6928), slot(0, 5, 5, 6927), slot(2, 0, 0, 6927)] }),
    );
    expect(lines.map(line => line.text)).toEqual(['Kill the wolves  5/5', 'Gather pelts  3/12']);
  });
});

describe('one objective as a line', () => {
  it('reads "objective  done/wanted", and is green while it is unfinished', () => {
    const line = objectiveLine(
      quest({
        objectives: [
          {
            index: 0,
            killed: 2,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
        ],
      }),
      0,
    );
    expect(line).toEqual({ text: 'Kill the wolves  2/5', tone: 'active' });
  });

  it('turns yellow when the objective is met', () => {
    const line = objectiveLine(
      quest({
        objectives: [
          {
            index: 0,
            killed: 5,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
        ],
      }),
      0,
    );
    expect(line).toEqual({ text: 'Kill the wolves  5/5', tone: 'ready' });
  });

  it('clamps an overshoot rather than reading 7/5', () => {
    const line = objectiveLine(
      quest({
        objectives: [
          {
            index: 0,
            killed: 7,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
        ],
      }),
      0,
    );
    expect(line!.text).toBe('Kill the wolves  5/5');
  });

  it('says nothing for a requirement slot that asks for nothing', () => {
    // Three of a quest's four slots are usually empty, and an empty slot is
    // not an objective with no name — it is not an objective.
    expect(
      objectiveLine(
        quest({
          objectives: [
            {
              index: 1,
              killed: 0,
              triggered: 0,
              held: 0,
              objectiveItem: 0,
              objectiveItemCount: 0,
              goalCount: 0,
              objectiveStringId: 0,
            },
          ],
        }),
        1,
      ),
    ).toBeNull();
  });

  it('counts a looted item and a fired trigger, not only a kill', () => {
    const held = objectiveLine(
      quest({
        objectives: [
          {
            index: 0,
            killed: 0,
            triggered: 0,
            held: 3,
            objectiveItem: 900,
            objectiveItemCount: 4,
            goalCount: 0,
            objectiveStringId: 6927,
          },
        ],
      }),
      0,
    );
    expect(held!.text).toBe('Kill the wolves  3/4');
  });
});

describe('what is said when a quest moves', () => {
  it('names the quest and then the objective', () => {
    announceQuestProgress(
      quest({
        objectives: [
          {
            index: 0,
            killed: 1,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
        ],
      }),
      0,
      1000,
    );

    expect(questMessages.value.map(m => [m.kind, m.text, m.tone])).toEqual([
      ['title', 'Sample Errand', 'active'],
      ['progress', 'Kill the wolves  1/5', 'active'],
    ]);
  });

  it('turns the title yellow once the whole quest can be handed in', () => {
    // Yellow says "the walk back is the last step".
    announceQuestProgress(
      quest({
        readyToHandIn: true,
        objectives: [
          {
            index: 0,
            killed: 5,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
        ],
      }),
      0,
      1000,
    );
    expect(questMessages.value[0]).toMatchObject({ kind: 'title', tone: 'ready' });
  });

  it('says nothing at all for a slot with no requirement', () => {
    announceQuestProgress(quest({ objectives: [] }), 0, 1000);
    expect(questMessages.value).toEqual([]);
  });

  it('marks taking a quest and handing one in, both in the quest yellow', () => {
    // Both banners are drawn in quest-yellow: the colour
    // says what the banner is, not how far along the quest is.
    announceQuestAccepted(quest(), 1000);
    expect(questMessages.value.map(m => [m.kind, m.text, m.tone])).toEqual([
      ['accepted', 'Sample Errand (Accepted)', 'ready'],
    ]);

    announceQuestCompleted(quest(), 1000);
    expect(questMessages.value.map(m => [m.kind, m.text, m.tone])).toEqual([
      ['completed', 'Sample Errand (Completed)', 'ready'],
    ]);
  });

  it('puts every slot that moved under one title, not the title twice', () => {
    setQuestText(6928, 'Gather the pelts');
    announceQuestProgress(
      quest({
        objectives: [
          {
            index: 0,
            killed: 3,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
          {
            index: 1,
            killed: 0,
            triggered: 0,
            held: 2,
            objectiveItem: 44,
            objectiveItemCount: 2,
            goalCount: 0,
            objectiveStringId: 6928,
          },
        ],
      }),
      [0, 1],
      1000,
    );

    expect(questMessages.value.map(m => [m.kind, m.text, m.tone])).toEqual([
      ['title', 'Sample Errand', 'active'],
      ['progress', 'Kill the wolves  3/5', 'active'],
      ['progress', 'Gather the pelts  2/2', 'ready'],
    ]);
  });

  it('replaces the block rather than stacking, so five kills is still two lines', () => {
    // A new block takes the place of the one showing, so lines never pile up.
    const killed = (n: number): QuestRecord =>
      quest({
        objectives: [
          {
            index: 0,
            killed: n,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 6927,
          },
        ],
      });

    for (let n = 1; n <= 5; n++) announceQuestProgress(killed(n), 0, 1000 + n);

    expect(questMessages.value.map(m => m.text)).toEqual(['Sample Errand', 'Kill the wolves  5/5']);
  });

  it('lets a banner take the place of the progress block', () => {
    announceQuestProgress(quest(), 0, 1000);
    expect(questMessages.value).toHaveLength(2);

    announceQuestCompleted(quest(), 1100);
    expect(questMessages.value.map(m => m.kind)).toEqual(['completed']);
  });

  it('leaves the block alone when nothing it was told about yields a line', () => {
    // Nothing to say is no reason to take down what is already up.
    announceQuestProgress(quest(), 0, 1000);
    const before = questMessages.value;
    announceQuestProgress(quest({ objectives: [] }), 0, 1100);
    expect(questMessages.value).toBe(before);
  });

  it('runs to no more than a title and a line per requirement slot', () => {
    const objectives = [0, 1, 2, 3, 4, 5, 6].map(index => ({
      index,
      killed: 1,
      triggered: 0,
      held: 0,
      objectiveItem: 0,
      objectiveItemCount: 0,
      goalCount: 5,
      objectiveStringId: 6927,
    }));
    announceQuestProgress(quest({ objectives: objectives.slice(0, 4) }), [0, 1, 2, 3], 1000);
    // Every slot of a real quest moving at once still fits.
    expect(questMessages.value).toHaveLength(5);
    announceQuestProgress(quest({ objectives }), [0, 1, 2, 3, 4, 5, 6], 1100);
    expect(questMessages.value).toHaveLength(QUEST_MESSAGE_MAX_LINES);
  });

  it('uses the id as a name until the string table answers', () => {
    questText.value = new Map();
    announceQuestAccepted(quest(), 1000);
    expect(questMessages.value[0]!.text).toBe('Quest 620 (Accepted)');
  });
});

describe('fading', () => {
  it('gives a progress block the long lifetime', () => {
    announceQuestProgress(quest(), 0, 1000);
    expireQuestMessages(1000 + QUEST_MESSAGE_LIFETIME_MS - 1);
    expect(questMessages.value).toHaveLength(2);

    expireQuestMessages(1000 + QUEST_MESSAGE_LIFETIME_MS);
    expect(questMessages.value).toEqual([]);
  });

  it("gives a banner the shorter lifetime, not the block's", () => {
    // The banners go sooner; only the progress block gets the long lifetime.
    announceQuestAccepted(quest(), 1000);
    expireQuestMessages(1000 + QUEST_BANNER_LIFETIME_MS - 1);
    expect(questMessages.value).toHaveLength(1);

    expireQuestMessages(1000 + QUEST_BANNER_LIFETIME_MS);
    expect(questMessages.value).toEqual([]);
  });

  it('leaves the signal alone when nothing expired, so the HUD is not redrawn', () => {
    announceQuestAccepted(quest(), 1000);
    const before = questMessages.value;
    expireQuestMessages(1001);
    expect(questMessages.value).toBe(before);
  });
});
