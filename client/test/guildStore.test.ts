/**
 * The guild store's own rules.
 *
 * The same server-owns-the-roster rule as the party's — the whole roster on
 * every change, and an empty one for "you are in no guild". The guild's
 * own difference is that it has a name, which rides on the roster rather than
 * being remembered separately.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { GuildRoster, RosterMember } from '../src/net/GameConnection';
import {
  guildActions,
  guildInvite,
  guildRoster,
  resetGuild,
  setGuildActions,
  setGuildInvite,
  setGuildRoster,
} from '../src/ui/guildStore';

const INERT = guildActions();

function member(networkId: number, name: string, isLeader = false): RosterMember {
  return { networkId, name, isLeader };
}

function roster(...members: RosterMember[]): GuildRoster {
  return { guildId: 'guild-1', guildName: 'The Lantern', members };
}

const NO_GUILD: GuildRoster = { guildId: null, guildName: null, members: [] };

beforeEach(() => {
  resetGuild();
  setGuildActions(INERT);
});

describe('the roster', () => {
  it('is replaced wholesale by whatever the server sends', () => {
    setGuildRoster(roster(member(1, 'Ayla', true), member(2, 'Bran')));
    expect(guildRoster.value.members.map(row => row.name)).toEqual(['Ayla', 'Bran']);
    setGuildRoster(roster(member(1, 'Ayla', true)));
    expect(guildRoster.value.members.map(row => row.name)).toEqual(['Ayla']);
  });

  it('carries the guild name on the roster itself', () => {
    setGuildRoster(roster(member(1, 'Ayla', true)));
    expect(guildRoster.value.guildName).toBe('The Lantern');
    setGuildRoster(NO_GUILD);
    expect(guildRoster.value.guildName).toBeNull();
  });

  it('drops a pending invite, whichever way membership was decided', () => {
    setGuildInvite({ networkId: 9, name: 'Bran', guildName: 'The Lantern' });
    setGuildRoster(roster(member(1, 'Ayla', true), member(9, 'Bran')));
    expect(guildInvite.value).toBeNull();

    setGuildInvite({ networkId: 9, name: 'Bran', guildName: 'The Lantern' });
    setGuildRoster(NO_GUILD);
    expect(guildInvite.value).toBeNull();
  });
});

describe('invites', () => {
  it('names both the inviter and the guild they are inviting to', () => {
    setGuildInvite({ networkId: 9, name: 'Bran', guildName: 'The Lantern' });
    expect(guildInvite.value).toMatchObject({ name: 'Bran', guildName: 'The Lantern' });
  });
});

describe('resetting', () => {
  it('forgets the roster and the invite', () => {
    setGuildRoster(roster(member(1, 'Ayla', true)));
    setGuildInvite({ networkId: 9, name: 'Bran', guildName: 'The Lantern' });
    resetGuild();
    expect(guildRoster.value.members).toEqual([]);
    expect(guildRoster.value.guildName).toBeNull();
    expect(guildInvite.value).toBeNull();
  });
});

describe('what the window asks the game to do', () => {
  it('is inert before `Game` installs anything behind it', () => {
    expect(() => guildActions().found('The Lantern')).not.toThrow();
    expect(() => guildActions().refreshRoster()).not.toThrow();
    expect(() => guildActions().kick(2)).not.toThrow();
  });

  it('hands back the handlers `Game` installed', () => {
    const founded: string[] = [];
    setGuildActions({
      found: name => founded.push(name),
      inviteTarget: () => {},
      inviteNamed: () => {},
      accept: () => {},
      decline: () => {},
      leave: () => {},
      kick: () => {},
      disband: () => {},
      refreshRoster: () => {},
    });
    guildActions().found('The Lantern');
    expect(founded).toEqual(['The Lantern']);
  });
});
