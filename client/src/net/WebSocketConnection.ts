/** The client's one real transport: named JSON messages, the socket and the server-id mapping. No message numbers or byte layouts here. */
import { logger } from '../core/log';
import type { NavigationGroundData, NavPolygon } from '../world/NavigationGround';
import type { Vec3 } from '../world/CollisionWorld';
import { EntityMovementState } from './GameConnection';
import { ITEM_OK } from './itemErrors';
import {
  readChoiceResult,
  readHand,
  readLootable,
  readOutcome,
  readQuestShareResult,
  readSummonResult,
} from './wireCodes';
import type {
  ActionBarRecord,
  AuctionSearchRequest,
  CharacterSummary,
  ChatLine,
  CombatHit,
  EquippedHands,
  WeaponHand,
  ConnectionEvents,
  DungeonMode,
  EntityMove,
  EntitySnapshot,
  HeldAura,
  GameConnection,
  NewCharacter,
  InventoryItem,
  ItemDescription,
  LootContents,
  LootRow,
  MailAttachment,
  MailInboxEntry,
  MailMessage,
  StatBonus,
  QuestCounter,
  QuestGiverStatus,
  QuestObjective,
  QuestItem,
  QuestRecord,
  QuestUpdate,
  QuestArea,
  PartyMember,
  RosterMember,
  SocialListMember,
  StorageArea,
  StorageSlot,
} from './GameConnection';
import {
  INBOUND,
  NetworkIdRegistry,
  OUTBOUND,
  ProtocolError,
  decode,
  encode,
  optionalFinite,
  optionalNumber,
  readBool,
  readNumber,
  readPath,
  readString,
  readXyz,
} from './messages';

const log = logger('net');

/** Well inside the server's one-minute silence limit. */
const HEARTBEAT_MS = 20_000;

/** The primary bar's size, for the wire's combined slot index, which is the transport's business. */
const PRIMARY_BAR_SLOTS = 6;

/** The server's quest-status words (its `docs/architecture/wire-codes.md`) as our statuses. */
const QUEST_STATUS_WORDS: Readonly<Record<string, QuestGiverStatus>> = {
  none: 'none',
  offered: 'available',
  underway: 'incomplete',
  complete: 'finished',
};

function readQuestStatus(value: unknown, type: string): QuestGiverStatus {
  const status = typeof value === 'string' ? QUEST_STATUS_WORDS[value] : undefined;
  if (status === undefined) throw new ProtocolError(`${type}: status is invalid`);
  return status;
}

/** A quest change, never the whole quest: absent fields stay absent, or defaults would wipe the log. */
function readQuestUpdate(value: unknown, type: string): QuestUpdate {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ProtocolError(`${type}: quest must be an object`);
  const row = value as Record<string, unknown>;
  const update: QuestUpdate = { id: readNumber(row, 'id', type) };
  if (row.status !== undefined) update.status = readQuestStatus(row.status, type);
  if (typeof row.readyToHandIn === 'boolean') update.readyToHandIn = row.readyToHandIn;
  if (typeof row.slot === 'number') update.slot = row.slot;
  if (typeof row.giverId === 'number') update.giverId = row.giverId;
  for (const field of [
    'titleStringId',
    'detailsStringId',
    'completionStringId',
    'incompleteStringId',
    'minLevel',
  ] as const) {
    if (typeof row[field] === 'number') update[field] = row[field] as number;
  }
  const objectives = questObjectives(row.objectives);
  if (objectives) update.objectives = objectives;
  // `counters` is the delta for the over-head lines; `objectives` is the log's
  // snapshot; `progress` is a display string.
  const counters = questCounters(row.counters);
  if (counters) update.counters = counters;
  // The guide arrow's zones: the next objective's while open, the hand-in once ready.
  const guideZones = questZones(row.guideZones);
  if (guideZones) update.guideZones = guideZones;
  const handInZone = questArea(row.handInZone);
  if (handInZone) update.handInZone = handInZone;
  return update;
}

/** One requirement slot moving, applied onto the logged objectives. */
function questCounters(value: unknown): QuestCounter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const counters: QuestCounter[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const kind = row.kind;
    if (typeof row.index !== 'number' || typeof row.count !== 'number') continue;
    if (kind !== 'killed' && kind !== 'held' && kind !== 'triggered') continue;
    counters.push({ index: row.index, kind, count: row.count });
  }
  return counters;
}

function questItems(value: unknown): QuestItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: QuestItem[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const row = raw as Record<string, unknown>;
    const num = (field: string): number =>
      typeof row[field] === 'number' ? (row[field] as number) : 0;
    out.push({
      entry: num('entry'),
      nameTextId: num('nameTextId'),
      quality: num('quality'),
      count: num('count'),
    });
  }
  return out;
}

function questArea(value: unknown): QuestArea | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const num = (field: string): number =>
    typeof row[field] === 'number' ? (row[field] as number) : 0;
  return {
    id: num('id'),
    mapId: num('mapId'),
    x: num('x'),
    y: num('y'),
    z: num('z'),
    radius: num('radius'),
  };
}

function questZones(value: unknown): QuestArea[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(questArea).filter((zone): zone is QuestArea => zone !== null);
}

function questObjectives(value: unknown): QuestObjective[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((raw, index) => {
    const row = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const count = (field: string): number =>
      typeof row[field] === 'number' ? (row[field] as number) : 0;
    return {
      index: typeof row.index === 'number' ? row.index : index,
      killed: count('killed'),
      triggered: count('triggered'),
      held: count('held'),
      objectiveItem: count('objectiveItem'),
      objectiveItemCount: count('objectiveItemCount'),
      goalCount: count('goalCount'),
      objectiveStringId: count('objectiveStringId'),
    };
  });
}

/** Wire quest: ids only (text resolved locally); all fields but id optional
 * (partial progress pushes must not wipe known state). */
function readQuest(value: unknown, type: string): QuestRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ProtocolError(`${type}: quest must be an object`);
  const row = value as Record<string, unknown>;
  const id = readNumber(row, 'id', type);
  const optional = (field: string): number | undefined =>
    typeof row[field] === 'number' ? (row[field] as number) : undefined;
  return {
    id,
    // The id is a poor name but an honest one, and it is replaced the moment
    // the string table answers.
    name: typeof row.name === 'string' ? row.name : `Quest ${id}`,
    titleStringId: optional('titleStringId'),
    detailsStringId: optional('detailsStringId'),
    completionStringId: optional('completionStringId'),
    incompleteStringId: optional('incompleteStringId'),
    // A log entry's status is derived when absent, rather than losing the whole log.
    status:
      row.status === undefined
        ? row.readyToHandIn === true
          ? 'finished'
          : 'incomplete'
        : readQuestStatus(row.status, type),
    readyToHandIn: typeof row.readyToHandIn === 'boolean' ? row.readyToHandIn : undefined,
    objectives: questObjectives(row.objectives),
    guideZones: questZones(row.guideZones),
    handInZone: questArea(row.handInZone),
    rewards: questItems(row.rewards),
    rewardChoices: questItems(row.rewardChoices),
    rewardMoney: optional('rewardMoney'),
    // Absent on an offer (no slot yet); 0 is a real slot and would drop the wrong quest.
    slot: optional('slot'),
    minLevel: optionalNumber(row, 'minLevel', 0),
    objective: typeof row.objective === 'string' ? row.objective : undefined,
    progress: typeof row.progress === 'string' ? row.progress : undefined,
    tracked: row.tracked === true,
  };
}

/** A slot, or null: an item in flight or an empty swap side has none. */
function storageSlot(value: unknown): StorageSlot | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const slot = value as Record<string, unknown>;
  const area = slot.area;
  if (area !== 'equipment' && area !== 'bag' && area !== 'bank') return null;
  const index = slot.index;
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
  return { area, index };
}

function statList(value: unknown): StatBonus[] {
  if (!Array.isArray(value)) return [];
  return value.map(entry => {
    const stat = (entry ?? {}) as Record<string, unknown>;
    return { type: optionalNumber(stat, 'type', 0), value: optionalNumber(stat, 'value', 0) };
  });
}

function itemDescription(value: unknown): ItemDescription {
  const proto = (typeof value === 'object' && value !== null ? value : {}) as Record<
    string,
    unknown
  >;
  const damage = Array.isArray(proto.damage) ? proto.damage : [];
  const spells = Array.isArray(proto.spells) ? proto.spells : [];
  return {
    entry: optionalNumber(proto, 'entry', 0),
    itemClass: optionalNumber(proto, 'itemClass', 0),
    subClass: optionalNumber(proto, 'subClass', 0),
    nameTextId: optionalNumber(proto, 'nameTextId', 0),
    displayInfoId: optionalNumber(proto, 'displayInfoId', 0),
    quality: optionalNumber(proto, 'quality', 0),
    flags: optionalNumber(proto, 'flags', 0),
    buyPrice: optionalNumber(proto, 'buyPrice', 0),
    sellPrice: optionalNumber(proto, 'sellPrice', 0),
    currency: optionalNumber(proto, 'currency', 0),
    inventoryType: optionalNumber(proto, 'inventoryType', 0),
    itemLevel: optionalNumber(proto, 'itemLevel', 0),
    requiredLevel: optionalNumber(proto, 'requiredLevel', 0),
    // A maximum stack of zero would make every stack look overfull, and the
    // table genuinely holds zero for items that were never meant to stack.
    maxStack: Math.max(1, optionalNumber(proto, 'maxStack', 1)),
    containerSlots: optionalNumber(proto, 'containerSlots', 0),
    stats: statList(proto.stats),
    damage: damage.map(entry => {
      const band = (entry ?? {}) as Record<string, unknown>;
      return {
        min: optionalNumber(band, 'min', 0),
        max: optionalNumber(band, 'max', 0),
        type: optionalNumber(band, 'type', 0),
      };
    }),
    armour: optionalNumber(proto, 'armour', 0),
    delay: optionalNumber(proto, 'delay', 0),
    range: optionalNumber(proto, 'range', 0),
    spells: spells.map(entry => {
      const spell = (entry ?? {}) as Record<string, unknown>;
      return {
        id: optionalNumber(spell, 'id', 0),
        trigger: optionalNumber(spell, 'trigger', 0),
        chance: optionalNumber(spell, 'chance', 0),
        cooldown: optionalNumber(spell, 'cooldown', 0),
        category: optionalNumber(spell, 'category', 0),
        sharedCooldown: optionalNumber(spell, 'sharedCooldown', 0),
      };
    }),
    bonding: optionalNumber(proto, 'bonding', 0),
    descriptionStringId: optionalNumber(proto, 'descriptionStringId', 0),
    maxDurability: optionalNumber(proto, 'maxDurability', 0),
    expiresAfter: optionalNumber(proto, 'expiresAfter', 0),
  };
}

