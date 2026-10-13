/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GuildFoundPromptContainer } from '../../src/ui/GuildFoundPromptContainer';
import {
  resetGuild,
  setGuildActions,
  setGuildFoundPrompt,
  setGuildRoster,
} from '../../src/ui/guildStore';
import { noteRefusal } from '../../src/ui/protocolNotices';
import { clearRefusals } from '../helpers/stores';

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
  clearRefusals();
  setGuildActions(NOTHING);
});

function button(container: Element, label: string): HTMLButtonElement {
  return [...container.querySelectorAll('button')].find(b => b.textContent === label)!;
}

function type(container: Element, value: string): void {
  fireEvent.input(container.querySelector('[data-guild-name]')!, { target: { value } });
}

describe('GuildFoundPromptContainer', () => {
  it('stays shut until a stone opens it', () => {
    const { container } = render(<GuildFoundPromptContainer />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('will not found a guild with no name', () => {
    setGuildFoundPrompt(3800);
    const { container } = render(<GuildFoundPromptContainer />);
    expect(button(container, 'Create').disabled).toBe(true);
    type(container, '  ');
    expect(button(container, 'Create').disabled).toBe(true);
    type(container, 'Ironclad');
    expect(button(container, 'Create').disabled).toBe(false);
  });

  it('founds under the typed name, trimmed', () => {
    const found = vi.fn();
    setGuildActions({ ...NOTHING, found });
    setGuildFoundPrompt(3800);
    const { container } = render(<GuildFoundPromptContainer />);
    type(container, '  Ironclad  ');
    fireEvent.click(button(container, 'Create'));
    expect(found).toHaveBeenCalledWith('Ironclad');
  });

  it('goes when the roster answers, not when Create is pressed', () => {
    setGuildFoundPrompt(3800);
    const { container } = render(<GuildFoundPromptContainer />);
    type(container, 'Ironclad');
    fireEvent.click(button(container, 'Create'));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    act(() => setGuildRoster({ guildId: 'g1', guildName: 'Ironclad', members: [] }));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('keeps the name on screen with the reason it was refused', () => {
    setGuildFoundPrompt(3800);
    const { container } = render(<GuildFoundPromptContainer />);
    type(container, 'Ironclad');
    fireEvent.click(button(container, 'Create'));
    act(() => noteRefusal('invalid_guild', 'That name is taken.'));

    expect(container.querySelector('[data-guild-found-refusal]')?.textContent).toBe(
      'That name is taken.',
    );
    expect(container.querySelector<HTMLInputElement>('[data-guild-name]')?.value).toBe('Ironclad');
  });

  it('ignores a refusal that was already on screen before Create', () => {
    // `lastRefusal` is shared by every system, so an older one is not ours.
    noteRefusal('invalid_trade', 'Something else went wrong.');
    setGuildFoundPrompt(3800);
    const { container } = render(<GuildFoundPromptContainer />);
    expect(container.querySelector('[data-guild-found-refusal]')).toBeNull();
  });

  it('cancels without asking the server anything', () => {
    const found = vi.fn();
    setGuildActions({ ...NOTHING, found });
    setGuildFoundPrompt(3800);
    const { container } = render(<GuildFoundPromptContainer />);
    fireEvent.click(button(container, 'Cancel'));
    expect(found).not.toHaveBeenCalled();
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
