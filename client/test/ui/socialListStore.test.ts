/**
 * Friends and ignores: two lists, both replaced wholesale on the server's say
 * so, both acted on through an installed handler set — the same shape
 * `partyActions`/`guildActions` already have, since neither list has a sink
 * of its own to speak of.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addFriend,
  addIgnore,
  friends,
  ignored,
  removeFriend,
  removeIgnore,
  resetSocialLists,
  setFriendList,
  setIgnoreList,
  setSocialListActions,
} from '../../src/ui/socialListStore';

beforeEach(() => {
  resetSocialLists();
  setSocialListActions({
    addFriend: () => {},
    addFriendNamed: () => {},
    removeFriend: () => {},
    addIgnore: () => {},
    removeIgnore: () => {},
    refresh: () => {},
  });
});

describe('the lists', () => {
  it('start empty', () => {
    expect(friends.value).toEqual([]);
    expect(ignored.value).toEqual([]);
  });

  it('replace wholesale, which is the only way either ever changes', () => {
    setFriendList([{ networkId: 1, name: 'Ayla' }]);
    setFriendList([
      { networkId: 1, name: 'Ayla' },
      { networkId: 2, name: 'Borin' },
    ]);
    expect(friends.value.map(f => f.name)).toEqual(['Ayla', 'Borin']);
  });

  it('keep the friend list and the ignore list apart', () => {
    setFriendList([{ networkId: 1, name: 'Ayla' }]);
    setIgnoreList([{ networkId: 2, name: 'Borin' }]);
    expect(friends.value.map(f => f.name)).toEqual(['Ayla']);
    expect(ignored.value.map(f => f.name)).toEqual(['Borin']);
  });

  it('forgets both on reset', () => {
    setFriendList([{ networkId: 1, name: 'Ayla' }]);
    setIgnoreList([{ networkId: 2, name: 'Borin' }]);
    resetSocialLists();
    expect(friends.value).toEqual([]);
    expect(ignored.value).toEqual([]);
  });
});

describe('the installed actions', () => {
  it('routes an add by the local unit id the plus-menu was opened on', () => {
    const addF = vi.fn();
    const addI = vi.fn();
    setSocialListActions({
      addFriend: addF,
      addFriendNamed: () => {},
      removeFriend: () => {},
      addIgnore: addI,
      removeIgnore: () => {},
      refresh: () => {},
    });

    addFriend('mob-1');
    addIgnore('mob-1');

    expect(addF).toHaveBeenCalledWith('mob-1');
    expect(addI).toHaveBeenCalledWith('mob-1');
  });

  it('routes a remove by the network id the row already carries', () => {
    const removeF = vi.fn();
    const removeI = vi.fn();
    setSocialListActions({
      addFriend: () => {},
      addFriendNamed: () => {},
      removeFriend: removeF,
      addIgnore: () => {},
      removeIgnore: removeI,
      refresh: () => {},
    });

    removeFriend(11);
    removeIgnore(12);

    expect(removeF).toHaveBeenCalledWith(11);
    expect(removeI).toHaveBeenCalledWith(12);
  });

  it('does nothing before anything is installed, rather than throwing', () => {
    setSocialListActions({
      addFriend: () => {},
      addFriendNamed: () => {},
      removeFriend: () => {},
      addIgnore: () => {},
      removeIgnore: () => {},
      refresh: () => {},
    });
    expect(() => {
      addFriend('mob-1');
      removeFriend(1);
      addIgnore('mob-1');
      removeIgnore(1);
    }).not.toThrow();
  });
});
