/**
 * A quest on the shipped screen, for giver and log: title, text, rewards and
 * one action. The middle is stacked as the build does, each piece in its
 * field's lettering. Somebody with something to say and no quest to give
 * speaks from the same page, minus the quest.
 */

import type { ComponentChildren, JSX } from 'preact';
import { useState } from 'preact/hooks';

import type { QuestItem, QuestRecord } from '../../net/GameConnection';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornPiece } from '../art/WornPiece';
import { unavailableFaces } from '../art/wornState';
import { iconUrl } from '../iconUrl';
import { itemIcons, itemNames } from '../inventoryStore';
import { formatMoney, namedCoins } from '../money';
import { objectiveLines, questName, questString } from '../questStore';
import { ArtItemCard, HELD_CARD, cardFor } from './ArtItemCard';

/** Our name for this screen. The spec says which dialog wears it. */
export const QUEST_SCREEN = 'questTalk';

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

/**
 * How far in from each side of the middle its words and rewards start, in
 * the movie's units. Own choice: laid against the edge of the window they
 * run hard up to the parchment's torn border.
 */
const SIDE_ROOM = 12;

/** One thing this screen offers to do about the quest it is showing. */
export interface QuestOffer {
  /** Our own name for it, which the spec maps to a word in the user's interface strings. */
  key: string;
  /** Called with the reward the player picked, where the quest offers a choice of them. */
  onPick(choice: number): void;
}

/** Somebody speaking with no quest to give: who, what they say, and what can be said back. */
export interface Speech {
  speaker: string;
  words: ComponentChildren;
  replies: ReadonlyArray<{ label: string; onPick(): void }>;
}

export type ArtQuestWindowProps = {
  /** Actions in control order: take, hand back, share or drop; none draws only the way out. */
  offers?: readonly QuestOffer[];
  /** Where on screen it was asked for, for one opened beside a row. */
  beside?: { x: number; y: number } | null;
  onClose(): void;
} & ({ quest: QuestRecord; speech?: undefined } | { speech: Speech; quest?: undefined });

export function ArtQuestWindow(props: ArtQuestWindowProps): JSX.Element | null {
  const spec = useWornScreen(QUEST_SCREEN);
  return spec ? <Worn {...props} spec={spec} /> : null;
}

/** Completion words when handing back, else the given words, so the window is never empty. */
function told(record: QuestRecord): string {
  const handingIn = record.status === 'finished';
  return [
    (handingIn ? questString(record.completionStringId) : undefined) ??
      questString(record.detailsStringId),
    questString(record.incompleteStringId),
  ]
    .filter((line): line is string => typeof line === 'string' && line.length > 0)
    .join('\n\n');
}

