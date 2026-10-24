/** The named JSON messages the client and server exchange. Changing a name
 * here changes the protocol, not just this file. */

/** Every message on the wire, both directions. */
export interface Envelope {
  type: string;
  /** Per-connection, monotonically increasing. */
  sequence: number;
  payload: Record<string, unknown>;
}

/** Client to server. */
export const OUTBOUND = {
  /** A sign of life, so a quiet connection is not taken for a dead one. */
  ping: 'session.ping',
  login: 'account.login',
  logout: 'account.logout',
  listCharacters: 'characters.list',
  chooseCharacter: 'characters.choose',
  createCharacter: 'characters.create',
  deleteCharacter: 'characters.delete',
  characterOutfit: 'characters.outfit',
  /** Out of the world and back to the character list, on the same connection. */
  returnToCharacters: 'characters.return',
  /** Enter without authenticating (`dev.`): not a permanent part of the protocol. */
  enterWorld: 'dev.enterWorld',
  /** Ask the server to spawn stress-test bots (`dev.`): not a permanent part of the protocol. */
  stressTest: 'dev.stressTest',
  move: 'player.move',
  chat: 'player.chat',
  /** `{ targetId, text }`, `targetId` spelled as for trade and duel. */
  whisper: 'chat.whisper',
  emote: 'player.emote',
  targetChange: 'target.change',
  npcTalk: 'npc.talk',
  npcPickOption: 'npc.pickOption',
  npcPreviousPage: 'npc.previousPage',
  askQuestMark: 'quest.checkMark',
  questList: 'quest.list',
  questAccept: 'quest.accept',
  questComplete: 'quest.complete',
  questDestroy: 'quest.destroy',
  questShare: 'quest.share',
  questShareAnswer: 'quest.shareAnswer',
  questRefreshStatuses: 'quest.refreshStatuses',
  busRequest: 'bus.request',
  busConfirm: 'bus.confirm',
  npcTeleportAsk: 'npc.teleportAsk',
  auctioneerOpen: 'npc.auctioneerOpen',
  vendorOpen: 'npc.vendorOpen',
  vendorBuy: 'npc.vendorBuy',
  vendorSell: 'npc.vendorSell',
  /** Open access: no auctioneer needed server-side, so no network id. */
  auctionList: 'auction.list',
  auctionBrowse: 'auction.browse',
  auctionCancel: 'auction.cancel',
  auctionBid: 'auction.bid',
  auctionBuyout: 'auction.buyout',
  /** Move, swap or merge; the server decides from the destination. */
  inventoryMove: 'inventory.move',
  inventoryEquip: 'inventory.equip',
  inventoryUse: 'inventory.use',
  inventoryDestroy: 'inventory.destroy',
  inventorySplit: 'inventory.split',
  inventorySort: 'inventory.sort',
  inventoryOpenBank: 'inventory.openBank',
  inventoryUpgrade: 'inventory.expand',
  /** The matching close is required: the container stays busy, unopenable by anyone, until it arrives. */
  lootOpen: 'loot.open',
  lootClose: 'loot.close',
  lootTake: 'loot.take',
  /** Its own message rather than a magic slot; see `net/loot`. */
  lootTakeMoney: 'loot.takeMoney',
  /** Mail: the recipient by character name (may be offline), everything else by mail id. */
  mailOpen: 'mail.open',
  mailSend: 'mail.send',
  mailRead: 'mail.read',
  mailClaim: 'mail.claim',
  mailDelete: 'mail.delete',
  /** Each keeps the server's `targetId` or `networkId` spelling, even where they differ. */
  partyInvite: 'party.invite',
  partyAccept: 'party.accept',
  partyDecline: 'party.decline',
  partyLeave: 'party.leave',
  partyKick: 'party.kick',
  /** Any member but the leader: ask the rest whether someone should go. */
  partyVoteKick: 'party.voteKick',
  /** The answer to the vote this member was asked in. */
  partyVoteKickAnswer: 'party.voteKickAnswer',
  guildFound: 'guild.found',
  guildInvite: 'guild.invite',
  guildAccept: 'guild.accept',
  guildDecline: 'guild.decline',
  guildLeave: 'guild.leave',
  guildKick: 'guild.kick',
  guildDisband: 'guild.disband',
  guildRosterRequest: 'guild.rosterRequest',
  /** `{ targetId }`; no accept handshake. */
  friendAdd: 'social.friendAdd',
  friendRemove: 'social.friendRemove',
  ignoreAdd: 'social.ignoreAdd',
  ignoreRemove: 'social.ignoreRemove',
  /** Re-fetch both lists; no payload; answered by `INBOUND.socialListUpdated`. */
  socialListRequest: 'social.friendList',
  /** Everyone in the world; no payload; answered by `INBOUND.socialWhoList`. */
  socialWho: 'social.who',
  /** `{ targetId, reason }`; answered by `INBOUND.reportAcknowledged` or `protocol.error`. */
  socialReport: 'social.report',
  tradeRequest: 'trade.request',
  tradeAccept: 'trade.accept',
  tradeDecline: 'trade.decline',
  tradeOffer: 'trade.offer',
  tradeConfirm: 'trade.confirm',
  tradeCancel: 'trade.cancel',
  duelChallenge: 'duel.challenge',
  duelAccept: 'duel.accept',
  duelDecline: 'duel.decline',
  duelForfeit: 'duel.forfeit',
  pvpFlagSet: 'pvp.flagSet',
  /** Buy one more rank of a talent, by the talent's own id. */
  talentLearn: 'talent.learn',
  /** Enter this session's instance copy; answered only by the usual world-entry sequence. */
  instanceEnter: 'instance.enter',
  /** End every dungeon copy this player owns, so the next visit starts over. */
  dungeonRestart: 'dungeon.restart',
  /** Normal or Legend for every owned dungeon; refused while anyone is inside or from a non-leader. */
  dungeonChooseMode: 'dungeon.chooseMode',
  castSpell: 'spell.request',
  cancelSpell: 'spell.abort',
  /** An administrator's free move to any map and place; answered like any other arrival. */
  adminTeleport: 'admin.teleport',
  adminGiveItem: 'admin.giveItem',
  adminGiveGold: 'admin.giveGold',
  adminSetLevel: 'admin.setLevel',
  adminSetInvincible: 'admin.setInvincible',
  adminLearnSpells: 'admin.learnSpells',
  /** Get down off the mount; answered by the body's `mount` value going to 0. */
  dismount: 'mount.dismount',
  attackEngage: 'attack.engage',
  assignActionBar: 'actionBar.assign',
  /** Ask a static object bound to a held quest for its item; answered by the usual item and quest messages. */
  staticObjectInteract: 'staticobject.interact',
  /** Open a summon stone; answered by `summonOpened`. */
  summonOpen: 'summon.open',
  /** Ask a party member to come to the stone; `summonResult` says it was asked. */
  summonRequest: 'summon.request',
  /** Yes or no to `summonAsked`; a yes moves this player to the summoner. */
  summonAnswer: 'summon.answer',
  /** Release spirit when dead, or "send me to a graveyard" when alive; `player.revived` follows a release. */
  playerUnstuck: 'player.unstuck',
  /** Operator only (others get `protocol.error`); `{ radius }` optional. Asked for, never pushed. */
  navigationRequest: 'navigation.request',
} as const;

