/**
 * An emote names whom it was aimed at, both ways: the player's emote carries
 * their selected target, and an emote seen arrives with its target, so the
 * log can say who it was for.
 */

import { describe, expect, it } from 'vitest';

import type { ConnectionEvents } from '../src/net/GameConnection';
import { WebSocketConnection } from '../src/net/WebSocketConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

const SELF = 'player:char-a';
const OTHER = 'player:char-b';

interface Seen {
  networkId: number;
  name: string;
  targetNetworkId: number | undefined;
}

async function inTheWorld() {
  const socket = new FakeWebSocket();
  const seen: Seen[] = [];
  let selfId = 0;
  let otherId = 0;
  const events: ConnectionEvents = {
    onWorldEntered: (_map, _pos, id) => {
      selfId = id;
    },
    onEntitiesAppeared: bodies => {
      otherId = bodies[0]!.networkId;
    },
    onEmotePerformed: (networkId, _animationId, name, targetNetworkId) =>
      seen.push({ networkId, name, targetNetworkId }),
  };
  const conn = new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
  socket.emit('world.entered', { map: 1, pos: { x: 0, y: 0, z: 0 }, self: SELF });
  socket.emit('entity.spawned', {
    networkId: OTHER,
    kind: 'player',
    entry: 0,
    position: { x: 1, y: 0, z: 0 },
    yaw: 0,
  });
  return { socket, conn, seen, selfId: () => selfId, otherId: () => otherId };
}

describe('emotes on the wire', () => {
  it('sends the selected target with the emote', async () => {
    const world = await inTheWorld();
    world.conn.sendEmote('wave', world.otherId());
    expect(world.socket.ofType('player.emote').at(-1)?.payload).toEqual({
      name: 'wave',
      targetId: OTHER,
    });
  });

  it('sends no target with nobody selected', async () => {
    const world = await inTheWorld();
    world.conn.sendEmote('wave', undefined);
    expect(world.socket.ofType('player.emote').at(-1)?.payload).toEqual({ name: 'wave' });
  });

  it('reads whom an emote it sees was aimed at', async () => {
    const world = await inTheWorld();
    world.socket.emit('emote.performed', {
      networkId: OTHER,
      id: 141,
      name: 'wave',
      targetId: SELF,
    });
    world.socket.emit('emote.performed', { networkId: OTHER, id: 141, name: 'wave' });
    expect(world.seen).toEqual([
      { networkId: world.otherId(), name: 'wave', targetNetworkId: world.selfId() },
      { networkId: world.otherId(), name: 'wave', targetNetworkId: undefined },
    ]);
  });
});
