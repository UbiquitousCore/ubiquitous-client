import { afterEach, describe, expect, it } from 'vitest';
import { chatLines, chatSaid, clearChat, noteChat } from '../../src/ui/chatStore';

afterEach(() => clearChat());

/**
 * Words stand over a head only on the channels spoken aloud nearby: Speak,
 * Team and a creature's yell. Local, trade, guild and global reach past the
 * speaker, and stay in the log.
 */
describe('which channels stand over a head', () => {
  it('stands what is said aloud and to the team over the speaker', () => {
    noteChat({ channel: 'say', sender: 'Someone', text: 'Well met.' }, 7);
    noteChat({ channel: 'party', sender: 'Someone Else', text: 'This way.' }, 8);
    expect(chatSaid.value.map(one => one.channel)).toEqual(['say', 'party']);
  });

  it("stands a creature's yell over the creature", () => {
    noteChat({ channel: 'yell', sender: 'Cosmo', text: 'Give me your power!' }, 9);
    expect(chatSaid.value.map(one => [one.channel, one.networkId])).toEqual([['yell', 9]]);
  });

  it('keeps local, trade, guild and global in the log only', () => {
    for (const channel of ['general', 'trade', 'guild', 'global']) {
      noteChat({ channel, sender: 'Someone', text: 'Anyone?' }, 7);
    }
    expect(chatSaid.value).toEqual([]);
    expect(chatLines.value).toHaveLength(4);
  });
});
