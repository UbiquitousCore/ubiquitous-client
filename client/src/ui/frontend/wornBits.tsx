/** What every screen before the world does with shipped art: a picture, pressable places, words and our own pictures. */

import type { ComponentChildren, JSX, Ref } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { emblems, wantEmblems } from '../art/pieceStore';
import { WornPiece } from '../art/WornPiece';
import { iconUrl } from '../iconUrl';
import type { PiecePart } from '../art/piecePlan';
import type { Worn } from '../art/useWorn';
import { markRuns } from '../art/wornWords';

/** A field the player types into, drawn with no chrome of its own. */
const FIELD =
  'pointer-events-auto absolute cursor-text border-0 bg-transparent p-0 outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

/** A pressable place; it draws nothing, and holding shows the movie's red face. */
const HIT =
  'pointer-events-auto absolute cursor-pointer border-0 bg-transparent p-0 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300 disabled:cursor-default';

/** Which control is held: holding shows its red second face. */
export function useHeld(): {
  held: string | null;
  hold: (part: string | undefined) => (down: boolean) => void;
  faces: Record<string, number>;
} {
  const [held, setHeld] = useState<string | null>(null);
  const hold = (part: string | undefined) => (down: boolean) =>
    setHeld(was => (down ? (part ?? null) : was === part ? null : was));
  return { held, hold, faces: held ? { [held]: PRESSED } : {} };
}

/** The frame a control's red face is drawn on. */
export const PRESSED = 1;

/**
 * The two step chevrons, drawn on their own against the edges: in place
 * they would stretch the race screen and size it unlike the class screen.
 */
export function WornSteps({
  onEarlier,
  onLater,
  label,
}: {
  onEarlier(): void;
  onLater(): void;
  /** What is being stepped through, for anyone who cannot see them. */
  label: string;
}): JSX.Element {
  // Against the edges of the view, outside the panel rather than on it.
  const side =
    'pointer-events-auto fixed top-1/2 -translate-y-1/2 cursor-pointer border-0 ' +
    'bg-transparent p-0 active:brightness-110 ' +
    'focus-visible:outline-2 focus-visible:outline-brass-300';
  return (
    <>
      <button
        type="button"
        aria-label={`Earlier ${label}`}
        onClick={onEarlier}
        className={`${side} left-2`}
      >
        <WornPiece
          dialog={STEP_DIALOG}
          part="btnleft"
          movie="LGM"
          box={{ height: '7rem', width: 'auto' }}
        />
      </button>
      <button
        type="button"
        aria-label={`Later ${label}`}
        onClick={onLater}
        className={`${side} right-2`}
      >
        <WornPiece
          dialog={STEP_DIALOG}
          part="btnright"
          movie="LGM"
          box={{ height: '7rem', width: 'auto' }}
        />
      </button>
    </>
  );
}

/** The piece of the movie the chevrons are drawn from. */
const STEP_DIALOG = 'races_group';

/**
 * The gold frame and plaque behind every screen before the world, placed
 * around the screen rather than where the movie parks it.
 */
export function WornFrame(): JSX.Element | null {
  return <WornPiece dialog={FRAME_PIECE} part={FRAME_PIECE} movie="LGM" box={FRAME_PLACE} />;
}

/** The piece of the movie that frame is. */
const FRAME_PIECE = 'createbg';

/** A share of the stage, the same for every screen, so the frame never resizes; edge controls fall outside. */
const FRAME_PLACE = {
  position: 'absolute' as const,
  left: '9.25%',
  top: '3.4%',
  width: '81.5%',
  height: '76%',
};

/** The picture itself, with everything placed on it inside. */
export function WornPanel({
  worn,
  name,
  beneath,
  children,
}: {
  worn: Worn;
  /** Our own name for the screen, for anything reaching for it. */
  name: string;
  /** Drawn behind the picture: a portrait sits inside its ring, which covers its edges. */
  beneath?: ComponentChildren;
  children?: ComponentChildren;
}): JSX.Element | null {
  if (!worn.image || !worn.frame) return null;
  // A stage-placed screen is as big as the stage made it; drawn at raster
  // size, the panel and its fractions drift off the art.
  const stood = worn.placed.position === 'absolute';
  return (
    // Placed where the movie puts it (`WornStage`). Only controls take the
    // pointer: the ground behind is turned by dragging.
    <div data-screen={name} className="pointer-events-none absolute" style={worn.placed}>
      {beneath}
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="pointer-events-none relative block"
        style={stood ? { width: '100%', height: '100%' } : worn.sized}
        draggable={false}
      />
      {children}
    </div>
  );
}

