import type { ZoneInfo } from '../../../assets/types';
import type { ConnectionEvents, GameConnection, SummonAnswer } from '../../../net/GameConnection';
import { fill } from '../../../ui/art/wornWords';
import { LINES, say as sayLine } from '../../../ui/gameLines';
import { askSummon, openSummonWindow, setSummonActions } from '../../../ui/summonStore';

/** What the summon handlers need from the game around them. */
export interface SummonDeps {
  /** The notice line in chat. */
  say: (text: string | null) => void;
  zoneAt(mapId: number, position: [number, number, number]): Promise<ZoneInfo | null>;
}

/** The notice for what became of a summon this player asked for, or none. */
export function summonResultLine(answer: SummonAnswer): string | null {
  const name = answer.memberName || 'Your team member';
  switch (answer.result) {
    // Own wording: the build has words only for a summon that went wrong.
    case 'asked':
      return `Summon request sent to ${name}.`;
    case 'accepted':
      return `${name} accepted your summon.`;
    case 'refused':
      return sayLine(LINES.summonRefused);
    case 'failed':
      return sayLine(LINES.summonFailed);
    case 'levelTooLow':
      return oneLine(sayLine(LINES.summonLevelTooLow));
    default:
      return null;
  }
}

/** The build breaks these lines for its message box; chat runs them on. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, ' ');
}

export function summonHandlers(deps: SummonDeps): Partial<ConnectionEvents> {
  return {
    onSummonOpened: (stoneId, members) => openSummonWindow(stoneId, members),
    onSummonAsked: ask => {
      void deps
        .zoneAt(ask.mapId, ask.position)
        .catch(() => null)
        .then(zone => askSummon({ summonerName: ask.summonerName, place: zone?.name ?? '' }));
    },
    onSummonResult: answer => deps.say(summonResultLine(answer)),
    onSummonTooLow: summonerName =>
      deps.say(oneLine(fill(sayLine(LINES.summonedTooLow), summonerName))),
  };
}

export function installSummonActions(connection: GameConnection): void {
  setSummonActions({
    request: (stoneId, memberId) => connection.sendSummonRequest(stoneId, memberId),
    answer: accept => connection.sendSummonAnswer(accept),
  });
}
