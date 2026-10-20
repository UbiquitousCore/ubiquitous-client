/** How many to take off a stack, on the build's own split box; the client's prompt where the build has none. */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEdit } from '../art/WornEdit';
import { WornHit, WornPanel, useHeld } from '../frontend/wornBits';
import { SplitStackPrompt, splitCount } from './SplitStackPrompt';
import type { SplitStackPromptProps } from './SplitStackPrompt';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const SPLIT_SCREEN = 'split';

export function ArtSplitWindow(props: SplitStackPromptProps): JSX.Element {
  const spec = useWornScreen(SPLIT_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : <SplitStackPrompt {...props} />;
}

function Worn({
  name,
  count,
  onSplit,
  onCancel,
  spec,
}: SplitStackPromptProps & { spec: ScreenSpec }): JSX.Element | null {
  const { hold, faces } = useHeld();
  const [typed, setTyped] = useState(String(Math.floor(count / 2)));
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [], frames: faces },
    // At its own size, not at its place on the movie's screen: the box
    // stands in the middle of whatever view it opens over.
    { movie: spec.movie, unplaced: true },
  );
  const wanted = splitCount(typed, count);
  const split = (): void => {
    if (wanted !== null) onSplit(wanted);
  };
  const on = (what: string): string | undefined =>
    Object.entries(spec.actions ?? {}).find(([, does]) => does === what)?.[0];
  const [where, edit] = Object.entries(spec.edits ?? {})[0] ?? [];
  const field = where ? worn.find(where) : undefined;

  return (
    <div
      role="dialog"
      aria-label={`Split ${name}`}
      className="pointer-events-none fixed inset-0 z-dialog flex items-center justify-center"
      onKeyDown={event => {
        if (event.key === 'Enter') split();
        if (event.key === 'Escape') onCancel();
      }}
    >
      {/* Pressing anywhere beside the box puts it away, the way the
          movie's own sheet across the screen does. */}
      <button
        type="button"
        aria-label="Cancel the split"
        onClick={onCancel}
        className="pointer-events-auto absolute inset-0 cursor-default border-0 bg-transparent p-0"
      />
      {/* The box takes the pointer, so a press on its field types rather
          than falling through to the sheet that cancels. */}
      <div className="pointer-events-auto relative" style={worn.sized}>
        <WornPanel worn={worn} name={spec.dialog}>
          {/* The field's own authored words are the movie's placeholder;
              the count is written there instead. */}
          <WornCaptions worn={worn} spec={spec} tone={LIGHT} hidden={where ? [where] : []} />
          <WornHit
            worn={worn}
            part={worn.find(on('split'))}
            label="Split"
            onHold={hold(on('split'))}
            onPress={split}
          />
        </WornPanel>
        {field && edit ? (
          <WornEdit
            worn={worn}
            part={field}
            name={`How many ${name} to take off`}
            value={typed}
            onInput={setTyped}
            number
            tone={LIGHT}
          />
        ) : null}
      </div>
      <span className="sr-only">{`${name}, ${count} in the stack`}</span>
    </div>
  );
}
