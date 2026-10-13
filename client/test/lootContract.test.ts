/**
 * The loot contract between the server and this client, checked against the
 * server's own bytes: the `loot.contents` entry of
 * `fixtures/sessionMessagesFromServer.json`, which the server writes from its
 * payload records (see `sessionContract.test.ts`). A row carries its slot,
 * item id, entry and count and nothing else; what the item is called and how
 * rare it is come from the user's own item table, by entry.
 */

import { describe, expect, it } from 'vitest';

import session from './fixtures/sessionMessagesFromServer.json';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents, LootContents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

async function received(): Promise<LootContents | null> {
  const socket = new FakeWebSocket();
  let contents: LootContents | null = null;
  const events: ConnectionEvents = {
    onLootContents: value => {
      contents = value;
    },
  };

  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;

  socket.emit('loot.contents', session['loot.contents'] as unknown as Record<string, unknown>);
  return contents;
}

describe('a body exactly as the server describes it', () => {
  it('is accepted, not dropped', async () => {
    // Null here means the message was rejected and logged away, which from
    // the outside is a body that opens onto nothing.
    expect(await received()).not.toBeNull();
  });

  it('keeps the coin, which is half of what a body is worth', async () => {
    expect((await received())!.money).toBe(1234);
  });

  it('keeps every row, and the slot each one must be taken by', async () => {
    const rows = (await received())!.items;
    expect(rows).toHaveLength(2);
    // The slot is the row's own, not its position in this array — the two
    // agree here only because nothing was filtered out of this body.
    expect(rows[0]).toMatchObject({ slot: 0, entry: 90001, count: 3 });
    expect(rows[1]).toMatchObject({ slot: 1, entry: 90002, count: 1 });
  });

  it('keeps the item id, so two of the same entry stay two rows', async () => {
    const rows = (await received())!.items;
    expect(rows[0]!.itemId).not.toBe('');
    expect(rows[0]!.itemId).not.toBe(rows[1]!.itemId);
  });
});
