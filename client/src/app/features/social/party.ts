import { logger } from '../../../core/log';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import {
  applyPartyDeclined,
  applyPartyInviteSent,
  applyPartyKicked,
  kickVoteEndLine,
  kickVoteRefusalLine,
  partyKickVote,
  partyNotice,
  partyRoster,
  rosterChangeLines,
  setPartyActions,
  setPartyInvite,
  setPartyKickVote,
  setPartyRoster,
} from '../../../ui/partyStore';

const log = logger('party');

/** What the party's handlers need from the game around them. */
export interface PartyDeps {
  /** The notice line in chat. */
  say: (text: string | null) => void;
  isSelf: (networkId: number) => boolean;
  /** The hero's own name, which a roster change never announces. */
  ownName: () => string | undefined;
  /** Between entering the world and the zone loading; the roster arriving then is not announced. */
  entering: () => boolean;
}

/** The party: invites, the roster, and votes to remove a member. */
export function partyHandlers(deps: PartyDeps): Partial<ConnectionEvents> {
  const { say, isSelf, ownName, entering } = deps;
  /** Members a passing vote removed, so the roster that follows does not announce them again. */
  const votedOut = new Set<string>();
  return {
    onPartyInviteSent: (_networkId, name) => {
      applyPartyInviteSent(name);
      say(partyNotice.peek());
    },
    onPartyInvited: (networkId, name) => setPartyInvite({ networkId, name }),
    onPartyDeclined: (_networkId, name) => {
      applyPartyDeclined(name);
      say(partyNotice.peek());
    },
    onPartyKicked: () => {
      applyPartyKicked();
      say(partyNotice.peek());
    },
    onPartyRoster: roster => {
      const lines = rosterChangeLines(partyRoster.peek(), roster, ownName(), votedOut, entering());
      for (const line of lines) say(line);
      votedOut.clear();
      setPartyRoster(roster);
      log.info(
        roster.partyId === null
          ? 'party: not in a party'
          : `party: ${roster.members.length} member(s)`,
      );
    },

    onPartyVoteKickAsked: vote => setPartyKickVote(vote),
    onPartyVoteKickRefused: refusal =>
      say(kickVoteRefusalLine(refusal, isSelf(refusal.initiatorId))),
    onPartyVoteKickEnded: end => {
      if (partyKickVote.peek()?.targetId === end.targetId) setPartyKickVote(null);
      if (end.passed) votedOut.add(end.targetName);
      say(kickVoteEndLine(end));
    },
  };
}

/** The window's buttons, each one a request to the server. `asked` stamps the request, so a silent refusal can be matched to it. */
export function installPartyActions(
  connection: GameConnection,
  targetNetworkId: () => number | undefined,
  asked: () => void,
): void {
  setPartyActions({
    inviteTarget: () => {
      const networkId = targetNetworkId();
      if (networkId === undefined) return;
      asked();
      connection.sendPartyInvite(networkId);
    },
    invite: networkId => {
      asked();
      connection.sendPartyInvite(networkId);
    },
    inviteNamed: name => {
      asked();
      connection.sendPartyInviteNamed(name);
    },
    kickTarget: () => {
      const networkId = targetNetworkId();
      if (networkId !== undefined) connection.sendPartyKick(networkId);
    },
    accept: () => connection.sendPartyAccept(),
    decline: () => connection.sendPartyDecline(),
    leave: () => connection.sendPartyLeave(),
    kick: networkId => connection.sendPartyKick(networkId),
    voteKick: networkId => {
      asked();
      connection.sendPartyVoteKick(networkId);
    },
    answerVoteKick: agree => connection.sendPartyVoteKickAnswer(agree),
  });
}
