/**
 * The speech box over a head, sized to the words. A hook, so the layer above
 * can tell "cannot draw" from "not drawn yet" and avoid empty boxes.
 */

import { channelColour } from '../chatTones';
import type { JSX } from 'preact';

import { useWorn, useWornScreen } from '../art/useWorn';
import { wornLettering } from '../art/wornFont';
import type { ChatSaid } from '../chatStore';

/** Our name for this piece. The spec says which part of the movie it is. */
export const SAID_SCREEN = 'chatSaid';

/** How far in from the box's edges the words sit, in movie units. */
const INSET_ACROSS = 7;
const INSET_DOWN = 2;
/** The lettering size of a line, in movie units. */
const LETTERING = 12;

export interface SaidArt {
  /** The drawn box, to be stretched to whatever is said in it. */
  url: string;
  /** How wide it stands, in pixels. The build keeps this fixed. */
  wide: number;
  /** How the words sit on it. */
  words: JSX.CSSProperties;
  /** What a line said on this channel is written in. */
  tone(said: ChatSaid): string;
}

/** Null where there is no movie to wear, which is the built box's cue. */
export function useSaidArt(): SaidArt | null {
  const spec = useWornScreen(SAID_SCREEN);
  const worn = useWorn(spec?.dialog, spec?.frame, { hidden: spec?.hidden ?? [] }, { floats: true });
  if (!spec || !worn.image || !worn.frame) return null;

  const unit = worn.perUnit;
  return {
    url: worn.image.url,
    wide: worn.frame.w * unit,
    words: {
      padding: `${(INSET_DOWN * unit).toFixed(1)}px ${(INSET_ACROSS * unit).toFixed(1)}px`,
      fontFamily: wornLettering(),
      fontSize: `${(LETTERING * unit).toFixed(1)}px`,
      lineHeight: 1.15,
    },
    // Everyone's words, the player's own included, are written in the
    // colour of the channel they were said on.
    tone: (said: ChatSaid) => spec.tones?.[said.channel] ?? channelColour(said.channel),
  };
}

/** One box, wearing that art. */
export function ArtChatSaid({ said, art }: { said: ChatSaid; art: SaidArt }): JSX.Element {
  return (
    <div className="relative" style={{ width: `${art.wide.toFixed(1)}px` }}>
      {/* Stretched rather than drawn again at each height: the box is a
          flat fill with a thin edge, so stretching it the same way for
          every line it holds looks right. */}
      <img
        src={art.url}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
        draggable={false}
      />
      <p className="relative m-0 break-words" style={{ ...art.words, color: art.tone(said) }}>
        {said.text}
      </p>
    </div>
  );
}
