/** Client<->server boundary (offline or WebSocket, one config line). Rule:
 * the server sends state, never assets. */

import type { EntityId, Lootable } from '../world/World';
import type { NavigationGroundData } from '../world/NavigationGround';
import type { ChoiceResult, Hand, Outcome, QuestShareResult, SummonResult } from './wireCodes';

/** No direction: the protocol never says which way a body strafes. */
export enum EntityMovementState {
  Standing = 'standing',
  Walking = 'walking',
  Swimming = 'swimming',
  Jumping = 'jumping',
  Falling = 'falling',
  Landed = 'landed',
  LandedMoving = 'landedMoving',
}

/** A lasting effect a body already wears when first sent. */
export interface HeldAura {
  casterId: number;
  spellId: number;
  /** Ms left as the server sent it. */
  remaining: number;
  /** Ms it started as; 0 with `remaining` for one that lasts until removed. */
  maxDuration: number;
  /** 1 for a debuff, 0 for a buff. */
  harmful: number;
}

export interface EntitySnapshot {
  /** Distinct from the client-local `EntityId`. */
  networkId: number;
  /** The spawn row; the client resolves the model from game data. */
  entry: number;
  displayInfoId: number;
  race: number;
  gender: number;
  /** The wire spells it `hairColour`; the asset layer `hairColor`. */
  appearance: { skin: number; hairStyle: number; hairColour: number; face: number };
  equipment: number[];
  weapons?: EquippedHands;
  animationId: number;
  nameId?: number;
  name?: string;
  subNameId?: number;
  level?: number;
  class?: number;
  health?: number;
  maxHealth?: number;
  power?: number;
  maxPower?: number;
  npcFlags?: number;
  offersQuests?: boolean;
  /** 0 hostile, 1 human, 2 neutral, arena factions above. Decides the unit's colour. */
  faction?: number;
  dead?: boolean;
  /** A creature that never fights back (a training dummy). */
  neverFightsBack?: boolean;
  /** What the body wears when first sent; `aura.applied` reports only changes. */
  auras?: HeldAura[];
  inCombat?: boolean;
  /** Also on the create block: the only way to learn a newly seen body has loot. */
  lootable?: Lootable;
  /** A creature at its base speed plays its run clip at rate 1. */
  baseSpeed?: number;
  staticObjectType?: number;
  canInteract?: boolean;
  kind?: string;
  position: [number, number, number];
  /** Radians, as the server stores it. */
  orientation: number;
}

/** Partial: apply what is present. An absent orientation means unchanged, not zero. */
export interface EntityMove {
  networkId: number;
  position?: [number, number, number];
  /** Absent when the server did not say. */
  orientation?: number;
  moving?: boolean;
  state?: EntityMovementState;
  speed?: number;
  /** Haste on top of base speed; floors the movement clip's rate. */
  speedBonus?: number;
  /** A player's travel direction; walked at `speed` rather than eased toward. */
  velocity?: [number, number, number];
  path?: Array<{ x: number; y: number; z: number }>;
  /** Nodes before this index are already walked. */
  pathStep?: number;
  target?: [number, number, number];
}

/** One weapon hand: class and subclass decide the combat animation (a bow and a wand differ). */
export interface WeaponHand {
  entry: number;
  itemClass: number;
  subClass: number;
}

export interface EquippedHands {
  mainhand: WeaponHand;
  offhand: WeaponHand;
  ranged: WeaponHand;
}

/** One saved action-bar slot; the transport maps `bar` and `slot` to the wire's one index. */
export interface ActionBarRecord {
  bar: 'primary' | 'shortcut';
  slot: number;
  id: number;
  type: number;
}

export interface TalentRank {
  talentId: number;
  rank: number;
}

export interface CombatHit {
  attackerId: number;
  targetId: number;
  outcome: Outcome | null;
  /** What reached the target's health. */
  damage: number;
  /** What a shield took first; a fully absorbed blow is `damage` 0 with this set. */
  absorbed: number;
  finalHealth: number;
  /** Always the main hand for a shot or a spell. */
  hand: Hand;
}

export interface SharedQuestOffer {
  sharerId: number;
  sharerName: string;
  questId: number;
  titleStringId: number;
  detailsStringId: number;
  minLevel: number;
}

/** A party member a summon stone can call. */
export interface SummonMember {
  networkId: number;
  name: string;
  /** False for a member who is not in the world to be called. */
  canSummon: boolean;
}

export interface SummonAsk {
  summonerId: number;
  summonerName: string;
  /** Where the summoner stands, for naming the place. */
  mapId: number;
  position: [number, number, number];
}

export interface SummonAnswer {
  memberId: number;
  memberName: string;
  /** Null for a result this client has no word for. */
  result: SummonResult | null;
}

export interface SharedQuestAnswer {
  memberId: number;
  memberName: string;
  questId: number;
  /** Null for a result this client has no word for. */
  result: QuestShareResult | null;
}

export interface ChatLine {
  channel: string;
  sender: string;
  text: string;
  /** The speaker's network id, when the server names one: a creature has no name a player could match. */
  senderId?: number;
}

export interface EntityValuesChanged {
  networkId: number;
  values: Record<string, number>;
}

export type QuestGiverStatus = 'none' | 'available' | 'incomplete' | 'finished';

/** As placed, or the Legend counterparts. */
export type DungeonMode = 'normal' | 'legend';

/** A change to a logged quest; absent fields stay as they are. */
export type QuestUpdate = Partial<QuestRecord> & { id: number };

/** A quest-zone row: where, on which map, and how near counts as arrived. */
export interface QuestArea {
  id: number;
  mapId: number;
  x: number;
  y: number;
  z: number;
  radius: number;
}

/** Something a quest gives or offers; pictures and words come from local data by `entry`. */
export interface QuestItem {
  entry: number;
  nameTextId: number;
  quality: number;
  count: number;
}

export interface QuestCounter {
  index: number;
  kind: 'killed' | 'held' | 'triggered';
  count: number;
}

export interface QuestObjective {
  /** Which of the four requirement slots. */
  index: number;
  killed: number;
  triggered: number;
  /** Capped to what is asked. */
  held: number;
  objectiveItem: number;
  objectiveItemCount: number;
  goalCount: number;
  objectiveStringId: number;
}

