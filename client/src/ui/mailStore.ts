/**
 * The mailbox: inbox owned by the server (claim/delete are requests; rows
 * change when the server answers). One window at a time; opens on
 * `mail.opened`, shuts locally.
 */

import { signal } from '@preact/signals';

import type { MailAttachment, MailInboxEntry, MailMessage } from '../net/GameConnection';
import { formatMoney } from './money';

export type { MailAttachment, MailInboxEntry, MailMessage };

/** Whether a mailbox is open, which only the server decides (`mail.opened`). */
export const mailOpen = signal(false);

/** The inbox, newest first. Arrives alongside a successful open. */
export const mailInbox = signal<readonly MailInboxEntry[]>([]);

/** The message currently being read, if any. */
export const mailMessage = signal<MailMessage | null>(null);

/** The last send/claim/delete outcome, for the window to show in words. */
export interface MailNotice {
  kind: 'sent' | 'claim' | 'delete';
  ok: boolean;
  text: string | null;
}

export const mailNotice = signal<MailNotice | null>(null);

/** A letter being written, held here so closing the window keeps it; `money` in copper. */
export interface MailDraft {
  to: string;
  subject: string;
  body: string;
  money: number;
  /** The bag items riding with it, in the order they were picked. */
  itemIds: readonly string[];
}

export const mailDraft = signal<MailDraft | null>(null);

/** How many things one letter may carry. Observed in play by the owner. */
export const MAIL_ATTACHMENTS = 5;

const BLANK: MailDraft = { to: '', subject: '', body: '', money: 0, itemIds: [] };

/** Start a letter; the open letter closes, since both are drawn in one place. */
export function startLetter(to = '', subject = ''): void {
  mailMessage.value = null;
  mailDraft.value = { ...BLANK, to, subject };
}

/** Change part of the letter being written; does nothing when there is none. */
export function editLetter(change: Partial<MailDraft>): void {
  const draft = mailDraft.value;
  if (draft) mailDraft.value = { ...draft, ...change };
}

/**
 * Put something in the letter, or take it out again where it is already in.
 *
 * Pressing a thing already carried takes it back out, and a letter carries
 * no more than `MAIL_ATTACHMENTS`.
 */
export function carryInLetter(itemId: string): void {
  const draft = mailDraft.value;
  if (!draft) return;
  const held = draft.itemIds.includes(itemId);
  if (!held && draft.itemIds.length >= MAIL_ATTACHMENTS) return;
  mailDraft.value = {
    ...draft,
    itemIds: held ? draft.itemIds.filter(id => id !== itemId) : [...draft.itemIds, itemId],
  };
}

/** Take everything back out of the letter, leaving what is written alone. */
export function emptyLetter(): void {
  editLetter({ itemIds: [] });
}

/** Put the letter away. Local only; nothing has been sent. */
export function closeLetter(): void {
  mailDraft.value = null;
}

/**
 * Send what has been written.
 *
 * A letter addressed to nobody is not sent, and the user's strings have no
 * words to say so. The answer arrives as `mail.sent`.
 */
export function sendLetter(): void {
  const draft = mailDraft.value;
  if (!draft || !draft.to.trim()) return;
  actions.send(draft.to.trim(), draft.subject, draft.body, draft.money, [...draft.itemIds]);
  mailDraft.value = null;
}

/** Show the window. The inbox arrives on the next message, not with this. */
export function setMailOpened(open: boolean): void {
  mailOpen.value = open;
  if (!open) {
    mailMessage.value = null;
    mailNotice.value = null;
    mailDraft.value = null;
    pendingClaimId = null;
  }
}

/** Replace the whole inbox. The server sends it whole every time. */
export function setMailInbox(messages: MailInboxEntry[]): void {
  mailInbox.value = messages;
  const open = mailMessage.value;
  if (open && !messages.some(row => row.id === open.id)) mailMessage.value = null;
}

/**
 * Show one message's body.
 *
 * Reading marks it read server-side, so the row is marked here too — that is
 * the server's answer being applied, not a guess.
 */
