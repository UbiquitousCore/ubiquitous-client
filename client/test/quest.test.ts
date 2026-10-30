import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Quests } from '../src/app/features/quest/quest';
import type { QuestLookups } from '../src/app/features/quest/questLookups';
import type { GameConnection, QuestRecord } from '../src/net/GameConnection';
import {
  clearGiverQuests,
  clearQuestMessages,
  closeQuestConversation,
  giverQuests,
  questActions,
  questConversation,
  questLog,
  questMessages,
  questString,
  setQuestActions,
  setQuestLog,
} from '../src/ui/questStore';
import {
  questShareActions,
  resetSharedQuests,
  setQuestShareActions,
  sharedQuestOffers,
} from '../src/ui/questShareStore';

const INERT = questActions();
const INERT_SHARE = questShareActions();

const offer = (id: number, name: string, extra: Partial<QuestRecord> = {}): QuestRecord => ({
  id,
  name,
  status: 'available',
  ...extra,
});

function setup(texts: Record<number, string> = {}) {
  const connection = {
    sendQuestList: vi.fn(),
    sendQuestRefreshStatuses: vi.fn(),
    sendQuestDestroy: vi.fn(),
    sendQuestShare: vi.fn(),
    sendQuestShareAnswer: vi.fn(),
    sendQuestAccept: vi.fn(),
    sendQuestComplete: vi.fn(),
  };
  const played: string[] = [];
  const gestures: Array<[number, string]> = [];
  const said: Array<string | null> = [];
  const resources = {
    questText: async (id: number) => texts[id] ?? null,
    itemName: async () => null,
    itemIcon: async () => null,
    itemFacts: async () => null,
  } as unknown as QuestLookups;
  const quests = new Quests(
    connection as unknown as GameConnection,
    resources,
    { play: name => (played.push(String(name)), null) },
    (networkId, clip) => gestures.push([networkId, clip]),
    text => said.push(text),
  );
  quests.installActions();
  return { quests, h: quests.handlers(), connection, played, gestures, said };
}

beforeEach(() => {
  setQuestLog([]);
  clearGiverQuests();
  closeQuestConversation();
  clearQuestMessages();
  resetSharedQuests();
  setQuestActions(INERT);
  setQuestShareActions(INERT_SHARE);
});

describe('a giver’s list', () => {
  it('shows each offer under its resolved title, or its own name while that is unknown', async () => {
    const { quests, h } = setup({ 9001: 'The Long Road' });
    quests.listFrom(5);
    h.onQuestList!(5, [offer(1, 'one', { titleStringId: 9001 }), offer(2, 'two')]);
    expect(giverQuests.value.map(q => q.giverId)).toEqual([5, 5]);
    await vi.waitFor(() => expect(questConversation.value).not.toBeNull());
    expect(questConversation.value).toEqual({
      kind: 'choices',
      giverId: 5,
      choices: [
        { id: 1, name: 'The Long Road', status: 'available' },
        { id: 2, name: 'two', status: 'available' },
      ],
    });
    expect(questString(9001)).toBe('The Long Road');
  });

  it('asks the giver, once, and forgets stale replies from anybody else', () => {
    const { quests, h, connection } = setup();
    quests.listFrom(5);
    expect(connection.sendQuestList).toHaveBeenCalledWith(5, 0);
    h.onQuestList!(6, [offer(1, 'one')]);
    expect(giverQuests.value).toEqual([]);
  });

  it('shows nothing before anyone was asked', () => {
    const { h } = setup();
    h.onQuestList!(5, [offer(1, 'one')]);
    expect(giverQuests.value).toEqual([]);
  });

  it('closes the dialog on an empty list', () => {
    const { quests, h } = setup();
    quests.listFrom(5);
    h.onQuestList!(5, [offer(1, 'one')]);
    h.onQuestList!(5, []);
    expect(giverQuests.value).toEqual([]);
    expect(questConversation.value).toBeNull();
  });

  it('closeDialog forgets whose list is asked, so a late reply is stale', () => {
    const { quests, h } = setup();
    quests.listFrom(5);
    quests.closeDialog();
    h.onQuestList!(5, [offer(1, 'one')]);
    expect(giverQuests.value).toEqual([]);
  });

  it('opens one quest’s page with the action its status calls for', async () => {
    const { h } = setup();
    h.onQuestDetails!(5, offer(1, 'one', { status: 'finished' }));
    await vi.waitFor(() => expect(questConversation.value).not.toBeNull());
    expect(questConversation.value).toMatchObject({ kind: 'quest', giverId: 5, action: 'handIn' });
  });
});

