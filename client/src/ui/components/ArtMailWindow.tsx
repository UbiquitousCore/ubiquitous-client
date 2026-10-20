/** The mailbox and the letter it opens beside it, two shipped screens side by side. */

import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEmblem } from '../art/WornEmblem';
import { unavailableFaces } from '../art/wornState';
import { WornChevrons } from '../art/WornChevrons';
import { WornRow } from '../art/WornRow';
import { WornSlot } from '../art/WornSlot';
import { listGestures, listSlice, rowsIn, useListScroll } from '../art/wornList';
import { slotsOf } from '../art/wornSlots';
import { itemIcons, itemName } from '../inventoryStore';
import { coinsOf, formatMoney } from '../money';
import type { MailAttachment, MailInboxEntry, MailMessage, MailTake } from '../mailStore';
import { ArtItemCard, HELD_CARD, cardFor } from './ArtItemCard';
import { MAIL_ATTACH_SCREEN } from './ArtMailWriteWindow';

/** Our names for these screens. The spec says which dialog wears each. */
export const MAIL_SCREEN = 'mail';
export const MAIL_READ_SCREEN = 'mailRead';

export interface ArtMailWindowProps {
  inbox: readonly MailInboxEntry[];
  message: MailMessage | null;
  notice: string | null;
  /** True while a letter of the player's own is being written: the Write control is lit. */
  writing?: boolean;
  onSelect(id: string): void;
  onClaim(id: string, take?: MailTake): void;
  onDelete(id: string): void;
  /** Put the letter away, leaving the box open. */
  onCloseLetter(): void;
  /** Start a letter of the player's own, which the box's own control does. */
  onWrite(): void;
  onClose(): void;
}

export function ArtMailWindow(props: ArtMailWindowProps): JSX.Element | null {
  const box = useWornScreen(MAIL_SCREEN);
  const letter = useWornScreen(MAIL_READ_SCREEN);
  const attached = useWornScreen(MAIL_ATTACH_SCREEN);
  if (!box) return null;
  const message = props.message;
  // Where each goes is the movie's to say, not ours, and each screen
  // places itself on the stage from the same plan it draws.
  return (
    <>
      <Inbox {...props} spec={box} />
      {letter && message && <Letter {...props} message={message} spec={letter} />}
      {/* What the letter carries, on the same strip a letter being written
          shows its own on, until it is taken. */}
      {letter && attached && message && !message.itemsClaimed && message.items.length > 0 && (
        <Carried
          items={message.items}
          spec={attached}
          onTake={slot => props.onClaim(message.id, { slot })}
        />
      )}
    </>
  );
}

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

