/** The shipped jump button, where the movie leaves it; a press jumps once and shows its second face. */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { useWorn, useWornScreen } from '../art/useWorn';
import { jumpRoom } from '../spellBarModel';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const JUMP_SCREEN = 'jumpButton';

/** How long the button wears its pressed face, in ms. Own choice. */
export const PRESS_MS = 240;

/** The button stands at its own size in the corner, not at a place on a stage. */
const CORNER = { unplaced: true } as const;

export interface ArtJumpButtonProps {
  onJump(): void;
}

/** Null where there is no movie to wear, which means there is no button. */
export function ArtJumpButton(props: ArtJumpButtonProps): JSX.Element | null {
  const spec = useWornScreen(JUMP_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({ onJump, spec }: ArtJumpButtonProps & { spec: ScreenSpec }): JSX.Element | null {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (!pressed) return;
    const done = window.setTimeout(() => setPressed(false), PRESS_MS);
    return () => window.clearTimeout(done);
  }, [pressed]);
  const face = spec.groups?.face as string;
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    () => ({
      hidden: spec.hidden ?? [],
      frames: { [face]: pressed ? 1 : 0 },
      only: [face],
    }),
    CORNER,
  );
  const room = worn.onStage && worn.stage ? worn.stage.h - worn.onStage.y : 0;
  const taken = room * worn.perUnit;
  useEffect(() => {
    jumpRoom.value = taken;
    return () => {
      jumpRoom.value = 0;
    };
  }, [taken]);
  if (!worn.image || !worn.frame || !worn.onStage || !worn.stage) return null;
  const margin = {
    right: (worn.stage.w - (worn.onStage.x + worn.onStage.w)) * worn.perUnit,
    bottom: (worn.stage.h - (worn.onStage.y + worn.onStage.h)) * worn.perUnit,
  };

  return (
    <div
      className="pointer-events-none fixed z-hud-bar"
      style={{
        right: `max(${margin.right}px, env(safe-area-inset-right))`,
        bottom: `max(${margin.bottom}px, env(safe-area-inset-bottom))`,
        ...worn.sized,
      }}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={worn.sized}
        draggable={false}
      />
      <button
        type="button"
        data-jump
        aria-label="Jump"
        onClick={() => {
          setPressed(true);
          onJump();
        }}
        className="pointer-events-auto absolute inset-0 cursor-pointer rounded-full border-0 bg-transparent p-0 focus-visible:outline-none"
      />
    </div>
  );
}
