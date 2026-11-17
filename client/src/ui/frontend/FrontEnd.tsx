/** Everything before the world, over the build's selection scene (`renderer/SelectionScene`); dragging turns the body. */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { ArtChooseCharacter, CHARACTERS_SCREEN } from './ArtChooseCharacter';
import { ArtMakeCharacter, STEP_SCREEN } from './ArtMakeCharacter';
import { ArtSignIn } from './ArtSignIn';
import { SIGN_IN_SCREEN } from './ArtSignIn';
import { useWornScreen } from '../art/useWorn';
import { screenFallback } from '../art/uiSpec';
import { WornStage } from '../art/WornStage';
import { WornFrame } from './wornBits';
import { ArtConnecting } from './ArtConnecting';
import { ArtNotice } from './ArtNotice';
import { FallbackCharacters } from '../fallback/FallbackCharacters';
import { FallbackMakeCharacter } from '../fallback/FallbackMakeCharacter';
import { FallbackSignIn } from '../fallback/FallbackSignIn';
import { dialog, frontEndActions, notice, showDialog, stage } from './frontEndStore';
import { logger } from '../../core/log';

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

/**
 * How long a screen waits on a movie that has not arrived before standing a
 * fallback in. Own choice: longer than the movie takes to read on a slow phone,
 * short enough that a build with no movie is not left on bare ground.
 */
const MOVIE_GRACE_MS = 4000;

/**
 * Whether the plain fallback should show. A build that answers it has no such
 * panel shows it at once; one still reading its movie does not, or a 1.1.4
 * player would see, and type into, a form that is swapped out a moment later.
 */
function useFallsBack(worn: boolean, screen: string | null): boolean {
  const reason = worn || !screen ? null : (screenFallback(screen)?.reason ?? 'no-movie');
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    setWaited(false);
    if (reason !== 'no-movie') return;
    const timer = setTimeout(() => setWaited(true), MOVIE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [reason, screen]);
  if (reason === null) return false;
  return reason !== 'no-movie' || waited;
}

export function FrontEnd(): JSX.Element | null {
  const at = stage.value;
  const canvas = useRef<HTMLCanvasElement>(null);
  // Whether the build has a panel for the screen showing. Without one, a
  // plain fallback stands in, once the build has said so: see `fallsBack`.
  const wornSignIn = useWornScreen(SIGN_IN_SCREEN) !== null;
  const wornList = useWornScreen(CHARACTERS_SCREEN) !== null;
  const wornStep = useWornScreen(STEP_SCREEN[at] ?? '') !== null;
  const worn = at === 'signIn' ? wornSignIn : at === 'characters' ? wornList : wornStep;
  const screenShown =
    at === 'signIn'
      ? SIGN_IN_SCREEN
      : at === 'characters'
        ? CHARACTERS_SCREEN
        : (STEP_SCREEN[at] ?? null);

  const fallsBack = useFallsBack(worn, screenShown);

  // Which steps fell back, and why: the compatibility report for builds
  // whose movies carry no panels of their own.
  useEffect(() => {
    if (!fallsBack || !screenShown) return;
    const reason = screenFallback(screenShown)?.reason ?? 'unknown';
    logger('front-end').info(`fallback screen for ${at}: ${screenShown} ${reason}`);
  }, [at, fallsBack, screenShown]);

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
            own screen, scaled to the page. Where the build has no panel,
            a plain fallback stands in so the game can still be entered. */}
        {worn ? (
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
        ) : !fallsBack ? null : (
          <>
            {at === 'signIn' && <FallbackSignIn />}
            {at === 'characters' && <FallbackCharacters />}
            {(at === 'race' || at === 'class' || at === 'look' || at === 'name') && (
              <FallbackMakeCharacter />
            )}
          </>
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

      {/* Over everything, as the build lays them: waiting on the server,
          and what the server said back. */}
      {dialog.value?.kind === 'connecting' && (
        <ArtConnecting onCancel={() => frontEndActions().cancelSignIn()} />
      )}
      {dialog.value?.kind === 'message' && (
        <ArtNotice text={dialog.value.text} onClose={() => showDialog(null)} />
      )}
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
