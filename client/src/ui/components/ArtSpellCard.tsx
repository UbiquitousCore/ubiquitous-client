/** A spell's shipped card from the spell book: name, four stat lines (`spellCardLines`), words; no cast button. */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { getSpellIcon, getSpellName, spellStats, wantSpellStats } from '../../gameplay/SpellBook';
import { spellTexts } from '../inventoryStore';
import { iconUrl } from '../iconUrl';
import { spellCardLines } from '../spellCard';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { standBeside } from './ArtTalentCard';
import type { WhereOnPage } from './ArtTalentCard';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const SPELL_CARD_SCREEN = 'spellCard';

/** The four lines beside the picture, by what each one is for. */
const LINES = ['cost', 'range', 'cast', 'cooldown'] as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 ' +
  'focus-visible:outline-brass-300 active:brightness-90';

export interface ArtSpellCardProps {
  spellId: number;
  /** Where the row that opened it is on the page, so the card stands beside it. */
  beside?: WhereOnPage | null;
  onClose(): void;
}

export function ArtSpellCard(props: ArtSpellCardProps): JSX.Element | null {
  const spec = useWornScreen(SPELL_CARD_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  spellId,
  beside,
  onClose,
  spec,
}: ArtSpellCardProps & { spec: ScreenSpec }): JSX.Element | null {
  useEffect(() => wantSpellStats([spellId]), [spellId]);

  /** Whether what it does runs past the card, which is when it says so. */
  const [over, setOver] = useState(false);
  const runOn = [spec.marks?.above, spec.marks?.below, spec.panels?.bar].filter(
    (name): name is string => Boolean(name),
  );
  const worn = useWorn(
    spec.dialog,
    spec.frame,
    { hidden: [...(spec.hidden ?? []), ...(over ? [] : runOn)] },
    { floats: true, spills: true },
  );

  const held = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A press anywhere but the card puts it away.
    const away = (event: PointerEvent): void => {
      if (event.target instanceof Node && held.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', away, { capture: true });
    return () => document.removeEventListener('pointerdown', away, { capture: true });
  }, [onClose]);

  const does = spellTexts.value.get(spellId) ?? '';
  const lines = spellCardLines(spellStats.value.get(spellId), { range: spec.formats?.range });

  const words = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const on = words.current;
    setOver(Boolean(on && on.scrollHeight > on.clientHeight + 1));
  }, [does, worn.image?.url]);

  if (!worn.image || !worn.frame) return null;

  const title = worn.fieldOf(worn.find(spec.card?.title));
  const body = worn.fieldOf(worn.find(spec.card?.body));
  const wide = parseFloat(String(worn.sized.width ?? '0'));
  const tall = parseFloat(String(worn.sized.height ?? '0'));
  const stands = standBeside(beside ?? { left: 0, top: 0, right: 0, bottom: 0 }, wide, tall, {
    w: globalThis.innerWidth,
    h: globalThis.innerHeight,
  });
  // The picture sits in the room the four lines leave on their left.
  const firstLine = worn.find(spec.values?.cost);
  const holder = worn.find('group/groupIcon');
  const icon = getSpellIcon(spellId);
  const shut = worn.find(spec.close);

  return (
    <div
      ref={held}
      role="dialog"
      aria-label={getSpellName(spellId) || 'Spell'}
      className="pointer-events-auto fixed z-dialog motion-safe:animate-[scale-in_var(--opening,160ms)_ease-out]"
      style={{ left: `${stands.x}px`, top: `${stands.y}px` }}
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

      {shut ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={worn.box(shut)}
          className={HIT}
        />
      ) : null}

      {title ? <span style={worn.words(title, LIGHT, true)}>{getSpellName(spellId)}</span> : null}

      {icon && holder && firstLine && firstLine.box.x > holder.box.x
        ? (() => {
            const size = Math.min(firstLine.box.x - holder.box.x, holder.box.h);
            return (
              <img
                src={iconUrl(icon)}
                alt=""
                aria-hidden="true"
                data-spell-card-icon
                style={{
                  ...worn.box({
                    ...holder,
                    box: { x: holder.box.x, y: holder.box.y, w: size, h: size },
                  }),
                  objectFit: 'contain',
                  pointerEvents: 'none',
                }}
                draggable={false}
              />
            );
          })()
        : null}

      {LINES.map(which => {
        const field = worn.fieldOf(worn.find(spec.values?.[which]));
        return field && lines[which] ? (
          <span key={which} data-spell-card-line={which} style={worn.words(field, INK)}>
            {lines[which]}
          </span>
        ) : null;
      })}

      {body ? (
        <span
          ref={words}
          style={{
            ...worn.words(body, INK, true),
            alignItems: 'flex-start',
            // Scrolled by hand only once there is more than fits.
            ...(over ? { overflowY: 'auto', pointerEvents: 'auto' } : {}),
          }}
        >
          {does}
        </span>
      ) : null}
    </div>
  );
}
