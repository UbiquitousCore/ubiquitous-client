/** The shipped cast bar: icon, name, and a clip turned to the face for the cast's progress. */

import type { JSX } from 'preact';

import { getSpellIcon, getSpellName } from '../../gameplay/SpellBook';
import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { wornLettering } from '../art/wornFont';
import { iconUrl } from '../iconUrl';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const CAST_BAR_SCREEN = 'castBar';

export interface CastBarProps {
  spellId: number;
  castTime: number;
  elapsed: number;
  /** Broken off: held where it stopped, saying so in place of the spell's name. */
  interrupted?: boolean;
}

export const INTERRUPTED_LABEL = 'Interrupted';

/** The bar stands at its own size along the bottom edge, not at a place on a stage. */
const ROW = { unplaced: true } as const;

/**
 * The face of a bar `run` faces long for a share of it filled: the last
 * face for none, the first for all of it, rounded down to a whole face
 * between.
 */
export function castFace(filled: number, run: number): number {
  const share = Math.max(0, Math.min(1, filled));
  return run - Math.floor(share * run);
}

/** Null where there is no movie to wear. */
export function ArtCastBar(props: CastBarProps): JSX.Element | null {
  const spec = useWornScreen(CAST_BAR_SCREEN);
  return spec?.bars?.of.cast ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  spellId,
  castTime,
  elapsed,
  interrupted,
  spec,
}: CastBarProps & { spec: ScreenSpec }): JSX.Element | null {
  const bar = spec.bars!;
  const filled = castTime > 0 ? Math.min(1, elapsed / castTime) : 1;
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { hidden: spec.hidden ?? [], frames: { [bar.of.cast!]: castFace(filled, bar.frames) } },
    ROW,
  );
  if (!worn.image || !worn.frame) return null;
  const icon = getSpellIcon(spellId);
  const name = getSpellName(spellId);

  return (
    <div
      className="flex items-center gap-1"
      role="progressbar"
      aria-label={interrupted ? `${name}, ${INTERRUPTED_LABEL.toLowerCase()}` : name}
      data-interrupted={interrupted ? '' : undefined}
    >
      {icon && (
        <img
          src={iconUrl(icon)}
          alt=""
          aria-hidden="true"
          className="aspect-square shrink-0 rounded-chrome-sm"
          style={{ height: worn.sized.height }}
          draggable={false}
        />
      )}
      <div className="relative" style={worn.sized}>
        <img
          ref={worn.pictureRef}
          src={worn.image.url}
          alt=""
          aria-hidden="true"
          className="absolute inset-0"
          style={worn.sized}
          draggable={false}
        />
        <span
          className="absolute inset-0 flex items-center justify-center text-xs whitespace-nowrap text-shadow-world"
          style={{ fontFamily: wornLettering(), color: LIGHT }}
        >
          {interrupted ? INTERRUPTED_LABEL : name}
        </span>
      </div>
    </div>
  );
}
