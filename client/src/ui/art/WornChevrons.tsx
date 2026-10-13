/** The run-on marks drawn on their own so they slide the way they point. */

import type { JSX } from 'preact';

import type { ListSlice } from './wornList';
import type { ListingSpec } from './uiSpec';
import { useWorn } from './useWorn';
import type { Worn } from './useWorn';

export interface WornChevronsProps {
  worn: Worn;
  list?: ListingSpec;
  slice: ListSlice<unknown>;
  /** Pressing one, where the screen's marks are controls as well. */
  onStep?(way: 'up' | 'down'): void;
  /** What each is called, in the screen's own terms. */
  labels?: { up: string; down: string };
}

/** One mark, as its own picture, standing where the screen draws it. */
function Mark({
  worn,
  name,
  way,
  label,
  onPick,
}: {
  worn: Worn;
  name: string;
  way: 'up' | 'down';
  label: string;
  onPick?: () => void;
}): JSX.Element | null {
  // Its own plan and its own picture: the screen's own picture leaves it
  // out, and a piece cut back out of that picture would come out empty.
  const mark = useWorn(name, name, {}, { floats: true });
  const place = worn.find(name);
  if (!place || !mark.image) return null;
  const moving = way === 'up' ? 'motion-safe:animate-nudge-up' : 'motion-safe:animate-nudge-down';
  return (
    <div style={{ ...worn.box(place), overflow: 'hidden' }}>
      <img
        src={mark.image.url}
        alt=""
        aria-hidden="true"
        data-list-mark={way}
        className={`block h-full w-full scale-(--scale-list-mark) object-contain ${moving}`}
        draggable={false}
      />
      {onPick ? (
        <button
          type="button"
          aria-label={label}
          onClick={onPick}
          className="absolute inset-0 cursor-pointer border-0 bg-transparent p-0"
        />
      ) : null}
    </div>
  );
}

export function WornChevrons({
  worn,
  list,
  slice,
  onStep,
  labels,
}: WornChevronsProps): JSX.Element | null {
  if (!list) return null;
  const runs = { up: slice.from > 0, down: slice.from < slice.furthest };
  return (
    <>
      {(['up', 'down'] as const).map(way => {
        const named = way === 'up' ? list.more?.above : list.more?.below;
        const pressed = way === 'up' ? list.scroll?.up : list.scroll?.down;
        const label = labels ? labels[way] : way === 'up' ? 'Earlier' : 'Later';
        return (
          <span key={`mark.${way}`}>
            {named && runs[way] ? (
              <Mark
                worn={worn}
                name={named}
                way={way}
                label={label}
                onPick={onStep ? () => onStep(way) : undefined}
              />
            ) : null}
            {pressed && runs[way] ? (
              <Mark
                worn={worn}
                name={pressed}
                way={way}
                label={label}
                onPick={onStep ? () => onStep(way) : undefined}
              />
            ) : null}
          </span>
        );
      })}
    </>
  );
}
