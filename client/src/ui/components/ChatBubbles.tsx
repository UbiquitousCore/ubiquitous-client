/** Speech over heads, positioned by writing to nodes each frame rather than re-rendering. */

import { channelColour } from '../chatTones';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { ArtChatSaid, useSaidArt } from './ArtChatSaid';
import { chatSaid, saidFade } from '../chatStore';

export function ChatBubbles(): JSX.Element {
  const said = chatSaid.value;
  // The art itself, not merely whether a spec names it: a box drawn from
  // a movie that has not handed its sheets over yet is an empty box, and
  // an empty box is chat that does not appear.
  const art = useSaidArt();
  const layer = useRef<HTMLDivElement>(null);

  // The layer stands whether or not anybody is talking, which is what
  // keeps this running: hung on a layer that is only there once there is
  // something to show, the loop is started at a moment when there is
  // nothing to hang it on, never started again, and every box after that
  // is drawn where it was left — nowhere, and out of sight.
  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    let frame = 0;
    const paint = (): void => {
      frame = requestAnimationFrame(paint);
      // `peek`, not `value`: writing a position must not re-render the
      // component that owns these nodes.
      for (const one of chatSaid.peek()) {
        const node = root.querySelector<HTMLElement>(`[data-said="${one.key}"]`);
        if (!node) continue;
        if (!one.onScreen) {
          node.style.visibility = 'hidden';
          continue;
        }
        node.style.visibility = 'visible';
        node.style.transform = `translate(${one.x.toFixed(1)}px, ${one.y.toFixed(1)}px) translate(-50%, -100%)`;
        node.style.opacity = saidFade(one).toFixed(2);
      }
    };
    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-hud-float overflow-hidden">
      {said.map(one => (
        <div
          key={one.key}
          data-said={one.key}
          style={
            art
              ? { visibility: 'hidden' }
              : { visibility: 'hidden', color: channelColour(one.channel) }
          }
          className={
            art
              ? 'absolute top-0 left-0'
              : 'absolute top-0 left-0 max-w-60 rounded-chrome-sm bg-chrome-950/65 px-2 py-1 text-center text-xs/snug'
          }
        >
          {art ? <ArtChatSaid said={one} art={art} /> : one.text}
        </div>
      ))}
    </div>
  );
}
