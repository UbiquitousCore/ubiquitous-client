/**
 * The movie's screen with the open screens standing on it where the movie
 * puts them, so one opened over another lands over it. Each places itself
 * (`worn.placed`). The stage is sized from the plans, never by measuring
 * the page, which would creep and drag screens from under the pointer.
 */

import { createContext, type ComponentChildren, type JSX } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { movie } from './pieceStore';
import type { PieceBox } from './piecePlan';
import { setViewCover } from '../hudStore';

/** The shape of the screen the interface was laid out for. */
const SCREEN = { width: 480, height: 320 };

/** Where a screen reaches, from its plan rather than a page measurement, so it settles at once. */
interface StageRoom {
  report(id: string, box: PieceBox | null): void;
  /** The whole the stage is drawing, in movie units. */
  extent: { left: number; top: number; w: number; h: number };
  /** A packed screen's across position, where it is not the movie's. */
  across(id: string): number | null;
}

const Room = createContext<StageRoom | null>(null);

/** A screen's seat: report its reach, get the stage's whole extent; null outside a stage. */
export interface StageSeat {
  extent: StageRoom['extent'];
  /** Where this screen goes across, or null to stand where the movie says. */
  across: number | null;
}

export function useStageRoom(id: string | undefined, box: PieceBox | null): StageSeat | null {
  const room = useContext(Room);
  const x = box?.x ?? 0;
  const y = box?.y ?? 0;
  const w = box?.w ?? 0;
  const h = box?.h ?? 0;
  // Held in a ref rather than watched. Reporting a box changes what the
  // stage is drawing, which hands every screen on it a new answer — and
  // a screen that watched the answer would take its own report back and
  // make it again, for ever.
  const told = useRef(room);
  told.current = room;
  useEffect(() => {
    const stage = told.current;
    if (!stage || !id) return;
    stage.report(id, w > 0 && h > 0 ? { x, y, w, h } : null);
    return () => stage.report(id, null);
  }, [id, x, y, w, h]);
  return room ? { extent: room.extent, across: id ? room.across(id) : null } : null;
}

export interface WornStageProps {
  /** Centred by default; the character screens pin left, against the menu. */
  align?: 'centre' | 'left';
  /** Shoulder to shoulder against the menu rather than at the movie's places (the character screens). */
  packed?: boolean;
  /**
   * How much of the room to leave empty around the stage, as a fraction
   * of it. Nought fills whatever it is given.
   */
  inset?: number;
  /** Dim what is behind; the character screens do not, since play carries on beside them. */
  dim?: boolean;
  /** Report the covered view so the hero stays visible; only for screens open during play. */
  cover?: boolean;
  children: ComponentChildren;
}

export function WornStage({
  align = 'centre',
  cover = false,
  dim = true,
  packed = false,
  inset = 0,
  children,
}: WornStageProps): JSX.Element {
  const skin = movie.value?.skin;
  const width = skin?.width || SCREEN.width;
  const height = skin?.height || SCREEN.height;
  const room = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState<{ w: number; h: number } | null>(null);
  const [boxes, setBoxes] = useState<Readonly<Record<string, PieceBox>>>({});

  const report = useCallback((id: string, box: PieceBox | null): void => {
    setBoxes(was => {
      if (!box) {
        if (!(id in was)) return was;
        const next = { ...was };
        delete next[id];
        return next;
      }
      const had = was[id];
      if (had && had.x === box.x && had.y === box.y && had.w === box.w && had.h === box.h) {
        return was;
      }
      return { ...was, [id]: box };
    });
  }, []);

  useEffect(() => {
    const on = room.current;
    if (!on) return;
    const measure = (): void => setFits({ w: on.clientWidth, h: on.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(on);
    return () => observer.disconnect();
  }, []);

  /** The movie's screen, stretched for overhang; packed, the sum of widths, so it holds still. */
  const extent = useMemo(() => {
    let left = 0;
    let top = 0;
    let right = width;
    let foot = height;
    for (const box of Object.values(boxes)) {
      if (!packed) {
        left = Math.min(left, box.x);
        right = Math.max(right, box.x + box.w);
      }
      top = Math.min(top, box.y);
      foot = Math.max(foot, box.y + box.h);
    }
    return { left, top, w: right - left, h: foot - top };
  }, [boxes, width, height, packed]);

  // An unlaid room uses the movie's size, or a screen would never appear.
  // `inset` leaves room round the stage (the front end on a phone).
  const room3 = fits ? { w: fits.w * (1 - inset), h: fits.h * (1 - inset) } : null;
  const fit =
    room3 && room3.w > 0 && room3.h > 0 ? Math.min(room3.w / extent.w, room3.h / extent.h) : 1;

  /**
   * Where each screen goes across when they are packed: in the order the
   * movie places them, each against the one before it.
   */
  const across = useMemo(() => {
    if (!packed) return new Map<string, number>();
    const inOrder = Object.entries(boxes).sort(([, a], [, b]) => a.x - b.x);
    const places = new Map<string, number>();
    let at = 0;
    for (const [id, box] of inOrder) {
      places.set(id, at);
      at += box.w;
    }
    return places;
  }, [packed, boxes]);

  const said = useMemo<StageRoom>(
    () => ({ report, extent, across: id => across.get(id) ?? null }),
    [report, extent, across],
  );

  // What the screens standing here cover of the view, so the game can
  // keep the hero in what is left of it — the same thing the built
  // windows report, and the reason the view slides when one opens.
  useEffect(() => {
    if (!cover) return;
    const inner = stage.current;
    if (!inner) return;
    const held = Array.from(inner.children).map(child => child.getBoundingClientRect());
    if (!held.length) {
      setViewCover(null);
      return;
    }
    setViewCover({
      left: Math.min(...held.map(box => box.left)),
      top: Math.min(...held.map(box => box.top)),
      right: Math.max(...held.map(box => box.right)),
      bottom: Math.max(...held.map(box => box.bottom)),
    });
  }, [cover, fits, extent, children]);

  useEffect(() => () => setViewCover(null), []);

  return (
    <div
      ref={room}
      // A dimming stage takes the pointer; the front end's does not, since
      // dragging the place behind turns the character.
      className={`fixed inset-0 z-window flex items-center ${
        dim ? 'pointer-events-auto bg-black/65' : 'pointer-events-none'
      } ${align === 'left' ? 'justify-start' : 'justify-center'}`}
    >
      <div
        ref={stage}
        className="relative"
        style={{
          width: `${extent.w * fit}px`,
          height: `${extent.h * fit}px`,
        }}
      >
        <Room.Provider value={said}>{children}</Room.Provider>
      </div>
    </div>
  );
}
