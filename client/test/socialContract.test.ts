/**
 * The party, guild, trade, duel, PvP and instance contract, mirroring the
 * server's payload records field for field. Update to match the server;
 * never loosen. Pinned on purpose: `trade.request` and `duel.challenge` use
 * `targetId` where invites and kicks use `networkId` (the server's
 * inconsistency is the contract), and refusals arrive on `protocol.error`.
 */

import { describe, expect, it } from 'vitest';

import { WebSocketConnection } from '../src/net/WebSocketConnection';
import type {
  ConnectionEvents,
  GuildRoster,
  PartyRoster,
  SocialListMember,
  TradeState,
} from '../src/net/GameConnection';
import { FakeWebSocket } from './helpers/fakeWebSocket';

async function connected(
  socket: FakeWebSocket,
  events: ConnectionEvents,
): Promise<WebSocketConnection> {
  const conn = new WebSocketConnection({
    url: 'ws://ubiquitous.invalid:7020',
    createSocket: () => socket,
  });
  const connecting = conn.connect(events);
  socket.accept();
  await connecting;
  return conn;
}

/**
 * A connection that has already seen one player's wire id, so the registry
 * can turn the local number back into the token an outbound message needs.
 *
 * Every "act on this player" request goes out under a wire id the client was
 * given, never one it made up, so a test that skips this step is testing
 * nothing: the send would simply be dropped.
 */
async function withKnownPlayer(
  socket: FakeWebSocket,
  wireId = 'player:00000001',
): Promise<{ conn: WebSocketConnection; localId: number }> {
  let localId = 0;
  const conn = await connected(socket, {
    onPartyRoster: roster => {
      localId = roster.members[0]!.networkId;
    },
  });
  socket.emit('party.roster', {
    partyId: 'party-1',
    members: [{ networkId: wireId, name: 'Ayla', isLeader: true }],
  });
  return { conn, localId };
}

describe('protocol.error, the only refusal channel these systems have', () => {
  it('arrives parsed rather than ignored', async () => {
    const socket = new FakeWebSocket();
    const seen: Array<[string, string]> = [];
    await connected(socket, {
      onProtocolError: (code, reason) => seen.push([code, reason]),
    });

    socket.emit('protocol.error', {
      code: 'invalid_party',
      reason: 'Only the party leader can do that.',
    });

    expect(seen).toEqual([['invalid_party', 'Only the party leader can do that.']]);
  });

  it('survives a payload it cannot read, rather than dropping the socket', async () => {
    const socket = new FakeWebSocket();
    const seen: Array<[string, string]> = [];
    await connected(socket, {
      onProtocolError: (code, reason) => seen.push([code, reason]),
    });

    socket.emit('protocol.error', {});

    expect(seen).toEqual([['unknown', 'Request refused.']]);
    expect(socket.readyState).toBe(1);
  });
});

describe('party.roster as the server describes it', () => {
  it('carries the whole membership, with the leader marked', async () => {
    const socket = new FakeWebSocket();
    let roster: PartyRoster | null = null;
    await connected(socket, {
      onPartyRoster: value => {
        roster = value;
      },
    });

    socket.emit('party.roster', {
      partyId: 'party-1',
      members: [
        { networkId: 'player:00000001', name: 'Ayla', isLeader: true },
        { networkId: 'player:00000002', name: 'Borin', isLeader: false },
      ],
    });

    expect(roster).not.toBeNull();
    expect(roster!.partyId).toBe('party-1');
    expect(roster!.members.map(member => [member.name, member.isLeader])).toEqual([
      ['Ayla', true],
      ['Borin', false],
    ]);
    // Two distinct wire tokens must not collapse onto one local id.
    expect(roster!.members[0]!.networkId).not.toBe(roster!.members[1]!.networkId);
  });

  it('reads whether each member is in the world, and a row that does not say as online', async () => {
    const socket = new FakeWebSocket();
    let roster: PartyRoster | null = null;
    await connected(socket, {
      onPartyRoster: value => {
        roster = value;
      },
    });

    socket.emit('party.roster', {
      partyId: 'party-1',
      members: [
        { networkId: 'player:00000001', name: 'Ayla', isLeader: true, online: true },
        { networkId: 'player:00000002', name: 'Borin', isLeader: false, online: false },
        { networkId: 'player:00000003', name: 'Cara', isLeader: false },
      ],
    });

    expect(roster!.members.map(member => [member.name, member.online])).toEqual([
      ['Ayla', true],
      ['Borin', false],
      ['Cara', true],
    ]);
  });

  it('reads a null party id and an empty list as "you are in no party"', async () => {
    const socket = new FakeWebSocket();
    let roster: PartyRoster | null = null;
    await connected(socket, {
      onPartyRoster: value => {
        roster = value;
      },
    });

    socket.emit('party.roster', { partyId: null, members: [] });

    expect(roster).toEqual({ partyId: null, members: [] });
  });

  it('reports an invite, an ack, a decline and a kick each on their own message', async () => {
    const socket = new FakeWebSocket();
    const seen: string[] = [];
    await connected(socket, {
      onPartyInviteSent: (_id, name) => seen.push(`sent:${name}`),
      onPartyInvited: (_id, name) => seen.push(`invited:${name}`),
      onPartyDeclined: (_id, name) => seen.push(`declined:${name}`),
      onPartyKicked: () => seen.push('kicked'),
    });

    socket.emit('party.inviteSent', { networkId: 'player:1', name: 'Ayla' });
    socket.emit('party.invited', { networkId: 'player:2', name: 'Borin' });
    socket.emit('party.declined', { networkId: 'player:3', name: 'Cass' });
    socket.emit('party.kicked', { partyId: null, members: [] });

    expect(seen).toEqual(['sent:Ayla', 'invited:Borin', 'declined:Cass', 'kicked']);
  });
});