function inventoryItem(value: unknown, type: string): InventoryItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolError(`${type}: item must be an object`);
  }
  const item = value as Record<string, unknown>;
  const prototype = itemDescription(item.details);
  return {
    id: readString(item, 'id', type),
    slot: storageSlot(item.slot),
    entry: optionalNumber(item, 'entry', prototype.entry),
    namePrefixId: optionalNumber(item, 'prefixId', 0),
    nameTextId: optionalNumber(item, 'nameTextId', prototype.nameTextId),
    prefixTextId: optionalNumber(item, 'prefixTextId', 0),
    itemClass: optionalNumber(item, 'itemClass', prototype.itemClass),
    subClass: optionalNumber(item, 'subClass', prototype.subClass),
    quality: optionalNumber(item, 'quality', prototype.quality),
    // A stack of zero is a stack of one: the server leaves the count unset
    // for anything that does not stack.
    count: Math.max(1, optionalNumber(item, 'count', 1)),
    duration: optionalNumber(item, 'duration', 0),
    durability: optionalNumber(item, 'durability', 0),
    maxDurability: optionalNumber(item, 'maxDurability', prototype.maxDurability),
    flags: optionalNumber(item, 'flags', 0),
    stats: statList(item.stats),
    prototype,
  };
}

function itemList(value: unknown, type: string): InventoryItem[] {
  return Array.isArray(value) ? value.map(entry => inventoryItem(entry, type)) : [];
}

/** A mail attachment as entry and count, never a live id; each lands as a new stack on claim. */
function mailAttachment(value: unknown): MailAttachment {
  const row = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    entry: optionalNumber(row, 'entry', 0),
    count: Math.max(1, optionalNumber(row, 'count', 1)),
  };
}

function mailAttachmentList(value: unknown): MailAttachment[] {
  return Array.isArray(value) ? value.map(mailAttachment) : [];
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** One inbox row; older servers omit `itemCount`/`itemsClaimed`, read as none. */
function mailInboxEntry(value: unknown): MailInboxEntry {
  const row = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  return {
    id: typeof row.id === 'string' ? row.id : '',
    senderName: typeof row.senderName === 'string' ? row.senderName : '',
    subject: typeof row.subject === 'string' ? row.subject : '',
    gold: optionalNumber(row, 'gold', 0),
    sentAt: optionalNumber(row, 'sentAt', 0),
    read: row.read === true,
    goldClaimed: row.goldClaimed === true,
    itemCount: optionalNumber(row, 'itemCount', 0),
    itemsClaimed: row.itemsClaimed === true,
  };
}

/**
 * The server's walkable ground. Vertices are flattened (x, y, z, ...); a
 * trailing part-triple is dropped. `standingOn` and `groundY` are absent when
 * nothing walkable covers the player.
 */
function navigationGround(payload: Record<string, unknown>, type: string): NavigationGroundData {
  const rows = Array.isArray(payload.polygons) ? payload.polygons : [];
  const polygons: NavPolygon[] = [];
  for (const row of rows) {
    const entry = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;
    const flat = Array.isArray(entry.vertices) ? entry.vertices : [];
    const vertices: Vec3[] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) {
      vertices.push([Number(flat[i]), Number(flat[i + 1]), Number(flat[i + 2])]);
    }
    if (vertices.length < 3) continue;
    polygons.push({
      index: optionalNumber(entry, 'index', polygons.length),
      vertices,
      links: Array.isArray(entry.links) ? entry.links.map(Number) : [],
    });
  }

  const centre = Array.isArray(payload.centre) ? payload.centre.map(Number) : [];
  const rules = (
    typeof payload.parameters === 'object' && payload.parameters !== null
      ? payload.parameters
      : null
  ) as Record<string, unknown> | null;

  return {
    mapId: readNumber(payload, 'mapId', type),
    baked: payload.baked === true,
    polygonCount: optionalNumber(payload, 'polygonTotal', polygons.length),
    centre: [centre[0] ?? 0, centre[1] ?? 0, centre[2] ?? 0],
    radius: optionalNumber(payload, 'radius', 0),
    truncated: payload.truncated === true,
    parameters: rules
      ? {
          cellSize: optionalNumber(rules, 'cellSize', 0),
          bodyRadius: optionalNumber(rules, 'bodyRadius', 0),
          stepHeight: optionalNumber(rules, 'stepHeight', 0),
          maxSlopeDegrees: optionalNumber(rules, 'maxSlopeDegrees', 0),
          headroom: optionalNumber(rules, 'headroom', 0),
        }
      : null,
    polygons,
    standingOn: typeof payload.standingOn === 'number' ? payload.standingOn : null,
    groundY: typeof payload.groundY === 'number' ? payload.groundY : null,
    playerY: optionalNumber(payload, 'playerY', 0),
  };
}

/** One loot row; `slot` defaults to -1, since a lost slot read as 0 would take row 0. */
function lootRow(value: unknown, type: string): LootRow {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolError(`${type}: loot row must be an object`);
  }
  const row = value as Record<string, unknown>;
  return {
    slot: optionalNumber(row, 'slot', -1),
    itemId: typeof row.itemId === 'string' ? row.itemId : '',
    entry: optionalNumber(row, 'entry', 0),
    namePrefixId: optionalNumber(row, 'prefixId', 0),
    nameTextId: optionalNumber(row, 'nameTextId', 0),
    prefixTextId: optionalNumber(row, 'prefixTextId', 0),
    itemClass: optionalNumber(row, 'itemClass', 0),
    subClass: optionalNumber(row, 'subClass', 0),
    quality: optionalNumber(row, 'quality', 0),
    // As in the bag: an item that does not stack carries no count.
    count: Math.max(1, optionalNumber(row, 'count', 1)),
    displayInfoId: optionalNumber(row, 'displayInfoId', 0),
  };
}

function storageArea(value: unknown): StorageArea {
  return value === 'bank' ? 'bank' : value === 'equipment' ? 'equipment' : 'bag';
}

/** One saved slot; the server already splits the combined index. */
function actionSlotRecord(entry: Record<string, unknown>): ActionBarRecord {
  return {
    bar: entry.bar === 'shortcut' ? 'shortcut' : 'primary',
    slot: typeof entry.slot === 'number' ? entry.slot : 0,
    id:
      typeof entry.id === 'number'
        ? entry.id
        : typeof entry.spellId === 'number'
          ? entry.spellId
          : 0,
    type: typeof entry.type === 'number' ? entry.type : 0,
  };
}

/** Every state the protocol names, for rejecting anything it does not. */
const MOVEMENT_STATES: ReadonlySet<EntityMovementState> = new Set(
  Object.values(EntityMovementState),
);

/** Narrowed so tests drive a scripted fake without a server or a browser. */
export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type SocketFactory = (url: string) => WebSocketLike;

/** `WebSocket.OPEN`, without depending on the global being present. */
const OPEN = 1;

export interface WebSocketConnectionOptions {
  /** Where the server is listening. */
  url: string;
  /** Character to enter as with `dev.enterWorld` (which bypasses authentication); omitted, the caller drives it. */
  characterRef?: string;
  /** Injected in tests. Defaults to the browser's own WebSocket. */
  createSocket?: SocketFactory;
}

/** Each weapon hand, when the server said; otherwise the client looks the item up. */
function readWeapons(value: unknown): EquippedHands | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const hands = value as Record<string, unknown>;
  const hand = (name: string): WeaponHand | null => {
    const raw = hands[name];
    if (typeof raw !== 'object' || raw === null) return null;
    const h = raw as Record<string, unknown>;
    return {
      entry: typeof h.entry === 'number' ? h.entry : 0,
      itemClass: typeof h.itemClass === 'number' ? h.itemClass : 0,
      subClass: typeof h.subClass === 'number' ? h.subClass : 0,
    };
  };
  const mainhand = hand('mainhand');
  const offhand = hand('offhand');
  const ranged = hand('ranged');
  if (!mainhand || !offhand || !ranged) return undefined;
  return { mainhand, offhand, ranged };
}

export class WebSocketConnection implements GameConnection {
  readonly name = 'websocket';

  private socket: WebSocketLike | null = null;
  private events: ConnectionEvents = {};
  private readonly ids = new NetworkIdRegistry();

  /** Outbound sequence. Per-connection and monotonic, as the protocol requires. */
  private outbound = 0;
  /** Highest inbound sequence seen, to notice gaps and reordering. */
  private lastInbound = -1;
  /** The server drops a connection silent for a minute; the screens before the world can be. */
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  private readonly url: string;
  private readonly characterRef: string | undefined;
  private readonly createSocket: SocketFactory;

