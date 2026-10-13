/** The menu beside a row; one control, since this client offers one action. */

import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const ROW_MENU_SCREEN = 'rowMenu';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtRowMenuProps {
  /** Where on screen the row was, so the menu stands beside it. */
  beside?: { x: number; y: number } | null;
  /** What the one control reads, in the user's interface strings. */
  says: string;
  onPick(): void;
  onClose(): void;
}

export function ArtRowMenu(props: ArtRowMenuProps): JSX.Element | null {
  const spec = useWornScreen(ROW_MENU_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  beside,
  says,
  onPick,
  onClose,
  spec,
}: ArtRowMenuProps & { spec: ScreenSpec }): JSX.Element | null {
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: spec.hidden ?? [] },
    { floats: true },
  );

  useEffect(() => {
    const away = (): void => onClose();
    document.addEventListener('pointerdown', away, { capture: true, once: true });
    return () => document.removeEventListener('pointerdown', away, { capture: true });
  }, [onClose]);

  if (!worn.image || !worn.frame) return null;

  /** How big it comes out on screen, which is not how big it was drawn. */
  const shownWide = parseFloat(String(worn.sized.width ?? '0'));
  const shownTall = parseFloat(String(worn.sized.height ?? '0'));

  return (
    <div
      role="menu"
      aria-label={says}
      className="z-card pointer-events-auto fixed overflow-hidden"
      style={{
        left: `${Math.max(0, Math.min(beside?.x ?? 0, globalThis.innerWidth - shownWide))}px`,
        top: `${Math.max(0, Math.min(beside?.y ?? 0, globalThis.innerHeight - shownTall))}px`,
      }}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block"
        style={worn.sized}
        draggable={false}
      />

      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        const field = worn.fieldOf(worn.find(spec.values?.[what]));
        if (!part) return null;
        return (
          <div key={where}>
            <button
              type="button"
              role="menuitem"
              aria-label={says}
              onClick={onPick}
              style={worn.box(part)}
              className={HIT}
            />
            {field ? <span style={worn.words(field, INK)}>{says}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
