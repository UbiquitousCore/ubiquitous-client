/**
 * An NPC's conversation on the build's talking screen. Where the build has
 * none, its choices go on the quest list, and words with nothing to choose
 * on the quest giver's page, minus the quest.
 */

import type { JSX } from 'preact';

import type { GossipSpan } from './npcGossip';

import { ArtNpcChatWindow, NPC_CHAT_SCREEN } from './components/ArtNpcChatWindow';
import { ArtQuestAskWindow, QUEST_ASK_SCREEN } from './components/ArtQuestAskWindow';
import { ArtQuestWindow, QUEST_SCREEN } from './components/ArtQuestWindow';
import { useWornScreen } from './art/useWorn';
import { WornStage } from './art/WornStage';
import { closeGossip, gossip } from './hudStore';

/** What the NPC says, with the runs the page picks out drawn in the alert ink. */
function Words({ spans }: { spans: readonly GossipSpan[] }): JSX.Element {
  return (
    <>
      {spans.map((span, at) =>
        span.tone === 'alert' ? (
          <span key={at} data-tone="alert" className="text-ink-danger">
            {span.text}
          </span>
        ) : (
          span.text
        ),
      )}
    </>
  );
}

export function GossipWindow(): JSX.Element | null {
  const current = gossip.value;
  // Asked for before anything else this draws, so the same number of
  // hooks runs whichever of the two the NPC is doing.
  const asking = useWornScreen(QUEST_ASK_SCREEN);
  const talking = useWornScreen(NPC_CHAT_SCREEN);
  const page = useWornScreen(QUEST_SCREEN);
  if (!current) return null;

  if (talking) {
    return (
      <WornStage>
        <ArtNpcChatWindow
          speaker={current.title}
          says={<Words spans={current.text} />}
          choices={current.choices}
          onBack={current.onBack}
          onClose={closeGossip}
        />
      </WornStage>
    );
  }

  if (current.choices.length && asking) {
    return (
      <WornStage>
        <ArtQuestAskWindow
          giver={current.title}
          choices={current.choices.map((choice, index) => ({ id: index, name: choice.label }))}
          onPick={index => current.choices[index]?.onPick()}
          onClose={closeGossip}
        />
      </WornStage>
    );
  }

  if (!page) return null;
  return (
    <WornStage>
      <ArtQuestWindow
        speech={{
          speaker: current.title,
          words: <Words spans={current.text} />,
          replies: current.choices.map(choice => ({ label: choice.label, onPick: choice.onPick })),
        }}
        onClose={closeGossip}
      />
    </WornStage>
  );
}
