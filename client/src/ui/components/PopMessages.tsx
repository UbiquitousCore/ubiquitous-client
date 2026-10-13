/** Loot pop-messages, drawn: XP/coin/items rise from the hero's head and fade;
 * level-ups take the banner slot. Positions written per-frame onto the nodes
 * (no HUD re-render per glyph). */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { popFade, popMessages, popRise, popScale } from '../popMessages';

/** The lettering size of a pop message. */
const FONT_PX = 16;

/**
 * The one colour the queue uses: yellow. The same channel
 * token the experience gauge takes, so the two agree about what experience
 * looks like.
 */
const POP_COLOUR = 'var(--color-channel-exp)';

export function PopMessages(): JSX.Element {
  const messages = popMessages.value;
  const layer = useRef<HTMLDivElement>(null);

  // The layer stands whether or not there is anything on it: hung on one
  // that is only there once there is, the loop is started at a moment
  // when there is nothing to hang it on and never started again, and
  // every line after that is drawn in the corner it was born in.
  useEffect(() => {
    const root = layer.current;
    if (!root) return;

    let frame = 0;
    const paint = (): void => {
      frame = requestAnimationFrame(paint);
      // `peek`, not `value`: this loop must not subscribe, or writing a
      // position would re-render the component that owns these nodes.
      for (const message of popMessages.peek()) {
        const node = root.querySelector<HTMLElement>(`[data-pop="${message.key}"]`);
        if (!node) continue;
        const scale = popScale(message);
        if (message.place === 'banner') {
          node.style.transform = `translate(-50%, 0) scale(${scale.toFixed(3)})`;
        } else if (message.onScreen) {
          node.style.transform =
            `translate(${message.x.toFixed(1)}px, ${(message.y - popRise(message)).toFixed(1)}px)` +
            ` translate(-50%, -50%) scale(${scale.toFixed(3)})`;
          node.style.visibility = 'visible';
        } else {
          // Behind the camera: stop drawing it rather than pinning it to an
          // edge, the same call `trackFloatingNumbers` makes.
          node.style.visibility = 'hidden';
        }
        node.style.opacity = popFade(message).toFixed(3);
      }
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      ref={layer}
      className="pointer-events-none fixed inset-0 z-hud-float"
      // One region, announced once per change: a screen reader is told what
      // was gained, not re-read the lines still fading on screen.
      role="status"
      aria-live="polite"
    >
      {messages.map(message => (
        <p
          key={message.key}
          data-pop={message.key}
          className={
            'absolute m-0 text-center font-chrome font-bold whitespace-pre-line ' +
            'drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]' +
            (message.place === 'banner' ? 'top-1/3 left-1/2' : 'top-0 left-0')
          }
          // Out of sight until the loop has put it where it belongs: a
          // line drawn before its first frame lands in the corner the
          // layer starts at, which is not where it was ever going.
          style={{
            color: POP_COLOUR,
            fontSize: `${FONT_PX}px`,
            visibility: message.place === 'banner' ? undefined : 'hidden',
          }}
        >
          {message.text}
        </p>
      ))}
    </div>
  );
}
