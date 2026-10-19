/**
 * The quest log on the shipped screen: rows with hand-in marks and the
 * guide box; a pressed row opens in place as the rows below make way.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { QuestItem, QuestRecord } from '../../net/GameConnection';
import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornChevrons } from '../art/WornChevrons';
import { WornPiece } from '../art/WornPiece';
import { WornRow } from '../art/WornRow';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import { unavailableFaces } from '../art/wornState';
import { fill } from '../art/wornWords';
import { iconUrl } from '../iconUrl';
import { itemIcons, itemNames } from '../inventoryStore';
import { coinsOf } from '../money';
import { player } from '../hudStore';
import { DIFFICULTY_TEXT, questDifficulty } from '../questDifficulty';
import { ArtItemCard, HELD_CARD, cardFor } from './ArtItemCard';
import {
  QUEST_LOG_CAPACITY,
  objectiveLines,
  questAction,
  questActions,
  questLog,
  questName,
  questString,
  setTracked,
} from '../questStore';

/** Our name for this screen. The spec says which dialog wears it. */
export const QUEST_LOG_SCREEN = 'quests';

/** The log stands in a row beside the bar, not at a place on a stage. */
const ROW = { unplaced: true } as const;

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export interface ArtQuestLogWindowProps {
  onClose(): void;
}

