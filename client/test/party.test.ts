import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installPartyActions, partyHandlers } from '../src/app/features/social/party';
import type { GameConnection, PartyMember, PartyRoster } from '../src/net/GameConnection';
import {
  partyActions,
  partyInvite,
  partyKickVote,
  partyNotice,
  partyRoster,
  resetParty,
  setPartyActions,
  setPartyKickVote,
} from '../src/ui/partyStore';

const INERT = partyActions();

const member = (networkId: number, name: string, online = true): PartyMember => ({
  networkId,
  name,
  isLeader: networkId === 1,
  online,
});
const roster = (...members: PartyMember[]): PartyRoster => ({ partyId: 'p', members });
const NO_PARTY: PartyRoster = { partyId: null, members: [] };

function handlers(over: { entering?: boolean; self?: number } = {}) {
  const said: Array<string | null> = [];
  const h = partyHandlers({
    say: text => said.push(text),
    isSelf: id => id === (over.self ?? 1),
    ownName: () => 'Ayla',
    entering: () => over.entering ?? false,
  });
  return { h, said };
}

beforeEach(() => {
  resetParty();
  setPartyActions(INERT);
});

describe('partyHandlers', () => {
  it('says the notice the store wrote for an invite sent, a decline and a kick', () => {
    const { h, said } = handlers();
    h.onPartyInviteSent!(2, 'Bran');
    h.onPartyDeclined!(2, 'Bran');
    h.onPartyKicked!();
    expect(said).toEqual(['Invited Bran.', 'Bran declined.', partyNotice.peek()]);
    expect(said[2]).toBeTruthy();
  });

  it('holds an invite until the roster decides', () => {
    const { h } = handlers();
    h.onPartyInvited!(2, 'Bran');
    expect(partyInvite.value).toEqual({ networkId: 2, name: 'Bran' });
    h.onPartyRoster!(roster(member(1, 'Ayla'), member(2, 'Bran')));
    expect(partyInvite.value).toBeNull();
  });

  it('announces who joined or left between rosters, but not on entering the world', () => {
    const first = handlers();
    first.h.onPartyRoster!(roster(member(1, 'Ayla')));
    expect(first.said).toEqual(['You joined a team.']);
    first.h.onPartyRoster!(roster(member(1, 'Ayla'), member(2, 'Bran')));
    expect(first.said.at(-1)).toBe('Bran joined the team.');
    first.h.onPartyRoster!(roster(member(1, 'Ayla')));
    expect(first.said.at(-1)).toBe('Bran left the team.');

    resetParty();
    const entry = handlers({ entering: true });
    entry.h.onPartyRoster!(roster(member(1, 'Ayla'), member(2, 'Bran')));
    expect(entry.said).toEqual([]);
    expect(partyRoster.value.members).toHaveLength(2);
  });

  it('does not announce a member a passing vote already removed, and only once', () => {
    const { h, said } = handlers();
    h.onPartyRoster!(roster(member(1, 'Ayla'), member(2, 'Bran')));
    said.length = 0;
    h.onPartyVoteKickAsked!({
      initiatorId: 1,
      initiatorName: 'Ayla',
      targetId: 2,
      targetName: 'Bran',
    });
    expect(partyKickVote.value?.targetId).toBe(2);
    h.onPartyVoteKickEnded!({ targetId: 2, targetName: 'Bran', passed: true });
    expect(partyKickVote.value).toBeNull();
    const ended = said.length;
    expect(ended).toBe(1);
    h.onPartyRoster!(roster(member(1, 'Ayla')));
    expect(said).toHaveLength(ended);

    // The vote's memory is cleared by that roster: a later leaver is announced.
    h.onPartyRoster!(roster(member(1, 'Ayla'), member(2, 'Bran')));
    said.length = 0;
    h.onPartyRoster!(roster(member(1, 'Ayla')));
    expect(said).toEqual(['Bran left the team.']);
  });

  it('leaves another vote on screen when a different one ends', () => {
    const { h } = handlers();
    setPartyKickVote({ initiatorId: 1, initiatorName: 'Ayla', targetId: 3, targetName: 'Cole' });
    h.onPartyVoteKickEnded!({ targetId: 2, targetName: 'Bran', passed: false });
    expect(partyKickVote.value?.targetId).toBe(3);
  });

  it('words a refusal differently for the one who asked', () => {
    const { h, said } = handlers({ self: 1 });
    const refusal = { memberId: 5, memberName: 'Dara', initiatorId: 1, initiatorName: 'Ayla' };
    h.onPartyVoteKickRefused!(refusal);
    h.onPartyVoteKickRefused!({ ...refusal, initiatorId: 9 });
    expect(said[0]).not.toBe(said[1]);
    expect(said[0]).toContain('Dara');
    expect(said[1]).toContain('Ayla');
  });

  it('forgets the party when the roster says there is none', () => {
    const { h } = handlers();
    h.onPartyRoster!(roster(member(1, 'Ayla')));
    h.onPartyRoster!(NO_PARTY);
    expect(partyRoster.value.partyId).toBeNull();
  });
});

describe('installPartyActions', () => {
  function actions(target: number | null = 7) {
    const connection = {
      sendPartyInvite: vi.fn(),
      sendPartyKick: vi.fn(),
      sendPartyAccept: vi.fn(),
      sendPartyDecline: vi.fn(),
      sendPartyLeave: vi.fn(),
      sendPartyVoteKick: vi.fn(),
      sendPartyVoteKickAnswer: vi.fn(),
    };
    const asked = vi.fn();
    installPartyActions(connection as unknown as GameConnection, () => target ?? undefined, asked);
    return { connection, asked, run: partyActions() };
  }

  it('invites and kicks the HUD’s target, stamping only the invite as an ask', () => {
    const { connection, asked, run } = actions();
    run.inviteTarget();
    expect(connection.sendPartyInvite).toHaveBeenCalledWith(7);
    expect(asked).toHaveBeenCalledTimes(1);
    run.kickTarget();
    expect(connection.sendPartyKick).toHaveBeenCalledWith(7);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a target that has no network id', () => {
    const { connection, asked, run } = actions(null);
    run.inviteTarget();
    run.kickTarget();
    expect(connection.sendPartyInvite).not.toHaveBeenCalled();
    expect(connection.sendPartyKick).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
  });

  it('passes the rest straight through', () => {
    const { connection, asked, run } = actions();
    run.accept();
    run.decline();
    run.leave();
    run.kick(4);
    run.voteKick(5);
    run.answerVoteKick(true);
    expect(connection.sendPartyAccept).toHaveBeenCalled();
    expect(connection.sendPartyDecline).toHaveBeenCalled();
    expect(connection.sendPartyLeave).toHaveBeenCalled();
    expect(connection.sendPartyKick).toHaveBeenCalledWith(4);
    expect(connection.sendPartyVoteKick).toHaveBeenCalledWith(5);
    expect(connection.sendPartyVoteKickAnswer).toHaveBeenCalledWith(true);
    expect(asked).toHaveBeenCalledTimes(1);
  });
});
