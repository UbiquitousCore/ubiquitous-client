/** Wearing a shipped screen: drawing, measuring, finding parts and placing words. */

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import type { RefObject } from 'preact';

import { drawPiece } from './pieceCanvas';
import { movieArt, wantDialog } from './pieceStore';
import { screenSpec } from './uiSpec';
import { meaningOf } from './screenMeanings';
import type { ScreenSpec } from './uiSpec';
import type { PieceImage } from './pieceCanvas';
import { findPlacements, frameAround, isNamed, mapBox, planPiece, transformTo } from './piecePlan';
import type { PieceBox, PiecePart, PlanStates } from './piecePlan';
import { MAX_UI_SCALE, clampUiScale } from '../../core/graphics';
import type { UiMovie } from '../../assets/ids';
import { useStageRoom } from './WornStage';
import { options } from '../optionsStore';
import { wornLettering } from './wornFont';
import { logger } from '../../core/log';

/** Pixels per movie unit from the player's setting; one source, so every screen agrees. */
function drawScale(): number {
  return clampUiScale(options.value.uiScale);
}

/** Drawn this much finer than shown, so lettering and thin lines stay sharp (art ships up to 4x). */
const SHARPER = 2;

const log = logger('worn');

/** Sizes come back in fractions; within half a pixel is the same size. */
export function settled(was: number, now: number): boolean {
  return Math.abs(was - now) < 0.5;
}

/** How many measurements in a row count as a round rather than a resize. */
const SPINS = 100;
/** How long apart two measurements have to be to start the count again, in ms. */
const APART = 250;

/** Pixels per movie unit the pictures are rasterised at. */
function rasterScale(): number {
  return Math.min(MAX_UI_SCALE, drawScale() * SHARPER);
}

export interface Worn {
  /** The extent everything is measured against, or null while unread. */
  frame: PieceBox | null;
  /** Where the movie puts this screen, so two shown together know their sides. */
  placedAt: { x: number; y: number } | null;
  /**
   * The box on the movie screen, for screens inside `WornStage`, stacked by
   * movie depth; laid out otherwise, a screen meant to open over another
   * lands beside it.
   */
  placed: JSX.CSSProperties;
  /** Every part with every state showing; what states to hide is decided from this. */
  whole: PiecePart[];
  /** The box on the movie screen, unfitted, for screens standing at their own size against an edge. */
  onStage: PieceBox | null;
  /** The drawn picture, or null when it cannot be drawn. */
  image: PieceImage | null;
  parts: PiecePart[];
  /** Drawn pixels per movie unit, for sizing words the plan does not place. */
  scale: number;
  /** The movie's screen size, for layouts that take a share of it. */
  stage: { w: number; h: number } | null;
  /** Shown pixels per movie unit before any measurement, for screens sized by content. */
  perUnit: number;
  /** Drawn pixels per shown pixel; layouts in picture pixels divide by it. */
  sharper: number;
  /** Hang this on the picture so words can be sized against it. */
  pictureRef: RefObject<HTMLImageElement>;
  /** Display size for a self-sized screen; at natural size it would show at its drawing rung. */
  sized: JSX.CSSProperties;
  /** A part by its path, or by the tail of one. */
  find(suffix: string | undefined): PiecePart | undefined;
  /** The text field inside a part, which is what knows where words go. */
  fieldOf(part: PiecePart | undefined): PiecePart | undefined;
  /** A part's box, as a fraction of the picture. */
  box(part: PiecePart): JSX.CSSProperties;
  /** Words in a part's box at its size and alignment; `wrap` where the field has room for lines. */
  words(part: PiecePart, tone?: string, wrap?: boolean): JSX.CSSProperties;
}

/** What our words are drawn in where a field names no colour of its own. */
export const INK = 'var(--color-ink-900)';
export const LIGHT = 'var(--color-parchment-100)';

/**
 * The spec for one screen once its art is in hand, or null (no movie, no
 * such piece, or a part the mounted build lacks); the caller then draws its
 * own window, the tested path.
 */
export function useWornScreen(name: string): ScreenSpec | null {
  const spec = screenSpec(name);
  // Asked for by the table's dialog before there is a spec: the spec is
  // built from the movie, and the movie is read when a dialog is wanted.
  const wanted = spec?.dialog ?? meaningOf(name)?.dialog;
  const from = spec?.movie ?? meaningOf(name)?.movie ?? 'IGM';
  useEffect(() => {
    if (wanted) wantDialog(wanted, from);
  }, [wanted, from]);
  const loaded = movieArt(spec?.movie ?? 'IGM');
  const dialog = spec?.dialog;
  const carried = useMemo(
    () => (loaded && dialog ? findPlacements(loaded.skin, dialog).length > 0 : false),
    [loaded, dialog],
  );
  return spec && carried ? spec : null;
}

