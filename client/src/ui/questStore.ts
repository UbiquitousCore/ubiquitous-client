/**
 * The quest log (the character's, lasts the session) plus the current giver's
 * offering list (belongs to one conversation). Separate signals — merging
 * them let a giver overwrite the log. The log is never requested: accepted
 * quests arrive in the create block at login, changes are pushed after.
 */

import { computed, signal } from '@preact/signals';
import type {
  QuestCounter,
  QuestGiverStatus,
  QuestRecord,
  QuestUpdate,
} from '../net/GameConnection';

/** The character's own accepted quests: what the quest log screen shows. */
export const questLog = signal<QuestRecord[]>([]);

/** What the current giver offers; emptied when the conversation ends. */
export const giverQuests = signal<QuestRecord[]>([]);

export const questGiverStatuses = signal(new Map<number, QuestGiverStatus>());

/** Replace the whole log — the character's create block, once decoded. */
export function setQuestLog(value: QuestRecord[]): void {
  questLog.value = [...value];
}

/** Apply moved counters onto logged objectives; a push names only a slot and its total. */
function withCounters(quest: QuestRecord, counters: QuestCounter[]): QuestRecord {
  if (counters.length === 0) return quest;
  const objectives = [...(quest.objectives ?? [])];
  for (const counter of counters) {
    const at = objectives.findIndex(objective => objective.index === counter.index);
    const current =
      at < 0
        ? {
            index: counter.index,
            killed: 0,
            triggered: 0,
            held: 0,
            objectiveItem: 0,
            objectiveItemCount: 0,
            goalCount: 0,
            objectiveStringId: 0,
          }
        : objectives[at]!;
    const updated = { ...current, [counter.kind]: counter.count };
    if (at < 0) objectives.push(updated);
    else objectives[at] = updated;
  }
  return { ...quest, objectives };
}

/** Add or replace a quest in taking order; a partial update keeps fields it does not carry. */
export function upsertQuest(value: QuestUpdate): void {
  const at = questLog.value.findIndex(quest => quest.id === value.id);
  const { counters, ...fields } = value;
  if (at < 0) {
    // A quest nothing has introduced yet. It should not happen — the accept
    // confirmation carries everything — but a nameless row is better than a
    // dropped one, and the name arrives with the next message about it.
    const created: QuestRecord = {
      name: `Quest ${value.id}`,
      status: 'incomplete',
      ...fields,
      id: value.id,
    };
    questLog.value = [...questLog.value, withCounters(created, counters ?? [])];
    return;
  }
  const next = [...questLog.value];
  next[at] = withCounters({ ...next[at]!, ...fields }, counters ?? []);
  questLog.value = next;
}

/**
 * Take a quest, optimistically (confirmation merges onto this row). Auto-tracks
 * only when nothing else is tracked — never steals the mark.
 */
export function acceptQuest(value: QuestUpdate): void {
  const alreadyTracking = questLog.value.some(quest => quest.tracked);
  upsertQuest({ ...value, status: 'incomplete', tracked: value.tracked ?? !alreadyTracking });
}

export function removeQuest(id: number): void {
  questLog.value = questLog.value.filter(quest => quest.id !== id);
}

export function setGiverQuests(value: QuestRecord[]): void {
  giverQuests.value = [...value];
}

export function clearGiverQuests(): void {
  if (giverQuests.value.length > 0) giverQuests.value = [];
}

export function setQuestGiverStatuses(
  value: Array<{ networkId: number; status: QuestGiverStatus }>,
): void {
  const next = new Map(questGiverStatuses.value);
  // Merged rather than replaced: a status message names one giver, or the
  // ones in range, and never claims to be the whole world.
  for (const entry of value) next.set(entry.networkId, entry.status);
  questGiverStatuses.value = next;
}

/** Forget every giver's mark — on leaving a zone, where the ids are reused. */
export function clearQuestGiverStatuses(): void {
  questGiverStatuses.value = new Map();
}

/** Track one quest for the guide arrow; exclusive, and untracking leaves none. */
export function setTracked(id: number, tracked: boolean): void {
  questLog.value = questLog.value.map(quest =>
    quest.id === id ? { ...quest, tracked } : tracked ? { ...quest, tracked: false } : quest,
  );
}

