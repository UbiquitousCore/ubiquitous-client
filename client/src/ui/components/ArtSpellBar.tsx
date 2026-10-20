/**
 * The right-edge spell bar: twelve slots and a mount slot, a sliding handle,
 * the movie's sweep, tints and flashes; rules in `spellBarModel`.
 */

import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';

import { getSpellIcon, getSpellName, spellStats, wantSpellStats } from '../../gameplay/SpellBook';
import { barRun } from '../art/faceRuns';
import type { FaceRun } from '../art/faceRuns';
import type { PiecePart, PlanStates } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { useWorn, useWornScreen } from '../art/useWorn';
import { iconUrl } from '../iconUrl';
import {
  closedShift,
  barPlacement,
  barSwap,
  spellBarCoversCorner,
  governingCooldown,
  iconBox,
  jumpRoom,
  slotRefs,
  slotUse,
  spellBarStates,
  sweepFace,
} from '../spellBarModel';
import type { SlotCooldown, SlotNames, SlotRef, SlotView } from '../spellBarModel';
import { cx } from './cx';
import { useFlashes } from './useFlashes';
import { spellDragOver, startSpellDrag } from './spellDrag';

/** Our name for this screen. The spec says which dialog wears it. */
export const SPELL_BAR_SCREEN = 'spellBar';

/** The bar stands at its own size down the edge, not at a place on a stage. */
const EDGE = { unplaced: true } as const;

export interface ArtSpellBarProps {
  /** One entry per slot of the numbered run, null for an empty one. */
  spells: ReadonlyArray<number | null>;
  /** The spell the mount's own slot holds. */
  mountSpell: number | null;
  cooldowns: ReadonlyMap<number, SlotCooldown>;
  globalCooldown: SlotCooldown | null;
  castingSpellId: number | null;
  /** What the hero has to spend on a spell. */
  power: number;
  dead: boolean;
  onCast(spellId: number): void;
  /** Put a spell in a slot, or empty it: a slot held and dropped on another trades places with it. */
  onPlace(slot: number, spellId: number | null): void;
  open: boolean;
  onOpenChange(open: boolean): void;
}

/** Null where there is no movie to wear, which means there is no bar. */
export function ArtSpellBar(props: ArtSpellBarProps): JSX.Element | null {
  const spec = useWornScreen(SPELL_BAR_SCREEN);
  return spec?.grids?.slots && spec.groups ? <Worn {...props} spec={spec} /> : null;
}

/** The names the spec gives what lies in and beside a slot. */
function namesOf(spec: ScreenSpec): SlotNames {
  const grid = spec.grids!.slots!;
  const groups = spec.groups!;
  return {
    slot: grid.slot,
    within: grid.within!,
    mount: groups.mount,
    sweep: groups.sweep!,
    unusable: groups.unusable!,
    short: groups.short!,
    lit: groups.lit!,
    resting: groups.resting!,
    flash: groups.flash!,
  };
}

/** How tall the view is, kept current as it is resized. */
function useViewportHeight(): number {
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const measure = (): void => setHeight(window.innerHeight);
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);
  return height;
}

