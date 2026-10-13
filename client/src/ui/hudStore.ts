/**
 * HUD state: signals, because the writer is the game loop outside Preact.
 * `Game` calls the setters; `ui/` renders and owns none of it.
 */

import { computed, signal } from '@preact/signals';

import type { GossipSpan } from './npcGossip';

import type { MapDirection, MapMarker, MapPlace, MapRegion, MapRouteLeg } from './mapModel';
import type { InventoryItem } from '../net/GameConnection';
import { FIELD_IDS } from '../net/unitFields';
import type { ScreenId } from './screenIds';
import { MINIMAP_DEFAULT_ZOOM } from '../world/minimap';
import type { MinimapWindow } from '../world/minimap';
import type { ViewCover } from '../renderer/viewCentre';

/** What a unit's class spends: mana, morale or vigor. */
export type ResourceType = 'mana' | 'morale' | 'vigor';

/** A class's resource (1 Warrior, 2 Mage, 3 Ranger, 4 Monk): the frame's channel colour. */
export function resourceForClass(classId: number): ResourceType {
  switch (classId) {
    case 1:
      return 'morale'; // Warrior
    case 3:
      return 'vigor'; // Ranger
    // Mage (2) and Monk (4) both use mana.
    default:
      return 'mana';
  }
}

/** A combatant as the HUD needs it, unlike the spawn record `World.Entity`. */
export interface Unit {
  id: string;
  name: string;
  /** The role under the name ("Sample Trainer"), its own line in dashes; omitted when absent. */
  subName?: string;
  level: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  exp?: number;
  expToLevel?: number;
  /** Drives the frame's ring colour and the nameplate's. */
  disposition: 'friendly' | 'neutral' | 'hostile';
  /** Which resource fills the channel: mana (blue), morale (red), vigor (orange). */
  resource?: ResourceType;
  /** The game's class number (1 warrior, 2 mage, 3 ranger, 4 monk); absent where unknown or not a player. */
  classId?: number;
  /** The id the server addresses this body by, where it has one — what a roster row names it by. */
  networkId?: number;
  /** Class or creature type, shown on the target frame. */
  kind?: string;
  /** True once the server says this body is dead. Greys the frame. */
  dead?: boolean;
  /** In a fight, per the server; each frame shows its own unit's marker. */
  inCombat?: boolean;
}

export const player = signal<Unit | null>(null);

/** Copper; its own signal, since a sale moves it alone and two windows show it. */
export const money = signal(0);

export function setMoney(copper: number): void {
  money.value = copper;
}

export function setPlayer(unit: Unit | null): void {
  player.value = unit;
}

/** The hero's class, beside the hero rather than on the unit every frame draws. */
export const heroClass = signal(0);

/** The hero's gender; classes are named per gender. */
export const heroGender = signal(0);

/** One of the hero's attributes: what it is now, and what it is with nothing added. */
export interface HeroStat {
  value: number;
  base: number;
}

export type HeroStatName = 'strength' | 'agility' | 'stamina' | 'wisdom';

export type HeroStats = Record<HeroStatName, HeroStat>;

/** The hero's four attributes, once sent; only the player's own ever are. */
export const heroStats = signal<HeroStats | null>(null);

const STAT_FIELDS: Record<HeroStatName, { value: string; base: string }> = {
  strength: { value: FIELD_IDS.strength, base: FIELD_IDS.baseStrength },
  agility: { value: FIELD_IDS.agility, base: FIELD_IDS.baseAgility },
  stamina: { value: FIELD_IDS.stamina, base: FIELD_IDS.baseStamina },
  wisdom: { value: FIELD_IDS.wisdom, base: FIELD_IDS.baseWisdom },
};

/**
 * Whether something stands on top of a stat — gear, a buff, a talent.
 * The character sheet writes such a stat in green.
 */
export function isRaised(stat: HeroStat): boolean {
  return stat.value > stat.base;
}

