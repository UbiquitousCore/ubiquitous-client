/**
 * A duel, as one of its two players hears the spells and the ending.
 *
 * The chill an opponent's damage spell carries is reported by the victim's
 * own server session, naming the opponent as its caster; the player who
 * loses begs, and that emote reaches every screen that can see them,
 * their own included. This client has to read both as the right two bodies
 * whichever end of them the player is on.
 */

import { describe, expect, it } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { ConnectionEvents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

const SELF = 'player:char-a';
const OPPONENT = 'player:char-b';

interface Heard {
  selfId: number;
  opponentId: number;
  auras: { unitId: number; casterId: number; spellId: number; harmful: number }[];
  emotes: { networkId: number; animationId: number }[];
  ended: string[];
  socket: FakeWebSocket;
  conn: WebSocketConnection;
}

async function inADuel(): Promise<Heard> {
  const socket = new FakeWebSocket();
  const heard = { selfId: 0, opponentId: 0, auras: [], emotes: [], ended: [] } as unknown as Heard;
  const events: ConnectionEvents = {
    onWorldEntered: (_map, _pos, selfId) => {
      heard.selfId = selfId;
    },
    onEntitiesAppeared: bodies => {
      heard.opponentId = bodies[0]!.networkId;
    },
    onAuraApplied: (unitId, casterId, spellId, _remaining, _max, harmful) =>
      heard.auras.push({ unitId, casterId, spellId, harmful }),
    onEmotePerformed: (networkId, animationId) => heard.emotes.push({ networkId, animationId }),
    onDuelEnded: (_opponentId, reason) => heard.ended.push(reason),
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
    networkId: OPPONENT,
    kind: 'player',
    entry: 0,
    position: { x: 1, y: 0, z: 0 },
    yaw: 0,
  });
  return Object.assign(heard, { socket, conn });
}

const aura = (unitId: string, casterId: string) => ({
  unitId,
  casterId,
  spellId: 5121,
  remaining: 5000,
  maxDuration: 5000,
  harmful: 1,
});

describe('spells in a duel', () => {
  it("puts the opponent's chill on the player, cast by the opponent", async () => {
    const duel = await inADuel();
    duel.socket.emit('aura.applied', aura(SELF, OPPONENT));
    expect(duel.auras).toEqual([
      { unitId: duel.selfId, casterId: duel.opponentId, spellId: 5121, harmful: 1 },
    ]);
  });

  it("puts the player's chill on the opponent, cast by the player", async () => {
    const duel = await inADuel();
    duel.socket.emit('aura.applied', aura(OPPONENT, SELF));
    expect(duel.auras).toEqual([
      { unitId: duel.opponentId, casterId: duel.selfId, spellId: 5121, harmful: 1 },
    ]);
  });

  it('asks for a spell with nobody selected with an empty target, for the server to land on the caster', async () => {
    const duel = await inADuel();
    duel.conn.sendCastSpell(5118, 0);
    const cast = duel.socket.sent.find(message => message.type === 'spell.request');
    expect(cast?.payload).toEqual({ spellId: 5118, targetId: '' });
  });
});

describe('the end of a duel', () => {
  it('plays the loser begging on their own body when the player loses', async () => {
    const duel = await inADuel();
    duel.socket.emit('duel.ended', {
      opponentId: OPPONENT,
      reason: 'lost',
      health: 10,
      maxHealth: 200,
    });
    duel.socket.emit('emote.performed', { networkId: SELF, id: 7, name: 'beg' });
    expect(duel.ended).toEqual(['lost']);
    expect(duel.emotes).toEqual([{ networkId: duel.selfId, animationId: 7 }]);
  });

  it("plays it on the opponent's body when the opponent loses", async () => {
    const duel = await inADuel();
    duel.socket.emit('duel.ended', {
      opponentId: OPPONENT,
      reason: 'won',
      health: 150,
      maxHealth: 200,
    });
    duel.socket.emit('emote.performed', { networkId: OPPONENT, id: 7, name: 'beg' });
    expect(duel.emotes).toEqual([{ networkId: duel.opponentId, animationId: 7 }]);
  });
});
