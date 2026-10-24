/** Telling the player something that needs an OK, in the build's message box and words. */

import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornPiece } from '../art/WornPiece';
import {
  ACROSS_THE_VIEW,
  ROOM_FOR_THE_MARK,
  ROOM_FOR_THE_QUESTION,
  SET_THE_QUESTION,
  STAND_THE_MARK,
  WARNING_ICON,
} from './ArtConfirmDelete';
import { WornHit, WornLines, WornPanel, WornPicture, shareOf, useHeld } from './wornBits';

export const NOTICE_SCREEN = 'notice';

/** The word on the button, which the movie writes in a field of its own. */
const LABEL = 'textYes';

/** How many letters a line of the box holds before the words carry on below. */
const LINE_WIDTH = 34;

/** The words in lines no longer than `width`, breaking between words. */
export function wrapped(text: string, width = LINE_WIDTH): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function ArtNotice({
  text,
  onClose,
}: {
  text: string;
  onClose(): void;
}): JSX.Element | null {
  const spec = useWornScreen(NOTICE_SCREEN);
  return spec ? <Worn spec={spec} text={text} onClose={onClose} /> : null;
}

function Worn({
  spec,
  text,
  onClose,
}: {
  spec: ScreenSpec;
  text: string;
  onClose(): void;
}): JSX.Element | null {
  const { hold, faces } = useHeld();
  const sheet = spec.panels?.sheet;
  const confirm = Object.entries(spec.actions ?? {}).find(([, does]) => does === 'confirm')?.[0];
  const options = { movie: spec.movie, floats: true, spills: true };
  // The button and its word are drawn again in the middle of the box, so
  // the picture leaves them out; where they stand in the movie is read
  // from the same box with them in.
  const where = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: [...(spec.hidden ?? []), ...(sheet ? [sheet] : [])] },
    options,
  );
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: spec.shown ?? [],
      hidden: [
        ...(spec.hidden ?? []),
        ...(sheet ? [sheet] : []),
        ...(confirm ? [confirm] : []),
        LABEL,
      ],
      frames: faces,
    },
    options,
  );
  const backdrop = where.find([spec.frame ?? []].flat()[0]);

  // Enter and Escape both say OK: there is nothing else to answer.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // The movie puts its two buttons either side of the middle; the one kept
  // is moved to the middle of the box.
  const button = where.find(confirm);
  const frame = worn.frame;
  const middle =
    button && backdrop && frame
      ? `${((backdrop.box.x + backdrop.box.w / 2 - button.box.w / 2) / frame.w) * 100}%`
      : undefined;
  const label = where.find(LABEL);

  return (
    // Over the middle of the view, and over everything under it: the box
    // is answered before anything else is.
    <div
      role="alertdialog"
      aria-label={text}
      className="pointer-events-auto fixed inset-0 z-window flex items-center justify-center"
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
        <WornPanel worn={worn} name="notice">
          <WornPicture
            worn={worn}
            at={worn.find('displayCallback')}
            file={WARNING_ICON}
            room={{ ...shareOf(worn, backdrop, ROOM_FOR_THE_MARK), ...STAND_THE_MARK }}
          />
          <WornLines
            worn={worn}
            part={worn.fieldOf(worn.find(spec.values?.message))}
            lines={wrapped(text)}
            colour="inherit"
            tone={LIGHT}
            room={{ ...shareOf(worn, backdrop, ROOM_FOR_THE_QUESTION), ...SET_THE_QUESTION }}
          />
          {button && middle && confirm ? (
            <>
              <WornPiece
                dialog={spec.dialog}
                part={confirm}
                alone
                movie={spec.movie}
                face={faces[confirm]}
                box={{ ...worn.box(button), left: middle }}
              />
              {label ? <span style={{ ...worn.words(label, INK), left: middle }}>OK</span> : null}
              <WornHit
                worn={worn}
                part={{
                  ...button,
                  box: {
                    ...button.box,
                    x: backdrop!.box.x + backdrop!.box.w / 2 - button.box.w / 2,
                  },
                }}
                label="OK"
                onHold={hold(confirm)}
                onPress={onClose}
              />
            </>
          ) : null}
        </WornPanel>
      </div>
    </div>
  );
}
