/**
 * A scripted server speaking named messages, for testing without a socket:
 *
 *     const socket = new FakeWebSocket();
 *     const conn = new WebSocketConnection({ url: 'ws://x', createSocket: () => socket });
 *     const connecting = conn.connect(events);
 *     socket.accept();
 *     await connecting;
 *     socket.emit('entity.moved', { networkId: 'a', position: {x:1,y:2,z:3}, yaw: 0 });
 */

import type { WebSocketLike } from '../../src/net/WebSocketConnection';

const CONNECTING = 0;
const OPEN = 1;
const CLOSED = 3;

export interface SentMessage {
  type: string;
  sequence: number;
  payload: Record<string, unknown>;
}

export class FakeWebSocket implements WebSocketLike {
  readyState: number = CONNECTING;

  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  /** Everything the client has sent, parsed. */
  readonly sent: SentMessage[] = [];
  /** Everything the client has sent, as raw text. */
  readonly sentRaw: string[] = [];

  closedByClient = false;
  closeCalls = 0;

  // -- the client's side of the interface ----------------------------------

  send(data: string): void {
    if (this.readyState !== OPEN) throw new Error('send() on a socket that is not open');
    this.sentRaw.push(data);
    this.sent.push(JSON.parse(data) as SentMessage);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls++;
    if (this.readyState === CLOSED) return;
    this.closedByClient = true;
    this.readyState = CLOSED;
    this.onclose?.({
      ...(code !== undefined ? { code } : {}),
      ...(reason !== undefined ? { reason } : {}),
    });
  }

  // -- the script's side ---------------------------------------------------

  /** Complete the handshake. */
  accept(): void {
    this.readyState = OPEN;
    this.onopen?.({});
  }

  /** Fail the handshake the way a browser does: an error, then a close. */
  refuse(reason = 'connection refused'): void {
    this.readyState = CLOSED;
    this.onerror?.({});
    this.onclose?.({ code: 1006, reason });
  }

  /** Send a well-formed envelope, with the sequence managed for you. */
  emit(type: string, payload: Record<string, unknown> = {}): void {
    this.emitEnvelope({ type, sequence: this.nextSequence++, payload });
  }

  /** Send an envelope with an exact sequence, to test ordering behaviour. */
  emitEnvelope(envelope: SentMessage): void {
    this.deliver(JSON.stringify(envelope));
  }

  /** Send arbitrary bytes or text, to test the malformed paths. */
  deliver(data: unknown): void {
    if (this.readyState !== OPEN) throw new Error('deliver() on a socket that is not open');
    this.onmessage?.({ data });
  }

  /** Close from the server end, as a dropped connection would. */
  dropWith(code = 1006, reason = 'socket dropped'): void {
    this.readyState = CLOSED;
    this.onclose?.({ code, reason });
  }

  /** Messages of one type, in order. */
  ofType(type: string): SentMessage[] {
    return this.sent.filter(message => message.type === type);
  }

  private nextSequence = 0;
}
