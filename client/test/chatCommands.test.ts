import { describe, expect, it, vi } from 'vitest';

import { readChatCommand, setChatCommandSink } from '../src/ui/chatCommands';
import { say, setChatSink } from '../src/ui/chatStore';

describe('chat commands', () => {
  it('reads who, invite and friend, with their short forms', () => {
    expect(readChatCommand('/who')).toEqual({ kind: 'who' });
    expect(readChatCommand('  /WHO ')).toEqual({ kind: 'who' });
    expect(readChatCommand('/invite Kael')).toEqual({ kind: 'invite', name: 'Kael' });
    expect(readChatCommand('/inv Kael')).toEqual({ kind: 'invite', name: 'Kael' });
    expect(readChatCommand('/friend Mira Vale')).toEqual({ kind: 'friend', name: 'Mira Vale' });
    expect(readChatCommand('/addfriend Mira')).toEqual({ kind: 'friend', name: 'Mira' });
    expect(readChatCommand('/stress 100')).toEqual({ kind: 'stress', count: 100 });
  });

  it('leaves plain lines, unknown words and nameless commands to be said', () => {
    expect(readChatCommand('hello /who')).toBeNull();
    expect(readChatCommand('/dance')).toBeNull();
    expect(readChatCommand('/invite')).toBeNull();
    expect(readChatCommand('/stress')).toBeNull();
    expect(readChatCommand('/stress many')).toBeNull();
  });

  it('carries out a command instead of saying it', () => {
    const sent = vi.fn();
    const ran = vi.fn();
    setChatSink(sent);
    setChatCommandSink(ran);

    say('/who');
    say('hello');

    expect(ran).toHaveBeenCalledWith({ kind: 'who' });
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent.mock.calls[0]![1]).toBe('hello');
  });
});
