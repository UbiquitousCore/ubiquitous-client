/** What can be talked to and what that means; pure, since a failure here is a silent dead click. */

/** The fields these tests read. Anything with them can be asked. */
export interface Interactable {
  npcFlags?: number;
  /** The server says this creature hands out quests. */
  offersQuests?: boolean;
  interactionIcon?: string;
  /** The server's quest verdict for *this* player, once it has arrived. */
  questMark?: string;
  /** A placed object rather than a creature. */
  kind?: string;
  /** A placed object that can be gathered from, such as an ore. */
  gatherable?: boolean;
}

/** The server's object type for something gathered from, such as ore. */
export const GATHERABLE_STATIC_TYPE = 1;

/** NPC flags: the flags that make a body worth clicking. */
const GOSSIP = 1 << 0;
const VENDOR = 1 << 2;
const TELEPORTER = 1 << 25;
/**
 * The flag bit an NPC carries to say it stands an auction house. Written in
 * as a different bit, nothing says so and clicking an auctioneer quietly does
 * nothing.
 */
const AUCTIONEER = 1 << 21;

/** Quest available: the server's status for this player is the authority;
 * whether the creature hands out quests at all stands in only before the
 * first status sweep. */
export function hasQuestForPlayer(entity: Interactable): boolean {
  return entity.questMark !== undefined
    ? entity.questMark !== 'none'
    : entity.offersQuests === true;
}

/** Services pinned on the map: shops and teleporters, the two a player goes looking for. */
const MAP_SERVICE_GROUPS = {
  trade: [2], // vendor
  travel: [25], // teleporter
} as const satisfies Record<string, readonly number[]>;

const MAP_SERVICE_MASK = Object.values(MAP_SERVICE_GROUPS)
  .flat()
  .reduce((mask, bit) => (mask | (1 << bit)) >>> 0, 0);

/** Whether a creature with these NPC flags gets a service pin on the map. */
export function showsOnMap(npcFlags: number): boolean {
  return ((npcFlags >>> 0) & MAP_SERVICE_MASK) !== 0;
}

/** Whether a click does anything; icons are full paths, so the test is `includes`. */
export function isInteractable(entity: Interactable): boolean {
  const flags = entity.npcFlags ?? 0;
  return (
    (flags & (GOSSIP | VENDOR | TELEPORTER)) !== 0 ||
    entity.offersQuests === true ||
    entity.gatherable === true ||
    hasQuestForPlayer(entity) ||
    entity.interactionIcon?.includes('ui_head_') === true
  );
}

/** Which screen, or which request, talking to a body leads to. */
export type Service =
  | 'travel'
  | 'storage'
  | 'mail'
  | 'summon'
  | 'quests'
  | 'shop'
  | 'auction'
  | 'talk'
  | 'use';

/**
 * What talking to a body opens, in order: the teleport map (local), storage,
 * mailbox and summon stone by head icon, quests, shop, auction, conversation; a placed
 * object with none is used (the server decides), a creature does nothing.
 */
export function serviceFor(entity: Interactable): Service | null {
  const flags = entity.npcFlags ?? 0;
  const icon = entity.interactionIcon ?? '';
  if ((flags & TELEPORTER) !== 0 || icon.endsWith('ui_head_teleport.png')) return 'travel';
  if (icon.endsWith('ui_head_storage.png')) return 'storage';
  if (icon.endsWith('ui_head_mail.png')) return 'mail';
  if (icon.endsWith('ui_head_summon.png')) return 'summon';
  if (hasQuestForPlayer(entity)) return 'quests';
  if ((flags & VENDOR) !== 0) return 'shop';
  if ((flags & AUCTIONEER) !== 0) return 'auction';
  if ((flags & GOSSIP) !== 0 || icon.endsWith('ui_head_chat.png')) return 'talk';
  return entity.kind === 'static' ? 'use' : null;
}

/** The body ray wins; a floating mark stands in only when no body was hit, never extending a body upward. */
export function tappedBody<T>(body: T | null, mark: T | null): T | null {
  return body ?? mark;
}

// ---------------------------------------------------------------------------
// What a tap means, and how close it has to get
// ---------------------------------------------------------------------------

/** A tap either picks a body out, or acts on the one already picked. */
export type TapAction = 'select' | 'interact';

/** Whether a tap targets a body or commits: first tap targets only; a second
 * tap on the already-targeted body commits (`doubleTap` is that second tap
 * arriving quickly). Tapping a floating interaction mark targets and acts at
 * once. */
export function tapAction(input: {
  alreadyTargeted: boolean;
  markWasHit: boolean;
  doubleTap: boolean;
}): TapAction {
  if (input.markWasHit) return 'interact';
  if (input.doubleTap) return 'interact';
  return input.alreadyTargeted ? 'interact' : 'select';
}

/** What committing to a body actually does. */
export type Interaction = 'attack' | 'loot' | 'talk' | 'none';

/** Alive and attackable is a fight, dead a container, else a conversation; aliveness first, since corpses carry no flags. */
export function interactionFor(input: {
  dead: boolean;
  canAttack: boolean;
  interactable: boolean;
}): Interaction {
  if (input.dead) return 'loot';
  if (input.canAttack) return 'attack';
  return input.interactable ? 'talk' : 'none';
}

/** Whether a quest.list reply belongs to the open giver (stale replies from
 * a previously-clicked giver must not draw into the current dialog). */
export function isCurrentGiverReply(currentGiverId: number | null, replyGiverId: number): boolean {
  return currentGiverId !== null && currentGiverId === replyGiverId;
}

/**
 * Whether the hero is allowed to swing at a body.
 *
 * A living creature or player whose relation is `enemy` or `bystander` — the
 * ones the ring draws red or yellow. Nothing drawn green is.
 */
export function canAttack(target: {
  isBody: boolean;
  isDead: boolean;
  enemyOrBystander: boolean;
}): boolean {
  return target.isBody && !target.isDead && target.enemyOrBystander;
}
