/** The dead player's way back, in the build's own message box. */

import type { JSX } from 'preact';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornPiece } from '../art/WornPiece';
import {
  ACROSS_THE_VIEW,
  ROOM_FOR_THE_QUESTION,
  SET_THE_QUESTION,
} from '../frontend/ArtConfirmDelete';
import { WornHit, WornLines, WornPanel, shareOf, useHeld } from '../frontend/wornBits';

export const DEATH_SCREEN = 'death';

/** The word on the control. */
const LABEL = 'textYes';

export function ArtDeathPrompt({
  lines,
  reviveLabel,
  onRevive,
}: {
  /** What the box says. */
  lines: readonly string[];
  /** The word on the control. */
  reviveLabel: string;
  onRevive(): void;
}): JSX.Element | null {
  const spec = useWornScreen(DEATH_SCREEN);
  return spec ? (
    <Worn spec={spec} lines={lines} reviveLabel={reviveLabel} onRevive={onRevive} />
  ) : null;
}

function Worn({
  spec,
  lines,
  reviveLabel,
  onRevive,
}: {
  spec: ScreenSpec;
  lines: readonly string[];
  reviveLabel: string;
  onRevive(): void;
}): JSX.Element | null {
  const { hold, faces } = useHeld();
  const sheet = spec.panels?.sheet;
  const options = { floats: true, spills: true };
  const revive = Object.entries(spec.actions ?? {}).find(([, does]) => does === 'revive')?.[0];
  // The button is drawn again in the middle, so the picture leaves it out.
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
        ...(revive ? [revive] : []),
        LABEL,
      ],
      frames: faces,
    },
    options,
  );
  const backdrop = where.find([spec.frame ?? []].flat()[0]);

  // The movie lays its two buttons out for a question; the one kept moves to the middle.
  const button = where.find(revive);
  const frame = worn.frame;
  const middle =
    button && backdrop && frame
      ? `${((backdrop.box.x + backdrop.box.w / 2 - button.box.w / 2) / frame.w) * 100}%`
      : undefined;
  const label = where.find(LABEL);

  return (
    <div
      role="alertdialog"
      aria-label={lines[0] ?? 'Dead'}
      className="pointer-events-auto fixed inset-0 z-dialog flex items-center justify-center"
    >
      {sheet && worn.image ? (
        <WornPiece dialog={spec.dialog} part={sheet} alone box={ACROSS_THE_VIEW} />
      ) : null}
      <div style={worn.sized}>
        <WornPanel worn={worn} name={spec.dialog}>
          <WornLines
            worn={worn}
            part={worn.fieldOf(worn.find(spec.values?.message))}
            lines={lines}
            colour="inherit"
            tone={LIGHT}
            room={{ ...shareOf(worn, backdrop, ROOM_FOR_THE_QUESTION), ...SET_THE_QUESTION }}
          />
          {button && middle && revive ? (
            <>
              <WornPiece
                dialog={spec.dialog}
                part={revive}
                alone
                face={faces[revive]}
                box={{ ...worn.box(button), left: middle }}
              />
              {label ? (
                <span style={{ ...worn.words(label, INK), left: middle }}>{reviveLabel}</span>
              ) : null}
              <WornHit
                worn={worn}
                part={{
                  ...button,
                  box: {
                    ...button.box,
                    x: backdrop!.box.x + backdrop!.box.w / 2 - button.box.w / 2,
                  },
                }}
                label={reviveLabel}
                onHold={hold(revive)}
                onPress={onRevive}
              />
            </>
          ) : null}
        </WornPanel>
      </div>
    </div>
  );
}
