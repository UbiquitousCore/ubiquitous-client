import { describe, expect, it } from 'vitest';

import { loadConversationPage } from '../src/app/helpers/npc/conversationLoad';

describe('loadConversationPage', () => {
  it('combines loaded menu with context', async () => {
    const out = await loadConversationPage({
      loadMenu: Promise.resolve({ id: 9, text: '', scripts: [], subMenus: [] } as never),
      loadContext: Promise.resolve({} as never),
    });
    expect(out.menu.id).toBe(9);
  });

  it('passes through failures', async () => {
    await expect(
      loadConversationPage({
        loadMenu: Promise.reject(new Error('boom')),
        loadContext: Promise.resolve({} as never),
      }),
    ).rejects.toThrow('boom');
  });
});
