import { describe, expect, it, vi } from 'vitest';

import { conversationFailureView } from '../src/app/helpers/npc/conversationFailureView';

describe('conversationFailureView', () => {
  it('shows fallback text and runs provided back handler', () => {
    const back = vi.fn();
    const view = conversationFailureView('NPC', back);
    expect(view.title).toBe('NPC');
    expect(view.text).toEqual([{ text: 'Unable to load this conversation.', tone: 'plain' }]);
    expect(view.choices).toEqual([]);
    view.onBack();
    expect(back).toHaveBeenCalledOnce();
  });
});