/** Fold the attribute values a batch carries into what is known, keeping the rest. */
export function patchHeroStats(
  known: HeroStats | null,
  values: Record<string, number>,
): HeroStats | null {
  const names = Object.keys(STAT_FIELDS) as HeroStatName[];
  const carried = names.some(
    name =>
      values[STAT_FIELDS[name].value] !== undefined || values[STAT_FIELDS[name].base] !== undefined,
  );
  if (!carried) return known;
  return Object.fromEntries(
    names.map(name => {
      const was = known?.[name] ?? { value: 0, base: 0 };
      return [
        name,
        {
          value: values[STAT_FIELDS[name].value] ?? was.value,
          base: values[STAT_FIELDS[name].base] ?? was.base,
        },
      ];
    }),
  ) as HeroStats;
}

/** The figures on the hero's character sheet, by name. */
export const SHEET_FIGURES = [
  'attackPower',
  'hitChance',
  'critChance',
  'spellPower',
  'healingPower',
  'spellHitChance',
  'spellCritChance',
  'armor',
  'armorMitigation',
  'dodgeChance',
  'parryChance',
  'blockChance',
] as const;

export type SheetFigure = (typeof SHEET_FIGURES)[number];

/** The hero's sheet figures once sent; chances in hundredths of a percent. */
export const heroSheet = signal<Partial<Record<SheetFigure, number>> | null>(null);

/** Fold the sheet figures a batch carries into what is known, keeping the rest. */
export function patchHeroSheet(
  known: Partial<Record<SheetFigure, number>> | null,
  values: Record<string, number>,
): Partial<Record<SheetFigure, number>> | null {
  const carried = SHEET_FIGURES.filter(name => values[FIELD_IDS[name]] !== undefined);
  if (!carried.length) return known;
  return {
    ...known,
    ...Object.fromEntries(carried.map(name => [name, values[FIELD_IDS[name]]])),
  };
}

/** What a `player.updated` cannot tell us, because it never carries it. */
export interface PlayerIdentity {
  name: string;
  level: number;
  classId: number;
  /** Which of the two, for the screens that name a class per gender. */
  gender?: number;
  /** The id the server addresses the hero by, once in the world. */
  networkId?: number;
}

/** Fold one `player.updated` into the hero: a patch, never a rebuild (dead, inCombat and the rest survive). */
export function applyPlayerValues(values: Record<string, number>, identity: PlayerIdentity): void {
  heroClass.value = identity.classId;
  heroGender.value = identity.gender ?? heroGender.value;
  const previous = player.value;
  const base: Unit = previous ?? {
    id: 'player',
    name: identity.name,
    level: identity.level,
    health: 0,
    maxHealth: 0,
    mana: 0,
    maxMana: 0,
    disposition: 'friendly',
    resource: resourceForClass(identity.classId),
  };
  heroStats.value = patchHeroStats(heroStats.value, values);
  heroSheet.value = patchHeroSheet(heroSheet.value, values);
  player.value = {
    ...base,
    ...(identity.networkId ? { networkId: identity.networkId } : {}),
    name: identity.name,
    level: values[FIELD_IDS.level] ?? base.level,
    health: values[FIELD_IDS.health] ?? base.health,
    maxHealth: values[FIELD_IDS.maxHealth] ?? base.maxHealth,
    mana: values[FIELD_IDS.power] ?? base.mana,
    maxMana: values[FIELD_IDS.maxPower] ?? base.maxMana,
    exp: values[FIELD_IDS.xp] ?? base.exp ?? 0,
    expToLevel: values[FIELD_IDS.xpToLevel] ?? base.expToLevel ?? 0,
  };
}

/** Server-replicated units available to the target frame. */
export const worldUnits = signal<Unit[]>([]);

/**
 * The id of the current target, or null. An id rather than the unit, so the
 * target frame follows its health and empties when the unit despawns.
 */
export const targetId = signal<string | null>(null);

/** One signal for open-and-which, so "open, showing nothing" cannot exist. */
export const openScreen = signal<ScreenId | null>(null);

/** Tapping the hero's own frame opens the window on the bag. */
export function openCharacterWindow(screen: ScreenId = 'bag'): void {
  openScreen.value = screen;
}

export function closeCharacterWindow(): void {
  openScreen.value = null;
}

/** The viewport the character window covers, in CSS pixels, so the hero stays centred. */
export const viewCover = signal<ViewCover | null>(null);

