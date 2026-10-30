import type { AudioEngine } from '../../../audio/AudioEngine';
import { logger } from '../../../core/log';
import { isCurrentGiverReply } from '../../../gameplay/npcInteraction';
import { QuestGestures } from '../../../gameplay/questGestures';
import type {
  ConnectionEvents,
  GameConnection,
  QuestRecord,
  QuestUpdate,
} from '../../../net/GameConnection';
import {
  offerSharedQuest,
  setQuestShareActions,
  sharedQuestAnswerLine,
} from '../../../ui/questShareStore';
import {
  acceptQuest,
  announceQuestAccepted,
  announceQuestCompleted,
  announceQuestProgress,
  clearGiverQuests,
  closeQuestConversation,
  questAction,
  questLog,
  questName,
  questString,
  removeQuest,
  setGiverQuests,
  setQuestActions,
  setQuestLog,
  setQuestText,
  showQuestConversation,
  upsertQuest,
} from '../../../ui/questStore';
import type { GiverChoice } from '../../../ui/questStore';
import type { QuestLookups } from './questLookups';
import { loadQuestTitle, unresolvedQuestTextIds } from './questTextHelpers';
import { resolveQuestArt } from './questLookups';
const log = logger('quest');

/** Sounds named here are files in the user's sound pack, looked up by name. */
const QUEST_ACCEPT_SOUND = 'sfx_ui_quest_accept';
const QUEST_COMPLETE_SOUND = 'sfx_ui_quest_complete';
const QUEST_CANCEL_SOUND = 'sfx_ui_quest_cancel';

/** The rows a multi-quest giver lists: each offer under its resolved title, or its own name while that is unknown. */
function questChoices(
  offers: readonly QuestRecord[],
  titles: ReadonlyArray<string | undefined>,
): GiverChoice[] {
  return offers.map((offer, index) => ({
    id: offer.id,
    name: titles[index] ?? offer.name,
    status: offer.status,
  }));
}

/**
 * The quest log and the givers' windows: what the server tells the client
 * about quests, and the log's and the windows' buttons.
 *
 * The class holds what a reply needs to know about the request before it:
 * which giver the player asked for a list, and which giver to make a gesture
 * when the server takes or gives back a quest.
 */
export class Quests {
  /** The giver whose list the window shows; a reply for any other is stale. */
  private listGiverId: number | null = null;
  private readonly gestures = new QuestGestures();

  constructor(
    private readonly connection: GameConnection,
    private readonly resources: QuestLookups,
    private readonly audio: Pick<AudioEngine, 'play'>,
    /** Play a one-shot on a body, by network id. */
    private readonly gesture: (networkId: number, clip: string) => void,
    /** The notice line in chat. */
    private readonly say: (text: string | null) => void,
  ) {}

  /** Ask a giver what it offers, and remember whose answer to show. */
  listFrom(giverId: number): void {
    this.listGiverId = giverId;
    this.connection.sendQuestList(giverId, 0);
  }

  /** A property, so a button can take it without losing `this`. */
  readonly closeDialog = (): void => {
    this.listGiverId = null;
    clearGiverQuests();
    closeQuestConversation();
  };

