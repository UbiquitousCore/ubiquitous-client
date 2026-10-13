/** A list row's words in its own fields, placed against the whole screen, since boxes are fractions of it. */

import type { JSX } from 'preact';

import { isNamed } from './piecePlan';
import type { PiecePart } from './piecePlan';
import type { ListingSpec } from './uiSpec';
import type { Worn } from './useWorn';
import { iconUrl } from '../iconUrl';

export interface WornRowProps {
  worn: Worn;
  /** Everything inside the row: its fields and its own picture slot. */
  fields: readonly PiecePart[];
  list: ListingSpec;
  /** What each field reads, by the name the spec gives the field. */
  values: Record<string, string>;
  /** The row's own picture, where the list keeps a slot for one. */
  icon?: ImageBitmap | null;
  /** What a field's words are drawn in, where the field names no colour. */
  tone?: string;
  /**
   * A styling for one field's words.
   *
   * A thing's name is written in the colour of what it is, which is not
   * something a field can carry: it changes with the thing.
   */
  styleOf?(field: string): string | undefined;
}

export function WornRow({
  worn,
  fields,
  list,
  values,
  icon,
  tone,
  styleOf,
}: WornRowProps): JSX.Element {
  const slot = list.icon
    ? fields.find(part => part.draws && isNamed(part, list.icon ?? ''))
    : undefined;
  return (
    <>
      {slot && icon ? (
        <img
          src={iconUrl(icon)}
          alt=""
          aria-hidden="true"
          style={{ ...worn.box(slot), objectFit: 'contain', pointerEvents: 'none' }}
          draggable={false}
        />
      ) : null}
      {Object.entries(list.fields).map(([what, suffix]) => {
        const field = worn.fieldOf(fields.find(part => isNamed(part, suffix)));
        if (!field || !values[what]) return null;
        const styling = styleOf?.(what);
        return (
          <span
            key={suffix}
            className={styling}
            style={
              styling ? { ...worn.words(field, tone), color: undefined } : worn.words(field, tone)
            }
          >
            {/* Words too long for their column are cut with a mark saying
                so, the way the screen cuts them, rather than ending
                mid-word as though the rest were missing. */}
            <span className="overflow-hidden text-ellipsis whitespace-nowrap">{values[what]}</span>
          </span>
        );
      })}
    </>
  );
}