export function setViewCover(cover: ViewCover | null): void {
  const current = viewCover.value;
  if (current === cover) return;
  if (
    current &&
    cover &&
    current.left === cover.left &&
    current.top === cover.top &&
    current.right === cover.right &&
    current.bottom === cover.bottom
  )
    return;
  viewCover.value = cover;
}

export function showScreen(screen: ScreenId): void {
  openScreen.value = screen;
}

/** One thing the player can say back to an NPC. */
export interface GossipChoice {
  label: string;
  onPick(): void;
}

/**
 * What an NPC is saying, and what can be said back. Drawn on the same page
 * a quest giver uses, without the quest's own parts.
 */
export interface Gossip {
  /** The speaker's name, on the plaque. */
  title: string;
  /** What they say, as runs of words; empty when the page says nothing. */
  text: readonly GossipSpan[];
  choices: readonly GossipChoice[];
  /** Back one page; from the first page, away from the NPC altogether. */
  onBack(): void;
}

export const gossip = signal<Gossip | null>(null);

export function showGossip(value: Gossip): void {
  gossip.value = value;
}

export function closeGossip(): void {
  if (gossip.value !== null) gossip.value = null;
}

export interface DebugInteractionAction {
  label: string;
  onClick(): void;
}

export interface DebugInteraction {
  title: string;
  lines: string[];
  actions: DebugInteractionAction[];
}

export const debugInteraction = signal<DebugInteraction | null>(null);

export function showDebugInteraction(interaction: DebugInteraction): void {
  debugInteraction.value = interaction;
}

export function closeDebugInteraction(): void {
  debugInteraction.value = null;
}

/** One vendor row; `slot` is the vendor's index, named with the item when buying. */
export interface ShopItem {
  id: number;
  slot: number;
  name: string;
  price: number;
  stock: number | null;
}

export interface ShopInteraction {
  vendorName: string;
  currency: string;
  balance?: number;
  items: ShopItem[];
  onBuy(item: ShopItem, quantity: number): void;
  onSell(): void;
  /** Absent with no vendor behind the window, and then nothing is offered. */
  onSellItem?(item: InventoryItem): void;
}

export const shopInteraction = signal<ShopInteraction | null>(null);

export function showShop(interaction: ShopInteraction): void {
  shopInteraction.value = interaction;
}

export function updateShopItems(items: ShopInteraction['items']): void {
  if (shopInteraction.value) shopInteraction.value = { ...shopInteraction.value, items };
}

export function closeShop(): void {
  shopInteraction.value = null;
}

export interface MapState {
  zoneName: string;
  /** The named place the player stands in, when it is in the region on screen; else empty. */
  placeName?: string;
  bounds: [number, number, number, number] | null;
  playerPosition: [number, number, number];
  playerYaw: number;
  markers: MapMarker[];
  imageUrl?: string | null;
  /** The picture with the bus network; null where unshipped, undefined while unchecked. */
  routeImageUrl?: string | null;
  minimapUrl?: string | null;
  /** Where the player stands inside the minimap's composite. */
  minimapWindow?: MinimapWindow | null;
  /** Named places inside the region on screen, for the names overlay. */
  places?: MapPlace[];
  /** Every region the world map lists, in its own order. */
  regions?: MapRegion[];
  /** The regions adjoining the one on screen. */
  neighbours?: Array<{ direction: MapDirection; region: MapRegion }>;
  worldMapUrl?: string | null;
  /** The drawn world picture's size in its own pixels, which its region areas are measured in. */
  worldMapSize?: { width: number; height: number } | null;
  /** The bus legs to draw across the region, for a build with no picture of the network. */
  routes?: MapRouteLeg[];
}

export const mapState = signal<MapState>({
  zoneName: '',
  bounds: null,
  playerPosition: [0, 0, 0],
  playerYaw: 0,
  markers: [],
});
export const mapOpen = signal(false);
/** The map is open for a teleport master, which makes destinations clickable. */
export const mapTeleporting = signal(false);

/** An index into `MINIMAP_ZOOMS`, so HUD and engine agree on the steps. */
export const minimapZoomStep = signal(MINIMAP_DEFAULT_ZOOM);
export function setMinimapZoomStep(step: number): void {
  minimapZoomStep.value = step;
}
export function openMap(): void {
  mapOpen.value = true;
}
export function openTeleportMap(): void {
  mapTeleporting.value = true;
  mapOpen.value = true;
}
export function closeMap(): void {
  mapOpen.value = false;
  mapTeleporting.value = false;
}

