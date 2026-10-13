/** What has been said: a log, and words over speakers' heads, fed by the same arrival. */

import { signal } from '@preact/signals';

import { runChatCommand } from './chatCommands';

/** The channels the server knows, and what each one is called on screen. */
export const CHANNELS = [
  { id: 'say', name: 'Say' },
  { id: 'general', name: 'General' },
  { id: 'trade', name: 'Trade' },
  { id: 'party', name: 'Party' },
] as const;

export type ChannelId = (typeof CHANNELS)[number]['id'];

/** A one-off addressed send, not a channel: a channel value has no target. */
export const WHISPER_CHANNEL = 'whisper';

/** How many lines the log keeps. Older ones are gone, not scrolled to. */
const LOG_DEPTH = 100;

/**
 * How long the latest lines stay up after one arrives while the chat is
 * shut, in ms: long enough to read a couple of lines, then out of the way.
 */
export const PEEK_MS = 6000;

/** Ms words stand over a head, whatever their length. */
export const SAID_LIFETIME_MS = 3500;
/** And how long they take to fade at the end of it. */
export const SAID_FADE_MS = 400;
/** Heads talking at once; the oldest gives way. */
export const SAID_AT_ONCE = 4;

/** How long a line stands over a head. */
export function saidLifetime(): number {
  return SAID_LIFETIME_MS;
}

/** One line in the log. */
export interface ChatLine {
  key: number;
  channel: string;
  sender: string;
  text: string;
}

/** Words over a head; `x`/`y` written each frame, `onScreen` false behind the camera. */
export interface ChatSaid {
  key: number;
  networkId: number;
  sender: string;
  text: string;
  /** Which channel it was said on, which is what colours it. */
  channel: string;
  /** True where the player said it, which the log writes differently. */
  mine: boolean;
  bornAt: number;
  /** How long it stands, which depends on how much was said. */
  livesFor: number;
  x: number;
  y: number;
  onScreen: boolean;
}

export const chatLines = signal<readonly ChatLine[]>([]);
export const chatSaid = signal<readonly ChatSaid[]>([]);
/** Which channel the next thing typed goes to. */
export const chatChannel = signal<ChannelId>('say');
/** True while the player is typing, which is when keys belong to the box. */
export const chatTyping = signal(false);
/** Shut, the bar is just its opener; lines keep arriving either way. */
export const chatOpen = signal(false);
/** The typing box's text, held here because other controls put words in it. */
export const chatDraft = signal('');
/** The typing line: opening the log and asking to type are separate presses. */
export const chatAsking = signal(false);
/** The last thing the player said, for the control that offers it again. */
export const chatLastSaid = signal('');
/** Until when the latest lines peek while shut (`performance.now()`); each arrival extends it. */
export const chatPeekUntil = signal(0);
/** A whisper target for the box, or null for `chatChannel`; sending or backing out clears it. */
export const chatWhisperTarget = signal<{ id: string; name: string } | null>(null);

/** Emotes by the keyword the server knows them by. */
export const EMOTES = [
  'applaud',
  'beg',
  'bow',
  'cheer',
  'cry',
  'dance',
  'flex',
  'kiss',
  'laugh',
  'no',
  'point',
  'rude',
  'salute',
  'shout',
  'shy',
  'talk',
  'wave',
  'work',
  'yes',
  'roar',
  'whistle',
] as const;

export type EmoteName = (typeof EMOTES)[number];

let nextKey = 1;

/** How a message reaches the server. Installed by whatever owns one. */
let send: (channel: string, text: string) => void = () => {};

export function setChatSink(sink: (channel: string, text: string) => void): void {
  send = sink;
}

/** How a whisper reaches the server. Installed by whatever owns one. */
let sendWhisper: (targetId: string, text: string) => void = () => {};

export function setWhisperSink(sink: (targetId: string, text: string) => void): void {
  sendWhisper = sink;
}

/** And how an emote does. */
let perform: (name: string) => void = () => {};

export function setEmoteSink(sink: (name: string) => void): void {
  perform = sink;
}

/** Perform one, by the keyword the server knows it under. */
export function emote(name: string): void {
  if (!EMOTES.includes(name as EmoteName)) return;
  perform(name);
}

/** Enter: a text field's own, else it brings up the chat unless already up. */
export function enterPressed(inTextField: boolean): boolean {
  if (inTextField || chatAsking.peek()) return false;
  openChatToType();
  return true;
}

