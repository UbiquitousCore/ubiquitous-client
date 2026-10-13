import { afterEach, describe, expect, it } from 'vitest';
import {
  chatAsking,
  chatOpen,
  chatPeekUntil,
  clearChat,
  enterPressed,
  openChatToType,
  shutChatAfterSaying,
} from '../../src/ui/chatStore';

afterEach(() => clearChat());

/**
 * Enter is the chat's own key: it brings up the whole chat with the box to
 * type in, and saying something with it puts the chat away again, leaving
 * the see-through latest lines showing what was just said.
 */
describe('Enter and the chat', () => {
  it('opens the whole chat with the box to type in', () => {
    openChatToType();
    expect(chatOpen.value).toBe(true);
    expect(chatAsking.value).toBe(true);
  });

  it('puts the chat away after saying something, and shows the latest lines', () => {
    openChatToType();
    shutChatAfterSaying(1000);
    expect(chatOpen.value).toBe(false);
    expect(chatAsking.value).toBe(false);
    expect(chatPeekUntil.value).toBeGreaterThan(1000);
  });

  it('leaves Enter to a field being typed in', () => {
    expect(enterPressed(true)).toBe(false);
    expect(chatOpen.value).toBe(false);
  });

  it('opens the chat on Enter when nothing is being typed', () => {
    expect(enterPressed(false)).toBe(true);
    expect(chatAsking.value).toBe(true);
  });
});