/** `Game` rebuilds map state ten times a second; an equal state is dropped so nothing re-renders. */
export function setMapState(state: MapState): void {
  if (sameMapState(mapState.value, state)) return;
  mapState.value = state;
}

/** Whether two map states would draw the same map. Exported for test. */
export function sameMapState(a: MapState, b: MapState): boolean {
  if (
    a.zoneName !== b.zoneName ||
    a.placeName !== b.placeName ||
    a.playerYaw !== b.playerYaw ||
    a.imageUrl !== b.imageUrl ||
    a.routeImageUrl !== b.routeImageUrl ||
    a.minimapUrl !== b.minimapUrl ||
    a.worldMapUrl !== b.worldMapUrl ||
    a.worldMapSize?.width !== b.worldMapSize?.width ||
    a.worldMapSize?.height !== b.worldMapSize?.height ||
    !sameNumbers(a.playerPosition, b.playerPosition) ||
    !sameNumbers(a.bounds, b.bounds) ||
    a.markers.length !== b.markers.length
  ) {
    return false;
  }
  for (let i = 0; i < a.markers.length; i++) {
    const m = a.markers[i]!;
    const n = b.markers[i]!;
    if (
      m.id !== n.id ||
      m.label !== n.label ||
      m.kind !== n.kind ||
      m.iconUrl !== n.iconUrl ||
      !sameNumbers(m.position, n.position)
    ) {
      return false;
    }
  }
  // The rest is small, and rebuilt rather than kept, so compared by content.
  return (
    JSON.stringify(a.minimapWindow ?? null) === JSON.stringify(b.minimapWindow ?? null) &&
    JSON.stringify(a.places ?? []) === JSON.stringify(b.places ?? []) &&
    JSON.stringify(a.regions ?? []) === JSON.stringify(b.regions ?? []) &&
    JSON.stringify(a.neighbours ?? []) === JSON.stringify(b.neighbours ?? []) &&
    JSON.stringify(a.routes ?? []) === JSON.stringify(b.routes ?? [])
  );
}

function sameNumbers(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Switching regions loads art and destinations, so `Game` owns it; the map only asks. */
let mapRegionHandler: (zoneId: number) => void = () => {};
export function setMapRegionHandler(handler: (zoneId: number) => void): void {
  mapRegionHandler = handler;
}
export function selectMapRegion(zoneId: number): void {
  mapRegionHandler(zoneId);
}

let mapTeleportHandler: (marker: MapMarker) => void = () => {};
export function setMapTeleportHandler(handler: (marker: MapMarker) => void): void {
  mapTeleportHandler = handler;
}
export function mapTeleport(marker: MapMarker): void {
  if (marker.kind === 'teleport') mapTeleportHandler(marker);
}

/** Derived from `targetId`, so it never shows stale health. */
export const target = computed<Unit | null>(() => {
  const id = targetId.value;
  if (id === null) return null;
  return (
    worldUnits.value.find(unit => unit.id === id) ?? (player.value?.id === id ? player.value : null)
  );
});

/** Target by id, so a stale snapshot cannot be installed; an unknown id is no target. */
export function setTarget(id: string | null): void {
  targetId.value = id;
}

export function clearTarget(): void {
  targetId.value = null;
}

export function setWorldUnits(units: Unit[]): void {
  const previous = worldUnits.value;
  if (
    previous.length === units.length &&
    units.every((unit, index) => sameUnit(unit, previous[index]))
  ) {
    return;
  }
  worldUnits.value = units;
}

function sameUnit(a: Unit, b: Unit | undefined): boolean {
  return (
    b !== undefined &&
    a.id === b.id &&
    a.name === b.name &&
    a.level === b.level &&
    a.health === b.health &&
    a.maxHealth === b.maxHealth &&
    a.mana === b.mana &&
    a.maxMana === b.maxMana &&
    a.disposition === b.disposition &&
    a.resource === b.resource &&
    a.kind === b.kind &&
    a.subName === b.subName &&
    a.dead === b.dead &&
    // The combat marker reads this; leave it out and the array is never republished for it.
    a.inCombat === b.inCombat
  );
}