export const trackedQuest = computed(() => questLog.value.find(quest => quest.tracked) ?? null);

/** Whether the tracked quest resolves somewhere walkable (false is ordinary:
 * other map, unresolved finisher, or no zones — arrow draws nothing). */
export const guideTargetKnown = signal(false);

export function setGuideTargetKnown(known: boolean): void {
  if (guideTargetKnown.value !== known) guideTargetKnown.value = known;
}

/** How many quests the character may hold at once. */
export const QUEST_LOG_CAPACITY = 12;

/** Quest text by string id, filled as lookups land, so the log redraws with titles. */
export const questText = signal<ReadonlyMap<number, string>>(new Map());

/** Shipped quest markup folded on the way in (br/control-byte tags;
 * wrappers off, words kept). */
export function decodeQuestText(text: string): string {
  return text
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/(<\s*)?br\s*\/(\s*>)?/gi, '\n')
    .replace(/\x13/g, '\n')
    .replace(/\x12\/?[a-z_]+(=[^>\x12]*)?>?/gi, '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function setQuestText(id: number, text: string): void {
  const decoded = decodeQuestText(text);
  if (questText.value.get(id) === decoded) return;
  questText.value = new Map(questText.value).set(id, decoded);
}

/** The words behind a string id, or nothing while the lookup is in flight. */
export function questString(id: number | undefined): string | undefined {
  return id === undefined || id === 0 ? undefined : questText.value.get(id);
}

/** A quest's title, falling back to what the record was built with. */
export function questName(quest: QuestRecord): string {
  return questString(quest.titleStringId) ?? quest.name;
}

// Handlers rather than direct calls, for the same reason the inventory's are:
// `ui/` may not reach into the network layer, and `Game` is what holds the
// connection. Each defaults to doing nothing, so the log rendered in a lab
// with no game behind it is inert rather than broken.

export interface QuestActions {
  /** Give it up, by slot and quest; the server's removal message removes the row. */
  drop(quest: QuestRecord): void;
  /** Offer it to the rest of the party. */
  share(quest: QuestRecord): void;
  /** Ask a giver about one of the quests it listed. */
  askAbout(giverId: number, questId: number): void;
  /** Take it. The log fills at once and the server confirms after. */
  accept(giverId: number, quest: QuestRecord): void;
  /** Hand it in; the server's removal message removes the row. `choice` counts rewards from 0. */
  handIn(giverId: number, quest: QuestRecord, choice?: number): void;
}

const NOTHING: QuestActions = {
  drop: () => {},
  share: () => {},
  askAbout: () => {},
  accept: () => {},
  handIn: () => {},
};

let actions: QuestActions = NOTHING;

export function setQuestActions(next: QuestActions): void {
  actions = next;
}

export function questActions(): QuestActions {
  return actions;
}

// Quest-move announcements: title + moved objective (accept/hand-in get their
// own line). One block at a time — a new message replaces, never stacks.

/** How long a progress block stays up: time to read a title and a few objectives. */
export const QUEST_MESSAGE_LIFETIME_MS = 7000;

/** An accept or hand-in banner is one line, so it goes sooner. */
export const QUEST_BANNER_LIFETIME_MS = 4000;

/**
 * How many lines the block may run to: the title and one line for each of
 * a quest's four requirement slots. Own choice, the most a block can say.
 */
export const QUEST_MESSAGE_MAX_LINES = 5;

/** Yellow when done, green while not; the log rows' vocabulary. */
export type QuestMessageTone = 'ready' | 'active';

export interface QuestMessage {
  key: number;
  kind: 'title' | 'progress' | 'accepted' | 'completed';
  text: string;
  tone: QuestMessageTone;
  /** When it was raised, for ageing it out. */
  at: number;
}

export const questMessages = signal<QuestMessage[]>([]);

let nextMessageKey = 1;

/** How long a line of this kind is given. */
export function questMessageLifetime(kind: QuestMessage['kind']): number {
  return kind === 'accepted' || kind === 'completed'
    ? QUEST_BANNER_LIFETIME_MS
    : QUEST_MESSAGE_LIFETIME_MS;
}

/**
 * Put one block of lines up, taking the place of whatever was there, so
 * the screen only ever shows the latest quest's progress.
 */
