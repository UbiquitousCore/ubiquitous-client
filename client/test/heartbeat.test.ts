/**
 * The sign of life a quiet connection sends.
 *
 * The server closes a connection that has sent nothing for a minute.
 * That is right for a client that has gone away and wrong for a player
 * reading a screen: signing in, picking a character and making one are
 * minutes of thinking and no traffic at all, and without a sign of life the
 * socket is shut from under them halfway through choosing a race.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function connected(): { socket: FakeWebSocket; connection: WebSocketConnection } {
  const socket = new FakeWebSocket();
  const connection = new WebSocketConnection({
    url: 'ws://test',
    createSocket: () => socket,
  });
  void connection.connect({});
  socket.accept();
  return { socket, connection };
}

describe('a quiet connection', () => {
  it('says it is alive without being asked to', () => {
    const { socket } = connected();
    socket.sent.length = 0;

    vi.advanceTimersByTime(60_000);

    const beats = socket.sent.filter(message => message.type === 'session.ping');
    expect(beats.length, 'a beat well inside the minute the server allows').toBeGreaterThan(1);
  });

  it('stops the moment the connection does', () => {
    const { socket, connection } = connected();
    connection.disconnect();
    socket.sent.length = 0;

    vi.advanceTimersByTime(60_000);

    expect(socket.sent).toHaveLength(0);
  });

  it('is not troubled by the answer', () => {
    const { socket } = connected();

    expect(() =>
      socket.deliver(JSON.stringify({ type: 'session.pong', sequence: 1, payload: {} })),
    ).not.toThrow();
  });
});
