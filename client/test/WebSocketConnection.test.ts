/**
 * WebSocketConnection — the client's one transport, driven entirely by a
 * scripted fake server (see helpers/fakeWebSocket.ts).
 *
 * What these tests are really pinning:
 *
 *  - the client speaks NAMES, never opcodes or bytes;
 *  - server state maps onto the events `World` already consumes;
 *  - no appearance data is expected from, or read out of, a message;
 *  - a malformed or unknown message degrades instead of taking the client down.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import { EntityMovementState } from '../src/net/GameConnection';
import type { ConnectionEvents } from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

/** Every event, spied, so a test can assert on any of them. */
function spyEvents() {
  return {
    onConnected: vi.fn(),
    onCharactersReturned: vi.fn(),
    onDungeonsRestarted: vi.fn(),
    onDungeonModeChosen: vi.fn(),
    onQuestShareOffered: vi.fn(),
    onQuestShareResult: vi.fn(),
    onSummonOpened: vi.fn(),
    onSummonAsked: vi.fn(),
    onSummonResult: vi.fn(),
    onSummonTooLow: vi.fn(),
    onWhoList: vi.fn(),
    onDisconnected: vi.fn(),
    onEntitiesAppeared: vi.fn(),
    onEntitiesMoved: vi.fn(),
    onEntitiesRemoved: vi.fn(),
    onPlayerPositionCorrected: vi.fn(),
    onChat: vi.fn(),
    onWhisperReceived: vi.fn(),
    onWhisperSent: vi.fn(),
    onReportAcknowledged: vi.fn(),
    onLoginResult: vi.fn(),
    onCharacters: vi.fn(),
    onCharacterChosen: vi.fn(),
    onWorldEntered: vi.fn(),
    onWorldLoading: vi.fn(),
    onTargetChanged: vi.fn(),
    onSpellCasting: vi.fn(),
    onSpellReleased: vi.fn(),
    onCooldownStarted: vi.fn(),
    onSwingResult: vi.fn(),
    onShotResult: vi.fn(),
    onAttackRangeStart: vi.fn(),
    onShotFired: vi.fn(),
    onSpellOutcome: vi.fn(),
    onQuestStatuses: vi.fn(),
    onQuestList: vi.fn(),
    onQuestLog: vi.fn(),
    onQuestUpdated: vi.fn(),
    onQuestDetails: vi.fn(),
    onQuestRemoved: vi.fn(),
    onUnitDied: vi.fn(),
    onPlayerRevived: vi.fn(),
  } satisfies ConnectionEvents;
}

let socket: FakeWebSocket;
let events: ReturnType<typeof spyEvents>;

function connection(characterRef?: string) {
  return new WebSocketConnection({
    url: 'ws://server.invalid:7020',
    ...(characterRef !== undefined ? { characterRef } : {}),
    createSocket: () => socket,
  });
}

/** Connect and settle, the way every test below starts. */
async function connected(characterRef?: string) {
  const conn = connection(characterRef);
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
  return conn;
}

beforeEach(() => {
  socket = new FakeWebSocket();
  events = spyEvents();
});

describe('connecting', () => {
  it('resolves and reports connected once the socket opens', async () => {
    const conn = connection();
    const connecting = conn.connect(events);

    expect(conn.connected).toBe(false); // still handshaking

    socket.accept();
    await connecting;

    expect(conn.connected).toBe(true);
    expect(events.onConnected).toHaveBeenCalledOnce();
  });

  it('asks to enter the world when given a character', async () => {
    await connected('Bramblefoot');

    expect(socket.ofType('dev.enterWorld')).toEqual([
      { type: 'dev.enterWorld', sequence: 0, payload: { characterRef: 'Bramblefoot' } },
    ]);
  });

  it('sends nothing on connect without a character', async () => {
    await connected();
    expect(socket.sent).toEqual([]);
  });

  it('rejects when the connection is refused', async () => {
    const conn = connection();
    const connecting = conn.connect(events);

    socket.refuse('nothing listening');

    await expect(connecting).rejects.toThrow(/could not connect/);
    expect(conn.connected).toBe(false);
    // A connection that never opened did not then "disconnect".
    expect(events.onDisconnected).not.toHaveBeenCalled();
  });

  it('refuses a second concurrent connect', async () => {
    const conn = await connected();
    await expect(conn.connect(events)).rejects.toThrow(/already connected/);
  });
});

describe('disconnecting', () => {
  it('reports a dropped connection with its reason', async () => {
    const conn = await connected();

    socket.dropWith(1006, 'socket dropped');

    expect(events.onDisconnected).toHaveBeenCalledWith('socket dropped');
    expect(conn.connected).toBe(false);
  });

  it('does not report a disconnect the caller asked for', async () => {
    const conn = await connected();

    conn.disconnect();

    expect(socket.closeCalls).toBe(1);
    expect(conn.connected).toBe(false);
    expect(events.onDisconnected).not.toHaveBeenCalled();
  });

  it('is safe to disconnect twice', async () => {
    const conn = await connected();
    conn.disconnect();
    expect(() => conn.disconnect()).not.toThrow();
  });

  it('describes a close that carries no reason', async () => {
    await connected();
    socket.dropWith(1001, '');
    expect(events.onDisconnected).toHaveBeenCalledWith('closed (1001)');
  });
});