export interface QuestRecord {
  id: number;
  /** From `titleStringId` against the local string table; empty until it resolves. */
  name: string;
  titleStringId?: number;
  detailsStringId?: number;
  completionStringId?: number;
  incompleteStringId?: number;
  status: QuestGiverStatus;
  readyToHandIn?: boolean;
  objectives?: QuestObjective[];
  /**
   * The quest-log slot. Dropping and sharing name both slot and quest, which
   * the server cross-checks. Absent on an offer.
   */
  slot?: number;
  minLevel?: number;
  objective?: string;
  progress?: string;
  tracked?: boolean;
  giverId?: number;
  /** Requirement counters that have moved since the log was last written. */
  counters?: QuestCounter[];
  /** Where to go while the quest is unfinished. */
  guideZones?: QuestArea[];
  /** Where to hand it in, once it can be. */
  handInZone?: QuestArea | null;
  /** What it pays on completion, and what it lets you choose between. */
  rewards?: QuestItem[];
  rewardChoices?: QuestItem[];
  rewardMoney?: number;
  details?: string;
  completionText?: string;
}

/** Three bands, as the server numbers them with gaps, so a bag index cannot read as equipment. */
export type StorageArea = 'equipment' | 'bag' | 'bank';

export interface StorageSlot {
  area: StorageArea;
  index: number;
}

export interface StatBonus {
  type: number;
  value: number;
}

/** Sent with every item: answering from local tables could disagree with the server. */
export interface ItemDescription {
  entry: number;
  itemClass: number;
  subClass: number;
  nameTextId: number;
  displayInfoId: number;
  quality: number;
  flags: number;
  buyPrice: number;
  sellPrice: number;
  currency: number;
  /** Which equipment slot this can go in; 0 for something not worn. */
  inventoryType: number;
  itemLevel: number;
  requiredLevel: number;
  /** How many fit in one slot. 1 for anything that does not stack. */
  maxStack: number;
  containerSlots: number;
  stats: StatBonus[];
  damage: Array<{ min: number; max: number; type: number }>;
  armour: number;
  /** Weapon swing time in milliseconds. */
  delay: number;
  range: number;
  spells: Array<{
    id: number;
    trigger: number;
    chance: number;
    cooldown: number;
    category: number;
    sharedCooldown: number;
  }>;
  /** When it binds: never, on pickup, on equip, on use, quest. */
  bonding: number;
  descriptionStringId: number;
  maxDurability: number;
  expiresAfter: number;
}

/** One item the player owns. Requests name `id` and slot; the server ignores a mismatch. */
export interface InventoryItem {
  id: string;
  /** Null while the item is between places. */
  slot: StorageSlot | null;
  entry: number;
  /** A rolled-suffix id, 0 for a plain item. */
  namePrefixId: number;
  nameTextId: number;
  prefixTextId: number;
  itemClass: number;
  subClass: number;
  /** 1 poor through 6 artifact. */
  quality: number;
  count: number;
  duration: number;
  durability: number;
  maxDurability: number;
  flags: number;
  /** What the prefix adds, already rolled. Empty for a plain item. */
  stats: StatBonus[];
  prototype: ItemDescription;
}

/**
 * One row in an opened body. `slot` is the row's index in that body's list,
 * which taking it names back; hidden rows leave gaps.
 */
export interface LootRow {
  slot: number;
  itemId: string;
  entry: number;
  namePrefixId: number;
  nameTextId: number;
  prefixTextId: number;
  itemClass: number;
  subClass: number;
  quality: number;
  count: number;
  displayInfoId: number;
}

export interface LootContents {
  networkId: number;
  /** Copper, as every money field is. Zero when there is none. */
  money: number;
  items: LootRow[];
}

export interface AuctionKindRequest {
  itemClass?: number;
  subClass?: number;
  subClassFrom?: number;
  subClassTo?: number;
  inventoryType?: number;
}

/**
 * An absent field narrows nothing. Narrowing is the server's because paging
 * is: client-side filtering would show three rows under a count of forty.
 */
export interface AuctionSearchRequest {
  name?: string;
  minLevel?: number;
  maxLevel?: number;
  kinds?: AuctionKindRequest[];
  quality?: number;
  offset?: number;
  limit?: number;
}

/** One auction-house row; the item is an entry, never a name. */
export interface AuctionListing {
  id: string;
  sellerName: string;
  itemEntry: number;
  itemCount: number;
  /** Copper, as every money field is. */
  startPrice: number;
  /** Unix seconds, the server's clock. */
  listedAt: number;
  /** Unix seconds, the server's clock. */
  expiresAt: number;
  /** Absent when the listing is bid-only. */
  buyoutPrice?: number;
  /** 0 while nobody has bid; `startPrice` is the price until then. */
  currentBid: number;
  /** Absent while nobody has bid. */
  highestBidder?: string;
}

/** One attached item on a piece of mail, as entry + count — never a live inventory id. */
export interface MailAttachment {
  entry: number;
  count: number;
}

/** One inbox row, as `mail.inbox` carries it. Newest first. */
export interface MailInboxEntry {
  id: string;
  senderName: string;
  subject: string;
  /** Copper. Zero when there is none. */
  gold: number;
  /** Unix seconds. */
  sentAt: number;
  read: boolean;
  goldClaimed: boolean;
  /** How many items ride with it. Zero when there are none. */
  itemCount: number;
  itemsClaimed: boolean;
}

/** The full body of one message, in answer to reading it. */
export interface MailMessage extends MailInboxEntry {
  body: string;
  items: MailAttachment[];
}

/** Part of a letter to take: one attachment by its place in the letter, or only the money. */
export type MailTake = { slot: number } | { moneyOnly: true };

/** `networkId` is local; members resolve whether or not they are in view. */
export interface RosterMember {
  networkId: number;
  name: string;
  isLeader: boolean;
}

/** A member who left the world keeps their row for a while, `online` false. */
export interface PartyMember extends RosterMember {
  online: boolean;
}

/** A party roster; a null `partyId` with no members means "in no party". */
export interface PartyRoster {
  partyId: string | null;
  members: PartyMember[];
}

/** A vote to remove a team member: who asked, and about whom. */
export interface KickVoteAsked {
  initiatorId: number;
  initiatorName: string;
  targetId: number;
  targetName: string;
}

/** One member's no in a vote, or their silence once it ran out. */
export interface KickVoteRefused {
  memberId: number;
  memberName: string;
  initiatorId: number;
  initiatorName: string;
}

/** The end of a vote, and whether its member was removed. */
export interface KickVoteEnded {
  targetId: number;
  targetName: string;
  passed: boolean;
}

/** A whole guild roster, or the empty "you are in no guild" shape. */
export interface GuildRoster {
  guildId: string | null;
  guildName: string | null;
  members: RosterMember[];
}

