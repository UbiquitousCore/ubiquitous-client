/** Asking before deleting a character, in the in-game movie's message box and words. */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornPiece } from '../art/WornPiece';
import { WornHit, WornLines, WornPanel, WornPicture, shareOf, useHeld } from './wornBits';

export const DELETE_SCREEN = 'deleteCharacter';

/** How long the yes is held down for, in milliseconds. */
export const HOLD_TO_DELETE = 3000;

/** Where the question goes in the box, as a share of its backdrop. */
const ROOM_FOR_THE_QUESTION = { left: 0.06, top: 0.26, width: 0.88, height: 0.38 };

/** How the question is set in that room. */
const SET_THE_QUESTION = {
  textAlign: 'center' as const,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  flexDirection: 'column' as const,
};

/** What the name in the question is written in. */
const NAME_COLOUR = 'var(--color-asked-name)';

/** The mark the build puts on a box that asks something like this. */
const WARNING_ICON = 'msgbox/warnning.png';

/** The mark's spot in the box's top ring; the movie gives only a point. */
const ROOM_FOR_THE_MARK = { left: 0.5, top: 0.12, width: 0, height: 0.13 };

/** How the mark stands in that room: centred on it, as wide as its shape makes it. */
const STAND_THE_MARK = { width: 'auto', transform: 'translate(-50%, -50%)' };

/**
 * Where the sheet the box lays behind itself goes: over the whole view,
 * the way the movie lays it over the whole of its screen.
 */
const ACROSS_THE_VIEW = { position: 'absolute', inset: 0, width: '100%', height: '100%' } as const;

export function ArtConfirmDelete({
  name,
  onConfirm,
  onCancel,
}: {
  /** The character being asked about. */
  name: string;
  onConfirm(): void;
  onCancel(): void;
}): JSX.Element | null {
  const spec = useWornScreen(DELETE_SCREEN);
  return spec ? <Worn spec={spec} name={name} onConfirm={onConfirm} onCancel={onCancel} /> : null;
}

function Worn({
  spec,
  name,
  onConfirm,
  onCancel,
}: {
  spec: ScreenSpec;
  name: string;
  onConfirm(): void;
  onCancel(): void;
}): JSX.Element | null {
  const { hold, faces } = useHeld();
  // The box lays a sheet the size of the movie's screen behind itself,
  // which drawn into the box's own picture is a dark square under it.
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
  const backdrop = worn.find([spec.frame ?? []].flat()[0]);
  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];

  // Three seconds on the yes, which is what the question's own words
  // promise.
  const since = useRef<number | null>(null);
  const [held, setHeld] = useState(false);
  const holding = (down: boolean): void => {
    since.current = down ? Date.now() : null;
    setHeld(down);
  };
  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => {
      if (since.current !== null) onConfirm();
    }, HOLD_TO_DELETE);
    return () => clearTimeout(timer);
  }, [held]);

  return (
    // Over the middle of the view: it is asked on top of whatever is
    // already there.
    <div className="pointer-events-none fixed inset-0 z-window flex items-center justify-center">
      {/* A box of its own to be centred in: the panel inside it stands
          where the movie stands it, which is not the middle of
          anything. */}
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
        <WornPanel worn={worn} name="confirm-delete">
          <WornCaptions worn={worn} spec={spec} tone={INK} />
          {/* The mark on the box, where the movie leaves a point for the
            build to draw one. */}
          <WornPicture
            worn={worn}
            at={worn.find('displayCallback')}
            file={WARNING_ICON}
            room={{ ...shareOf(worn, backdrop, ROOM_FOR_THE_MARK), ...STAND_THE_MARK }}
          />

          {/* The question, across the middle of the box: the field the
            movie marks holds one line and this is three, and the middle
            one is the name, written in its own colour. */}
          <WornLines
            worn={worn}
            part={worn.fieldOf(worn.find(spec.values?.message))}
            lines={asked(spec.words?.prompt, name)}
            colour={NAME_COLOUR}
            tone={LIGHT}
            room={{ ...shareOf(worn, backdrop, ROOM_FOR_THE_QUESTION), ...SET_THE_QUESTION }}
          />
          {/* Held, not pressed: the question asks for three seconds on
            it. */}
          <WornHit
            worn={worn}
            part={worn.find(on('confirm'))}
            label="Delete"
            onHold={down => {
              hold(on('confirm'))(down);
              holding(down);
            }}
            onPress={() => {}}
          />
          <WornHit
            worn={worn}
            part={worn.find(on('cancel'))}
            label="Keep"
            onHold={hold(on('cancel'))}
            onPress={onCancel}
          />
        </WornPanel>
      </div>
    </div>
  );
}

/** The build's question with the character's name, its markup tags stripped. */
export function asked(line: string | undefined, name: string): string[] {
  if (!line) return [];
  return line
    .replace(/\u0012[^\u0013]*\u0013/g, '')
    .replace(/%s/, name)
    .replace(/%[0-9a-zA-Z]/g, '')
    .split('\n')
    .map(part => part.trim())
    .filter(Boolean);
}
