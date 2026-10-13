import { LINES, say as sayLine } from '../../../ui/gameLines';

/**
 * What a refusal tells the player: `report` for refusals with no result
 * message; `notice` only when it answers a recent question to another player.
 */
export function refusalLines(args: { code: string; reason: string; askedRecently: boolean }): {
  report: string[];
  notice: string | null;
} {
  const { code, reason, askedRecently } = args;
  const report: string[] = [];
  if (code === 'invalid_inventory') report.push(reason);
  if (code === 'dungeon_reset_refused') report.push(sayLine(LINES.dungeonResetRefused));
  if (code === 'dungeon_mode_refused') report.push(reason);
  return { report, notice: askedRecently ? reason : null };
}