function Inbox({
  inbox,
  message,
  writing = false,
  onSelect,
  onWrite,
  onClose,
  spec,
}: ArtMailWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const scroll = useListScroll();
  const list = spec.lists?.inbox;

  /** What each column of a row reads. The sender is written into a line. */
  const columnsOf = (row: MailInboxEntry): Record<string, string> => ({
    sender: spec.formats?.from ? `${spec.formats.from} ${row.senderName}` : row.senderName,
    subject: row.subject,
  });

  const sliceOf = (whole: readonly PiecePart[]) =>
    listSlice(whole, { list, items: inbox, scroll: scroll.at, values: columnsOf });

  const worn = useWorn(spec.dialog, spec.frame, whole => {
    const slice = sliceOf(whole);
    const lit = slice.keptRows.find(
      (_path, at) => message !== null && slice.shown[at]?.id === message.id,
    );
    return {
      // The marks that say the list runs on are placed but not drawn:
      // each is drawn on its own so it can slide the way it points.
      withoutArt: slice.marks,
      // Each control's second face is its lit one, worn while that control's
      // letter is open.
      frames: Object.fromEntries(
        Object.keys(spec.actions ?? {}).map(where => [where, writing ? 1 : 0]),
      ),
      shown: [...(spec.shown ?? []), ...(lit ? [lit] : [])],
      hidden: [
        ...(spec.hidden ?? []),
        ...slice.hidden,
        // Every row draws the rule the screen lights under the one being
        // read. Drawn as shipped, every row reads as the open one.
        ...(list?.chosen
          ? slice.keptRows
              .map(path => `${path}/${list.chosen}`)
              .filter(path => !lit || !path.startsWith(`${lit}/`))
          : []),
      ],
    };
  });
  const slice = sliceOf(worn.whole);
  const rows = rowsIn(worn.parts, slice);

  if (!worn.image || !worn.frame) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mailbox"
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

      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

      {/* Each letter that has arrived, and what it says it is. */}
      {rows.map(({ row, item }) => (
        <button
          key={row.path}
          type="button"
          aria-current={message?.id === item.id ? 'true' : undefined}
          aria-label={`${item.senderName}: ${item.subject}`}
          onClick={() => onSelect(item.id)}
          style={worn.box(row)}
          className={HIT}
        />
      ))}
      {/* The letter or parcel the screen draws beside each row, greyed
          once it has been read — a picture from its own file rather
          than art the movie carries. */}
      {rows.map(({ row, item }) => {
        const emblem = list?.emblem;
        return emblem ? (
          <WornEmblem
            key={`${row.path}.emblem`}
            worn={worn}
            at={worn.find(`${row.path}/${emblem.at}`)}
            icon={item.itemCount > 0 ? emblem.icons?.carrying : emblem.icons?.plain}
            size={emblem.size}
            grey={item.read}
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
            tone={LIGHT}
            // White whether read or not: the field's own colour is the dark
            // ink of the sheet it was drawn on. A letter not yet opened is
            // the one worth noticing.
            styleOf={() => (item.read ? 'text-parchment-100' : 'font-semibold text-parchment-100')}
          />
        ))}

      {/* The marks that say the list runs on, each sliding the way it
          points, and each a control on this screen as well. */}
      <WornChevrons
        worn={worn}
        list={list}
        slice={slice}
        labels={{ up: 'Earlier letters', down: 'Later letters' }}
        onStep={way => scroll.step(way === 'up' ? -1 : 1, slice.furthest)}
      />

      {/* The emblems the screen draws on its own controls. */}
      {Object.entries(spec.emblems ?? {}).map(([what, emblem]) => (
        <WornEmblem
          key={`emblem.${what}`}
          worn={worn}
          at={worn.find(emblem.at)}
          icon={emblem.icon}
          size={emblem.size}
        />
      ))}

      {/* What the box offers besides reading: writing one of your own. */}
      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        return part ? (
          <button
            key={where}
            type="button"
            aria-label={what}
            onClick={onWrite}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}

      {(() => {
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the mailbox"
            onClick={onClose}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}
    </div>
  );
}

function Letter({
  message,
  notice,
  onClaim,
  onDelete,
  onCloseLetter,
  spec,
}: Omit<ArtMailWindowProps, 'message'> & {
  message: MailMessage;
  spec: ScreenSpec;
}): JSX.Element | null {
  const carried = message.goldClaimed ? 0 : message.gold;
  const coins = coinsOf(carried);
  const values: Record<string, string> = {
    from: spec.formats?.from ? `${spec.formats.from} ${message.senderName}` : message.senderName,
    subject: message.subject,
    body: message.body,
    ...coins,
  };
  /** Whether there is anything left to take out of it. */
  const holds = carried > 0 || (message.itemCount > 0 && !message.itemsClaimed);

  // A letter with nothing left in it cannot be emptied, and the screen
  // has its own face for a control there is nothing behind.
  const faces = unavailableFaces(spec, { claim: holds, claimMoney: carried > 0 });

  const worn = useWorn(spec.dialog, spec.frame, {
    shown: [...(spec.shown ?? []), ...faces.shown],
    hidden: [
      ...(spec.hidden ?? []),
      ...faces.hidden,
      // The purse is shown only while the letter carries something.
      ...(carried > 0 ? [] : [spec.groups?.money ?? '']),
      // A coin with no figure beside it reads as a sum of nothing.
      ...Object.entries(spec.coins ?? {}).flatMap(([what, where]) => (values[what] ? [] : [where])),
    ].filter(Boolean),
  });

  if (!worn.image || !worn.frame) return null;

  const act = (what: string): void => {
    if (what === 'claim') onClaim(message.id);
    else if (what === 'claimMoney') onClaim(message.id, { moneyOnly: true });
    else if (what === 'delete') onDelete(message.id);
  };

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Letter"
      className="touch-none overflow-hidden"
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

      <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

      {Object.entries(spec.values ?? {}).map(([what, where]) => {
        const part = worn.fieldOf(worn.find(where));
        if (!part || !values[what]) return null;
        // The letter itself runs to as many lines as it runs to, and is
        // scrolled where it runs past the room it was given.
        const wrap = what === 'body';
        return (
          <span
            key={`value.${what}`}
            style={
              wrap
                ? {
                    ...worn.words(part, INK, true),
                    overflowY: 'auto',
                    pointerEvents: 'auto',
                    display: 'block',
                  }
                : worn.words(part, INK)
            }
          >
            {values[what]}
          </span>
        );
      })}

      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        if (!part) return null;
        const off = (what === 'claim' && !holds) || (what === 'claimMoney' && carried <= 0);
        return (
          <button
            key={where}
            type="button"
            aria-label={what}
            disabled={off}
            onClick={() => act(what)}
            style={worn.box(part)}
            className={`${HIT}${off ? 'cursor-not-allowed opacity-50' : ''}`}
          />
        );
      })}

      {(() => {
        // The letter shuts on its own control, the way the box does.
        // Without this the only way out was to shut the whole mailbox.
        const part = worn.find(spec.close);
        return part ? (
          <button
            type="button"
            aria-label="Close the letter"
            onClick={onCloseLetter}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })()}

      {notice && (
        <p role="status" className="sr-only">
          {notice}
        </p>
      )}
      {message.items.length > 0 && (
        <p className="sr-only">{`${message.items.length} attached, ${formatMoney(carried)}`}</p>
      )}
    </div>
  );
}

