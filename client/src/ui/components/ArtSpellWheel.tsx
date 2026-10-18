/**
 * The ring of spell buttons in the corner: turned by dragging, filled by
 * dropping spells from the book, cast by pressing; rules in `spellWheelModel`.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { getSpellIcon, getSpellName } from '../../gameplay/SpellBook';
import { barRun } from '../art/faceRuns';
import type { FaceRun } from '../art/faceRuns';
import type { PiecePart, PlanStates } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { useWorn, useWornScreen } from '../art/useWorn';
import { iconUrl } from '../iconUrl';
import { governingCooldown, iconBox, spellBarOpen, sweepFace } from '../spellBarModel';
import type { SlotCooldown } from '../spellBarModel';
import {
  ringCentre,
  snapTurn,
  TURN_SLACK,
  turnBetween,
  wheelRefs,
  wheelStates,
} from '../spellWheelModel';
import type { WheelNames, WheelRef, WheelView } from '../spellWheelModel';
import { cx } from './cx';
import { spellDragOver } from './spellDrag';
import { useFlashes } from './useFlashes';

/** Our name for this screen. The spec says which dialog wears it. */
export const SPELL_WHEEL_SCREEN = 'spellWheel';

/** The ring stands at its own size against the corner, not at a place on a stage. */
const CORNER = { unplaced: true } as const;

/** How much of the glow's box the dark disc inside the rim fills, which a spell's icon covers. Own choice, fitted by eye. */
const DISC_SHARE = 0.84;

/** How long the ring takes to settle on a slot after it is let go, in ms. Own choice. */
const SETTLE_MS = 180;

export interface ArtSpellWheelProps {
  /** One entry per slot of the ring, null for an empty one. */
  spells: ReadonlyArray<number | null>;
  /** The number a slot is dropped on, for the first slot of the ring. */
  firstSlot: number;
  cooldowns: ReadonlyMap<number, SlotCooldown>;
  globalCooldown: SlotCooldown | null;
  castingSpellId: number | null;
  onCast(spellId: number): void;
}

/** Null where there is no movie to wear, which means there is no ring. */
export function ArtSpellWheel(props: ArtSpellWheelProps): JSX.Element | null {
  const spec = useWornScreen(SPELL_WHEEL_SCREEN);
  return spec?.grids?.slots && spec.groups ? <Worn {...props} spec={spec} /> : null;
}

function namesOf(spec: ScreenSpec): WheelNames {
  const grid = spec.grids!.slots!;
  const groups = spec.groups!;
  return {
    slot: grid.slot,
    within: grid.within!,
    sweep: groups.sweep!,
    effects: groups.effects!,
    flash: groups.flash!,
    glow: groups.glow!,
  };
}

