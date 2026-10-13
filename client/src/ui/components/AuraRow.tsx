/** A unit's aura icons, buffs first, each opening a card; the movie's spot where available. */

import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { auraClock, liveAuras, toggleAuraCard } from '../auraStore';
import type { Aura } from '../auraStore';
import { getSpellIcon, getSpellName, wantSpellDetails } from '../../gameplay/SpellBook';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { iconUrl } from '../iconUrl';
import { cx } from './cx';

/** Our name for one aura's icon. The spec says which piece of the movie wears it. */
export const AURA_ICON_SCREEN = 'auraIcon';

/** The icons are laid in lines of at most this many, own choice. */
const PER_LINE = 6;

/** How often a countdown on screen is redrawn, in ms. Under a second, so no second is skipped. */
const TICK_MS = 250;

/**
 * This client's aura clock, redrawn while `running`.
 *
 * Only a screen that shows a countdown ticks: a row with nothing timed on
 * it has nothing to redraw.
 */
export function useAuraClock(running: boolean): number {
  const [now, setNow] = useState(auraClock);
  useEffect(() => {
    if (!running) return;
    setNow(auraClock());
    const timer = window.setInterval(() => setNow(auraClock()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);
  return now;
}

export interface AuraRowProps {
  /** Whose auras these are, as `auraStore` keys them. */
  unitKey: string;
  auras: readonly Aura[];
  className?: string;
}

export function AuraRow({ unitKey, auras, className }: AuraRowProps): JSX.Element | null {
  const spec = useWornScreen(AURA_ICON_SCREEN);
  const now = useAuraClock(auras.some(one => one.endsAt !== null));
  const shown = liveAuras(auras, now);
  const spells = shown.map(one => one.spellId).join(',');
  useEffect(() => {
    // An aura an enemy put on the hero is a spell the hero does not know:
    // its picture, name and words have to be asked for.
    if (spells) wantSpellDetails(spells.split(',').map(Number));
  }, [spells]);
  if (!shown.length) return null;

  return (
    <div
      role="list"
      aria-label="Active effects"
      className={cx('pointer-events-auto grid w-max grid-flow-row', className)}
      style={{ gridTemplateColumns: `repeat(${Math.min(PER_LINE, shown.length)}, auto)` }}
      // The target's frame sits in a wrapper that lets the target go on
      // any press; a press on one of its auras is not that.
      onClick={event => event.stopPropagation()}
    >
      {shown.map(aura => (
        <AuraIcon key={aura.spellId} unitKey={unitKey} aura={aura} spec={spec} />
      ))}
    </div>
  );
}

function AuraIcon({
  unitKey,
  aura,
  spec,
}: {
  unitKey: string;
  aura: Aura;
  spec: ScreenSpec | null;
}): JSX.Element {
  const name = getSpellName(aura.spellId);
  const label = [
    name,
    aura.harmful ? 'harmful' : null,
    aura.stacks > 1 ? `${aura.stacks} stacks` : null,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button
      type="button"
      role="listitem"
      data-aura-icon={aura.spellId}
      aria-label={label}
      aria-haspopup="dialog"
      onClick={event => {
        const box = event.currentTarget.getBoundingClientRect();
        toggleAuraCard({ unitKey, spellId: aura.spellId, at: { x: box.left, y: box.bottom } });
      }}
      className="relative block cursor-pointer border-0 bg-transparent p-0 focus-visible:shadow-selected focus-visible:outline-none"
    >
      {spec ? <WornIcon aura={aura} spec={spec} /> : <BuiltIcon aura={aura} />}
    </button>
  );
}

/** The spell's own picture, or nothing while it has not been read. */
function Picture({ spellId, style }: { spellId: number; style?: JSX.CSSProperties }) {
  const icon = getSpellIcon(spellId);
  return icon ? (
    <img
      src={iconUrl(icon)}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={style}
      draggable={false}
    />
  ) : null;
}

function BuiltIcon({ aura }: { aura: Aura }): JSX.Element {
  return (
    <span
      className={cx(
        'relative block size-7 overflow-hidden rounded-chrome-sm border-2 bg-chrome-900',
        aura.harmful ? 'border-status-error' : 'border-status-success',
      )}
    >
      <Picture spellId={aura.spellId} style={{ inset: 0, width: '100%', height: '100%' }} />
      {aura.stacks > 1 && (
        <span className="absolute right-0 bottom-0 bg-chrome-950/85 px-0.5 font-chrome text-tiny leading-none text-parchment-100">
          {aura.stacks}
        </span>
      )}
    </span>
  );
}

/**
 * Which parts of the movie's aura spot one aura shows: the rim for its
 * kind and not the other, and the stack badge only past one stack.
 */
export function auraIconStates(
  aura: Pick<Aura, 'harmful' | 'stacks'>,
  spec: Pick<ScreenSpec, 'groups' | 'values' | 'hidden'>,
): { hidden: string[]; shown: string[] } {
  const groups = spec.groups ?? {};
  const rim = aura.harmful ? groups.debuff : groups.buff;
  const other = aura.harmful ? groups.buff : groups.debuff;
  const badge = aura.stacks > 1 ? [] : [groups.badge, spec.values?.stacks];
  return {
    hidden: [...(spec.hidden ?? []), ...[other, ...badge].filter((one): one is string => !!one)],
    shown: rim ? [rim] : [],
  };
}

function WornIcon({ aura, spec }: { aura: Aura; spec: ScreenSpec }): JSX.Element | null {
  const states = auraIconStates(aura, spec);
  const frameName = typeof spec.frame === 'string' ? spec.frame : undefined;
  const pictureAt = spec.groups?.picture;
  const base = { ...states, ...(frameName ? { only: frameName } : {}) };
  // The rim is under the spell's picture and the badge over it, as the
  // movie stacks them, so the art is drawn in two halves either side of
  // the picture's spot.
  const under = useWorn(
    spec.dialog,
    spec.frame,
    pictureAt ? { ...base, split: { at: pictureAt, keep: 'before' as const } } : base,
    { unplaced: true },
  );
  const over = useWorn(
    pictureAt ? spec.dialog : undefined,
    spec.frame,
    { ...base, split: { at: pictureAt ?? '', keep: 'after' as const } },
    { unplaced: true },
  );
  if (!under.frame) return null;
  const frame = under.frame;
  const spot = pictureAt ? under.find(pictureAt) : undefined;
  // The picture fills the spot's rim with the same margin on every side
  // as the movie leaves at its top-left corner.
  const inset = spot ? spot.box.x : 0;
  const side = Math.max(0, frame.w - 2 * inset);
  const pct = (units: number, of: number): string => `${(units / of) * 100}%`;
  const lettered = over.image ? over : under;
  const count = aura.stacks > 1 ? lettered.fieldOf(lettered.find(spec.values?.stacks)) : undefined;

  return (
    <span className="relative block" style={under.sized}>
      {under.image && (
        <img
          ref={under.pictureRef}
          src={under.image.url}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={under.sized}
          draggable={false}
        />
      )}
      {spot && (
        <Picture
          spellId={aura.spellId}
          style={{
            left: pct(inset, frame.w),
            top: pct(spot.box.y, frame.h),
            width: pct(side, frame.w),
            height: pct(side, frame.h),
          }}
        />
      )}
      {over.image && (
        <img
          ref={over.pictureRef}
          src={over.image.url}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={over.sized}
          draggable={false}
        />
      )}
      {count && <span style={lettered.words(count, LIGHT)}>{aura.stacks}</span>}
    </span>
  );
}