describe('the log', () => {
  it('replaces the log whole', () => {
    const { h } = setup();
    h.onQuestLog!([offer(1, 'one', { status: 'incomplete' })]);
    expect(questLog.value.map(q => q.id)).toEqual([1]);
  });

  it('makes the giver’s gesture when the server confirms an accept, once', () => {
    const { h, gestures } = setup();
    questActions().accept(5, offer(1, 'one'));
    h.onQuestUpdated!({ id: 1, name: 'one', status: 'incomplete' });
    h.onQuestUpdated!({ id: 1, name: 'one', status: 'incomplete' });
    expect(gestures).toEqual([[5, 'emote_salute']]);
  });

  it('asks for the givers’ marks again when a quest becomes ready to hand in', () => {
    const { h, connection } = setup();
    h.onQuestUpdated!({ id: 1, name: 'one', status: 'finished', readyToHandIn: true });
    expect(connection.sendQuestRefreshStatuses).toHaveBeenCalledTimes(1);
    h.onQuestUpdated!({ id: 1, name: 'one', status: 'incomplete' });
    expect(connection.sendQuestRefreshStatuses).toHaveBeenCalledTimes(1);
  });

  it('announces progress only for the counters that moved', () => {
    const { h } = setup({ 500: 'Wolves' });
    const objective = {
      index: 0,
      killed: 0,
      triggered: 0,
      held: 0,
      objectiveItem: 0,
      objectiveItemCount: 0,
      goalCount: 5,
      objectiveStringId: 500,
    };
    h.onQuestLog!([offer(1, 'one', { status: 'incomplete', objectives: [objective] })]);
    h.onQuestUpdated!({ id: 1, name: 'one', status: 'incomplete' });
    expect(questMessages.value).toEqual([]);
    h.onQuestUpdated!({
      id: 1,
      name: 'one',
      status: 'incomplete',
      counters: [{ index: 0, kind: 'killed', count: 2 }],
    });
    expect(questMessages.value.map(m => m.text)).toContain('2/5');
  });

  it('gestures on a hand-in but not on a drop, and takes the row out either way', () => {
    const { h, gestures } = setup();
    h.onQuestLog!([offer(1, 'one', { status: 'finished', slot: 0 }), offer(2, 'two', { slot: 1 })]);
    questActions().handIn(5, offer(1, 'one'));
    questActions().drop(offer(2, 'two', { slot: 1 }));
    h.onQuestRemoved!(1);
    h.onQuestRemoved!(2);
    expect(gestures).toEqual([[5, 'emote_yes']]);
    expect(questLog.value).toEqual([]);
  });
});

describe('sharing', () => {
  it('queues an offer once its title is read', async () => {
    const { h } = setup({ 77: 'Shared Deed' });
    h.onQuestShareOffered!({ questId: 3, titleStringId: 77, sharerName: 'Bran' } as never);
    await vi.waitFor(() => expect(sharedQuestOffers.value).toHaveLength(1));
    expect(questString(77)).toBe('Shared Deed');
  });

  it('says a member’s answer under the title of the quest held, or "the quest"', () => {
    const { h, said } = setup();
    h.onQuestLog!([offer(3, 'Held One', { status: 'incomplete' })]);
    h.onQuestShareResult!({ questId: 3, memberName: 'Bran', result: 'accepted' } as never);
    h.onQuestShareResult!({ questId: 4, memberName: 'Bran', result: 'declined' } as never);
    expect(said).toEqual(['Bran accepted Held One.', 'Bran declined the quest.']);
  });

  it('answers a shared quest through the connection', () => {
    const { connection } = setup();
    questShareActions().answer(3, true);
    expect(connection.sendQuestShareAnswer).toHaveBeenCalledWith(3, true);
  });
});

describe('the buttons', () => {
  it('drops a quest by slot with the cancel sound; without a slot, only the sound', () => {
    const { connection, played } = setup();
    questActions().drop(offer(1, 'one', { slot: 4 }));
    expect(connection.sendQuestDestroy).toHaveBeenCalledWith(4, 1);
    questActions().drop(offer(2, 'two'));
    expect(connection.sendQuestDestroy).toHaveBeenCalledTimes(1);
    expect(played).toEqual(['sfx_ui_quest_cancel', 'sfx_ui_quest_cancel']);
  });

  it('asks for the givers’ marks again after a drop, so its giver offers it', () => {
    const { connection } = setup();
    questActions().drop(offer(1, 'one', { slot: 4 }));
    expect(connection.sendQuestRefreshStatuses).toHaveBeenCalledTimes(1);
    expect(connection.sendQuestDestroy.mock.invocationCallOrder[0]).toBeLessThan(
      connection.sendQuestRefreshStatuses.mock.invocationCallOrder[0]!,
    );
    questActions().drop(offer(2, 'two'));
    expect(connection.sendQuestRefreshStatuses).toHaveBeenCalledTimes(1);
  });

  it('shares and asks about quests by id', () => {
    const { connection, h } = setup();
    questActions().share(offer(1, 'one'));
    expect(connection.sendQuestShare).toHaveBeenCalledWith(1);
    questActions().askAbout(5, 2);
    expect(connection.sendQuestList).toHaveBeenCalledWith(5, 2);
    h.onQuestList!(5, [offer(2, 'two')]);
    expect(giverQuests.value).toHaveLength(1);
  });

  it('takes a quest at once, tracks it, and refreshes the giver’s mark', () => {
    const { connection, played } = setup();
    questActions().accept(5, offer(1, 'one'));
    expect(connection.sendQuestAccept).toHaveBeenCalledWith(5, 1);
    expect(questLog.value).toMatchObject([
      { id: 1, giverId: 5, status: 'incomplete', tracked: true },
    ]);
    expect(played).toEqual(['sfx_ui_quest_accept']);
    expect(connection.sendQuestRefreshStatuses).toHaveBeenCalledTimes(1);
  });

  it('hands a quest in with the chosen reward, defaulting to the first', () => {
    const { connection, played } = setup();
    questActions().handIn(5, offer(1, 'one'));
    questActions().handIn(5, offer(2, 'two'), 2);
    expect(connection.sendQuestComplete.mock.calls).toEqual([
      [5, 1, 0],
      [5, 2, 2],
    ]);
    expect(played).toEqual(['sfx_ui_quest_complete', 'sfx_ui_quest_complete']);
    expect(connection.sendQuestRefreshStatuses).toHaveBeenCalledTimes(2);
  });
});
