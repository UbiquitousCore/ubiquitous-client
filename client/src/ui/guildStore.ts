/**
 * The guild roster, server-owned like the party's, plus founding (name
 * rules, level 10, persistence across restarts — `guild.roster` answers
 * `guild.rosterRequest` too, hence one on world entry). Leader leaving
 * dissolves the guild; no leadership transfer exists.
 */

import { signal } from '@preact/signals';

import type { GuildRoster, RosterMember } from '../net/GameConnection';

export type { GuildRoster, RosterMember };

/** The empty roster, which is also "you are in no guild". */
const NO_GUILD: GuildRoster = { guildId: null, guildName: null, members: [] };

export const guildRoster = signal<GuildRoster>(NO_GUILD);

/** An invite waiting on an answer from this player, if there is one. */
export interface GuildInvite {
  networkId: number;
  name: string;
  guildName: string;
}

export const guildInvite = signal<GuildInvite | null>(null);

/** Replace the roster whole, for changes and for `guild.rosterRequest` answers alike. */
export function setGuildRoster(roster: GuildRoster): void {
  guildRoster.value = roster;
  guildInvite.value = null;
  // A roster is the answer to founding as well as to joining, so it is what
  // takes the prompt down — not the button that asked.
  guildFoundPrompt.value = null;
}

/**
 * The stone whose use opened the found-a-guild prompt, or null when none is
 * open. Server-raised: a stone is the only route to founding, so the client
 * never opens this on its own.
 */
export const guildFoundPrompt = signal<number | null>(null);

export function setGuildFoundPrompt(entry: number | null): void {
  guildFoundPrompt.value = entry;
}

export function setGuildInvite(invite: GuildInvite | null): void {
  guildInvite.value = invite;
}

/** Forget what this client knew; the guild outlives the session, and `guild.rosterRequest` restores it. */
export function resetGuild(): void {
  guildRoster.value = NO_GUILD;
  guildInvite.value = null;
  guildFoundPrompt.value = null;
}

// ---------------------------------------------------------------------------
// What the window asks the game to do
// ---------------------------------------------------------------------------

export interface GuildActions {
  /** Found a guild with this character as its leader. */
  found(name: string): void;
  /** Invite whoever the HUD currently has targeted. Leader only, server-side. */
  inviteTarget(): void;
  /** Invite by name: only someone in sight can be asked, else nothing is sent. */
  inviteNamed(name: string): void;
  accept(): void;
  decline(): void;
  /** Leaving as the leader dissolves the guild for everyone. */
  leave(): void;
  kick(networkId: number): void;
  disband(): void;
  /** Ask for the roster again — the reconnect catch-up path. */
  refreshRoster(): void;
}

const NOTHING: GuildActions = {
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

let actions: GuildActions = NOTHING;

export function setGuildActions(next: GuildActions): void {
  actions = next;
}

export function guildActions(): GuildActions {
  return actions;
}