/** A control on the named part; `pressed` for the showing one of a set, also told to screen readers. */
export function WornHit({
  worn,
  part,
  label,
  onPress,
  onHold,
  pressed,
  disabled,
}: {
  worn: Worn;
  part: PiecePart | undefined;
  label: string;
  onPress(): void;
  /** Held down or let go, for a screen that shows the movie's other face. */
  onHold?(down: boolean): void;
  pressed?: boolean;
  disabled?: boolean;
}): JSX.Element | null {
  if (!part) return null;
  const hold = (down: boolean) => () => onHold?.(down);
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onPress}
      onPointerDown={hold(true)}
      onPointerUp={hold(false)}
      onPointerLeave={hold(false)}
      onPointerCancel={hold(false)}
      style={worn.box(part)}
      className={HIT}
    />
  );
}

/** A typed field at the movie's spot; `words` turns pointer events off, so they are not spread whole. */
export function WornField({
  worn,
  part,
  label,
  value,
  secret,
  limit,
  disabled,
  onChange,
  onDone,
}: {
  worn: Worn;
  part: PiecePart | undefined;
  label: string;
  value: string;
  secret?: boolean;
  limit?: number;
  disabled?: boolean;
  onChange(next: string): void;
  onDone?(): void;
}): JSX.Element | null {
  if (!part) return null;
  const lettering = worn.words(part);
  return (
    <input
      data-part="field"
      type={secret ? 'password' : 'text'}
      autocomplete={secret ? 'current-password' : 'username'}
      aria-label={label}
      maxLength={limit}
      value={value}
      disabled={disabled}
      onInput={event => onChange((event.target as HTMLInputElement).value)}
      onKeyDown={event => {
        if (event.key === 'Enter') onDone?.();
      }}
      style={{
        ...worn.box(part),
        fontSize: lettering.fontSize,
        fontFamily: lettering.fontFamily,
        color: lettering.color,
        textAlign: part.text?.align ?? 'left',
        pointerEvents: 'auto',
      }}
      className={FIELD}
    />
  );
}

/** Words in the place the spec named, at the size that place sets. */
export function WornSays({
  worn,
  part,
  text,
  tone,
  wrap,
  scrolls,
  room,
}: {
  worn: Worn;
  part: PiecePart | undefined;
  text: string | undefined;
  tone?: string;
  wrap?: boolean;
  /** For words with more to them than the panel holds. */
  scrolls?: boolean;
  /** Room as a share of the screen, for one marked line that runs to three. */
  room?: JSX.CSSProperties;
}): JSX.Element | null {
  const { ref: reads } = useCreeping(text);
  if (!part || !text) return null;
  // The build scrolls a description that outruns its panel: on its own
  // after a moment, and by hand whenever the reader takes hold of it.
  const scrolling: JSX.CSSProperties = scrolls
    ? { overflowY: 'auto', pointerEvents: 'auto', touchAction: 'pan-y' }
    : {};
  return (
    <span
      ref={scrolls ? (reads as unknown as Ref<HTMLSpanElement>) : undefined}
      style={{ ...worn.words(part, tone, wrap), ...scrolling, ...room }}
    >
      {text}
    </span>
  );
}

/** How long a description sits still before it starts to scroll, in ms. */
const BEFORE_SCROLLING = 1000;
/** And how fast it goes, in pixels a second. */
const SCROLL_SPEED = 14;

/** Scroll overlong words slowly after a second, stopping at the end; scrolling by hand takes over. */
export function useCreeping(text: string | undefined): {
  ref: (element: HTMLElement | null) => void;
} {
  const held = useRef<HTMLElement | null>(null);
  const byHand = useRef(false);
  useEffect(() => {
    const element = held.current;
    if (!element) return;
    byHand.current = false;
    element.scrollTop = 0;
    let at = 0;
    let last = 0;
    let frame = 0;
    const creep = (now: number): void => {
      if (byHand.current) return;
      const step = last === 0 ? 0 : ((now - last) / 1000) * SCROLL_SPEED;
      last = now;
      at = Math.min(at + step, element.scrollHeight - element.clientHeight);
      element.scrollTop = at;
      if (at < element.scrollHeight - element.clientHeight) frame = requestAnimationFrame(creep);
    };
    const start = setTimeout(() => {
      frame = requestAnimationFrame(creep);
    }, BEFORE_SCROLLING);
    const stop = (): void => {
      byHand.current = true;
      cancelAnimationFrame(frame);
    };
    element.addEventListener('pointerdown', stop);
    element.addEventListener('wheel', stop, { passive: true });
    return () => {
      clearTimeout(start);
      cancelAnimationFrame(frame);
      element.removeEventListener('pointerdown', stop);
      element.removeEventListener('wheel', stop);
    };
  }, [text]);
  return {
    ref: (element: HTMLElement | null) => {
      held.current = element;
    },
  };
}

