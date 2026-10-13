/** One slot of a run with its contents: picture (name until it loads) and stack count; presses are the screen's. */

import type { JSX } from 'preact';

import type { PiecePart } from './piecePlan';
import type { Worn } from './useWorn';
import { iconUrl } from '../iconUrl';

export interface WornSlotProps extends Omit<JSX.HTMLAttributes<HTMLDivElement>, 'slot'> {
  worn: Worn;
  /** Where the slot sits, which is the only thing the movie says about it. */
  slot: PiecePart;
  /** The shape the picture fills (not the plinth), so things in a run do not touch. */
  face?: PiecePart;
  /** Where the stack count goes; without it, the corner. */
  countAt?: PiecePart;
  icon?: ImageBitmap | null;
  /** What is in the slot, or nothing where the slot is empty. */
  name?: string;
  count?: number;
  /** The drag source dims and the target under the pointer shows it will take the drop. */
  lifted?: boolean;
  over?: boolean;
}

export function WornSlot({
  worn,
  slot,
  face,
  countAt,
  icon,
  name,
  count,
  lifted,
  over,
  style,
  class: _unused,
  className,
  ...rest
}: WornSlotProps): JSX.Element {
  // The picture's room, as a fraction of the slot it is inside: a box
  // given as a fraction of the screen cannot be used within something
  // already placed that way.
  const within: JSX.CSSProperties =
    face && slot.box.w > 0 && slot.box.h > 0
      ? {
          position: 'absolute',
          left: `${((face.box.x - slot.box.x) / slot.box.w) * 100}%`,
          top: `${((face.box.y - slot.box.y) / slot.box.h) * 100}%`,
          width: `${(face.box.w / slot.box.w) * 100}%`,
          height: `${(face.box.h / slot.box.h) * 100}%`,
        }
      : { position: 'absolute', inset: 0 };
  // A slot that does nothing of its own takes no presses either: it is
  // drawn over whatever control the screen put under it, and a slot that
  // swallowed the press left a thing that could not be looked at.
  const inert = !rest.onPointerDown && !rest.onClick && !rest.onPointerUp;
  return (
    <div
      {...rest}
      title={name}
      style={{
        ...worn.box(slot),
        ...(inert ? { pointerEvents: 'none' as const } : {}),
        ...(typeof style === 'object' ? style : {}),
      }}
      className={`relative${className ? ` ${className}` : ''}${over ? 'shadow-selected' : ''}`}
    >
      <span className="flex items-center justify-center" style={within}>
        {icon ? (
          <img
            src={iconUrl(icon)}
            alt={name ?? ''}
            className="max-h-full max-w-full object-contain"
            draggable={false}
          />
        ) : name ? (
          // The picture arrives separately, and a slot holding something
          // should say so before it does.
          <span
            className="truncate px-[4%] text-parchment-100"
            style={{ fontSize: `${(8 * worn.scale).toFixed(1)}px` }}
          >
            {name}
          </span>
        ) : null}
      </span>
      {count !== undefined && count > 1 && (
        <span
          className="pointer-events-none absolute text-parchment-100 text-shadow-world"
          style={{
            ...(countAt && slot.box.w > 0 && slot.box.h > 0
              ? {
                  left: `${((countAt.box.x - slot.box.x) / slot.box.w) * 100}%`,
                  top: `${((countAt.box.y - slot.box.y) / slot.box.h) * 100}%`,
                }
              : { right: 0, bottom: 0 }),
            fontSize: `${(9 * worn.scale).toFixed(1)}px`,
            lineHeight: 1,
          }}
        >
          {count}
        </span>
      )}
    </div>
  );
}
