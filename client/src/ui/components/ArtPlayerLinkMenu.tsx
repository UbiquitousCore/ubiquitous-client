/** The plus-icon popup: as many of the piece's buttons as the caller's `{label, onPick}` list holds. */

import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, useWorn, useWornScreen } from '../art/useWorn';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const PLAYER_LINK_SCREEN = 'playerLink';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface PlayerLinkAction {
  label: string;
  onPick(): void;
}

export interface ArtPlayerLinkMenuProps {
  /** Where on screen the unit's plus icon was, so the menu stands beside it. */
  beside?: { x: number; y: number } | null;
  /** What to offer, in the order it should be offered. */
  actions: readonly PlayerLinkAction[];
  onClose(): void;
}

export function ArtPlayerLinkMenu(props: ArtPlayerLinkMenuProps): JSX.Element | null {
  const spec = useWornScreen(PLAYER_LINK_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  beside,
  actions,
  onClose,
  spec,
}: ArtPlayerLinkMenuProps & { spec: ScreenSpec }): JSX.Element | null {
  // The controls the piece actually has, in the order the spec lists them —
  // the same order `menu` (the toolbar) already relies on.
  const slots = Object.keys(spec.actions ?? {});
  // Slots past what the caller offered stay parked, the way `rowMenu` parks
  // every slot beyond its one live action.
  const unused = slots.slice(actions.length);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { shown: spec.shown ?? [], hidden: [...(spec.hidden ?? []), ...unused] },
    { floats: true },
  );

  const menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A press on the menu itself is left for its own control.
    const away = (event: PointerEvent): void => {
      if (!menu.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', away, { capture: true });
    return () => document.removeEventListener('pointerdown', away, { capture: true });
  }, [onClose]);

  if (!worn.image || !worn.frame) return null;

  /** How big it comes out on screen, which is not how big it was drawn. */
  const shownWide = parseFloat(String(worn.sized.width ?? '0'));
  const shownTall = parseFloat(String(worn.sized.height ?? '0'));

  return (
    <div
      ref={menu}
      role="menu"
      aria-label="Actions"
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

      {slots.map((control, index) => {
        const action = actions[index];
        if (!action) return null;
        const part = worn.find(control);
        const what = spec.actions?.[control];
        const field = worn.fieldOf(worn.find(spec.values?.[what ?? '']));
        if (!part) return null;
        return (
          <div key={control}>
            <button
              type="button"
              role="menuitem"
              aria-label={action.label}
              onClick={action.onPick}
              style={worn.box(part)}
              className={HIT}
            />
            {field ? <span style={worn.words(field, INK)}>{action.label}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
