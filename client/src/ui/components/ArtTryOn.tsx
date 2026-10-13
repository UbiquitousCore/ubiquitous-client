/** The fitting room: the hero wearing tried-on pieces until Reset; nothing is equipped. */

import type { JSX } from 'preact';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { CharacterBody } from './BodyStage';

/** Our name for this screen. The spec says which dialog wears it. */
export const FITTING_ROOM_SCREEN = 'fittingRoom';

/** The fitting room stands in a row beside the sheet, not at a place on a stage. */
const ROW = { unplaced: true } as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtTryOnProps {
  /** The pieces being tried on, by entry, in the order they were. */
  entries: readonly number[];
  onReset(): void;
  onClose(): void;
}

export function ArtTryOn(props: ArtTryOnProps): JSX.Element | null {
  const spec = useWornScreen(FITTING_ROOM_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  entries,
  onReset,
  onClose,
  spec,
}: ArtTryOnProps & { spec: ScreenSpec }): JSX.Element | null {
  const worn = useWorn(spec.dialog, spec.frame, { hidden: spec.hidden ?? [] }, ROW);
  if (!worn.image || !worn.frame) return null;
  const room = worn.find(spec.groups?.room);
  const close = worn.find(spec.close);
  const reset = Object.entries(spec.actions ?? {}).find(([, does]) => does === 'reset')?.[0];
  const resetPart = worn.find(reset);

  return (
    <div
      role="dialog"
      aria-label="Fitting room"
      className="relative touch-none overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-auto"
        draggable={false}
      />
      <WornCaptions worn={worn} spec={spec} tone={INK} />
      {room && (
        <div className="absolute overflow-hidden" style={worn.box(room)}>
          <CharacterBody tryOn={entries} />
        </div>
      )}
      {resetPart && (
        <button
          type="button"
          aria-label="Reset"
          onClick={onReset}
          style={worn.box(resetPart)}
          className={HIT}
        />
      )}
      {close && (
        <button
          type="button"
          aria-label="Close the fitting room"
          onClick={onClose}
          style={worn.box(close)}
          className={HIT}
        />
      )}
    </div>
  );
}
