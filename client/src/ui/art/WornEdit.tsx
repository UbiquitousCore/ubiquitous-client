/** A button that becomes a text input when pressed, as the interface's fields do; limits come from the spec. */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import type { PiecePart } from './piecePlan';
import type { Worn } from './useWorn';

export interface WornEditProps {
  worn: Worn;
  /** The control the player presses to start typing. */
  part: PiecePart;
  /** What it is called, for anyone who cannot see where it sits. */
  name: string;
  value: string;
  onInput(value: string): void;
  /** How many characters the screen accepts, where it caps them. */
  max?: number;
  /** True where the control was laid out with room for several lines. */
  lines?: boolean;
  /** True where only a number goes in. */
  number?: boolean;
  /** What colour the words at rest are drawn in. */
  tone?: string;
  /** Words shown while the control holds nothing, for a screen that has them. */
  placeholder?: string;
}

const TYPING =
  'absolute border border-brass-400 bg-chrome-950 px-1 text-parchment-100 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

const RESTING =
  'absolute cursor-text border-0 bg-transparent p-0 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export function WornEdit({
  worn,
  part,
  name,
  value,
  onInput,
  max,
  lines,
  number,
  tone,
  placeholder,
}: WornEditProps): JSX.Element {
  const [typing, setTyping] = useState(false);
  // Where the words go is the field's, not the control's: a control is
  // the whole row it sits in — its own caption included — and words put
  // in the control's box come out beside the box a player can see.
  const field = worn.fieldOf(part);
  const where = field ?? part;
  // A control the screen drives rather than draws has no extent of its
  // own, so the field it writes in is the only thing to press.
  const press = part.box.w > 0 && part.box.h > 0 ? part : where;
  const shape: JSX.CSSProperties = {
    ...worn.box(where),
    fontSize: `${(Math.min(field?.text?.sizePx ?? 12, where.box.h || 12) * worn.scale).toFixed(1)}px`,
  };
  const stop = (event: KeyboardEvent): void => {
    // Enter ends a single-line field and is a new line in a long one.
    if (event.key === 'Escape' || (event.key === 'Enter' && !lines)) setTyping(false);
  };
  const took = (event: Event): void => {
    const said = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    onInput(max === undefined ? said : said.slice(0, max));
  };

  if (typing) {
    const shared = {
      // Focused as it appears rather than asked for: `autofocus` only
      // applies to a page being loaded, so the control came up needing a
      // second press before it would take a letter.
      ref: (on: HTMLInputElement | HTMLTextAreaElement | null) => on?.focus(),
      autofocus: true,
      value,
      'aria-label': name,
      maxLength: max,
      onInput: took,
      onBlur: () => setTyping(false),
      onKeyDown: stop,
      style: shape,
      className: TYPING,
    };
    return lines ? (
      <textarea {...shared} />
    ) : (
      <input {...shared} type={number ? 'number' : 'text'} min={number ? 0 : undefined} />
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={name}
        onClick={() => setTyping(true)}
        style={worn.box(press)}
        className={RESTING}
      />
      {/* What it holds, written where the screen writes it. The control
          above takes the press, so this must not. */}
      <span style={{ ...worn.words(where, tone, lines), pointerEvents: 'none' }}>
        {value || placeholder || ''}
      </span>
    </>
  );
}