  handlers(): Partial<ConnectionEvents> {
    return {
      onQuestList: (replyGiverId, questList) => {
        // Multi-quest givers only; replies for other givers are stale.
        const giverId = this.listGiverId;
        if (!isCurrentGiverReply(giverId, replyGiverId)) return;
        setGiverQuests(questList.map(quest => ({ ...quest, giverId: giverId ?? undefined })));
        if (giverId === null) return;
        if (questList.length === 0) {
          this.closeDialog();
          return;
        }
        void Promise.all(questList.map(quest => this.title(quest)))
          .then(names => {
            showQuestConversation({
              kind: 'choices',
              giverId,
              choices: questChoices(questList, names),
            });
          })
          .catch(() => {});
      },
      onQuestDetails: (giverId, quest) => {
        // Awaited up front: a click before the string table loads would open a blank page.
        void resolveQuestArt(quest, this.resources)
          .then(() => {
            showQuestConversation({
              kind: 'quest',
              giverId,
              quest,
              action: questAction(quest),
            });
          })
          .catch(() => {});
      },
      onQuestUpdated: quest => {
        const gesture = this.gestures.updated(quest.id);
        if (gesture) this.gesture(gesture.giver, gesture.clip);
        this.resolveText(quest);
        upsertQuest(quest);
        // After the merge, so the line reads the new counter. One call per
        // update, so two objectives read as one title with two lines.
        const merged = questLog.value.find(row => row.id === quest.id);
        const moved = (quest.counters ?? []).map(counter => counter.index);
        if (merged && moved.length > 0) announceQuestProgress(merged, moved);
        if (quest.readyToHandIn === true) this.connection.sendQuestRefreshStatuses();
      },
      onQuestRemoved: questId => {
        const gesture = this.gestures.removed(questId);
        if (gesture) this.gesture(gesture.giver, gesture.clip);
        const going = questLog.value.find(row => row.id === questId);
        if (going) announceQuestCompleted(going);
        removeQuest(questId);
      },
      onQuestShareOffered: offer => {
        const id = offer.titleStringId;
        const known = id === 0 || questString(id) !== undefined;
        void (known ? Promise.resolve() : this.resources.questText(id))
          .then(text => {
            if (text) setQuestText(id, text);
          })
          .catch(() => {})
          .finally(() => offerSharedQuest(offer));
      },
      onQuestShareResult: answer => {
        const held = questLog.value.find(row => row.id === answer.questId);
        this.say(sharedQuestAnswerLine(answer, held ? questName(held) : 'the quest'));
      },
      onQuestLog: quests => {
        // The log opens the giver's screen, which draws each reward.
        for (const quest of quests) void resolveQuestArt(quest, this.resources).catch(() => {});
        setQuestLog(quests);
        log.info(`quest log: ${quests.length} quest(s)`);
      },
    };
  }

  /** The log's and the giver windows' buttons, each one a request to the server. */
  installActions(): void {
    setQuestShareActions({
      answer: (questId, accept) => this.connection.sendQuestShareAnswer(questId, accept),
    });
    setQuestActions({
      // Neither removes the row: the server may refuse to drop a quest.
      drop: quest => {
        this.gestures.dropping(quest.id);
        if (quest.slot !== undefined) {
          this.connection.sendQuestDestroy(quest.slot, quest.id);
          // Its giver offers it again, and nothing on the wire says so.
          this.connection.sendQuestRefreshStatuses();
        }
        this.audio.play(QUEST_CANCEL_SOUND);
      },
      share: quest => this.connection.sendQuestShare(quest.id),
      askAbout: (giverId, questId) => {
        this.listGiverId = giverId;
        this.connection.sendQuestList(giverId, questId);
      },
      accept: (giverId, quest) => {
        this.gestures.accepting(giverId, quest.id);
        this.connection.sendQuestAccept(giverId, quest.id);
        // Optimistic; the server's confirmation merges onto this row.
        acceptQuest({ ...quest, giverId });
        announceQuestAccepted(quest);
        this.audio.play(QUEST_ACCEPT_SOUND);
        // The giver's mark changed, and nothing on the wire says so.
        this.connection.sendQuestRefreshStatuses();
      },
      handIn: (giverId, quest, choice = 0) => {
        this.gestures.handingIn(giverId, quest.id);
        this.connection.sendQuestComplete(giverId, quest.id, choice);
        this.audio.play(QUEST_COMPLETE_SOUND);
        this.connection.sendQuestRefreshStatuses();
      },
    });
  }

  private async title(quest: QuestRecord): Promise<string> {
    return loadQuestTitle({
      quest,
      knownText: id => questString(id),
      readText: id => this.resources.questText(id).catch(() => null),
      rememberText: (id, text) => setQuestText(id, text),
    });
  }

  private resolveText(quest: QuestUpdate): void {
    for (const id of unresolvedQuestTextIds(quest, one => questString(one) !== undefined)) {
      void this.resources
        .questText(id)
        .then(text => {
          if (text) setQuestText(id, text);
        })
        .catch(() => {});
    }
  }
}