describe('sending', () => {
  it('serialises a position as player.move', async () => {
    const conn = await connected();

    conn.sendPlayerPosition([123.45, 67.89, 10.25], 1.57);

    expect(socket.ofType('player.move')[0]).toEqual({
      type: 'player.move',
      sequence: 0,
      // `moving` is always explicit. The server keeps a moving flag per player
      // and nothing downstream can infer a stop without guessing. `state` says
      // which movement state this is, and defaults to the one
      // `moving` already implied.
      payload: { x: 123.45, y: 67.89, z: 10.25, yaw: 1.57, moving: true, state: 'walking' },
    });
  });

  it('sends moving:false when the caller says the player stopped', async () => {
    const conn = await connected();

    conn.sendPlayerPosition([1, 2, 3], 0, false);

    expect(socket.ofType('player.move')[0]!.payload.moving).toBe(false);
    expect(socket.ofType('player.move')[0]!.payload.state).toBe('standing');
  });

  it('sends the posture the caller named, not one inferred from moving', async () => {
    const conn = await connected();

    conn.sendPlayerPosition([1, 2, 3], 0, true, EntityMovementState.Jumping);

    expect(socket.ofType('player.move')[0]!.payload.state).toBe('jumping');
  });

  it('serialises chat', async () => {
    const conn = await connected();

    conn.sendChat('say', 'hello world');

    expect(socket.ofType('player.chat')[0]!.payload).toEqual({
      channel: 'say',
      text: 'hello world',
    });
  });

  it('addresses a whisper by wire id, the way trade and duel already do', async () => {
    const conn = await connected();
    socket.emit('entity.spawned', {
      networkId: '2:000000c8',
      kind: 'player',
      entry: 0,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
    const localId = events.onEntitiesAppeared.mock.calls[0]![0][0]!.networkId;

    conn.sendWhisper(localId, 'hello there');

    // `targetId`, not `networkId` — see `OUTBOUND.whisper`'s own note.
    expect(socket.ofType('chat.whisper')[0]!.payload).toEqual({
      targetId: '2:000000c8',
      text: 'hello there',
    });
  });

  it('sends no whisper at all for a local id the registry has never seen', async () => {
    const conn = await connected();

    conn.sendWhisper(9999, 'hello');

    expect(socket.ofType('chat.whisper')).toEqual([]);
  });

  it('addresses a report by wire id, the way whisper, trade and duel already do', async () => {
    const conn = await connected();
    socket.emit('entity.spawned', {
      networkId: '2:000000c8',
      kind: 'player',
      entry: 0,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
    const localId = events.onEntitiesAppeared.mock.calls[0]![0][0]!.networkId;

    conn.sendReportPlayer(localId, 'spamming trade chat');

    expect(socket.ofType('social.report')[0]!.payload).toEqual({
      targetId: '2:000000c8',
      reason: 'spamming trade chat',
    });
  });

  it('sends no report at all for a local id the registry has never seen', async () => {
    const conn = await connected();

    conn.sendReportPlayer(9999, 'spamming trade chat');

    expect(socket.ofType('social.report')).toEqual([]);
  });

  it('numbers outbound messages monotonically from zero', async () => {
    const conn = await connected();

    conn.sendPlayerPosition([0, 0, 0], 0);
    conn.sendChat('say', 'a');
    conn.sendPlayerPosition([1, 1, 1], 1);

    expect(socket.sent.map(m => m.sequence)).toEqual([0, 1, 2]);
  });

  it('drops sends when not connected rather than throwing', async () => {
    const conn = await connected();
    socket.dropWith();

    expect(() => conn.sendPlayerPosition([1, 2, 3], 0)).not.toThrow();
    expect(socket.ofType('player.move')).toEqual([]);
  });

  it('never puts an asset reference on the wire', async () => {
    const conn = await connected('Bramblefoot');
    conn.sendPlayerPosition([1, 2, 3], 0.5);
    conn.sendChat('say', 'hi');

    // The rule: state, never appearance. Nothing the client sends may name a
    // model, texture, or file of any kind.
    const wire = socket.sentRaw.join('\n');
    expect(wire).not.toMatch(/\.bdae|\.tga|model|texture|mesh|\.bin/i);
  });

  it('saves a slot as the three keys the server reads, the shortcut bar after the primary', async () => {
    const conn = await connected();
    conn.sendActionSlot({ bar: 'shortcut', slot: 1, id: 133, type: 0 });
    expect(socket.sent.at(-1)).toMatchObject({ type: 'actionBar.assign' });
    expect(socket.sent.at(-1)!.payload).toEqual({ slot: 7, id: 133, type: 0 });
  });
});

describe('getting into the world', () => {
  it('sends credentials exactly as given', async () => {
    const conn = await connected();

    conn.login('tester', 'NOT-A-HASH');

    expect(socket.ofType('account.login')[0]!.payload).toEqual({
      userId: 'tester',
      passHash: 'NOT-A-HASH',
    });
  });

  it('reports the login result, with the reason when the server names it', async () => {
    await connected();

    // The server says `ok` outright, so the client never has to know which
    // codes mean success.
    socket.emit('account.loginResult', {
      ok: false,
      code: 7,
      reason: 'Sample refusal: wrong password.',
    });

    expect(events.onLoginResult).toHaveBeenCalledWith(false, 7, 'Sample refusal: wrong password.');
  });

  it('reports a login result that carries no reason', async () => {
    await connected();
    socket.emit('account.loginResult', { ok: true, code: 3 });
    expect(events.onLoginResult).toHaveBeenCalledWith(true, 3, undefined);
  });

  it('asks to leave the world for the character list, and hears that it has', async () => {
    const conn = await connected();
    conn.returnToCharacterList();
    expect(socket.ofType('characters.return')).toHaveLength(1);

    socket.emit('characters.returned', {});
    expect(events.onCharactersReturned).toHaveBeenCalledTimes(1);
  });

  it('asks to reset the dungeons, and reads how many copies ended', async () => {
    const conn = await connected();
    conn.sendDungeonRestart();
    expect(socket.ofType('dungeon.restart')).toHaveLength(1);

    socket.emit('dungeon.restarted', { count: 2 });
    expect(events.onDungeonsRestarted).toHaveBeenCalledWith(2);
  });

  it('asks for a dungeon mode, and reads the mode the server confirms', async () => {
    const conn = await connected();
    conn.sendDungeonChooseMode('legend');
    expect(socket.ofType('dungeon.chooseMode')).toHaveLength(1);
    expect(socket.ofType('dungeon.chooseMode')[0]).toMatchObject({ payload: { mode: 'legend' } });

    socket.emit('dungeon.modeChosen', { mode: 'legend', count: 1 });
    expect(events.onDungeonModeChosen).toHaveBeenCalledWith('legend', 1);
  });

  it('requests the character list', async () => {
    const conn = await connected();
    conn.listCharacters();
    expect(socket.ofType('characters.list')).toHaveLength(1);
  });

  it('reads a character list of identity and numbers only', async () => {
    await connected();

    socket.emit('characters.listed', {
      characters: [
        {
          guid: '00000000000000c8',
          name: 'Bramblefoot',
          level: 42,
          gender: 1,
          race: 3,
          class: 4,
          displayInfoId: 555,
          appearance: { skin: 1, hairStyle: 2, hairColour: 3, face: 4 },
          mapId: 31,
          position: { x: 1, y: 2, z: 3 },
          equipment: [0, 0, 777],
        },
      ],
    });

    expect(events.onCharacters).toHaveBeenCalledOnce();
    const [list] = events.onCharacters.mock.calls[0]!;
    expect(list[0]!.name).toBe('Bramblefoot');
    expect(list[0]!.position).toEqual([1, 2, 3]);
    expect(list[0]!.displayInfoId).toBe(555);
    // Appearance is resolved locally from these numbers; no path ever crosses.
    expect(JSON.stringify(list)).not.toMatch(/\.bdae|\.tga|model|texture/i);
  });

  it('takes the races a server says it opened with, and nothing where it says nothing', async () => {
    // A build ships rows and art for races it was never opened with, so
    // which of them may be played is the server's to say.
    await connected();
    socket.emit('characters.listed', { characters: [], races: [0, 1, 2, 3] });
    expect(events.onCharacters.mock.calls.at(-1)![1]).toEqual([0, 1, 2, 3]);

    socket.emit('characters.listed', { characters: [] });
    expect(events.onCharacters.mock.calls.at(-1)![1]).toBeNull();
  });

  it('survives a character list with a missing field', async () => {
    await connected();
    expect(() => socket.emit('characters.listed', { characters: [{ name: 'x' }] })).not.toThrow();
    expect(events.onCharacters).not.toHaveBeenCalled();
  });

  it('chooses a character by name', async () => {
    const conn = await connected();
    conn.chooseCharacter('Bramblefoot');
    expect(socket.ofType('characters.choose')[0]!.payload).toEqual({ name: 'Bramblefoot' });
  });

  it('reports a refused character selection', async () => {
    // In practice this message only arrives on failure - the server's success
    // path sends nothing and the next thing heard is entering the world.
    await connected();

    socket.emit('characters.chosen', {
      ok: false,
      code: 9,
      reason: 'Sample refusal: no such character.',
    });

    expect(events.onCharacterChosen).toHaveBeenCalledWith(
      false,
      9,
      'Sample refusal: no such character.',
    );
  });

  it('reports the map being loaded, which is every change of map', async () => {
    /*
     * Said for every change of map, not only at login -- a town gate, a
     * dungeon mouth, a teleport across maps. Ignoring it leaves the old zone
     * on screen while the server despawns everyone in it.
     */
    await connected();

    socket.emit('world.loading', { map: 31, pos: { x: 612.4, y: 8.05, z: -230.1 } });

    expect(events.onWorldLoading).toHaveBeenCalledWith(31, [612.4, 8.05, -230.1]);
  });
});

describe('receiving world state', () => {
  it('reports entering the world with its map and position', async () => {
    await connected();

    socket.emit('world.entered', { map: 31, pos: { x: 612.4, y: 8.05, z: -230.1 } });

    // A distinct event from a correction: arriving somewhere is not being told
    // you were wrong about where you were, and only this one carries a map.
    // A server that names no body for the player reports zero, not a guess.
    // Nor does it say the hero wears anything it was not told of.
    expect(events.onWorldEntered).toHaveBeenCalledWith(31, [612.4, 8.05, -230.1], 0, []);
    expect(events.onPlayerPositionCorrected).not.toHaveBeenCalled();
  });

  it('reports the player their own body id when the server names one', async () => {
    await connected();

    socket.emit('world.entered', {
      map: 31,
      pos: { x: 0, y: 0, z: 0 },
      self: '00000000000000c8',
    });

    // The whole point of the field: combat messages name the player by this
    // id, and without it none of them can be recognised as the player's own.
    const [, , self] = events.onWorldEntered.mock.calls[0]!;
    expect(self).toBeGreaterThan(0);

    // The same id, seen again on any other message, resolves to the same
    // number - which is what lets `attack.swingResult` be matched against it.
    socket.emit('target.changed', { networkId: '00000000000000c8' });
    expect(events.onTargetChanged).toHaveBeenCalledWith(self);
  });

  it('reads what a spawned body already wears, naming its caster by the id it has everywhere else', async () => {
    await connected();

    socket.emit('entity.spawned', {
      networkId: 'Creature:40',
      entry: 9000,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      auras: [
        {
          casterId: 'player:a',
          spellId: 7401,
          remaining: 6500,
          maxDuration: 10000,
          harmful: 1,
        },
      ],
    });
    socket.emit('target.changed', { networkId: 'player:a' });

    const snapshot = events.onEntitiesAppeared.mock.calls[0]![0][0]!;
    const caster = events.onTargetChanged.mock.calls[0]![0];
    expect(snapshot.auras).toEqual([
      {
        casterId: caster,
        spellId: 7401,
        remaining: 6500,
        maxDuration: 10000,
        harmful: 1,
      },
    ]);
  });

  it('carries no aura list on a spawned body that wears nothing', async () => {
    await connected();

    socket.emit('entity.spawned', {
      networkId: 'Creature:50',
      entry: 9000,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
    socket.emit('entity.spawned', {
      networkId: 'Creature:42',
      entry: 9000,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      auras: [],
    });

    for (const [[snapshot]] of events.onEntitiesAppeared.mock.calls)
      expect(snapshot).not.toHaveProperty('auras');
  });

  it('reads what the hero wears as it arrives in a world', async () => {
    await connected();

    socket.emit('world.entered', {
      map: 31,
      pos: { x: 0, y: 0, z: 0 },
      self: 'player:a',
      auras: [
        {
          casterId: 'player:a',
          spellId: 7402,
          remaining: 0,
          maxDuration: 0,
          harmful: 0,
        },
      ],
    });

    const [, , self, auras] = events.onWorldEntered.mock.calls[0]!;
    expect(auras).toEqual([
      {
        casterId: self,
        spellId: 7402,
        remaining: 0,
        maxDuration: 0,
        harmful: 0,
      },
    ]);
  });

  it('turns a cast into the list of bodies it struck', async () => {
    await connected();

    socket.emit('spell.released', {
      casterId: '0000000000000001',
      spellId: 133,
      speed: 30,
      aimed: false,
      targets: ['0000000000000002', '0000000000000003'],
      resisted: [],
    });

    const [caster, spellId, speed, targets] = events.onSpellReleased.mock.calls[0]!;
    expect(spellId).toBe(133);
    expect(speed).toBe(30);
    // Two distinct bodies, neither of them the caster: this list is what the
    // client flies missiles at, so collapsing or dropping it loses the spell.
    expect(targets).toHaveLength(2);
    expect(new Set(targets)).toHaveLength(2);
    expect(targets).not.toContain(caster);
  });

  it('resolves the resisted list to the same network ids as targets', async () => {
    await connected();

    socket.emit('spell.released', {
      casterId: '0000000000000001',
      spellId: 133,
      speed: 30,
      aimed: false,
      targets: ['0000000000000002'],
      resisted: ['0000000000000004'],
    });

    const [, , , targets, resisted] = events.onSpellReleased.mock.calls[0]!;
    expect(targets).toHaveLength(1);
    expect(resisted).toHaveLength(1);
    // Two different bodies stay two different network ids, not the same one
    // read twice.
    expect(resisted[0]).not.toBe(targets[0]);
  });

  it('reads a spell outcome by the name the server gives it', async () => {
    await connected();

    for (const result of ['heal', 'periodicHeal', 'critical', 'somethingNew']) {
      socket.emit('spell.outcome', {
        casterId: '0000000000000001',
        targetId: '0000000000000002',
        spellId: 12,
        result,
        damage: 30,
      });
    }

    expect(events.onSpellOutcome.mock.calls.map(call => call[3])).toEqual([
      'heal',
      'periodicHeal',
      'critical',
      null,
    ]);
  });

  it('reads a blow as one record, whether it was swung or shot', async () => {
    await connected();

    for (const message of ['attack.swingResult', 'attack.shotResult']) {
      socket.emit(message, {
        attackerId: '0000000000000001',
        targetId: '0000000000000002',
        outcome: 'critical',
        damage: 214,
        finalHealth: 91,
      });
    }

    const melee = events.onSwingResult.mock.calls[0]![0];
    const ranged = events.onShotResult.mock.calls[0]![0];
    for (const hit of [melee, ranged]) {
      expect(hit.damage).toBe(214);
      expect(hit.outcome).toBe('critical');
      expect(hit.finalHealth).toBe(91);
      expect(hit.attackerId).not.toBe(hit.targetId);
      // Neither names a hand, so both read as the main hand's.
      expect(hit.hand).toBe('main');
    }
  });

  it('reads which hand struck a swing', async () => {
    await connected();

    socket.emit('attack.swingResult', {
      attackerId: '0000000000000001',
      targetId: '0000000000000002',
      outcome: 'hit',
      damage: 9,
      finalHealth: 40,
      hand: 'off',
    });

    expect(events.onSwingResult.mock.calls[0]![0].hand).toBe('off');
  });

  it('delivers a quest a party member shares, and what a member did with one', async () => {
    await connected();

    socket.emit('quest.shareOffered', {
      sharerId: 'player:char-b',
      sharerName: 'Kael',
      questId: 101,
      titleStringId: 5,
      detailsStringId: 6,
      minLevel: 3,
    });
    socket.emit('quest.shareResult', {
      memberId: 'player:char-b',
      memberName: 'Kael',
      questId: 101,
      result: 'outOfReach',
    });
    socket.emit('quest.shareResult', {
      memberId: 'player:char-b',
      memberName: 'Kael',
      questId: 101,
      result: 'somethingNew',
    });

    expect(events.onQuestShareOffered.mock.calls[0]![0]).toMatchObject({
      sharerName: 'Kael',
      questId: 101,
      titleStringId: 5,
    });
    expect(events.onQuestShareResult.mock.calls.map(([answer]) => answer.result)).toEqual([
      'outOfReach',
      null,
    ]);
  });

  it('delivers the members a summon stone can call, a summon put to this player, and what became of one', async () => {
    await connected();

    socket.emit('summon.opened', {
      networkId: 'StaticObject:1',
      members: [
        { networkId: 'player:char-b', name: 'Kael', canSummon: true },
        { networkId: 'player:char-c', name: 'Mira', canSummon: false },
      ],
    });
    socket.emit('summon.asked', {
      summonerId: 'player:char-b',
      summonerName: 'Kael',
      map: 1,
      pos: { x: 10, y: 2, z: -30 },
    });
    socket.emit('summon.result', {
      memberId: 'player:char-b',
      memberName: 'Kael',
      result: 'refused',
    });

    const [, members] = events.onSummonOpened.mock.calls[0]!;
    expect(
      members.map((member: { name: string; canSummon: boolean }) => [
        member.name,
        member.canSummon,
      ]),
    ).toEqual([
      ['Kael', true],
      ['Mira', false],
    ]);
    expect(events.onSummonAsked.mock.calls[0]![0]).toMatchObject({
      summonerName: 'Kael',
      mapId: 1,
      position: [10, 2, -30],
    });
    expect(events.onSummonResult.mock.calls[0]![0].result).toBe('refused');
  });

  it('lists everyone in the world, and asks by name for a friend or a team member', async () => {
    const conn = await connected();

    conn.sendWho();
    conn.sendFriendAddNamed(' Kael ');
    conn.sendPartyInviteNamed('Kael');
    socket.emit('social.whoList', {
      players: [{ networkId: 'player:char-b', name: 'Kael', online: true, level: 12 }],
    });
    socket.emit('summon.tooLow', { summonerName: 'Mira' });

    expect(socket.sent.slice(-3).map(m => [m.type, m.payload])).toEqual([
      ['social.who', {}],
      ['social.friendAdd', { name: 'Kael' }],
      ['party.invite', { name: 'Kael' }],
    ]);
    expect(events.onWhoList.mock.calls[0]![0]).toMatchObject([{ name: 'Kael', level: 12 }]);
    expect(events.onSummonTooLow).toHaveBeenCalledWith('Mira');
  });

  it('applies a movement correction', async () => {
    await connected();

    socket.emit('move.accepted', { pos: { x: 1, y: 2, z: 3 } });

    expect(events.onPlayerPositionCorrected).toHaveBeenCalledWith([1, 2, 3]);
  });

  it('turns a spawn into an EntitySnapshot with numeric appearance keys', async () => {
    await connected();

    socket.emit('entity.spawned', {
      networkId: '2:000000c8',
      kind: 'creature',
      entry: 2451,
      position: { x: 612.4, y: 8.05, z: -230.1 },
      yaw: 1.57,
      displayInfoId: 800,
      race: 2,
      gender: 1,
      skin: 3,
      hairStyle: 4,
      hairColour: 5,
      face: 6,
      equipment: [101, 102],
      animationId: 0,
    });

    expect(events.onEntitiesAppeared).toHaveBeenCalledOnce();
    const [snapshot] = events.onEntitiesAppeared.mock.calls[0]![0];

    expect(snapshot).toEqual(
      expect.objectContaining({
        networkId: expect.any(Number),
        entry: 2451,
        position: [612.4, 8.05, -230.1],
        orientation: 1.57,
        displayInfoId: 800,
        race: 2,
        gender: 1,
        appearance: { skin: 3, hairStyle: 4, hairColour: 5, face: 6 },
        equipment: [101, 102],
        animationId: 0,
        level: 0,
        class: 0,
        health: 0,
        maxHealth: 0,
        power: 0,
        maxPower: 0,
      }),
    );
    // Numeric keys cross the wire; the client resolves assets locally.
    expect(Object.keys(snapshot!).sort()).toEqual([
      'animationId',
      'appearance',
      'canInteract',
      'class',
      'dead',
      'displayInfoId',
      'entry',
      'equipment',
      'gender',
      'health',
      'inCombat',
      'kind',
      'level',
      'lootable',
      'maxHealth',
      'maxPower',
      'nameId',
      'networkId',
      'orientation',
      'position',
      'power',
      'race',
      'staticObjectType',
      'subNameId',
      'weapons',
    ]);
  });

  it('says a creature never fights back only when the server does', async () => {
    await connected();

    socket.emit('entity.spawned', {
      networkId: '2:000000c9',
      entry: 7101,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      neverFightsBack: true,
    });
    socket.emit('entity.spawned', {
      networkId: '2:000000ca',
      entry: 7102,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });

    const [dummy] = events.onEntitiesAppeared.mock.calls[0]![0];
    const [other] = events.onEntitiesAppeared.mock.calls[1]![0];
    expect(dummy!.neverFightsBack).toBe(true);
    expect(other).not.toHaveProperty('neverFightsBack');
  });

  it('reports movement and removal against the same local id as the spawn', async () => {
    await connected();

    socket.emit('entity.spawned', {
      networkId: '2:000000c8',
      kind: 'creature',
      entry: 2451,
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
    socket.emit('entity.moved', {
      networkId: '2:000000c8',
      position: { x: 5, y: 0, z: 5 },
      yaw: 3.1,
    });
    socket.emit('entity.removed', { networkId: '2:000000c8' });

    const spawned = events.onEntitiesAppeared.mock.calls[0]![0][0]!.networkId;
    const moved = events.onEntitiesMoved.mock.calls[0]![0][0]!.networkId;
    const removed = events.onEntitiesRemoved.mock.calls[0]![0][0];

    expect(moved).toBe(spawned);
    expect(removed).toBe(spawned);
  });

  it('gives distinct entities distinct local ids', async () => {
    await connected();

    socket.emit('entity.removed', { networkId: 'a' });
    socket.emit('entity.removed', { networkId: 'b' });
    socket.emit('entity.removed', { networkId: 'a' });

    const ids = events.onEntitiesRemoved.mock.calls.map(call => call[0][0]);
    expect(ids[0]).not.toBe(ids[1]);
    expect(ids[2]).toBe(ids[0]);
  });

  it('passes a numeric network id straight through', async () => {
    await connected();
    socket.emit('entity.removed', { networkId: 4812 });
    expect(events.onEntitiesRemoved).toHaveBeenCalledWith([4812]);
  });

  it('accepts a move with no facing, because the server often sends none', async () => {
    // The position-sync message genuinely carries no orientation. Requiring one
    // would reject every move the server sends.
    await connected();

    socket.emit('entity.moved', { networkId: 'a', position: { x: 1, y: 2, z: 3 } });

    expect(events.onEntitiesMoved).toHaveBeenCalledWith([
      { networkId: expect.any(Number), position: [1, 2, 3] },
    ]);
  });

  it('accepts a stop that carries neither position nor facing', async () => {
    // A hard stop says only that the thing stopped.
    await connected();

    socket.emit('entity.moved', { networkId: 'a', moving: false });

    expect(events.onEntitiesMoved).toHaveBeenCalledWith([
      { networkId: expect.any(Number), moving: false },
    ]);
  });

  it('omits facing rather than defaulting it to zero', async () => {
    // Defaulting would spin every entity north on each update.
    await connected();

    socket.emit('entity.moved', { networkId: 'a', position: { x: 0, y: 0, z: 0 } });

    const [moves] = events.onEntitiesMoved.mock.calls[0]!;
    expect('orientation' in moves[0]!).toBe(false);
  });

  it('carries a route through node by node', async () => {
    await connected();

    socket.emit('entity.moved', {
      networkId: 'a',
      position: { x: 0, y: 0, z: 0 },
      speed: 2.5,
      pathStep: 1,
      path: [
        { x: 1, y: 0, z: 1 },
        { x: 2, y: 0, z: 2 },
      ],
    });

    const [moves] = events.onEntitiesMoved.mock.calls[0]!;
    expect(moves[0]!.path).toEqual([
      { x: 1, y: 0, z: 1 },
      { x: 2, y: 0, z: 2 },
    ]);
    expect(moves[0]!.speed).toBe(2.5);
    expect(moves[0]!.pathStep).toBe(1);
  });

  it('drops a route with an unreadable node instead of passing it on', async () => {
    // The consumer reads x/y/z off every node. A node that has none would
    // throw there, past this layer's error handling, and one bad message
    // would become a dead socket.
    await connected();

    expect(() =>
      socket.emit('entity.moved', {
        networkId: 'a',
        speed: 1,
        path: [{ x: 1, y: 0, z: 1 }, null],
      }),
    ).not.toThrow();

    expect(events.onEntitiesMoved).not.toHaveBeenCalled();
  });

  it('drops a route whose node carries a coordinate that is not a number', async () => {
    await connected();

    expect(() =>
      socket.emit('entity.moved', {
        networkId: 'a',
        speed: 1,
        path: [{ x: 'over there', y: 0, z: 1 }],
      }),
    ).not.toThrow();

    expect(events.onEntitiesMoved).not.toHaveBeenCalled();
  });

  it('omits a speed that is not a finite number', async () => {
    // JSON cannot carry NaN, so nothing off the wire reaches the animation
    // mixer as a playback rate today. Pinned because every other numeric
    // reader here checks finiteness, and a reader that quietly does not is
    // how the next one gets written the same way.
    await connected();

    socket.emit('entity.moved', { networkId: 'a', moving: true, speed: 'fast' });

    const [moves] = events.onEntitiesMoved.mock.calls[0]!;
    expect('speed' in moves[0]!).toBe(false);
    expect(moves[0]!.moving).toBe(true);
  });

  it('delivers chat', async () => {
    await connected();

    socket.emit('chat.received', { channel: 'say', sender: 'TestUser', text: 'hello' });

    expect(events.onChat).toHaveBeenCalledWith({
      channel: 'say',
      sender: 'TestUser',
      text: 'hello',
    });
  });

  it("delivers a creature's yell with the creature resolved to a local id", async () => {
    await connected();

    socket.emit('chat.received', {
      channel: 'yell',
      sender: 'Cosmo',
      text: 'The dead fight for ME!',
      senderId: 'Creature:7',
    });

    expect(events.onChat).toHaveBeenCalledWith({
      channel: 'yell',
      sender: 'Cosmo',
      text: 'The dead fight for ME!',
      senderId: expect.any(Number),
    });
  });

  it('delivers a whisper, with the sender resolved to a local id', async () => {
    await connected();

    socket.emit('chat.whisperReceived', {
      senderNetworkId: '2:000000c8',
      senderName: 'Ayla',
      text: 'hey there',
    });

    expect(events.onWhisperReceived).toHaveBeenCalledWith(expect.any(Number), 'Ayla', 'hey there');
  });

  it('confirms a sent whisper once the server echoes it back', async () => {
    await connected();

    socket.emit('chat.whisperSent', {
      targetNetworkId: '2:000000c8',
      targetName: 'Ayla',
      text: 'hey there',
    });

    expect(events.onWhisperSent).toHaveBeenCalledWith(expect.any(Number), 'Ayla', 'hey there');
  });

  it('confirms a sent report once the server has persisted it', async () => {
    await connected();

    socket.emit('social.reportAcknowledged', {});

    expect(events.onReportAcknowledged).toHaveBeenCalledOnce();
  });

  it('delivers a death, with the position it happened at', async () => {
    await connected();

    socket.emit('unit.died', { networkId: '2:000000c8', pos: { x: 1, y: 2, z: 3 } });

    expect(events.onUnitDied).toHaveBeenCalledOnce();
    const [, position] = events.onUnitDied.mock.calls[0]!;
    expect(position).toEqual([1, 2, 3]);
  });

  it('delivers a death with no position, for a server that only names the guid', async () => {
    await connected();

    socket.emit('unit.died', { networkId: '2:000000c8' });

    expect(events.onUnitDied).toHaveBeenCalledOnce();
    const [, position] = events.onUnitDied.mock.calls[0]!;
    expect(position).toBeUndefined();
  });

  it('delivers a revive, health and power restored', async () => {
    await connected();

    socket.emit('player.revived', {
      networkId: '2:000000c8',
      map: 13,
      pos: { x: 0, y: 0, z: 0 },
      yaw: 0,
      health: 120,
      maxHealth: 120,
      power: 40,
      maxPower: 40,
    });

    expect(events.onPlayerRevived).toHaveBeenCalledWith(expect.any(Number), 120, 120, 40, 40);
  });

  it('forgets network ids between connections', async () => {
    const conn = await connected();
    socket.emit('entity.removed', { networkId: 'a' });
    const first = events.onEntitiesRemoved.mock.calls[0]![0][0];
    conn.disconnect();

    socket = new FakeWebSocket();
    events = spyEvents();
    const again = connection();
    const connecting = again.connect(events);
    socket.accept();
    await connecting;

    socket.emit('entity.removed', { networkId: 'different' });
    // Ids are per-session, so the counter restarts rather than carrying over.
    expect(events.onEntitiesRemoved.mock.calls[0]![0][0]).toBe(first);
  });
});

describe('degrading rather than breaking', () => {
  it('ignores an unknown message type', async () => {
    await connected();

    expect(() => socket.emit('spell.request', { spellId: 7 })).not.toThrow();
    expect(events.onChat).not.toHaveBeenCalled();
  });

  it('ignores malformed JSON', async () => {
    await connected();
    expect(() => socket.deliver('{not json')).not.toThrow();
  });

  it('ignores a binary message', async () => {
    // The server sends named JSON messages only, so a binary frame is ignored.
    await connected();
    expect(() => socket.deliver(new Uint8Array([1, 2, 3]))).not.toThrow();
  });

  it.each([
    [
      'a non-numeric coordinate',
      'entity.moved',
      { networkId: 'a', position: { x: 'far', y: 0, z: 0 } },
    ],
    [
      'a missing entry',
      'entity.spawned',
      { networkId: 'a', position: { x: 0, y: 0, z: 0 }, yaw: 0 },
    ],
    ['an absent networkId', 'entity.removed', {}],
    ['a missing chat field', 'chat.received', { channel: 'say', text: 'no sender' }],
    [
      'a missing whisper field',
      'chat.whisperReceived',
      { senderNetworkId: '2:000000c8', text: 'no sender name' },
    ],
  ])('survives %s', async (_label, type, payload) => {
    await connected();

    expect(() => socket.emit(type, payload)).not.toThrow();
    expect(events.onEntitiesMoved).not.toHaveBeenCalled();
    expect(events.onChat).not.toHaveBeenCalled();
    expect(events.onWhisperReceived).not.toHaveBeenCalled();
  });

  it('still delivers good messages after a bad one', async () => {
    await connected();

    socket.deliver('{not json');
    socket.emit('move.accepted', { pos: { x: 9, y: 9, z: 9 } });

    expect(events.onPlayerPositionCorrected).toHaveBeenCalledWith([9, 9, 9]);
  });

  it('applies a message whose sequence went backwards, and warns', async () => {
    // Reported, not repaired: reordering here would make the transport a
    // decision-maker, and the protocol promises monotonicity anyway.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await connected();

    socket.emitEnvelope({
      type: 'move.accepted',
      sequence: 5,
      payload: { pos: { x: 1, y: 1, z: 1 } },
    });
    socket.emitEnvelope({
      type: 'move.accepted',
      sequence: 2,
      payload: { pos: { x: 2, y: 2, z: 2 } },
    });

    expect(events.onPlayerPositionCorrected).toHaveBeenLastCalledWith([2, 2, 2]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('works when the caller supplies no event handlers at all', async () => {
    const conn = new WebSocketConnection({
      url: 'ws://server.invalid:7020',
      createSocket: () => socket,
    });
    const connecting = conn.connect({});
    socket.accept();
    await connecting;

    expect(() => socket.emit('move.accepted', { pos: { x: 0, y: 0, z: 0 } })).not.toThrow();
  });
});

describe('the boundary', () => {
  /**
   * The rule in client/docs/NETWORKING.md, run in CI rather than remembered: the
   * client speaks named messages, so no message-number vocabulary belongs
   * anywhere in it. The whole of `src` is scanned, not just `net/`, because
   * such a name could turn up in any layer.
   */
  it('names no wire-protocol identifier anywhere in client/src', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.ts')) files.push(path);
      }
    };
    walk(join(import.meta.dirname, '..', 'src'));

    expect(files.length).toBeGreaterThan(20); // the walk actually found the tree

    const banned = /\bcmd\b|opcode|CMSG_|SMSG_/i;
    const offenders = files
      .map(path => ({ path, lines: readFileSync(path, 'utf8').split('\n') }))
      .flatMap(({ path, lines }) =>
        lines
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => banned.test(line))
          .map(({ line, i }) => `${path}:${i + 1}: ${line.trim()}`),
      );

    expect(offenders).toEqual([]);
  });

  it('carries no byte-level handling in net/', async () => {
    for (const file of ['GameConnection.ts', 'WebSocketConnection.ts', 'messages.ts']) {
      const { readFileSync } = await import('node:fs');
      const { join } = await import('node:path');
      const source = readFileSync(join(import.meta.dirname, '..', 'src', 'net', file), 'utf8');

      expect(source).not.toMatch(/readUInt|writeUInt|littleEndian|little-endian|BITSWAP|DataView/i);
    }
  });
});

describe('quests', () => {
  /*
   * Nothing here carries a word of text. Titles, details and objectives are
   * string ids the client resolves against its own copy of the game, exactly
   * as an item's name is — so these tests assert ids, and a placeholder name
   * that the UI replaces once the table answers.
   */

  it('reads a giver’s offers without inventing names for them', async () => {
    await connected();

    socket.emit('quest.listUpdated', {
      giverId: '2a',
      quests: [{ id: 101, status: 'offered', minLevel: 10, titleStringId: 5000 }],
    });

    const quests = events.onQuestList.mock.calls[0]![1] as Array<Record<string, unknown>>;
    expect(quests[0]).toMatchObject({ id: 101, status: 'available', titleStringId: 5000 });
    // Honest placeholder, not a fabricated title.
    expect(quests[0]!.name).toBe('Quest 101');
  });

  it('reads a log entry shaped exactly as the server emits one', async () => {
    /*
     * This payload is shaped as the server sends it, with no `name`: a test
     * that hand-writes a field the server never sends only proves the client
     * agrees with itself.
     *
     * Keep this payload a copy of the server's output, not of what is
     * convenient here.
     */
    await connected();

    socket.emit('quest.log', {
      quests: [
        {
          id: 101,
          titleStringId: 5000,
          detailsStringId: 5001,
          status: 'underway',
          slot: 3,
          readyToHandIn: false,
          objectives: [
            {
              index: 0,
              killed: 0,
              triggered: 0,
              held: 0,
              objectiveItem: 0,
              objectiveItemCount: 0,
              goalCount: 0,
              objectiveStringId: 5100,
            },
          ],
          minLevel: 10,
          rewards: [],
          rewardChoices: [],
          rewardMoney: 1200,
        },
      ],
    });

    expect(events.onQuestLog).toHaveBeenCalled();
    const quests = events.onQuestLog.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(quests[0]).toMatchObject({ id: 101, slot: 3, titleStringId: 5000, minLevel: 10 });
    expect(quests[0]!.status).toBe('incomplete');
  });

  it('calls a log entry whose objectives are met ready to hand in', async () => {
    await connected();
    socket.emit('quest.log', { quests: [{ id: 101, slot: 0, readyToHandIn: true }] });
    const quests = events.onQuestLog.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(quests[0]!.status).toBe('finished');
  });

  it('reads the whole log the character’s create block carried', async () => {
    await connected();

    socket.emit('quest.log', {
      quests: [
        {
          id: 101,
          status: 'underway',
          slot: 2,
          readyToHandIn: false,
          titleStringId: 5000,
          detailsStringId: 5001,
          objectives: [{ index: 0, killed: 2, goalCount: 5, objectiveStringId: 5100 }],
        },
      ],
    });

    const quests = events.onQuestLog.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(quests[0]).toMatchObject({ id: 101, slot: 2, titleStringId: 5000 });
    expect((quests[0]!.objectives as Array<Record<string, unknown>>)[0]).toMatchObject({
      index: 0,
      killed: 2,
      goalCount: 5,
    });
  });

  it('keeps a slot of zero, which is a real slot', async () => {
    await connected();
    socket.emit('quest.log', { quests: [{ id: 101, status: 'underway', slot: 0 }] });
    const quests = events.onQuestLog.mock.calls[0]![0] as Array<Record<string, unknown>>;
    expect(quests[0]!.slot).toBe(0);
  });

  it('leaves the slot unset for a quest that has not been taken', async () => {
    // Zero would be a real slot, and dropping it would drop whatever quest is
    // in slot zero.
    await connected();
    socket.emit('quest.listUpdated', { giverId: '2a', quests: [{ id: 101, status: 'offered' }] });
    const quests = events.onQuestList.mock.calls[0]![1] as Array<Record<string, unknown>>;
    expect(quests[0]!.slot).toBeUndefined();
  });

  it('names which giver a list reply is about, the same way quest.details already does', async () => {
    // Without this, the client cannot tell a reply for a giver just clicked
    // away from apart from one about whoever's dialog is open, and draws
    // whichever lands last onto it.
    await connected();
    socket.emit('quest.listUpdated', { giverId: '2a', quests: [{ id: 101, status: 'offered' }] });
    const [giverId] = events.onQuestList.mock.calls[0]!;
    expect(giverId).toBeGreaterThan(0);

    // The same network id, seen again, resolves to the same number.
    socket.emit('quest.listUpdated', { giverId: '2a', quests: [] });
    const [sameGiverId] = events.onQuestList.mock.calls[1]!;
    expect(sameGiverId).toBe(giverId);
  });

  it('reads an update as only what it carried, not as a whole quest', async () => {
    /*
     * The important one. A kill counted names the quest and one counter; if
     * the missing fields came through as defaults they would wipe the title,
     * the slot and the objectives the log is holding.
     */
    await connected();

    socket.emit('quest.updated', { id: 101, counters: [{ index: 1, kind: 'killed', count: 3 }] });

    const update = events.onQuestUpdated.mock.calls[0]![0] as Record<string, unknown>;
    expect(update).toEqual({ id: 101, counters: [{ index: 1, kind: 'killed', count: 3 }] });
    expect(update.slot).toBeUndefined();
    expect(update.titleStringId).toBeUndefined();
  });

  it('reads the moved counters under the name the server sends them by', async () => {
    /*
     * The server sends the delta as `counters`. `progress` on a quest row is
     * a display string, not this. The counts also arrive through the
     * `objectives` snapshot on the same message; only the lines the world
     * puts over the hero's head depend on the delta alone.
     */
    await connected();

    socket.emit('quest.updated', {
      id: 101,
      counters: [{ index: 0, kind: 'killed', count: 2 }],
      progress: '2 / 5 slain',
    });

    const update = events.onQuestUpdated.mock.calls[0]![0] as Record<string, unknown>;
    expect(update.counters).toEqual([{ index: 0, kind: 'killed', count: 2 }]);
  });

  it('takes no counters from a quest row whose "progress" is its display string', async () => {
    await connected();
    socket.emit('quest.updated', { id: 101, progress: '2 / 5 slain' });
    const update = events.onQuestUpdated.mock.calls[0]![0] as Record<string, unknown>;
    expect(update.counters).toBeUndefined();
  });

  it('reads "you can hand this in now" as a status change and nothing else', async () => {
    await connected();
    socket.emit('quest.updated', { id: 101, readyToHandIn: true, status: 'complete' });
    expect(events.onQuestUpdated.mock.calls[0]![0]).toEqual({
      id: 101,
      readyToHandIn: true,
      status: 'finished',
    });
  });

  it('refuses a quest mark that is not one of the named marks', async () => {
    await connected();
    socket.emit('quest.updated', { id: 101, status: 7 });
    socket.emit('quest.updated', { id: 102, status: 'somethingNew' });
    expect(events.onQuestUpdated).not.toHaveBeenCalled();
  });

  it('asks for the marks to be re-swept, with an empty payload', async () => {
    const conn = await connected();
    conn.sendQuestRefreshStatuses();
    expect(socket.sent.at(-1)).toMatchObject({ type: 'quest.refreshStatuses' });
  });

  it('names only the quest when sharing one, and answers a shared quest yes or no', async () => {
    const conn = await connected();
    conn.sendQuestShare(101);
    expect(socket.sent.at(-1)).toMatchObject({ type: 'quest.share', payload: { questId: 101 } });
    conn.sendQuestShareAnswer(101, false);
    expect(socket.sent.at(-1)).toMatchObject({
      type: 'quest.shareAnswer',
      payload: { questId: 101, accept: false },
    });
  });

  it('names the slot and the quest when dropping one', async () => {
    const conn = await connected();
    conn.sendQuestDestroy(3, 101);
    expect(socket.sent.at(-1)).toMatchObject({
      type: 'quest.destroy',
      payload: { slot: 3, questId: 101 },
    });
  });
});