function show(lines: Array<Omit<QuestMessage, 'key' | 'at'>>, now: number): void {
  questMessages.value = lines
    .slice(0, QUEST_MESSAGE_MAX_LINES)
    .map(line => ({ ...line, key: nextMessageKey++, at: now }));
}

/** Drop what has had its time. Called from the frame that draws them. */
export function expireQuestMessages(now = performance.now()): void {
  const live = questMessages.value.filter(m => now - m.at < questMessageLifetime(m.kind));
  if (live.length !== questMessages.value.length) questMessages.value = live;
}

export function clearQuestMessages(): void {
  if (questMessages.value.length > 0) questMessages.value = [];
}

/**
 * One objective line, `"%s  %d/%d"`, the count clamped (`5/5`, not `7/5`);
 * shared with the log's card. Nothing for an empty requirement slot.
 */
export function objectiveLine(
  quest: QuestRecord,
  index: number,
): { text: string; tone: QuestMessageTone } | null {
  const objective = (quest.objectives ?? []).find(o => o.index === index);
  if (!objective) return null;
  const wanted = objective.goalCount || objective.objectiveItemCount;
  if (wanted <= 0) return null;
  const done = Math.max(objective.killed, objective.held, objective.triggered);
  const name = questString(objective.objectiveStringId) ?? '';
  return {
    text: `${name}  ${Math.min(done, wanted)}/${wanted}`.trimStart(),
    tone: done >= wanted ? 'ready' : 'active',
  };
}

/** Every objective a quest asks for, each as its own line, in slot order. */
export function objectiveLines(quest: QuestRecord): { text: string; tone: QuestMessageTone }[] {
  return [...(quest.objectives ?? [])]
    .sort((a, b) => a.index - b.index)
    .map(objective => objectiveLine(quest, objective.index))
    .filter((line): line is NonNullable<typeof line> => line !== null);
}

/** Announce quest progress: name + moved objectives (yellow when hand-in
 * ready). Silent when no slot yields a line. */
export function announceQuestProgress(
  quest: QuestRecord,
  index: number | readonly number[],
  now = performance.now(),
): void {
  const indices = typeof index === 'number' ? [index] : index;
  const lines = indices
    .map(at => objectiveLine(quest, at))
    .filter((line): line is NonNullable<typeof line> => line !== null);
  if (lines.length === 0) return;
  show(
    [
      {
        kind: 'title',
        text: questName(quest),
        tone: quest.readyToHandIn === true ? 'ready' : 'active',
      },
      ...lines.map(line => ({ kind: 'progress' as const, text: line.text, tone: line.tone })),
    ],
    now,
  );
}

/** Both banners are quest-yellow: the colour is for the banner, not the progress. */
export function announceQuestAccepted(quest: QuestRecord, now = performance.now()): void {
  show([{ kind: 'accepted', text: `${questName(quest)} (Accepted)`, tone: 'ready' }], now);
}

export function announceQuestCompleted(quest: QuestRecord, now = performance.now()): void {
  show([{ kind: 'completed', text: `${questName(quest)} (Completed)`, tone: 'ready' }], now);
}

// — the window a giver opens: a list of offers, or one quest in full ------

/** One thing the giver is offering, for the list a multi-quest giver shows. */
export interface GiverChoice {
  id: number;
  name: string;
  /** `available` and the rest, so the row can say what state it is in. */
  status: QuestGiverStatus;
}

export type QuestConversation =
  | {
      kind: 'choices';
      /** The giver's own network id, for the request a choice sends. */
      giverId: number;
      choices: GiverChoice[];
    }
  | {
      kind: 'quest';
      giverId: number;
      quest: QuestRecord;
      /** What the one button does, decided by the quest's own status. */
      action: 'accept' | 'handIn' | null;
    };

export const questConversation = signal<QuestConversation | null>(null);

export function showQuestConversation(value: QuestConversation): void {
  questConversation.value = value;
}

export function closeQuestConversation(): void {
  if (questConversation.value !== null) questConversation.value = null;
}

/** The giver's one button: accept an offer, hand in a finished quest, or nothing. */
export function questAction(record: QuestRecord): 'accept' | 'handIn' | null {
  if (record.status === 'available') return 'accept';
  if (record.status === 'finished') return 'handIn';
  return null;
}