/** One row of a friend or ignore list. */
export interface SocialListMember {
  networkId: number;
  name: string;
  /** Whether they are in the world right now. The rest is only known while they are. */
  online?: boolean;
  level?: number;
  race?: number;
  /** Their class, counted from one. */
  classId?: number;
  gender?: number;
  mapId?: number;
  position?: [number, number, number];
  /** Their race's name and the zone they stand in, filled in by the server. */
  raceName?: string;
  zoneName?: string;
}

/**
 * One side of a trade, from this player's point of view. Offered items carry
 * no slot: a slot in the other player's bag means nothing here.
 */
export interface TradeState {
  opponentId: number;
  /** Copper the opponent has put up. */
  opponentGold: number;
  opponentItems: Array<{ id: string; entry: number; count: number }>;
  opponentConfirmed: boolean;
  /** May have been reset by the opponent changing their offer (anti-cheat). */
  yourConfirmed: boolean;
}

/**
 * The server's strings. `offer_changed_after_confirm` is the anti-cheat rule;
 * the last three are the final all-or-nothing check refusing.
 */
export type TradeCancelReason =
  | 'cancelled'
  | 'out_of_range'
  | 'offer_changed_after_confirm'
  | 'not_enough_gold'
  | 'item_no_longer_available'
  | 'not_enough_bag_space'
  | 'trade_refused'
  | (string & {});

/** How a duel ended, from this side's point of view; each side gets its own reason. */
export type DuelEndReason = 'won' | 'lost' | 'forfeited' | 'opponentForfeited' | (string & {});

/** Identity and numbers only, like `EntitySnapshot`. Keys into game data. */
export interface CharacterSummary {
  /** Server's id for the character. Opaque; pass it back unchanged. */
  guid: string;
  name: string;
  level: number;
  gender: number;
  race: number;
  class: number;
  /** Key into creaturedisplayinfo, for resolving the model locally. */
  displayInfoId: number;
  appearance: { skin: number; hairStyle: number; hairColour: number; face: number };
  /** The map the character is standing on, and where. */
  mapId: number;
  position: [number, number, number];
  /** Item entry ids by equipment slot; 0 means empty. Resolved locally. */
  equipment: number[];
  /** Progress through the level, and the level's length. */
  xp: number;
  xpToLevel: number;
}

/** What a player picks while making a character. Numbers, resolved locally. */
export interface NewCharacter {
  name: string;
  race: number;
  class: number;
  /** 0 or 1; which body the race wears. */
  gender: number;
  appearance: { skin: number; hairStyle: number; hairColour: number; face: number };
}

export interface ConnectionEvents {
  onConnected?(): void;
  onDisconnected?(reason: string): void;

  // — getting into the world ------------------------------------------------

  /**
   * Read `ok`, not the code: which codes mean success is the server's to say.
   * A failure ends the connection: the server refuses a second attempt.
   */
  onLoginResult?(ok: boolean, code: number, reason?: string): void;
  /** `races` is null where the server says nothing (older servers). */
  onCharacters?(characters: CharacterSummary[], races: number[] | null): void;
  /**
   * **The failure branch only.** The server's success path sends nothing here;
   * the next thing heard is `onWorldEntered`. Waiting on it waits forever.
   */
  onCharacterChosen?(ok: boolean, code: number, reason?: string): void;
  /**
   * **Both branches**, unlike `onCharacterChosen`: a refusal (name taken,
   * account full) keeps the screen up; success is followed by `onCharacters`.
   */
  onCharacterCreated?(ok: boolean, code: number, reason?: string): void;
  /** Whether the character was taken off the account, and why not when it was not. */
  onCharacterDeleted?(ok: boolean, code: number, reason?: string): void;
  /** Back at the character list, signed in; per-network-id state belongs to the world left. */
  onCharactersReturned?(): void;
  /** What a race and class start out wearing; empty where the pairing is unplayable. */
  onOutfit?(race: number, playerClass: number, equipment: number[]): void;
  /**
   * Distinct from `onPlayerPositionCorrected`: arriving is not being corrected,
   * and only this carries a map — the signal to clear `NetworkEntityMap`.
   */
  onWorldEntered?(
    mapId: number,
    position: [number, number, number],
    /** Every combat message about the player names this id; zero when unsaid. */
    selfNetworkId: number,
    /** What the player's own body wears as it arrives; empty when nothing. */
    auras: HeldAura[],
  ): void;

  // — once in the world -----------------------------------------------------

