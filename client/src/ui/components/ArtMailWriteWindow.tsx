/** Writing a letter on the four shipped screens: letter, coin, bag and attachments, side by side. */

import { useState } from 'preact/hooks';
import type { JSX } from 'preact';

import type { PiecePart } from '../art/piecePlan';
import type { ScreenSpec } from '../art/uiSpec';
import { INK, LIGHT, useWorn, useWornScreen } from '../art/useWorn';
import { WornCaptions } from '../art/WornCaptions';
import { WornEdit } from '../art/WornEdit';
import { WornSlot } from '../art/WornSlot';
import { pageLabel, pagesFor, slotsOf } from '../art/wornSlots';
import { unavailableFaces } from '../art/wornState';
import { fitCoins, WornSum } from '../art/WornSum';
import type { Coin } from '../art/WornSum';
import { fill, runs } from '../art/wornWords';
import { moneyOf, splitCoins } from '../money';
import { inventory, itemIcons, itemName } from '../inventoryStore';
import type { InventoryItem } from '../inventoryStore';
import type { MailDraft } from '../mailStore';
import { MAIL_ATTACHMENTS } from '../mailStore';
import { MailRefusal } from './MailRefusal';

/** Our names for these screens. The spec says which dialog wears each. */
export const MAIL_WRITE_SCREEN = 'mailWrite';
export const MAIL_MONEY_SCREEN = 'mailMoney';
export const MAIL_BAG_SCREEN = 'mailBag';
export const MAIL_ATTACH_SCREEN = 'mailAttach';

/** Own choice: the attachment count's colour, filling the sentence's colour hole. */
const ATTACHED_TONE = 'var(--color-brass-300)';

export interface ArtMailWriteWindowProps {
  draft: MailDraft;
  /** Everything in the player's own bag, in slot order. */
  bag: readonly InventoryItem[];
  onEdit(change: Partial<MailDraft>): void;
  /** Put a thing in the letter, or take it back out. */
  onCarry(itemId: string): void;
  /** Take everything back out. */
  onEmpty(): void;
  onSend(): void;
  onClose(): void;
  /** Why the server refused the last send, in red; nothing while all is well. */
  refusal?: string | null;
}

const HIT =
  'absolute cursor-pointer border-0 bg-transparent p-0 active:brightness-90 ' +
  'focus-visible:outline-2 focus-visible:outline-brass-300';

