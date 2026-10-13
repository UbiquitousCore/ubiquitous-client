import { logger } from '../../../core/log';
import type { ConnectionEvents, GameConnection } from '../../../net/GameConnection';
import { worldUnits } from '../../../ui/hudStore';
import {
  setGuildActions,
  setGuildFoundPrompt,
  setGuildInvite,
  setGuildRoster,
} from '../../../ui/guildStore';

const log = logger('guild');

/** The guild: invites, founding and the roster, which the server keeps across sessions. */
export function guildHandlers(): Partial<ConnectionEvents> {
  return {
    onGuildInviteSent: (_networkId, name) => log.info(`guild: invited ${name}`),
    onGuildInvited: (networkId, name, guildName) => setGuildInvite({ networkId, name, guildName }),
    onGuildFoundPrompt: entry => setGuildFoundPrompt(entry),
    onGuildDeclined: (_networkId, name) => log.info(`guild: ${name} declined`),
    // Ahead of this player's own empty roster, which is what takes them out.
    onGuildKicked: () => log.info('guild: removed from the guild'),
    onGuildRoster: roster => {
      setGuildRoster(roster);
      log.info(
        roster.guildId === null
          ? 'guild: not in a guild'
          : `guild: ${roster.members.length} member(s) of ${roster.guildName ?? 'a guild'}`,
      );
    },
  };
}

/**
 * The window's buttons, each one a request to the server. `asked` stamps the
 * request, so a silent refusal can be matched to it.
 */
export function installGuildActions(
  connection: GameConnection,
  targetNetworkId: () => number | undefined,
  networkIdOfUnit: (unitId: string) => number | undefined,
  asked: () => void,
): void {
  setGuildActions({
    found: name => connection.sendGuildFound(name),
    inviteNamed: name => {
      // The one asked is whoever is in sight under that name.
      const wanted = name.trim().toLowerCase();
      const unit = worldUnits.value.find(one => one.name?.toLowerCase() === wanted);
      const networkId = unit ? networkIdOfUnit(unit.id) : undefined;
      if (networkId === undefined) {
        log.warn(`guild: nobody called ${name} is in sight to ask`);
        return;
      }
      asked();
      connection.sendGuildInvite(networkId);
    },
    inviteTarget: () => {
      const networkId = targetNetworkId();
      if (networkId === undefined) return;
      asked();
      connection.sendGuildInvite(networkId);
    },
    accept: () => connection.sendGuildAccept(),
    decline: () => connection.sendGuildDecline(),
    leave: () => connection.sendGuildLeave(),
    kick: networkId => connection.sendGuildKick(networkId),
    disband: () => connection.sendGuildDisband(),
    refreshRoster: () => connection.sendGuildRosterRequest(),
  });
}