  /** Entities entering the client's area of interest. */
  onEntitiesAppeared?(entities: EntitySnapshot[]): void;
  /** Partial by nature. Not `EntitySnapshot`: a move carries no entry. */
  onEntitiesMoved?(moves: EntityMove[]): void;
  onEntitiesRemoved?(networkIds: number[]): void;
  /** A visible character changed equipment; numbers are resolved locally. */
  onEntityAppearanceChanged?(networkId: number, equipment: number[], weapons?: EquippedHands): void;
  onEntityValuesChanged?(update: EntityValuesChanged): void;
  onPlayerValuesChanged?(values: Record<string, number>): void;
  /**
   * The delta for "Exp: +N", which the totals cannot give across a level-up
   * that resets them.
   */
  onPlayerExpGained?(amount: number, levelUp: boolean): void;
  /** Hero death, told to the hero only (private cost, not the world event;
   * deathCost in copper, zero is a real answer). */
  onPlayerDeath?(killerId: number | null, deathCost: number): void;
  /**
   * Not sent in response to movement — the server adopts what the client
   * reports. For the paths that relocate a player, such as teleports.
   */
  onPlayerPositionCorrected?(position: [number, number, number]): void;
  /** The server moved the player, possibly across maps (bus, gate, summon, GM). */
  onPlayerTeleported?(mapId: number, position: [number, number, number], yaw: number): void;
  /** The first thing said about any change of map; the login handshake again. */
  onWorldLoading?(mapId: number, position: [number, number, number]): void;
  onChat?(message: ChatLine): void;
  /** A whisper addressed to this player. `senderNetworkId` resolves like any other visible entity's id. */
  onWhisperReceived?(senderNetworkId: number, senderName: string, text: string): void;
  /** A whisper this player sent, echoed once delivered; logged then, not on send. */
  onWhisperSent?(targetNetworkId: number, targetName: string, text: string): void;
  /** `animationId` is an animation-table row; `name` the protocol's keyword for it. */
  onEmotePerformed?(networkId: number, animationId: number, name: string): void;
  onTargetChanged?(networkId: number): void;
  /** An NPC conversation; what it says comes from local tables by `entry`. */
  onNpcConversation?(networkId: number, entry: number): void;
  /** What picking a choice on conversation page `menuId` did. */
  onNpcChoiceResult?(networkId: number, menuId: number, choice: number, result: ChoiceResult): void;
  onQuestStatuses?(statuses: Array<{ networkId: number; status: QuestGiverStatus }>): void;
  onQuestList?(giverId: number, quests: QuestRecord[]): void;
  onQuestUpdated?(quest: QuestUpdate): void;
  onQuestDetails?(giverId: number, quest: QuestRecord): void;
  onQuestRemoved?(questId: number): void;
  /** A party member offers this player a quest; the answer is `sendQuestShareAnswer`. */
  onQuestShareOffered?(offer: SharedQuestOffer): void;
  /** What one party member did with a quest this player shared. */
  onQuestShareResult?(answer: SharedQuestAnswer): void;
  /** The whole quest log, once, in the create block: the protocol has no request for it. */
  onQuestLog?(quests: QuestRecord[]): void;
  onBusFare?(from: number, to: number, cost: number): void;
  onTeleportResult?(ok: boolean, networkId: number): void;
  onVendorItems?(
    tabs: Array<{
      tabIndex: number;
      currency: number;
      count: number;
      itemDataDecoded: boolean;
      items?: Array<{
        slot: number;
        entry: number;
        nameTextId: number;
        displayInfoId: number;
        buyPrice: number;
        /** Null when the server reports no quantity — unlimited, not zero. */
        stock: number | null;
        stackCount: number;
      }>;
    }>,
  ): void;
  /** `ok`, or a refusal code worded by `itemErrors.ts`. */
  onVendorBuyResult?(code: string): void;
  /** Its own message: a purchase can be charged and still not fit, and then both arrive. */
  onItemError?(code: string): void;
  /** The answer to selling: `ok`, or a refusal code; see `itemErrors.ts`. */
  onVendorSellResult?(code: string): void;
  /** The answer to listing. `id` is the new listing, present on success. */
  onAuctionListed?(ok: boolean, id: string | null, reason: string | null): void;
  /** The market is open, because the player stood at an auctioneer. */
  onAuctionOpened?(): void;
  /** The active listings just asked for, newest first. */
  onAuctionListings?(listings: AuctionListing[], total: number, offset: number): void;
  /** The answer to cancelling your own listing. */
  onAuctionCancelled?(ok: boolean, id: string, reason: string | null): void;
  /** The answer to a bid, with the new current price. */
  onAuctionBidPlaced?(ok: boolean, id: string, currentBid: number, reason: string | null): void;
  /** The answer to a buyout, with the price actually paid. */
  onAuctionBought?(ok: boolean, id: string, price: number, reason: string | null): void;

  // — the bag, the equipment slots and the bank -----------------------------
  // Sent whole on entering the world; everything after is a delta.

  /** Everything the character owns, and how many slots there are to own it in. */
  onInventory?(bagSlotCount: number, bankSlotCount: number, items: InventoryItem[]): void;
  /** One item arrived, by any route. */
  onInventoryItemAdded?(item: InventoryItem): void;
  /** One item is gone: sold, used up, destroyed, or handed over. */
  onInventoryItemRemoved?(itemId: string): void;
  /** One item moved, which is what the server sends for an empty destination. */
  onInventoryItemMoved?(itemId: string, from: StorageSlot | null, to: StorageSlot | null): void;
  /** Each side names its slot *before*, so cross them over; an all-zero id means empty. */
  onInventoryItemsSwapped?(
    first: { itemId: string; from: StorageSlot | null },
    second: { itemId: string; from: StorageSlot | null },
  ): void;
  /** A stack grew or shrank without changing slot. */
  onInventoryStackChanged?(itemId: string, slot: StorageSlot | null, count: number): void;
  /** **Only sent on refusal**; success arrives as slot and appearance changes. */
  onInventoryEquipResult?(code: string): void;
  onInventorySorted?(ok: boolean, area: StorageArea): void;
  onInventoryCapacityChanged?(area: StorageArea, capacity: number): void;
  onBankOpen?(open: boolean): void;
  onBankUpdated?(bankSlotCount: number, items: InventoryItem[]): void;

  // — mailbox -----------------------------------------------------------------
  // Rows change only on the server's answer; a click never removes one.

  /** One inbox row, as `mail.inbox` carries it. Newest first. */
  onMailInbox?(messages: MailInboxEntry[]): void;
  /** Whether a mailbox opened; a successful open also brings `onMailInbox`. */
  onMailOpened?(open: boolean): void;
  /** A summon stone opened, listing the party members it can call. */
  onSummonOpened?(stoneId: number, members: SummonMember[]): void;
  /** A party member is summoning this player; the answer is `sendSummonAnswer`. */
  onSummonAsked?(ask: SummonAsk): void;
  /** What became of a summon this player asked for. */
  onSummonResult?(answer: SummonAnswer): void;
  /** A member tried to summon this player, who is below the dungeon's level. */
  onSummonTooLow?(summonerName: string): void;
  /** The full body of one message, in answer to reading it. */
  onMailMessage?(message: MailMessage): void;
  /** The send outcome, to the sender only. */
  onMailSent?(ok: boolean, reason: string | null, code: string | null): void;
  /** The claim outcome, including what was actually granted. */
  onMailClaimed?(
    ok: boolean,
    gold: number,
    items: MailAttachment[],
    reason: string | null,
    code: string | null,
  ): void;
  /** The delete outcome. */
  onMailDeleted?(ok: boolean, id: string, reason: string | null): void;
  /** How many letters wait unread: on entering the world, after reading one, and when one arrives. */
  onMailUnread?(count: number): void;

  // — refusals with no result message of their own --------------------------

  /** A refusal with nowhere else to go (most party/guild/trade/duel ones); `reason` is for people. */
  onProtocolError?(code: string, reason: string): void;

  // — party/group core ------------------------------------------------------
  // Every membership change arrives as a whole `party.roster`.

  /** To the inviter only: the invite reached the named target. */
  onPartyInviteSent?(networkId: number, name: string): void;
  /** To the invitee only: who wants them in a party. */
  onPartyInvited?(networkId: number, name: string): void;
  /** To the original inviter only: the target said no. */
  onPartyDeclined?(networkId: number, name: string): void;
  /** The reason, ahead of the empty roster that leaving would also send. */
  onPartyKicked?(): void;
  /** The whole membership, or the empty "you are in no party" shape. */
  onPartyRoster?(roster: PartyRoster): void;
  /** To every member asked: another member wants someone removed. */
  onPartyVoteKickAsked?(vote: KickVoteAsked): void;
  /** To the asker and the others asked: one member said no. */
  onPartyVoteKickRefused?(refusal: KickVoteRefused): void;
  /** To the asker and everyone asked: the vote is over. A passing one is followed by the new roster. */
  onPartyVoteKickEnded?(end: KickVoteEnded): void;

