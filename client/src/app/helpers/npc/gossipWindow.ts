import {
  backFrom,
  NOTHING_TO_SAY,
  type GossipChoice,
  type GossipPage,
} from '../../../ui/npcGossip';
import type { Gossip } from '../../../ui/hudStore';

/** Build one gossip window view and wire its choice/back callbacks. */
export function buildGossipWindow(args: {
  title: string;
  page: GossipPage;
  trailMenuIds: readonly number[];
  onOpen: (menuId: number) => void;
  onClose: () => void;
  onRun: (slot: number, choice: GossipChoice) => void;
  onBackUp: () => void;
  onBackOut: () => void;
}): Gossip {
  const { title, page, trailMenuIds, onOpen, onClose, onRun, onBackUp, onBackOut } = args;
  return {
    title,
    text:
      page.text.length || page.choices.length
        ? page.text
        : [{ text: NOTHING_TO_SAY, tone: 'plain' }],
    choices: page.choices.map(choice => ({
      label: choice.label,
      onPick: () => {
        const action = choice.action;
        if (action.kind === 'open') onOpen(action.menuId);
        else if (action.kind === 'close') onClose();
        else onRun(action.slot, choice);
      },
    })),
    onBack: () => {
      const up = backFrom(trailMenuIds);
      if (up === null) onBackOut();
      else onBackUp();
    },
  };
}
