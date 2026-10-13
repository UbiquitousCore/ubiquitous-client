/**
 * Questions other players ask, one at a time (team, vote, trade, duel,
 * summon, shared quest), in the build's message box; a shared quest has none, and
 * is asked in a plain dialog.
 */

import type { JSX } from 'preact';

import { useWornScreen } from './art/useWorn';
import { fill } from './art/wornWords';
import { ArtAskBox } from './components/ArtAskBox';
import { Button } from './components/Button';
import { Dialog } from './components/Dialog';
import { LINES, say } from './gameLines';
import {
  partyActions,
  partyInvite,
  partyKickVote,
  setPartyInvite,
  setPartyKickVote,
} from './partyStore';
import { questString } from './questStore';
import { questShareActions, settleSharedQuest, sharedQuestOffers } from './questShareStore';
import { duelOpponentName, duelPhase, noteDuelAnswered, pvpActions } from './pvpStore';
import { answerSummon, summonQuestion } from './summonStore';
import { clearTravelQuestion, travelQuestion } from './travelStore';
import { noteTradeAnswered, tradeActions, tradeOpponentName, tradePhase } from './tradeStore';

export const TEAM_ASK_SCREEN = 'teamAsk';
export const VOTE_KICK_ASK_SCREEN = 'voteKickAsk';
export const TRADE_ASK_SCREEN = 'tradeAsk';
export const DUEL_ASK_SCREEN = 'duelAsk';
export const TRAVEL_ASK_SCREEN = 'travelAsk';
export const SUMMON_ASK_SCREEN = 'summonAsk';

/** Who is asking, where their name was not known when they asked. */
const SOMEBODY = 'Someone';

interface Question {
  /** The worn message box that asks it; absent for a question with none. */
  screen?: string;
  label: string;
  plain: (name: string) => string;
  name: string;
  /** Figures written into the question, in order, and picked out in it. */
  fills?: readonly string[];
  /** True where the question is asked over the full map. */
  overMap?: boolean;
  accept(): void;
  decline(): void;
}

export function AskPromptContainer(): JSX.Element | null {
  const question = pending();
  // Asked whichever question is showing, so the same hooks run whether
  // there is one or not.
  const worn = useWornScreen(question?.screen ?? TRADE_ASK_SCREEN);
  if (!question) return null;

  if (question.screen) {
    if (!worn) return null;
    return (
      <ArtAskBox
        screen={question.screen}
        name={question.name}
        fills={question.fills}
        marks={question.fills}
        overMap={question.overMap}
        label={question.label}
        onAccept={question.accept}
        onDecline={question.decline}
      />
    );
  }

  return (
    <Dialog label={question.label} size="md">
      <h2 className="m-0 text-center font-title text-sm text-parchment-100">
        {question.plain(question.name)}
      </h2>
      <div className="flex justify-center gap-3 pt-4">
        <Button size="lg" variant="secondary" onClick={question.decline}>
          Decline
        </Button>
        <Button size="lg" variant="primary" onClick={question.accept}>
          Accept
        </Button>
      </div>
    </Dialog>
  );
}

function pending(): Question | null {
  const invite = partyInvite.value;
  if (invite) {
    const actions = partyActions();
    return {
      screen: TEAM_ASK_SCREEN,
      label: 'Team invitation',
      plain: name => fill(say(LINES.partyInvite), name),
      name: invite.name || SOMEBODY,
      accept: () => {
        actions.accept();
        setPartyInvite(null);
      },
      decline: () => {
        actions.decline();
        setPartyInvite(null);
      },
    };
  }
  const vote = partyKickVote.value;
  if (vote) {
    const answer = (agree: boolean) => () => {
      partyActions().answerVoteKick(agree);
      setPartyKickVote(null);
    };
    return {
      screen: VOTE_KICK_ASK_SCREEN,
      label: 'Vote to remove a team member',
      plain: name => fill(say(LINES.voteKickAsk), name),
      name: vote.targetName || SOMEBODY,
      accept: answer(true),
      decline: answer(false),
    };
  }
  if (tradePhase.value === 'invited') {
    const actions = tradeActions();
    return {
      screen: TRADE_ASK_SCREEN,
      label: 'Trade request',
      plain: name => `${name} wants to trade.`,
      name: tradeOpponentName.value ?? SOMEBODY,
      accept: () => {
        actions.accept();
        noteTradeAnswered();
      },
      decline: () => {
        actions.decline();
        noteTradeAnswered();
      },
    };
  }
  if (duelPhase.value === 'invited') {
    const actions = pvpActions();
    return {
      screen: DUEL_ASK_SCREEN,
      label: 'Duel challenge',
      plain: name => `${name} challenges you to a duel.`,
      name: duelOpponentName.value ?? SOMEBODY,
      accept: () => {
        actions.accept();
        noteDuelAnswered();
      },
      decline: () => {
        actions.decline();
        noteDuelAnswered();
      },
    };
  }
  const journey = travelQuestion.value;
  if (journey) {
    const answer = (yes: () => void) => () => {
      yes();
      clearTravelQuestion();
    };
    return {
      screen: TRAVEL_ASK_SCREEN,
      label: 'Travel',
      plain: () =>
        `Are you sure you want to go to ${journey.place}? It will cost you ${journey.fare}.`,
      name: '',
      fills: [journey.place, journey.fare],
      overMap: true,
      accept: answer(journey.accept),
      decline: answer(journey.decline),
    };
  }
  const summon = summonQuestion.value;
  if (summon) {
    const summoner = summon.summonerName || SOMEBODY;
    return {
      screen: SUMMON_ASK_SCREEN,
      label: 'Summon',
      plain: () => `${summoner} summons you to ${summon.place}.`,
      name: '',
      fills: [summoner, summon.place],
      accept: () => answerSummon(true),
      decline: () => answerSummon(false),
    };
  }
  const offer = sharedQuestOffers.value[0];
  if (offer) {
    const title = questString(offer.titleStringId) ?? `Quest ${offer.questId}`;
    const answer = (accept: boolean) => () => {
      questShareActions().answer(offer.questId, accept);
      settleSharedQuest(offer.questId);
    };
    return {
      label: 'Shared quest',
      plain: name => `${name} wants to share ${title} with you.`,
      name: offer.sharerName || SOMEBODY,
      accept: answer(true),
      decline: answer(false),
    };
  }
  return null;
}
