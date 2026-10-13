/**
 * A refused loot tells the player why: the client half.
 *
 * This reader is the only thing standing between a refused loot and
 * silence, so it is pinned here.
 *
 * What the client does with the code is report it, and only report it: the
 * error banner — the same one a refused cast and the combat edges already
 * use here. No dialog: there is nothing to acknowledge, and a modal over
 * the body you are still looting is in the way of the retry.
 * `Game.onItemError` composes exactly the two calls below.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';
import { itemErrorMessage } from '../src/net/itemErrors';
import { REPEAT_WINDOW, banner, reportToPlayer } from '../src/gameplay/SpellBook';

/** The full-bag code. */
const BAG_FULL = 'inventoryFull';

async function codesFrom(...payloads: Array<Record<string, unknown>>): Promise<string[]> {
  const socket = new FakeWebSocket();
  const seen: string[] = [];
  const events: ConnectionEvents = {
    onItemError: code => {
      seen.push(code);
    },
  };
  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
  for (const payload of payloads) socket.emit('item.refused', payload);
  return seen;
}

let clock = 0;

beforeEach(() => {
  banner.value = null;
  clock += REPEAT_WINDOW * 10;
});

describe('item.refused off the wire', () => {
  it('reaches the client with the code intact', async () => {
    expect(await codesFrom({ code: BAG_FULL })).toEqual([BAG_FULL]);
  });

  it('is not read as a success just because the code is nonzero', async () => {
    expect(itemErrorMessage(BAG_FULL)).not.toBe('Done.');
  });

  it('drops a payload with no code rather than reporting error zero', async () => {
    expect(await codesFrom({})).toEqual([]);
  });
});

describe('what the player is told', () => {
  it('puts the bag-full words on the error banner', () => {
    reportToPlayer(itemErrorMessage(BAG_FULL), clock);

    expect(banner.value?.text).toBe('Your bags are full.');
  });

  it('names an unknown code rather than showing nothing', () => {
    reportToPlayer(itemErrorMessage('somethingNew'), clock);

    expect(banner.value?.text).toContain('somethingNew');
  });
});
