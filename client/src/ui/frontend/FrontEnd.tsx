/** Everything before the world, over the build's selection scene (`renderer/SelectionScene`); dragging turns the body. */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import { ArtChooseCharacter, CHARACTERS_SCREEN } from './ArtChooseCharacter';
import { ArtMakeCharacter, STEP_SCREEN } from './ArtMakeCharacter';
import { ArtSignIn } from './ArtSignIn';
import { SIGN_IN_SCREEN } from './ArtSignIn';
import { useWornScreen } from '../art/useWorn';
import { WornStage } from '../art/WornStage';
import { WornFrame } from './wornBits';
import { frontEndActions, notice, stage } from './frontEndStore';

/**
 * How much of the view the screens leave to the place behind them: the
 * panel stands well inside the view with the ground showing round it. Own
 * choice.
 */
const STAGE_INSET = 0.12;

/**
 * How far a drag across the whole window turns the body, in radians.
 *
 * Three turns rather than one: a single turn across the width means a
 * flick of the thumb barely moves a character, and looking at the back
 * of one took a drag across the whole screen.
 */
const TURN_PER_WIDTH = Math.PI * 6;

export function FrontEnd(): JSX.Element | null {
  const at = stage.value;
  const canvas = useRef<HTMLCanvasElement>(null);
  // Whether the build has a panel for the screen showing. Without one —
  // no screen spec, or a build whose movie has no such panel — that step
  // shows only the ground.
  const wornSignIn = useWornScreen(SIGN_IN_SCREEN) !== null;
  const wornList = useWornScreen(CHARACTERS_SCREEN) !== null;
  const wornStep = useWornScreen(STEP_SCREEN[at] ?? '') !== null;
  const worn = at === 'signIn' ? wornSignIn : at === 'characters' ? wornList : wornStep;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const actions = frontEndActions();
    actions.stageCanvas(element);
    return () => actions.stageCanvas(null);
  }, []);

  // The whole place while there is nobody to look at, the dais as soon
  // as there is.
  useEffect(() => {
    frontEndActions().watchGround(at === 'signIn' ? 'wide' : 'close');
  }, [at === 'signIn']);

  // clientX, not movementX: a touch reports none.
  const lastX = useRef<number | null>(null);
  const grab = (event: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    lastX.current = event.clientX;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const turn = (event: JSX.TargetedPointerEvent<HTMLDivElement>): void => {
    if (lastX.current === null) return;
    const moved = event.clientX - lastX.current;
    lastX.current = event.clientX;
    frontEndActions().turnBody((moved / globalThis.innerWidth) * TURN_PER_WIDTH);
  };
  const release = (): void => {
    lastX.current = null;
    frontEndActions().releaseBody();
  };

  return (
    <div
      data-screen="front-end"
      className="fixed inset-0 z-login flex flex-col items-center justify-end pb-6 font-chrome text-parchment-200"
    >
      {/* The ground. Behind everything, and the only thing a drag reaches. */}
      <div
        className="absolute inset-0 touch-none"
        data-part="ground"
        onPointerDown={grab}
        onPointerMove={turn}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <canvas ref={canvas} className="h-full w-full" />
      </div>

      <div className="relative flex w-full max-w-200 flex-col items-center gap-3 px-4">
        {/* A screen wearing the build's own art stands on the movie's
            own screen, scaled to the page. */}
        {worn && (
          <WornStage takesPointer={false} inset={STAGE_INSET}>
            {/* The build's own frame, behind every screen but the one
                for signing in: that one is a panel of its own. */}
            {at !== 'signIn' && <WornFrame />}
            {at === 'signIn' && <ArtSignIn />}
            {at === 'characters' && <ArtChooseCharacter />}
            {(at === 'race' || at === 'class' || at === 'look' || at === 'name') && (
              <ArtMakeCharacter />
            )}
          </WornStage>
        )}

        {/* Answers to something the player just did; unannounced, a screen
            reader user gets silence where everyone else gets a reason. */}
        <p
          role="status"
          aria-live="polite"
          className="m-0 min-h-6 text-center text-tiny text-ink-400"
        >
          {notice.value}
        </p>
      </div>
    </div>
  );
}

/** Put the screens on an element of their own, and take them off again. */
export function mountFrontEnd(container: HTMLElement): void {
  render(<FrontEnd />, container);
}

export function unmountFrontEnd(container: HTMLElement): void {
  render(null, container);
}