  constructor(options: WebSocketConnectionOptions) {
    this.url = options.url;
    this.characterRef = options.characterRef;
    this.createSocket =
      options.createSocket ?? ((url: string) => new WebSocket(url) as unknown as WebSocketLike);
  }

  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === OPEN;
  }

  connect(events: ConnectionEvents): Promise<void> {
    if (this.socket !== null) {
      return Promise.reject(new Error('already connected; call disconnect() first'));
    }

    this.events = events;
    this.outbound = 0;
    this.lastInbound = -1;
    this.ids.clear();

    const socket = this.createSocket(this.url);
    this.socket = socket;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      // Distinct from `settled`: a refused connection settles by rejecting
      // without ever connecting, and must not then report a disconnect.
      let opened = false;

      socket.onopen = () => {
        settled = true;
        opened = true;
        log.info(`connected to ${this.url}`);

        if (this.characterRef !== undefined) {
          this.send(OUTBOUND.enterWorld, { characterRef: this.characterRef });
        }

        this.beat();
        this.events.onConnected?.();
        resolve();
      };

      socket.onmessage = event => this.receive(event.data);

      socket.onerror = () => {
        // The browser deliberately withholds the reason for a WebSocket error,
        // so there is nothing more specific to report here.
        if (!settled) {
          settled = true;
          this.teardown();
          reject(new Error(`could not connect to ${this.url}`));
        }
      };

      socket.onclose = event => {
        const reason =
          event.reason !== undefined && event.reason !== ''
            ? event.reason
            : `closed${event.code !== undefined ? ` (${event.code})` : ''}`;

        this.teardown();

        if (!settled) {
          settled = true;
          reject(new Error(`could not connect to ${this.url}: ${reason}`));
          return;
        }
        if (!opened) return; // The error path already rejected; never connected.

        log.info(`disconnected: ${reason}`);
        this.events.onDisconnected?.(reason);
      };
    });
  }

  disconnect(): void {
    const socket = this.socket;
    if (socket === null) return;

    // Drop the handlers before closing so the teardown path does not also fire
    // onDisconnected for a close we asked for.
    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    this.teardown();
    socket.close();
  }

  login(userId: string, passHash: string): void {
    this.send(OUTBOUND.login, { userId, passHash });
  }

  returnToCharacterList(): void {
    this.send(OUTBOUND.returnToCharacters, {});
  }

  listCharacters(): void {
    this.send(OUTBOUND.listCharacters, {});
  }

  chooseCharacter(nameOrGuid: string): void {
    // The server wants a 64-bit id; a name is resolved against the list it sent.
    this.send(OUTBOUND.chooseCharacter, { name: nameOrGuid });
  }

  createCharacter(character: NewCharacter): void {
    // Only what was picked; start location and gear are the server's to decide.
    this.send(OUTBOUND.createCharacter, {
      name: character.name,
      race: character.race,
      class: character.class,
      gender: character.gender,
      appearance: { ...character.appearance },
    });
  }

  deleteCharacter(nameOrGuid: string): void {
    this.send(OUTBOUND.deleteCharacter, { name: nameOrGuid });
  }

  askOutfit(race: number, playerClass: number): void {
    this.send(OUTBOUND.characterOutfit, { race, class: playerClass });
  }

  sendPlayerPosition(
    position: [number, number, number],
    orientation: number,
    moving = true,
    state: EntityMovementState = moving
      ? EntityMovementState.Walking
      : EntityMovementState.Standing,
    velocity?: [number, number, number],
    speed?: number,
  ): void {
    const payload: Record<string, unknown> = {
      x: position[0],
      y: position[1],
      z: position[2],
      yaw: orientation,
      // Always sent explicitly. The server keeps a moving flag per player, and
      // nothing downstream can infer a stop without guessing.
      moving,
      // Which movement state this is. The same vocabulary
      // arrives on `entity.moved`, so both directions name states the same way.
      state,
    };
    // Nested, matching `entity.moved`. Omitted rather than zeroed: no
    // velocity means "difference the positions", not "stopped".
    if (velocity !== undefined) {
      payload.velocity = { x: velocity[0], y: velocity[1], z: velocity[2] };
    }
    if (speed !== undefined) payload.speed = speed;
    this.send(OUTBOUND.move, payload);
  }

  sendChat(channel: string, text: string): void {
    this.send(OUTBOUND.chat, { channel, text });
  }

  sendWhisper(networkId: number, text: string): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.whisper, { targetId: wire, text });
  }

  sendEmote(name: string): void {
    this.send(OUTBOUND.emote, { name });
  }

  sendTarget(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.targetChange, { networkId: wire });
  }

  sendNpcTalk(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.npcTalk, { networkId: wire });
  }

  sendNpcPickOption(networkId: number, menuId: number, choice: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.npcPickOption, { networkId: wire, menuId, choice });
  }

  sendNpcPreviousPage(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.npcPreviousPage, { networkId: wire });
  }

  sendQuestStatus(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.askQuestMark, { networkId: wire });
  }
  sendQuestList(networkId: number, questId = 0): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.questList, { networkId: wire, questId });
  }
  sendQuestAccept(networkId: number, questId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.questAccept, { networkId: wire, questId });
  }
  sendQuestComplete(networkId: number, questId: number, rewardIndex = 0): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined)
      this.send(OUTBOUND.questComplete, { networkId: wire, questId, rewardIndex });
  }
  sendQuestDestroy(slot: number, questId: number): void {
    this.send(OUTBOUND.questDestroy, { slot, questId });
  }
  sendQuestShare(questId: number): void {
    this.send(OUTBOUND.questShare, { questId });
  }
  sendQuestShareAnswer(questId: number, accept: boolean): void {
    this.send(OUTBOUND.questShareAnswer, { questId, accept });
  }
  sendQuestRefreshStatuses(): void {
    this.send(OUTBOUND.questRefreshStatuses, {});
  }

  sendBusRequest(from: number, to: number): void {
    this.send(OUTBOUND.busRequest, { from, to });
  }

  sendBusConfirm(from: number, to: number): void {
    this.send(OUTBOUND.busConfirm, { from, to });
  }

  sendLootOpen(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.lootOpen, { networkId: wire });
  }

  sendLootClose(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.lootClose, { networkId: wire });
  }

  sendLootTake(networkId: number, slot: number): void {
    const wire = this.ids.wireFor(networkId);
    // A row whose slot never arrived holds -1 here, which names no row.
    // Nothing is sent for it; money has a message of its own.
    if (wire !== undefined && slot >= 0) this.send(OUTBOUND.lootTake, { networkId: wire, slot });
  }

  sendLootTakeMoney(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.lootTakeMoney, { networkId: wire });
  }

  sendTeleportRequest(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.npcTeleportAsk, { networkId: wire });
  }

  sendVendorOpen(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.vendorOpen, { networkId: wire });
  }

  sendVendorBuy(networkId: number, slot: number, entry: number, count: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) {
      this.send(OUTBOUND.vendorBuy, { networkId: wire, slot, entry, count });
    }
  }

  sendVendorSell(networkId: number, from: StorageSlot, itemId: string): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.vendorSell, { networkId: wire, from, itemId });
  }

  sendAuctionList(
    from: StorageSlot,
    itemId: string,
    startPrice: number,
    durationHours: number,
    buyoutPrice?: number,
  ): void {
    const payload: Record<string, unknown> = { from, itemId, startPrice, durationHours };
    // Omitted means bid-only.
    if (buyoutPrice !== undefined) payload.buyoutPrice = buyoutPrice;
    this.send(OUTBOUND.auctionList, payload);
  }

  sendAuctioneerOpen(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.auctioneerOpen, { networkId: wire });
  }

  sendAuctionBrowse(search?: AuctionSearchRequest): void {
    const payload: Record<string, unknown> = {};
    // Nothing set narrows nothing, server-side as here, but saying nothing
    // at all is the cleaner form — same omit-when-empty habit as above.
    if (search?.name) payload.query = search.name;
    if (search?.minLevel !== undefined) payload.minLevel = search.minLevel;
    if (search?.maxLevel !== undefined) payload.maxLevel = search.maxLevel;
    if (search?.kinds?.length) payload.kinds = search.kinds;
    if (search?.quality !== undefined) payload.quality = search.quality;
    if (search?.offset) payload.offset = search.offset;
    if (search?.limit) payload.limit = search.limit;
    this.send(OUTBOUND.auctionBrowse, payload);
  }

  sendAuctionCancel(id: string): void {
    this.send(OUTBOUND.auctionCancel, { id });
  }

  sendAuctionBid(id: string, amount: number): void {
    this.send(OUTBOUND.auctionBid, { id, amount });
  }

  sendAuctionBuyout(id: string): void {
    this.send(OUTBOUND.auctionBuyout, { id });
  }

  sendStaticObjectInteract(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.staticObjectInteract, { networkId: wire });
  }

  // — party, guild, trade, duel, PvP and instance entry ----------------------
  // Other players go out under the wire id the registry holds; an unknown
  // local id sends nothing.

  sendPartyInvite(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.partyInvite, { networkId: wire });
  }

  sendPartyInviteNamed(name: string): void {
    if (name.trim()) this.send(OUTBOUND.partyInvite, { name: name.trim() });
  }

  sendPartyAccept(): void {
    this.send(OUTBOUND.partyAccept, {});
  }

  sendPartyDecline(): void {
    this.send(OUTBOUND.partyDecline, {});
  }

  sendPartyLeave(): void {
    this.send(OUTBOUND.partyLeave, {});
  }

  sendPartyKick(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.partyKick, { networkId: wire });
  }

  sendPartyVoteKick(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.partyVoteKick, { networkId: wire });
  }

  sendPartyVoteKickAnswer(agree: boolean): void {
    this.send(OUTBOUND.partyVoteKickAnswer, { agree });
  }

  sendGuildFound(name: string): void {
    this.send(OUTBOUND.guildFound, { name });
  }

  sendGuildInvite(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.guildInvite, { networkId: wire });
  }

  sendGuildAccept(): void {
    this.send(OUTBOUND.guildAccept, {});
  }

  sendGuildDecline(): void {
    this.send(OUTBOUND.guildDecline, {});
  }

  sendGuildLeave(): void {
    this.send(OUTBOUND.guildLeave, {});
  }

  sendGuildKick(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.guildKick, { networkId: wire });
  }

  sendGuildDisband(): void {
    this.send(OUTBOUND.guildDisband, {});
  }

  sendGuildRosterRequest(): void {
    this.send(OUTBOUND.guildRosterRequest, {});
  }

  sendFriendAdd(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    // `targetId`, not `networkId` — see `OUTBOUND.friendAdd`'s own note.
    if (wire !== undefined) this.send(OUTBOUND.friendAdd, { targetId: wire });
  }

  sendFriendAddNamed(name: string): void {
    if (name.trim()) this.send(OUTBOUND.friendAdd, { name: name.trim() });
  }

  sendWho(): void {
    this.send(OUTBOUND.socialWho, {});
  }

  sendFriendRemove(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.friendRemove, { targetId: wire });
  }

  sendIgnoreAdd(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.ignoreAdd, { targetId: wire });
  }

  sendIgnoreRemove(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.ignoreRemove, { targetId: wire });
  }

  sendSocialListRequest(): void {
    this.send(OUTBOUND.socialListRequest, {});
  }

  sendReportPlayer(networkId: number, reason: string): void {
    const wire = this.ids.wireFor(networkId);
    // `targetId`, not `networkId` — see `OUTBOUND.socialReport`'s own note.
    if (wire !== undefined) this.send(OUTBOUND.socialReport, { targetId: wire, reason });
  }

  sendTradeRequest(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    // `targetId`, not `networkId`: the server spells it so for trade and duel (`OUTBOUND`).
    if (wire !== undefined) this.send(OUTBOUND.tradeRequest, { targetId: wire });
  }

  sendTradeAccept(): void {
    this.send(OUTBOUND.tradeAccept, {});
  }

  sendTradeDecline(): void {
    this.send(OUTBOUND.tradeDecline, {});
  }

  sendTradeOffer(itemIds: string[], gold: number): void {
    this.send(OUTBOUND.tradeOffer, { itemIds, gold });
  }

  sendTradeConfirm(confirmed: boolean): void {
    this.send(OUTBOUND.tradeConfirm, { confirmed });
  }

  sendTradeCancel(): void {
    this.send(OUTBOUND.tradeCancel, {});
  }

  sendDuelRequest(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.duelChallenge, { targetId: wire });
  }

  sendDuelAccept(): void {
    this.send(OUTBOUND.duelAccept, {});
  }

  sendDuelDecline(): void {
    this.send(OUTBOUND.duelDecline, {});
  }

  sendDuelForfeit(): void {
    this.send(OUTBOUND.duelForfeit, {});
  }

  sendPvpFlagSet(flagged: boolean): void {
    this.send(OUTBOUND.pvpFlagSet, { flagged });
  }

  sendTalentLearn(talentId: number): void {
    this.send(OUTBOUND.talentLearn, { talentId });
  }

  sendDungeonRestart(): void {
    this.send(OUTBOUND.dungeonRestart, {});
  }

  sendDungeonChooseMode(mode: DungeonMode): void {
    this.send(OUTBOUND.dungeonChooseMode, { mode });
  }

  sendInstanceEnter(mapId: number, position?: [number, number, number], yaw?: number): void {
    const payload: Record<string, unknown> = { mapId };
    // Omitted, not zeroes: the server defaults an absent position.
    if (position !== undefined) {
      payload.pos = { x: position[0], y: position[1], z: position[2] };
    }
    if (yaw !== undefined) payload.yaw = yaw;
    this.send(OUTBOUND.instanceEnter, payload);
  }

  sendInventoryMove(from: StorageSlot, to: StorageSlot): void {
    this.send(OUTBOUND.inventoryMove, { from, to });
  }

  sendInventoryEquip(from: StorageSlot, itemId: string, equip: boolean, to?: StorageSlot): void {
    const payload: Record<string, unknown> = { from, itemId, equip };
    // Omitted rather than sent as a null: absent means "wherever it goes",
    // which is what the server decides for a ring or a trinket.
    if (to !== undefined) payload.to = to;
    this.send(OUTBOUND.inventoryEquip, payload);
  }

  sendInventoryUse(from: StorageSlot, itemId: string, targetNetworkId?: number): void {
    const wire = targetNetworkId === undefined ? undefined : this.ids.wireFor(targetNetworkId);
    this.send(OUTBOUND.inventoryUse, { from, itemId, targetId: wire ?? '' });
  }

  sendInventoryDestroy(from: StorageSlot, itemId: string, count: number): void {
    this.send(OUTBOUND.inventoryDestroy, { from, itemId, count });
  }

  sendInventorySplit(from: StorageSlot, itemId: string, count: number, to: StorageSlot): void {
    this.send(OUTBOUND.inventorySplit, { from, itemId, count, to });
  }

  sendInventorySort(area: StorageArea): void {
    this.send(OUTBOUND.inventorySort, { area });
  }

  sendOpenBank(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.inventoryOpenBank, { networkId: wire });
  }

  sendMailOpen(networkId: number): void {
    const wire = this.ids.wireFor(networkId);
    if (wire !== undefined) this.send(OUTBOUND.mailOpen, { networkId: wire });
  }

  sendSummonOpen(stoneId: number): void {
    const wire = this.ids.wireFor(stoneId);
    if (wire !== undefined) this.send(OUTBOUND.summonOpen, { networkId: wire });
  }

  sendSummonRequest(stoneId: number, memberId: number): void {
    const stone = this.ids.wireFor(stoneId);
    const member = this.ids.wireFor(memberId);
    if (stone !== undefined && member !== undefined)
      this.send(OUTBOUND.summonRequest, { networkId: stone, memberId: member });
  }

  sendSummonAnswer(accept: boolean): void {
    this.send(OUTBOUND.summonAnswer, { accept });
  }

  sendMailSend(
    recipientName: string,
    subject: string,
    body: string,
    gold: number,
    itemIds: string[],
  ): void {
    this.send(OUTBOUND.mailSend, { recipientName, subject, body, gold, itemIds });
  }

  sendMailRead(id: string): void {
    this.send(OUTBOUND.mailRead, { id });
  }

  sendMailClaim(id: string): void {
    this.send(OUTBOUND.mailClaim, { id });
  }

  sendMailDelete(id: string): void {
    this.send(OUTBOUND.mailDelete, { id });
  }

  sendUpgradeStorage(area: StorageArea, slots: number): void {
    this.send(OUTBOUND.inventoryUpgrade, { area, slots });
  }

  sendCastSpell(spellId: number, targetNetworkId: number): void {
    const wire = this.ids.wireFor(targetNetworkId);
    this.send(OUTBOUND.castSpell, {
      spellId,
      targetId: wire ?? '',
    });
  }

  sendCancelSpell(spellId: number): void {
    this.send(OUTBOUND.cancelSpell, { spellId });
  }

  sendDismount(): void {
    this.send(OUTBOUND.dismount, {});
  }

  sendAdminTeleport(mapId: number, x: number, z: number): void {
    this.send(OUTBOUND.adminTeleport, { mapId, x, z });
  }

  sendStressTest(count: number): void {
    this.send(OUTBOUND.stressTest, { count });
  }

  /** Save one slot; on the wire the shortcut bar's indices follow the primary bar's. */
  sendActionSlot(record: ActionBarRecord): void {
    this.send(OUTBOUND.assignActionBar, {
      slot: record.bar === 'shortcut' ? record.slot + PRIMARY_BAR_SLOTS : record.slot,
      id: record.id,
      type: record.type,
    });
  }

  sendAttackStart(targetNetworkId: number): void {
    const wire = this.ids.wireFor(targetNetworkId);
    if (wire !== undefined) this.send(OUTBOUND.attackEngage, { targetId: wire });
  }

  /** Released spirit while dead; "stuck, send me to a graveyard anyway" while alive. */
  sendPlayerUnstuck(): void {
    this.send(OUTBOUND.playerUnstuck, {});
  }

  sendNavigationRequest(radius?: number): void {
    // Omitted when unset, so the server's default stands.
    this.send(OUTBOUND.navigationRequest, radius === undefined ? {} : { radius });
  }

  // -------------------------------------------------------------------------

  /** Melee and ranged hits carry the same record, so they are read the same way. */
  private combatHit(payload: Record<string, unknown>, type: string): CombatHit {
    return {
      attackerId: this.ids.idFor(payload.attackerId, type),
      targetId: this.ids.idFor(payload.targetId, type),
      outcome: readOutcome(payload.outcome),
      damage: optionalNumber(payload, 'damage', 0),
      absorbed: optionalNumber(payload, 'absorbed', 0),
      finalHealth: optionalNumber(payload, 'finalHealth', 0),
      hand: readHand(payload.hand),
    };
  }

  private send(type: string, payload: Record<string, unknown>): void {
    if (!this.connected) {
      // The world keeps simulating while a socket is down, and replaying
      // stale positions later is worse than losing them.
      log.warn(`dropping ${type}, not connected`);
      return;
    }
    this.socket!.send(encode(type, this.outbound++, payload));
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') {
      // The server sends named JSON messages only, so a binary frame is ignored.
      log.error('ignoring a binary message; this client speaks named messages only');
      return;
    }

    let envelope;
    try {
      envelope = decode(data);
    } catch (error) {
      log.error(`malformed message: ${(error as Error).message}`);
      return;
    }

    if (envelope.sequence <= this.lastInbound) {
      // Reported, not repaired: reordering would make this layer decide.
      log.warn(
        `sequence went backwards: ${envelope.sequence} after ${this.lastInbound} (${envelope.type})`,
      );
    }
    this.lastInbound = Math.max(this.lastInbound, envelope.sequence);

    try {
      this.dispatch(envelope.type, envelope.payload);
    } catch (error) {
      if (error instanceof ProtocolError) {
        log.error(`bad payload: ${error.message}`);
        return;
      }
      throw error;
    }
  }

  private dispatch(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case INBOUND.loginResult:
        this.events.onLoginResult?.(
          payload.ok === true,
          readNumber(payload, 'code', type),
          typeof payload.reason === 'string' ? payload.reason : undefined,
        );
        return;

      case INBOUND.characters:
        this.events.onCharacters?.(readCharacters(payload, type), readOfferedRaces(payload));
        return;

      case INBOUND.charactersReturned:
        this.events.onCharactersReturned?.();
        return;

      case INBOUND.pong:
        // Nothing to do: it having arrived at all is the whole point.
        return;

      case INBOUND.characterOutfitted:
        this.events.onOutfit?.(
          readNumber(payload, 'race', type),
          readNumber(payload, 'class', type),
          Array.isArray(payload.equipment)
            ? payload.equipment.filter((id): id is number => typeof id === 'number')
            : [],
        );
        return;

      case INBOUND.characterDeleted:
        this.events.onCharacterDeleted?.(
          payload.ok === true,
          readNumber(payload, 'code', type),
          typeof payload.reason === 'string' ? payload.reason : undefined,
        );
        return;

      case INBOUND.characterCreated:
        this.events.onCharacterCreated?.(
          payload.ok === true,
          readNumber(payload, 'code', type),
          typeof payload.reason === 'string' ? payload.reason : undefined,
        );
        return;

      case INBOUND.characterChosen:
        this.events.onCharacterChosen?.(
          payload.ok === true,
          readNumber(payload, 'code', type),
          typeof payload.reason === 'string' ? payload.reason : undefined,
        );
        return;

      case INBOUND.worldLoading:
        // The map named before the character is in it. Said for every change
        // of map, not only at login.
        this.events.onWorldLoading?.(
          readNumber(payload, 'map', type),
          readXyz(payload, 'pos', type),
        );
        return;

      case INBOUND.worldEntered:
        this.events.onWorldEntered?.(
          readNumber(payload, 'map', type),
          readXyz(payload, 'pos', type),
          // Optional: a server that does not name the player's own body still
          // gets a working world, just no combat feedback about the player.
          payload.self === undefined ? 0 : this.ids.idFor(payload.self, type),
          this.heldAuras(payload.auras, type),
        );
        return;

      case INBOUND.moveAccepted:
        this.events.onPlayerPositionCorrected?.(readXyz(payload, 'pos', type));
        return;

      case INBOUND.playerTeleported:
        this.events.onPlayerTeleported?.(
          readNumber(payload, 'map', type),
          readXyz(payload, 'pos', type),
          optionalNumber(payload, 'yaw', 0),
        );
        return;

      case INBOUND.entitySpawned:
        this.events.onEntitiesAppeared?.([this.snapshot(payload, type)]);
        return;

      case INBOUND.entityMoved: {
        // Read only what is actually there. A position sync has no facing and a
        // hard stop has neither, so neither is required.
        const move: EntityMove = { networkId: this.ids.idFor(payload.networkId, type) };
        if (payload.position !== undefined) move.position = readXyz(payload, 'position', type);

        // Assigned only when present: "not said" must stay off the object.
        const yaw = optionalFinite(payload, 'yaw');
        if (yaw !== undefined) move.orientation = yaw;
        const speed = optionalFinite(payload, 'speed');
        if (speed !== undefined) move.speed = speed;
        const haste = optionalFinite(payload, 'speedBonus');
        if (haste !== undefined) move.speedBonus = haste;
        const pathIndex = optionalFinite(payload, 'pathStep');
        if (pathIndex !== undefined) move.pathStep = pathIndex;

        if (typeof payload.moving === 'boolean') move.moving = payload.moving;
        if (
          typeof payload.state === 'string' &&
          MOVEMENT_STATES.has(payload.state as EntityMovementState)
        ) {
          move.state = payload.state as EntityMovementState;
        }
        if (payload.velocity !== undefined) move.velocity = readXyz(payload, 'velocity', type);
        if (payload.path !== undefined) move.path = readPath(payload, 'path', type);
        if (payload.target !== undefined) move.target = readXyz(payload, 'target', type);

        this.events.onEntitiesMoved?.([move]);
        return;
      }

      case INBOUND.entityRemoved:
        this.events.onEntitiesRemoved?.([this.ids.idFor(payload.networkId, type)]);
        return;

      case INBOUND.worldHiddenObjects: {
        const rows = Array.isArray(payload.positions) ? payload.positions : [];
        this.events.onWorldHiddenObjects?.(
          rows.map(
            (row: Record<string, unknown>) =>
              [
                readNumber(row, 'x', type),
                readNumber(row, 'y', type),
                readNumber(row, 'z', type),
              ] as [number, number, number],
          ),
        );
        return;
      }

      case INBOUND.navigationGround:
        this.events.onNavigationGround?.(navigationGround(payload, type));
        return;

      case INBOUND.dungeonRestarted:
        this.events.onDungeonsRestarted?.(readNumber(payload, 'count', type));
        return;

      case INBOUND.dungeonModeChosen:
        this.events.onDungeonModeChosen?.(
          payload.mode === 'legend' ? 'legend' : 'normal',
          readNumber(payload, 'count', type),
        );
        return;

      case INBOUND.dungeonBarrierOpened:
        this.events.onDungeonBarrierOpened?.(
          String(payload.barrierId ?? ''),
          payload.announce === true,
          {
            minX: readNumber(payload, 'minX', type),
            maxX: readNumber(payload, 'maxX', type),
            minZ: readNumber(payload, 'minZ', type),
            maxZ: readNumber(payload, 'maxZ', type),
          },
          Array.isArray(payload.models) ? payload.models.map(String) : [],
        );
        return;

      case INBOUND.entityLootable:
        this.events.onEntityLootable?.(
          this.ids.idFor(payload.networkId, type),
          readLootable(payload.state),
        );
        return;

      case INBOUND.lootContents: {
        const contents: LootContents = {
          networkId: this.ids.idFor(payload.networkId, type),
          money: optionalNumber(payload, 'money', 0),
          items: Array.isArray(payload.items) ? payload.items.map(row => lootRow(row, type)) : [],
        };
        this.events.onLootContents?.(contents);
        return;
      }

      case INBOUND.lootBusy:
        this.events.onLootBusy?.(this.ids.idFor(payload.networkId, type), payload.busy === true);
        return;

      case INBOUND.lootSlotEmptied: {
        const money = payload.money === true;
        this.events.onLootItemRemoved?.(
          this.ids.idFor(payload.networkId, type),
          this.ids.idFor(payload.looterId, type),
          money,
          // Absent for the coin, which is not a row. Passing 0 instead would
          // make it look like the body's first row had gone.
          money ? undefined : optionalNumber(payload, 'slot', -1),
        );
        return;
      }

      case INBOUND.entityAppearanceChanged:
        this.events.onEntityAppearanceChanged?.(
          this.ids.idFor(payload.networkId, type),
          Array.isArray(payload.equipment)
            ? payload.equipment.filter((id): id is number => typeof id === 'number')
            : [],
          readWeapons(payload.weapons),
        );
        return;

      case INBOUND.entityValuesChanged:
        this.events.onEntityValuesChanged?.({
          networkId: this.ids.idFor(payload.networkId, type),
          values: readNumericRecord(payload.changed, type),
        });
        return;

      case INBOUND.playerValuesChanged:
        this.events.onPlayerValuesChanged?.(readNumericRecord(payload.changed, type));
        return;

      case INBOUND.playerDeath:
        this.events.onPlayerDeath?.(
          // Null is a real answer — the server could not name a killer — and
          // `idFor` refuses one, so it never sees it.
          payload.killerId === null || payload.killerId === undefined
            ? null
            : this.ids.idFor(payload.killerId, type),
          readNumber(payload, 'deathCost', type),
        );
        return;

      case INBOUND.playerExpGained:
        this.events.onPlayerExpGained?.(
          readNumber(payload, 'amount', type),
          readBool(payload, 'levelUp', type),
        );
        return;

      case INBOUND.chat: {
        const message: ChatLine = {
          channel: readString(payload, 'channel', type),
          sender: readString(payload, 'sender', type),
          text: readString(payload, 'text', type),
        };
        this.events.onChat?.(message);
        return;
      }

      case INBOUND.whisperReceived:
        this.events.onWhisperReceived?.(
          this.ids.idFor(payload.senderNetworkId, type),
          readString(payload, 'senderName', type),
          readString(payload, 'text', type),
        );
        return;

      case INBOUND.whisperSent:
        this.events.onWhisperSent?.(
          this.ids.idFor(payload.targetNetworkId, type),
          readString(payload, 'targetName', type),
          readString(payload, 'text', type),
        );
        return;

      case INBOUND.emotePerformed:
        this.events.onEmotePerformed?.(
          this.ids.idFor(payload.networkId, type),
          readNumber(payload, 'id', type),
          readString(payload, 'name', type),
        );
        return;

      case INBOUND.targetChanged:
        this.events.onTargetChanged?.(this.ids.idFor(payload.networkId, type));
        return;

      case INBOUND.npcConversation:
        this.events.onNpcConversation?.(
          this.ids.idFor(payload.networkId, type),
          readNumber(payload, 'entry', type),
        );
        return;

      case INBOUND.npcChoiceResult:
        this.events.onNpcChoiceResult?.(
          this.ids.idFor(payload.networkId, type),
          readNumber(payload, 'menuId', type),
          readNumber(payload, 'choice', type),
          readChoiceResult(payload.result),
        );
        return;

      case INBOUND.questStatuses: {
        const rows = Array.isArray(payload.statuses)
          ? payload.statuses.map(raw => {
              const row = raw as Record<string, unknown>;
              return {
                networkId: this.ids.idFor(row.networkId, type),
                status: readQuestStatus(row.status, type),
              };
            })
          : [];
        this.events.onQuestStatuses?.(rows);
        return;
      }
      case INBOUND.questListUpdated:
        this.events.onQuestList?.(
          this.ids.idFor(payload.giverId, type),
          Array.isArray(payload.quests) ? payload.quests.map(raw => readQuest(raw, type)) : [],
        );
        return;
      case INBOUND.questLog:
        // The whole log, and the only time it is sent: it rides inside the
        // character's own create block, which is why nothing requests it.
        this.events.onQuestLog?.(
          Array.isArray(payload.quests) ? payload.quests.map(raw => readQuest(raw, type)) : [],
        );
        return;
      case INBOUND.questUpdated:
        this.events.onQuestUpdated?.(readQuestUpdate(payload.quest ?? payload, type));
        return;
      case INBOUND.questDetails:
        this.events.onQuestDetails?.(
          this.ids.idFor(payload.giverId, type),
          readQuest(payload, type),
        );
        return;
      case INBOUND.questRemoved:
        this.events.onQuestRemoved?.(readNumber(payload, 'questId', type));
        return;
      case INBOUND.questShareOffered:
        this.events.onQuestShareOffered?.({
          sharerId: this.ids.idFor(payload.sharerId, type),
          sharerName: typeof payload.sharerName === 'string' ? payload.sharerName : '',
          questId: readNumber(payload, 'questId', type),
          titleStringId: optionalNumber(payload, 'titleStringId', 0),
          detailsStringId: optionalNumber(payload, 'detailsStringId', 0),
          minLevel: optionalNumber(payload, 'minLevel', 0),
        });
        return;
      case INBOUND.questShareResult:
        this.events.onQuestShareResult?.({
          memberId: this.ids.idFor(payload.memberId, type),
          memberName: typeof payload.memberName === 'string' ? payload.memberName : '',
          questId: readNumber(payload, 'questId', type),
          result: readQuestShareResult(payload.result),
        });
        return;

      case INBOUND.busFare:
        this.events.onBusFare?.(
          readNumber(payload, 'from', type),
          readNumber(payload, 'to', type),
          readNumber(payload, 'cost', type),
        );
        return;

      case INBOUND.teleportResult:
        this.events.onTeleportResult?.(
          payload.ok === true,
          this.ids.idFor(payload.networkId, type),
        );
        return;

      case INBOUND.vendorItems: {
        const tabs = Array.isArray(payload.tabs)
          ? payload.tabs.map(tab => {
              const value = tab as Record<string, unknown>;
              const rawItems = Array.isArray(value.items) ? value.items : [];
              return {
                tabIndex: optionalNumber(value, 'tabIndex', 0),
                currency: optionalNumber(value, 'currency', 0),
                count: optionalNumber(value, 'count', 0),
                itemDataDecoded: value.itemDataDecoded === true,
                items: rawItems.map(item => {
                  const entry = item as Record<string, unknown>;
                  const stock = entry['stock'];
                  return {
                    slot: optionalNumber(entry, 'slot', 0),
                    entry: optionalNumber(entry, 'entry', 0),
                    nameTextId: optionalNumber(entry, 'nameTextId', 0),
                    displayInfoId: optionalNumber(entry, 'displayInfoId', 0),
                    buyPrice: optionalNumber(entry, 'buyPrice', 0),
                    // Absent or null is unlimited, not zero.
                    stock: typeof stock === 'number' ? stock : null,
                    stackCount: optionalNumber(entry, 'stackCount', 0),
                  };
                }),
              };
            })
          : [];
        this.events.onVendorItems?.(tabs);
        return;
      }

      case INBOUND.itemRefused:
        this.events.onItemError?.(readString(payload, 'code', type));
        return;

      case INBOUND.vendorBuyResult:
        this.events.onVendorBuyResult?.(typeof payload.code === 'string' ? payload.code : ITEM_OK);
        return;

      case INBOUND.vendorSellResult:
        this.events.onVendorSellResult?.(typeof payload.code === 'string' ? payload.code : ITEM_OK);
        return;

      case INBOUND.auctionListed:
        this.events.onAuctionListed?.(
          payload.ok === true,
          typeof payload.id === 'string' ? payload.id : null,
          typeof payload.reason === 'string' ? payload.reason : null,
        );
        return;

      case INBOUND.auctionOpened:
        this.events.onAuctionOpened?.();
        return;

      case INBOUND.auctionListings: {
        const rows = Array.isArray(payload.listings) ? payload.listings : [];
        this.events.onAuctionListings?.(
          rows.map(row => {
            const entry = (typeof row === 'object' && row !== null ? row : {}) as Record<
              string,
              unknown
            >;
            return {
              id: typeof entry.id === 'string' ? entry.id : '',
              sellerName: typeof entry.sellerName === 'string' ? entry.sellerName : '',
              itemEntry: optionalNumber(entry, 'itemEntry', 0),
              itemCount: optionalNumber(entry, 'itemCount', 0),
              startPrice: optionalNumber(entry, 'startPrice', 0),
              listedAt: optionalNumber(entry, 'listedAt', 0),
              expiresAt: optionalNumber(entry, 'expiresAt', 0),
              buyoutPrice:
                typeof entry.buyoutPrice === 'number' && Number.isFinite(entry.buyoutPrice)
                  ? entry.buyoutPrice
                  : undefined,
              currentBid: optionalNumber(entry, 'currentBid', 0),
              highestBidder:
                typeof entry.highestBidder === 'string' ? entry.highestBidder : undefined,
            };
          }),
          optionalNumber(payload, 'total', rows.length),
          optionalNumber(payload, 'offset', 0),
        );
        return;
      }

      case INBOUND.auctionCancelled:
        this.events.onAuctionCancelled?.(
          payload.ok === true,
          readString(payload, 'id', type),
          typeof payload.reason === 'string' ? payload.reason : null,
        );
        return;

      case INBOUND.auctionBidPlaced:
        this.events.onAuctionBidPlaced?.(
          payload.ok === true,
          readString(payload, 'id', type),
          optionalNumber(payload, 'currentBid', 0),
          typeof payload.reason === 'string' ? payload.reason : null,
        );
        return;

      case INBOUND.auctionBought:
        this.events.onAuctionBought?.(
          payload.ok === true,
          readString(payload, 'id', type),
          optionalNumber(payload, 'price', 0),
          typeof payload.reason === 'string' ? payload.reason : null,
        );
        return;

      case INBOUND.protocolError:
        // Lenient on purpose: a parse failure here would turn a refusal into a disconnect.
        this.events.onProtocolError?.(
          typeof payload.code === 'string' ? payload.code : 'unknown',
          typeof payload.reason === 'string' ? payload.reason : 'Request refused.',
        );
        return;

      case INBOUND.partyInviteSent:
        this.events.onPartyInviteSent?.(
          this.ids.idFor(payload.networkId, type),
          readString(payload, 'name', type),
        );
        return;

      case INBOUND.partyInvited:
        this.events.onPartyInvited?.(
          this.ids.idFor(payload.networkId, type),
          readString(payload, 'name', type),
        );
        return;

      case INBOUND.partyDeclined:
        this.events.onPartyDeclined?.(
          this.ids.idFor(payload.networkId, type),
          readString(payload, 'name', type),
        );
        return;

      case INBOUND.partyKicked:
        // Carries the empty roster shape, which the roster message that
        // follows says the same way — this one is only the reason.
        this.events.onPartyKicked?.();
        return;

      case INBOUND.partyRoster:
        this.events.onPartyRoster?.({
          partyId: typeof payload.partyId === 'string' ? payload.partyId : null,
          members: this.partyMembers(payload.members, type),
        });
        return;

      case INBOUND.partyVoteKickAsked:
        this.events.onPartyVoteKickAsked?.({
          initiatorId: this.ids.idFor(payload.initiatorId, type),
          initiatorName: readString(payload, 'initiatorName', type),
          targetId: this.ids.idFor(payload.targetId, type),
          targetName: readString(payload, 'targetName', type),
        });
        return;

      case INBOUND.partyVoteKickRefused:
        this.events.onPartyVoteKickRefused?.({
          memberId: this.ids.idFor(payload.memberId, type),
          memberName: readString(payload, 'memberName', type),
          initiatorId: this.ids.idFor(payload.initiatorId, type),
          initiatorName: readString(payload, 'initiatorName', type),
        });
        return;

      case INBOUND.partyVoteKickEnded:
        this.events.onPartyVoteKickEnded?.({
          targetId: this.ids.idFor(payload.targetId, type),
          targetName: readString(payload, 'targetName', type),
          passed: readBool(payload, 'passed', type),
        });
        return;

      case INBOUND.guildInviteSent:
        this.events.onGuildInviteSent?.(
          this.ids.idFor(payload.networkId, type),
          readString(payload, 'name', type),
        );
        return;

      case INBOUND.guildInvited:
        this.events.onGuildInvited?.(
          this.ids.idFor(payload.networkId, type),
          readString(payload, 'name', type),
          readString(payload, 'guildName', type),
        );
        return;

      case INBOUND.guildFoundPrompt:
        this.events.onGuildFoundPrompt?.(readNumber(payload, 'entry', type));
        return;

      case INBOUND.guildDeclined:
        this.events.onGuildDeclined?.(
          this.ids.idFor(payload.networkId, type),
          readString(payload, 'name', type),
        );
        return;

      case INBOUND.guildKicked:
        this.events.onGuildKicked?.();
        return;

      case INBOUND.guildRoster:
        this.events.onGuildRoster?.({
          guildId: typeof payload.guildId === 'string' ? payload.guildId : null,
          guildName: typeof payload.guildName === 'string' ? payload.guildName : null,
          members: this.rosterMembers(payload.members, type),
        });
        return;

      case INBOUND.socialWhoList:
        this.events.onWhoList?.(this.socialListMembers(payload.players, type));
        return;

      case INBOUND.summonTooLow:
        this.events.onSummonTooLow?.(
          typeof payload.summonerName === 'string' ? payload.summonerName : '',
        );
        return;

      case INBOUND.socialListUpdated:
        // One wire message, both lists — fanned out into the two callbacks
        // a caller actually wants, the same split the store already keeps.
        this.events.onFriendList?.(this.socialListMembers(payload.friends, type));
        this.events.onIgnoreList?.(this.socialListMembers(payload.ignored, type));
        return;

      case INBOUND.reportAcknowledged:
        this.events.onReportAcknowledged?.();
        return;

      case INBOUND.tradeRequested:
        this.events.onTradeRequested?.(this.ids.idFor(payload.fromId, type));
        return;

      case INBOUND.tradeDeclined:
        this.events.onTradeDeclined?.(this.ids.idFor(payload.byId, type));
        return;

      case INBOUND.tradeStarted:
        this.events.onTradeStarted?.(this.ids.idFor(payload.opponentId, type));
        return;

      case INBOUND.tradeUpdated: {
        const rows = Array.isArray(payload.opponentItems) ? payload.opponentItems : [];
        this.events.onTradeUpdated?.({
          opponentId: this.ids.idFor(payload.opponentId, type),
          opponentGold: optionalNumber(payload, 'opponentGold', 0),
          // No slot: the item is still in the other player's bag.
          opponentItems: rows.map(row => {
            const item = (typeof row === 'object' && row !== null ? row : {}) as Record<
              string,
              unknown
            >;
            return {
              id: typeof item.id === 'string' ? item.id : '',
              entry: optionalNumber(item, 'entry', 0),
              count: Math.max(1, optionalNumber(item, 'count', 1)),
            };
          }),
          opponentConfirmed: payload.opponentConfirmed === true,
          yourConfirmed: payload.yourConfirmed === true,
        });
        return;
      }

      case INBOUND.tradeCancelled:
        this.events.onTradeCancelled?.(
          this.ids.idFor(payload.opponentId, type),
          typeof payload.reason === 'string' ? payload.reason : 'cancelled',
        );
        return;

      case INBOUND.tradeCompleted:
        this.events.onTradeCompleted?.(this.ids.idFor(payload.opponentId, type));
        return;

      case INBOUND.duelRequested:
        this.events.onDuelRequested?.(this.ids.idFor(payload.fromId, type));
        return;

      case INBOUND.duelDeclined:
        this.events.onDuelDeclined?.(this.ids.idFor(payload.byId, type));
        return;

      case INBOUND.duelStarted:
        this.events.onDuelStarted?.(
          this.ids.idFor(payload.opponentId, type),
          optionalNumber(payload, 'startsIn', 0),
        );
        return;

      case INBOUND.duelEnded:
        this.events.onDuelEnded?.(
          this.ids.idFor(payload.opponentId, type),
          typeof payload.reason === 'string' ? payload.reason : 'ended',
          optionalNumber(payload, 'health', 0),
          optionalNumber(payload, 'maxHealth', 0),
        );
        return;

      case INBOUND.pvpFlagChanged:
        this.events.onPvpFlagChanged?.(payload.flagged === true);
        return;

      case INBOUND.talentState: {
        const ranks = Array.isArray(payload.ranks)
          ? payload.ranks.flatMap(row => {
              if (typeof row !== 'object' || row === null) return [];
              const { talentId, rank } = row as Record<string, unknown>;
              return typeof talentId === 'number' && typeof rank === 'number' && rank > 0
                ? [{ talentId, rank }]
                : [];
            })
          : [];
        this.events.onTalentState?.(optionalNumber(payload, 'points', 0), ranks);
        return;
      }

      case INBOUND.talentRefused:
        this.events.onTalentRefused?.(
          optionalNumber(payload, 'talentId', 0),
          typeof payload.reason === 'string' ? payload.reason : '',
        );
        return;

      case INBOUND.inventoryUpdated:
        this.events.onInventory?.(
          optionalNumber(payload, 'bagSlots', 0),
          optionalNumber(payload, 'bankSlots', 0),
          itemList(payload.items, type),
        );
        return;

      // The item is the payload, no wrapper; the bulk snapshot repeats the same
      // block. Reading a nested `item` would drop every acquisition until relog.
      case INBOUND.inventoryItemAdded:
        this.events.onInventoryItemAdded?.(inventoryItem(payload, type));
        return;

      case INBOUND.inventoryItemRemoved:
        this.events.onInventoryItemRemoved?.(readString(payload, 'itemId', type));
        return;

      case INBOUND.inventoryItemMoved:
        this.events.onInventoryItemMoved?.(
          readString(payload, 'itemId', type),
          storageSlot(payload.from),
          storageSlot(payload.to),
        );
        return;

      case INBOUND.inventoryItemsSwapped: {
        const side = (value: unknown): { itemId: string; from: StorageSlot | null } => {
          const entry = (typeof value === 'object' && value !== null ? value : {}) as Record<
            string,
            unknown
          >;
          return {
            itemId: typeof entry.itemId === 'string' ? entry.itemId : '',
            from: storageSlot(entry.from),
          };
        };
        this.events.onInventoryItemsSwapped?.(side(payload.first), side(payload.second));
        return;
      }

      case INBOUND.inventoryStackChanged:
        this.events.onInventoryStackChanged?.(
          readString(payload, 'itemId', type),
          storageSlot(payload.slot),
          optionalNumber(payload, 'count', 0),
        );
        return;

      case INBOUND.inventoryEquipResult:
        this.events.onInventoryEquipResult?.(
          typeof payload.code === 'string' ? payload.code : ITEM_OK,
        );
        return;

      case INBOUND.inventorySorted:
        this.events.onInventorySorted?.(payload.ok === true, storageArea(payload.area));
        return;

      case INBOUND.inventoryCapacityChanged:
        this.events.onInventoryCapacityChanged?.(
          storageArea(payload.area),
          optionalNumber(payload, 'capacity', 0),
        );
        return;

      case INBOUND.inventoryBankOpen:
        this.events.onBankOpen?.(payload.open === true);
        return;

      case INBOUND.inventoryBankUpdated:
        this.events.onBankUpdated?.(
          optionalNumber(payload, 'bankSlots', 0),
          itemList(payload.items, type),
        );
        return;

      case INBOUND.mailOpened:
        this.events.onMailOpened?.(payload.open === true);
        return;

      case INBOUND.summonOpened:
        this.events.onSummonOpened?.(
          this.ids.idFor(payload.networkId, type),
          (Array.isArray(payload.members) ? payload.members : []).map(raw => {
            const member = raw as Record<string, unknown>;
            return {
              networkId: this.ids.idFor(member.networkId, type),
              name: typeof member.name === 'string' ? member.name : '',
              canSummon: member.canSummon === true,
            };
          }),
        );
        return;

      case INBOUND.summonAsked:
        this.events.onSummonAsked?.({
          summonerId: this.ids.idFor(payload.summonerId, type),
          summonerName: typeof payload.summonerName === 'string' ? payload.summonerName : '',
          mapId: readNumber(payload, 'map', type),
          position: readXyz(payload, 'pos', type),
        });
        return;

      case INBOUND.summonResult:
        this.events.onSummonResult?.({
          memberId: this.ids.idFor(payload.memberId, type),
          memberName: typeof payload.memberName === 'string' ? payload.memberName : '',
          result: readSummonResult(payload.result),
        });
        return;

      case INBOUND.mailInbox:
        this.events.onMailInbox?.(
          Array.isArray(payload.messages) ? payload.messages.map(mailInboxEntry) : [],
        );
        return;

      case INBOUND.mailMessage: {
        const row = mailInboxEntry(payload);
        const items = mailAttachmentList(payload.items);
        const message: MailMessage = {
          ...row,
          // A letter's own items outrank its count: counted as zero, it offered nothing to take.
          itemCount: Math.max(row.itemCount, items.length),
          body: typeof payload.body === 'string' ? payload.body : '',
          items,
        };
        this.events.onMailMessage?.(message);
        return;
      }

      case INBOUND.mailSent:
        this.events.onMailSent?.(payload.ok === true, optionalString(payload.reason));
        return;

      case INBOUND.mailClaimed:
        this.events.onMailClaimed?.(
          payload.ok === true,
          optionalNumber(payload, 'gold', 0),
          mailAttachmentList(payload.items),
          optionalString(payload.reason),
        );
        return;

      case INBOUND.mailDeleted:
        this.events.onMailDeleted?.(
          payload.ok === true,
          typeof payload.id === 'string' ? payload.id : '',
          optionalString(payload.reason),
        );
        return;

      case INBOUND.spellBookArrived: {
        const rawSpells = payload.spells;
        const spells = Array.isArray(rawSpells)
          ? rawSpells.filter((s): s is number => typeof s === 'number')
          : [];
        const rawBar = payload.actionBar;
        const actionBar = Array.isArray(rawBar) ? rawBar.map(actionSlotRecord) : [];
        this.events.onSpellBook?.(spells, actionBar);
        return;
      }

      case INBOUND.spellLearned: {
        const learned = Array.isArray(payload.spellIds)
          ? payload.spellIds.filter((s): s is number => typeof s === 'number')
          : [];
        this.events.onSpellLearned?.(learned);
        return;
      }

      case INBOUND.spellActionSlot:
        this.events.onActionBarAssigned?.(actionSlotRecord(payload));
        return;

      case INBOUND.spellCasting:
        this.events.onSpellCasting?.(
          this.ids.idFor(payload.casterId, type),
          readNumber(payload, 'spellId', type),
          readNumber(payload, 'castTime', type),
        );
        return;

      case INBOUND.spellReleased: {
        const targets = Array.isArray(payload.targets)
          ? payload.targets.map(id => this.ids.idFor(id, type))
          : [];
        const resisted = Array.isArray(payload.resisted)
          ? payload.resisted.map(id => this.ids.idFor(id, type))
          : [];
        this.events.onSpellReleased?.(
          this.ids.idFor(payload.casterId, type),
          readNumber(payload, 'spellId', type),
          readNumber(payload, 'speed', type),
          targets,
          resisted,
        );
        return;
      }

      case INBOUND.cooldownStarted:
        this.events.onCooldownStarted?.(
          readNumber(payload, 'spellId', type),
          readNumber(payload, 'duration', type),
        );
        return;

      case INBOUND.spellFailed:
        this.events.onSpellFailure?.(
          this.ids.idFor(payload.casterId, type),
          readNumber(payload, 'spellId', type),
          readString(payload, 'reason', type),
        );
        return;

      case INBOUND.spellInterrupted:
        this.events.onSpellInterrupted?.(this.ids.idFor(payload.casterId, type));
        return;

      case INBOUND.attackSwingResult:
        this.events.onSwingResult?.(this.combatHit(payload, type));
        return;

      case INBOUND.attackMeleeStart:
        this.events.onAttackMeleeStart?.(
          this.ids.idFor(payload.attackerId, type),
          this.ids.idFor(payload.targetId, type),
        );
        return;

      case INBOUND.attackRangeStart:
        this.events.onAttackRangeStart?.(
          this.ids.idFor(payload.attackerId, type),
          this.ids.idFor(payload.targetId, type),
        );
        return;

      case INBOUND.attackHalted:
        this.events.onAttackHalted?.(this.ids.idFor(payload.networkId, type));
        return;

      case INBOUND.attackShotFired:
        this.events.onShotFired?.(
          this.ids.idFor(payload.attackerId, type),
          this.ids.idFor(payload.targetId, type),
          readNumber(payload, 'spellVisualId', type),
          readNumber(payload, 'speed', type),
        );
        return;

      case INBOUND.attackShotResult:
        this.events.onShotResult?.(this.combatHit(payload, type));
        return;

      case INBOUND.auraApplied:
        this.events.onAuraApplied?.(
          this.ids.idFor(payload.unitId, type),
          this.ids.idFor(payload.casterId, type),
          readNumber(payload, 'spellId', type),
          readNumber(payload, 'remaining', type),
          readNumber(payload, 'maxDuration', type),
          readNumber(payload, 'harmful', type),
        );
        return;

      case INBOUND.auraEnded:
        this.events.onAuraEnded?.(
          this.ids.idFor(payload.casterId, type),
          this.ids.idFor(payload.unitId, type),
          readNumber(payload, 'spellId', type),
        );
        return;

      case INBOUND.spellOutcome:
        this.events.onSpellOutcome?.(
          this.ids.idFor(payload.casterId, type),
          this.ids.idFor(payload.targetId, type),
          readNumber(payload, 'spellId', type),
          readOutcome(payload.result),
          readNumber(payload, 'damage', type),
          // Absent where the blow changed nothing about the target's health.
          typeof payload.finalHealth === 'number' ? payload.finalHealth : undefined,
          optionalNumber(payload, 'absorbed', 0),
        );
        return;

      case INBOUND.attackEnterCombat:
        this.events.onAttackEnterCombat?.(this.ids.idFor(payload.networkId, type));
        return;

      case INBOUND.attackExitCombat:
        this.events.onAttackExitCombat?.(this.ids.idFor(payload.networkId, type));
        return;

      case INBOUND.playerRevived:
        // The relocation rides the usual `world.loading`/`world.entered`; this is health and power only.
        this.events.onPlayerRevived?.(
          this.ids.idFor(payload.networkId, type),
          readNumber(payload, 'health', type),
          readNumber(payload, 'maxHealth', type),
          readNumber(payload, 'power', type),
          readNumber(payload, 'maxPower', type),
        );
        return;

      case INBOUND.unitDied: {
        // The death position, when the server holds one, stops a corpse finishing its walk.
        const at = payload.pos;
        const pos =
          typeof at === 'object' && at !== null && !Array.isArray(at)
            ? readXyz(payload, 'pos', type)
            : undefined;
        this.events.onUnitDied?.(this.ids.idFor(payload.networkId, type), pos);
        return;
      }

      default:
        // Forward-compatible on purpose: a server that has learned a new message
        // must not break a client that has not.
        log.debug(`ignoring unknown message type "${type}"`);
    }
  }

  /** Identity and transform only; every number is resolved against local game data. */
  private snapshot(payload: Record<string, unknown>, type: string): EntitySnapshot {
    return {
      networkId: this.ids.idFor(payload.networkId, type),
      // Absent on a player spawn; 0 means "not a creature" wherever it is read.
      entry: optionalNumber(payload, 'entry', 0),
      displayInfoId: optionalNumber(payload, 'displayInfoId', 0),
      race: optionalNumber(payload, 'race', 0),
      gender: optionalNumber(payload, 'gender', 0),
      appearance: {
        skin: optionalNumber(payload, 'skin', 0),
        hairStyle: optionalNumber(payload, 'hairStyle', 0),
        hairColour: optionalNumber(payload, 'hairColour', 0),
        face: optionalNumber(payload, 'face', 0),
      },
      weapons: readWeapons(payload.weapons),
      equipment: Array.isArray(payload.equipment)
        ? payload.equipment.filter((id): id is number => typeof id === 'number')
        : [],
      animationId: optionalNumber(payload, 'animationId', 0),
      nameId: optionalNumber(payload, 'nameId', 0),
      subNameId: optionalNumber(payload, 'subNameId', 0),
      level: optionalNumber(payload, 'level', 0),
      class: optionalNumber(payload, 'class', 0),
      health: optionalNumber(payload, 'health', 0),
      maxHealth: optionalNumber(payload, 'maxHealth', 0),
      power: optionalNumber(payload, 'power', 0),
      maxPower: optionalNumber(payload, 'maxPower', 0),
      ...(typeof payload.name === 'string' ? { name: payload.name } : {}),
      ...(typeof payload.npcFlags === 'number' ? { npcFlags: payload.npcFlags >>> 0 } : {}),
      ...(payload.offersQuests === true ? { offersQuests: true } : {}),
      ...(typeof payload.faction === 'number' ? { faction: payload.faction } : {}),
      ...(payload.neverFightsBack === true ? { neverFightsBack: true } : {}),
      ...(Array.isArray(payload.auras) && payload.auras.length > 0
        ? { auras: this.heldAuras(payload.auras, type) }
        : {}),
      dead: payload.dead === true,
      inCombat: payload.inCombat === true,
      lootable: readLootable(payload.loot),
      ...(typeof payload.baseSpeed === 'number' && payload.baseSpeed > 0
        ? { baseSpeed: payload.baseSpeed }
        : {}),
      staticObjectType: optionalNumber(payload, 'staticObjectType', 0),
      canInteract: payload.canInteract === true,
      kind: typeof payload.kind === 'string' ? payload.kind : undefined,
      position: readXyz(payload, 'position', type),
      orientation: readNumber(payload, 'yaw', type),
    };
  }

  /** What a spawn or world entry already wears; the caster's id goes through the registry. */
  private heldAuras(value: unknown, type: string): HeldAura[] {
    if (!Array.isArray(value)) return [];
    return value.map(row => {
      const aura = (typeof row === 'object' && row !== null ? row : {}) as Record<string, unknown>;
      return {
        casterId: this.ids.idFor(aura.casterId, type),
        spellId: readNumber(aura, 'spellId', type),
        remaining: optionalNumber(aura, 'remaining', 0),
        maxDuration: optionalNumber(aura, 'maxDuration', 0),
        harmful: optionalNumber(aura, 'harmful', 0),
      };
    });
  }

  /** Roster rows; a method because each id goes through this connection's registry (members on other maps are first seen here). */
  private rosterMembers(value: unknown, type: string): RosterMember[] {
    if (!Array.isArray(value)) return [];
    return value.map(row => {
      const member = (typeof row === 'object' && row !== null ? row : {}) as Record<
        string,
        unknown
      >;
      return {
        networkId: this.ids.idFor(member.networkId, type),
        name: typeof member.name === 'string' ? member.name : '',
        isLeader: member.isLeader === true,
      };
    });
  }

  /** `party.roster` rows; a row without `online` is online. */
  private partyMembers(value: unknown, type: string): PartyMember[] {
    const rows = Array.isArray(value) ? (value as unknown[]) : [];
    return this.rosterMembers(value, type).map((member, at) => {
      const row = rows[at];
      const online =
        typeof row !== 'object' ||
        row === null ||
        (row as Record<string, unknown>).online !== false;
      return { ...member, online };
    });
  }

  /** `social.listUpdated` rows: `rosterMembers` without `isLeader`. */
  private socialListMembers(value: unknown, type: string): SocialListMember[] {
    if (!Array.isArray(value)) return [];
    return value.map(row => {
      const member = (typeof row === 'object' && row !== null ? row : {}) as Record<
        string,
        unknown
      >;
      const number = (key: string): number | undefined =>
        typeof member[key] === 'number' ? (member[key] as number) : undefined;
      const at = member.position as Record<string, unknown> | undefined;
      const online = member.online === true;
      return {
        networkId: this.ids.idFor(member.networkId, type),
        name: typeof member.name === 'string' ? member.name : '',
        ...(online
          ? {
              online,
              level: number('level'),
              race: number('race'),
              classId: number('class'),
              gender: number('gender'),
              mapId: number('mapId'),
              ...(at &&
              typeof at.x === 'number' &&
              typeof at.y === 'number' &&
              typeof at.z === 'number'
                ? { position: [at.x, at.y, at.z] as [number, number, number] }
                : {}),
            }
          : {}),
      };
    });
  }

  /** The server's id for a local entity, for diagnostics; not on `GameConnection`, which is protocol. */
  wireIdFor(local: number): string | undefined {
    return this.ids.wireFor(local);
  }

  private teardown(): void {
    this.socket = null;
    this.ids.clear();
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  /** Well inside the server's one-minute silence limit, so one lost beat is not fatal. */
  private beat(): void {
    if (this.heartbeat !== null) return;
    this.heartbeat = setInterval(() => {
      if (this.socket === null) return;
      this.send(OUTBOUND.ping, {});
    }, HEARTBEAT_MS);
  }
}

