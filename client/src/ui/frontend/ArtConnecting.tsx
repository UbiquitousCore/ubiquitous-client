/** Waiting for the server, in the build's "connecting" box and words. */

import type { JSX } from 'preact';

import { INK, useWorn, useWornScreen } from '../art/useWorn';
import type { ScreenSpec } from '../art/uiSpec';
import { WornCaptions } from '../art/WornCaptions';
import { WornHit, WornPanel, useHeld } from './wornBits';

export const CONNECTING_SCREEN = 'connecting';

export function ArtConnecting({ onCancel }: { onCancel(): void }): JSX.Element | null {
  const spec = useWornScreen(CONNECTING_SCREEN);
  return spec ? <Worn spec={spec} onCancel={onCancel} /> : null;
}

function Worn({ spec, onCancel }: { spec: ScreenSpec; onCancel(): void }): JSX.Element | null {
  const { hold, faces } = useHeld();
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [], frames: faces },
    { movie: spec.movie, floats: true, spills: true },
  );
  const cancel = Object.entries(spec.actions ?? {}).find(([, does]) => does === 'cancel')?.[0];

  return (
    // Over the middle of the view, on top of the sign-in screen.
    <div
      role="alertdialog"
      aria-label="Connecting"
      className="pointer-events-none fixed inset-0 z-window flex items-center justify-center"
    >
      <div style={worn.sized}>
        <WornPanel worn={worn} name="connecting">
          <WornCaptions worn={worn} spec={spec} tone={INK} />
          <WornHit
            worn={worn}
            part={worn.find(cancel)}
            label="Cancel"
            onHold={hold(cancel)}
            onPress={onCancel}
          />
        </WornPanel>
      </div>
    </div>
  );
}
