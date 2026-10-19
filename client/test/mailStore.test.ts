/**
 * The mailbox's own rules.
 *
 * The server owns the inbox: claiming and deleting are requests and the row
 * changes when the server answers, because a refusal — bags full, unknown id
 * — must leave the window showing what is really there. And `mail.claimed`
 * carries no id of its own, so the row it answers is whatever was last asked
 * for.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { MailInboxEntry, MailMessage } from '../src/net/GameConnection';
import {
  applyMailClaimed,
  carryInLetter,
  closeLetter,
  editLetter,
  emptyLetter,
  mailDraft,
  MAIL_ATTACHMENTS,
  sendLetter,
  startLetter,
  applyMailDeleted,
  applyMailSent,
  claimMail,
  closeMail,
  dismissMail,
  mailInbox,
  mailMessage,
  mailNotice,
  mailOpen,
  setMailActions,
  setMailInbox,
  setMailMessage,
  setMailOpened,
} from '../src/ui/mailStore';

function row(id: string, over: Partial<MailInboxEntry> = {}): MailInboxEntry {
  return {
    id,
    senderName: 'Ayla',
    subject: 'Hello',
    gold: 0,
    sentAt: 1_000,
    read: false,
    goldClaimed: false,
    itemCount: 0,
    itemsClaimed: false,
    ...over,
  };
}

function message(id: string, over: Partial<MailMessage> = {}): MailMessage {
  return { ...row(id), body: 'Hi', items: [], ...over };
}

beforeEach(() => {
  closeMail();
  setMailActions({
    open: () => {},
    send: () => {},
    read: () => {},
    claim: () => {},
    remove: () => {},
  });
});

describe('opening a mailbox', () => {
  it('shows the inbox the server sends alongside the open', () => {
    setMailOpened(true);
    expect(mailOpen.value).toBe(true);
    setMailInbox([row('a'), row('b')]);
    expect(mailInbox.value).toHaveLength(2);
  });

  it('closes everything on a refusal', () => {
    setMailOpened(true);
    setMailInbox([row('a')]);
    setMailMessage(message('a'));
    setMailOpened(false);
    expect(mailOpen.value).toBe(false);
    expect(mailMessage.value).toBeNull();
    expect(mailInbox.value).toHaveLength(1);
  });
});

describe('reading', () => {
  it('marks the row read when its body arrives', () => {
    setMailInbox([row('a')]);
    setMailMessage(message('a'));
    expect(mailMessage.value?.id).toBe('a');
    expect(mailInbox.value[0]?.read).toBe(true);
  });

  it('drops the open message when it leaves the inbox', () => {
    setMailInbox([row('a')]);
    setMailMessage(message('a'));
    setMailInbox([]);
    expect(mailMessage.value).toBeNull();
  });
});

describe('claiming', () => {
  it('flips the answered row to claimed, gold and items together', () => {
    setMailInbox([row('a', { gold: 50, itemCount: 2 })]);
    setMailMessage(message('a', { gold: 50, items: [{ entry: 1, count: 2 }] }));
    claimMail('a');
    applyMailClaimed(true, 50, [{ entry: 1, count: 2 }], null);
    expect(mailInbox.value[0]).toMatchObject({ goldClaimed: true, itemsClaimed: true });
    expect(mailMessage.value).toMatchObject({ goldClaimed: true, itemsClaimed: true });
    expect(mailNotice.value).toMatchObject({ kind: 'claim', ok: true });
  });

  it('leaves the row alone on a refusal — bags full loses nothing', () => {
    setMailInbox([row('a', { gold: 50, itemCount: 1 })]);
    claimMail('a');
    applyMailClaimed(false, 0, [], 'Your bags are full — free a slot and claim again.');
    expect(mailInbox.value[0]).toMatchObject({ goldClaimed: false, itemsClaimed: false });
    expect(mailNotice.value?.text).toContain('bags are full');
  });

  it('marks only the money taken when only the money was asked for', () => {
    setMailInbox([row('a', { gold: 50, itemCount: 1 })]);
    setMailMessage(message('a', { gold: 50, items: [{ entry: 1, count: 1 }] }));
    claimMail('a', { moneyOnly: true });
    applyMailClaimed(true, 50, [], null);
    expect(mailInbox.value[0]).toMatchObject({ goldClaimed: true, itemsClaimed: false });
    expect(mailMessage.value).toMatchObject({ goldClaimed: true, itemsClaimed: false });
  });

  it('leaves one taken attachment to the letter the server sends again', () => {
    setMailInbox([row('a', { itemCount: 2 })]);
    setMailMessage(
      message('a', {
        items: [
          { entry: 1, count: 1 },
          { entry: 2, count: 1 },
        ],
      }),
    );
    claimMail('a', { slot: 1 });
    applyMailClaimed(true, 0, [{ entry: 2, count: 1 }], null);
    expect(mailInbox.value[0]).toMatchObject({ itemsClaimed: false });
    expect(mailMessage.value?.items).toHaveLength(2);
  });

  it('answers the last claim asked for, since the reply carries no id', () => {
    setMailInbox([row('a'), row('b')]);
    claimMail('b');
    applyMailClaimed(true, 0, [], null);
    expect(mailInbox.value[0]).toMatchObject({ goldClaimed: false });
    expect(mailInbox.value[1]).toMatchObject({ goldClaimed: true });
  });
});

describe('sending and deleting', () => {
  it('reports a send refusal in words', () => {
    applyMailSent(false, 'No player with that name exists.');
    expect(mailNotice.value).toMatchObject({ kind: 'sent', ok: false });
    expect(mailNotice.value?.text).toContain('No player');
  });

  it('removes the row only when the server says it is deleted', () => {
    const removed: string[] = [];
    setMailActions({
      open: () => {},
      send: () => {},
      read: () => {},
      claim: () => {},
      remove: id => removed.push(id),
    });
    setMailInbox([row('a'), row('b')]);
    setMailMessage(message('a'));
    // The request itself changes nothing.
    expect(mailInbox.value).toHaveLength(2);
    applyMailDeleted(true, 'a', null);
    expect(mailInbox.value.map(item => item.id)).toEqual(['b']);
    expect(mailMessage.value).toBeNull();
    expect(removed).toEqual([]);
  });

  it('closes locally without telling the server — mail has no close message', () => {
    const removed: string[] = [];
    setMailActions({
      open: () => {},
      send: () => {},
      read: () => {},
      claim: () => {},
      remove: id => removed.push(id),
    });
    setMailOpened(true);
    setMailInbox([row('a')]);
    dismissMail();
    expect(mailOpen.value).toBe(false);
    expect(removed).toEqual([]);
  });
});

describe('a letter being written', () => {
  beforeEach(() => closeLetter());

  it('starts blank, or addressed to whoever it is a reply to', () => {
    startLetter();
    expect(mailDraft.value).toEqual({ to: '', subject: '', body: '', money: 0, itemIds: [] });
    startLetter('Someone', 'About it');
    expect(mailDraft.value?.to).toBe('Someone');
    expect(mailDraft.value?.subject).toBe('About it');
  });

  it('puts away the letter being read as it opens', () => {
    // The two screens stand in the same place, so one left open would sit
    // underneath the other.
    setMailMessage({ ...row('a'), body: 'Words.', items: [] });
    startLetter();
    expect(mailMessage.value).toBeNull();
  });

  it('changes only the part of it that was written in', () => {
    startLetter('Someone');
    editLetter({ body: 'Words.' });
    expect(mailDraft.value).toMatchObject({ to: 'Someone', body: 'Words.' });
  });

  it('takes a thing back out when it is pressed again', () => {
    // There is no separate control for taking one back out.
    startLetter('Someone');
    carryInLetter('a');
    carryInLetter('b');
    expect(mailDraft.value?.itemIds).toEqual(['a', 'b']);
    carryInLetter('a');
    expect(mailDraft.value?.itemIds).toEqual(['b']);
  });

  it('carries no more than one letter holds', () => {
    startLetter('Someone');
    for (let at = 0; at < MAIL_ATTACHMENTS + 3; at++) carryInLetter(`item${at}`);
    expect(mailDraft.value?.itemIds).toHaveLength(MAIL_ATTACHMENTS);
  });

  it('empties what it carries without touching what is written', () => {
    startLetter('Someone');
    editLetter({ body: 'Words.' });
    carryInLetter('a');
    emptyLetter();
    expect(mailDraft.value).toMatchObject({ body: 'Words.', itemIds: [] });
  });

  it('sends what was written, and puts the letter away once the server takes it', () => {
    const sent: unknown[] = [];
    setMailActions({
      open: () => {},
      send: (...args) => sent.push(args),
      read: () => {},
      claim: () => {},
      remove: () => {},
    });
    startLetter('  Someone  ', 'About it');
    editLetter({ body: 'Words.', money: 4_500 });
    carryInLetter('a');
    sendLetter();
    expect(sent).toEqual([['Someone', 'About it', 'Words.', 4_500, ['a']]]);
    expect(mailDraft.value).not.toBeNull();
    applyMailSent(true, null);
    expect(mailDraft.value).toBeNull();
  });

  it('keeps the letter open when the server refuses it, with the reason and its code', () => {
    startLetter('Myself');
    editLetter({ body: 'Words.' });
    sendLetter();
    applyMailSent(false, 'You cannot mail yourself.', 'selfMail');
    expect(mailDraft.value).toMatchObject({ to: 'Myself', body: 'Words.' });
    expect(mailNotice.value).toMatchObject({
      ok: false,
      code: 'selfMail',
      text: 'You cannot mail yourself.',
    });
  });

  it('does not send a letter addressed to nobody', () => {
    // Nothing is sent, and the letter stays open to be addressed.
    const sent: unknown[] = [];
    setMailActions({
      open: () => {},
      send: (...args) => sent.push(args),
      read: () => {},
      claim: () => {},
      remove: () => {},
    });
    startLetter('   ');
    sendLetter();
    expect(sent).toEqual([]);
    expect(mailDraft.value).not.toBeNull();
  });

  it('throws the letter away with the mailbox it was written in', () => {
    startLetter('Someone');
    closeMail();
    expect(mailDraft.value).toBeNull();
  });
});