describe('guild.roster as the server describes it', () => {
  it('carries the guild name alongside the membership', async () => {
    const socket = new FakeWebSocket();
    let roster: GuildRoster | null = null;
    await connected(socket, {
      onGuildRoster: value => {
        roster = value;
      },
    });

    socket.emit('guild.roster', {
      guildId: 'guild-1',
      guildName: 'The Long Watch',
      members: [{ networkId: 'player:00000001', name: 'Ayla', isLeader: true }],
    });

    expect(roster!.guildId).toBe('guild-1');
    expect(roster!.guildName).toBe('The Long Watch');
    expect(roster!.members).toHaveLength(1);
  });

  it('reads nulls throughout as "you are in no guild"', async () => {
    const socket = new FakeWebSocket();
    let roster: GuildRoster | null = null;
    await connected(socket, {
      onGuildRoster: value => {
        roster = value;
      },
    });

    socket.emit('guild.roster', { guildId: null, guildName: null, members: [] });

    expect(roster).toEqual({ guildId: null, guildName: null, members: [] });
  });

  it('names the guild on an invite, which the party equivalent does not', async () => {
    const socket = new FakeWebSocket();
    let invited: [string, string] | null = null;
    await connected(socket, {
      onGuildInvited: (_id, name, guildName) => {
        invited = [name, guildName];
      },
    });

    socket.emit('guild.invited', {
      networkId: 'player:1',
      name: 'Ayla',
      guildName: 'The Long Watch',
    });

    expect(invited).toEqual(['Ayla', 'The Long Watch']);
  });
});

describe('social.listUpdated as the server describes it', () => {
  it('carries both lists in one message, each under members/networkId like a roster', async () => {
    const socket = new FakeWebSocket();
    let friends: SocialListMember[] | null = null;
    let ignored: SocialListMember[] | null = null;
    await connected(socket, {
      onFriendList: members => {
        friends = members;
      },
      onIgnoreList: members => {
        ignored = members;
      },
    });

    socket.emit('social.listUpdated', {
      friends: [
        { networkId: 'player:00000001', name: 'Ayla' },
        { networkId: 'player:00000002', name: 'Borin' },
      ],
      ignored: [],
    });

    expect(friends).not.toBeNull();
    expect(friends!.map(member => member.name)).toEqual(['Ayla', 'Borin']);
    expect(friends![0]!.networkId).not.toBe(friends![1]!.networkId);
    expect(ignored).toEqual([]);
  });

  it('reads an absent list as empty rather than throwing', async () => {
    const socket = new FakeWebSocket();
    let friends: SocialListMember[] | null = null;
    let ignored: SocialListMember[] | null = null;
    await connected(socket, {
      onFriendList: members => {
        friends = members;
      },
      onIgnoreList: members => {
        ignored = members;
      },
    });

    socket.emit('social.listUpdated', {});

    expect(friends).toEqual([]);
    expect(ignored).toEqual([]);
  });

  it('fires both callbacks from the one message, friends and ignored independently sized', async () => {
    const socket = new FakeWebSocket();
    const seen: string[] = [];
    await connected(socket, {
      onFriendList: members => seen.push(`friends:${members.length}`),
      onIgnoreList: members => seen.push(`ignored:${members.length}`),
    });

    socket.emit('social.listUpdated', {
      friends: [{ networkId: 'player:1', name: 'Ayla' }],
      ignored: [],
    });

    expect(seen).toEqual(['friends:1', 'ignored:0']);
  });
});

describe('social.friendList (C2S) requests a fresh social.listUpdated', () => {
  it('sends no payload, the way guild.rosterRequest does', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendSocialListRequest();

    expect(socket.ofType('social.friendList')[0]!.payload).toEqual({});
  });
});