function Worn({
  spells,
  firstSlot,
  cooldowns,
  globalCooldown,
  castingSpellId,
  onCast,
  spec,
}: ArtSpellWheelProps & { spec: ScreenSpec }): JSX.Element | null {
  const names = namesOf(spec);
  const bars = spec.bars;
  const sweepRun = bars ? barRun(bars, `${names.within}/${names.slot}01/${names.sweep}`) : null;
  const flashRun: FaceRun = { first: 0, last: bars?.own?.flash?.frames ?? 0 };

  const cooling = spells.map(id => (id === null ? false : (cooldowns.get(id)?.remaining ?? 0) > 0));
  const flashes = useFlashes(cooling, flashRun);
  const dragOver = spellDragOver.value;
  const [pressedSlot, setPressedSlot] = useState<number | null>(null);
  const [turn, setTurn] = useState(0);
  const [turning, setTurning] = useState(false);
  const [settling, setSettling] = useState(false);
  const anchor = useRef<HTMLSpanElement>(null);
  const gesture = useRef<{
    from: { x: number; y: number };
    turn: number;
    moved: boolean;
  } | null>(null);
  const justTurned = useRef(false);
  useEffect(() => {
    if (!settling) return;
    const done = window.setTimeout(() => setSettling(false), SETTLE_MS);
    return () => window.clearTimeout(done);
  }, [settling]);

  const viewOf = (slot: WheelRef): WheelView => {
    const spellId = spells[slot.index] ?? null;
    const cd = spellId === null ? null : governingCooldown(cooldowns.get(spellId), globalCooldown);
    return {
      sweep: sweepRun ? sweepFace(cd, sweepRun) : null,
      glowing:
        pressedSlot === slot.index ||
        (spellId !== null && spellId === castingSpellId) ||
        dragOver === firstSlot + slot.index,
      flash: flashes[slot.index] ?? null,
    };
  };
  const statesFor = (whole: PiecePart[]): ReturnType<typeof wheelStates> => {
    const refs = wheelRefs(whole, names);
    return wheelStates(refs, refs.map(viewOf), spec.hidden ?? []);
  };

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    // The slots' discs are parked art: shown as though the movie had turned them on.
    (whole): PlanStates => ({ hidden: statesFor(whole).base.hidden, includeParked: true }),
    CORNER,
  );
  const over = useWorn(
    spec.dialog,
    spec.frame,
    (whole): PlanStates => {
      const { over: on } = statesFor(whole);
      return { only: on.only, driven: on.driven, frames: on.frames, includeParked: true };
    },
    CORNER,
  );

  if (!worn.image || !worn.frame || !worn.onStage || !worn.stage) return null;
  const frame = worn.frame;
  const refs = wheelRefs(worn.whole, names);
  const plates = refs.map(slot => worn.parts.find(part => part.path === slot.path));
  const boxes = plates.filter((box): box is PiecePart => box !== undefined).map(part => part.box);
  const centre = ringCentre(boxes);
  const reach = Math.max(
    0,
    ...boxes.map(
      box => Math.hypot(box.x + box.w / 2 - centre.x, box.y + box.h / 2 - centre.y) + box.w / 2,
    ),
  );
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;
  const at = (box: PiecePart['box']): JSX.CSSProperties => ({
    position: 'absolute',
    left: pct(box.x, frame.w),
    top: pct(box.y, frame.h),
    width: pct(box.w, frame.w),
    height: pct(box.h, frame.h),
  });
  const slide = turning ? 'none' : `transform ${SETTLE_MS}ms ease-out`;
  const spin = { transform: `rotate(${turn}rad)`, transition: slide };
  const centrePoint = (): { x: number; y: number } => {
    const rect = anchor.current?.getBoundingClientRect();
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
  };

  return (
    <div
      className={cx('pointer-events-none fixed z-hud-bar', spellBarOpen.value && 'invisible')}
      style={{
        right: `${(worn.stage.w - (worn.onStage.x + worn.onStage.w)) * worn.perUnit}px`,
        bottom: `${(worn.stage.h - (worn.onStage.y + worn.onStage.h)) * worn.perUnit}px`,
        ...worn.sized,
      }}
    >
      <div
        data-spell-wheel
        className="absolute inset-0"
        style={{ ...spin, transformOrigin: `${pct(centre.x, frame.w)} ${pct(centre.y, frame.h)}` }}
        onPointerDown={(event: PointerEvent) => {
          if (event.button !== 0) return;
          gesture.current = { from: { x: event.clientX, y: event.clientY }, turn, moved: false };
        }}
        onPointerMove={(event: PointerEvent) => {
          const held = gesture.current;
          if (!held) return;
          const now = { x: event.clientX, y: event.clientY };
          if (!held.moved) {
            if (Math.hypot(now.x - held.from.x, now.y - held.from.y) < TURN_SLACK) return;
            held.moved = true;
            setTurning(true);
            setPressedSlot(null);
            (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
          }
          setTurn(held.turn + turnBetween(centrePoint(), held.from, now));
        }}
        onPointerUp={() => {
          const held = gesture.current;
          gesture.current = null;
          if (!held?.moved) return;
          // The click that follows a turn is not a press.
          justTurned.current = true;
          window.setTimeout(() => (justTurned.current = false), 0);
          setTurning(false);
          setSettling(true);
          setTurn(snapTurn(turn, refs.length));
        }}
        onPointerCancel={() => {
          gesture.current = null;
          setTurning(false);
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
        {refs.map(slot => {
          const spellId = spells[slot.index] ?? null;
          const icon = spellId === null ? undefined : getSpellIcon(spellId);
          const drawn = plates[slot.index];
          const whole = worn.whole.find(part => part.path === slot.path);
          const inner = worn.whole.find(part => part.path === slot.glow);
          if (!drawn || !whole) return null;
          const disc = at(iconBox(whole.box, inner && shrink(inner.box, DISC_SHARE), drawn.box));
          // An empty slot is a plain dark disc inside the rim: the movie's swirl is
          // not one of its parts, so the disc is laid over it.
          if (!icon) {
            return (
              <span
                key={`empty-${slot.path}`}
                data-wheel-empty={slot.index}
                aria-hidden="true"
                className="pointer-events-none rounded-full bg-chrome-950"
                style={disc}
              />
            );
          }
          // Over the disc inside the rim, so none of the swirl shows; counter-turned so it stays upright.
          return (
            <img
              key={`icon-${slot.path}`}
              data-wheel-icon={slot.index}
              src={iconUrl(icon)}
              alt=""
              aria-hidden="true"
              className="pointer-events-none rounded-full object-cover"
              style={{
                ...disc,
                transform: `rotate(${-turn}rad)`,
                transition: slide,
              }}
              draggable={false}
            />
          );
        })}
        {over.image && (
          <img
            src={over.image.url}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={over.sized}
            draggable={false}
          />
        )}
        <span
          ref={anchor}
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{ left: pct(centre.x, frame.w), top: pct(centre.y, frame.h) }}
        />
        {/* Where the ring is taken hold of: the disc the slots stand on. */}
        <div
          data-wheel-grip
          className="pointer-events-auto absolute touch-none rounded-full"
          style={{
            ...at({ x: centre.x - reach, y: centre.y - reach, w: reach * 2, h: reach * 2 }),
          }}
        />
        {refs.map(slot => {
          const drawn = plates[slot.index];
          if (!drawn) return null;
          const spellId = spells[slot.index] ?? null;
          const cooling = viewOf(slot).sweep !== null;
          return (
            <button
              key={slot.path}
              type="button"
              data-spell-slot={firstSlot + slot.index}
              aria-label={
                spellId === null ? `Empty ring slot ${slot.index + 1}` : getSpellName(spellId)
              }
              title={spellId === null ? undefined : getSpellName(spellId)}
              aria-disabled={spellId === null || cooling}
              onPointerDown={() => {
                if (spellId !== null) setPressedSlot(slot.index);
              }}
              onPointerUp={() => setPressedSlot(null)}
              onPointerLeave={() => setPressedSlot(null)}
              onClick={() => {
                if (justTurned.current) return;
                if (spellId !== null && !cooling) onCast(spellId);
              }}
              className={cx(
                'pointer-events-auto cursor-pointer touch-none rounded-full border-0 bg-transparent p-0',
                'focus-visible:outline-none aria-disabled:cursor-default',
              )}
              style={at(drawn.box)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** A box of the same middle, `share` of the size. */
function shrink(box: PiecePart['box'], share: number): PiecePart['box'] {
  return {
    x: box.x + (box.w * (1 - share)) / 2,
    y: box.y + (box.h * (1 - share)) / 2,
    w: box.w * share,
    h: box.h * share,
  };
}
