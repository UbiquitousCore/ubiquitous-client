/** An aura's card: name, words and countdown, on the talent card's sheet or the built card; closes on any other press. */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import { auraCancel, auraCard, auraCardWords, aurasFor, closeAuraCard } from '../auraStore';
import type { AuraCardWords } from '../auraStore';
import { getSpellName, wantSpellDetails } from '../../gameplay/SpellBook';
import { spellTexts } from '../inventoryStore';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { ItemTooltip } from './ItemTooltip';
import { useAuraClock } from './AuraRow';

/** Our name for the aura card. The spec says which dialog wears it. */
export const AURA_CARD_SCREEN = 'auraCard';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 ' +
  'focus-visible:outline-brass-300 active:brightness-90';

/** The open aura's card, or nothing while none is open or the aura has ended. */
export function AuraCard(): JSX.Element | null {
  const open = auraCard.value;
  const spec = useWornScreen(AURA_CARD_SCREEN);
  const now = useAuraClock(open !== null);
  const aura = open
    ? aurasFor(open.unitKey, now).find(one => one.spellId === open.spellId)
    : undefined;
  const spellId = open?.spellId ?? 0;
  useEffect(() => {
    if (spellId) wantSpellDetails([spellId]);
  }, [spellId]);
  // An aura that ends while its card is open takes the card with it.
  useEffect(() => {
    if (open && !aura) closeAuraCard();
  }, [open, aura]);

  const held = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // A press anywhere but the card puts it away. A press on an aura's
    // icon is left to the icon, which opens its own card or, for this
    // one, puts it away.
    const away = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (held.current?.contains(target) || target.closest('[data-aura-icon]')) return;
      closeAuraCard();
    };
    document.addEventListener('pointerdown', away, { capture: true });
    return () => document.removeEventListener('pointerdown', away, { capture: true });
  }, [open !== null]);

  // Kept inside the view: measured once drawn, and moved back in from
  // whichever edge it runs past.
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const box = held.current?.getBoundingClientRect();
    if (box && (box.width !== size.w || box.height !== size.h)) {
      setSize({ w: box.width, h: box.height });
    }
  });

  if (!open || !aura) return null;
  const words = auraCardWords(
    aura,
    {
      name: getSpellName(aura.spellId),
      text: spellTexts.value.get(aura.spellId) ?? '',
      timeLeft: spec?.formats?.timeLeft,
    },
    now,
  );
  const cancel = auraCancel.value(open.unitKey, aura.spellId);
  const takeOff = cancel
    ? () => {
        cancel();
        closeAuraCard();
      }
    : null;
  const at = {
    left: `${Math.max(0, Math.min(open.at.x, globalThis.innerWidth - size.w))}px`,
    top: `${Math.max(0, Math.min(open.at.y, globalThis.innerHeight - size.h))}px`,
  };

  return (
    <div ref={held} data-aura-card className="pointer-events-auto fixed z-hud-float" style={at}>
      {spec ? (
        <WornCard words={words} spec={spec} onCancel={takeOff} />
      ) : (
        <ItemTooltip
          title={words.title}
          lines={[
            ...(words.time ? [{ text: words.time, tone: 'effect' as const }] : []),
            ...(words.body ? [{ text: words.body }] : []),
          ]}
          onClose={closeAuraCard}
        />
      )}
    </div>
  );
}

function WornCard({
  words,
  spec,
  onCancel,
}: {
  words: AuraCardWords;
  spec: ScreenSpec;
  onCancel: (() => void) | null;
}): JSX.Element | null {
  const cancel = onCancel ? spec.card?.actions?.cancel : undefined;
  const strip = cancel?.strip;
  // The strip's panel is parked with its siblings; only its own control shows.
  const panel = strip?.slice(0, strip.lastIndexOf('/'));
  const worn = useWorn(
    spec.dialog,
    strip ? [...[spec.frame ?? []].flat(), strip] : spec.frame,
    // The marks and bar that say the words run on stay hidden: an aura's
    // words are a line or two.
    {
      shownInside: panel ? [panel] : [],
      hidden: [
        ...(spec.hidden ?? []).filter(name => name !== panel),
        ...(strip && panel
          ? [`${panel}/panelAdd`, `${cancel!.control}/disable`, `${cancel!.control}/text1`]
          : []),
        ...[spec.marks?.above, spec.marks?.below, spec.panels?.bar].filter((name): name is string =>
          Boolean(name),
        ),
      ],
    },
    { floats: true },
  );
  if (!worn.image || !worn.frame) return null;
  const title = worn.fieldOf(worn.find(spec.card?.title));
  const body = worn.fieldOf(worn.find(spec.card?.body));
  const shut = worn.find(spec.close);
  const said = [words.time, words.body].filter(Boolean).join('\n\n');

  return (
    <div role="dialog" aria-label={words.title} className="relative">
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block"
        style={worn.sized}
        draggable={false}
      />
      {shut && (
        <button
          type="button"
          aria-label="Close"
          onClick={closeAuraCard}
          style={worn.box(shut)}
          className={HIT}
        />
      )}
      {title && <span style={worn.words(title, LIGHT, true)}>{words.title}</span>}
      {cancel && onCancel
        ? (() => {
            const control = worn.find(cancel.control);
            const label = worn.fieldOf(worn.find(cancel.label));
            return control ? (
              <>
                <button
                  type="button"
                  aria-label={cancel.says || 'Cancel'}
                  onClick={onCancel}
                  style={worn.box(control)}
                  className={HIT}
                />
                {label && cancel.says ? <span style={worn.words(label)}>{cancel.says}</span> : null}
              </>
            ) : null;
          })()
        : null}
      {body && (
        <span
          style={{
            ...worn.words(body, INK, true),
            alignItems: 'flex-start',
            whiteSpace: 'pre-line',
          }}
        >
          {said}
        </span>
      )}
    </div>
  );
}
