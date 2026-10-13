import { describe, expect, it } from 'vitest';

import { CHANNELS, WHISPER_CHANNEL } from '../../src/ui/chatStore';
import { CHANNEL_TEXT, UNNAMED_CHANNEL_TEXT, channelColour } from '../../src/ui/chatTones';
import { colour } from '../helpers/themeTokens';

describe('the colour of a chat line', () => {
  it('tells every channel apart, whispers and notices included', () => {
    const ids = [...CHANNELS.map(one => one.id), WHISPER_CHANNEL, 'notice'];
    const classes = ids.map(id => CHANNEL_TEXT[id]);
    expect(classes.every(Boolean)).toBe(true);
    expect(new Set(classes).size).toBe(ids.length);
  });

  it('names only colours the theme defines', () => {
    for (const cls of [...Object.values(CHANNEL_TEXT), UNNAMED_CHANNEL_TEXT]) {
      expect(() => colour(cls.slice('text-'.length))).not.toThrow();
    }
  });

  it('says the same colour as a value as it does as a class', () => {
    expect(channelColour('party')).toBe('var(--color-chat-party)');
    expect(channelColour(WHISPER_CHANNEL)).toBe('var(--color-chat-whisper)');
  });

  it('writes a channel it does not know in the plain log colour', () => {
    expect(channelColour('somewhere-new')).toBe(
      `var(--color-${UNNAMED_CHANNEL_TEXT.slice('text-'.length)})`,
    );
  });
});
