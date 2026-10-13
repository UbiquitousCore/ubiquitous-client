/** The shipped message box asking a question (Yes/No) or telling (one control); the spec names words and mark. */

import type { JSX } from 'preact';

import { cx } from './cx';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEmblem } from '../art/WornEmblem';
import { WornPiece } from '../art/WornPiece';
import { fill } from '../art/wornWords';
import { asked } from '../frontend/ArtConfirmDelete';
import { WornHit, WornLines, WornPanel, shareOf, useHeld } from '../frontend/wornBits';

/**
 * Where the sheet the box lays behind itself goes: over the whole view,
 * the way the movie lays it over the whole of its screen.
 */
const ACROSS_THE_VIEW = { position: 'absolute', inset: 0, width: '100%', height: '100%' } as const;

/** Where the question goes in the box, as a share of its backdrop. */
const ROOM_FOR_THE_QUESTION = { left: 0.06, top: 0.22, width: 0.88, height: 0.44 };

/** How the question is set in that room. */
const SET_THE_QUESTION = {
  textAlign: 'center' as const,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  flexDirection: 'column' as const,
};

export interface ArtAskBoxProps {
  /** Which spec entry holds the question. */
  screen: string;
  /** Who is asking — written into the question where it leaves room for one. */
  name?: string;
  /** What the box is, for a screen reader. */
  label: string;
  /** Which of the spec's words is the question: `prompt` unless said. */
  words?: string;
  /** Figures written into the question's number holes, in order. */
  fills?: readonly (string | number)[];
  /** Words in the question to write in green: what was filled into it. */
  marks?: readonly string[];
  /** True for a question asked over the full map, which is above a window. */
  overMap?: boolean;
  /** What the one control that agrees is called, for a screen reader. */
  acceptLabel?: string;
  onAccept(): void;
  /** Absent for a box that only tells the player something. */
  onDecline?(): void;
}

export function ArtAskBox(props: ArtAskBoxProps): JSX.Element | null {
  const spec = useWornScreen(props.screen);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  spec,
  name = '',
  label,
  words = 'prompt',
  fills,
  marks,
  overMap,
  acceptLabel = 'Accept',
  onAccept,
  onDecline,
}: ArtAskBoxProps & { spec: ScreenSpec }): JSX.Element | null {
  const { hold, faces } = useHeld();
  // The box lays a sheet the size of the movie's screen behind itself.
  // Drawn into the box's own picture it is a dark square under the box,
  // and a dark band around the ring over its top edge.
  const sheet = spec.panels?.sheet;
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: spec.shown ?? [],
      hidden: [...(spec.hidden ?? []), ...(sheet ? [sheet] : [])],
      frames: faces,
    },
    { movie: spec.movie, floats: true, spills: true },
  );
  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];
  // The build writes this question as one or two plain lines, the name
  // inside the first, so no line is picked out in a colour of its own.
  const said = spec.words?.[words];
  const lines = asked(said && fills ? fill(said, ...fills) : said, name);
  const mark = spec.emblems?.mark;
  const backdrop = worn.find([spec.frame ?? []].flat()[0]);

  return (
    <div
      role="alertdialog"
      aria-label={label}
      className={cx(
        'pointer-events-none fixed inset-0 flex items-center justify-center',
        overMap ? 'z-dialog' : 'z-window',
      )}
    >
      {sheet && worn.image ? (
        <WornPiece
          dialog={spec.dialog}
          part={sheet}
          alone
          movie={spec.movie}
          box={ACROSS_THE_VIEW}
        />
      ) : null}
      <div style={worn.sized}>
        <WornPanel worn={worn} name={spec.dialog}>
          {mark ? (
            <WornEmblem worn={worn} at={worn.find(mark.at)} icon={mark.icon} size={mark.size} />
          ) : null}
          <WornCaptions worn={worn} spec={spec} tone={INK} />
          <WornLines
            worn={worn}
            part={worn.fieldOf(worn.find(spec.values?.message))}
            lines={lines}
            colour="inherit"
            marks={marks}
            markColour="var(--color-ask-pick)"
            tone={LIGHT}
            room={{ ...shareOf(worn, backdrop, ROOM_FOR_THE_QUESTION), ...SET_THE_QUESTION }}
          />
          <WornHit
            worn={worn}
            part={worn.find(on('accept'))}
            label={acceptLabel}
            onHold={hold(on('accept'))}
            onPress={onAccept}
          />
          {onDecline ? (
            <WornHit
              worn={worn}
              part={worn.find(on('decline'))}
              label="Decline"
              onHold={hold(on('decline'))}
              onPress={onDecline}
            />
          ) : null}
        </WornPanel>
      </div>
    </div>
  );
}