export function ArtMailWriteWindow(props: ArtMailWriteWindowProps): JSX.Element | null {
  const letter = useWornScreen(MAIL_WRITE_SCREEN);
  const money = useWornScreen(MAIL_MONEY_SCREEN);
  const bag = useWornScreen(MAIL_BAG_SCREEN);
  const attached = useWornScreen(MAIL_ATTACH_SCREEN);
  // Which of the two side screens is open. The build opens them from the
  // letter and shuts them with it, and only one is ever up at a time.
  const [aside, setAside] = useState<'money' | 'bag' | null>(null);
  if (!letter) return null;

  // Where each screen goes, and which is in front, is the movie's to say:
  // each places itself on the stage from the same plan it draws.
  return (
    <>
      <Letter
        {...props}
        spec={letter}
        aside={aside}
        onAside={what => setAside(was => (was === what ? null : what))}
      />
      {attached && props.draft.itemIds.length > 0 && <Attached {...props} spec={attached} />}
      {money && aside === 'money' && (
        <Money {...props} spec={money} onDone={() => setAside(null)} />
      )}
      {bag && aside === 'bag' && <Bag {...props} spec={bag} onDone={() => setAside(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// The letter
// ---------------------------------------------------------------------------

function Letter({
  draft,
  onEdit,
  onSend,
  onClose,
  refusal,
  spec,
  aside,
  onAside,
}: ArtMailWriteWindowProps & {
  spec: ScreenSpec;
  aside: 'money' | 'bag' | null;
  onAside(what: 'money' | 'bag'): void;
}): JSX.Element | null {
  const carrying = draft.itemIds.length;
  const coins = splitCoins(draft.money);
  // A letter with nothing written on the line it is addressed to cannot
  // be sent, and the screen has its own face for a control like that.
  const faces = unavailableFaces(spec, { send: draft.to.trim().length > 0 });

  // Every coin there is, exactly.
  const counted: Partial<Record<Coin, string>> = {};
  for (const coin of ['gold', 'silver', 'copper'] as const) {
    if (coins[coin] > 0) counted[coin] = String(coins[coin]);
  }
  const writes = fitCoins(counted);

  const worn = useWorn(spec.dialog, spec.frame, () => ({
    shown: [...(spec.shown ?? []), ...faces.shown],
    hidden: [
      ...(spec.hidden ?? []),
      ...faces.hidden,
      // What the screen says instead of a sum, while there is no sum.
      // The screen parks every coin at one spot and lays the row out as
      // it runs, so the parked art is three coins on top of each other.
      // The row is drawn out of the same movie instead.
      ...Object.values(spec.coins ?? {}),
    ].filter(Boolean),
  }));

  if (!worn.image || !worn.frame) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Write a letter"
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

      {/* What the screen calls its own parts. The control that says how
          much is riding with the letter says it in its own words while
          there is nothing riding, and this screen's words otherwise. */}
      <WornCaptions
        worn={worn}
        spec={spec}
        tone={LIGHT}
        hidden={[
          ...(draft.money > 0 ? [spec.groups?.noMoney ?? ''] : []),
          ...(carrying > 0 ? [spec.groups?.attached ?? ''] : []),
        ].filter(Boolean)}
      />

      {/* How many things are riding with it, where any are. */}
      {carrying > 0 &&
        (() => {
          const part = worn.fieldOf(worn.find(spec.groups?.attached));
          const sentence = spec.formats?.attached;
          if (!part || !sentence) return null;
          return (
            <span style={worn.words(part, LIGHT)}>
              {runs(fill(sentence, 0, carrying)).map((run, index) => (
                <span
                  key={index}
                  // A sentence laid out as runs is laid out as flex items,
                  // and the space either side of a marked run is dropped
                  // unless the run is told to keep it.
                  style={{ whiteSpace: 'pre', ...(run.colour ? { color: ATTACHED_TONE } : {}) }}
                >
                  {run.text}
                </span>
              ))}
            </span>
          );
        })()}

      {/* The sum riding with the letter, laid out where the screen says
          its own words while there is none. */}
      {(() => {
        const field = worn.fieldOf(worn.find(spec.groups?.noMoney));
        return field ? (
          <WornSum
            worn={worn}
            dialog={spec.dialog}
            field={field}
            coins={spec.coins ?? {}}
            says={writes}
            tone={LIGHT}
          />
        ) : null;
      })()}

      {/* The lines the player writes on. */}
      {Object.entries(spec.edits ?? {}).map(([where, edit]) => {
        const part = worn.find(where);
        return part ? (
          <WornEdit
            key={where}
            worn={worn}
            part={part}
            name={edit.holds}
            value={String(draft[edit.holds as 'to' | 'subject' | 'body'] ?? '')}
            max={edit.max}
            lines={edit.lines}
            number={edit.number}
            tone={INK}
            onInput={said => onEdit({ [edit.holds]: said })}
          />
        ) : null;
      })}

      {/* What the letter offers: coin, things, and sending it. */}
      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        if (!part) return null;
        const press =
          what === 'send'
            ? onSend
            : what === 'money'
              ? () => onAside('money')
              : () => onAside('bag');
        const open =
          (what === 'money' && aside === 'money') || (what === 'attach' && aside === 'bag');
        return (
          <button
            key={where}
            type="button"
            aria-label={what}
            aria-expanded={what === 'send' ? undefined : open}
            disabled={what === 'send' && draft.to.trim().length === 0}
            onClick={press}
            style={worn.box(part)}
            className={HIT}
          />
        );
      })}

      {spec.close && worn.find(spec.close) && (
        <button
          type="button"
          aria-label="close the letter"
          onClick={onClose}
          style={worn.box(worn.find(spec.close) as PiecePart)}
          className={HIT}
        />
      )}

      {refusal && <MailRefusal text={refusal} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The coin that rides with it
// ---------------------------------------------------------------------------

function Money({
  draft,
  onEdit,
  spec,
  onDone,
}: ArtMailWriteWindowProps & { spec: ScreenSpec; onDone(): void }): JSX.Element | null {
  const coins = splitCoins(draft.money);
  // Typed into rather than read off the sum, so a figure being written
  // does not jump about as it is typed.
  const [said, setSaid] = useState<Record<string, string>>({
    gold: coins.gold > 0 ? String(coins.gold) : '',
    silver: coins.silver > 0 ? String(coins.silver) : '',
  });
  const worn = useWorn(spec.dialog, spec.frame, () => ({ hidden: spec.hidden ?? [] }));
  if (!worn.image || !worn.frame) return null;

  const figure = (what: string): number => Math.max(0, Math.trunc(Number(said[what] ?? 0)) || 0);
  const settle = (): void => {
    onEdit({ money: moneyOf(figure('gold'), figure('silver')) });
    onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Coin for the letter"
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

      {Object.entries(spec.edits ?? {}).map(([where, edit]) => {
        const part = worn.find(where);
        return part ? (
          <WornEdit
            key={where}
            worn={worn}
            part={part}
            name={edit.holds}
            value={said[edit.holds] ?? ''}
            number={edit.number}
            tone={INK}
            onInput={value => setSaid(was => ({ ...was, [edit.holds]: value }))}
          />
        ) : null;
      })}

      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        return part ? (
          <button
            key={where}
            type="button"
            aria-label={what}
            onClick={what === 'confirm' ? settle : () => setSaid({ gold: '', silver: '' })}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The bag to pick from, and the row of things picked
// ---------------------------------------------------------------------------

function Bag({
  draft,
  bag,
  onCarry,
  onEmpty,
  spec,
  onDone,
}: ArtMailWriteWindowProps & { spec: ScreenSpec; onDone(): void }): JSX.Element | null {
  const [page, setPage] = useState(0);
  const grid = Object.values(spec.grids ?? {})[0];
  const worn = useWorn(spec.dialog, spec.frame, () => ({ hidden: spec.hidden ?? [] }));
  if (!worn.image || !worn.frame || !grid) return null;

  const slots = slotsOf(worn.parts, grid);
  const perPage = slots.length || 1;
  // As many pages as the bag has room for, not as many as it holds: the
  // empty slots at the end of it are still somewhere to look.
  const pages = pagesFor(
    Math.max(inventory.value.bagSlotCount, ...bag.map(item => (item.slot?.index ?? 0) + 1), 0),
    perPage,
  );
  const at = Math.min(page, pages - 1);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick what rides with the letter"
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
        // Placed by the slot each thing is actually in, not by the order
        // the bag was listed in: a bag with a gap in it comes out shifted
        // otherwise, and the thing a player presses is not the one they
        // meant.
        const where = at * perPage + index;
        const item = bag.find(one => one.slot?.index === where);
        const carried = item ? draft.itemIds.includes(item.id) : false;
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
            // The build greys a thing already in the letter, rather than
            // taking it out of the bag it is still sitting in.
            lifted={carried}
            onClick={() => item && onCarry(item.id)}
            className={item ? 'cursor-pointer' : undefined}
          />
        );
      })}

      {/* Turning the bag over. */}
      {([grid.pageBack, grid.pageOn] as const).map((where, which) => {
        const part = where ? worn.find(where) : undefined;
        const beyond = which === 0 ? at <= 0 : at >= pages - 1;
        return part ? (
          <button
            key={`page.${which}`}
            type="button"
            aria-label={which === 0 ? 'previous page' : 'next page'}
            disabled={beyond}
            onClick={() => setPage(Math.min(pages - 1, Math.max(0, at + (which === 0 ? -1 : 1))))}
            style={worn.box(part)}
            className={`${HIT}${beyond ? 'cursor-default opacity-50' : ''}`}
          />
        ) : null;
      })}

      {(() => {
        const part = grid.page ? worn.fieldOf(worn.find(grid.page)) : undefined;
        return part ? <span style={worn.words(part, LIGHT)}>{pageLabel(at, pages)}</span> : null;
      })()}

      {Object.entries(spec.actions ?? {}).map(([where, what]) => {
        const part = worn.find(where);
        return part ? (
          <button
            key={where}
            type="button"
            aria-label={what}
            onClick={what === 'confirm' ? onDone : onEmpty}
            style={worn.box(part)}
            className={HIT}
          />
        ) : null;
      })}

      {spec.close && worn.find(spec.close) && (
        <button
          type="button"
          aria-label="close the bag"
          onClick={onDone}
          style={worn.box(worn.find(spec.close) as PiecePart)}
          className={HIT}
        />
      )}
    </div>
  );
}

function Attached({
  draft,
  bag,
  onCarry,
  spec,
}: ArtMailWriteWindowProps & { spec: ScreenSpec }): JSX.Element | null {
  const grid = Object.values(spec.grids ?? {})[0];
  const worn = useWorn(spec.dialog, spec.frame, whole => ({
    hidden: [
      ...(spec.hidden ?? []),
      // A letter carries up to five, and the slots past what it holds
      // are not part of the picture — the same rule a store's last page
      // is drawn by.
      ...(grid
        ? slotsOf(whole, grid)
            .filter((_slot, index) => index >= draft.itemIds.length)
            .map(slot => slot.path)
        : []),
    ],
  }));
  if (!worn.image || !worn.frame || !grid) return null;

  const slots = slotsOf(worn.parts, grid);
  const held = draft.itemIds.slice(0, MAIL_ATTACHMENTS);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Riding with the letter"
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
        const item = bag.find(held[index] ? one => one.id === held[index] : () => false);
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
            onClick={() => item && onCarry(item.id)}
            className={item ? 'cursor-pointer' : undefined}
          />
        );
      })}
    </div>
  );
}
