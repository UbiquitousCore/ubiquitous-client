import type { UiArt } from '../../UiArt';
import { logger } from '../../../core/log';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import {
  applyMailClaimed,
  applyMailDeleted,
  applyMailSent,
  setMailActions,
  setMailInbox,
  setMailMessage,
  setMailOpened,
} from '../../../ui/mailStore';
import { formatMoney } from '../../../ui/money';

const log = logger('mail');

/** What the server told the client about the post, as far as the log line needs. */
export type MailEvent =
  | { kind: 'opened'; open: boolean }
  | { kind: 'inbox'; count: number }
  | { kind: 'sent'; ok: boolean; reason?: string | null }
  | { kind: 'claimed'; ok: boolean; gold?: number; itemCount?: number; reason?: string | null }
  | { kind: 'deleted'; ok: boolean; id: number | string; reason?: string | null };

/** The one log line for a mail event. A refusal gives the server's reason when it sent one. */
export function mailLogLine(event: MailEvent): string {
  switch (event.kind) {
    case 'opened':
      return event.open ? 'mail: mailbox open' : 'mail: mailbox refused (not near a real mailbox)';
    case 'inbox':
      return `mail: inbox holds ${event.count} message(s)`;
    case 'sent':
      return event.ok ? 'mail: sent' : `mail: send refused (${event.reason ?? 'no reason'})`;
    case 'claimed':
      return event.ok
        ? `mail: claimed ${formatMoney(event.gold ?? 0)} + ${event.itemCount ?? 0} item(s)`
        : `mail: claim refused (${event.reason ?? 'no reason'})`;
    case 'deleted':
      return event.ok
        ? `mail: deleted ${event.id}`
        : `mail: delete refused (${event.reason ?? 'no reason'})`;
  }
}

/**
 * The post. Claimed items and coins also arrive as ordinary inventory and
 * player updates; the claim reply only marks the row and says what came.
 */
export function mailHandlers(art: UiArt): Partial<ConnectionEvents> {
  return {
    onMailOpened: open => {
      setMailOpened(open);
      log.info(mailLogLine({ kind: 'opened', open }));
    },

    onMailInbox: messages => {
      setMailInbox(messages);
      log.info(mailLogLine({ kind: 'inbox', count: messages.length }));
    },

    onMailMessage: message => {
      setMailMessage(message);
      for (const item of message.items) art.resolveLootArt(item.entry);
    },

    onMailSent: (ok, reason, code) => {
      applyMailSent(ok, reason, code);
      log.info(mailLogLine({ kind: 'sent', ok, reason }));
    },

    onMailClaimed: (ok, gold, items, reason, code) => {
      applyMailClaimed(ok, gold, items, reason, code);
      log.info(mailLogLine({ kind: 'claimed', ok, gold, itemCount: items.length, reason }));
    },

    onMailDeleted: (ok, id, reason) => {
      applyMailDeleted(ok, id, reason);
      log.info(mailLogLine({ kind: 'deleted', ok, id, reason }));
    },
  };
}

/** The window's buttons, each one a request to the server; the inbox changes only on the answer. */
export function installMailActions(connection: GameConnection): void {
  setMailActions({
    open: networkId => connection.sendMailOpen(networkId),
    send: (recipientName, subject, body, gold, itemIds) =>
      connection.sendMailSend(recipientName, subject, body, gold, itemIds),
    read: id => connection.sendMailRead(id),
    claim: (id, take) => connection.sendMailClaim(id, take),
    remove: id => connection.sendMailDelete(id),
  });
}
