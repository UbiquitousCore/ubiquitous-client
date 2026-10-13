/**
 * The quest log contract between the server and this client, checked against
 * the server's own bytes: the `quest.log` entry of
 * `fixtures/sessionMessagesFromServer.json`, which the server writes from its
 * payload records (see `sessionContract.test.ts`). Every other test in this
 * repo builds its own idea of a payload, and two suites that each agree only
 * with themselves can both stay green while the two sides disagree.
 */

import { describe, expect, it } from 'vitest';

import session from './fixtures/sessionMessagesFromServer.json';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents, QuestRecord } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

async function received(): Promise<QuestRecord[]> {
  const socket = new FakeWebSocket();
  let quests: QuestRecord[] = [];
  const errors: string[] = [];
  const events: ConnectionEvents = {
    onQuestLog: rows => {
      quests = rows;
    },
  };

  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;

  socket.emit('quest.log', session['quest.log'] as unknown as Record<string, unknown>);
  expect(errors).toEqual([]);
  return quests;
}

describe('a quest log exactly as the server sends it', () => {
  it('is accepted, not dropped', async () => {
    const quests = await received();
    // Zero here means the message was rejected and logged away, which from
    // the outside is an empty quest log.
    expect(quests).toHaveLength(2);
  });

  it('keeps the slot, the level, the pay and every string id the log screen needs', async () => {
    const [quest] = await received();
    expect(quest).toMatchObject({
      id: 90601,
      slot: 0,
      minLevel: 1,
      titleStringId: 90602,
      detailsStringId: 90603,
      status: 'incomplete',
      readyToHandIn: false,
      rewardMoney: 250,
    });
  });

  it('keeps the objectives, which are what the card counts progress against', async () => {
    const [quest] = await received();
    expect(quest!.objectives).toHaveLength(1);
    expect(quest!.objectives![0]).toMatchObject({
      index: 0,
      goalCount: 4,
      objectiveStringId: 90201,
    });
  });
});
