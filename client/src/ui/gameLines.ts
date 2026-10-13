/** Interface lines by position in the user's strings, per build (told apart by string count); our wording otherwise. */

import { COMBAT_WORDS } from '../gameplay/SpellBook';
import { uiWords } from './art/pieceStore';

export interface GameLine {
  /** Where the line sits in the strings file, keyed by that file's string count. */
  readonly at: Readonly<Record<number, number>>;
  /** What the line reads when the user's strings do not supply it. */
  readonly fallback: string;
}

/** String counts of the two builds this client reads. */
const LATER_BUILD = 1911;
const EARLIER_BUILD = 1695;

function line(later: number, earlier: number, fallback: string): GameLine {
  return { at: { [LATER_BUILD]: later, [EARLIER_BUILD]: earlier }, fallback };
}

export const LINES = {
  dead: line(638, 630, 'You have died.'),
  killedBy: line(639, 631, 'Killed by %s.'),
  deathPenalty: line(641, 633, 'Dying cost you %s.'),
  reviveAtGraveyard: line(1265, 1253, 'Return to the graveyard'),
  bindOnPickup: line(100, 96, 'Bound to you on pickup'),
  bindOnEquip: line(101, 97, 'Bound to you once worn'),
  bindOnUse: line(102, 98, 'Bound to you once used'),
  questItem: line(103, 99, 'Needed for a quest'),
  requiresLevel: line(290, 284, 'Needs level %d'),
  combatEnter: line(1363, 1350, COMBAT_WORDS.enter),
  combatLeave: line(1364, 1351, COMBAT_WORDS.leave),
  friendRow: line(1417, 1404, '%s, level %d %s %s'),
  offline: line(731, 723, 'Offline'),
  partyInvite: line(421, 414, '%s asks you to join their team.'),
  voteKickAsk: line(1341, 1328, 'Remove %s from the team?'),
  voteKickRefusedYou: line(574, 568, '%s said no to your request.'),
  voteKickRefused: line(459, 453, "%s said no to %s's request."),
  kickedOffTeam: line(1241, 1229, '%s was removed from the team.'),
  youKickedOffTeam: line(1370, 1357, 'You were removed from the team.'),
  duelAsked: line(992, 982, 'Duel request sent to %s.'),
  duelAccepted: line(994, 984, 'Duel on. Get ready.'),
  duelAcceptedBy: line(995, 985, '%s took up the duel. Get ready.'),
  congratulations: line(1547, 1529, 'Well done!'),
  missed: line(11, 11, 'Miss'),
  dodged: line(12, 12, 'Dodge'),
  parried: line(13, 13, 'Parry'),
  blocked: line(14, 14, 'Block'),
  dungeonsReset: line(1508, 1490, 'The dungeons have been reset.'),
  summonRefused: line(1520, 1502, 'Summon Refused'),
  summonFailed: line(1521, 1503, 'Summon Failed'),
  summonLevelTooLow: line(
    1513,
    1495,
    "Summon Failed. The target's level did not meet the required conditions.",
  ),
  summonedTooLow: line(
    1514,
    1496,
    "%s tried to summon you but failed because your level didn't meet the required conditions",
  ),
  dungeonResetRefused: line(1509, 1491, 'Reset failed. Players were still in the dungeon.'),
} as const satisfies Record<string, GameLine>;

/** What `which` reads in `words` — the user's strings unless given others. */
export function say(which: GameLine, words: readonly string[] = uiWords.value): string {
  const at = which.at[words.length];
  const found = at === undefined ? undefined : words[at];
  return found?.trim() ? found : which.fallback;
}
