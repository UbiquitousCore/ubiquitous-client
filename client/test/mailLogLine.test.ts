import { describe, expect, it } from 'vitest';
import { mailLogLine } from '../src/app/features/mail/mail';
import { formatMoney } from '../src/ui/money';

describe('mailLogLine', () => {
  it('names the mailbox state', () => {
    expect(mailLogLine({ kind: 'opened', open: true })).toBe('mail: mailbox open');
    expect(mailLogLine({ kind: 'opened', open: false })).toBe(
      'mail: mailbox refused (not near a real mailbox)',
    );
  });

  it('counts the inbox', () => {
    expect(mailLogLine({ kind: 'inbox', count: 3 })).toBe('mail: inbox holds 3 message(s)');
  });

  it('says what a claim brought, or why it was refused', () => {
    expect(mailLogLine({ kind: 'claimed', ok: true, gold: 250, itemCount: 2 })).toBe(
      `mail: claimed ${formatMoney(250)} + 2 item(s)`,
    );
    expect(mailLogLine({ kind: 'claimed', ok: false, reason: 'full' })).toBe(
      'mail: claim refused (full)',
    );
  });

  it('falls back when the server gave no reason', () => {
    expect(mailLogLine({ kind: 'sent', ok: false })).toBe('mail: send refused (no reason)');
    expect(mailLogLine({ kind: 'sent', ok: false, reason: null })).toBe(
      'mail: send refused (no reason)',
    );
    expect(mailLogLine({ kind: 'sent', ok: true })).toBe('mail: sent');
  });

  it('names the deleted message', () => {
    expect(mailLogLine({ kind: 'deleted', ok: true, id: 7 })).toBe('mail: deleted 7');
    expect(mailLogLine({ kind: 'deleted', ok: false, id: 7, reason: 'gone' })).toBe(
      'mail: delete refused (gone)',
    );
  });
});
