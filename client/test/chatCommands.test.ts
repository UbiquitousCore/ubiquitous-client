import { describe, expect, it, vi } from 'vitest';

import { chatCommandHelp, readChatCommand, setChatCommandSink } from '../src/ui/chatCommands';
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
    expect(readChatCommand('/help')).toEqual({ kind: 'help' });
  });

  it('lists every command and its usage for /help', () => {
    const lines = chatCommandHelp();

    expect(lines[0]).toBe('Here are the commands you can use:');
    expect(lines).toContain('/help — list these commands');
    expect(lines).toContain('/stress <count> — spawn a stress-test crowd at the nearest dummy (1–200)');
    expect(lines).toContain('Said to a bot in party chat or a whisper, as the group leader:');
    expect(lines.some(line => line.includes('follow (follow the leader)'))).toBe(true);
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