/** Server to client. */
export const INBOUND = {
  pong: 'session.pong',
  loginResult: 'account.loginResult',
  loggedOut: 'account.loggedOut',
  adminInvincible: 'admin.invincible',
  characters: 'characters.listed',
  characterChosen: 'characters.chosen',
  characterCreated: 'characters.created',
  characterDeleted: 'characters.deleted',
  characterOutfitted: 'characters.outfitted',
  charactersReturned: 'characters.returned',
  worldLoading: 'world.loading',
  worldEntered: 'world.entered',
  playerTeleported: 'player.teleported',
  moveAccepted: 'move.accepted',
  entitySpawned: 'entity.spawned',
  entityMoved: 'entity.moved',
  entityRemoved: 'entity.removed',
  entityLootable: 'entity.lootable',
  /**
   * A gated way is passable: walls in the box stop blocking, or the named
   * models leave the world. `announce` is false for a run already under way.
   */
  dungeonBarrierOpened: 'dungeon.barrierOpened',
  dungeonRestarted: 'dungeon.restarted',
  /** The dungeon mode now in force, and how many live copies the change ended. */
  dungeonModeChosen: 'dungeon.modeChosen',
  /** Spawn-table objects to leave out, by position; sent on world entry, empty when none. */
  worldHiddenObjects: 'world.hiddenObjects',
  entityAppearanceChanged: 'entity.appearanceChanged',
  chat: 'chat.received',
  /** `{ senderNetworkId, senderName, text }`. */
  whisperReceived: 'chat.whisperReceived',
  /** Echoed once delivered (`{ targetNetworkId, targetName, text }`); offline and self whispers are refused. */
  whisperSent: 'chat.whisperSent',
  emotePerformed: 'emote.performed',
  entityValuesChanged: 'entity.updated',
  playerValuesChanged: 'player.updated',
  playerExpGained: 'player.expGained',
  playerDeath: 'player.death',
  targetChanged: 'target.changed',
  npcConversation: 'npc.gossip',
  npcChoiceResult: 'npc.choiceResult',
  questStatuses: 'quest.statuses',
  questListUpdated: 'quest.listUpdated',
  questUpdated: 'quest.updated',
  questRemoved: 'quest.removed',
  questShareOffered: 'quest.shareOffered',
  questShareResult: 'quest.shareResult',
  questLog: 'quest.log',
  questDetails: 'quest.details',
  busFare: 'bus.fare',
  teleportResult: 'npc.teleportAnswer',
  vendorItems: 'npc.vendorItems',
  vendorBuyResult: 'npc.buyResult',
  vendorSellResult: 'npc.sellResult',
  /** The answer to listing. `id` is the new listing, present on success. */
  auctionListed: 'auction.listed',
  /** The active listings just asked for, newest first. */
  auctionOpened: 'auction.opened',
  auctionListings: 'auction.listings',
  /** The answer to cancelling your own listing. */
  auctionCancelled: 'auction.cancelled',
  /** The answer to a bid, with the new current price. */
  auctionBidPlaced: 'auction.bidPlaced',
  /** The answer to a buyout, with the price actually paid. */
  auctionBought: 'auction.bought',
  /** Only in answer to `navigationRequest`; an unbaked map answers with no polygons. */
  navigationGround: 'navigation.ground',
  itemRefused: 'item.refused',
  /** The whole storage, which arrives once, when the character enters. */
  inventoryUpdated: 'inventory.updated',
  inventoryItemAdded: 'inventory.itemAdded',
  inventoryItemRemoved: 'inventory.itemRemoved',
  inventoryItemMoved: 'inventory.itemMoved',
  inventoryItemsSwapped: 'inventory.itemsSwapped',
  inventoryStackChanged: 'inventory.stackChanged',
  inventoryEquipResult: 'inventory.equipResult',
  inventorySorted: 'inventory.sorted',
  inventoryCapacityChanged: 'inventory.capacityChanged',
  inventoryBankOpen: 'inventory.bankOpen',
  inventoryBankUpdated: 'inventory.bankUpdated',
  /** What a body holds, in answer to opening it. */
  lootContents: 'loot.contents',
  /** Somebody has a container open, or has just let go of it. */
  lootBusy: 'loot.busy',
  lootSlotEmptied: 'loot.slotEmptied',
  /** Whether a mailbox opened; a successful open also brings `mailInbox`. */
  mailOpened: 'mail.opened',
  /** The party members a summon stone can call, for the stone's window. */
  summonOpened: 'summon.opened',
  /** A party member is summoning this player. */
  summonAsked: 'summon.asked',
  /** What became of a summon this player asked for. */
  summonResult: 'summon.result',
  /** A member tried to summon this player, who is below the dungeon's level. */
  summonTooLow: 'summon.tooLow',
  /** The full inbox, sent alongside a successful `mailOpened`. */
  mailInbox: 'mail.inbox',
  /** The full body of one message, in answer to reading it. */
  mailMessage: 'mail.message',
  /** The send outcome, to the sender only. */
  mailSent: 'mail.sent',
  /** The claim outcome, including what was actually granted. */
  mailClaimed: 'mail.claimed',
  /** The delete outcome. */
  mailDeleted: 'mail.deleted',
  mailUnread: 'mail.unread',
  /**
   * Refusals with no dedicated result: `{ code, reason }`, `reason` for
   * people. Most party/guild/trade/duel failures arrive here.
   */
  protocolError: 'protocol.error',
  /** To the inviter only: the party invite reached the named target. */
  partyInviteSent: 'party.inviteSent',
  /** To the invitee only: who wants them in a party. */
  partyInvited: 'party.invited',
  /** To the original inviter only: the target said no. */
  partyDeclined: 'party.declined',
  /** To a kicked member only, ahead of the empty roster that follows. */
  partyKicked: 'party.kicked',
  /** The full membership, or the empty "you are in no party" shape. */
  partyRoster: 'party.roster',
  /** To every member asked: another member wants someone removed. */
  partyVoteKickAsked: 'party.voteKickAsked',
  /** To the asker and the others asked: one member said no. */
  partyVoteKickRefused: 'party.voteKickRefused',
  /** To the asker and everyone asked: the vote is over. */
  partyVoteKickEnded: 'party.voteKickEnded',
  /** To the inviter only: the guild invite reached the named target. */
  guildInviteSent: 'guild.inviteSent',
  /** To the invitee only: who invited them, and into which guild. */
  guildInvited: 'guild.invited',
  /** Answering a guild stone's use: ask what to call the guild. */
  guildFoundPrompt: 'guild.foundPrompt',
  /** To the original inviter only: the target said no. */
  guildDeclined: 'guild.declined',
  /** To a kicked member only, ahead of the empty roster that follows. */
  guildKicked: 'guild.kicked',
  /** The full membership, or the empty "you are in no guild" shape. */
  guildRoster: 'guild.roster',
  /**
   * Both lists, full replace, answering any friend/ignore request:
   * `{ friends, ignored }` of `{ networkId, name }`.
   */
  socialListUpdated: 'social.listUpdated',
  /** `{ players }`, everyone in the world, shaped as a friend-list row. */
  socialWhoList: 'social.whoList',
  /** The report was persisted. No payload. */
  reportAcknowledged: 'social.reportAcknowledged',
  /** To the proposed-to player: someone wants to trade. */
  tradeRequested: 'trade.requested',
  /** To the proposer: the target turned it down. */
  tradeDeclined: 'trade.declined',
  /** To both sides: the trade window is open. */
  tradeStarted: 'trade.started',
  /** To both sides, after any offer or confirm change — each its own view. */
  tradeUpdated: 'trade.updated',
  /** To both sides: it ended with no exchange, carrying why. */
  tradeCancelled: 'trade.cancelled',
  /** To both sides: the exchange happened; the item/gold deltas precede it. */
  tradeCompleted: 'trade.completed',
  /** To the challenged player, on their own next tick rather than at once. */
  duelRequested: 'duel.challenged',
  /** To the challenger: declined, or the challenge expired unanswered. */
  duelDeclined: 'duel.declined',
  /** To both sides: the duel is on. */
  duelStarted: 'duel.started',
  /** To both sides, each with its own win/loss/forfeit reason and health. */
  duelEnded: 'duel.ended',
  /** To the caller: the open-world PvP flag now reads this way. */
  pvpFlagChanged: 'pvp.flagChanged',
  /** Points left to spend and every bought rank: on entry, on a level that earns a point, after each change. */
  talentState: 'talent.state',
  /** A learn was refused, and why. */
  talentRefused: 'talent.refused',
  spellBookArrived: 'spell.book',
  /** Spells a used item just taught; the new book follows. */
  spellLearned: 'spell.learned',
  spellActionSlot: 'actionBar.assigned',
  spellCasting: 'spell.casting',
  spellReleased: 'spell.released',
  cooldownStarted: 'spell.cooldownStarted',
  spellFailed: 'spell.failed',
  spellInterrupted: 'spell.interrupted',
  attackSwingResult: 'attack.swingResult',
  attackMeleeStart: 'attack.meleeStart',
  attackRangeStart: 'attack.rangeStart',
  attackHalted: 'attack.halted',
  attackShotFired: 'attack.shotFired',
  attackShotResult: 'attack.shotResult',
  attackEnterCombat: 'attack.enterCombat',
  attackExitCombat: 'attack.exitCombat',
  auraApplied: 'aura.applied',
  auraEnded: 'aura.ended',
  spellOutcome: 'spell.outcome',
  unitDied: 'unit.died',
  playerRevived: 'player.revived',
} as const;

