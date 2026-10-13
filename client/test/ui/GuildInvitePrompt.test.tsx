/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuildInvitePromptContainer } from '../../src/ui/GuildInvitePromptContainer';
import {
  resetGuild,
  setGuildActions,
  setGuildInvite,
  setGuildRoster,
} from '../../src/ui/guildStore';

const NOTHING = {
  found: () => {},
  inviteTarget: () => {},
  inviteNamed: () => {},
  accept: () => {},
  decline: () => {},
  leave: () => {},
  kick: () => {},
  disband: () => {},
  refreshRoster: () => {},
};

afterEach(() => {
  cleanup();
  resetGuild();
  setGuildActions(NOTHING);
});

function button(container: Element, label: string): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find(b => b.textContent === label)!;
}

describe('GuildInvitePromptContainer', () => {
  it('stays out of the way until someone invites you', () => {
    const { container } = render(<GuildInvitePromptContainer />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('names the inviter and the guild', () => {
    setGuildInvite({ networkId: 7, name: 'Bram', guildName: 'Ashvale' });
    const { container } = render(<GuildInvitePromptContainer />);
    expect(container.querySelector('[data-guild-invite="Bram"]')?.textContent).toMatch(
      /Bram invites you to «Ashvale»/,
    );
  });

  it.each([
    ['Accept', 'accept'],
    ['Decline', 'decline'],
  ] as const)('sends %s', (label, action) => {
    const spy = vi.fn();
    setGuildActions({ ...NOTHING, [action]: spy });
    setGuildInvite({ networkId: 7, name: 'Bram', guildName: 'Ashvale' });
    const { container } = render(<GuildInvitePromptContainer />);
    fireEvent.click(button(container, label));
    expect(spy).toHaveBeenCalled();
  });

  it('goes when the server answers, not when a button is pressed', () => {
    setGuildActions(NOTHING);
    setGuildInvite({ networkId: 7, name: 'Bram', guildName: 'Ashvale' });
    const { container } = render(<GuildInvitePromptContainer />);
    fireEvent.click(button(container, 'Accept'));
    // The request is out; the question is still standing.
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => setGuildRoster({ guildId: 'g1', guildName: 'Ashvale', members: [] }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