function Worn({
  quest,
  speech,
  offers = [],
  beside,
  onClose,
  spec,
}: ArtQuestWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const rewards = quest?.rewards ?? [];
  const choices = quest?.rewardChoices ?? [];
  const heading = speech ? speech.speaker : questName(quest!);
  /** Which of the rewards to choose from is picked; the first until another is pressed. */
  const [choice, setChoice] = useState(0);
  /** The reward whose card is open, and where the press that opened it was. */
  const [reading, setReading] = useState<{ item: QuestItem; at: { x: number; y: number } } | null>(
    null,
  );
  /** Open a reward's card beside the reward pressed. */
  const read = (item: QuestItem, event: MouseEvent): void => {
    const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setReading({ item, at: { x: on.right, y: on.top } });
  };
  /**
   * The three foot controls: one action stands alone in the middle (the cross
   * the only way out); none puts the way out there; two take the first two.
   */
  const shown = offers.slice(0, 2);
  const drawn = new Map<string, QuestOffer | 'close'>(
    shown.length === 0
      ? [['second', 'close']]
      : shown.length === 1
        ? [['second', shown[0]!]]
        : [
            ['first', shown[0]!],
            ['second', shown[1]!],
            ['close', 'close'],
          ],
  );
  const slots = ['first', 'second', 'close'];
  const faces = unavailableFaces(
    spec,
    Object.fromEntries(slots.map(slot => [slot, drawn.has(slot)])),
  );
  /** The controls nothing is drawn for, which are not there at all. */
  const bare = Object.entries(spec.actions ?? {})
    .filter(([, what]) => slots.includes(what) && !drawn.has(what))
    .flatMap(([where, what]) => [where, spec.values?.[what] ?? '']);

  const worn = useWorn(
    spec.dialog,
    spec.frame,
    {
      shown: [...(spec.shown ?? []), ...faces.shown],
      hidden: [
        ...(spec.hidden ?? []),
        ...faces.hidden,
        // The middle of the screen is laid out here rather than drawn
        // where the movie parks it: every section sits at the same place
        // in the movie, so drawn as shipped they are one on top of
        // another.
        ...Object.values(spec.groups ?? {}),
        // A control with nothing offered on it is not there at all, and
        // drawn as shipped it is a button with no word on it.
        ...bare,
      ],
    },
    { floats: beside ? true : undefined },
  );

  if (!worn.image || !worn.frame) return null;

  /** How big it comes out on screen, which is not how big it was drawn. */
  const shownWide = parseFloat(String(worn.sized.width ?? '0'));
  const shownTall = parseFloat(String(worn.sized.height ?? '0'));

  /** A part of the middle, which is left out of the picture and looked up in the whole screen. */
  const middle = (path: string | undefined) =>
    path
      ? worn.whole.find(part => part.path === path || part.path.endsWith(`/${path}`))
      : undefined;

  /**
   * A field's own lettering, for words this screen lays out itself: the
   * size, colour and face the field would draw its words in, without the
   * place it stands, since the middle is stacked here.
   */
  const lettering = (where: string | undefined): JSX.CSSProperties => {
    const field = worn.fieldOf(middle(where));
    if (!field) return {};
    const { fontSize, fontFamily, color } = worn.words(field, INK, true);
    return { fontSize, fontFamily, color, lineHeight: 1.2 };
  };

  const window_ = worn.find(spec.panels?.window);
  const title = worn.fieldOf(worn.find(spec.values?.title));
  const titleBar = worn.find(spec.values?.title?.split('/')[0]);
  const objectives = quest ? objectiveLines(quest) : [];
  const said = quest ? told(quest) : '';
  /** A length in movie units, as a share of the middle's width. */
  const across = (units: number): string => `${(units / (window_?.box.w || 1)) * 100}%`;

  /**
   * One thing the quest pays with, on the plinth the screen stands one on,
   * at the size it draws it. A reward to choose from lights when picked.
   */
  const paid =
    (group: string | undefined, picks: boolean) =>
    (item: QuestItem, at: number): JSX.Element => {
      const icon = itemIcons.value.get(item.entry) ?? null;
      const slot = group ? middle(`${group}/btnitem1`) : undefined;
      const w = slot?.box.w ?? 38;
      const h = slot?.box.h ?? 38;
      const picked = picks && at === choice;
      const inside = (
        <>
          {slot && group ? (
            <WornPiece
              dialog={spec.dialog}
              part={`${group}/btnitem1`}
              // The plinth alone; the picked one keeps the mark the screen
              // lights a chosen slot with.
              without={[
                ...[
                  'redmask',
                  'hot',
                  'rectcooldown',
                  'cntback',
                  'cnt',
                  ...(picked ? [] : ['bluemask']),
                ].map(state => `${group}/btnitem1/${state}`),
              ]}
              // Only the slot: the rest of the middle is drawn at the same
              // spot in the movie, and would come along with it.
              alone
              box={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
            />
          ) : null}
          {icon ? (
            <img
              src={iconUrl(icon)}
              alt={itemNames.value.get(item.entry) ?? ''}
              className="absolute object-contain"
              style={{ left: '10%', top: '6%', width: '80%', height: '80%' }}
              draggable={false}
            />
          ) : null}
          {item.count > 1 ? (
            <span
              className="absolute right-[8%] bottom-[8%]"
              style={{ ...lettering(spec.values?.gold), color: LIGHT }}
            >
              {item.count}
            </span>
          ) : null}
        </>
      );
      const box: JSX.CSSProperties = { width: across(w), aspectRatio: `${w} / ${h}` };
      const named = itemNames.value.get(item.entry) ?? undefined;
      // Pressing a reward says what it is, on the card a thing you have
      // opens; one of a choice is picked by the same press.
      return (
        <button
          key={`${item.entry}.${at}`}
          type="button"
          aria-label={named ?? `Reward ${at + 1}`}
          aria-pressed={picks ? picked : undefined}
          onClick={(event: MouseEvent) => {
            if (picks) setChoice(at);
            read(item, event);
          }}
          className="relative shrink-0 cursor-pointer border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-brass-300"
          style={box}
        >
          {inside}
        </button>
      );
    };

  /**
   * What the quest pays in money: each coin it names, as the screen's own
   * coin with its figure beside it, from the largest down.
   */
  const paidMoney = (): JSX.Element | null => {
    if (!quest?.rewardMoney) return null;
    const named = namedCoins(quest.rewardMoney);
    const figure = middle(spec.values?.gold);
    /** The coin's height, in the figure's own lettering. */
    const tall = (coin: string | undefined): string | undefined => {
      const art = coin ? middle(coin) : undefined;
      const size = figure?.text?.sizePx ?? figure?.box.h;
      return art && size ? `${art.box.h / size}em` : undefined;
    };
    return (
      <div
        className="flex items-center gap-[4%]"
        aria-label={formatMoney(quest.rewardMoney)}
        style={lettering(spec.values?.gold)}
      >
        {(['gold', 'silver', 'copper'] as const)
          .filter(coin => named[coin])
          .map(coin => {
            const art = spec.coins?.[coin];
            const height = tall(art);
            return (
              <span key={coin} data-coin={coin} className="flex items-center gap-[0.2em]">
                {art && height ? (
                  <WornPiece
                    dialog={spec.dialog}
                    part={art}
                    alone
                    box={{ height, width: 'auto' }}
                  />
                ) : null}
                {named[coin]}
              </span>
            );
          })}
      </div>
    );
  };

  /**
   * One section of the middle: what it is called, the rule the screen
   * draws under that, and what is in it.
   */
  const section = (
    group: string | undefined,
    caption: string | undefined,
    body: JSX.Element | null,
  ): JSX.Element | null => {
    if (!body) return null;
    const line = group ? middle(`${group}/line`) : undefined;
    return (
      <div className="flex flex-col gap-[1.5%]">
        {caption ? <span style={lettering(caption)}>{spec.captions?.[caption]}</span> : null}
        {line && group ? (
          <WornPiece
            dialog={spec.dialog}
            part={`${group}/line`}
            alone
            box={{ width: across(line.box.w), height: 'auto' }}
          />
        ) : null}
        {body}
      </div>
    );
  };

  const stood: JSX.CSSProperties = beside
    ? {
        position: 'fixed',
        left: `${Math.max(0, Math.min(beside.x, globalThis.innerWidth - shownWide))}px`,
        top: `${Math.max(0, Math.min(beside.y, globalThis.innerHeight - shownTall))}px`,
      }
    : worn.placed;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={heading}
      className={beside ? 'z-card pointer-events-auto fixed overflow-hidden' : 'overflow-hidden'}
      style={stood}
    >
      <img
        ref={worn.pictureRef}
        src={worn.image.url}
        alt=""
        aria-hidden="true"
        className={beside ? 'block h-auto w-auto' : 'block h-full w-full'}
        draggable={false}
      />

      {/* Across the band at the top. The title's field runs deeper than
          the band, and its one line centred in the field sits under it. */}
      {title ? (
        <span
          style={worn.words(
            titleBar
              ? { ...title, box: { ...title.box, y: titleBar.box.y, h: titleBar.box.h } }
              : title,
            LIGHT,
          )}
        >
          {heading}
        </span>
      ) : null}

      {/* The middle, stacked into the scrolling window — starting
          under the title, which the window's own box reaches up behind. */}
      {window_ ? (
        <div
          className="flex flex-col gap-[3%] overflow-y-auto"
          style={{
            ...worn.box(
              titleBar && titleBar.box.y + titleBar.box.h > window_.box.y
                ? {
                    ...window_,
                    box: {
                      ...window_.box,
                      y: titleBar.box.y + titleBar.box.h + 4,
                      h: window_.box.y + window_.box.h - (titleBar.box.y + titleBar.box.h + 4),
                    },
                  }
                : window_,
            ),
            paddingLeft: `${(SIDE_ROOM / worn.frame.w) * 100}%`,
            paddingRight: `${(SIDE_ROOM / worn.frame.w) * 100}%`,
            pointerEvents: 'auto',
          }}
          onWheel={(event: WheelEvent) => event.stopPropagation()}
        >
          {objectives.map(objective => (
            <span
              key={objective.text}
              style={{
                ...lettering(spec.values?.objective),
                ...(objective.tone === 'ready' ? { fontWeight: 600 } : {}),
              }}
            >
              {objective.text}
            </span>
          ))}
          {said ? (
            <span className="whitespace-pre-wrap" style={lettering(spec.values?.body)}>
              {said}
            </span>
          ) : null}
          {speech ? (
            <span className="whitespace-pre-wrap" style={lettering(spec.values?.body)}>
              {speech.words}
            </span>
          ) : null}
          {/* What can be said back, one line each, in the words' own
              lettering: the page has no list of its own for them. */}
          {speech?.replies.map(reply => (
            <button
              key={reply.label}
              type="button"
              onClick={reply.onPick}
              className="cursor-pointer border-0 bg-transparent p-0 text-left underline focus-visible:outline-2 focus-visible:outline-brass-300"
              style={lettering(spec.values?.body)}
            >
              {reply.label}
            </button>
          ))}
          {section(
            spec.groups?.rewards,
            spec.groups?.rewards && `${spec.groups.rewards}/title`,
            rewards.length ? (
              <div className="flex gap-[3%]">{rewards.map(paid(spec.groups?.rewards, false))}</div>
            ) : null,
          )}
          {section(
            spec.groups?.choices,
            spec.groups?.choices && `${spec.groups.choices}/title`,
            choices.length ? (
              <div className="flex gap-[3%]">{choices.map(paid(spec.groups?.choices, true))}</div>
            ) : null,
          )}
          {section(undefined, spec.groups?.moneyTitle, paidMoney())}
        </div>
      ) : null}

      {/* The one thing there is to do about it, and the way out. */}
      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        const held = drawn.get(what);
        if (!part || !held) return null;
        const offer = held === 'close' ? undefined : held;
        const label = worn.fieldOf(worn.find(spec.values?.[what]));
        // What a control reads is the user's interface word for what it is about
        // to do, which is not the same word for taking a quest on as for
        // handing it back or giving it up.
        const word = spec.words?.[offer ? offer.key : 'close'];
        return (
          <Fragmentish key={where}>
            <button
              type="button"
              aria-label={word || (offer ? offer.key : 'close')}
              onClick={offer ? () => offer.onPick(choice) : onClose}
              style={worn.box(part)}
              className={HIT}
            />
            {label && word ? <span style={worn.words(label, LIGHT)}>{word}</span> : null}
          </Fragmentish>
        );
      })}

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

      {/* Inside the window, so it stands in front of it wherever the window is. */}
      {reading ? (
        <ArtItemCard
          listing={cardFor({
            id: `quest.${quest?.id ?? 0}.${reading.item.entry}`,
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

/** Two things under one key, without a wrapper the layout would see. */
function Fragmentish({ children }: { children: (JSX.Element | null)[] }): JSX.Element {
  return <>{children}</>;
}