function Worn({
  spells,
  mountSpell,
  cooldowns,
  globalCooldown,
  castingSpellId,
  power,
  dead,
  onCast,
  onPlace,
  open,
  onOpenChange,
  spec,
}: ArtSpellBarProps & { spec: ScreenSpec }): JSX.Element | null {
  const names = namesOf(spec);
  const bars = spec.bars;
  const sweepRun = bars ? barRun(bars, `${names.within}/${names.slot}01/${names.sweep}`) : null;
  const flashRun: FaceRun = { first: 0, last: bars?.own?.flash?.frames ?? 0 };

  // One entry per slot of the dialog, the mount's last.
  const held = [...spells, mountSpell];
  const stats = spellStats.value;
  const heldKey = held.join(',');
  useEffect(() => {
    wantSpellStats(held.filter((id): id is number => id !== null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey]);
  const cooling = held.map(id => (id === null ? false : (cooldowns.get(id)?.remaining ?? 0) > 0));
  const flashes = useFlashes(cooling, flashRun);
  const dragOver = spellDragOver.value;
  const [pressedSlot, setPressedSlot] = useState<number | null>(null);
  /** Set by a drag's drop, so the click that ends the same press does not cast. */
  const dropped = useRef(false);
  const viewHeight = useViewportHeight();

  const viewOf = (slot: SlotRef): SlotView => {
    const spellId = held[slot.index] ?? null;
    const cd = spellId === null ? null : governingCooldown(cooldowns.get(spellId), globalCooldown);
    return {
      filled: spellId !== null,
      pressed: pressedSlot === slot.index,
      sweep: sweepRun ? sweepFace(cd, sweepRun) : null,
      use:
        spellId === null
          ? 'ready'
          : slotUse({
              cost: stats.get(spellId)?.powerCost,
              power,
              dead,
            }),
      lit: (spellId !== null && spellId === castingSpellId) || dragOver === slot.index,
      flash: flashes[slot.index] ?? null,
    };
  };
  const statesFor = (whole: PiecePart[]): ReturnType<typeof spellBarStates> => {
    const refs = slotRefs(whole, names);
    return spellBarStates(refs, refs.map(viewOf), { dialog: spec.dialog, open });
  };

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    (whole): PlanStates => {
      const { base } = statesFor(whole);
      return { hidden: [...(spec.hidden ?? []), ...base.hidden], frames: base.frames };
    },
    EDGE,
  );
  const over = useWorn(
    spec.dialog,
    spec.frame,
    (whole): PlanStates => {
      const { base, over: on } = statesFor(whole);
      return { only: on.only, driven: on.driven, frames: { ...base.frames, ...on.frames } };
    },
    EDGE,
  );

  if (!worn.image || !worn.frame) return null;
  const frame = worn.frame;
  const refs = slotRefs(worn.whole, names);
  // The control that opens the bar, or the one that stands in its place on the face where it is out.
  const framed = new Set([spec.frame].flat());
  const handle = worn.parts.find(
    part =>
      part.draws &&
      !part.path.includes('/') &&
      (part.path === spec.groups!.handle || !framed.has(part.path)),
  );
  const shift = open || !worn.onStage || !worn.stage ? 0 : closedShift(worn.onStage, worn.stage.w);
  // Between the minimap and the jump button, as the movie leaves room.
  const top = (worn.onStage?.y ?? 0) * worn.perUnit;
  const { covers, fit } = barPlacement(
    open,
    viewHeight - top - jumpRoom.value,
    viewHeight - top,
    frame.h * worn.perUnit,
  );
  useEffect(() => {
    spellBarCoversCorner.value = covers;
    return () => {
      spellBarCoversCorner.value = false;
    };
  }, [covers]);
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;
  const at = (box: PiecePart['box']): JSX.CSSProperties => ({
    position: 'absolute',
    left: pct(box.x, frame.w),
    top: pct(box.y, frame.h),
    width: pct(box.w, frame.w),
    height: pct(box.h, frame.h),
  });

  return (
    <div
      className="pointer-events-none fixed right-safe-r z-hud-bar origin-bottom-right"
      style={{
        bottom: covers ? 'env(safe-area-inset-bottom)' : `${jumpRoom.value}px`,
        transform: `scale(${fit})`,
      }}
    >
      <div
        data-spell-bar
        data-open={open}
        className="relative transition-transform duration-200 ease-out"
        style={{ ...worn.sized, transform: `translateX(${shift * 100}%)` }}
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
          const spellId = held[slot.index] ?? null;
          const icon = spellId === null ? undefined : getSpellIcon(spellId);
          const drawn = worn.parts.find(part => part.path === slot.path);
          const whole = worn.whole.find(part => part.path === slot.path);
          const tint = worn.whole.find(part => part.path === slot.unusable);
          if (!drawn || !icon || !whole) return null;
          return (
            <img
              key={`icon-${slot.path}`}
              data-spell-icon={slot.index}
              src={iconUrl(icon)}
              alt=""
              aria-hidden="true"
              className="pointer-events-none rounded-full object-cover"
              style={at(iconBox(whole.box, tint?.box, drawn.box))}
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
        {refs.map(slot => {
          const drawn = worn.parts.find(part => part.path === slot.path);
          if (!drawn) return null;
          const spellId = held[slot.index] ?? null;
          const view = viewOf(slot);
          return (
            <button
              key={slot.path}
              type="button"
              data-spell-slot={slot.index}
              data-use={view.use}
              aria-label={spellId === null ? `Empty slot ${slot.index + 1}` : getSpellName(spellId)}
              title={spellId === null ? undefined : getSpellName(spellId)}
              aria-disabled={spellId === null || view.sweep !== null}
              onPointerDown={(event: PointerEvent) => {
                if (spellId === null) return;
                setPressedSlot(slot.index);
                startSpellDrag(event, spellId, (_spell, to) => {
                  dropped.current = true;
                  setPressedSlot(null);
                  for (const [at, id] of barSwap(slot.index, to, held) ?? []) onPlace(at, id);
                });
              }}
              onPointerUp={() => setPressedSlot(null)}
              onPointerLeave={() => setPressedSlot(null)}
              onPointerCancel={() => setPressedSlot(null)}
              onClick={() => {
                if (dropped.current) {
                  dropped.current = false;
                  return;
                }
                if (spellId !== null && view.sweep === null) onCast(spellId);
              }}
              className={cx(
                'pointer-events-auto cursor-pointer rounded-full border-0 bg-transparent p-0',
                'focus-visible:outline-none aria-disabled:cursor-default',
              )}
              style={at(drawn.box)}
            />
          );
        })}
        {handle && (
          <button
            type="button"
            aria-label={open ? 'Hide spell bar' : 'Show spell bar'}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            className="pointer-events-auto cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-none"
            style={at(handle.box)}
          />
        )}
      </div>
    </div>
  );
}