  // — guild core -------------------------------------------------------------
  // As the party, but persisted: `sendGuildRosterRequest` catches up on reconnect.

  /** To the inviter only: the invite reached the named target. */
  onGuildInviteSent?(networkId: number, name: string): void;
  /** To the invitee only: who invited them, and into which guild. */
  onGuildInvited?(networkId: number, name: string, guildName: string): void;
  /** A guild stone was used: ask what to call the guild. Carries the stone's entry. */
  onGuildFoundPrompt?(entry: number): void;
  /** To the original inviter only: the target said no. */
  onGuildDeclined?(networkId: number, name: string): void;
  /** To a kicked member only, ahead of their own empty roster. */
  onGuildKicked?(): void;
  /** The whole membership, or the empty "you are in no guild" shape. */
  onGuildRoster?(roster: GuildRoster): void;

  // — friends and ignores -----------------------------------------------------
  // No accept handshake. Whole lists, on login, zone load and every change.

  /** This player's whole friend list. */
  onFriendList?(members: SocialListMember[]): void;
  /** Everyone in the world, in answer to `sendWho`. */
  onWhoList?(players: SocialListMember[]): void;
  /** This player's whole ignore list. */
  onIgnoreList?(members: SocialListMember[]): void;
  /** The report this session just sent has been persisted server-side. */
  onReportAcknowledged?(): void;

  // — player trade -----------------------------------------------------------
  // Items and coins move as ordinary inventory and player deltas before
  // `trade.completed`.

  /** To the proposed-to player: someone wants to trade. */
  onTradeRequested?(fromId: number): void;
  /** To the proposer: the target turned it down. */
  onTradeDeclined?(byId: number): void;
  /** To both sides: the trade window is open. */
  onTradeStarted?(opponentId: number): void;
  /** To both sides after any offer or confirm change — each its own view. */
  onTradeUpdated?(state: TradeState): void;
  /** To both sides: it ended with no exchange, carrying why. */
  onTradeCancelled?(opponentId: number, reason: TradeCancelReason): void;
  /** To both sides: the exchange happened. The deltas arrive ahead of it. */
  onTradeCompleted?(opponentId: number): void;

  // — duels ------------------------------------------------------------------

  /** Delivered on the challenged side's next combat tick, up to a tick late. */
  onDuelRequested?(fromId: number): void;
  /** To the challenger: declined, or the challenge expired unanswered. */
  onDuelDeclined?(byId: number): void;
  /** The duel is on; `startsIn` is the countdown, in seconds. */
  onDuelStarted?(opponentId: number, startsIn: number): void;
  /**
   * Each side's own reason and resulting health. A health loss revives the
   * loser at a small flat amount; use the server's numbers.
   */
  onDuelEnded?(opponentId: number, reason: DuelEndReason, health: number, maxHealth: number): void;

  // — open-world PvP flagging ------------------------------------------------

  /** To the caller only: the open-world PvP flag now reads this way. */
  onPvpFlagChanged?(flagged: boolean): void;

  // — talents ------------------------------------------------------------------

  /** Points left and every bought rank; always whole, never a delta. */
  onTalentState?(points: number, ranks: TalentRank[]): void;

  /** A learn was refused. `reason` is one of the server's talent refusal codes. */
  onTalentRefused?(talentId: number, reason: string): void;

  // — spells and combat ---------------------------------------------------

  /** Every saved slot, empties included; compacting it loses the layout. */
  onSpellBook?(spells: number[], actionBar: ActionBarRecord[]): void;
  /** Spells a used item just taught. */
  onSpellLearned?(spellIds: number[]): void;
  /** One saved slot changed. */
  onActionBarAssigned?(record: ActionBarRecord): void;
  onSpellCasting?(casterId: number, spellId: number, castTime: number): void;
  /** `targets` were struck; `resisted` were reached to no effect (no missile, impact or number). */
  onSpellReleased?(
    casterId: number,
    spellId: number,
    speed: number,
    targets: number[],
    resisted: number[],
  ): void;
  onCooldownStarted?(spellId: number, duration: number): void;
  onSpellFailure?(casterId: number, spellId: number, reason: string): void;
  onSpellInterrupted?(casterId: number): void;
  onSwingResult?(hit: CombatHit): void;
  onAttackMeleeStart?(attackerId: number, targetId: number): void;
  /** A bow or a wand came up. The posture holds until `onAttackHalted`. */
  onAttackRangeStart?(attackerId: number, targetId: number): void;
  onAttackHalted?(networkId: number): void;
  onShotFired?(attackerId: number, targetId: number, spellVisualId: number, speed: number): void;
  onShotResult?(hit: CombatHit): void;
  onAuraApplied?(
    unitId: number,
    casterId: number,
    spellId: number,
    remaining: number,
    maxDuration: number,
    harmful: number,
  ): void;
  onAuraEnded?(casterId: number, unitId: number, spellId: number): void;
  onSpellOutcome?(
    casterId: number,
    targetId: number,
    spellId: number,
    outcome: Outcome | null,
    damage: number,
    finalHealth?: number,
    absorbed?: number,
  ): void;
  onAttackEnterCombat?(networkId: number): void;
  onAttackExitCombat?(networkId: number): void;
  /** `position` is authoritative: a creature killed mid-walk stops where it fell. */
  onUnitDied?(networkId: number, position?: [number, number, number]): void;
  /**
   * A player back from death. The server tells everyone on the map, so this is
   * the local hero only when `networkId` is theirs; the hero's relocation rides
   * the usual `world.loading`/`world.entered` pair.
   */
  onPlayerRevived?(
    networkId: number,
    health: number,
    maxHealth: number,
    power: number,
    maxPower: number,
  ): void;
  /** `lootable`, `emptied` or `none`; only `lootable` wears the loot glow. */
  onEntityLootable?(networkId: number, lootable: Lootable): void;

  /** Map objects to leave out of this world, by where they stand. */
  onWorldHiddenObjects?(positions: Array<[number, number, number]>): void;

