import { beforeEach, describe, expect, it, vi } from 'vitest';
import { guildHandlers, installGuildActions } from '../src/app/features/social/guild';
import type { GameConnection } from '../src/net/GameConnection';
import { setWorldUnits } from '../src/ui/hudStore';
import {
  guildActions,
  guildFoundPrompt,
  guildInvite,
  guildRoster,
  resetGuild,
  setGuildActions,
} from '../src/ui/guildStore';

const INERT = guildActions();

beforeEach(() => {
  resetGuild();
  setGuildActions(INERT);
  setWorldUnits([]);
});

describe('guildHandlers', () => {
  const h = guildHandlers();

  it('holds an invite with the guild’s name until a roster decides', () => {
    h.onGuildInvited!(2, 'Bran', 'Ravens');
    expect(guildInvite.value).toEqual({ networkId: 2, name: 'Bran', guildName: 'Ravens' });
    h.onGuildRoster!({ guildId: 'g', guildName: 'Ravens', members: [] });
    expect(guildInvite.value).toBeNull();
    expect(guildRoster.value.guildName).toBe('Ravens');
  });

  it('opens and closes the found-a-guild prompt as the server says', () => {
    h.onGuildFoundPrompt!(77);
    expect(guildFoundPrompt.value).toBe(77);
    h.onGuildRoster!({ guildId: 'g', guildName: 'Ravens', members: [] });
    expect(guildFoundPrompt.value).toBeNull();
  });
});

describe('installGuildActions', () => {
  function actions(target: number | null = 7) {
    const connection = {
      sendGuildFound: vi.fn(),
      sendGuildInvite: vi.fn(),
      sendGuildAccept: vi.fn(),
      sendGuildDecline: vi.fn(),
      sendGuildLeave: vi.fn(),
      sendGuildKick: vi.fn(),
      sendGuildDisband: vi.fn(),
      sendGuildRosterRequest: vi.fn(),
    };
    const asked = vi.fn();
    installGuildActions(
      connection as unknown as GameConnection,
      () => target ?? undefined,
      unitId => (unitId === '5' ? 55 : undefined),
      asked,
    );
    return { connection, asked, run: guildActions() };
  }

  const unit = (id: string, name: string) =>
    ({
      id,
      name,
      level: 1,
      health: 1,
      maxHealth: 1,
      mana: 0,
      maxMana: 0,
      disposition: 'friendly',
    }) as const;

  it('invites the HUD’s target and stamps the ask; nothing without one', () => {
    const { connection, asked, run } = actions();
    run.inviteTarget();
    expect(connection.sendGuildInvite).toHaveBeenCalledWith(7);
    expect(asked).toHaveBeenCalledTimes(1);

    const none = actions(null);
    none.run.inviteTarget();
    expect(none.connection.sendGuildInvite).not.toHaveBeenCalled();
    expect(none.asked).not.toHaveBeenCalled();
  });

  it('invites by name whoever is in sight under it, ignoring case and spaces', () => {
    setWorldUnits([unit('4', 'Cole'), unit('5', 'Bran')]);
    const { connection, asked, run } = actions();
    run.inviteNamed('  bRAN ');
    expect(connection.sendGuildInvite).toHaveBeenCalledWith(55);
    expect(asked).toHaveBeenCalledTimes(1);
  });

  it('asks nobody when the name is not in sight, or has no network id', () => {
    setWorldUnits([unit('4', 'Cole')]);
    const { connection, asked, run } = actions();
    run.inviteNamed('Bran');
    run.inviteNamed('Cole');
    expect(connection.sendGuildInvite).not.toHaveBeenCalled();
    expect(asked).not.toHaveBeenCalled();
  });

  it('passes the rest straight through', () => {
    const { connection, run } = actions();
    run.found('Ravens');
    run.accept();
    run.decline();
    run.leave();
    run.kick(3);
    run.disband();
    run.refreshRoster();
    expect(connection.sendGuildFound).toHaveBeenCalledWith('Ravens');
    expect(connection.sendGuildAccept).toHaveBeenCalled();
    expect(connection.sendGuildDecline).toHaveBeenCalled();
    expect(connection.sendGuildLeave).toHaveBeenCalled();
    expect(connection.sendGuildKick).toHaveBeenCalledWith(3);
    expect(connection.sendGuildDisband).toHaveBeenCalled();
    expect(connection.sendGuildRosterRequest).toHaveBeenCalled();
  });
});