function readNumericRecord(value: unknown, type: string): Record<string, number> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ProtocolError(`${type}: values must be an object`);
  }
  const out: Record<string, number> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'number' || !Number.isFinite(item)) {
      throw new ProtocolError(`${type}: values.${key} must be a finite number`);
    }
    out[key] = item;
  }
  return out;
}

/** The races the server opened; null where it says nothing, taken as whatever the build carries. */
function readOfferedRaces(payload: Record<string, unknown>): number[] | null {
  const raw = payload.races;
  if (!Array.isArray(raw)) return null;
  return raw.filter((race): race is number => typeof race === 'number');
}

/** Read a character list: identity and numbers only, as for a spawn. */
function readCharacters(payload: Record<string, unknown>, type: string): CharacterSummary[] {
  const raw = payload.characters;
  if (!Array.isArray(raw)) {
    throw new ProtocolError(`${type}: characters must be an array`);
  }

  return raw.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new ProtocolError(`${type}: character ${index} is not an object`);
    }
    const character = entry as Record<string, unknown>;
    const appearance = (character.appearance ?? {}) as Record<string, unknown>;
    const equipment = Array.isArray(character.equipment)
      ? character.equipment.filter((id): id is number => typeof id === 'number')
      : [];

    return {
      guid: readString(character, 'guid', type),
      name: readString(character, 'name', type),
      level: optionalNumber(character, 'level', 1),
      xp: optionalNumber(character, 'xp', 0),
      xpToLevel: optionalNumber(character, 'xpToLevel', 0),
      gender: optionalNumber(character, 'gender', 0),
      race: optionalNumber(character, 'race', 0),
      class: optionalNumber(character, 'class', 0),
      displayInfoId: optionalNumber(character, 'displayInfoId', 0),
      appearance: {
        skin: optionalNumber(appearance, 'skin', 0),
        hairStyle: optionalNumber(appearance, 'hairStyle', 0),
        hairColour: optionalNumber(appearance, 'hairColour', 0),
        face: optionalNumber(appearance, 'face', 0),
      },
      mapId: optionalNumber(character, 'mapId', 0),
      position: readXyz(character, 'position', type),
      equipment,
    };
  });
}