  /** The dungeons were reset; `count` is how many live copies ended. */
  onDungeonsRestarted?(count: number): void;
  /** The dungeon mode now in force; `count` is how many live copies the change ended. */
  onDungeonModeChosen?(mode: DungeonMode, count: number): void;
  /**
   * A gated way is passable: walls in the ground-plane box `area` stop
   * blocking. `announce` is false for a run already under way.
   */
  onDungeonBarrierOpened?(
    barrierId: string,
    announce: boolean,
    area: { minX: number; maxX: number; minZ: number; maxZ: number },
    /** Map models standing in the way, by the telling part of their path. */
    models: string[],
  ): void;

  /** Operator-only; others get `onProtocolError` `forbidden`. */
  onNavigationGround?(ground: NavigationGroundData): void;

  // -- looting ---------------------------------------------------------------

  /** The whole contents, every time; an empty answer means close the window. */
  onLootContents?(contents: LootContents): void;
  /** Broadcast to everyone nearby; a container we have open going free closes our window. */
  onLootBusy?(networkId: number, busy: boolean): void;
  /** One row gone, for everyone; `looterId` says who, `money` is the coin. */
  onLootItemRemoved?(networkId: number, looterId: number, money: boolean, slot?: number): void;
}

export interface GameConnection {
  readonly name: string;
  readonly connected: boolean;

  connect(events: ConnectionEvents): Promise<void>;
  disconnect(): void;

  // — getting into the world ------------------------------------------------
  // No-ops offline, so a caller need not branch on transport.

  /** Authenticate the account. Answered by `onLoginResult`. */
  login(userId: string, passHash: string): void;
  /** Ask for the account's characters. Answered by `onCharacters`. */
  listCharacters(): void;
  /** Enter the world as one of them, by name or by `guid`. */
  chooseCharacter(nameOrGuid: string): void;
  /** Leave the world for the character list. Answered by `onCharactersReturned`. */
  returnToCharacterList(): void;
  /** Answered by `onCharacterCreated`, then a fresh `onCharacters` on success. */
  createCharacter(character: NewCharacter): void;

  /** Answered by `onCharacterDeleted`, then a fresh `onCharacters` on success. */
  deleteCharacter(nameOrGuid: string): void;

  /** What a race and class start out wearing. Answered by `onOutfit`. */
  askOutfit(race: number, playerClass: number): void;

  // — once in the world -----------------------------------------------------

  /**
   * `moving` must be false on the frame the player stops, or they run on the
   * spot for everyone else; without `state` nobody sees a jump or landing.
   * Omit `velocity` and `speed` on a stop.
   */
  sendPlayerPosition(
    position: [number, number, number],
    orientation: number,
    moving?: boolean,
    state?: EntityMovementState,
    velocity?: [number, number, number],
    speed?: number,
  ): void;

  sendChat(channel: string, text: string): void;
  /** Answered by `onWhisperReceived` there and `onWhisperSent` here once delivered. */
  sendWhisper(networkId: number, text: string): void;
  /** Perform an emote, by the keyword the server knows it under. */
  sendEmote(name: string): void;
  sendTarget(networkId: number): void;
  /** Start talking to an NPC. */
  sendNpcTalk(networkId: number): void;
  /** Back out of an NPC's conversation to its greeting. */
  sendNpcPreviousPage(networkId: number): void;
  /** Pick a choice that runs something: its page and script slot, 1 to 6. */
  sendNpcPickOption(networkId: number, menuId: number, choice: number): void;
  sendQuestStatus(networkId: number): void;
  sendQuestList(networkId: number, questId?: number): void;
  sendQuestAccept(networkId: number, questId: number): void;
  sendQuestComplete(networkId: number, questId: number, rewardIndex?: number): void;
  sendQuestDestroy(slot: number, questId: number): void;
  /** Offer a held quest to the rest of the party. */
  sendQuestShare(questId: number): void;
  /** Take, or turn down, a quest a party member offered. */
  sendQuestShareAnswer(questId: number, accept: boolean): void;
  /** Re-check givers in range: accepting and finishing change marks with nothing else on the wire. */
  sendQuestRefreshStatuses(): void;
  sendTeleportRequest(networkId: number): void;
  sendVendorOpen(networkId: number): void;
  /** Buy `count` of `entry` from the vendor's own `slot`. */
  sendVendorBuy(networkId: number, slot: number, entry: number, count: number): void;
  /** Sell the item in `from` to the vendor. The price is the server's to decide. */
  sendVendorSell(networkId: number, from: StorageSlot, itemId: string): void;
  /** List the whole stack at `from`; omit `buyoutPrice` for bid-only. */
  sendAuctionList(
    from: StorageSlot,
    itemId: string,
    startPrice: number,
    durationHours: number,
    buyoutPrice?: number,
  ): void;
  /** Stand at an auctioneer: the server answers by opening the market. */
  sendAuctioneerOpen(networkId: number): void;
  /** Ask for the active listings; blank `query` means everything. */
  sendAuctionBrowse(search?: AuctionSearchRequest): void;
  /** Take your own listing down, getting the item back. */
  sendAuctionCancel(id: string): void;
  /** `amount` is the new total bid; only the difference over your current bid is charged. */
  sendAuctionBid(id: string, amount: number): void;
  /** End a listing immediately at its buyout price. */
  sendAuctionBuyout(id: string): void;
  /** Ask a static object bound to a held quest for its item (`OUTBOUND.staticObjectInteract`). */
  sendStaticObjectInteract(networkId: number): void;

  /** Move, swap or merge; the server decides which. */
  sendInventoryMove(from: StorageSlot, to: StorageSlot): void;
  /** `to` picks a ring or trinket's home; omitted, the server picks. */
  sendInventoryEquip(from: StorageSlot, itemId: string, equip: boolean, to?: StorageSlot): void;
  /** Use an item on the current target, or on nothing. */
  sendInventoryUse(from: StorageSlot, itemId: string, targetNetworkId?: number): void;
  /**
   * `count` must be the whole stack shown: the server silently ignores a
   * moved id, slot or count. Irreversible; ask the player first.
   */
  sendInventoryDestroy(from: StorageSlot, itemId: string, count: number): void;
  /** Split `count` off a stack into an empty slot. */
  sendInventorySplit(from: StorageSlot, itemId: string, count: number, to: StorageSlot): void;
  sendInventorySort(area: StorageArea): void;
  sendOpenBank(networkId: number): void;
  /** Open a mailbox static object. Answered by `onMailOpened` + `onMailInbox`. */
  sendMailOpen(networkId: number): void;
  /** Open a summon stone. Answered by `onSummonOpened`. */
  sendSummonOpen(stoneId: number): void;
  /** Call a party member to the stone. */
  sendSummonRequest(stoneId: number, memberId: number): void;
  sendSummonAnswer(accept: boolean): void;
  /** Send mail by name; nothing leaves the bag on any refusal. */
  sendMailSend(
    recipientName: string,
    subject: string,
    body: string,
    gold: number,
    itemIds: string[],
  ): void;
  /** Read one message in the caller's own inbox. Answered by `onMailMessage`. */
  sendMailRead(id: string): void;
  /** Claim gold and items atomically, or only `take`: a full bag refuses the whole claim. */
  sendMailClaim(id: string, take?: MailTake): void;
  /** Delete one message outright, even one still carrying unclaimed goods. */
  sendMailDelete(id: string): void;

