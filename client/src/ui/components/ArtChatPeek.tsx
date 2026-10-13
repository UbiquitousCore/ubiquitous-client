/** The latest lines in the translucent box while chat is shut, fading out after a few seconds; pressing opens the log. */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { channelColour } from '../chatTones';
import { chatLines, chatOpen, chatPeekUntil } from '../chatStore';
import { cx } from './cx';

/** Our name for this piece. The spec says which part of the movie it is. */
export const CHAT_PEEK_SCREEN = 'chatPeek';

/** How many of the latest lines the box is handed. It shows those that fit, newest last. */
const LATEST = 8;

/** How long the box takes to fade in or out, in ms. */
const FADE_MS = 300;

export function ArtChatPeek({ tones }: { tones?: Record<string, string> }): JSX.Element | null {
  const spec = useWornScreen(CHAT_PEEK_SCREEN);
  return spec ? <Worn spec={spec} tones={tones} /> : null;
}

function Worn({
  spec,
  tones,
}: {
  spec: ScreenSpec;
  tones?: Record<string, string>;
}): JSX.Element | null {
  const until = chatPeekUntil.value;
  const [, redraw] = useState(0);
  const showing = until > performance.now();

  // Taken down when its time is up, without waiting for something else
  // to draw it again.
  useEffect(() => {
    if (!showing) return;
    const timer = setTimeout(() => redraw(n => n + 1), until - performance.now());
    return () => clearTimeout(timer);
  }, [until, showing]);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [] },
    { floats: true },
  );
  if (!worn.image || !worn.frame) return null;
  const body = worn.fieldOf(worn.find(spec.values?.body));
  const lines = chatLines.value.slice(-LATEST);

  return (
    <button
      type="button"
      aria-label="Open chat"
      aria-hidden={!showing}
      tabIndex={showing ? 0 : -1}
      onClick={() => (chatOpen.value = true)}
      className={cx(
        'relative block cursor-pointer border-0 bg-transparent p-0 text-left transition-opacity',
        'focus-visible:outline-2 focus-visible:outline-brass-300',
        showing ? 'opacity-100' : 'opacity-0',
      )}
      style={{
        ...worn.sized,
        transitionDuration: `${FADE_MS}ms`,
        // Asked for outright: the layer it stands on lets every press
        // through to the world.
        pointerEvents: showing ? 'auto' : 'none',
      }}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        draggable={false}
      />
      {body ? (
        <div
          role="log"
          aria-label="Latest chat"
          className="absolute overflow-hidden"
          // Newest at the bottom, and the oldest the first to go when
          // they do not all fit.
          style={{
            ...worn.words(body, LIGHT, true),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            alignItems: 'stretch',
          }}
        >
          {lines.map(line => (
            <p
              key={line.key}
              className="m-0"
              style={{ color: tones?.[line.channel] ?? channelColour(line.channel) }}
            >
              {line.sender ? `[${line.sender}]: ` : ''}
              {line.text}
            </p>
          ))}
        </div>
      ) : null}
    </button>
  );
}
