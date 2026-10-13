/**
 * The quest log keeps its contents.
 *
 * Two ways to lose them: one list holding both the character's quests and
 * whatever the giver being talked to is offering, so opening a giver writes
 * over the log; and a filter protecting the log that drops anything whose
 * status is not one of two values.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import type { QuestRecord } from '../../src/net/GameConnection';
import {
  acceptQuest,
  clearGiverQuests,
  giverQuests,
  questGiverStatuses,
  questLog,
  removeQuest,
  setGiverQuests,
  setQuestGiverStatuses,
  setQuestLog,
  setQuestText,
  setTracked,
  trackedQuest,
  upsertQuest,
  questName,
  questString,
  questText,
} from '../../src/ui/questStore';

function quest(id: number, over: Partial<QuestRecord> = {}): QuestRecord {
  return { id, name: `Quest ${id}`, status: 'available', ...over };
}

beforeEach(() => {
  setQuestLog([]);
  clearGiverQuests();
  setQuestGiverStatuses([]);
  questGiverStatuses.value = new Map();
  questText.value = new Map();
});

describe('the quest log and a giver’s offering list', () => {
  it('keeps a taken quest when a giver’s offerings arrive', () => {
    acceptQuest(quest(1, { name: 'Banish the Traitors' }));
    setGiverQuests([quest(2), quest(3)]);

    expect(questLog.value.map(q => q.id)).toEqual([1]);
    expect(giverQuests.value.map(q => q.id)).toEqual([2, 3]);
  });

  it('never puts a giver’s offerings into the log', () => {
    setGiverQuests([quest(9)]);
    expect(questLog.value).toEqual([]);
  });

  it('empties the offering list when the conversation ends, and leaves the log', () => {
    acceptQuest(quest(1));
    setGiverQuests([quest(2)]);
    clearGiverQuests();

    expect(giverQuests.value).toEqual([]);
    expect(questLog.value.map(q => q.id)).toEqual([1]);
  });
});

describe('updating a quest already in the log', () => {
  it('merges rather than replaces, so a progress push keeps the objective text', () => {
    acceptQuest(quest(1, { objective: 'Slay five traitors', slot: 3 }));
    upsertQuest({ id: 1, name: 'Quest 1', status: 'incomplete', progress: '2 / 5 slain' });

    expect(questLog.value).toHaveLength(1);
    expect(questLog.value[0]).toMatchObject({
      objective: 'Slay five traitors',
      progress: '2 / 5 slain',
      slot: 3,
    });
  });

  it('keeps the order quests were taken in when one of them updates', () => {
    acceptQuest(quest(1));
    acceptQuest(quest(2));
    upsertQuest(quest(1, { status: 'finished' }));

    expect(questLog.value.map(q => q.id)).toEqual([1, 2]);
  });

  it('takes a quest as in progress whatever state it was offered in', () => {
    acceptQuest(quest(7, { status: 'available' }));
    expect(questLog.value[0].status).toBe('incomplete');
  });

  it('drops a quest from the log when the server says it is gone', () => {
    acceptQuest(quest(1));
    acceptQuest(quest(2));
    removeQuest(1);
    expect(questLog.value.map(q => q.id)).toEqual([2]);
  });
});

describe('tracking', () => {
  it('reports the tracked quest, and nothing when none is', () => {
    // upsertQuest, not acceptQuest: arriving already in the log (a quest.log
    // row at login, say) never carries the auto-track behaviour below, which
    // is specifically about the moment a quest is freshly taken.
    upsertQuest(quest(1));
    upsertQuest(quest(2));
    expect(trackedQuest.value).toBeNull();

    setTracked(2, true);
    expect(trackedQuest.value?.id).toBe(2);

    setTracked(2, false);
    expect(trackedQuest.value).toBeNull();
  });

  it('auto-tracks a freshly accepted quest when nothing else is tracked', () => {
    // Taking a quest tracks it exactly when nothing else already is. Without this,
    // the guide arrow's own data can be perfect and nothing still ever draws
    // it, because nothing is ever marked as the one to point at.
    acceptQuest(quest(1));
    expect(trackedQuest.value?.id).toBe(1);
  });

  it('never steals the mark from a quest the player already chose to follow', () => {
    acceptQuest(quest(1));
    acceptQuest(quest(2));

    expect(trackedQuest.value?.id).toBe(1);
  });
});

describe('the marks over givers’ heads', () => {
  it('merges each message in, because one names only the givers it covers', () => {
    setQuestGiverStatuses([{ networkId: 10, status: 'available' }]);
    setQuestGiverStatuses([{ networkId: 11, status: 'finished' }]);

    expect(questGiverStatuses.value.get(10)).toBe('available');
    expect(questGiverStatuses.value.get(11)).toBe('finished');
  });

  it('lets a later message change a giver it names again', () => {
    setQuestGiverStatuses([{ networkId: 10, status: 'available' }]);
    setQuestGiverStatuses([{ networkId: 10, status: 'none' }]);
    expect(questGiverStatuses.value.get(10)).toBe('none');
  });
});

describe('a partial update onto a quest the log already holds', () => {
  it('keeps the title and the slot when only a counter moved', () => {
    // The whole reason updates are partial: a kill counted carries the quest
    // and one number, and defaulting the rest would empty the row.
    setQuestLog([
      {
        id: 1,
        name: 'Quest 1',
        status: 'incomplete',
        slot: 4,
        titleStringId: 5000,
        objectives: [
          {
            index: 0,
            killed: 1,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 5100,
          },
        ],
      },
    ]);

    upsertQuest({ id: 1, counters: [{ index: 0, kind: 'killed', count: 3 }] });

    expect(questLog.value[0]).toMatchObject({ slot: 4, titleStringId: 5000, status: 'incomplete' });
    expect(questLog.value[0]!.objectives![0]).toMatchObject({
      killed: 3,
      goalCount: 5,
      objectiveStringId: 5100,
    });
  });

  it('marks a quest finishable without touching anything else', () => {
    setQuestLog([{ id: 1, name: 'Quest 1', status: 'incomplete', slot: 4 }]);
    upsertQuest({ id: 1, readyToHandIn: true, status: 'finished' });
    expect(questLog.value[0]).toMatchObject({ status: 'finished', readyToHandIn: true, slot: 4 });
  });

  it('applies a counter to the requirement slot it names, not the first', () => {
    setQuestLog([
      {
        id: 1,
        name: 'Quest 1',
        status: 'incomplete',
        objectives: [
          {
            index: 0,
            killed: 0,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 5,
            objectiveStringId: 0,
          },
          {
            index: 1,
            killed: 0,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 2,
            objectiveStringId: 0,
          },
        ],
      },
    ]);

    upsertQuest({ id: 1, counters: [{ index: 1, kind: 'held', count: 2 }] });

    expect(questLog.value[0]!.objectives![0]).toMatchObject({ index: 0, killed: 0, held: 0 });
    expect(questLog.value[0]!.objectives![1]).toMatchObject({ index: 1, held: 2 });
  });
});

describe('quest text, which the wire never carries', () => {
  it('shows a placeholder until the string table answers, then the title', () => {
    setQuestLog([{ id: 1, name: 'Quest 1', status: 'incomplete', titleStringId: 5000 }]);
    expect(questName(questLog.value[0]!)).toBe('Quest 1');

    setQuestText(5000, 'Banish the Other Traitors');
    expect(questName(questLog.value[0]!)).toBe('Banish the Other Traitors');
  });

  it('has nothing to say for an id of zero, which is "no text"', () => {
    expect(questString(0)).toBeUndefined();
    expect(questString(undefined)).toBeUndefined();
  });

  it('folds the shipped break markup into newlines rather than printing it', () => {
    // Unfolded, `<br/>` shows on screen as a literal `br /` in the middle
    // of the sentence.
    setQuestText(6100, 'Sample line one.<br/><br/>Sample line two.');
    expect(questString(6100)).toBe('Sample line one.\n\nSample line two.');

    setQuestText(6101, 'First line<BR>second line< br />third line');
    expect(questString(6101)).toBe('First line\nsecond line\nthird line');
  });

  it('folds control-byte markup the way the menu strings use it', () => {
    // \x13 breaks a line; \x12… tags wrap links and style runs. On screen
    // both print as tofu in the middle of the sentence.
    setQuestText(6200, 'first sample clause.\x13\x13Second sample clause.');
    expect(questString(6200)).toBe('first sample clause.\n\nSecond sample clause.');

    setQuestText(6201, 'Fetch \u0012link_menu=9>three pebbles\u0012/link_menu for the tester.');
    expect(questString(6201)).toBe('Fetch three pebbles for the tester.');
  });
});
