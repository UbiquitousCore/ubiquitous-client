import { logger } from '../../../core/log';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import { fill } from '../../../ui/art/wornWords';
import { screenSpec } from '../../../ui/art/uiSpec';
import { LINES, say as sayLine } from '../../../ui/gameLines';
import {
  applyDuelDeclined,
  applyDuelEnded,
  applyDuelRequested,
  applyDuelStarted,
  duelPhase,
  noteDuelChallenged,
  pvpNotice,
  setPvpActions,
} from '../../../ui/pvpStore';
import { duelCountdown } from './duelCountdown';
import type { WhoIs } from '../../WhoIs';

const log = logger('duel');

/** What the duel's handlers need from the game around them. */
export interface DuelDeps {
  /** The notice line in chat. */
  say: (text: string | null) => void;
  networkName: (networkId: number) => string | null;
  /** Drop the grudge against a body: the server stops only the side that was swinging. */
  forgetFightingMe: (networkId: number) => void;
  /** Battle music for as long as a duel lasts; the soundscape owns it. */
  setBattleMusic: (on: boolean) => void;
}

/** Opening line and the count to the start, said in chat. */
function countDown(
  say: (text: string | null) => void,
  name: string | null,
  accepted: boolean,
  startsIn: number,
): void {
  const words = screenSpec('duelWords')?.words ?? {};
  const opening = accepted
    ? (words.accepted ?? sayLine(LINES.duelAccepted))
    : fill(words.acceptedBy ?? sayLine(LINES.duelAcceptedBy), name ?? '');
  say(opening);
  for (const step of duelCountdown(startsIn, words.start ?? 'Start!')) {
    window.setTimeout(() => say(step.text), step.afterMs);
  }
}

/** Duels and open-world PvP flagging. */
export function duelHandlers(deps: DuelDeps): Partial<ConnectionEvents> {
  const { say, networkName, forgetFightingMe, setBattleMusic } = deps;
  return {
    onDuelRequested: fromId => applyDuelRequested(fromId, networkName(fromId)),
    onDuelDeclined: () => {
      applyDuelDeclined();
      say(pvpNotice.peek());
    },
    onDuelStarted: (opponentId, startsIn) => {
      // The one who said yes is told they did; the one who asked, who did.
      const accepted = duelPhase.peek() !== 'challenged';
      applyDuelStarted(opponentId);
      setBattleMusic(true);
      countDown(say, networkName(opponentId), accepted, startsIn);
    },
    onDuelEnded: (opponentId, reason) => {
      applyDuelEnded(reason);
      setBattleMusic(false);
      // The server stops only the side that was swinging; drop the grudge
      // so a player who was only hit is not left red.
      forgetFightingMe(opponentId);
      say(pvpNotice.peek());
      log.info(`duel: ended (${reason})`);
    },
    onPvpFlagChanged: flagged => log.info(`pvp: ${flagged ? 'flagged' : 'no longer flagged'}`),
  };
}

/**
 * The window's buttons, each one a request to the server. `asked` stamps the
 * request, so a silent refusal can be matched to it.
 */
export function installDuelActions(
  connection: GameConnection,
  who: Pick<WhoIs, 'targetNetworkId' | 'networkName'>,
  say: (text: string | null) => void,
  asked: () => void,
): void {
  setPvpActions({
    challengeTarget: () => {
      const networkId = who.targetNetworkId();
      if (networkId === undefined) return;
      // Success is silent; the challenge lands on the target's next tick.
      noteDuelChallenged(networkId);
      const name = who.networkName(networkId);
      if (name) say(fill(sayLine(LINES.duelAsked), name));
      asked();
      connection.sendDuelRequest(networkId);
    },
    accept: () => connection.sendDuelAccept(),
    decline: () => connection.sendDuelDecline(),
    forfeit: () => connection.sendDuelForfeit(),
    setFlagged: flagged => connection.sendPvpFlagSet(flagged),
  });
}
