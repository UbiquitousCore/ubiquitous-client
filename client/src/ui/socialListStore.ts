/** Friends and ignores: server-owned lists, no handshake, always replaced whole. */

import { signal } from '@preact/signals';

import type { SocialListMember } from '../net/GameConnection';

export type { SocialListMember };

export const friends = signal<readonly SocialListMember[]>([]);
export const ignored = signal<readonly SocialListMember[]>([]);

/** Replace the friend list wholesale, which is the only way it ever changes. */
export function setFriendList(members: SocialListMember[]): void {
  friends.value = members;
}

/** Replace the ignore list wholesale, which is the only way it ever changes. */
export function setIgnoreList(members: SocialListMember[]): void {
  ignored.value = members;
}

/** Forget both lists. Neither is persisted client-side across a session. */
export function resetSocialLists(): void {
  friends.value = [];
  ignored.value = [];
}

// ---------------------------------------------------------------------------
// What the plus-menu and social window ask the game to do.
// ---------------------------------------------------------------------------

export interface SocialListActions {
  /** Add the unit the plus-menu was opened on, by local unit id; `Game` resolves it. */
  addFriend(unitId: string): void;
  /** Remove a row already on the list, by the network id it carries — the same as `kick`. */
  removeFriend(networkId: number): void;
  /** Add a character by name, in the world or not. */
  addFriendNamed(name: string): void;
  addIgnore(unitId: string): void;
  removeIgnore(networkId: number): void;
  /** Ask for both lists again — who is online changes while nobody is looking. */
  refresh(): void;
}

const NOTHING: SocialListActions = {
  addFriend: () => {},
  removeFriend: () => {},
  addFriendNamed: () => {},
  addIgnore: () => {},
  removeIgnore: () => {},
  refresh: () => {},
};

let actions: SocialListActions = NOTHING;

export function setSocialListActions(next: SocialListActions): void {
  actions = next;
}

export function addFriend(unitId: string): void {
  actions.addFriend(unitId);
}

export function addFriendNamed(name: string): void {
  actions.addFriendNamed(name);
}

export function removeFriend(networkId: number): void {
  actions.removeFriend(networkId);
}

export function addIgnore(unitId: string): void {
  actions.addIgnore(unitId);
}

export function removeIgnore(networkId: number): void {
  actions.removeIgnore(networkId);
}

export function refreshSocialLists(): void {
  actions.refresh();
}