/** A box as shares of something: `0.5` is halfway across it. */
export interface Share {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A box as shares of `part`'s box, so it holds when the frame grows; else of the screen. */
export function shareOf(worn: Worn, part: PiecePart | undefined, share: Share): JSX.CSSProperties {
  const frame = worn.frame;
  const on = part?.box;
  if (!frame || !on || !on.w || !on.h) {
    return {
      left: `${share.left * 100}%`,
      top: `${share.top * 100}%`,
      width: `${share.width * 100}%`,
      height: `${share.height * 100}%`,
    };
  }
  return {
    left: `${((on.x + share.left * on.w) / frame.w) * 100}%`,
    top: `${((on.y + share.top * on.h) / frame.h) * 100}%`,
    width: `${((share.width * on.w) / frame.w) * 100}%`,
    height: `${((share.height * on.h) / frame.h) * 100}%`,
  };
}

/** How much of a ring's width the picture inside it takes. */
const INSIDE_THE_RING = 0.86;

/** Three lines with the middle one coloured (the build's question form); the movie marks one line. */
export function WornLines({
  worn,
  part,
  lines,
  colour,
  tone,
  room,
  marks,
  markColour = 'inherit',
}: {
  worn: Worn;
  part: PiecePart | undefined;
  lines: readonly string[];
  /** What the middle line is written in. */
  colour: string;
  tone?: string;
  room?: JSX.CSSProperties;
  /** Words to pick out wherever they stand in the lines, in `markColour`. */
  marks?: readonly string[];
  markColour?: string;
}): JSX.Element | null {
  if (!part || lines.length === 0) return null;
  const middle = lines.length > 2 ? 1 : -1;
  return (
    <span style={{ ...worn.words(part, tone, true), ...room }}>
      {lines.map((line, at) => (
        <span key={line} style={at === middle ? { color: colour } : undefined}>
          {marks?.length
            ? markRuns(line, marks, markColour).map((run, index) => (
                <span key={index} style={run.colour ? { color: run.colour } : undefined}>
                  {run.text}
                </span>
              ))
            : line}
        </span>
      ))}
    </span>
  );
}

/** A body's portrait cut to a circle at the movie's point; `within` gives the size. */
export function WornFace({
  worn,
  at,
  within,
  url,
  name,
}: {
  worn: Worn;
  at: PiecePart | undefined;
  /** Size from an unpicked ring: picked and pressed frames are bigger, so the face jumped. */
  within: PiecePart | undefined;
  url: string | undefined;
  name?: string;
}): JSX.Element | null {
  if (!at || !url) return null;
  const middle = worn.box(at);
  const room = within ? worn.box(within) : undefined;
  return (
    <img
      src={url}
      alt={name ?? ''}
      aria-hidden={name ? undefined : 'true'}
      style={{
        ...middle,
        ...(room?.width ? { width: room.width } : {}),
        ...(room?.height ? { height: room.height } : {}),
        // The point is the middle of the place, not its corner, and the
        // picture sits inside the ring rather than under the whole of
        // it: the ring's own rim is drawn over the edge of it.
        transform: `translate(-50%, -50%) scale(${INSIDE_THE_RING})`,
        borderRadius: '50%',
        objectFit: 'cover',
      }}
      className="pointer-events-none absolute"
      draggable={false}
    />
  );
}

/** A build icon drawn at a point the movie marks, sized by a part the caller names. */
export function WornPicture({
  worn,
  at,
  file,
  name,
  centred,
  room: given,
  asTallAs,
}: {
  worn: Worn;
  at: PiecePart | undefined;
  file: string | undefined;
  name?: string;
  /** True where the point marks the middle of the picture, not its corner. */
  centred?: boolean;
  /** Room of its own, as a share of the screen, for a point that only marks a spot. */
  room?: JSX.CSSProperties;
  /** Size from this part where `at` is a point; otherwise the file's own size (a flag over half the panel). */
  asTallAs?: PiecePart | undefined;
}): JSX.Element | null {
  useEffect(() => {
    if (file) wantEmblems([file]);
  }, [file]);
  const picture = file ? emblems.value.get(file) : undefined;
  if (!at || !picture) return null;
  const place = worn.box(at);
  const room = asTallAs ? worn.box(asTallAs) : undefined;
  return (
    <img
      src={iconUrl(picture)}
      alt={name ?? ''}
      aria-hidden={name ? undefined : 'true'}
      style={{
        ...place,
        ...(room?.height ? { height: room.height, width: 'auto' } : {}),
        ...(centred ? { transform: 'translate(-50%, -50%)' } : {}),
        ...given,
        objectFit: 'contain',
      }}
      className="pointer-events-none absolute"
      draggable={false}
    />
  );
}
