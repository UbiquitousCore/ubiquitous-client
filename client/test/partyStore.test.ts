/**
 * The party store's own rules, and the shared refusal log underneath it.
 *
 * The server owns the roster: nothing here adds or drops a member because a
 * button was pressed, and the whole roster arrives on every change — including
 * the empty one that means "you are in no party". Being kicked is the case
 * worth pinning, because the notice and the roster arrive as two separate
 * messages and applying the empty roster early would only race the server's.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { PartyMember, PartyRoster } from '../src/net/GameConnection';
import {
  applyPartyDeclined,
  applyPartyInviteSent,
  applyPartyKicked,
  inParty,
  kickVoteEndLine,
  kickVoteRefusalLine,
  partyActions,
  partyInvite,
  partyKickVote,
  partyNotice,
  partyRoster,
  resetParty,
  rosterChangeLines,
  setPartyActions,
  removalBy,
  setPartyInvite,
  setPartyKickVote,
  setPartyRoster,
} from '../src/ui/partyStore';
import { lastRefusal, noteRefusal, refusals } from '../src/ui/protocolNotices';
import { clearRefusals } from './helpers/stores';

const INERT = partyActions();

function member(networkId: number, name: string, isLeader = false, online = true): PartyMember {
  return { networkId, name, isLeader, online };
}

function roster(...members: PartyMember[]): PartyRoster {
  return { partyId: 'party-1', members };
}

const NO_PARTY: PartyRoster = { partyId: null, members: [] };

beforeEach(() => {
  resetParty();
  clearRefusals();
  setPartyActions(INERT);
});

describe('the roster', () => {
  it('is replaced wholesale by whatever the server sends', () => {
    setPartyRoster(roster(member(1, 'Ayla', true), member(2, 'Bran')));
    expect(partyRoster.value.members.map(row => row.name)).toEqual(['Ayla', 'Bran']);
    setPartyRoster(roster(member(1, 'Ayla', true)));
    expect(partyRoster.value.members.map(row => row.name)).toEqual(['Ayla']);
  });

  it('reads an empty roster with no party id as being in no party', () => {
    setPartyRoster(roster(member(1, 'Ayla', true)));
    expect(inParty.value).toBe(true);
    setPartyRoster(NO_PARTY);
    expect(inParty.value).toBe(false);
    expect(partyRoster.value.members).toEqual([]);
  });

  it('drops a pending invite, whichever way membership was decided', () => {
    setPartyInvite({ networkId: 9, name: 'Bran' });
    setPartyRoster(roster(member(1, 'Ayla', true), member(9, 'Bran')));
    expect(partyInvite.value).toBeNull();

    setPartyInvite({ networkId: 9, name: 'Bran' });
    setPartyRoster(NO_PARTY);
    expect(partyInvite.value).toBeNull();
  });
});

describe('invites', () => {
  it('holds the invite and says who sent it', () => {
    setPartyInvite({ networkId: 9, name: 'Bran' });
    expect(partyInvite.value).toMatchObject({ networkId: 9, name: 'Bran' });
    expect(partyNotice.value).toContain('Bran');
  });

  it('clears without a notice when the invite is withdrawn', () => {
    setPartyInvite({ networkId: 9, name: 'Bran' });
    applyPartyInviteSent('Cade');
    setPartyInvite(null);
    expect(partyInvite.value).toBeNull();
    expect(partyNotice.value).toContain('Cade');
  });

  it('reports an invite this player sent, and its refusal', () => {
    applyPartyInviteSent('Cade');
    expect(partyNotice.value).toContain('Cade');
    applyPartyDeclined('Cade');
    expect(partyNotice.value).toContain('declined');
  });
});

describe('being kicked', () => {
  it('says so but leaves the roster to the message that carries it', () => {
    setPartyRoster(roster(member(1, 'Ayla', true), member(2, 'Bran')));
    applyPartyKicked();
    expect(partyNotice.value).toContain('removed');
    expect(inParty.value).toBe(true);
    expect(partyRoster.value.members).toHaveLength(2);
  });

  it('empties the roster only once the empty one arrives', () => {
    setPartyRoster(roster(member(1, 'Ayla', true), member(2, 'Bran')));
    applyPartyKicked();
    setPartyRoster(NO_PARTY);
    expect(inParty.value).toBe(false);
  });
});

describe('resetting', () => {
  it('forgets the roster, the invite and the notice', () => {
    setPartyRoster(roster(member(1, 'Ayla', true)));
    setPartyInvite({ networkId: 9, name: 'Bran' });
    resetParty();
    expect(inParty.value).toBe(false);
    expect(partyRoster.value.members).toEqual([]);
    expect(partyInvite.value).toBeNull();
    expect(partyNotice.value).toBeNull();
  });
});

describe('what the window asks the game to do', () => {
  it('is inert before `Game` installs anything behind it', () => {
    expect(() => partyActions().inviteTarget()).not.toThrow();
    expect(() => partyActions().kickTarget()).not.toThrow();
    expect(() => partyActions().accept()).not.toThrow();
    expect(() => partyActions().kick(2)).not.toThrow();
  });

  it('hands back the handlers `Game` installed', () => {
    const kicked: number[] = [];
    setPartyActions({
      inviteTarget: () => {},
      invite: () => {},
      inviteNamed: () => {},
      kickTarget: () => {},
      accept: () => {},
      decline: () => {},
      leave: () => {},
      kick: networkId => kicked.push(networkId),
      voteKick: () => {},
      answerVoteKick: () => {},
    });
    partyActions().kick(2);
    expect(kicked).toEqual([2]);
  });
});

describe('the shared refusal log', () => {
  it('keeps the newest first', () => {
    noteRefusal('invalid_party', 'You are not in a party.');
    noteRefusal('not_leader', 'Only the leader may do that.');
    expect(refusals.value.map(entry => entry.code)).toEqual(['not_leader', 'invalid_party']);
    expect(lastRefusal.value).toMatchObject({ code: 'not_leader' });
  });

  it('reads as nothing refused yet when it is empty', () => {
    expect(lastRefusal.value).toBeNull();
  });

  it('keeps the last twenty and no more', () => {
    for (let index = 0; index < 25; index += 1) {
      noteRefusal(`code_${index}`, 'Refused.');
    }
    expect(refusals.value).toHaveLength(20);
    expect(lastRefusal.value).toMatchObject({ code: 'code_24' });
    expect(refusals.value.at(-1)).toMatchObject({ code: 'code_5' });
  });
});

describe('asking for a member to go', () => {
  const team = [member(1, 'Lead', true), member(2, 'Ayla'), member(3, 'Bram')];

  it('is a kick for the leader and a vote for anyone else', () => {
    expect(removalBy(team, 'Lead', 3)).toBe('kick');
    expect(removalBy(team, 'Ayla', 3)).toBe('vote');
    expect(removalBy(team, 'Ayla', 1)).toBe('vote');
  });

  it('is nothing for yourself, for someone not in the team, or from outside it', () => {
    expect(removalBy(team, 'Ayla', 2)).toBeNull();
    expect(removalBy(team, 'Ayla', 9)).toBeNull();
    expect(removalBy(team, 'Stranger', 3)).toBeNull();
  });

  it('says a no to the one who asked as their own request turned down', () => {
    const refusal = { memberId: 1, memberName: 'Lead', initiatorId: 2, initiatorName: 'Ayla' };
    expect(kickVoteRefusalLine(refusal, true)).toBe('Lead said no to your request.');
    expect(kickVoteRefusalLine(refusal, false)).toBe("Lead said no to Ayla's request.");
  });

  it('names who was removed when a vote passes, and says nothing more when it fails', () => {
    expect(kickVoteEndLine({ targetId: 3, targetName: 'Bram', passed: true })).toBe(
      'Bram was removed from the team.',
    );
    expect(kickVoteEndLine({ targetId: 3, targetName: 'Bram', passed: false })).toBeNull();
  });

  it('drops a question still open once this player is in no team', () => {
    setPartyKickVote({ initiatorId: 2, initiatorName: 'Ayla', targetId: 3, targetName: 'Bram' });
    setPartyRoster(roster(...team));
    expect(partyKickVote.value).not.toBeNull();
    setPartyRoster({ partyId: null, members: [] });
    expect(partyKickVote.value).toBeNull();
  });
});

describe('what chat says about a new roster', () => {
  const none = new Set<string>();
  const ayla = member(1, 'Ayla', true);
  const bran = member(2, 'Bran');
  const cara = member(3, 'Cara');

  it('says a member has gone offline, and that they are back, without calling it a leave', () => {
    const away = roster(ayla, member(2, 'Bran', false, false), cara);
    expect(rosterChangeLines(roster(ayla, bran, cara), away, 'Ayla', none, false)).toEqual([
      'Bran has gone offline.',
    ]);
    expect(rosterChangeLines(away, roster(ayla, bran, cara), 'Ayla', none, false)).toEqual([
      'Bran is back online.',
    ]);
  });

  it('says nothing about the roster that rides with entering the world', () => {
    expect(rosterChangeLines(NO_PARTY, roster(ayla, bran), 'Bran', none, true)).toEqual([]);
  });

  it('names joins, leaves, forming and ending', () => {
    expect(rosterChangeLines(NO_PARTY, roster(ayla, bran), 'Bran', none, false)).toEqual([
      'You joined a team.',
    ]);
    expect(
      rosterChangeLines(roster(ayla, bran), roster(ayla, bran, cara), 'Ayla', none, false),
    ).toEqual(['Cara joined the team.']);
    expect(
      rosterChangeLines(roster(ayla, bran, cara), roster(ayla, bran), 'Ayla', none, false),
    ).toEqual(['Cara left the team.']);
    expect(rosterChangeLines(roster(ayla, bran), NO_PARTY, 'Ayla', none, false)).toEqual([
      'The team has been disbanded.',
    ]);
  });

  it("leaves a member voted out to the vote's own line", () => {
    const out = new Set(['Cara']);
    expect(
      rosterChangeLines(roster(ayla, bran, cara), roster(ayla, bran), 'Ayla', out, false),
    ).toEqual([]);
  });
});

describe('a relog', () => {
  it('starts from no team, and takes the roster the server sends as the team', () => {
    setPartyRoster(roster(member(1, 'Ayla', true), member(2, 'Bran')));
    setPartyKickVote({ initiatorId: 1, initiatorName: 'Ayla', targetId: 2, targetName: 'Bran' });

    resetParty();
    expect(inParty.value).toBe(false);
    expect(partyKickVote.value).toBeNull();

    setPartyRoster(roster(member(1, 'Ayla', true), member(2, 'Bran')));
    expect(partyRoster.value.members.map(row => [row.name, row.isLeader, row.online])).toEqual([
      ['Ayla', true, true],
      ['Bran', false, true],
    ]);
  });
});