export class ProtocolError extends Error {}

export function encode(
  type: string,
  sequence: number,
  payload: Record<string, unknown> = {},
): string {
  const envelope: Envelope = { type, sequence, payload };
  return JSON.stringify(envelope);
}

/**
 * Strict: a malformed envelope is a bug on one side, and tolerating it is how
 * a protocol drifts. The one leniency, a missing payload becoming `{}`,
 * matches the server's own reader.
 */
export function decode(raw: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new ProtocolError(`message is not valid JSON: ${(cause as Error).message}`);
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ProtocolError('message must be a JSON object');
  }

  const record = parsed as Record<string, unknown>;
  const { type, sequence, payload } = record;

  if (typeof type !== 'string' || type === '') {
    throw new ProtocolError('message.type must be a non-empty string');
  }
  if (typeof sequence !== 'number' || !Number.isInteger(sequence) || sequence < 0) {
    throw new ProtocolError(`message.sequence must be a non-negative integer (${type})`);
  }
  if (
    payload !== undefined &&
    payload !== null &&
    (typeof payload !== 'object' || Array.isArray(payload))
  ) {
    throw new ProtocolError(`message.payload must be an object when present (${type})`);
  }

  return {
    type,
    sequence,
    payload: (payload as Record<string, unknown> | null | undefined) ?? {},
  };
}

