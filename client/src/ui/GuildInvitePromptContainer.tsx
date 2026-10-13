/**
 * "X invites you to «Y»" — the prompt an invite raises on its own.
 *
 * An invite arrives unasked, so it cannot live inside a window the player has
 * to have open already. Neither button dismisses it: both are requests, and
 * `guild.roster` takes it down whether it was accepted or declined.
 */

import type { JSX } from 'preact';

import { Button } from './components/Button';
import { Dialog } from './components/Dialog';
import { guildActions, guildInvite } from './guildStore';

export function GuildInvitePromptContainer(): JSX.Element | null {
  const invite = guildInvite.value;
  if (invite === null) return null;
  const actions = guildActions();

  return (
    <Dialog label="Guild invitation" size="md">
      <h2
        className="m-0 text-center font-title text-sm text-parchment-100"
        data-guild-invite={invite.name}
      >
        {invite.name} invites you to «{invite.guildName}».
      </h2>
      <p className="m-0 pt-2 text-center text-tiny text-ink-400">
        Leaving a guild later is your own to do, and leaving as its leader dissolves it for
        everyone.
      </p>
      <div className="flex justify-center gap-3 pt-4">
        <Button size="lg" variant="secondary" onClick={() => actions.decline()}>
          Decline
        </Button>
        <Button size="lg" variant="primary" onClick={() => actions.accept()}>
          Accept
        </Button>
      </div>
    </Dialog>
  );
}
