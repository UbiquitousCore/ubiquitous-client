/** The giver's window with a game behind it: the quests on offer, then the one asked about. */

import type { JSX } from 'preact';
import { ArtQuestAskWindow } from './components/ArtQuestAskWindow';
import { ArtQuestWindow } from './components/ArtQuestWindow';
import { QUEST_ASK_SCREEN } from './components/ArtQuestAskWindow';
import { QUEST_SCREEN } from './components/ArtQuestWindow';
import { useWornScreen } from './art/useWorn';
import { WornStage } from './art/WornStage';
import { target } from './hudStore';
import { closeQuestConversation, questActions, questConversation } from './questStore';

export function QuestConversationWindow(): JSX.Element | null {
  const conversation = questConversation.value;
  // Asked for before anything else this draws, so the same number of
  // hooks runs whichever side of the conversation is showing.
  const asking = useWornScreen(QUEST_ASK_SCREEN);
  const telling = useWornScreen(QUEST_SCREEN);
  if (!conversation) return null;

  if (conversation.kind === 'choices') {
    if (asking) {
      return (
        <WornStage>
          <ArtQuestAskWindow
            giver={target.value?.name ?? ''}
            choices={conversation.choices.map(choice => ({
              id: choice.id,
              name: choice.name,
              ready: choice.status === 'finished',
            }))}
            onPick={id => questActions().askAbout(conversation.giverId, id)}
            onClose={closeQuestConversation}
          />
        </WornStage>
      );
    }
    return null;
  }

  const { quest, giverId, action } = conversation;
  if (!telling) return null;
  return (
    <WornStage>
      <ArtQuestWindow
        quest={quest}
        // One thing, or none: a quest on offer can be taken, one whose
        // objectives are met can be handed back, and one under way is
        // read and nothing more.
        offers={
          action
            ? [
                {
                  key: action,
                  onPick: choice => {
                    if (action === 'accept') questActions().accept(giverId, quest);
                    else questActions().handIn(giverId, quest, choice);
                    closeQuestConversation();
                  },
                },
              ]
            : []
        }
        onClose={closeQuestConversation}
      />
    </WornStage>
  );
}
