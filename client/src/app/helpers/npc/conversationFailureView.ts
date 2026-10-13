import type { Gossip } from '../../../ui/hudStore';

/** Fallback gossip page when one menu fails to load. */
export function conversationFailureView(title: string, onBack: () => void): Gossip {
  return {
    title,
    text: [{ text: 'Unable to load this conversation.', tone: 'plain' }],
    choices: [],
    onBack,
  };
}