export function ArtQuestLogWindow(props: ArtQuestLogWindowProps): JSX.Element | null {
  const spec = useWornScreen(QUEST_LOG_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

/** Two things under one key, without a wrapper the layout would see. */
function Fragmentish({ children }: { children: (JSX.Element | null)[] }): JSX.Element {
  return <>{children}</>;
}

/** What a quest says about itself, which depends on where it has got to. */
function told(record: QuestRecord): string {
  const handingIn = record.status === 'finished';
  return [
    handingIn ? questString(record.completionStringId) : questString(record.detailsStringId),
    questString(record.incompleteStringId),
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n\n');
}

function Worn({
  onClose,
  spec,
}: ArtQuestLogWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  const [open, setOpen] = useState<number | null>(null);
  /** The reward whose card is open, and where the press that opened it was. */
  const [reading, setReading] = useState<{ item: QuestItem; at: { x: number; y: number } } | null>(
    null,
  );
  const list = spec.lists?.log;
  const quests = questLog.value;
  const picked = quests.find(quest => quest.id === open) ?? null;

  /** What a row reads: the quest's own name, and nothing else. */
  const columnsOf = (quest: QuestRecord): Record<string, string> => ({ name: questName(quest) });

  /** Whether the quest is finished as far as the giver is concerned. */
  const ready = (quest: QuestRecord): boolean => questAction(quest) === 'handIn';

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: quests, scroll: scroll.at, values: columnsOf });

  const faces = unavailableFaces(spec, { share: picked !== null, drop: picked !== null });

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    whole => {
      const slice = sliceOf(whole);
      /** How far down the shown rows the open quest is, if one is open. */
      const at = slice.shown.findIndex(quest => quest.id === open);
      return {
        withoutArt: [
          ...slice.marks,
          // The pane the screen keeps a quest's own words in: it is parked
          // off to one side, and what is wanted from it is the lettering
          // its fields were given, not where the movie puts them.
          ...(spec.panels?.detail ? [spec.panels.detail] : []),
        ],
        shown: [...(spec.shown ?? []), ...faces.shown],
        // The box on a row is filled in for the quest the guide points at.
        frames: Object.fromEntries(
          slice.keptRows.flatMap((path, index) => {
            const quest = slice.shown[index];
            const where = list?.does?.track;
            return quest && where
              ? [[`${path}/${where}`, quest.tracked === true ? (spec.faces?.[where] ?? 1) : 0]]
              : [];
          }),
        ),
        hidden: [
          ...(spec.hidden ?? []),
          ...faces.hidden,
          ...slice.hidden,
          // A row carries two backings: the plate it stands on, and the
          // one the screen lights under a quest whose objectives are
          // met. The plate stays under every row; the lit one belongs to
          // the quests that are ready to be handed back.
          ...slice.keptRows.flatMap((path, index) => {
            const quest = slice.shown[index];
            return spec.groups?.chosen && quest && !ready(quest)
              ? [`${path}/${spec.groups.chosen}`]
              : [];
          }),
          // Each row carries both marks — the one for a quest that can be
          // handed in and the one for a quest still under way — and the
          // build shows whichever the quest has earned.
          ...slice.keptRows.flatMap((path, index) => {
            const quest = slice.shown[index];
            if (!quest) return [];
            const gone = ready(quest) ? spec.groups?.under : spec.groups?.ready;
            return gone ? [`${path}/${gone}`] : [];
          }),
          // A quest opened where it stands: the rows under it make way.
          ...(at >= 0 ? slice.keptRows.slice(at + 1) : []),
        ],
      };
    },
    ROW,
  );
  const slice = sliceOf(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  if (!worn.image || !worn.frame) return null;

  const count = worn.fieldOf(worn.find(spec.values?.count));
  const title = worn.fieldOf(worn.find(spec.values?.title));
  const actions = questActions();
  const openAt = rows.findIndex(({ item }) => item.id === open);
  // Where the list shows through. A build without the part the spec
  // names for it still has the scroll area the list stands in — a hit
  // area, never drawn, so looked for among every part rather than the
  // drawn ones.
  const window_ =
    worn.find(spec.panels?.window) ?? worn.whole.find(part => part.path === spec.panels?.area);

  /** A field's own lettering, for words this screen lays out itself. */
  const lettering = (where: string | undefined): JSX.CSSProperties => {
    const field = worn.fieldOf(worn.find(where));
    if (!field) return {};
    const size = Math.min(field.text?.sizePx ?? 12, field.box.h || Infinity);
    return {
      fontSize: `${(size * worn.scale).toFixed(1)}px`,
      color: field.text?.color ?? INK,
      lineHeight: 1.2,
    };
  };

  /** How big the screen draws a thing a quest pays with, in drawn pixels. */
  const plinth = (spec.grids?.rewards?.size?.w ?? 34) * worn.scale;

  /**
   * One thing the quest pays with, at the size the screen draws it.
   *
   * Pressing it says what it is, on the card a thing you have opens — the
   * same card the giver's window opens for the same reward.
   */
  const paid = (item: QuestItem, at: number): JSX.Element => {
    const icon = itemIcons.value.get(item.entry) ?? null;
    const named = itemNames.value.get(item.entry);
    return (
      <button
        key={`${item.entry}.${at}`}
        type="button"
        aria-label={named ?? `Reward ${at + 1}`}
        data-reward={item.entry}
        onClick={(event: MouseEvent) => {
          const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
          setReading({ item, at: { x: on.right, y: on.top } });
        }}
        className="relative inline-block shrink-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-brass-300"
        style={{ width: `${plinth}px`, height: `${plinth}px` }}
      >
        {icon ? (
          <img src={iconUrl(icon)} alt="" className="size-full object-contain" draggable={false} />
        ) : null}
      </button>
    );
  };

  /** A reward heading with the movie's rule drawn under it on its own. */
  const heading = (group: string | undefined): JSX.Element | null => {
    if (!group) return null;
    // A section's words are written on a field of its own inside it, or,
    // where the section is only a line, on the section itself.
    const where = spec.captions?.[`${group}/title`] ? `${group}/title` : group;
    return (
      <span className="flex flex-col">
        <span style={lettering(where)}>{spec.captions?.[where] ?? ''}</span>
        <WornPiece dialog={spec.dialog} part={`${group}/line`} box={{ width: '100%' }} />
      </span>
    );
  };

  /** One section of what a quest pays: its heading, and what is in it. */
  const section = (group: string | undefined, items: readonly QuestItem[]): JSX.Element | null =>
    group && items.length ? (
      <Fragmentish key={group}>
        {heading(group)}
        <div className="flex gap-[2%]">{items.map(paid)}</div>
      </Fragmentish>
    ) : null;

  const coins = coinsOf(picked?.rewardMoney ?? 0);
  const objectives = picked ? objectiveLines(picked) : [];
  const said = picked ? told(picked) : '';
  const rewards = picked?.rewards ?? [];
  /** The room the rows below the open one have made for what it says. */
  const under =
    picked && openAt >= 0 && window_ && worn.frame
      ? (() => {
          const row = rows[openAt]!.row;
          const top = row.box.y + row.box.h;
          const bottom = window_.box.y + window_.box.h;
          const frame = worn.frame!;
          return {
            position: 'absolute' as const,
            left: `${(row.box.x / frame.w) * 100}%`,
            width: `${(row.box.w / frame.w) * 100}%`,
            top: `${(top / frame.h) * 100}%`,
            height: `${(Math.max(0, bottom - top) / frame.h) * 100}%`,
          };
        })()
      : null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Quests"
      className="touch-none overflow-hidden"
      style={worn.placed}
      {...listGestures(worn, list, slice, scroll)}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className="relative block h-full w-auto"
        draggable={false}
      />

      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        hidden={[spec.panels?.detail ?? '']}
        // A control with nothing to do wears its dim face, and its words
        // go dim with it rather than staying bright on a dead plate.
        styleOf={where =>
          picked === null && where.startsWith('panelButton') ? { opacity: 0.55 } : undefined
        }
      />

      {/* How many of the log's places are taken, on the title's own line. */}
      {count && spec.formats?.count ? (
        <span
          style={{
            ...worn.words(count, LIGHT),
            ...(title ? { top: worn.box(title).top, height: worn.box(title).height } : {}),
          }}
        >
          {fill(spec.formats.count, quests.length, QUEST_LOG_CAPACITY)}
        </span>
      ) : null}

      {rows.map(({ row, item }) => (
        <button
          key={row.path}
          type="button"
          aria-expanded={item.id === open}
          aria-label={questName(item)}
          onClick={() => {
            setReading(null);
            setOpen(now => (now === item.id ? null : item.id));
          }}
          style={worn.box(row)}
          className={HIT}
        />
      ))}

      {/* The box on each row for the quest the guide points at. */}
      {list?.does?.track
        ? rows.map(({ row, item }) => {
            const part = worn.find(`${row.path}/${list.does?.track}`);
            return part ? (
              <button
                key={`${row.path}.track`}
                type="button"
                role="checkbox"
                aria-checked={item.tracked === true}
                aria-label={`Follow ${questName(item)}`}
                onClick={(event: MouseEvent) => {
                  event.stopPropagation();
                  setTracked(item.id, item.tracked !== true);
                }}
                style={worn.box(part)}
                className={HIT}
              />
            ) : null;
          })
        : null}

      {list &&
        rows.map(({ row, fields, item }) => (
          <WornRow
            key={`${row.path}.words`}
            worn={worn}
            fields={fields}
            list={list}
            values={columnsOf(item)}
            tone={INK}
            // How far above or below the character a quest is, which is
            // what its name is written in.
            styleOf={() =>
              DIFFICULTY_TEXT[
                questDifficulty(item.minLevel ?? player.value?.level ?? 0, player.value?.level ?? 0)
              ]
            }
          />
        ))}

      {/* What the open quest says, in the room the rows below it left. */}
      {under && picked ? (
        <div
          className="flex flex-col gap-[3%] overflow-y-auto px-[4%] py-[2%] motion-safe:animate-unfurl"
          style={{ ...under, transformOrigin: 'top', pointerEvents: 'auto' }}
          onWheel={(event: WheelEvent) => event.stopPropagation()}
        >
          {objectives.map(objective => (
            <span key={objective.text} style={lettering(spec.values?.objective)}>
              {objective.text}
            </span>
          ))}
          {said ? (
            <span className="whitespace-pre-wrap" style={lettering(spec.values?.body)}>
              {said}
            </span>
          ) : null}
          {section(spec.groups?.choices, picked.rewardChoices ?? [])}
          {section(spec.groups?.required, [])}
          {section(spec.groups?.rewards, rewards)}
          {picked.rewardMoney ? (
            <Fragmentish key="money">
              {heading(spec.groups?.moneyTitle)}
              <div className="flex items-center gap-[2%]">
                {(['gold', 'silver', 'copper'] as const).map(coin => {
                  const said = coins[coin];
                  const where = spec.coins?.[coin];
                  return said && where ? (
                    <span key={coin} className="flex items-center gap-[2px]">
                      <span style={lettering(spec.values?.gold)}>{said}</span>
                      <WornPiece
                        dialog={spec.dialog}
                        part={where}
                        // The three coins sit one on another, so drawing
                        // one means leaving the other two out.
                        // Everything else that stands where this coin
                        // does, and would be cropped in with it: the
                        // other coins, the figures beside them, and
                        // whatever else the screen parks there.
                        without={[
                          ...Object.values(spec.coins ?? {}).filter(one => one !== where),
                          spec.values?.gold ?? '',
                          ...(spec.hidden ?? []),
                        ].filter(Boolean)}
                      />
                    </span>
                  ) : null;
                })}
              </div>
            </Fragmentish>
          ) : null}
        </div>
      ) : null}

      <WornChevrons
        worn={worn}
        list={list}
        slice={slice}
        labels={{ up: 'Earlier quests', down: 'Later quests' }}
        onStep={way => scroll.step(way === 'up' ? -1 : 1, slice.furthest)}
      />

      {/* What the log offers to do with the quest that is open. */}
      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        if (!part) return null;
        return (
          <button
            key={where}
            type="button"
            aria-label={what}
            disabled={picked === null}
            onClick={() => {
              if (!picked) return;
              if (what === 'share') actions.share(picked);
              else {
                actions.drop(picked);
                setOpen(null);
              }
            }}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the quest log"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}

      {/* Inside the log, so it stands in front of it wherever the log is. */}
      {reading && picked ? (
        <ArtItemCard
          listing={cardFor({
            id: `quest.${picked.id}.${reading.item.entry}`,
            entry: reading.item.entry,
            count: reading.item.count,
          })}
          wears={HELD_CARD}
          actions={[]}
          anchor={reading.at}
          onClose={() => setReading(null)}
        />
      ) : null}
    </div>
  );
}
