/** About this client, in the build's About panel. */

import type { JSX } from 'preact';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';
import { WornHit, WornPanel, WornSays } from './wornBits';

export const ABOUT_SCREEN = 'about';

/** How much of its own size the panel is shown at. */
const SHOWN_AT = 0.62;

/** What the panel is headed. */
const TITLE = 'About this client';

/** And what it says. Ours, in plain words, and short enough to read. */
const BLURB = [
  'An unofficial, non-commercial browser client that reads Order & Chaos Online game files.' +
    ' Not affiliated with or endorsed by Gameloft.',
  'It reads the game from a copy you already own: point it at your own' +
    ' .ipa and it reads, decodes and displays the maps, models, sounds and' +
    ' screens from it. Nothing from the game is redistributed with it;' +
    ' everything it shows is read from your own copy.',
  'The world, the characters and every screen before them are drawn from' +
    ' that data, and it talks to a server of this project’s own.',
].join('\n\n');

export function ArtAbout({ onClose }: { onClose(): void }): JSX.Element | null {
  const spec = useWornScreen(ABOUT_SCREEN);
  return spec ? <Worn spec={spec} onClose={onClose} /> : null;
}

function Worn({ spec, onClose }: { spec: ScreenSpec; onClose(): void }): JSX.Element | null {
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [] },
    { movie: spec.movie, floats: true },
  );
  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];

  return (
    <div className="pointer-events-none fixed inset-0 z-window flex items-center justify-center">
      {/* The build draws this panel across a phone's whole screen. On a
          window it is shown smaller, as a panel rather than a page. */}
      <div style={{ ...worn.sized, transform: `scale(${SHOWN_AT})` }}>
        <WornPanel worn={worn} name="about">
          <WornSays
            worn={worn}
            part={worn.fieldOf(worn.find(spec.values?.title))}
            text={TITLE}
            tone={INK}
          />
          <WornSays
            worn={worn}
            part={worn.fieldOf(worn.find(spec.values?.body))}
            text={BLURB}
            tone={INK}
            wrap
            scrolls
            room={ROOM_FOR_THE_WORDS}
          />
          <WornHit worn={worn} part={worn.find(on('close'))} label="Close" onPress={onClose} />
        </WornPanel>
      </div>
    </div>
  );
}

/**
 * Where the words go, as a share of the panel.
 *
 * The movie marks a column down the left of it for them — the build
 * writes in two, one per language — and one column of words in the
 * middle of the panel reads better than half of it left empty.
 */
const ROOM_FOR_THE_WORDS = {
  left: '6%',
  top: '18%',
  width: '88%',
  height: '72%',
};