describe('trade.updated as the server describes it', () => {
  it('describes the opponent, plus this side’s own confirm state', async () => {
    const socket = new FakeWebSocket();
    let state: TradeState | null = null;
    await connected(socket, {
      onTradeUpdated: value => {
        state = value;
      },
    });

    socket.emit('trade.updated', {
      opponentId: 'player:00000002',
      opponentGold: 250,
      opponentItems: [
        { id: 'item-a', entry: 100, count: 2 },
        { id: 'item-b', entry: 101, count: 1 },
      ],
      opponentConfirmed: true,
      yourConfirmed: false,
    });

    expect(state!.opponentGold).toBe(250);
    expect(state!.opponentConfirmed).toBe(true);
    expect(state!.yourConfirmed).toBe(false);
    expect(state!.opponentItems).toEqual([
      { id: 'item-a', entry: 100, count: 2 },
      { id: 'item-b', entry: 101, count: 1 },
    ]);
  });

  it('treats an offered item with no count as a stack of one', async () => {
    const socket = new FakeWebSocket();
    let state: TradeState | null = null;
    await connected(socket, {
      onTradeUpdated: value => {
        state = value;
      },
    });

    socket.emit('trade.updated', {
      opponentId: 'player:2',
      opponentGold: 0,
      opponentItems: [{ id: 'item-a', entry: 100 }],
      opponentConfirmed: false,
      yourConfirmed: false,
    });

    expect(state!.opponentItems[0]!.count).toBe(1);
  });

  it('passes every cancellation reason through as the server spelled it', async () => {
    const socket = new FakeWebSocket();
    const reasons: string[] = [];
    await connected(socket, {
      onTradeCancelled: (_id, reason) => reasons.push(reason),
    });

    for (const reason of [
      'cancelled',
      'out_of_range',
      'offer_changed_after_confirm',
      'not_enough_gold',
      'item_no_longer_available',
      'not_enough_bag_space',
    ]) {
      socket.emit('trade.cancelled', { opponentId: 'player:2', reason });
    }

    expect(reasons).toEqual([
      'cancelled',
      'out_of_range',
      'offer_changed_after_confirm',
      'not_enough_gold',
      'item_no_longer_available',
      'not_enough_bag_space',
    ]);
  });

  it('reports a proposal, a decline, a start and a completion', async () => {
    const socket = new FakeWebSocket();
    const seen: string[] = [];
    await connected(socket, {
      onTradeRequested: () => seen.push('requested'),
      onTradeDeclined: () => seen.push('declined'),
      onTradeStarted: () => seen.push('started'),
      onTradeCompleted: () => seen.push('completed'),
    });

    socket.emit('trade.requested', { fromId: 'player:2' });
    socket.emit('trade.declined', { byId: 'player:2' });
    socket.emit('trade.started', { opponentId: 'player:2' });
    socket.emit('trade.completed', { opponentId: 'player:2' });

    expect(seen).toEqual(['requested', 'declined', 'started', 'completed']);
  });
});

describe('duel.ended and pvp.flagChanged as the server describes them', () => {
  it('carries this side’s own reason and the health the server settled on', async () => {
    const socket = new FakeWebSocket();
    const endings: Array<[string, number, number]> = [];
    await connected(socket, {
      onDuelEnded: (_id, reason, health, maxHealth) => endings.push([reason, health, maxHealth]),
    });

    // A health-based loss revives the loser at a small flat amount; a forfeit
    // leaves health alone. Both numbers are the server's, not a local guess.
    socket.emit('duel.ended', {
      opponentId: 'player:2',
      reason: 'lost',
      health: 10,
      maxHealth: 420,
    });
    socket.emit('duel.ended', {
      opponentId: 'player:2',
      reason: 'opponentForfeited',
      health: 380,
      maxHealth: 420,
    });

    expect(endings).toEqual([
      ['lost', 10, 420],
      ['opponentForfeited', 380, 420],
    ]);
  });

  it('reports a challenge, a decline and a start', async () => {
    const socket = new FakeWebSocket();
    const seen: string[] = [];
    await connected(socket, {
      onDuelRequested: () => seen.push('requested'),
      onDuelDeclined: () => seen.push('declined'),
      onDuelStarted: () => seen.push('started'),
    });

    socket.emit('duel.challenged', { fromId: 'player:2' });
    socket.emit('duel.declined', { byId: 'player:2' });
    socket.emit('duel.started', { opponentId: 'player:2' });

    expect(seen).toEqual(['requested', 'declined', 'started']);
  });

  it('echoes the PvP flag both ways', async () => {
    const socket = new FakeWebSocket();
    const flags: boolean[] = [];
    await connected(socket, { onPvpFlagChanged: flagged => flags.push(flagged) });

    socket.emit('pvp.flagChanged', { flagged: true });
    socket.emit('pvp.flagChanged', { flagged: false });

    expect(flags).toEqual([true, false]);
  });
});

