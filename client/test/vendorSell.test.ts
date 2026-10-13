/**
 * Selling a bag stack to a vendor, as the wire carries it.
 *
 * The payload asserted here is the one `VendorSellTests` on the server
 * sends into a session: the vendor by the id it arrived under, the slot
 * the stack sits in, and the stack's own id. No count, because the whole
 * stack goes.
 */

import { describe, expect, it, vi } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents } from '../src/net/GameConnection';
import { itemErrorMessage, itemResultOk } from '../src/net/itemErrors';
import { FakeWebSocket } from './helpers/fakeWebSocket';

const VENDOR = 'Creature:1';

async function beforeAVendor(events: ConnectionEvents) {
  const socket = new FakeWebSocket();
  let vendorId = 0;
  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect({
    ...events,
    onEntitiesAppeared: bodies => {
      vendorId = bodies[0]!.networkId;
    },
  });
  socket.accept();
  await connecting;
  socket.emit('world.entered', { map: 1, pos: { x: 0, y: 0, z: 0 }, self: 'player:char-a' });
  socket.emit('entity.spawned', {
    networkId: VENDOR,
    kind: 'creature',
    entry: 9000,
    position: { x: 1, y: 0, z: 0 },
    yaw: 0,
  });
  return { socket, conn, vendorId };
}

describe('selling to a vendor', () => {
  it('names the vendor, the slot and the stack, and no count', async () => {
    const { socket, conn, vendorId } = await beforeAVendor({});
    expect(vendorId).not.toBe(0);

    conn.sendVendorSell(vendorId, { area: 'bag', index: 1 }, 'starter-item-1');

    const sent = socket.sent.at(-1)!;
    expect(sent.type).toBe('npc.vendorSell');
    expect(sent.payload).toEqual({
      networkId: VENDOR,
      from: { area: 'bag', index: 1 },
      itemId: 'starter-item-1',
    });
  });

  it('hears a refusal by its code, and has a sentence for it', async () => {
    const onVendorSellResult = vi.fn();
    const { socket } = await beforeAVendor({ onVendorSellResult });

    socket.emit('npc.sellResult', { code: 'cantSell' });
    socket.emit('npc.sellResult', { code: 'ok' });

    expect(onVendorSellResult.mock.calls).toEqual([['cantSell'], ['ok']]);
    expect(itemResultOk('cantSell')).toBe(false);
    expect(itemErrorMessage('cantSell')).toBe('No vendor will buy that.');
  });
});
