/** A summon stone's window in shipped art: the other members of the team, one to a plaque. */

import type { JSX } from 'preact';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { unavailableFaces } from '../art/wornState';

/** Our name for this screen. The spec says which dialog wears it. */
export const SUMMON_SCREEN = 'summon';

export interface SummonRow {
  name: string;
  /** False for a member the stone cannot call; the plaque wears its unavailable face. */
  canSummon: boolean;
  onPick(): void;
}

export interface ArtSummonWindowProps {
  rows: readonly SummonRow[];
  onClose(): void;
}

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300 disabled:cursor-default';

export function ArtSummonWindow(props: ArtSummonWindowProps): JSX.Element | null {
  const spec = useWornScreen(SUMMON_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  rows,
  onClose,
  spec,
}: ArtSummonWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const plaques = Object.entries(spec.actions ?? {});
  // Own choice: a plaque with nobody on it keeps its place, unavailable,
  // so the window keeps the shape it was drawn with.
  const can = Object.fromEntries(
    plaques.map(([, what], index) => [what, rows[index]?.canSummon ?? false]),
  );
  const faces = unavailableFaces(spec, can);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: [...(spec.shown ?? []), ...faces.shown],
      hidden: [...(spec.hidden ?? []), ...faces.hidden],
    },
    { floats: true },
  );
  if (!worn.image || !worn.frame) return null;
  const closePart = worn.find(spec.close);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Summon"
      data-summon-worn
      className="pointer-events-auto relative overflow-hidden"
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block max-h-[85dvh] max-w-[92vw]"
        style={worn.sized}
        draggable={false}
      />
      <WornCaptions worn={worn} spec={spec} tone={INK} />

      {plaques.map(([control, what], index) => {
        const row = rows[index];
        const part = worn.find(control);
        if (!row || !part) return null;
        const field = worn.fieldOf(worn.find(spec.values?.[what]));
        return (
          <div key={control}>
            <button
              type="button"
              data-summon-member={index}
              aria-label={`Summon ${row.name}`}
              disabled={!row.canSummon}
              onClick={row.onPick}
              style={worn.box(part)}
              className={HIT}
            />
            {field ? <span style={worn.words(field, INK)}>{row.name}</span> : null}
          </div>
        );
      })}

      {closePart ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={worn.box(closePart)}
          className={HIT}
        />
      ) : null}
    </div>
  );
}
