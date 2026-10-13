import type { QuestRecord, QuestUpdate } from '../../../net/GameConnection';

/** One quest's title, from cache/table/fallback, with cache fill on load. */
export async function loadQuestTitle(args: {
  quest: QuestRecord;
  knownText: (id: number) => string | undefined;
  readText: (id: number) => Promise<string | null>;
  rememberText: (id: number, text: string) => void;
}): Promise<string> {
  const { quest, knownText, readText, rememberText } = args;
  const id = quest.titleStringId;
  if (id === undefined || id === 0) return quest.name;
  const known = knownText(id);
  if (known !== undefined) return known;
  const resolved = await readText(id);
  if (resolved) rememberText(id, resolved);
  return resolved ?? quest.name;
}

/** Uncached non-zero quest text ids this update refers to. */
export function unresolvedQuestTextIds(
  quest: QuestUpdate,
  hasText: (id: number) => boolean,
): number[] {
  const ids = [
    quest.titleStringId,
    quest.detailsStringId,
    quest.completionStringId,
    quest.incompleteStringId,
    ...(quest.objectives ?? []).map(objective => objective.objectiveStringId),
  ];
  const out: number[] = [];
  for (const id of ids) {
    if (id === undefined || id === 0 || hasText(id)) continue;
    out.push(id);
  }
  return out;
}