/**
 * Wear `dialog`, framed on `frameName`, or on every part named where the
 * backdrop does not cover all. Measured with every state showing, so the
 * picture holds still as states switch.
 */
export interface WornOptions {
  /** Laid out in a row beside its neighbours (the character screens), sized by its own picture. */
  unplaced?: boolean;
  /** Stands where it is put (beside a pressed thing), so it does not stretch the stage. */
  floats?: boolean;
  /** Grow the frame to take in art spilling over its parts (a message box's ring); not for staged screens. */
  spills?: boolean;
  /** Parts never drawn, left out of the frame, or a corner-flush frame stands in from its corner. */
  measuredWithout?: readonly string[];
  /** The movie this screen is in; the in-game one unless said (the front end has its own). */
  movie?: UiMovie;
}

export function useWorn(
  dialog: string | undefined,
  frameName: string | string[] | undefined,
  states: PlanStates | ((whole: PiecePart[]) => PlanStates),
  options: WornOptions = {},
): Worn {
  const loaded = movieArt(options.movie ?? 'IGM');

  const placement = useMemo(
    () => (loaded && dialog ? findPlacements(loaded.skin, dialog)[0] : undefined),
    [loaded, dialog],
  );
  const placedAt = placement ? { x: placement.matrix.tx, y: placement.matrix.ty } : null;

  const whole = useMemo(
    () => (loaded && dialog ? planPiece(loaded.skin, dialog, { includeParked: true }) : null),
    [loaded, dialog],
  );
  const never = (options.measuredWithout ?? []).join('\u0000');
  const measured = useMemo(
    () =>
      never && loaded && dialog
        ? planPiece(loaded.skin, dialog, {
            includeParked: true,
            hidden: [...(options.measuredWithout ?? [])],
          })
        : whole,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [whole, never],
  );

  // States may be a function of the fully shown screen (rows, slots).
  const asked = typeof states === 'function' ? states(whole?.parts ?? []) : states;

  const wanted = Array.isArray(frameName) ? frameName : frameName ? [frameName] : [];
  const framedOn = wanted.join('\u0000');
  const key = JSON.stringify(asked);
  const frame = useMemo(() => {
    const on = measured;
    if (!whole || !on) return null;
    // By whole path too: matching only the last step framed the whole screen.
    const named = wanted
      .map(
        name =>
          on.parts.find(part => part.path === name && part.draws) ??
          on.parts.find(part => part.name === name && part.draws) ??
          // A part that draws nothing still has an extent; skipping it framed the whole screen.
          on.parts.find(part => part.path === name && part.box.w > 0 && part.box.h > 0),
      )
      .filter((part): part is PiecePart => part !== undefined);
    // Naming nothing means the screen is as big as what it draws — which
    // is what a screen whose backdrop has no name of its own must say.
    if (!wanted.length && loaded && dialog) {
      return planPiece(loaded.skin, dialog, asked)?.box ?? whole.box;
    }
    if (!named.length) return whole.box;
    const left = Math.min(...named.map(part => part.box.x));
    const top = Math.min(...named.map(part => part.box.y));
    const framed = {
      x: on.box.x + left,
      y: on.box.y + top,
      w: Math.max(...named.map(part => part.box.x + part.box.w)) - left,
      h: Math.max(...named.map(part => part.box.y + part.box.h)) - top,
    };
    // What is drawn in the states asked for, not with every state on:
    // a control that is left out spills nothing.
    const drawn = options.spills && loaded && dialog ? planPiece(loaded.skin, dialog, asked) : null;
    if (!drawn) return framed;
    return frameAround(
      framed,
      drawn.painted.map(one => ({ ...one, x: one.x + drawn.box.x, y: one.y + drawn.box.y })),
      { w: loaded!.skin.width, h: loaded!.skin.height },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whole, measured, framedOn, key, options.spills]);

  // Redrawn when the setting moves: rasterised finer than shown, to stay sharp.
  const drawnPerUnit = rasterScale();
  const drawn = useMemo(() => {
    if (!loaded || !dialog || !frame) return null;
    const plan = planPiece(loaded.skin, dialog, { ...asked, frame });
    if (!plan) return null;
    return { image: drawPiece(plan, loaded.art, drawnPerUnit), parts: plan.parts };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, dialog, frame, key, drawnPerUnit]);

  const parts = drawn?.parts ?? [];

  /** How tall the picture came out, for sizing words in movie units. */
  const pictureRef = useRef<HTMLImageElement>(null);
  const [drawnHeight, setDrawnHeight] = useState(0);
  useEffect(() => {
    const picture = pictureRef.current;
    if (!picture || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => {
      // The picture's box, or its panel's: the first measurement can land
      // before a stage-sized panel has a size.
      const tall =
        picture.getBoundingClientRect().height ||
        picture.parentElement?.getBoundingClientRect().height ||
        0;
      setDrawnHeight(was => (settled(was, tall) || tall === 0 ? was : tall));
    };
    measure();
    // And again on the next frame, for the same reason: what the stage
    // gives a screen is settled a frame after the screen first draws.
    const soon = requestAnimationFrame(measure);
    let turns = 0;
    let last = 0;
    const observer = new ResizeObserver(() => {
      // Measuring and drawing can chase each other; a burst is cut off and
      // logged instead of spinning. Spaced measurements (dragging) are fine.
      const now = performance.now();
      turns = now - last > APART ? 1 : turns + 1;
      last = now;
      if (turns > SPINS) {
        observer.disconnect();
        log.error(`${dialog ?? 'a screen'} would not settle at one size; stopped measuring it`);
        return;
      }
      measure();
    });
    // The picture only: also watching its container makes a feedback loop the browser stops delivering.
    observer.observe(picture);
    return () => {
      cancelAnimationFrame(soon);
      observer.disconnect();
    };
    // Also the element: a picture mounted later (a tab's page) is measured once there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, pictureRef.current]);

  /** A part by whole path, else by path tail: several fields can share a tail like `text`. */
  const find = (suffix: string | undefined): PiecePart | undefined =>
    suffix
      ? (parts.find(part => part.path === suffix) ?? parts.find(part => isNamed(part, suffix)))
      : undefined;

  const fieldOf = (part: PiecePart | undefined): PiecePart | undefined => {
    if (!part || part.text) return part;
    return parts.find(inside => inside.path.startsWith(`${part.path}/`) && inside.text) ?? part;
  };

  const box = (part: PiecePart): JSX.CSSProperties =>
    frame
      ? {
          position: 'absolute',
          left: `${(part.box.x / frame.w) * 100}%`,
          top: `${(part.box.y / frame.h) * 100}%`,
          width: part.box.w ? `${(part.box.w / frame.w) * 100}%` : undefined,
          height: part.box.h ? `${(part.box.h / frame.h) * 100}%` : undefined,
        }
      : {};

  const scale = frame && drawnHeight ? drawnHeight / frame.h : 0;

  const words = (part: PiecePart, tone = INK, wrap = false): JSX.CSSProperties => {
    const size = Math.min(part.text?.sizePx ?? 12, part.box.h || Infinity);
    return {
      ...box(part),
      display: 'flex',
      // One line centres, several start at the top; deciding by field height
      // left generous one-line fields hard against the top edge.
      alignItems: wrap ? 'flex-start' : 'center',
      justifyContent:
        part.text?.align === 'center'
          ? 'center'
          : part.text?.align === 'right'
            ? 'flex-end'
            : 'flex-start',
      fontSize: `${(size * scale).toFixed(1)}px`,
      // The typeface the field's movie names: every field was laid out in it.
      fontFamily: wornLettering(part.text?.face),
      color: part.text?.color ?? tone,
      overflow: 'hidden',
      whiteSpace: wrap ? 'normal' : 'nowrap',
      alignContent: 'flex-start',
      lineHeight: 1.1,
      pointerEvents: 'none',
    };
  };

  /** The screen's box on the movie screen and its depth; dialogs stack in movie order. */
  const above = useMemo(
    () => (loaded && dialog ? transformTo(loaded.skin, dialog) : null),
    [loaded, dialog],
  );
  const onScreen = frame && above ? mapBox(above, frame) : frame;
  // Told to the stage, which answers with what it draws as a whole; the
  // interface draws a little past the movie's stated size.
  const seat = useStageRoom(options.floats || options.unplaced ? undefined : dialog, onScreen);
  const room = seat?.extent ?? {
    left: 0,
    top: 0,
    w: loaded?.skin.width ?? 0,
    h: loaded?.skin.height ?? 0,
  };
  /** Where this screen goes across: the stage's answer, or the movie's. */
  const across = seat?.across ?? onScreen?.x ?? 0;
  const placed: JSX.CSSProperties = options.unplaced
    ? { position: 'relative' }
    : onScreen && room.w > 0 && room.h > 0
      ? {
          position: 'absolute',
          left: `${((across - room.left) / room.w) * 100}%`,
          top: `${((onScreen.y - room.top) / room.h) * 100}%`,
          width: `${(onScreen.w / room.w) * 100}%`,
          height: `${(onScreen.h / room.h) * 100}%`,
          zIndex: placement?.depth,
        }
      : {};

  const sized: JSX.CSSProperties = frame
    ? { width: `${frame.w * drawScale()}px`, height: `${frame.h * drawScale()}px` }
    : {};

  return {
    frame,
    sized,
    perUnit: drawScale(),
    stage: loaded ? { w: loaded.skin.width, h: loaded.skin.height } : null,
    sharper: rasterScale() / drawScale(),
    placedAt,
    placed,
    onStage: onScreen,
    whole: whole?.parts ?? [],
    image: drawn?.image ?? null,
    parts,
    scale,
    pictureRef,
    find,
    fieldOf,
    box,
    words,
  };
}
