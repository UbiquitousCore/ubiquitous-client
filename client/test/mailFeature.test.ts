import { describe, expect, it, vi } from 'vitest';
import { installMailActions, mailHandlers } from '../src/app/features/mail/mail';
import type { UiArt } from '../src/app/UiArt';
import type { GameConnection } from '../src/net/GameConnection';
import { mailActions, mailMessage } from '../src/ui/mailStore';

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
    mailActions().remove('7');
    mailActions().send('Friend', 'Hi', 'Body', 10, ['1']);
    expect(connection.sendMailOpen).toHaveBeenCalledWith(5);
    expect(connection.sendMailRead).toHaveBeenCalledWith('7');
    expect(connection.sendMailClaim).toHaveBeenCalledWith('7');
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
});
