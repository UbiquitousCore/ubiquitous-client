/**
 * The talent window: a sideways tree under a window (`ArtTalentTree`), a tab
 * per tree, points left less staged. No reset: talents reset with an item.
 */

import type { JSX } from 'preact';
import { useRef, useState } from 'preact/hooks';

import type { ScreenSpec } from '../art/uiSpec';
import { LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEmblem } from '../art/WornEmblem';
import { uiWords } from '../art/pieceStore';
import { fill } from '../art/wornWords';
import { classTrees } from '../../gameplay/SpellBook';
import { pointsToSpend } from '../../gameplay/talents';
import { heroClass } from '../hudStore';
import { ArtTalentTree } from './ArtTalentTree';
import { ArtTalentCard } from './ArtTalentCard';
import type { WhereOnPage } from './ArtTalentCard';
import type { TalentRow } from '../../assets/types';

/** Our name for this screen. The spec says which piece of the movie wears it. */
export const TALENTS_SCREEN = 'talents';

/** How far a hand travels before it is dragging rather than reading, in pixels. */
const GRIP = 4;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtTalentsWindowProps {
  onClose(): void;
}

export function ArtTalentsWindow(props: ArtTalentsWindowProps): JSX.Element | null {
  const spec = useWornScreen(TALENTS_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({ onClose, spec }: ArtTalentsWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  /** Which of the class's trees is being looked at. */
  const [at, setAt] = useState(0);
  /** How far along the tree has been slid, in the movie's own units. */
  const [along, setAlong] = useState(0);
  /** The window itself, for turning a hand's travel into those units. */
  const held = useRef<HTMLDivElement>(null);
  /** The place being read, and where it is on the page. */
  const [reading, setReading] = useState<{ place: TalentRow; at: WhereOnPage } | null>(null);
  const [wide, setWide] = useState(0);
  const dragging = useRef<{ from: number; at: number } | null>(null);

  const tabs = spec.tabs ?? [];
  const trees = classTrees.value.get(heroClass.value) ?? [];

  const worn = useWorn(spec.dialog, spec.frame, {
    hidden: [
      ...(spec.hidden ?? []),
      // The tree is drawn on its own so it can slide under the window;
      // left in the page as well it shows through either side of it.
      ...(spec.panels?.tree ? [spec.panels.tree] : []),
    ],
    // The tab whose tree is showing wears its lit face.
    frames: Object.fromEntries(
      tabs.map((tab, index) => [tab.control, index === at ? (spec.faces?.[tab.control] ?? 1) : 0]),
    ),
  });

  if (!worn.image || !worn.frame) return null;

  const window_ = worn.find(spec.panels?.window);
  const over = Math.max(0, wide - (window_?.box.w ?? 0));
  /** What a pixel of travel comes to in the movie's own units. */
  const perPixel = (): number => {
    const box = held.current?.getBoundingClientRect();
    return box && box.width > 0 ? (window_?.box.w ?? 0) / box.width : 0;
  };
  /** Where the tree itself sits on the page. */
  const treeAt = worn.find(spec.panels?.tree);
  const slid = Math.min(over, Math.max(0, along));
  const shut = worn.find(spec.close);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Talents"
      className="motion-safe:animate-[scale-in_var(--opening,200ms)_ease-out]"
      style={worn.placed}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-auto"
        draggable={false}
      />

      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

      {/* The tree itself, sliding under the window cut in the page. */}
      {window_ && spec.panels?.tree ? (
        <div
          ref={held}
          className="overflow-hidden"
          style={{ ...worn.box(window_), pointerEvents: 'auto' }}
          onWheel={(event: WheelEvent) => {
            event.stopPropagation();
            // A wheel with no sideways travel of its own still slides it:
            // the page runs across, and that is the way it has to go.
            setAlong(now => Math.min(over, Math.max(0, now + (event.deltaX || event.deltaY))));
          }}
          onPointerDown={(event: PointerEvent) => {
            // Taken hold of, but not captured: a page that captures the
            // pointer where it went down swallows the press, and every
            // place on the tree stopped answering to a click.
            dragging.current = { from: event.clientX, at: slid };
          }}
          onPointerMove={(event: PointerEvent) => {
            const grab = dragging.current;
            if (!grab) return;
            const went = event.clientX - grab.from;
            // A hand that has not moved is reading, not dragging.
            if (Math.abs(went) < GRIP) return;
            (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            setAlong(Math.min(over, Math.max(0, grab.at - went * perPixel())));
          }}
          onPointerUp={() => {
            dragging.current = null;
          }}
          onPointerCancel={() => {
            dragging.current = null;
          }}
        >
          <ArtTalentTree
            dialog={spec.dialog}
            part={spec.panels.tree}
            tree={trees[at]}
            // Across, where the movie puts it rather than at the corner
            // of the window it shows through: those are a few units
            // apart, and starting it at the corner slid every place
            // left of where it belongs.
            at={{ x: slid - ((treeAt?.box.x ?? 0) - (window_?.box.x ?? 0)), y: 0 }}
            room={window_.box}
            onSize={setWide}
            onPick={(place, at) => setReading({ place, at })}
          />
        </div>
      ) : null}

      {/* One tab a tree, as far as the page has tabs for them: each
          wearing the tree's own name and the picture of the first place
          on it, which is the only picture the tables give a tree. */}
      {tabs.map((tab, index) => {
        const part = worn.find(tab.control);
        const tree = trees[index];
        if (!part || tree === undefined) return null;
        const inside = worn.find(`${tab.control}/displayCallback`);
        const inset = inside ? inside.box.x - part.box.x : 0;
        const named = worn.fieldOf(worn.find(`${tab.control}/text`));
        // Above the plaque its name is written on, not over it: what is
        // left of the tab once the plaque has its share.
        const room = named ? named.box.y - (inside?.box.y ?? part.box.y) : part.box.h;
        // A tree's name is the word that far along from the tree's own
        // number, which is how the user's interface strings are laid out.
        // A build that carries no words for its trees names none.
        const from = spec.rows?.treeWords;
        const says = from === undefined ? '' : (uiWords.value[tree + from] ?? '');
        // The class's own mark for this tree, a picture outside the movie
        // that the spec names by file.
        const mark = spec.pictures?.[String(heroClass.value)]?.[index];
        return (
          <div key={tab.control}>
            {inside && mark ? (
              <WornEmblem
                worn={worn}
                at={inside}
                icon={mark}
                size={Math.max(1, Math.min(part.box.w - inset * 2, room))}
                round
              />
            ) : null}
            {named ? <span style={worn.words(named, LIGHT)}>{says}</span> : null}
            <button
              type="button"
              aria-label={says || `Tree ${index + 1}`}
              aria-pressed={index === at}
              onClick={() => {
                setAt(index);
                setAlong(0);
              }}
              style={worn.box(part)}
              className={HIT}
            />
          </div>
        );
      })}

      {/* How many points there are to spend, as the server last said
          less what is staged: a nought until it has. */}
      {(() => {
        const field = worn.fieldOf(worn.find(spec.values?.points));
        const says = spec.formats?.points;
        return field && says ? (
          <span style={worn.words(field, LIGHT)}>{fill(says, pointsToSpend())}</span>
        ) : null;
      })()}

      {reading ? (
        <ArtTalentCard place={reading.place} beside={reading.at} onClose={() => setReading(null)} />
      ) : null}

      {shut ? (
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={worn.box(shut)}
          className={HIT}
        />
      ) : null}
    </div>
  );
}
