/** Quest-move announcements (title + moved objective; yellow done / green
 * underway; fade after 8s; never clickable or pointer-taking). */

import type { JSX } from 'preact';
import { questMessages } from '../questStore';
import type { QuestMessage } from '../questStore';

const TONE: Record<QuestMessage['tone'], string> = {
  ready: 'text-row-ready',
  active: 'text-row-active',
};

/** A title or a banner leads; a progress line is indented under its title. */
const INDENT: Record<QuestMessage['kind'], string> = {
  title: '',
  progress: 'pl-3',
  accepted: '',
  completed: '',
};

export function QuestMessages(): JSX.Element | null {
  const messages = questMessages.value;
  if (messages.length === 0) return null;

  return (
    <div
      className="pointer-events-none absolute top-24 left-1/2 z-hud flex -translate-x-1/2 flex-col items-center gap-0.5 text-center"
      // Announced as one region so a screen reader is told about progress
      // once per change rather than re-reading every line still on screen.
      role="status"
      aria-live="polite"
    >
      {messages.map(message => (
        <p
          key={message.key}
          className={`m-0 font-chrome text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] sm:text-base ${TONE[message.tone]} ${INDENT[message.kind]}`}
        >
          {message.text}
        </p>
      ))}
    </div>
  );
}
