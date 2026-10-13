/**
 * "Name your guild", raised by `guild.foundPrompt` and closed by the
 * founding roster. A refusal after Create keeps the name in place.
 */

import type { JSX } from 'preact';
import { useState } from 'preact/hooks';

import { Button } from './components/Button';
import { Dialog } from './components/Dialog';
import { guildActions, guildFoundPrompt, setGuildFoundPrompt } from './guildStore';
import { lastRefusal } from './protocolNotices';

/** What the server refuses a blank or over-long name at. */
const MAX_NAME = 16;

export function GuildFoundPromptContainer(): JSX.Element | null {
  const entry = guildFoundPrompt.value;
  const [name, setName] = useState('');
  const [askedAt, setAskedAt] = useState<number | null>(null);
  if (entry === null) return null;

  const refusal = lastRefusal.value;
  const refused = refusal !== null && askedAt !== null && refusal.at >= askedAt ? refusal : null;

  const create = (): void => {
    setAskedAt(Date.now());
    guildActions().found(name.trim());
  };

  const cancel = (): void => {
    setAskedAt(null);
    setName('');
    setGuildFoundPrompt(null);
  };

  return (
    <Dialog label="Found a guild" size="md">
      <h2 className="m-0 text-center font-title text-sm text-parchment-100">Name your guild</h2>
      <label className="flex items-center gap-2 pt-3 text-xs text-parchment-200">
        <span className="shrink-0">Name</span>
        <input
          type="text"
          value={name}
          maxLength={MAX_NAME}
          data-guild-name
          autoFocus
          onInput={event => setName(event.currentTarget.value)}
          className={
            'min-w-0 flex-1 rounded-chrome-sm border border-brass-600 bg-chrome-950 px-2 py-1 ' +
            'font-chrome text-xs text-parchment-200 shadow-recess' +
            'focus-visible:border-brass-400 focus-visible:outline-none'
          }
        />
      </label>
      {refused !== null && (
        <p data-guild-found-refusal className="m-0 pt-2 text-center text-tiny text-status-error">
          {refused.reason}
        </p>
      )}
      <div className="flex justify-center gap-3 pt-4">
        <Button size="lg" variant="secondary" onClick={cancel}>
          Cancel
        </Button>
        <Button size="lg" variant="primary" disabled={name.trim() === ''} onClick={create}>
          Create
        </Button>
      </div>
    </Dialog>
  );
}