  // — party/group core ------------------------------------------------------
  // Requests only; the roster changes on the server's `party.roster`.

  /** Refused when the target is offline, on another map, in a party, already invited, or the party is full. */
  sendPartyInvite(networkId: number): void;
  /** Invite whoever in the world goes by this name. */
  sendPartyInviteNamed(name: string): void;
  /** Accept the invite pending for this character. Answered by `onPartyRoster`. */
  sendPartyAccept(): void;
  /** Decline it. The inviter hears `onPartyDeclined`; this side gets an empty roster. */
  sendPartyDecline(): void;
  /** Leave the current party. Answered with this side's own empty roster. */
  sendPartyLeave(): void;
  /** Leader only, and never the leader themselves. Answered by `onPartyRoster`. */
  sendPartyKick(networkId: number): void;
  /**
   * Any member but the leader: ask the rest whether this member should be
   * removed. Heard back as `onPartyVoteKickRefused` and `onPartyVoteKickEnded`.
   */
  sendPartyVoteKick(networkId: number): void;
  /** Answer the vote this member was asked in. */
  sendPartyVoteKickAnswer(agree: boolean): void;

  // — guild core -------------------------------------------------------------

  /** Refused when already in a guild, the name is blank, over 16 characters or taken, or below level 10. */
  sendGuildFound(name: string): void;
  /** Leader only. Answered by `onGuildInviteSent`; the target hears `onGuildInvited`. */
  sendGuildInvite(networkId: number): void;
  sendGuildAccept(): void;
  sendGuildDecline(): void;
  /** The leader leaving dissolves the guild; leadership cannot be handed on. */
  sendGuildLeave(): void;
  /** Leader only, and never the leader themselves. */
  sendGuildKick(networkId: number): void;
  /** Leader only. The named convenience for "the leader leaves and it is gone". */
  sendGuildDisband(): void;
  /** Re-fetch the roster; membership persists, so a fresh session must ask. */
  sendGuildRosterRequest(): void;

  // — friends and ignores -----------------------------------------------------
  // Addressed as `targetId` on the wire. Either change returns both lists.

  /** Add a visible player to this player's friend list. */
  sendFriendAdd(networkId: number): void;
  /** Add a character by name, in the world or not. */
  sendFriendAddNamed(name: string): void;
  /** Ask who is in the world. */
  sendWho(): void;
  /** Take a name off the friend list. */
  sendFriendRemove(networkId: number): void;
  /** Add a visible player to this player's ignore list. */
  sendIgnoreAdd(networkId: number): void;
  /** Take a name off the ignore list. */
  sendIgnoreRemove(networkId: number): void;
  /** Re-fetch both lists; they persist, so a fresh session must ask. */
  sendSocialListRequest(): void;

  /** Answered by `onReportAcknowledged`, or refused on `onProtocolError`. */
  sendReportPlayer(networkId: number, reason: string): void;

  // — player trade -----------------------------------------------------------

  /** Propose a trade with a visible player on the same map. */
  sendTradeRequest(networkId: number): void;
  /** Accept the pending proposal. Both sides then get `onTradeStarted`. */
  sendTradeAccept(): void;
  /** Turn the pending proposal down. The proposer hears `onTradeDeclined`. */
  sendTradeDecline(): void;
  /**
   * Replace this side's whole offer. Every id must be in this player's bag
   * or the offer is refused; changing it after confirming cancels the trade.
   */
  sendTradeOffer(itemIds: string[], gold: number): void;
  /** Confirm, or take a confirmation back. Both sides confirmed triggers the exchange. */
  sendTradeConfirm(confirmed: boolean): void;
  /** Call the trade off. Both sides get `onTradeCancelled` with `"cancelled"`. */
  sendTradeCancel(): void;

  // — duels ------------------------------------------------------------------

  /** Success is silent here: the target hears on their next tick. */
  sendDuelRequest(networkId: number): void;
  sendDuelAccept(): void;
  sendDuelDecline(): void;
  /** Concede. Always allowed mid-fight, whatever this player's health is. */
  sendDuelForfeit(): void;

  // — open-world PvP flagging ------------------------------------------------

  /** Flagging decides whether a fight may start; unflagging refuses the next swing, not this one. */
  sendPvpFlagSet(flagged: boolean): void;

  // — talents ------------------------------------------------------------------

  /** Buy one more rank of a talent. Answered with `onTalentState` or `onTalentRefused`. */
  sendTalentLearn(talentId: number): void;

  // — instance entry ---------------------------------------------------------

  /**
   * Enter this session's instance copy of a map. Answered only by the usual
   * `world.loading`/`world.entered`; no message says "you are in an
   * instance". The server resolves the copy from the party leader.
   */
  sendInstanceEnter(mapId: number, position?: [number, number, number], yaw?: number): void;
  /**
   * Reset every dungeon this player owns: the team's when they lead one,
   * their own when alone. Answered by `onDungeonsRestarted`, or refused with
   * `dungeon_reset_refused` while anyone is still inside.
   */
  sendDungeonRestart(): void;
  /**
   * Choose Normal or Legend for every dungeon this player owns. Answered by
   * `onDungeonModeChosen`, or refused with `dungeon_mode_refused` while anyone
   * is still inside one, or for a team member who does not lead.
   */
  sendDungeonChooseMode(mode: DungeonMode): void;
  /** Buy the next storage rung. `slots` is the new capacity, not an increment. */
  sendUpgradeStorage(area: StorageArea, slots: number): void;
  sendBusRequest(from: number, to: number): void;
  sendBusConfirm(from: number, to: number): void;

