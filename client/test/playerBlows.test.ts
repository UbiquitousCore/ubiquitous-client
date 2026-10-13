/**
 * A fight between two players, as one of them hears it.
 *
 * Every blow is reported once, by the server session of the player it hit,
 * and reaches both players' screens. This client has to read each report as
 * the same two bodies whichever end of it the player is on: the opponent is
 * the body that spawned under their own wire id, the player is the id the
 * world was entered with, and the health a report carries is the health
 * that body was left on.
 */

import { describe, expect, it } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type { CombatHit, ConnectionEvents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

const SELF = 'player:char-a';
const OPPONENT = 'player:char-b';

interface Heard {
  selfId: number;
  opponentId: number;
  swings: CombatHit[];
  spells: { casterId: number; targetId: number; damage: number; finalHealth?: number }[];
  values: { networkId: number; values: Record<string, number> }[];
  send: (type: string, payload: Record<string, unknown>) => void;
  conn: WebSocketConnection;
  socket: FakeWebSocket;
}

async function inAFight(): Promise<Heard> {
  const socket = new FakeWebSocket();
  const heard: Omit<Heard, 'send' | 'conn' | 'socket'> = {
    selfId: 0,
    opponentId: 0,
    swings: [],
    spells: [],
    values: [],
  };
  const events: ConnectionEvents = {
    onWorldEntered: (_map, _pos, selfId) => {
      heard.selfId = selfId;
    },
    onEntitiesAppeared: bodies => {
      heard.opponentId = bodies[0]!.networkId;
    },
    onSwingResult: hit => heard.swings.push(hit),
    onSpellOutcome: (casterId, targetId, _spellId, _outcome, damage, finalHealth) =>
      heard.spells.push({ casterId, targetId, damage, finalHealth }),
    onEntityValuesChanged: update => heard.values.push(update),
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
  return { ...heard, send: (type, payload) => socket.emit(type, payload), conn, socket } as Heard;
}

describe('a blow between two players', () => {
  it('names the player and the opponent by the ids they arrived under', async () => {
    const fight = await inAFight();
    fight.send('attack.swingResult', {
      attackerId: SELF,
      targetId: OPPONENT,
      outcome: 'hit',
      damage: 12,
      finalHealth: 220,
      hand: 'main',
    });
    fight.send('attack.swingResult', {
      attackerId: OPPONENT,
      targetId: SELF,
      outcome: 'hit',
      damage: 12,
      finalHealth: 210,
      hand: 'main',
    });

    expect(fight.selfId).not.toBe(0);
    expect(fight.opponentId).not.toBe(fight.selfId);
    const [outgoing, incoming] = fight.swings;
    expect(outgoing).toMatchObject({
      attackerId: fight.selfId,
      targetId: fight.opponentId,
      damage: 12,
      finalHealth: 220,
    });
    expect(incoming).toMatchObject({
      attackerId: fight.opponentId,
      targetId: fight.selfId,
      damage: 12,
      finalHealth: 210,
    });
  });

  it('carries the health a spell from the opponent left the player on', async () => {
    const fight = await inAFight();
    fight.send('spell.outcome', {
      casterId: OPPONENT,
      targetId: SELF,
      spellId: 5815,
      result: 'hit',
      damage: 30,
      finalHealth: 190,
    });

    expect(fight.spells).toEqual([
      { casterId: fight.opponentId, targetId: fight.selfId, damage: 30, finalHealth: 190 },
    ]);
  });

  it('moves the opponent’s own health on the same body the blows landed on', async () => {
    const fight = await inAFight();
    fight.send('entity.updated', { networkId: OPPONENT, changed: { health: 220, maxHealth: 250 } });

    expect(fight.values).toEqual([
      { networkId: fight.opponentId, values: { health: 220, maxHealth: 250 } },
    ]);
  });

  it('casts at the opponent by their wire id', async () => {
    const fight = await inAFight();
    fight.conn.sendCastSpell(5815, fight.opponentId);

    expect(fight.socket.ofType('spell.request')[0]!.payload).toEqual({
      spellId: 5815,
      targetId: OPPONENT,
    });
  });
});
