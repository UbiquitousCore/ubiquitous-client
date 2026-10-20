import { describe, expect, it, vi } from 'vitest';
import { installMailActions, mailHandlers } from '../src/app/features/mail/mail';
import type { UiArt } from '../src/app/UiArt';
import type { GameConnection } from '../src/net/GameConnection';
import {
  mailActions,
  mailDraft,
  mailMessage,
  mailWaiting,
  startLetter,
  editLetter,
} from '../src/ui/mailStore';
import { banner } from '../src/gameplay/SpellBook';

describe('the post', () => {
  it('sends each window request to the server', () => {
    const connection = {
      sendMailOpen: vi.fn(),
      sendMailSend: vi.fn(),
      sendMailRead: vi.fn(),
      sendMailClaim: vi.fn(),
      sendMailDelete: vi.fn(),
    };
    installMailActions(connection as unknown as GameConnection);
    mailActions().open(5);
    mailActions().read('7');
    mailActions().claim('7');
    mailActions().claim('7', { slot: 2 });
    mailActions().claim('7', { moneyOnly: true });
    mailActions().remove('7');
    mailActions().send('Friend', 'Hi', 'Body', 10, ['1']);
    expect(connection.sendMailOpen).toHaveBeenCalledWith(5);
    expect(connection.sendMailRead).toHaveBeenCalledWith('7');
    expect(connection.sendMailClaim.mock.calls).toEqual([
      ['7', undefined],
      ['7', { slot: 2 }],
      ['7', { moneyOnly: true }],
    ]);
    expect(connection.sendMailDelete).toHaveBeenCalledWith('7');
    expect(connection.sendMailSend).toHaveBeenCalledWith('Friend', 'Hi', 'Body', 10, ['1']);
  });

  it('draws the art of every item an opened message carries', () => {
    const resolveLootArt = vi.fn();
    const handlers = mailHandlers({ resolveLootArt } as unknown as UiArt);
    handlers.onMailMessage?.({
      id: '1',
      items: [{ entry: 11 }, { entry: 12 }],
    } as unknown as Parameters<NonNullable<typeof handlers.onMailMessage>>[0]);
    expect(resolveLootArt.mock.calls).toEqual([[11], [12]]);
    expect(mailMessage.value?.id).toBe('1');
  });

  it('says a refusal in red in the middle of the screen, and keeps the letter', () => {
    const handlers = mailHandlers({ resolveLootArt: () => {} } as unknown as UiArt);
    startLetter('Myself');
    handlers.onMailSent?.(false, 'You cannot mail yourself.', 'selfMail');
    expect(banner.value).toMatchObject({ text: 'You cannot mail yourself.', tone: 'refused' });
    expect(mailDraft.value).not.toBeNull();
  });

  it('says a letter went in yellow, with the money it carried', () => {
    const handlers = mailHandlers({ resolveLootArt: () => {} } as unknown as UiArt);
    startLetter('Arcane');
    editLetter({ money: 10_000 });
    handlers.onMailSent?.(true, null, null);
    expect(banner.value).toMatchObject({ text: 'Sent Successfully', tone: 'done' });
    expect(banner.value?.detail).toMatch(/^-/);
    expect(mailDraft.value).toBeNull();
  });

  it('keeps the count of letters waiting the server last sent', () => {
    const handlers = mailHandlers({ resolveLootArt: () => {} } as unknown as UiArt);
    handlers.onMailUnread?.(2);
    expect(mailWaiting.value).toBe(2);
    handlers.onMailUnread?.(0);
    expect(mailWaiting.value).toBe(0);
  });
});