export function setMailMessage(message: MailMessage): void {
  mailMessage.value = message;
  mailInbox.value = mailInbox.value.map(row =>
    row.id === message.id ? { ...row, read: true } : row,
  );
}

export function applyMailSent(ok: boolean, reason: string | null): void {
  mailNotice.value = { kind: 'sent', ok, text: ok ? 'Mail sent.' : (reason ?? 'Mail refused.') };
}

/**
 * The id of the claim currently waiting on an answer.
 *
 * `mail.claimed` carries no id of its own, so the row it answers is whatever
 * was last asked for. Set when the request goes out, cleared on the reply.
 */
let pendingClaimId: string | null = null;

export function applyMailClaimed(
  ok: boolean,
  gold: number,
  items: MailAttachment[],
  reason: string | null,
): void {
  const id = pendingClaimId;
  pendingClaimId = null;
  if (!ok) {
    mailNotice.value = { kind: 'claim', ok, text: reason ?? 'Claim refused.' };
    return;
  }
  if (id !== null) {
    mailInbox.value = mailInbox.value.map(row =>
      row.id === id ? { ...row, goldClaimed: true, itemsClaimed: true } : row,
    );
    const open = mailMessage.value;
    if (open && open.id === id) {
      mailMessage.value = { ...open, goldClaimed: true, itemsClaimed: true };
    }
  }
  const parts: string[] = [];
  if (gold > 0) parts.push(formatMoney(gold));
  if (items.length > 0) parts.push(`${items.length} item(s)`);
  mailNotice.value = {
    kind: 'claim',
    ok,
    text: parts.length > 0 ? `Claimed ${parts.join(' and ')}.` : 'Claimed.',
  };
}

export function applyMailDeleted(ok: boolean, id: string, reason: string | null): void {
  if (!ok) {
    mailNotice.value = { kind: 'delete', ok, text: reason ?? 'Delete refused.' };
    return;
  }
  mailInbox.value = mailInbox.value.filter(row => row.id !== id);
  if (mailMessage.value?.id === id) mailMessage.value = null;
  mailNotice.value = { kind: 'delete', ok, text: 'Deleted.' };
}

/** Put the window away. Tells the server nothing — mail has no close message. */
export function closeMail(): void {
  mailOpen.value = false;
  mailMessage.value = null;
  mailNotice.value = null;
  mailDraft.value = null;
  pendingClaimId = null;
}

// ---------------------------------------------------------------------------
// What the interface asks the game to do: handlers defaulting to nothing.
// ---------------------------------------------------------------------------
export interface MailActions {
  /** Open a mailbox static object. Answered by `onMailOpened` + `onMailInbox`. */
  open(networkId: number): void;
  /** Send mail. Answered by `onMailSent`; removals arrive as inventory deltas. */
  send(recipientName: string, subject: string, body: string, gold: number, itemIds: string[]): void;
  /** Read one message. Answered by `onMailMessage`. */
  read(id: string): void;
  /** Claim one message's gold and items, atomically. Answered by `onMailClaimed`. */
  claim(id: string): void;
  /** Delete one message. Answered by `onMailDeleted`. */
  remove(id: string): void;
}

const NOTHING: MailActions = {
  open: () => {},
  send: () => {},
  read: () => {},
  claim: () => {},
  remove: () => {},
};

let actions: MailActions = NOTHING;

export function setMailActions(next: MailActions): void {
  actions = next;
}

export function mailActions(): MailActions {
  return actions;
}

/** Read one message: send the request. */
export function readMail(id: string): void {
  actions.read(id);
}

/** Claim one message: the request, plus remembering which row the answer is for. */
export function claimMail(id: string): void {
  pendingClaimId = id;
  actions.claim(id);
}

/**
 * Put the letter away, leaving the mailbox open.
 *
 * Local only, like every other close in the mailbox: reading is a request
 * and nothing on the wire says a letter has been put down again.
 */
export function closeMailMessage(): void {
  mailMessage.value = null;
}

/** Close the window. Local only — there is no `mail.close` on the wire. */
export function dismissMail(): void {
  if (!mailOpen.value) return;
  closeMail();
}
