/** A giver's offers with take or hand-in marks; pressing one asks for the quest screen. */

import type { JSX } from 'preact';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornEmblem } from '../art/WornEmblem';
import { WornRow } from '../art/WornRow';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';

/** One row of the list: what it says, and whether it is ready to be closed. */
export interface ChoiceRow {
  id: number;
  name: string;
  /** True where the giver is waiting to be handed something back. */
  ready?: boolean;
}

/** Our name for this screen. The spec says which dialog wears it. */
export const QUEST_ASK_SCREEN = 'questAsk';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtQuestAskWindowProps {
  /** Who is being asked, in their own name. */
  giver: string;
  choices: readonly ChoiceRow[];
  onPick(id: number): void;
  onClose(): void;
}

export function ArtQuestAskWindow(props: ArtQuestAskWindowProps): JSX.Element | null {
  const spec = useWornScreen(QUEST_ASK_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

function Worn({
  giver,
  choices,
  onPick,
  onClose,
  spec,
}: ArtQuestAskWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  const list = spec.lists?.choices;

  const columnsOf = (choice: ChoiceRow): Record<string, string> => ({ name: choice.name });
  const ready = (choice: ChoiceRow): boolean => choice.ready === true;

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: choices, scroll: scroll.at, values: columnsOf });

  const worn = useWorn(spec.dialog, spec.frame, whole => ({
    shown: spec.shown ?? [],
    hidden: [...(spec.hidden ?? []), ...sliceOf(whole).hidden],
  }));
  const slice = sliceOf(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  if (!worn.image || !worn.frame) return null;

  const named = worn.fieldOf(worn.find(spec.values?.title));

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={giver || 'Quests'}
      className="touch-none overflow-hidden"
      style={worn.placed}
      {...listGestures(worn, list, slice, scroll)}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="block h-full w-full"
        draggable={false}
      />

      {named ? <span style={worn.words(named, LIGHT)}>{giver}</span> : null}

      {rows.map(({ row, item }) => (
        <button
          key={row.path}
          type="button"
          aria-label={item.name}
          onClick={() => onPick(item.id)}
          style={worn.box(row)}
          className={HIT}
        />
      ))}

      {/* The mark beside each: one for a quest on offer, another for one
          the giver is waiting to be handed back. A picture from its own
          file rather than art the movie carries. */}
      {rows.map(({ row, item }) => {
        const emblem = spec.emblems?.[ready(item) ? 'ready' : 'under'];
        return emblem ? (
          <WornEmblem
            key={`${row.path}.emblem`}
            worn={worn}
            at={worn.find(`${row.path}/${emblem.at}`)}
            icon={emblem.icon}
            size={emblem.size}
          />
        ) : null;
      })}

      {list &&
        rows.map(({ row, fields, item }) => (
          <WornRow
            key={`${row.path}.words`}
            worn={worn}
            fields={fields}
            list={list}
            values={columnsOf(item)}
            tone={INK}
            styleOf={() => (ready(item) ? 'font-semibold' : undefined)}
          />
        ))}

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
