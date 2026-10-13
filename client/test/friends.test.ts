import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Friends,
  nameFriends,
  whoHeading,
  whoLine,
  type FriendLookups,
} from '../src/app/features/social/friends';
import type { GameConnection, SocialListMember } from '../src/net/GameConnection';
import { chatLines, clearChat } from '../src/ui/chatStore';
import { beginReport, closeReport, reportSent } from '../src/ui/reportStore';
import {
  friends,
  ignored,
  resetSocialLists,
  setSocialListActions,
  addFriend,
  addIgnore,
  removeFriend,
  removeIgnore,
  refreshSocialLists,
} from '../src/ui/socialListStore';

const lookups = (over: Partial<FriendLookups> = {}): FriendLookups => ({
  playableKinds: async () =>
    ({
      races: [{ race: 2, name: 'Elf' }],
      classes: [],
    }) as never,
  zoneAt: async mapId => ({ id: 1, name: `Zone ${mapId}` }) as never,
  ...over,
});

const online = (networkId: number, name: string, extra: Partial<SocialListMember> = {}) =>
  ({
    networkId,
    name,
    online: true,
    race: 2,
    mapId: 3,
    position: [0, 0, 0],
    ...extra,
  }) as SocialListMember;

describe('nameFriends', () => {
  it('names the race and zone of friends who are online', async () => {
    const [one] = await nameFriends([online(1, 'Ayla')], lookups());
    expect(one).toMatchObject({ raceName: 'Elf', zoneName: 'Zone 3' });
  });

  it('leaves an offline friend as the server sent them', async () => {
    const offline = { networkId: 2, name: 'Bran', online: false } as SocialListMember;
    expect(await nameFriends([offline], lookups())).toEqual([offline]);
  });

  it('gives no race name for a race the build does not know', async () => {
    const [one] = await nameFriends([online(1, 'Ayla', { race: 99 })], lookups());
    expect(one.raceName).toBeUndefined();
    expect(one.zoneName).toBe('Zone 3');
  });

  it('survives both lookups failing', async () => {
    const [one] = await nameFriends(
      [online(1, 'Ayla')],
      lookups({
        playableKinds: () => Promise.reject(new Error('no table')),
        zoneAt: () => Promise.reject(new Error('no zones')),
      }),
    );
    expect(one).toEqual(online(1, 'Ayla'));
  });

  it('does not look up a zone for a friend with no place', async () => {
    const zoneAt = vi.fn();
    const [one] = await nameFriends(
      [online(1, 'Ayla', { mapId: undefined, position: undefined })],
      lookups({ zoneAt }),
    );
    expect(zoneAt).not.toHaveBeenCalled();
    expect(one.zoneName).toBeUndefined();
  });
});

describe('Friends', () => {
  const noticeTexts = () =>
    chatLines
      .peek()
      .filter(m => m.channel === 'notice')
      .map(m => m.text);

  function setup(over: Partial<FriendLookups> = {}) {
    const connection = {
      sendFriendAdd: vi.fn(),
      sendFriendRemove: vi.fn(),
      sendIgnoreAdd: vi.fn(),
      sendIgnoreRemove: vi.fn(),
      sendSocialListRequest: vi.fn(),
    };
    const stamp = vi.fn();
    const f = new Friends(
      connection as unknown as GameConnection,
      unitId => (unitId === '5' ? 55 : undefined),
      lookups(over),
      stamp,
    );
    f.installActions();
    return { f, h: f.handlers(), connection, stamp };
  }

  beforeEach(() => {
    resetSocialLists();
    clearChat();
    setSocialListActions({
      addFriend: () => {},
      addFriendNamed: () => {},
      removeFriend: () => {},
      addIgnore: () => {},
      removeIgnore: () => {},
      refresh: () => {},
    });
  });

  it('shows the list at once, then again with race and zone names', async () => {
    const { h } = setup();
    h.onFriendList!([online(1, 'Ayla')]);
    expect(friends.value[0].raceName).toBeUndefined();
    await vi.waitFor(() => expect(friends.value[0].raceName).toBe('Elf'));
  });

  it('announces who is new only on the list that answers an add', () => {
    const { h, connection, stamp } = setup();
    h.onFriendList!([online(1, 'Ayla')]);
    expect(noticeTexts()).toEqual([]);

    addFriend('5');
    expect(connection.sendFriendAdd).toHaveBeenCalledWith(55);
    expect(stamp).toHaveBeenCalledTimes(1);
    h.onFriendList!([online(1, 'Ayla'), online(2, 'Bran')]);
    expect(noticeTexts()).toEqual(['Bran was added to your friends.']);

    h.onFriendList!([online(1, 'Ayla'), online(2, 'Bran'), online(3, 'Cole')]);
    expect(noticeTexts()).toHaveLength(1);
  });

  it('asks for nothing when the unit has no network id', () => {
    const { connection, stamp } = setup();
    addFriend('9');
    addIgnore('9');
    expect(connection.sendFriendAdd).not.toHaveBeenCalled();
    expect(connection.sendIgnoreAdd).not.toHaveBeenCalled();
    expect(stamp).not.toHaveBeenCalled();
  });

  it('drops the naming of an older list that finishes after a newer one', async () => {
    let release!: () => void;
    const slow = new Promise<void>(resolve => (release = resolve));
    let first = true;
    const { h } = setup({
      playableKinds: async () => {
        if (first) {
          first = false;
          await slow;
          return { races: [{ race: 2, name: 'Old' }], classes: [] } as never;
        }
        return { races: [{ race: 2, name: 'New' }], classes: [] } as never;
      },
    });
    h.onFriendList!([online(1, 'Ayla')]);
    h.onFriendList!([online(1, 'Ayla')]);
    await vi.waitFor(() => expect(friends.value[0].raceName).toBe('New'));
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(friends.value[0].raceName).toBe('New');
  });

  it('confirms a report only when the server acknowledges it', () => {
    const { h } = setup();
    beginReport('5', 'Bran');
    expect(reportSent.value).toBe(false);
    h.onReportAcknowledged!();
    expect(reportSent.value).toBe(true);
    closeReport();
  });

  it('keeps the ignore list as sent, and passes requests through', () => {
    const { h, connection } = setup();
    h.onIgnoreList!([online(4, 'Dara')]);
    expect(ignored.value.map(m => m.name)).toEqual(['Dara']);
    removeFriend(1);
    addIgnore('5');
    removeIgnore(4);
    refreshSocialLists();
    expect(connection.sendFriendRemove).toHaveBeenCalledWith(1);
    expect(connection.sendIgnoreAdd).toHaveBeenCalledWith(55);
    expect(connection.sendIgnoreRemove).toHaveBeenCalledWith(4);
    expect(connection.sendSocialListRequest).toHaveBeenCalled();
  });
});

describe('the /who list', () => {
  it('names each player with their level, race and zone, as far as is known', () => {
    expect(
      whoLine({
        networkId: 1,
        name: 'Kael',
        online: true,
        level: 12,
        raceName: 'Elf',
        zoneName: 'High Forest',
      }),
    ).toBe('Kael, level 12, Elf - High Forest');
    expect(whoLine({ networkId: 2, name: 'Mira', online: true, level: 3 })).toBe('Mira, level 3');
    expect(whoHeading(1)).toBe('1 player in the world:');
    expect(whoHeading(4)).toBe('4 players in the world:');
  });
});
