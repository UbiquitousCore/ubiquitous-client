/**
 * What is said, where it stands, and how long for.
 *
 * The rules worth holding are all about the boxes over heads: one box
 * per speaker, a few at once, and a box that stands longer the more was
 * said in it. The log is the simpler half — it keeps what it is given,
 * newest last, and drops the oldest when it is full.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMOTES,
  PEEK_MS,
  SAID_FADE_MS,
  SAID_LIFETIME_MS,
  SAID_AT_ONCE,
  WHISPER_CHANNEL,
  beginWhisper,
  chatAsking,
  chatLastSaid,
  chatLines,
  chatOpen,
  chatPeekUntil,
  chatSaid,
  chatWhisperTarget,
  clearChat,
  clearSaid,
  forgetOldSaid,
  noteChat,
  saidFade,
  emote,
  say,
  setChatSink,
  setEmoteSink,
  setWhisperSink,
  stopWhispering,
  whisper,
} from '../src/ui/chatStore';

beforeEach(() => {
  clearChat();
  setChatSink(() => {});
  setWhisperSink(() => {});
});

const said = (text: string, who: number, sender = 'Someone'): void =>
  noteChat({ channel: 'say', sender, text }, who);

describe('the log', () => {
  it('keeps what arrives, newest last', () => {
    noteChat({ channel: 'say', sender: 'A', text: 'first' });
    noteChat({ channel: 'general', sender: 'B', text: 'second' });

    expect(chatLines.value.map(line => line.text)).toEqual(['first', 'second']);
  });

  it('holds a line for a speaker who is nowhere in view', () => {
    noteChat({ channel: 'general', sender: 'Far away', text: 'hello' });

    expect(chatLines.value).toHaveLength(1);
    expect(chatSaid.value).toHaveLength(0);
  });
});

describe('what stands over a head', () => {
  it('replaces whatever that speaker was saying before', () => {
    said('first', 7);
    said('second', 7);

    expect(chatSaid.value.map(one => one.text)).toEqual(['second']);
  });

  it('keeps only the newest few speakers', () => {
    for (let who = 1; who <= SAID_AT_ONCE + 2; who += 1) said(`line ${who}`, who);

    expect(chatSaid.value).toHaveLength(SAID_AT_ONCE);
    expect(chatSaid.value[0]?.networkId).toBe(3);
  });

  it('stands for the same time whatever was said', () => {
    said('hi', 7);
    said('a much longer thing to read than that one was', 8);

    expect(chatSaid.value.map(one => one.livesFor)).toEqual([SAID_LIFETIME_MS, SAID_LIFETIME_MS]);
  });

  it('fades over its last moment and is then forgotten', () => {
    vi.useFakeTimers();
    try {
      const now = vi.spyOn(performance, 'now');
      now.mockReturnValue(0);
      said('hi', 7);
      const one = chatSaid.value[0]!;

      expect(saidFade(one, 0)).toBe(1);
      expect(saidFade(one, one.livesFor - SAID_FADE_MS / 2)).toBeCloseTo(0.5, 2);
      expect(saidFade(one, one.livesFor)).toBe(0);

      forgetOldSaid(one.livesFor + 1);
      expect(chatSaid.value).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the player’s own words as theirs', () => {
    noteChat({ channel: 'say', sender: 'Me', text: 'mine', mine: true }, 7);

    expect(chatSaid.value[0]?.mine).toBe(true);
  });

  it('forgets the boxes without forgetting the log', () => {
    said('hi', 7);
    clearSaid();

    expect(chatSaid.value).toHaveLength(0);
    expect(chatLines.value).toHaveLength(1);
  });
});

describe('emotes', () => {
  it('performs one the server knows', () => {
    const done: string[] = [];
    setEmoteSink(name => done.push(name));

    emote(EMOTES[0]);

    expect(done).toEqual([EMOTES[0]]);
  });

  it('refuses one it does not', () => {
    const done: string[] = [];
    setEmoteSink(name => done.push(name));

    emote('pirouette');

    expect(done).toEqual([]);
  });
});

describe('saying something', () => {
  it('sends what was typed on the channel that is open', () => {
    const sent: Array<[string, string]> = [];
    setChatSink((channel, text) => sent.push([channel, text]));

    say('  hello  ');

    expect(sent).toEqual([['say', 'hello']]);
  });

  it('keeps the last line, for the control that offers it again', () => {
    setChatSink(() => {});

    say('once more');

    expect(chatLastSaid.value).toBe('once more');
  });

  it('says nothing at all for an empty line', () => {
    const sent: string[] = [];
    setChatSink((_channel, text) => sent.push(text));

    say('   ');

    expect(sent).toEqual([]);
  });
});

describe('whispering', () => {
  it('addresses the box at one player and brings it up', () => {
    beginWhisper('mob-1', 'Rock Elemental');

    expect(chatWhisperTarget.value).toEqual({ id: 'mob-1', name: 'Rock Elemental' });
    expect(chatOpen.value).toBe(true);
    expect(chatAsking.value).toBe(true);
  });

  it('sends a private message to the addressed player, not the open channel', () => {
    const sent: Array<[string, string]> = [];
    setWhisperSink((targetId, text) => sent.push([targetId, text]));
    const said: Array<[string, string]> = [];
    setChatSink((channel, text) => said.push([channel, text]));

    whisper('mob-1', '  hello  ');

    expect(sent).toEqual([['mob-1', 'hello']]);
    expect(said).toEqual([]);
  });

  it('logs nothing on its own — a self-whisper or an offline target is refused server-side, so only the server echo logs a sent line', () => {
    setWhisperSink(() => {});

    whisper('mob-1', 'hello');

    expect(chatLines.value).toHaveLength(0);
    expect(chatSaid.value).toHaveLength(0);
  });

  it('sends nothing at all for an empty line', () => {
    const sent: Array<[string, string]> = [];
    setWhisperSink((targetId, text) => sent.push([targetId, text]));

    whisper('mob-1', '   ');

    expect(sent).toEqual([]);
    expect(chatLines.value).toHaveLength(0);
  });

  it('stops addressing the box once sent, so the next line goes to the open channel', () => {
    setWhisperSink(() => {});
    beginWhisper('mob-1', 'Rock Elemental');

    whisper('mob-1', 'hello');

    expect(chatWhisperTarget.value).toBeNull();
  });

  it('can be backed out of without sending anything', () => {
    beginWhisper('mob-1', 'Rock Elemental');

    stopWhispering();

    expect(chatWhisperTarget.value).toBeNull();
  });

  it('notes an incoming whisper in the log only, under its own channel', () => {
    noteChat({ channel: WHISPER_CHANNEL, sender: 'Rock Elemental', text: 'hi there' });

    expect(chatLines.value).toEqual([
      expect.objectContaining({
        channel: WHISPER_CHANNEL,
        sender: 'Rock Elemental',
        text: 'hi there',
      }),
    ]);
    expect(chatSaid.value).toHaveLength(0);
  });

  it('notes a sent whisper once the server confirms it, marked as the player’s own', () => {
    noteChat({ channel: WHISPER_CHANNEL, sender: 'To Rock Elemental', text: 'hello', mine: true });

    expect(chatLines.value).toEqual([
      expect.objectContaining({
        channel: WHISPER_CHANNEL,
        sender: 'To Rock Elemental',
        text: 'hello',
      }),
    ]);
    expect(chatSaid.value).toHaveLength(0);
  });

  it('is forgotten when the world is left', () => {
    beginWhisper('mob-1', 'Rock Elemental');

    clearChat();

    expect(chatWhisperTarget.value).toBeNull();
  });
});

describe('the latest lines, while the chat is shut', () => {
  it('come up for a while whenever a line arrives on any channel', () => {
    const before = performance.now();
    noteChat({ channel: 'general', sender: 'Far away', text: 'hello' });
    expect(chatPeekUntil.value).toBeGreaterThanOrEqual(before + PEEK_MS);
  });

  it('start their time again with every line', () => {
    vi.useFakeTimers();
    try {
      noteChat({ channel: 'say', sender: 'A', text: 'one' });
      const first = chatPeekUntil.value;
      vi.advanceTimersByTime(1000);
      noteChat({ channel: 'trade', sender: 'B', text: 'two' });
      expect(chatPeekUntil.value).toBeGreaterThan(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('do not come up while the log itself is open', () => {
    chatOpen.value = true;
    noteChat({ channel: 'say', sender: 'A', text: 'one' });
    expect(chatPeekUntil.value).toBe(0);
  });

  it('are taken down when the world is left', () => {
    noteChat({ channel: 'say', sender: 'A', text: 'one' });
    clearChat();
    expect(chatPeekUntil.value).toBe(0);
  });
});
