import type { JSX } from 'preact';
import { getSpellIcon, getSpellName } from '../../gameplay/SpellBook';
import { iconUrl } from '../iconUrl';
import { spellDrag } from './spellDrag';

/** The spell under the pointer while it is being dragged to the bar. */
export function SpellDragGhost(): JSX.Element | null {
  const drag = spellDrag.value;
  if (!drag) return null;
  const icon = getSpellIcon(drag.spellId);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed z-dialog size-12 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-chrome-sm border border-brass-300 bg-chrome-950/90 opacity-90 shadow-frame"
      style={{ left: `${drag.x}px`, top: `${drag.y}px` }}
    >
      {icon ? (
        <img src={iconUrl(icon)} alt="" className="size-full" draggable={false} />
      ) : (
        <span className="flex size-full items-center justify-center text-micro text-parchment-100">
          {getSpellName(drag.spellId)}
        </span>
      )}
    </div>
  );
}
