/**
 * The mail contract between ubiquitous-server and this client, checked against
 * the wire shapes the server actually sends.
 *
 * The payloads below mirror `WebPayloads.Mail.cs` field for field. If the
 * server's shapes change, update these to match rather than loosening them
 * here.
 */

import { describe, expect, it, vi } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents, MailMessage } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

async function connected(socket: FakeWebSocket, events: ConnectionEvents): Promise<void> {
  const conn = new WebSocketConnection({
    url: 'ws://ubiquitous.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
}

describe('an opened letter as the server describes it', () => {
  it('counts the things it carries, which the message names but does not count', async () => {
    // `mail.message` carries its items and no `itemCount`: the count is the
    // inbox row's. Read as zero, a letter holding only things offered
    // nothing to take.
    const socket = new FakeWebSocket();
    const onMailMessage = vi.fn<(message: MailMessage) => void>();
    await connected(socket, { onMailMessage });

    socket.emit('mail.message', {
      id: 'mail-1',
      senderName: 'Auction House',
      subject: 'Auction won',
      body: 'Your winning bid.',
      gold: 0,
      sentAt: 1790666637,
      goldClaimed: false,
      items: [
        { entry: 5959, count: 1 },
        { entry: 5953, count: 3 },
      ],
      itemsClaimed: false,
    });

    const message = onMailMessage.mock.calls[0]![0];
    expect(message.items).toEqual([
      { entry: 5959, count: 1 },
      { entry: 5953, count: 3 },
    ]);
    expect(message.itemCount).toBe(2);
  });
});