  /** Open a body. Answered by `onLootContents`. */
  sendLootOpen(networkId: number): void;
  /** Required: the container stays busy, and unopenable by anyone, until this arrives. */
  sendLootClose(networkId: number): void;
  /** Take one row, by the slot the row itself carries. */
  sendLootTake(networkId: number, slot: number): void;
  /** Take the coin. Its own request; the wire's way of saying so is private. */
  sendLootTakeMoney(networkId: number): void;
  sendCastSpell(spellId: number, targetNetworkId: number): void;
  sendCancelSpell(spellId: number): void;
  sendDismount(): void;
  /** Refused unless the account is an administrator. */
  sendAdminTeleport(mapId: number, x: number, z: number): void;
  /** Spawn stress-test bots near the player; dev/operator only. */
  sendStressTest(count: number): void;
  sendAttackStart(targetNetworkId: number): void;
  /** Save one action bar slot back to the server. */
  sendActionSlot(record: ActionBarRecord): void;
  /** Released spirit while dead; "stuck, send me to a graveyard anyway" while alive. */
  sendPlayerUnstuck(): void;
  /** Walkable ground around the player; non-operators get `onProtocolError`. */
  sendNavigationRequest(radius?: number): void;
}

/** Single-player stand-in: nothing is replicated, the client owns itself. */
export class OfflineConnection implements GameConnection {
  readonly name = 'offline';
  connected = false;

  async connect(events: ConnectionEvents): Promise<void> {
    this.connected = true;
    events.onConnected?.();
  }

  disconnect(): void {
    this.connected = false;
  }

  // No account, no characters, already in the world. These exist so a caller
  // need not branch on which transport it holds.
  login(): void {
    // Nothing to authenticate against.
  }

  listCharacters(): void {
    // No account, so no characters.
  }

  returnToCharacterList(): void {
    // No account, so no list to go back to.
  }

  chooseCharacter(): void {
    // Already in the world.
  }

  createCharacter(): void {
    // No account to hang a character on.
  }

  deleteCharacter(): void {
    // No account to take one off.
  }

  askOutfit(): void {
    // No account, so nothing is being made.
  }

  sendPlayerPosition(): void {
    // Nothing to tell.
  }

  sendChat(): void {
    // Nothing to tell.
  }

  sendWhisper(): void {
    // Nobody to tell it to.
  }

  sendEmote(): void {
    // Nobody to see it.
  }

  sendTarget(): void {}
  sendNpcTalk(): void {}
  sendNpcPreviousPage(): void {}
  sendNpcPickOption(): void {}
  sendQuestStatus(): void {}
  sendQuestList(): void {}
  sendQuestAccept(): void {}
  sendQuestComplete(): void {}
  sendQuestDestroy(): void {}
  sendQuestShare(): void {}
  sendQuestShareAnswer(): void {}
  sendQuestRefreshStatuses(): void {}
  sendTeleportRequest(): void {}
  sendVendorOpen(): void {}
  sendVendorBuy(): void {}
  sendVendorSell(): void {}
  sendAuctionList(): void {}
  sendAuctioneerOpen(): void {}
  sendAuctionBrowse(): void {}
  sendAuctionCancel(): void {}
  sendAuctionBid(): void {}
  sendAuctionBuyout(): void {}
  sendStaticObjectInteract(): void {}
  sendInventoryMove(): void {}
  sendInventoryEquip(): void {}
  sendInventoryUse(): void {}
  sendInventoryDestroy(): void {}
  sendInventorySplit(): void {}
  sendInventorySort(): void {}
  sendOpenBank(): void {}
  sendMailOpen(): void {}
  sendSummonOpen(): void {}
  sendSummonRequest(): void {}
  sendSummonAnswer(): void {}
  sendMailSend(): void {}
  sendMailRead(): void {}
  sendMailClaim(): void {}
  sendMailDelete(): void {}
  // Every one of these needs a second player or a server-owned roster, and
  // offline has neither — inert rather than faked, the same as mail above.
  sendPartyInvite(): void {}
  sendPartyInviteNamed(): void {}
  sendPartyAccept(): void {}
  sendPartyDecline(): void {}
  sendPartyLeave(): void {}
  sendPartyKick(): void {}
  sendPartyVoteKick(): void {}
  sendPartyVoteKickAnswer(): void {}
  sendGuildFound(): void {}
  sendGuildInvite(): void {}
  sendGuildAccept(): void {}
  sendGuildDecline(): void {}
  sendGuildLeave(): void {}
  sendGuildKick(): void {}
  sendGuildDisband(): void {}
  sendGuildRosterRequest(): void {}
  sendFriendAdd(): void {}
  sendFriendAddNamed(): void {}
  sendWho(): void {}
  sendFriendRemove(): void {}
  sendIgnoreAdd(): void {}
  sendIgnoreRemove(): void {}
  sendSocialListRequest(): void {}
  sendReportPlayer(): void {}
  sendTradeRequest(): void {}
  sendTradeAccept(): void {}
  sendTradeDecline(): void {}
  sendTradeOffer(): void {}
  sendTradeConfirm(): void {}
  sendTradeCancel(): void {}
  sendDuelRequest(): void {}
  sendDuelAccept(): void {}
  sendDuelDecline(): void {}
  sendDuelForfeit(): void {}
  sendPvpFlagSet(): void {}
  sendTalentLearn(): void {}
  sendInstanceEnter(): void {}
  sendDungeonRestart(): void {}
  sendDungeonChooseMode(): void {}
  sendUpgradeStorage(): void {}
  sendBusRequest(): void {}
  sendBusConfirm(): void {}
  sendLootOpen(): void {}
  sendLootClose(): void {}
  sendLootTake(): void {}
  sendLootTakeMoney(): void {}
  sendCastSpell(): void {}
  sendCancelSpell(): void {}
  sendDismount(): void {}
  sendAdminTeleport(): void {}
  sendStressTest(): void {}
  sendAttackStart(): void {}
  sendActionSlot(): void {}
  sendPlayerUnstuck(): void {}
  sendNavigationRequest(): void {}
}

/** Maps a server networkId onto the client's local entity, both ways. */
export class NetworkEntityMap {
  private readonly toLocal = new Map<number, EntityId>();
  private readonly toNetwork = new Map<EntityId, number>();

  link(networkId: number, local: EntityId): void {
    this.toLocal.set(networkId, local);
    this.toNetwork.set(local, networkId);
  }

  local(networkId: number): EntityId | undefined {
    return this.toLocal.get(networkId);
  }

  network(local: EntityId): number | undefined {
    return this.toNetwork.get(local);
  }

  unlink(networkId: number): EntityId | undefined {
    const local = this.toLocal.get(networkId);
    if (local !== undefined) {
      this.toLocal.delete(networkId);
      this.toNetwork.delete(local);
    }
    return local;
  }

  clear(): void {
    this.toLocal.clear();
    this.toNetwork.clear();
  }
}
