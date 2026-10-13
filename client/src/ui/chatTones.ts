/** Chat channel colours as a utility (`CHANNEL_TEXT`) and a value (`channelColour`), theme tokens only. */

import { WHISPER_CHANNEL } from './chatStore';

/** The utility class each channel's lines are written in. */
export const CHANNEL_TEXT: Readonly<Record<string, string>> = {
  say: 'text-quality-common',
  general: 'text-chat-general',
  trade: 'text-brass-300',
  party: 'text-chat-party',
  notice: 'text-notice',
  [WHISPER_CHANNEL]: 'text-chat-whisper',
};

/** A channel with no colour of its own is written in the plain log colour. */
export const UNNAMED_CHANNEL_TEXT = 'text-parchment-200';

/** The colour a channel's lines are written in, as a CSS value. */
export function channelColour(channel: string): string {
  const token = (CHANNEL_TEXT[channel] ?? UNNAMED_CHANNEL_TEXT).slice('text-'.length);
  return `var(--color-${token})`;
}