/**
 * What a letter being read carries: one slot per thing, the rest of the
 * strip left out of the picture the way a letter being written leaves it.
 * Pressing one opens the card a thing you have opens, which takes that one
 * thing out of the letter.
 */
function Carried({
  items,
  spec,
  onTake,
}: {
  items: readonly MailAttachment[];
  spec: ScreenSpec;
  onTake(slot: number): void;
}): JSX.Element | null {
  const [reading, setReading] = useState<{ at: number; x: number; y: number } | null>(null);
  const grid = Object.values(spec.grids ?? {})[0];
  const worn = useWorn(spec.dialog, spec.frame, whole => ({
    hidden: [
      ...(spec.hidden ?? []),
      ...(grid
        ? slotsOf(whole, grid)
            .filter((_slot, index) => index >= items.length)
            .map(slot => slot.path)
        : []),
    ],
  }));
  if (!worn.image || !worn.frame || !grid) return null;

  const slots = slotsOf(worn.parts, grid);
  const read = reading ? items[reading.at] : undefined;

  return (
    <>
      <div
        role="dialog"
        aria-modal="false"
        aria-label="Carried by the letter"
        className="touch-none overflow-hidden"
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
        <WornCaptions worn={worn} spec={spec} tone={LIGHT} />

        {slots.map((slot, index) => {
          const item = items[index];
          return (
            <WornSlot
              key={slot.path}
              worn={worn}
              slot={slot}
              face={worn.parts.find(inside => inside.path === `${slot.path}/${grid.face}`)}
              countAt={worn.parts.find(inside => inside.path === `${slot.path}/${grid.count}`)}
              icon={item ? (itemIcons.value.get(item.entry) ?? null) : null}
              name={item ? itemName(item) : undefined}
              count={item?.count}
              {...(item
                ? {
                    role: 'button',
                    'aria-label': `About ${itemName(item)}`,
                    className: 'cursor-pointer',
                    onClick: (event: MouseEvent) => {
                      const on = (event.currentTarget as HTMLElement).getBoundingClientRect();
                      setReading({ at: index, x: on.right, y: on.top });
                    },
                  }
                : {})}
            />
          );
        })}
      </div>
      {/* Drawn out of the stage the mailbox stands on: there each screen
          is stacked by the depth the movie places it at, and the letter
          and the box came out over the card. */}
      {reading && read
        ? createPortal(
            <ArtItemCard
              listing={cardFor({ id: `mail-${reading.at}`, entry: read.entry, count: read.count })}
              wears={HELD_CARD}
              actions={[
                {
                  key: 'take',
                  onPick: () => {
                    onTake(reading.at);
                    setReading(null);
                  },
                },
              ]}
              anchor={{ x: reading.x, y: reading.y }}
              onClose={() => setReading(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
