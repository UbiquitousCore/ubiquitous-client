/**
 * The party roster, owned by the server: this never adds/removes members on
 * button press — the roster changes when `party.roster` arrives (including the
 * empty one meaning "in no party"). (Debug-panel UI for now.)
 */

import { computed, signal } from '@preact/signals';

import { LINES, say } from './gameLines';
import { fill } from './art/wornWords';
import type {
  KickVoteAsked,
  KickVoteEnded,
  KickVoteRefused,
  PartyMember,
  PartyRoster,
  RosterMember,
} from '../net/GameConnection';

export type { KickVoteAsked, PartyMember, PartyRoster, RosterMember };

/** The empty roster, which is also "you are in no party". */
const NO_PARTY: PartyRoster = { partyId: null, members: [] };

export const partyRoster = signal<PartyRoster>(NO_PARTY);

/** True while this character belongs to a party the server knows about. */
export const inParty = computed(() => partyRoster.value.partyId !== null);

/** An invite waiting on an answer from this player, if there is one. */
export interface PartyInvite {
  networkId: number;
  name: string;
}

export const partyInvite = signal<PartyInvite | null>(null);

/** A vote to remove a member that this player has been asked in, until answered or over. */
export const partyKickVote = signal<KickVoteAsked | null>(null);

export function setPartyKickVote(vote: KickVoteAsked | null): void {
  partyKickVote.value = vote;
}

/**
 * How asking to remove a member goes for this player: the leader removes
 * them outright, anyone else starts a vote, and nobody is removed by
 * themselves or from a team they are not in.
 */
export function removalBy(
  members: readonly RosterMember[],
  selfName: string | undefined,
  networkId: number,
): 'kick' | 'vote' | null {
  const self = members.find(member => member.name === selfName);
  const target = members.find(member => member.networkId === networkId);
  if (!self || !target || target === self) return null;
  return self.isLeader ? 'kick' : 'vote';
}

/**
 * The last thing the party system said that was not a refusal.
 *
 * Refusals live in `protocolNotices` instead, because the server reports them
 * on a shared message that names no system — see that file.
 */
export const partyNotice = signal<string | null>(null);

/**
 * Replace the roster wholesale, which is the only way it ever changes.
 *
 * An invite is dropped on the way in: whatever it was for, this player's
 * membership has just been decided one way or the other.
 */
export function setPartyRoster(roster: PartyRoster): void {
  partyRoster.value = roster;
  partyInvite.value = null;
  if (roster.partyId === null) partyKickVote.value = null;
}

export function setPartyInvite(invite: PartyInvite | null): void {
  partyInvite.value = invite;
  if (invite !== null) partyNotice.value = `${invite.name} invited you to a party.`;
}

export function applyPartyInviteSent(name: string): void {
  partyNotice.value = `Invited ${name}.`;
}

export function applyPartyDeclined(name: string): void {
  partyNotice.value = `${name} declined.`;
}

/**
 * Being kicked, which arrives just ahead of this player's own empty roster.
 *
 * The roster is left alone here on purpose — the message that follows carries
 * it, and applying an empty one early would only race with it.
 */
export function applyPartyKicked(): void {
  partyNotice.value = say(LINES.youKickedOffTeam);
}

/**
 * What chat says when a member asked in a vote said no: to the one who
 * asked, that their request was turned down; to everyone else asked, who
 * turned down whose.
 */
export function kickVoteRefusalLine(refusal: KickVoteRefused, askedBySelf: boolean): string {
  return askedBySelf
    ? fill(say(LINES.voteKickRefusedYou), refusal.memberName)
    : fill(say(LINES.voteKickRefused), refusal.memberName, refusal.initiatorName);
}

/**
 * What chat says when a vote ends: who was removed, or nothing for a vote
 * that failed, whose refusals were each said as they came.
 */
export function kickVoteEndLine(end: KickVoteEnded): string | null {
  return end.passed ? fill(say(LINES.kickedOffTeam), end.targetName) : null;
}

/** Chat lines for a new roster; votes already announced their removals, and the entry roster says nothing. */
export function rosterChangeLines(
  before: PartyRoster,
  after: PartyRoster,
  selfName: string | undefined,
  votedOut: ReadonlySet<string>,
  entering: boolean,
): string[] {
  if (entering) return [];
  const lines: string[] = [];
  const was = new Map(before.members.map(one => [one.name, one]));
  const is = new Set(after.members.map(one => one.name));
  if (before.partyId !== null && after.partyId === null) lines.push('The team has been disbanded.');
  for (const one of after.members) {
    if (one.name === selfName || before.partyId === null) continue;
    const earlier = was.get(one.name);
    if (!earlier) lines.push(`${one.name} joined the team.`);
    else if (earlier.online && !one.online) lines.push(`${one.name} has gone offline.`);
    else if (!earlier.online && one.online) lines.push(`${one.name} is back online.`);
  }
  if (after.partyId !== null) {
    for (const one of before.members) {
      if (votedOut.has(one.name)) continue;
      if (!is.has(one.name) && one.name !== selfName) lines.push(`${one.name} left the team.`);
    }
  }
  if (before.partyId === null && after.partyId !== null) lines.push('You joined a team.');
  return lines;
}

/**
 * Forget everything: on leaving the world, and again on entering it as a
 * character, where the server sends the roster afresh if there is one.
 */
export function resetParty(): void {
  partyRoster.value = NO_PARTY;
  partyInvite.value = null;
  partyKickVote.value = null;
  partyNotice.value = null;
}

// ---------------------------------------------------------------------------
// What the window asks the game to do: handlers defaulting to nothing.
// ---------------------------------------------------------------------------
export interface PartyActions {
  /** Invite the HUD's target; only `Game` can map its local id to a network id. */
  inviteTarget(): void;
  /** Invite someone by the network id a list row carries, wherever they are. */
  invite(networkId: number): void;
  /** Invite whoever in the world goes by this name. */
  inviteNamed(name: string): void;
  /** Kick whoever the HUD currently has targeted — the leader-only remove
   * slot on the target toolbar, resolved the same way `inviteTarget` is. */
  kickTarget(): void;
  accept(): void;
  decline(): void;
  leave(): void;
  /** By the network id the roster row carries, which is already a wire id. */
  kick(networkId: number): void;
  /** Ask the rest of the team whether this member should go; for anyone but the leader. */
  voteKick(networkId: number): void;
  /** Answer the vote this player was asked in. */
  answerVoteKick(agree: boolean): void;
}

const NOTHING: PartyActions = {
  inviteTarget: () => {},
  invite: () => {},
  inviteNamed: () => {},
  kickTarget: () => {},
  accept: () => {},
  decline: () => {},
  leave: () => {},
  kick: () => {},
  voteKick: () => {},
  answerVoteKick: () => {},
};

let actions: PartyActions = NOTHING;

export function setPartyActions(next: PartyActions): void {
  actions = next;
}

export function partyActions(): PartyActions {
  return actions;
}
