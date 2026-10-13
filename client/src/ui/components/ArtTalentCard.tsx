/**
 * One talent place on the shipped card: its spell and words from local
 * tables, with stage, unstage and confirm (shown only while staged).
 */

import type { JSX } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

import type { TalentRow } from '../../assets/types';
import {
  getSpellName,
  talentWords,
  wantSpellDetails,
  wantTalentWords,
} from '../../gameplay/SpellBook';
import { spellTexts } from '../inventoryStore';
import {
  canStage,
  canUnstage,
  confirmTalents,
  stageTalent,
  talentStaged,
  unstageTalent,
} from '../../gameplay/talents';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { unavailableFaces } from '../art/wornState';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const TALENT_CARD_SCREEN = 'talentCard';

/** What each of the card's controls is called, for anyone who cannot see it. */
const SAYS: Record<string, string> = {
  stage: 'Add a point',
  unstage: 'Take a point back',
};

const NO_WORDS: ReadonlyMap<number, string> = new Map();

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 ' +
  'focus-visible:outline-brass-300 active:brightness-90 disabled:cursor-default';

/** Where something is on the page, in pixels. */
export interface WhereOnPage {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ArtTalentCardProps {
  /** The place being read. */
  place: TalentRow;
  /** Where that place is on the page, so the card stands beside it. */
  beside?: WhereOnPage | null;
  onClose(): void;
}

/** A card beside `place`, right or else left, level with its top and inside the view, so its rank stays visible. */
export function standBeside(
  place: WhereOnPage,
  wide: number,
  tall: number,
  room: { w: number; h: number },
): { x: number; y: number } {
  const across = place.right + wide <= room.w ? place.right : place.left - wide;
  return {
    x: Math.max(0, Math.min(across, room.w - wide)),
    y: Math.max(0, Math.min(place.top, room.h - tall)),
  };
}

export function ArtTalentCard(props: ArtTalentCardProps): JSX.Element | null {
  const spec = useWornScreen(TALENT_CARD_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  place,
  beside,
  onClose,
  spec,
}: ArtTalentCardProps & { spec: ScreenSpec }): JSX.Element | null {
  /** The spell the first rank teaches, which is what the place is. */
  const spell = place.spells[0] ?? 0;
  useEffect(() => {
    wantSpellDetails([spell]);
    // A place carries the number of its own line, and what it does is
    // the line after that: the spell it teaches often has no name of its
    // own at all. A place numbered nought has no line.
    if (place.says > 0) wantTalentWords([place.says, place.says + 1]);
  }, [spell, place.says]);

  // Read so the card follows the staging as it changes.
  const staged = talentStaged.value;
  const can: Record<string, boolean> = {
    stage: canStage(place.id),
    unstage: canUnstage(place.id),
    confirm: staged.size > 0,
  };
  const faces = unavailableFaces(spec, can);
  /** The lit marks of controls that can do nothing just now. */
  const unlit = Object.entries(spec.groups ?? {})
    .filter(([what]) => can[what] === false)
    .map(([, where]) => where);
  /**
   * Confirm with nothing staged is not on the card at all: it appears
   * with the first point staged and goes again once none is.
   */
  const unoffered = Object.entries(spec.actions ?? {})
    .filter(([, what]) => what === 'confirm' && !can.confirm)
    .map(([control]) => control);

  /** Whether the words run past the card, which is when it says so. */
  const [over, setOver] = useState(false);
  const runOn = [spec.marks?.above, spec.marks?.below, spec.panels?.bar].filter(
    (name): name is string => Boolean(name),
  );

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      hidden: [
        ...(spec.hidden ?? []),
        ...faces.hidden,
        ...unlit,
        ...unoffered,
        ...(over ? [] : runOn),
      ],
      shown: faces.shown,
    },
    { floats: true, spills: true },
  );

  const held = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A press anywhere but the card puts it away; a press on it, such as
    // on one of its controls, does not.
    const away = (event: PointerEvent): void => {
      if (event.target instanceof Node && held.current?.contains(event.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', away, { capture: true });
    return () => document.removeEventListener('pointerdown', away, { capture: true });
  }, [onClose]);

  const said = place.says > 0 ? talentWords.value : NO_WORDS;
  const says = said.get(place.says) || getSpellName(spell);
  const does = said.get(place.says + 1) || spellTexts.value.get(spell) || '';

  const words = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const on = words.current;
    setOver(Boolean(on && on.scrollHeight > on.clientHeight + 1));
  }, [does, worn.image?.url]);

  if (!worn.image || !worn.frame) return null;

  const title = worn.fieldOf(worn.find(spec.card?.title));
  const body = worn.fieldOf(worn.find(spec.card?.body));
  /** How big it comes out, controls and all, so the whole of it is kept inside the view. */
  const wide = parseFloat(String(worn.sized.width ?? '0'));
  const tall = parseFloat(String(worn.sized.height ?? '0'));
  const confirmField = can.confirm ? worn.find(spec.values?.confirm) : undefined;
  const stands = standBeside(beside ?? { left: 0, top: 0, right: 0, bottom: 0 }, wide, tall, {
    w: globalThis.innerWidth,
    h: globalThis.innerHeight,
  });

  return (
    <div
      ref={held}
      role="dialog"
      aria-label={says || 'Talent'}
      className="z-card pointer-events-auto fixed motion-safe:animate-[scale-in_var(--opening,160ms)_ease-out]"
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

      {(() => {
        const shut = worn.find(spec.close);
        return shut ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={worn.box(shut)}
            className={HIT}
          />
        ) : null;
      })()}

      {title ? <span style={worn.words(title, LIGHT, true)}>{says}</span> : null}
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

      {confirmField && spec.words?.confirm ? (
        <span style={worn.words(confirmField, INK)}>{spec.words.confirm}</span>
      ) : null}

      {Object.entries(spec.actions ?? {}).map(([control, what]) => {
        const part = worn.find(control);
        if (!part || unoffered.includes(control)) return null;
        const act =
          what === 'stage'
            ? () => stageTalent(place.id)
            : what === 'unstage'
              ? () => unstageTalent(place.id)
              : what === 'confirm'
                ? confirmTalents
                : undefined;
        if (!act) return null;
        return (
          <button
            key={control}
            type="button"
            aria-label={SAYS[what] ?? spec.words?.[what] ?? what}
            disabled={!can[what]}
            onClick={act}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}
    </div>
  );
}