function fail(type: string, field: string, why: string): never {
  throw new ProtocolError(`${type}: ${field} ${why}`);
}

export function readNumber(payload: Record<string, unknown>, field: string, type: string): number {
  const value = payload[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(type, field, 'must be a finite number');
  }
  return value;
}

export function readString(payload: Record<string, unknown>, field: string, type: string): string {
  const value = payload[field];
  if (typeof value !== 'string') fail(type, field, 'must be a string');
  return value;
}

export function readBool(payload: Record<string, unknown>, field: string, type: string): boolean {
  const value = payload[field];
  if (typeof value !== 'boolean') fail(type, field, 'must be a boolean');
  return value;
}

/** A number that may be absent, in which case the fallback stands. */
export function optionalNumber(
  payload: Record<string, unknown>,
  field: string,
  fallback: number,
): number {
  const value = payload[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The protocol nests these on `entity.*` but carries them flat on
 * `player.move`. Mirrored rather than tidied: diverging breaks the shared
 * protocol.
 */
export function readXyz(
  payload: Record<string, unknown>,
  field: string,
  type: string,
): [number, number, number] {
  const value = payload[field];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(type, field, 'must be an object with x, y and z');
  }
  const vec = value as Record<string, unknown>;
  return [readNumber(vec, 'x', type), readNumber(vec, 'y', type), readNumber(vec, 'z', type)];
}

/**
 * Distinct from `optionalNumber`, which always produces one: an absent facing
 * means "however it was already", which no fallback expresses.
 */
export function optionalFinite(
  payload: Record<string, unknown>,
  field: string,
): number | undefined {
  const value = payload[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Every node checked; an unchecked one would throw outside `ProtocolError` handling and drop the socket. */
export function readPath(
  payload: Record<string, unknown>,
  field: string,
  type: string,
): Array<{ x: number; y: number; z: number }> {
  const value = payload[field];
  if (!Array.isArray(value)) fail(type, field, 'must be an array');

  return value.map((node, index) => {
    const where = `${type} ${field}[${index}]`;
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      fail(where, 'node', 'must be an object with x, y and z');
    }
    const vec = node as Record<string, unknown>;
    return {
      x: readNumber(vec, 'x', where),
      y: readNumber(vec, 'y', where),
      z: readNumber(vec, 'z', where),
    };
  });
}

/** Session-local numbers for the server's opaque id tokens (`"2:000000c8"`), never parsed. */
export class NetworkIdRegistry {
  private readonly toLocal = new Map<string, number>();
  private readonly toWire = new Map<number, string>();
  private next = 1;

  /** The session-local number for a wire id, assigning one on first sight. */
  idFor(wire: unknown, type: string): number {
    if (typeof wire === 'number' && Number.isInteger(wire) && wire >= 0) return wire;
    if (typeof wire !== 'string' || wire === '') {
      fail(type, 'networkId', 'must be a non-empty string or a non-negative integer');
    }

    const existing = this.toLocal.get(wire);
    if (existing !== undefined) return existing;

    const assigned = this.next++;
    this.toLocal.set(wire, assigned);
    this.toWire.set(assigned, wire);
    return assigned;
  }

  /** The wire id a local number came from. Diagnostics and outbound messages. */
  wireFor(local: number): string | undefined {
    return this.toWire.get(local);
  }

  /** Forget everything. Call when a connection ends; ids are per-session. */
  clear(): void {
    this.toLocal.clear();
    this.toWire.clear();
    this.next = 1;
  }
}
/**
 * Server messages this build handles that a previous one did not, printed at
 * startup: a stale client or server looks like a bug in the other. Add on
 * new handlers; drop once no server in use predates them.
 */
export const PROTOCOL_FEATURES = [
  'world.hiddenObjects',
  'dungeon.barrierOpened',
  'navigation.ground',
  'characters.returned',
  'dungeon.modeChosen',
] as const;