/** Bring up the whole chat with the box to type in, as Enter does. */
export function openChatToType(): void {
  chatOpen.value = true;
  chatAsking.value = true;
}

/**
 * Put the chat away once something has been said with Enter, leaving the
 * see-through latest lines up so what was just said can be seen.
 */
export function shutChatAfterSaying(now = performance.now()): void {
  chatAsking.value = false;
  chatOpen.value = false;
  chatPeekUntil.value = now + PEEK_MS;
}

/** Say something on the channel that is open. */
export function say(text: string): void {
  const said = text.trim();
  if (said === '') return;
  chatLastSaid.value = said;
  if (runChatCommand(said)) return;
  send(chatChannel.value, said);
}

/**
 * A whisper target that is not a body in sight (a friend across the world)
 * goes by the network id its list row carries, marked so `Game` reads it so.
 */
export function whisperTargetOfNetworkId(networkId: number): string {
  return `${NETWORK_WHISPER}${networkId}`;
}

/** The network id a whisper target names, or undefined for a local unit id. */
export function networkIdOfWhisperTarget(targetId: string): number | undefined {
  return targetId.startsWith(NETWORK_WHISPER)
    ? Number(targetId.slice(NETWORK_WHISPER.length))
    : undefined;
}

const NETWORK_WHISPER = 'net:';

/** Address the box at one player and bring it up; sends nothing by itself. */
export function beginWhisper(targetId: string, targetName: string): void {
  chatWhisperTarget.value = { id: targetId, name: targetName };
  chatDraft.value = '';
  chatOpen.value = true;
  chatAsking.value = true;
}

/** Stop addressing the box at anyone. Sending a whisper does this too. */
export function stopWhispering(): void {
  chatWhisperTarget.value = null;
}

/** Send a whisper; clears the target. Logged only when the server echoes it as delivered. */
export function whisper(targetId: string, text: string): void {
  const said = text.trim();
  if (said === '') return;
  sendWhisper(targetId, said);
  chatWhisperTarget.value = null;
}

/** Channels whose words also stand over the speaker; the rest reach further and stay in the log. */
export const SPOKEN_ALOUD: ReadonlySet<string> = new Set(['say', 'party']);

/** Take a message in; without `networkId` it is only a log line. */
export function noteChat(
  message: { channel: string; sender: string; text: string; mine?: boolean },
  networkId?: number,
): void {
  const key = nextKey++;
  const { mine = false, ...line } = message;
  chatLines.value = [...chatLines.value, { key, ...line }].slice(-LOG_DEPTH);
  chatPeekUntil.value = chatOpen.peek() ? 0 : performance.now() + PEEK_MS;
  if (networkId === undefined || !SPOKEN_ALOUD.has(message.channel)) return;
  chatSaid.value = [
    // One at a time over a head: the newest is what is being said now.
    ...chatSaid.value.filter(one => one.networkId !== networkId),
    {
      key,
      networkId,
      sender: message.sender,
      text: message.text,
      channel: message.channel,
      mine,
      bornAt: performance.now(),
      livesFor: saidLifetime(),
      x: 0,
      y: 0,
      onScreen: false,
    },
  ].slice(-SAID_AT_ONCE);
}

/** Drop whatever has been standing over a head long enough. */
export function forgetOldSaid(now = performance.now()): void {
  const kept = chatSaid.value.filter(one => now - one.bornAt < one.livesFor);
  if (kept.length !== chatSaid.value.length) chatSaid.value = kept;
}

/** How solid a line over a head is, nought to one. */
export function saidFade(said: ChatSaid, now = performance.now()): number {
  const left = said.livesFor - (now - said.bornAt);
  if (left <= 0) return 0;
  return left >= SAID_FADE_MS ? 1 : left / SAID_FADE_MS;
}

/** Forget speech boxes, keeping the log: network ids restart across maps. */
export function clearSaid(): void {
  chatSaid.value = [];
}

/** Everything said is forgotten when the world is left. */
export function clearChat(): void {
  chatLines.value = [];
  chatSaid.value = [];
  chatTyping.value = false;
  chatOpen.value = false;
  chatAsking.value = false;
  chatDraft.value = '';
  chatLastSaid.value = '';
  chatWhisperTarget.value = null;
  chatPeekUntil.value = 0;
}
