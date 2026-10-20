/** The mailbox window, with a game behind it: store in, requests out. */

import type { JSX } from 'preact';

import { ArtMailWindow, MAIL_SCREEN } from './components/ArtMailWindow';
import { ArtMailWriteWindow } from './components/ArtMailWriteWindow';
import { useWornScreen } from './art/useWorn';
import { WornStage } from './art/WornStage';
import { inventory } from './inventoryStore';
import {
  carryInLetter,
  claimMail,
  closeLetter,
  closeMailMessage,
  dismissMail,
  editLetter,
  emptyLetter,
  mailActions,
  mailDraft,
  mailInbox,
  mailMessage,
  mailNotice,
  mailOpen,
  readMail,
  sendLetter,
  replySubject,
  startLetter,
} from './mailStore';

export function MailWindowContainer(): JSX.Element | null {
  // Asked before anything else this draws, so the same number of hooks
  // runs whether the mailbox is open or shut.
  const worn = useWornScreen(MAIL_SCREEN);
  if (!mailOpen.value || !worn) return null;
  const actions = mailActions();
  const message = mailMessage.value;
  const draft = mailDraft.value;
  const notice = mailNotice.value;
  // One layer for everything the mailbox has open, so a letter opens
  // beside the box rather than on top of it.
  return (
    <WornStage>
      <ArtMailWindow
        inbox={mailInbox.value}
        message={message}
        notice={notice?.text ?? null}
        writing={draft !== null}
        onSelect={readMail}
        onClaim={claimMail}
        onDelete={id => actions.remove(id)}
        onCloseLetter={closeMailMessage}
        // Pressing it again while a letter is open puts it away, which
        // is what the box's own control does.
        onWrite={() => (mailDraft.value ? closeLetter() : startLetter())}
        onReply={letter => startLetter(letter.senderName, replySubject(letter.subject))}
        onClose={dismissMail}
      />
      {draft && (
        <ArtMailWriteWindow
          draft={draft}
          bag={inventory.value.items.filter(item => item.slot?.area === 'bag')}
          onEdit={editLetter}
          onCarry={carryInLetter}
          onEmpty={emptyLetter}
          onSend={sendLetter}
          onClose={closeLetter}
        />
      )}
    </WornStage>
  );
}