describe('what this client sends', () => {
  it('addresses a party invite and kick by networkId', async () => {
    const socket = new FakeWebSocket();
    const { conn, localId } = await withKnownPlayer(socket);

    conn.sendPartyInvite(localId);
    conn.sendPartyKick(localId);

    expect(socket.ofType('party.invite')[0]!.payload).toEqual({ networkId: 'player:00000001' });
    expect(socket.ofType('party.kick')[0]!.payload).toEqual({ networkId: 'player:00000001' });
  });

  it('addresses a trade and a duel proposal by targetId, which is the server’s own spelling', async () => {
    const socket = new FakeWebSocket();
    const { conn, localId } = await withKnownPlayer(socket);

    conn.sendTradeRequest(localId);
    conn.sendDuelRequest(localId);

    expect(socket.ofType('trade.request')[0]!.payload).toEqual({ targetId: 'player:00000001' });
    expect(socket.ofType('duel.challenge')[0]!.payload).toEqual({ targetId: 'player:00000001' });
  });

  it('addresses a friend/ignore add and remove by targetId, the same as trade and duel', async () => {
    const socket = new FakeWebSocket();
    const { conn, localId } = await withKnownPlayer(socket);

    conn.sendFriendAdd(localId);
    conn.sendFriendRemove(localId);
    conn.sendIgnoreAdd(localId);
    conn.sendIgnoreRemove(localId);

    expect(socket.ofType('social.friendAdd')[0]!.payload).toEqual({ targetId: 'player:00000001' });
    expect(socket.ofType('social.friendRemove')[0]!.payload).toEqual({
      targetId: 'player:00000001',
    });
    expect(socket.ofType('social.ignoreAdd')[0]!.payload).toEqual({ targetId: 'player:00000001' });
    expect(socket.ofType('social.ignoreRemove')[0]!.payload).toEqual({
      targetId: 'player:00000001',
    });
  });

  it('sends nothing at all for a player it has never seen a wire id for', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendPartyInvite(9999);
    conn.sendGuildKick(9999);
    conn.sendTradeRequest(9999);
    conn.sendFriendAdd(9999);
    conn.sendIgnoreAdd(9999);

    expect(socket.ofType('party.invite')).toHaveLength(0);
    expect(socket.ofType('guild.kick')).toHaveLength(0);
    expect(socket.ofType('trade.request')).toHaveLength(0);
    expect(socket.ofType('social.friendAdd')).toHaveLength(0);
    expect(socket.ofType('social.ignoreAdd')).toHaveLength(0);
  });

  it('sends the guild name on founding, and an empty payload on every no-argument request', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendGuildFound('The Long Watch');
    conn.sendGuildAccept();
    conn.sendGuildDisband();
    conn.sendGuildRosterRequest();
    conn.sendPartyLeave();
    conn.sendDuelForfeit();

    expect(socket.ofType('guild.found')[0]!.payload).toEqual({ name: 'The Long Watch' });
    for (const type of [
      'guild.accept',
      'guild.disband',
      'guild.rosterRequest',
      'party.leave',
      'duel.forfeit',
    ]) {
      expect(socket.ofType(type)[0]!.payload).toEqual({});
    }
  });

  it('replaces a trade offer wholesale, items and gold together', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendTradeOffer(['item-a', 'item-b'], 500);
    conn.sendTradeConfirm(true);

    expect(socket.ofType('trade.offer')[0]!.payload).toEqual({
      itemIds: ['item-a', 'item-b'],
      gold: 500,
    });
    expect(socket.ofType('trade.confirm')[0]!.payload).toEqual({ confirmed: true });
  });

  it('sends the PvP flag explicitly in both directions', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendPvpFlagSet(true);
    conn.sendPvpFlagSet(false);

    // An explicit `false` is required to clear the flag: the server reads a
    // missing field as "turn it on".
    expect(socket.ofType('pvp.flagSet').map(message => message.payload)).toEqual([
      { flagged: true },
      { flagged: false },
    ]);
  });

  it('omits an instance entry position rather than sending the origin itself', async () => {
    const socket = new FakeWebSocket();
    const conn = await connected(socket, {});

    conn.sendInstanceEnter(30);
    conn.sendInstanceEnter(30, [10, 20, 30], 1.5);

    expect(socket.ofType('instance.enter')[0]!.payload).toEqual({ mapId: 30 });
    expect(socket.ofType('instance.enter')[1]!.payload).toEqual({
      mapId: 30,
      pos: { x: 10, y: 20, z: 30 },
      yaw: 1.5,
    });
  });
});
