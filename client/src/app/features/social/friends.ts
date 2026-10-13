import { logger } from '../../../core/log';
import type { PlayableKinds, ZoneInfo } from '../../../assets/types';
import type {
  ConnectionEvents,
  GameConnection,
  SocialListMember,
} from '../../../net/GameConnection';
import { noteChat } from '../../../ui/chatStore';
import { acknowledgeReport } from '../../../ui/reportStore';
import {
  friends,
  setFriendList,
  setIgnoreList,
  setSocialListActions,
} from '../../../ui/socialListStore';
import { friendsAdded } from './friendsAdded';

const log = logger('friends');

/** What naming a friend needs to look up; the wire carries only race and zone numbers. */
export interface FriendLookups {
  playableKinds(): Promise<PlayableKinds>;
  zoneAt(mapId: number, position: [number, number, number]): Promise<ZoneInfo | null>;
}

/** The race and zone a friend's numbers stand for; an offline friend carries none. */
export async function nameFriends(
  members: SocialListMember[],
  lookups: FriendLookups,
): Promise<SocialListMember[]> {
  const kinds = await lookups.playableKinds().catch(() => ({ races: [], classes: [] }));
  return Promise.all(
    members.map(async member => {
      if (!member.online) return member;
      const raceName = kinds.races.find(one => one.race === member.race)?.name ?? undefined;
      const zone =
        member.mapId !== undefined && member.position
          ? await lookups.zoneAt(member.mapId, member.position).catch(() => null)
          : null;
      return {
        ...member,
        ...(raceName ? { raceName } : {}),
        ...(zone?.name ? { zoneName: zone.name } : {}),
      };
    }),
  );
}

/** The line before the `/who` list. */
export function whoHeading(count: number): string {
  return count === 1 ? '1 player in the world:' : `${count} players in the world:`;
}

/** One player in the `/who` list: name, level, race and where. */
export function whoLine(player: SocialListMember): string {
  const who = [player.name, `level ${player.level ?? '?'}`, player.raceName]
    .filter(Boolean)
    .join(', ');
  return player.zoneName ? `${who} - ${player.zoneName}` : who;
}

/**
 * Friends and ignores. Both lists are the server's, replaced whole; what the
 * class holds is the two facts a list handler needs about the request before
 * it.
 */
export class Friends {
  /** Set by asking to add one, so only the list that answers it announces who is new. */
  private asked = false;
  /** Counts friend lists, so a slow naming of an older one is dropped. */
  private naming = 0;

  constructor(
    private readonly connection: GameConnection,
    private readonly networkIdOfUnit: (unitId: string) => number | undefined,
    private readonly lookups: FriendLookups,
    private readonly stampAsked: () => void,
  ) {}

  handlers(): Partial<ConnectionEvents> {
    return {
      onFriendList: members => {
        if (this.asked) {
          this.asked = false;
          for (const name of friendsAdded(friends.peek(), members)) {
            noteChat({ channel: 'notice', sender: '', text: `${name} was added to your friends.` });
          }
        }
        setFriendList(members);
        const generation = ++this.naming;
        void nameFriends(members, this.lookups).then(named => {
          if (generation === this.naming) setFriendList(named);
        });
        log.info(`friends: ${members.length}`);
      },
      onIgnoreList: members => {
        setIgnoreList(members);
        log.info(`ignored: ${members.length}`);
      },
      onWhoList: players => {
        void nameFriends(players, this.lookups).then(named => {
          noteChat({ channel: 'notice', sender: '', text: whoHeading(named.length) });
          for (const player of named)
            noteChat({ channel: 'notice', sender: '', text: whoLine(player) });
        });
      },
      // The compose form confirms only once the server has persisted the report.
      onReportAcknowledged: () => acknowledgeReport(),
    };
  }

  /** `unitId` is the local unit id the plus-menu was opened on. */
  installActions(): void {
    setSocialListActions({
      addFriend: unitId => {
        const networkId = this.networkIdOfUnit(unitId);
        if (networkId === undefined) return;
        this.asked = true;
        this.stampAsked();
        this.connection.sendFriendAdd(networkId);
      },
      removeFriend: networkId => this.connection.sendFriendRemove(networkId),
      addFriendNamed: name => {
        this.asked = true;
        this.stampAsked();
        this.connection.sendFriendAddNamed(name);
      },
      addIgnore: unitId => {
        const networkId = this.networkIdOfUnit(unitId);
        if (networkId !== undefined) this.connection.sendIgnoreAdd(networkId);
      },
      removeIgnore: networkId => this.connection.sendIgnoreRemove(networkId),
      refresh: () => this.connection.sendSocialListRequest(),
    });
  }
}
