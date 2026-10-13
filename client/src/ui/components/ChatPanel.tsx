/** The built chat log and typing line, used without a build; takes the pointer only when hovered. */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { ArtChatBar, CHAT_SCREEN } from './ArtChatBar';
import { useWornScreen } from '../art/useWorn';
import {
  CHANNELS,
  chatChannel,
  chatLines,
  chatTyping,
  chatWhisperTarget,
  enterPressed,
  say,
  stopWhispering,
  whisper,
} from '../chatStore';
import type { ChannelId } from '../chatStore';
import { CHANNEL_TEXT, UNNAMED_CHANNEL_TEXT } from '../chatTones';

/** How many lines are shown at rest. The rest are scrolled back to. */
const SHOWN = 6;

const BOX =
  'w-full rounded-chrome-sm border border-brass-600 bg-chrome-950 px-2 py-1 ' +
  'font-chrome text-xs text-parchment-100 shadow-recess ' +
  'focus-visible:border-brass-400 focus-visible:outline-none';

export function ChatPanel(): JSX.Element {
  const worn = useWornScreen(CHAT_SCREEN) !== null;
  // Enter brings the chat up to type in, wherever the game has the keys.
  useEffect(() => {
    if (!worn) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.repeat) return;
      const at = event.target as HTMLElement | null;
      const inField =
        !!at && (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA' || at.isContentEditable);
      if (enterPressed(inField)) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [worn]);
  // The shipped bar stands right across the bottom of the view and
  // places itself. Ours sits in the corner, out of the way.
  if (worn) return <ArtChatBar />;
  return (
    <div className="pointer-events-none absolute right-0 bottom-0 left-0 z-hud-float flex justify-start p-2">
      <OwnPanel />
    </div>
  );
}

function OwnPanel(): JSX.Element {
  const lines = chatLines.value;
  const channel = chatChannel.value;
  const target = chatWhisperTarget.value;
  const [typed, setTyped] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // The newest line is the one worth seeing, so the log sits at the
  // bottom of itself unless somebody has scrolled back.
  useEffect(() => {
    const rail = log.current;
    if (!rail) return;
    const back = rail.scrollHeight - rail.clientHeight - rail.scrollTop;
    if (back < 40) rail.scrollTop = rail.scrollHeight;
  }, [lines.length]);

  // Addressed at one player, opening the box focuses it here too — there
  // is no separate "asking" step in this panel to bring the keyboard up.
  useEffect(() => {
    if (target) box.current?.focus();
  }, [target]);

  const send = (): void => {
    if (target) whisper(target.id, typed);
    else say(typed);
    setTyped('');
  };

  return (
    <div className="pointer-events-auto flex w-full max-w-120 flex-col gap-1">
      <div
        ref={log}
        className="max-h-40 overflow-y-auto rounded-chrome-sm bg-chrome-950/65 px-2 py-1 text-xs/relaxed select-text"
        style={{ minHeight: `${SHOWN}ch` }}
      >
        {lines.map(line => (
          <p key={line.key} className="m-0">
            <span className={CHANNEL_TEXT[line.channel] ?? UNNAMED_CHANNEL_TEXT}>
              [{line.channel}] {line.sender}:{' '}
            </span>
            <span className="text-parchment-100">{line.text}</span>
          </p>
        ))}
      </div>

      <form
        className="flex items-center gap-1"
        onSubmit={event => {
          event.preventDefault();
          send();
        }}
      >
        {target ? (
          <span
            className={`${BOX} flex w-32 shrink-0 items-center justify-between gap-1 whitespace-nowrap`}
          >
            <span className="truncate text-chat-whisper">{`To ${target.name}`}</span>
            <button
              type="button"
              aria-label="Cancel whisper"
              onClick={() => stopWhispering()}
              className="cursor-pointer border-0 bg-transparent p-0 text-parchment-200"
            >
              &times;
            </button>
          </span>
        ) : (
          <select
            aria-label="Channel"
            value={channel}
            onChange={event => {
              chatChannel.value = (event.currentTarget as HTMLSelectElement).value as ChannelId;
            }}
            className={`${BOX} w-24`}
          >
            {CHANNELS.map(one => (
              <option key={one.id} value={one.id}>
                {one.name}
              </option>
            ))}
          </select>
        )}
        <input
          ref={box}
          aria-label={target ? `Whisper to ${target.name}` : 'Say something'}
          value={typed}
          maxLength={255}
          onInput={event => setTyped((event.currentTarget as HTMLInputElement).value)}
          // While the box has the keyboard, the game must not take the
          // keys as movement — that is what this says, and the game
          // asks it rather than guessing from what is focused.
          onFocus={() => (chatTyping.value = true)}
          onBlur={() => (chatTyping.value = false)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              stopWhispering();
              box.current?.blur();
            }
          }}
          className={BOX}
        />
      </form>
    </div>
  );
}
