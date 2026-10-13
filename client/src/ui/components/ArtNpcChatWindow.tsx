/** An NPC's words on the shipped screen: name plaque, scrolling words and replies, back and close. */

import type { ComponentChildren, JSX } from 'preact';

import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';

/** Our name for this screen. The spec says which dialog wears it. */
export const NPC_CHAT_SCREEN = 'npcChat';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtNpcChatWindowProps {
  /** Who is speaking, in their own name. */
  speaker: string;
  says: ComponentChildren;
  /** What can be said back, listed under what is said, in order. */
  choices?: readonly { label: string; onPick(): void }[];
  /** Back one page. */
  onBack?(): void;
  onClose(): void;
}

export function ArtNpcChatWindow(props: ArtNpcChatWindowProps): JSX.Element | null {
  const spec = useWornScreen(NPC_CHAT_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  speaker,
  says,
  choices = [],
  onBack,
  onClose,
  spec,
}: ArtNpcChatWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const worn = useWorn(spec.dialog, spec.frame, {
    shown: spec.shown ?? [],
    hidden: [
      ...(spec.hidden ?? []),
      // Nowhere to go back to: the control is not there at all.
      ...(onBack ? [] : Object.keys(spec.actions ?? {})),
    ],
  });

  if (!worn.image || !worn.frame) return null;

  const named = worn.fieldOf(worn.find(spec.values?.title));
  const body = worn.fieldOf(worn.find(spec.values?.body));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={speaker}
      className="overflow-hidden"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-full"
        draggable={false}
      />

      {named ? <span style={worn.words(named, LIGHT)}>{speaker}</span> : null}
      {body ? (
        <div
          className="overflow-y-auto"
          style={{
            ...worn.words(body, INK, true),
            flexDirection: 'column',
            gap: '0.6em',
            pointerEvents: 'auto',
          }}
        >
          <span className="whitespace-pre-wrap">{says}</span>
          {choices.map(choice => (
            <button
              key={choice.label}
              type="button"
              onClick={choice.onPick}
              className="cursor-pointer border-0 bg-transparent p-0 text-left underline focus-visible:outline-2 focus-visible:outline-brass-300 active:brightness-90"
              style={{ font: 'inherit', color: 'inherit' }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Up one menu. */}
      {onBack
        ? Object.entries(spec.actions ?? {}).map(([where, what]) => {
            const part = worn.find(where);
            const field = worn.fieldOf(worn.find(spec.values?.[what]));
            const word = spec.words?.[what];
            if (!part) return null;
            return (
              <div key={where}>
                <button
                  type="button"
                  aria-label={word || what}
                  onClick={onBack}
                  style={worn.box(part)}
                  className={HIT}
                />
                {field && word ? <span style={worn.words(field, LIGHT)}>{word}</span> : null}
              </div>
            );
          })
        : null}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}
