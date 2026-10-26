/**
 * Game — application lifecycle and the frame loop.
 *
 * This is the only place that knows every subsystem exists. Wiring lives here
 * so nothing deeper has to reach sideways for a dependency.
 */

import { DebugTools, NAVIGATION_ANSWER_TIMEOUT_MS } from './DebugTools';
import { installInventoryActions, inventoryHandlers } from './features/inventory/inventory';
import { itemHandlers, vendorHandlers } from './features/vendor/vendor';
import { auctionHandlers } from './features/auction/auction';
import { installMailActions, mailHandlers } from './features/mail/mail';
import { installSummonActions, summonHandlers } from './features/summon/summon';
import { chatCommandHelp, setChatCommandSink } from '../ui/chatCommands';
import { duelHandlers, installDuelActions } from './features/social/duel';
import { Friends } from './features/social/friends';
import { Conversation } from './features/npc/conversation';
import { LootAuras } from './features/loot/lootAuras';
import { LootOpener } from './features/loot/lootOpener';
import { Looting } from './features/loot/looting';
import { FrontEnd } from './features/frontEnd/FrontEnd';
import { GroundStage } from './features/frontEnd/GroundStage';
import { Quests } from './features/quest/quest';
import { QuestMarks } from './features/quest/questMarks';
import { installTradeActions, tradeHandlers } from './features/social/trade';
import { installGuildActions, guildHandlers } from './features/social/guild';
import { installPartyActions, partyHandlers } from './features/social/party';
import { UiArt } from './UiArt';
import { groundHitDistance } from '../world/cameraGround';
import { logger, setLogLevel } from '../core/log';
import { ProviderNotReadyError } from '../core/errors';
import type { ClientConfig } from '../core/config';
import type { FileConfig } from '../core/FileConfig';
import { ResourceSystem } from '../assets/ResourceSystem';
import { WorkerAssetProvider } from '../assets/providers/WorkerAssetProvider';
import { clearAllPacks, storageEstimate, whyNoStorage } from '../assets/vfs/PackStore';
import { pickIpa, reopenIpa, storedIpa } from '../assets/vfs/ipaHandle';
import { avatarLookId, splashId } from '../assets/ids';
import type { Appearance, TextureData, ZoneInfo } from '../assets/types';
import { gameYaw, World } from '../world/World';
import { MINIMAP_ZOOMS, THUMB_SIZE, minimapTextureSize, minimapWindow } from '../world/minimap';
import { FrameClock, browserPage, workerTicker } from './frameClock';
import { MinimapComposite } from './MinimapComposite';
import { drawnRect } from '../world/mapArt';
import type { Entity, EntityId } from '../world/World';
import { LINES, say as sayLine } from '../ui/gameLines';
import type { TurnedAside } from '../gameplay/combatResults';
import { GHOST_ALPHA, Renderer } from '../renderer/Renderer';
import type { Relation } from '../renderer/TargetRing';
import { effect } from '@preact/signals';
import { resolveGraphics, tileWindowFor } from '../core/graphics';
import { HeroShape } from '../gameplay/HeroShape';
import { Input } from '../gameplay/Input';
import type { InputState } from '../gameplay/Input';
import { options as savedOptions, setOption } from '../ui/optionsStore';
import type { OptionsState } from '../ui/optionsStore';
import { DEFAULT_MOVEMENT, PlayerMovement } from '../gameplay/PlayerMovement';
import type { Locomotion } from '../gameplay/PlayerMovement';
import { HeroDeath } from '../gameplay/heroDeath';
import { CastFacing } from '../gameplay/castFacing';
import { TravelNetwork } from '../gameplay/TravelNetwork';
import type { ConnectionEvents, HeldAura } from '../net/GameConnection';
import {
  approachActionNow,
  beginApproach,
  followActionNow,
  heldDirection,
  type ApproachingBody,
  updateApproachProgress,
} from './helpers/combat/autoMove';
import { neighbourRegions } from './helpers/map/areaNeighbours';
import { TOP_ZONE_PRIORITIES, zoneForArrival } from './startingZone';
import { isMissingMapFailure, missingMapOffer } from './helpers/world/missingMap';
import {
  buildStep,
  characterAppearanceRequest,
  fogAccent,
  soundscapePoint,
  stageProgress,
} from './helpers/world/zoneLoading';
import { castTargetFromBar } from './helpers/combat/castSpellFromBar';
import {
  canAttackEntity,
  hasRangedWeaponEquipped,
  interactionWithEntity,
  routeInteraction,
} from './helpers/combat/combatIntent';
import { departureStopNow } from './helpers/map/departureStop';
import { onOwnSideId } from './helpers/combat/entityOwnership';
import { WhoIs } from './WhoIs';
import { detailZonesInTop } from './helpers/map/detailZones';
import { placeNameAt } from './helpers/map/placeName';
import { gatewayRegionsForTop } from './helpers/map/gatewayRegions';
import {
  decideTimedPositionReport,
  movementStateForPosture,
} from './helpers/combat/movementReporting';
import { playerYawFromRotation } from './helpers/combat/playerYaw';
import { teleportDestinationName } from './helpers/map/teleportPrompt';
import { pickTopZoneAt } from './helpers/map/topZoneAt';
import { containsMapDisplayZone } from './helpers/map/mapDisplayZone';
import { collectMapIconRefs, uncachedIconRefs } from './helpers/map/mapIconRefs';
import { mapHudLoads } from './helpers/map/mapHudLoads';
import { mapPlaceForZone } from './helpers/map/mapPlace';
import { networkTwinNetworkIdFor } from './helpers/npc/networkTwin';
import { offlineServiceView } from './helpers/npc/offlineServiceView';
import { routeLegsForTopMap } from './helpers/map/routeLegs';
import { dispatchOnlineService } from './helpers/npc/serviceDispatch';
import { serviceMarkerKind } from './helpers/map/serviceMarkerKind';
import { serviceMarkersForMap } from './helpers/map/serviceMarkers';
import { serviceNetworkIdForInteraction } from './helpers/npc/serviceNetworkId';
import { refusalLines } from './helpers/npc/refusalLines';
import { vendorShopInteraction } from './features/vendor/shopInteractions';
import {
  nextTapState,
  pressFor,
  releaseIsTap,
  tapSelection,
  type PressedPointer,
} from './helpers/combat/tapSelection';
import { pickTargetSelection } from './helpers/combat/selectTarget';
import { topZoneForSubArea } from './helpers/map/travelZone';
import { selectViewZone } from './helpers/map/viewZone';
import { worldEntryPlan } from './helpers/world/worldEntryPlan';
import { AccountSession } from './features/frontEnd/AccountSession';
import { loadSpellBook } from './helpers/spell/loadSpellBook';
import { moneyChange } from './helpers/hud/moneyChange';
import { creatureNameLookups, type NameLookup } from './helpers/hud/creatureNameLookups';
import { hudUnitsFromEntities, remotePlayerNameRelations } from './helpers/hud/worldUnitsView';
import { listedWorldRegions } from './helpers/map/worldRegions';
import { pickZoneAt } from './helpers/map/zoneAt';
import {
  ATTACK_CLIPS,
  defendReaction,
  isCritical,
  restoresHealth,
  showsANumber,
  SWING_LANDS_AFTER_MS,
  ShotsInFlight,
  planSwing,
  SwingQueue,
  turnedAside,
} from '../gameplay/combatResults';
import type { Outcome } from '../net/wireCodes';
import { combatPosture, movementOf, stunnedPosture } from '../gameplay/ClipMachine';
import type { CombatStance, Posture } from '../gameplay/ClipMachine';
import { EntityClips } from '../gameplay/EntityClips';
import { NetworkBodies } from '../gameplay/NetworkBodies';
import { describeCombatEvent } from '../gameplay/combatLog';
import { UNARMED, WEAPON_SLOT, weaponsFromHands } from '../gameplay/weaponClips';
import type { PlayClipOptions } from '../gameplay/CombatVisuals';
import { auraRemovalVisual, castVisualId, CombatVisuals } from '../gameplay/CombatVisuals';
import { AudioEngine } from '../audio/AudioEngine';
import { zoneSoundAt } from '../audio/zoneSound';
import { MoveSounds } from '../gameplay/moveSounds';
import { VoiceGate } from '../gameplay/voiceGate';
import { impactSound, parrySound, swingSound, weaponFamily } from '../gameplay/weaponSounds';
import type { WeaponFamily } from '../gameplay/weaponSounds';
import { clickOf } from './uiClicks';
import type { ItemKind } from '../gameplay/itemSounds';
import type { UnitSoundState, UnitSounds } from '../assets/formats/tables';
import { EntityMovementState, OfflineConnection } from '../net/GameConnection';
import type {
  CharacterSummary,
  EquippedHands,
  WeaponHand,
  GameConnection,
} from '../net/GameConnection';
import { WebSocketConnection } from '../net/WebSocketConnection';
import { BootScreen, Hud } from '../ui/Hud';
import { setCharacters, setOutfit, setStage, say } from '../ui/frontend/frontEndStore';
import { SelectionScene } from '../renderer/SelectionScene';
import { mountGameHud, setCastCallback, setHeadshotSource, setJumpCallback } from '../ui/GameHud';
import { setSessionActions } from '../ui/sessionStore';
import { setBodyStageSource } from '../ui/components/BodyStage';
import {
  closeDebugInteraction,
  closeMap,
  mapOpen,
  openScreen,
  gossip,
  mapTeleporting,
  minimapZoomStep,
  openTeleportMap,
  setMapRegionHandler,
  player,
  setMapState,
  setMapTeleportHandler,
  setMoney,
  setPlayer,
  setTarget,
  setWorldUnits,
  worldUnits as worldUnitsSignal,
  showDebugInteraction,
  openCharacterWindow,
  showShop,
  shopInteraction,
  targetId as hudTargetId,
  applyPlayerValues,
  resourceForClass,
  viewCover,
  closeGossip,
} from '../ui/hudStore';
import {
  appliedFrom,
  auraCancel,
  auraKey,
  clearAura,
  clearAuras,
  setAura,
  setAurasOf,
} from '../ui/auraStore';
import { wantedDialogs, wantedEmblems, wantedPieces } from '../ui/art/pieceStore';
import { NavigationGround } from '../world/NavigationGround';
import {
  bankOpen,
  clearInventory,
  setStorageUpgrades,
  equippedSlots,
  itemFacts,
} from '../ui/inventoryStore';
import { equipmentHomesFor, ITEM_CLASS } from '../ui/items';
import type { MapDirection, MapPlace, MapMarker, MapRegion, MapRouteLeg } from '../ui/mapModel';
import { askTravel, fareWords } from '../ui/travelStore';
import {
  clearPopMessages,
  popExpGained,
  popLevelUp,
  popMessages as popMessagesSignal,
  popMoneyGained,
  tickPopMessages,
} from '../ui/popMessages';
import {
  WHISPER_CHANNEL,
  chatSaid,
  clearChat,
  clearSaid,
  forgetOldSaid,
  noteChat,
  setChatSink,
  setEmoteSink,
  setWhisperSink,
  networkIdOfWhisperTarget,
} from '../ui/chatStore';
import { setDeathActions, setDeathToll } from '../ui/deathStore';
import { closeLoot, lootWindow } from '../ui/lootStore';
import { noteRefusal } from '../ui/protocolNotices';
import { partyActions, resetParty, partyRoster } from '../ui/partyStore';
import { resetSharedQuests } from '../ui/questShareStore';
import { resetGuild } from '../ui/guildStore';
import { addFriendNamed, resetSocialLists } from '../ui/socialListStore';
import { setReportSink } from '../ui/reportStore';
import { setFollowActions, setFollowing } from '../ui/followStore';
import { openInspect, setInspectActions } from '../ui/inspectStore';
import { clearPendingOffer, tradePhase, resetTrade } from '../ui/tradeStore';
import { resetPvp } from '../ui/pvpStore';
import {
  applyWorldEntered as applyInstanceWorldEntered,
  dungeonMode,
  noteInstanceRequested,
  resetInstance,
  setInstanceActions,
} from '../ui/instanceStore';
import {
  clearQuestGiverStatuses,
  clearQuestMessages,
  expireQuestMessages,
  setGuideTargetKnown,
  trackedQuest,
  questConversation,
} from '../ui/questStore';
import { isGhosted, isStunned, speedShare, stealthSight } from '../gameplay/auraState';
import { FIELD_IDS } from '../net/unitFields';
import { spellErrorMessage } from '../net/spellErrors';
import { talentErrorMessage } from '../net/talentErrors';
import { applyTalentState, setTalentActions } from '../gameplay/talents';
import type { AdminControls, AdminPanel } from '../ui/AdminPanel';
import { adminPanelAllowed } from '../core/FileConfig';
import { searchItems } from '../ui/itemSearch';
import type { ItemHit } from '../ui/itemSearch';
import { approachStopDistance } from '../gameplay/approach';
import { showsOnMap, isInteractable, serviceFor, type Service } from '../gameplay/npcInteraction';
import { blowStartsFight } from '../gameplay/relationship';
import { replyToBlow, type PickSeen } from '../gameplay/strikeBack';
import { DEATH_CLIP, GATHER_HELD_ITEMS, GATHER_SPELL_IDS } from '../gameplay/actionClips';
import { guidePlacement, guideTarget } from '../gameplay/questGuide';
import {
  initSpells,
  assignActionBar,
  setActionSlotSink,
  startCast,
  completeCast,
  failCast,
  mayStartCast,
  interruptCast,
  abandonCast,
  startCooldown,
  addDamageNumber,
  floatRise,
  startGlobalCooldown,
  setInCombat,
  type CombatWords,
  tickSpells,
  setSpellName,
  setSpellRank,
  setSpellIcon,
  spellBar as spellBarSignal,
  barSlots as barSlotsSignal,
  floatingNumbers as floatingNumbersSignal,
  reportToPlayer,
  setSpellCastTime,
  setTalentPlaces,
  setClassTrees,
  setMountSpells,
  mountSpells,
  wantedSpellDetails,
  wantedSpellStats,
  wantedTalentWords,
} from '../gameplay/SpellBook';
import { bodyCasts, endBodyCast, forgetBodyCasts, startBodyCast } from '../gameplay/bodyCasts';

/** How far above the terrain the camera boom is kept; the rig adds its own gap on top. */
const CAMERA_GROUND_CLEARANCE = 0.3;

/** How long to wait for a list the server sends on its own, in ms. */
const LIST_PATIENCE = 5000;

/** Set once the player has said they will do without sound, so it is not asked again. */
const NO_SOUND_KEY = 'ubiquitousNoSound';
/** How often the music and ambience are matched to where the hero stands, in seconds. */
const SOUNDSCAPE_EVERY_S = 0.25;
/** Sounds named here are files in the user's sound pack, looked up by name. */
const TITLE_MUSIC = 'm_title';
const LEVEL_UP_SOUND = 'sfx_mc_level_up';
/** The particle file the hero glows with on a new level, found as the spell visual that plays it alone. */
const LEVEL_UP_EFFECT = 'character_buff_levelup_01.beff';
const SKILL_REFUSED_SOUND = 'sfx_ui_ingame_skillbar_skill_unavail';
const BLOCK_SOUND = 'sfx_shield_block_1';
const WINDOW_OPEN_SOUND = 'sfx_ui_menu_window_open';
/** Every weapon family, for decoding their sounds ahead of the first fight. */
const WEAPON_FAMILIES: readonly WeaponFamily[] = [
  'edge',
  'blunt',
  'dagger',
  'fist',
  'parry',
  'arrow',
  'wand',
];
const WINDOW_CLOSE_SOUND = 'sfx_ui_menu_window_close';
const TALENT_ADD_SOUND = 'sfx_ui_menu_talent_point_add';
const TAB_SOUND = 'sfx_ui_menu_tab_select';
const BUTTON_SOUND = 'sfx_ui_menu_select';
/** Own choice: how long a click waits for its press to make a sound of its own, in ms. */
const CLICK_YIELD_MS = 80;
/** Decoded as the world loads so the first of each is not late. */
const HERO_SOUNDS = [
  'sfx_mc_footstep_ground_1',
  'sfx_mc_footstep_wood_1',
  'sfx_mc_footstep_water_1',
  'sfx_mc_jump_land_ground_1',
  'sfx_mc_jump_land_wood_1',
  'sfx_mc_enter_water',
  'sfx_mc_swim_1',
  'sfx_mc_swim_underwater_1',
  'sfx_shield_block_1',
  'sfx_mc_level_up',
  'sfx_ui_menu_window_open',
  'sfx_ui_menu_window_close',
  'sfx_ui_menu_tab_select',
  'sfx_ui_menu_select',
  'sfx_ui_pickup_money',
  'sfx_ui_quest_accept',
  'sfx_ui_quest_complete',
  'sfx_ui_ingame_skillbar_skill_unavail',
];
/**
 * Of the menu confirms, the one with the most weight below 200 Hz and the
 * fewest zero crossings (measured from the 1.1.4 pack).
 */
const SIGN_IN_SOUND = 'sfx_ui_menu_mm_confirm';
const CHARACTER_CREATED_SOUND = 'sfx_ui_menu_character_created';
/** The build's word for each way a blow is turned aside. */
const TURNED_ASIDE_LINE = {
  miss: 'missed',
  dodge: 'dodged',
  parry: 'parried',
  block: 'blocked',
} as const satisfies Record<TurnedAside, keyof typeof LINES>;
const CHARACTER_DELETED_SOUND = 'sfx_ui_menu_character_delete';

const log = logger('game');

const DETAIL_ZONE_PRIORITY = 13;

/**
 * The server's reach for interaction. The bus-teleport handler checks it
 * against the departure stop's coordinates and answers nothing on failure.
 */
const INTERACT_REACH = 10;

/** How long to wait for a fare before deciding the server has ignored us. */
const FARE_TIMEOUT_MS = 3000;

/** Own choice: how long the boot waits for the interface typefaces. */
const FACES_WAIT_MS = 3000;

/** The picture behind the world map. 1024 square, PVRTC, despite the name. */
const WORLD_MAP_TEXTURE = '2d_texture/maps/world.tga';

const PLACEHOLDER_PLAYER_MODEL = 'model/npc/character/human/male/human_m_h.bdae';

/** The map the screens before the world stand on. The second race's map is not used yet. */

/** How often a moving hero's position goes to the server. */
const POSITION_INTERVAL_MS = 100;

/** Attached entities the loading screen waits for; a dense window takes tens of seconds to fully drain. */
const LOAD_SCREEN_SETTLE_THRESHOLD = 300;

/**
 * The player kneels for as long as a corpse's loot window is open: closing
 * the window stands them up, and standing up closes it.
 */

/** Every playable character is on the human faction; nothing read sets it. */
const STARTING_FACTION = 1;

/** How long after asking another player a refusal is taken as the answer to it, in ms. */
const ASK_ANSWER_MS = 5000;

/** The frame art has three ring colours; the ground ring has six. */
const DISPOSITION_OF: Record<Relation, 'friendly' | 'neutral' | 'hostile'> = {
  ally: 'friendly',
  bystander: 'neutral',
  enemy: 'hostile',
  corpse: 'neutral',
  questUnit: 'friendly',
  catchable: 'neutral',
};

/** How far above a body's feet its damage numbers appear, in world units. */
const DAMAGE_NUMBER_HEIGHT = 2;
/** How far over the top of a speaker their words stand, in world units. */
const SAID_CLEARANCE = 0.3;

/** How far below the hero's nameplate pop messages start, in scaled pixels. */
const POP_MESSAGE_DROP = 10;

/** How far a press may travel and still count as a tap, in CSS pixels. */
const TAP_SLOP = 12;

/** Two presses, close together, within this many ms make a double tap. */
const DOUBLE_TAP_MS = 500;

/** Pixels of random spread, so simultaneous hits do not stack into one blur. */
const DAMAGE_NUMBER_SCATTER = 30;

/**
 * A swing or a shot: it runs down on its own and asks for the upper body
 * only. A cast asks for the whole body when its spell's clip says so.
 */
const COMBAT_ACTION: PlayClipOptions = { hold: false, allBody: false };

export interface GameElements {
  canvas: HTMLCanvasElement;
  /** Preact's playable HUD root. */
  gameHud: HTMLElement;
  /** Plain-text diagnostics root. */
  hud: HTMLElement;
  boot: HTMLElement;
}

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly resources: ResourceSystem;
  private readonly art: UiArt;
  /** The developer's view of the running game; the admin panel and the console both use it. */
  readonly debug: DebugTools;
  private readonly world: World;
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly movement: PlayerMovement;
  /** Everything in the world the server owns, as opposed to the player. */
  private readonly bodies: NetworkBodies;
  private readonly whoIs: WhoIs;
  private readonly quests: Quests;
  private readonly questMarks: QuestMarks;
  private readonly conversation: Conversation;
  private readonly lootAuras: LootAuras;
  private readonly looting: Looting;
  private readonly lootOpener: LootOpener;
  private readonly friends: Friends;
  private readonly connection: GameConnection;
  private readonly hud: Hud;
  private readonly boot: BootScreen;
  /** Only when the config asks for it: the panel is its own chunk, so a build without `admin` never fetches it. */
  private admin: Promise<AdminPanel> | null = null;
  private readonly adminWanted: boolean;

  private running = false;
  /** Casts, impacts, auras and projectiles. Everything combat draws. */
  private readonly combat: CombatVisuals;
  /**
   * The server's id for the player's own body. Every combat message about the
   * player uses it. Zero until `world.entered`.
   */
  private selfNetworkId = 0;
  /** Null with the weapon down. */
  private combatStance: CombatStance = null;
  /** So a landing plays the shot only where its leaving did not. */
  private readonly shots = new ShotsInFlight();
  /** So an off-hand swing waits its turn. */
  private readonly swings = new SwingQueue();
  /** The player is not a `NetworkBodies` actor, so the death flag is kept here. */
  private readonly heroDeath = new HeroDeath();
  private readonly castFacing = new CastFacing();
  private playerFaction: number = STARTING_FACTION;
  private pointerDown: PressedPointer | null = null;
  private lastTap: { x: number; y: number; at: number } | null = null;
  private approach: ApproachingBody | null = null;
  private follow: { id: EntityId; stopDistance: number } | null = null;
  /** Equipment per network id, so inspect needs no round trip. Dropped with the body. */
  private readonly equipmentByNetworkId = new Map<number, number[]>();
  /**
   * What the previous tap landed on. Not the target: a mailbox or bank is
   * never a target, yet a second tap on it must open it.
   */
  private lastTapped: EntityId | null = null;
  /** One pending flinch per defender: a flurry restarts the timer. */
  private readonly defendTimers = new Map<number, number>();
  /** What the server last said the player holds; richer than the character list. */
  private playerWeapons: EquippedHands | undefined;
  private playerRangedSubclass: number | undefined;
  /** The hero's hands from their own equipment, for when the server has not described them. */
  private heroHands: EquippedHands | undefined;
  private lastFrame = 0;
  private lastHudUpdate = -Infinity;
  /** Something off-frame changed the HUD; refresh without waiting. */
  private hudDirty = false;
  private fps = 0;
  private status = '';
  private readonly frameClock = new FrameClock(browserPage(), workerTicker());
  private readonly stopOptions: () => void;
  private readonly stopPieces: () => void;
  private readonly stopDialogs: () => void;
  private readonly stopEmblems: () => void;
  private readonly stopSpellIcons: () => void;
  private readonly stopTalentWords: () => void;
  private readonly stopSpellStats: () => void;
  private readonly diagnosticsRoot: HTMLElement;
  private inGame = false;
  /** A worker, so decoding never lands in the frame loop. */
  private readonly local: WorkerAssetProvider;
  private readonly clips = new EntityClips();
  private navigationGround: NavigationGround | null = null;
  private navigationWaiting: ((ground: NavigationGround) => void) | null = null;
  /** Loading art by top zone, decoded during extraction so a teleport never shows an empty screen. */
  private readonly splashUrls = new Map<number, string>();
  private readonly areaMapUrls = new Map<number, string>();
  private readonly areaMapLoading = new Set<number>();
  /** Null where the build has no picture with the bus network drawn in. */
  private readonly routeMapUrls = new Map<number, string | null>();
  private readonly routeMapLoading = new Set<number>();
  private readonly mapIconUrls = new Map<string, string>();
  private readonly mapIconLoading = new Set<string>();
  private readonly minimap = new MinimapComposite<TextureData>({
    load: (mapId, tx, tz) => this.resources.minimap(mapId, tx, tz),
    encode: async (tiles, patch) => {
      const canvas = document.createElement('canvas');
      canvas.width = minimapTextureSize(patch);
      canvas.height = minimapTextureSize(patch);
      const context = canvas.getContext('2d');
      if (!context) return null;
      for (const { column, row, tile } of tiles) {
        context.drawImage(
          tile.image,
          column * THUMB_SIZE,
          row * THUMB_SIZE,
          THUMB_SIZE,
          THUMB_SIZE,
        );
      }
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      return blob ? URL.createObjectURL(blob) : null;
    },
    revoke: url => URL.revokeObjectURL(url),
  });
  private mapDisplayZone: ZoneInfo | null = null;
  private mapZoneResolving = false;
  private arriving = false;
  /** The fare asked for and not yet answered, so silence can be reported. */
  private pendingFare: { to: number; label: string } | null = null;
  private fareTimeout = 0;
  private readonly travel = new TravelNetwork(INTERACT_REACH);
  /** A region the player is browsing; cleared when the map closes. */
  private mapBrowseZoneId: number | null = null;
  private areaLinks: import('../assets/types').AreaLinks | null = null;
  private worldMapUrl: string | null = null;
  private worldMapDrawn: { width: number; height: number } | null = null;
  private worldMapLoading = false;
  private areaLinksLoading = false;
  private zoneCache: ZoneInfo[] = [];
  /** The vendor whose shop is open. */
  private shopVendorId: number | null = null;

  /** Bodies trading blows with the player, not merely in combat. */
  private readonly fightingMe = new Set<number>();
  /** The footstep prefix of the mount the hero rides (`sfx_hoof_`). */
  private heroMountSound: string | null = null;

  /**
   * Diagnostic for `ubiquitous.loot()`: the server says nothing when a corpse's
   * creature row has no loot, which looks exactly like a client bug.
   */
  private readonly recentDeaths: Array<{ networkId: number; entry: number; name: string }> = [];

  /** The player's copper; null until the first push, so the starting purse is not announced as a gain. */
  private playerMoney: number | null = null;

  /** The one predicate; a transport that skips the login screen must still report position. */
  private readonly online: boolean;
  /** The ground the screens before the world stand on. */
  private readonly ground: GroundStage;
  private spawn: { mapId: number; position: [number, number, number] } | null = null;
  private selectedCharacter: CharacterSummary | null = null;
  private readonly audio: AudioEngine;
  private soundscapeInS = 0;
  private battleMusic = false;
  private readonly moveSounds = new MoveSounds();
  private readonly voiceGate = new VoiceGate();
  private heroSoundsWarm = false;
  /** Last frame's locomotion, to hear a jump begin. */
  private lastLocomotion: Locomotion = 'ground';
  private talkingTo: number | null = null;
  private openWindows = 0;
  private lastPositionSent = 0;
  private readonly pendingCreatureNames = new Set<number>();
  /** Entries whose name is being looked up, or that the build has no name for. */
  private readonly pendingEntryNames = new Set<number>();
  /** When the player last asked another player something, so a refusal can be matched to it. */
  private askedPlayerAt = -Infinity;
  /** Between entering the world and the zone loading; the roster arriving then is not announced. */
  private enteringWorld = false;
  private readonly namelessEntries = new Set<number>();
  private lastReportedState: EntityMovementState | null = null;

  constructor(
    elements: GameElements,
    private readonly config: ClientConfig,
    fileConfig: FileConfig,
  ) {
    this.canvas = elements.canvas;
    setLogLevel(config.logLevel);

    this.local = new WorkerAssetProvider({
      onProgress: p => this.reportExtraction(p),
    });
    this.resources = new ResourceSystem(this.local);
    this.art = new UiArt(this.resources);

    this.online = fileConfig.server !== null;
    this.world = new World(
      this.resources,
      {},
      {
        blockSize: config.tileWindow ?? undefined,
        includeLocalCreatures: !this.online,
      },
    );
    this.renderer = new Renderer(elements.canvas, this.resources, {
      animate: config.animate,
      antialias: savedOptions.value.antialias,
    });
    this.input = new Input(elements.canvas);
    this.movement = new PlayerMovement(this.world, this.renderer.rig);
    this.bodies = new NetworkBodies(
      this.world,
      this.renderer,
      this.resources,
      id => this.wireIdFor(id),
      (_networkId, equipment, weapons) => this.changePlayerEquipment(equipment, weapons),
    );
    this.whoIs = new WhoIs(this.bodies, this.world, {
      selfNetworkId: () => this.selfNetworkId,
      playerFaction: () => this.playerFaction,
      isFightingMe: networkId => this.fightingMe.has(networkId),
    });
    this.debug = new DebugTools(
      this.world,
      this.renderer,
      this.bodies,
      this.resources,
      () => this.status,
      radius => this.askForNavigationGround(radius),
    );
    this.audio = new AudioEngine(this.resources);
    if (import.meta.env.DEV) (globalThis as Record<string, unknown>).ubiquitousAudio = this.audio;
    this.combat = new CombatVisuals(
      this.resources,
      this.renderer,
      {
        localIdOf: networkId => this.whoIs.localIdOf(networkId),
        worldPosition: networkId => this.whoIs.positionOf(networkId),
        playClip: (networkId, clip, options) => this.playClip(networkId, clip, options),
        stopClip: networkId => this.stopClip(networkId),
      },
      {
        // A body that is gone has no place; its sound stays silent rather
        // than playing placeless at full volume.
        playAt: (cueId, networkId) => {
          if (this.whoIs.isSelf(networkId)) return this.audio.play(cueId);
          const at = this.whoIs.positionOf(networkId);
          return at ? this.audio.play(cueId, at) : null;
        },
      },
    );

    // Without an obstruction probe the near plane cuts open whatever the
    // camera backs into.
    this.renderer.rig.setObstructionProbe((a, b) => {
      // Flying is allowed to look through the ground; buildings still stop it.
      const ground =
        this.movement.locomotion === 'fly'
          ? null
          : groundHitDistance(
              a,
              b,
              (x, z) => this.world.terrain.heightAt(x, z),
              CAMERA_GROUND_CLEARANCE,
            );
      const solid = this.world.collision.isLoaded()
        ? (this.world.collision.segmentHit(a, b)?.distance ?? null)
        : null;
      if (ground === null) return solid;
      return solid === null ? ground : Math.min(ground, solid);
    });
    // `server=` unset means single-player against local data.
    this.connection =
      fileConfig.server === null
        ? new OfflineConnection()
        : new WebSocketConnection({ url: fileConfig.server });
    this.questMarks = new QuestMarks(this.bodies, this.world, () => {
      this.hudDirty = true;
    });
    this.ground = new GroundStage(
      this.resources,
      canvas =>
        new SelectionScene(this.resources, canvas, say, () => ({
          toneMapping: savedOptions.value.toneMapping,
        })),
    );
    this.lootAuras = new LootAuras(this.whoIs, this.combat);
    this.looting = new Looting(this.connection, this.art, this.audio, {
      play: (clip, options) => {
        const networkId = this.selfNetworkId;
        if (networkId !== 0) this.playClip(networkId, clip, options);
      },
      stop: () => {
        const networkId = this.selfNetworkId;
        if (networkId !== 0) this.stopClip(networkId);
      },
    });
    this.lootOpener = new LootOpener(
      this.connection,
      this.whoIs,
      attempt => this.debug.recordLootAttempt(attempt),
      INTERACT_REACH,
    );
    this.conversation = new Conversation(
      this.connection,
      this.resources,
      this.whoIs,
      () => this.selectedCharacter,
      text => this.sayNotice(text),
    );
    this.quests = new Quests(
      this.connection,
      this.resources,
      this.audio,
      (networkId, clip) => this.bodies.gesture(networkId, clip),
      text => this.sayNotice(text),
    );
    this.friends = new Friends(
      this.connection,
      unitId => this.bodies.networkIdOf(Number(unitId)),
      {
        playableKinds: () => this.resources.playableKinds(),
        zoneAt: (mapId, position) => this.zoneAt(mapId, position),
      },
      () => this.noteAsked(),
    );
    this.hud = new Hud(elements.hud);
    this.diagnosticsRoot = elements.hud;
    this.boot = new BootScreen(elements.boot);
    if (fileConfig.debug) setOption('diagnostics', true);
    this.stopOptions = effect(() => this.applyOptions(savedOptions.value));
    // A screen asking for original art gets a picture or nothing, and keeps
    // its own styling either way.
    this.stopPieces = effect(() => {
      const wanted = wantedPieces.value;
      if (wanted.length) void this.art.drawUiPieces(wanted);
    });
    this.stopDialogs = effect(() => {
      const wanted = wantedDialogs.value;
      if (wanted.length) void this.art.loadUiDialogs(wanted);
    });
    // Pictures drawn at points the movie only marks, from icon files beside it.
    this.stopEmblems = effect(() => {
      const wanted = wantedEmblems.value;
      if (wanted.length) void this.art.loadUiEmblems(wanted);
    });
    // Art and words for spells the player has not learned; the wire never sends them.
    this.stopSpellIcons = effect(() => {
      const wanted = wantedSpellDetails.value;
      if (wanted.length) void this.art.loadSpellDetails(wanted);
    });
    this.stopSpellStats = effect(() => {
      const wanted = wantedSpellStats.value;
      if (wanted.length) void this.art.loadSpellStats(wanted);
    });
    this.stopTalentWords = effect(() => {
      const wanted = wantedTalentWords.value;
      if (wanted.length) void this.art.loadTalentWords(wanted);
    });

    // The HUD stays mounted under the boot overlay so a session already in the
    // world cannot get stuck behind a display gate.
    elements.gameHud.style.display = '';
    elements.gameHud.replaceChildren();
    mountGameHud(elements.gameHud);
    setHeadshotSource(id =>
      this.renderer.headshot(id === 'player' ? (this.world.player?.id ?? -1) : Number(id)),
    );
    // The renderer stages the hero's built subtree, equipment included.
    setBodyStageSource((unitId, tryOn) =>
      this.renderer.stageHero(
        unitId === undefined ? undefined : Number(unitId),
        tryOn === undefined ? undefined : this.lookWearing(tryOn),
      ),
    );
    setCastCallback((spellId: number) => this.castSpell(spellId));
    // The hero's own ride is the one aura they can take off.
    auraCancel.value = (unitKey, spellId) =>
      unitKey === auraKey(this.selfNetworkId) && mountSpells.value.includes(spellId)
        ? () => this.dismount()
        : null;
    setJumpCallback(() => this.input.requestJump());
    // Saved locally first, then sent; offline the change lasts as long as the tab.
    setActionSlotSink(record => this.connection.sendActionSlot(record));
    // `ui/` never reaches the connection itself; it asks through these.
    installInventoryActions(
      this.connection,
      this.whoIs,
      {
        play: name => this.audio.play(name),
        byKind: (entry, pick) => this.itemSound(entry, pick),
      },
      () => this.shopVendorId,
    );
    this.looting.installActions();
    installMailActions(this.connection);
    installSummonActions(this.connection);
    setDeathActions({ reviveAtCemetery: () => this.releaseSpirit() });
    setChatSink((channel, text) => this.connection.sendChat(channel, text));
    // `targetId` is the local unit id the plus-menu was opened on, not a network id.
    setWhisperSink((targetId, text) => {
      const networkId =
        networkIdOfWhisperTarget(targetId) ?? this.bodies.networkIdOf(Number(targetId));
      if (networkId !== undefined) {
        this.askedPlayerAt = performance.now();
        this.connection.sendWhisper(networkId, text);
      }
    });
    // `targetId` is a local unit id, as for the whisper sink.
    setReportSink((targetId, reason) => {
      const networkId = this.bodies.networkIdOf(Number(targetId));
      if (networkId !== undefined) this.connection.sendReportPlayer(networkId, reason);
    });
    setEmoteSink(name => this.connection.sendEmote(name));
    setChatCommandSink(command => {
      if (command.kind === 'who') this.connection.sendWho();
      else if (command.kind === 'invite') partyActions().inviteNamed(command.name);
      else if (command.kind === 'stress') this.connection.sendStressTest(command.count);
      else if (command.kind === 'help') for (const line of chatCommandHelp()) this.sayNotice(line);
      else addFriendNamed(command.name);
    });
    installPartyActions(
      this.connection,
      () => this.whoIs.targetNetworkId(),
      () => this.noteAsked(),
    );
    this.quests.installActions();
    this.friends.installActions();
    installDuelActions(
      this.connection,
      this.whoIs,
      text => this.sayNotice(text),
      () => this.noteAsked(),
    );
    installTradeActions(
      this.connection,
      () => this.whoIs.targetNetworkId(),
      networkId => this.whoIs.networkName(networkId),
      () => this.noteAsked(),
    );
    installGuildActions(
      this.connection,
      () => this.whoIs.targetNetworkId(),
      unitId => this.bodies.networkIdOf(Number(unitId)),
      () => this.noteAsked(),
    );
    this.installWindowActions();
    // A destination only asks the fare; the confirm is a separate send.
    setMapRegionHandler(zoneId => {
      this.mapBrowseZoneId = zoneId;
      this.hudDirty = true;
    });
    setMapTeleportHandler(marker => {
      const stopId = Number(marker.id.replace('teleport-', ''));
      const stop = this.travel.stopById(stopId);
      if (!stop) return;
      const from = this.departureStopNow();
      if (from === null) {
        // The server answers out-of-range requests with nothing, so say it.
        showDebugInteraction({
          title: 'Teleport',
          lines: [
            'You are not standing at a teleport stop.',
            'Travel is only sold at one, so walk to the teleport master first.',
          ],
          actions: [{ label: 'Close', onClick: () => closeDebugInteraction() }],
        });
        return;
      }
      if (from === stop.id) {
        showDebugInteraction({
          title: 'Teleport',
          lines: ['You are already here.'],
          actions: [{ label: 'Close', onClick: () => closeDebugInteraction() }],
        });
        return;
      }
      this.connection.sendBusRequest(from, stop.id);
      log.info(`teleport fare asked: ${from} -> ${stop.id} (${marker.label})`);
      // The server ignores requests it will not honour; report a fare that
      // never arrives. Cleared by `onBusFare`.
      this.pendingFare = { to: stop.id, label: marker.label };
      window.clearTimeout(this.fareTimeout);
      this.fareTimeout = window.setTimeout(() => {
        if (this.pendingFare?.to !== stop.id) return;
        this.pendingFare = null;
        log.warn(`no fare came back for ${from} -> ${stop.id}`);
        showDebugInteraction({
          title: 'Teleport',
          lines: [
            `The server did not answer about ${marker.label}.`,
            'It refuses a journey it will not sell without saying so. Stand' +
              ' closer to the teleport master and try again.',
          ],
          actions: [{ label: 'Close', onClick: () => closeDebugInteraction() }],
        });
      }, FARE_TIMEOUT_MS);
    });
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    // On the window: a drag that ends off the canvas must still release.
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('click', this.onUiClick, true);
    window.addEventListener('pointercancel', this.onPointerCancel);
    // The right button attacks, so the browser menu must not open.
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.adminWanted = fileConfig.admin === true;
    this.showAdminPanel(false);
  }

  /** Built when the account may use it: at once offline, at sign-in as a GM online. */
  private showAdminPanel(isGameMaster: boolean): void {
    if (this.admin || !adminPanelAllowed(this.adminWanted, this.online, isGameMaster)) return;
    this.admin = import('../ui/AdminPanel').then(
      ({ AdminPanel }) => new AdminPanel(this.adminControls()),
    );
  }

  private hideAdminPanel(): void {
    void this.admin?.then(panel => panel.dispose());
    this.admin = null;
  }

  async start(): Promise<void> {
    // Installed first: these are the tools for when startup itself is broken.
    installStorageTools();
    try {
      this.boot.show('Starting...');
      // The splash art must never hold the boot screen; it is fetched per zone below.
      await this.resources.init();
      await this.ensureSource();
      // Bounded: anything drawn before the typefaces land is redrawn.
      const faces = this.art
        .loadUiFaces()
        .catch(err => log.warn('interface lettering failed', err));
      await Promise.race([faces, new Promise(resolve => setTimeout(resolve, FACES_WAIT_MS))]);
      // Screens asked for their art when the HUD mounted, before any pack was
      // mounted, and they ask only once; answer them now.
      void this.art.loadUiDialogs(wantedDialogs.value);
      this.art.resolveTopbarIcons();
      this.art.resolveUiSprites();
      const stops = await this.resources.teleportStops();
      // The bag upgrade ladder is local data; a build without the table never offers one.
      void this.resources
        .storageUpgrades()
        .then(setStorageUpgrades)
        .catch(() => {});
      // The talent trees are local data; the wire says nothing about them.
      void this.resources
        .talents()
        .then(read => {
          setTalentPlaces(read.places);
          setClassTrees(new Map(read.trees.map(row => [row.classId, row.trees])));
        })
        .catch(() => {});
      this.travel.load(stops, await this.resources.busRoutes());
      await this.enterWorld();
      await this.arrive();
      if (this.config.collisionDebug) this.debug.toggleCollision(true);
      void this.admin?.then(panel => panel.refreshZones());
      void this.warmSplashes();

      this.debug.install({
        selfNetworkId: () => this.selfNetworkId,
        attachSource: file => this.local.attachSource(file),
        lootSnapshot: () => ({
          states: [...this.lootAuras.recorded].map(([networkId, state]) => ({
            networkId,
            state,
            resident: this.bodies.localIdOf(networkId) !== undefined,
          })),
          fighting: [...this.fightingMe],
          died: [...this.recentDeaths],
        }),
        teleport: (x, y, z) => this.teleport(x, y, z),
        sendStressTest: count => this.connection.sendStressTest(count),
      });
    } catch (err) {
      this.boot.show(describeStartupFailure(err));
      log.error('startup failed', err);
    }
  }

  /** Stand the chosen character in the world and start the frame loop; again after the character list. */
  private async arrive(): Promise<void> {
    this.boot.show('Loading zones...');
    const zone = await this.pickZone();
    await this.loadZoneWithScreen(zone);
    this.standWhereTheServerPutUs();
    this.inGame = true;
    this.enteringWorld = false;
    this.run();
  }

  /** What the admin panel may ask of the running game; it closes over state nothing else reaches. */
  private adminControls(): AdminControls {
    return {
      debug: this.debug,
      flying: () => this.movement.isFlying(),
      // Space rises, shift descends; landing turns it off.
      toggleFly: on => {
        this.movement.setFlying(on);
        if (!on) {
          const p = this.world.player;
          if (p) {
            const [x, y, z] = p.position;
            this.world.setPosition(p, x, this.world.restingHeight(x, z, y).y, z);
          }
        }
        return on;
      },
      // Units per second.
      getWalkSpeed: () => this.movement.getSpeed(),
      setWalkSpeed: speed => this.movement.setSpeed(speed),
      drawDistance: () =>
        resolveGraphics(savedOptions.value.quality, savedOptions.value).drawDistance,
      // A lever past the settings' limits; any settings change restores the profile.
      setDrawDistance: units => {
        if (!Number.isFinite(units) || units <= 0) return;
        const profile = resolveGraphics(savedOptions.value.quality, savedOptions.value);
        this.renderer.setGraphics({
          ...profile,
          drawDistance: units,
          detailDistance: units,
          tileWindow: tileWindowFor(units),
        });
        this.world.setTileWindow(this.config.tileWindow ?? tileWindowFor(units));
      },
      teleportToZone: zoneId => this.adminTeleport(zoneId),
      // The debug HUD, not the game HUD.
      toggleHud: visible => setOption('diagnostics', visible),
      getZoneList: async () => (await this.resources.zoneIndex()).zones,
      searchItems: async query => searchItems(await this.itemCatalog(), query),
      giveItem: (entry, count) => this.connection.sendAdminGiveItem(entry, count),
      giveGold: gold => this.connection.sendAdminGiveGold(gold),
      setLevel: level => this.connection.sendAdminSetLevel(level),
      learnSpells: () => this.connection.sendAdminLearnSpells(),
      setInvincible: on => this.connection.sendAdminSetInvincible(on),
    };
  }

  /**
   * Loading art for a zone, or the boot screen. Best-effort. Sized here
   * because only the app knows the screen; the art ships at 512, 1024, 2048.
   */
  private async loadSplash(zoneId?: number): Promise<void> {
    // Taken before the first await: only the latest teleport may draw.
    const ticket = this.boot.nextSplash();

    if (zoneId !== undefined) {
      const warm = this.splashUrls.get(await this.topZoneId(zoneId));
      if (warm) {
        this.boot.setSplashUrl(warm, ticket);
        return;
      }
    }
    // Clear first, so the wait shows a blank panel rather than the zone just left.
    this.boot.clearSplash(ticket);
    const art = await this.resources.tryGet(splashId(zoneId, splashSize()));
    this.boot.setSplash(art?.image ?? null, ticket);
  }

  /** Which top zone's art a zone inherits. */
  private async topZoneId(zoneId: number): Promise<number> {
    const index = await this.resources.zoneIndex();
    let zone = index.zones.find(z => z.id === zoneId);
    for (let hops = 0; hops < 8 && zone && zone.parentId > 0; hops++) {
      const parent = index.zones.find(z => z.id === zone!.parentId);
      if (!parent) break;
      zone = parent;
    }
    return zone?.id ?? zoneId;
  }

  private async topZone(zoneId: number): Promise<ZoneInfo | null> {
    const index = await this.resources.zoneIndex();
    let zone = index.zones.find(candidate => candidate.id === zoneId);
    for (let hops = 0; hops < 8 && zone && zone.parentId > 0; hops++) {
      zone = index.zones.find(candidate => candidate.id === zone!.parentId) ?? zone;
    }
    return zone ?? null;
  }

  /** Markers are percentages of the drawn box, so blank margins must be cropped. */
  private cropBlankMargin(
    image: ImageBitmap,
  ): { url: string; width: number; height: number } | null {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;
    context.drawImage(image, 0, 0);

    const { data } = context.getImageData(0, 0, image.width, image.height);
    const rect = drawnRect(image.width, image.height, (x, y) => {
      const at = (y * image.width + x) * 4;
      return { r: data[at], g: data[at + 1], b: data[at + 2], a: data[at + 3] };
    });
    const { left, top } = rect;
    const { width, height } = rect;
    if (width === image.width && height === image.height)
      return { url: canvas.toDataURL(), width, height };
    const cropped = document.createElement('canvas');
    cropped.width = width;
    cropped.height = height;
    cropped.getContext('2d')?.drawImage(image, left, top, width, height, 0, 0, width, height);
    log.debug(`map art cropped ${image.width}x${image.height} -> ${width}x${height}`);
    return { url: cropped.toDataURL(), width, height };
  }

  private async areaMapUrl(zoneId: number): Promise<string | null> {
    const top = await this.topZoneId(zoneId);
    const cached = this.areaMapUrls.get(top);
    if (cached) return cached;
    if (this.areaMapLoading.has(top)) return null;
    this.areaMapLoading.add(top);
    try {
      const texture = await this.resources.areaMap(zoneId);
      if (!texture) return null;
      const url = this.cropBlankMargin(texture.image)?.url ?? null;
      if (!url) return null;
      this.areaMapUrls.set(top, url);
      this.areaMapUrls.set(zoneId, url);
      return url;
    } catch (error) {
      log.debug(`no area map for top zone ${top}: ${String(error)}`);
      return null;
    } finally {
      this.areaMapLoading.delete(top);
    }
  }

  /** The build's region picture with the bus network drawn in; remembers when there is none. */
  private async routeMapUrl(zoneId: number): Promise<void> {
    const top = await this.topZoneId(zoneId);
    if (this.routeMapUrls.has(top) || this.routeMapLoading.has(top)) return;
    this.routeMapLoading.add(top);
    try {
      const texture = await this.resources.areaMap(zoneId, true);
      const url = texture ? (this.cropBlankMargin(texture.image)?.url ?? null) : null;
      this.routeMapUrls.set(top, url);
      this.routeMapUrls.set(zoneId, url);
    } catch (error) {
      log.debug(`no network map for top zone ${top}: ${String(error)}`);
      this.routeMapUrls.set(top, null);
      this.routeMapUrls.set(zoneId, null);
    } finally {
      this.routeMapLoading.delete(top);
    }
  }

  private async ensureMinimap(mapId: number, x: number, z: number): Promise<void> {
    if (await this.minimap.ensure(mapId, x, z, minimapZoomStep.value)) this.hudDirty = true;
  }

  private async mapIconUrl(path: string): Promise<string | null> {
    const cached = this.mapIconUrls.get(path);
    if (cached) return cached;
    if (this.mapIconLoading.has(path)) return null;
    this.mapIconLoading.add(path);
    try {
      const texture = await this.resources.texture(path);
      if (!texture) return null;
      const canvas = document.createElement('canvas');
      canvas.width = texture.image.width;
      canvas.height = texture.image.height;
      canvas.getContext('2d')?.drawImage(texture.image, 0, 0);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      this.mapIconUrls.set(path, url);
      return url;
    } finally {
      this.mapIconLoading.delete(path);
    }
  }

  /** Cached so a HUD frame never awaits the zone table. */
  private async warmZones(): Promise<ZoneInfo[]> {
    if (!this.zoneCache.length) this.zoneCache = (await this.resources.zoneIndex()).zones;
    return this.zoneCache;
  }

  private zoneById(id: number): ZoneInfo | null {
    return this.zoneCache.find(zone => zone.id === id) ?? null;
  }

  /** The named places inside a region (zone priority 13). */
  private placesIn(top: ZoneInfo): MapPlace[] {
    const fares = mapTeleporting.value ? this.reachableFares() : new Map<number, number>();
    // A sub-area is drawn on its parent's map but its bus stop lives on its
    // own map, so look the stop up in the region the gateway leads to.
    const gateways = gatewayRegionsForTop(this.areaLinks?.subAreas[top.id] ?? [], id =>
      this.zoneById(id),
    );
    const detailZones = detailZonesInTop(this.zoneCache, top.id, DETAIL_ZONE_PRIORITY);
    return detailZones.map(zone =>
      mapPlaceForZone({
        zone,
        topMapId: top.mapId,
        gatewayRegion: gateways.get(zone.id) ?? null,
        fares,
        stops: this.travel.stops,
      }),
    );
  }

  private worldRegions(): MapRegion[] {
    // A region with no picture would open as a blank grid; leave it out.
    const mapped = new Set(this.areaLinks?.mapped ?? []);
    // A region that is not one of `area.cnfg`'s buttons is a sub-area.
    return listedWorldRegions(this.areaLinks?.regions ?? [], mapped, id => {
      const zone = this.zoneById(id);
      return zone ? { id, name: zone.name, button: this.areaLinks?.buttons[id] } : null;
    });
  }

  /** Bus legs with both ends on this region's map. */
  private routeLegsIn(top: ZoneInfo): MapRouteLeg[] {
    return routeLegsForTopMap(
      top.mapId,
      detailZonesInTop(this.zoneCache, top.id, DETAIL_ZONE_PRIORITY),
      this.travel.stops,
      this.travel.routes,
    );
  }

  /** Stops the player can buy a ticket to, and their fares; empty away from a stop. */
  private reachableFares(): Map<number, number> {
    return this.travel.faresFrom(this.departureStopNow());
  }

  private departureStopNow(): number | null {
    return departureStopNow(
      this.world.player?.position ?? null,
      this.world.zone?.mapId,
      (at, mapId) => this.travel.stopAt(at, mapId),
    );
  }

  /** The teleport map's region; a sub-area uses its parent's network. */
  private travelZone(): ZoneInfo | null {
    const parentId = topZoneForSubArea(this.mapDisplayZone?.id ?? null, this.areaLinks?.subAreas);
    return parentId ? this.zoneById(parentId) : null;
  }

  /** Adjoining regions in `area.cnfg` order. */
  private neighboursOf(zoneId: number): Array<{ direction: MapDirection; region: MapRegion }> {
    const byId = new Map(this.zoneCache.map(zone => [zone.id, { id: zone.id, name: zone.name }]));
    // Sub-areas are not steps: their map shows only while standing in them.
    return neighbourRegions(this.areaLinks?.neighbours[zoneId], byId);
  }

  private async loadAreaLinks(): Promise<void> {
    if (this.areaLinks || this.areaLinksLoading) return;
    this.areaLinksLoading = true;
    try {
      this.areaLinks = await this.resources.areaLinks();
      this.hudDirty = true;
    } catch (error) {
      log.debug(`no area.cnfg: ${String(error)}`);
    } finally {
      this.areaLinksLoading = false;
    }
  }

  /**
   * The world picture cropped to its drawn top-left part; the rest of the
   * power-of-two texture is white padding.
   */
  private async loadWorldMap(): Promise<void> {
    if (this.worldMapUrl || this.worldMapLoading) return;
    this.worldMapLoading = true;
    try {
      const texture = await this.resources.texture(WORLD_MAP_TEXTURE);
      if (!texture) return;
      const drawn = this.cropBlankMargin(texture.image);
      this.worldMapUrl = drawn?.url ?? null;
      this.worldMapDrawn = drawn && { width: drawn.width, height: drawn.height };
      this.hudDirty = true;
    } catch (error) {
      log.debug(`no world map art: ${String(error)}`);
    } finally {
      this.worldMapLoading = false;
    }
  }

  /**
   * Keep the map on the region the player stands in. Walking between regions
   * on one map loads nothing, so this must notice on its own.
   */
  private async refreshMapZone(zone: ZoneInfo, at: [number, number, number]): Promise<void> {
    if (containsMapDisplayZone(this.mapDisplayZone, zone.mapId, at)) return;
    if (this.mapZoneResolving) return;
    this.mapZoneResolving = true;
    try {
      const index = await this.resources.zoneIndex();
      const next =
        pickTopZoneAt(index.zones, zone.mapId, at, TOP_ZONE_PRIORITIES) ??
        (await this.topZone(zone.id));
      if (next && next.id !== this.mapDisplayZone?.id) {
        this.mapDisplayZone = next;
        this.hudDirty = true;
      }
    } finally {
      this.mapZoneResolving = false;
    }
  }

  /** Hold decoded loading art for the session. */
  private async warmSplashes(): Promise<void> {
    try {
      const warmed: Array<Promise<unknown>> = [];
      for (const [id, blob] of await this.local.splashes()) {
        const url = URL.createObjectURL(blob);
        this.splashUrls.set(id, url);

        // `decode()` here, not at first paint: an object URL still costs a
        // decode the first time it is shown.
        const image = new Image();
        image.src = url;
        warmed.push(image.decode().catch(() => undefined));
      }
      await Promise.all(warmed);
      log.info(`loading art ready for ${this.splashUrls.size} zones`);
    } catch (err) {
      log.debug(`no cached loading art: ${String(err)}`);
    }
  }

  /** Make sure the provider has game data mounted, asking the user if not. */
  private async ensureSource(): Promise<void> {
    if (this.resources.currentSource()) return;

    // Said before extracting: without storage the build is inflated into
    // memory and lost on reload, which otherwise looks like broken caching.
    const why = await whyNoStorage();
    if (why) {
      log.warn(why.split('\n').filter(Boolean).join(' '));
      await this.boot.pickFile(why, async () => [], { skipLabel: 'Continue anyway' });
    }

    const cached = await this.local.cachedBuilds();
    let sourceId: string;
    if (cached.length === 1) {
      this.boot.show(`Using ${cached[0].label}...`);
      sourceId = cached[0].id;
    } else if (cached.length > 1) {
      sourceId = await this.boot.choose('Game data:', [
        ...cached,
        { id: 'pick', label: 'Choose a different file...' },
      ]);
    } else {
      sourceId = 'pick';
    }

    // A cached build missing `tables.bin` is the one reason left to ask for the file.
    if (sourceId !== 'pick') {
      try {
        this.boot.show('Mounting...');
        await this.local.useSource(sourceId);
        sourceId = '';
      } catch (err) {
        log.warn(`cached build unusable: ${String(err)}`);
        this.boot.show(`${(err as Error).message}`);
        sourceId = 'pick';
      }
    }

    // An interrupted extraction: offer to finish it, never insist; what is
    // extracted already works. The permission re-grant needs a user gesture,
    // so it runs inside the click.
    if (
      sourceId === '' &&
      !(await this.local.isComplete()) &&
      !(await this.local.canExtractMore())
    ) {
      const stored = await storedIpa();
      if (stored) {
        const files = await this.boot.pickFile(
          'Extraction did not finish last time.\n\n' +
            `Reconnect to ${stored.name} to complete it, or carry on with ` +
            'what is already extracted.',
          async () => {
            const file = await reopenIpa(true);
            return file ? [file] : [];
          },
          { label: `Continue with ${stored.name}`, skipLabel: 'Carry on without it' },
        );
        if (files.length) await this.local.attachSource(files[0]);
        else log.warn('extraction still unfinished — some maps may not load');
      } else {
        log.warn('extraction unfinished and no game file remembered');
      }
    }

    if (sourceId === '') {
      await this.offerSound();
      return;
    }

    const files = await this.boot.pickFile(
      'Choose your Order & Chaos .ipa ' +
        '(or extracted packs — pick res.bin and tables.bin together):',
      pickIpa,
    );
    this.boot.show('Mounting...');
    await this.local.useSource((await this.local.offer(files)).id);
  }

  /**
   * Sign in, pick a character, enter, and record where the server put us.
   * The handlers registered here are the client's whole network surface.
   */
  private async enterWorld(): Promise<void> {
    if (!this.online) {
      await this.connection.connect({});
      return;
    }

    const account = new AccountSession(this.connection, LIST_PATIENCE, () => {
      log.warn('the server sent no fresh character list; carrying on with the last one');
    });

    this.boot.show('Connecting...');
    await this.connection.connect({
      onDisconnected: reason => {
        this.forgetSession();
        this.status = `disconnected: ${reason}`;
        log.warn(this.status);
        say(`Disconnected: ${reason}`);
        account.disconnected(reason);
      },
      onLoginResult: (ok, code, reason, isAdmin) => {
        account.loginAnswered(ok, code, reason, isAdmin);
        if (ok) this.showAdminPanel(isAdmin === true);
      },
      onAdminInvincible: on => void this.admin?.then(panel => panel.showInvincible(on)),
      onLoggedOut: () => {
        this.hideAdminPanel();
        account.loggedOut();
      },
      onCharacters: (list, races) => account.listed(list, races),
      onCharactersReturned: () => account.returnedToList(),
      onCharacterCreated: (ok, code, reason) => {
        if (ok) this.audio.play(CHARACTER_CREATED_SOUND);
        account.createAnswered(ok, code, reason);
      },
      onOutfit: (_race, _playerClass, equipment) => setOutfit(equipment),
      onCharacterDeleted: (ok, code, reason) => {
        if (ok) this.audio.play(CHARACTER_DELETED_SOUND);
        account.deleteAnswered(ok, code, reason);
      },
      onCharacterChosen: (ok, code, reason) => {
        if (!ok) account.chooseRefused(code, reason);
      },
      ...this.worldEntryHandlers(account),

      ...this.entityHandlers(),
      ...this.playerHandlers(),
      ...this.chatHandlers(),
      ...this.conversationHandlers(),
      ...this.quests.handlers(),
      ...this.questMarks.handlers(),
      ...this.travelHandlers(),
      ...vendorHandlers({
        connection: this.connection,
        art: this.art,
        resources: this.resources,
        audio: this.audio,
        openVendorId: () => this.shopVendorId,
      }),
      ...itemHandlers(),
      ...auctionHandlers(this.connection, this.resources),
      ...inventoryHandlers(this.art),
      ...this.spellHandlers(),
      ...this.combatHandlers(),
      ...this.worldHandlers(),
      ...this.deathHandlers(),
      ...this.lootAuras.handlers(),
      ...this.looting.handlers(),
      ...mailHandlers(this.art),
      ...summonHandlers({
        say: text => this.sayNotice(text),
        zoneAt: (mapId, position) => this.zoneAt(mapId, position),
      }),
      ...partyHandlers({
        say: text => this.sayNotice(text),
        isSelf: networkId => this.whoIs.isSelf(networkId),
        ownName: () => this.world.player?.networkName,
        entering: () => this.enteringWorld,
      }),
      ...guildHandlers(),
      ...this.friends.handlers(),
      ...duelHandlers({
        say: text => this.sayNotice(text),
        networkName: networkId => this.whoIs.networkName(networkId),
        forgetFightingMe: networkId => this.forgetFightingMe(networkId),
        setBattleMusic: on => {
          this.battleMusic = on;
          this.soundscapeInS = 0;
        },
      }),
      ...tradeHandlers({
        say: text => this.sayNotice(text),
        networkName: networkId => this.whoIs.networkName(networkId),
        art: this.art,
      }),
      ...this.talentHandlers(),
    });

    const frontEnd = new FrontEnd(account, this.ground, this.connection, this.boot, {
      signingIn: () => this.audio.play(SIGN_IN_SOUND),
      refused: why => {
        this.status = `sign-in refused: ${why}`;
        log.warn(this.status);
      },
      restart: () => {
        this.connection.disconnect();
        window.location.reload();
      },
      chose: character => {
        this.selectedCharacter = character;
      },
      kinds: () => this.resources.playableKinds(),
    });
    frontEnd.installActions();
    this.installSessionActions(account, frontEnd);
    const chosen = frontEnd.open();
    this.playTitleMusic();
    await chosen;
    frontEnd.close();
  }

  /** The map changes, and what a refusal from the server means to the player. */
  private worldEntryHandlers(account: AccountSession): Partial<ConnectionEvents> {
    return {
      onWorldLoading: (mapId, position) => {
        /*
         * Every change of map arrives here first. Left unconsumed, the old
         * zone stays on screen while the server describes a map never loaded.
         */
        this.spawn = { mapId, position };
        if (this.inGame) void this.arriveByTeleport(mapId, position, gameYaw(this.movement.yaw));
      },
      onWorldEntered: (mapId, position, selfNetworkId, heroAuras) => {
        this.spawn = { mapId, position };
        // The server starts every entry without it.
        void this.admin?.then(panel => panel.showInvincible(false));
        // Cleared here, not by the zone load: the server sends this world's
        // state straight after `world.entered`, before the zone lands.
        this.world.clearBarriers();
        this.world.clearHidden();
        // The movie is the same for every screen; read it now, by name.
        void this.art.loadUiDialogs(wantedDialogs.value);
        // Network ids restart across maps, so marks keyed by them go; the quest
        // log itself survives.
        clearQuestGiverStatuses();
        clearQuestMessages();
        clearPopMessages();
        clearSaid();
        this.questMarks.clear();
        this.quests.closeDialog();
        // Network ids are reused on the other side.
        this.forgetBodyBoundState();
        // The only place instance state is decided: no message says so, and a
        // bus ride or relog leaves an instance silently too.
        applyInstanceWorldEntered(mapId);
        // Entering as a character: the server resends the roster straight after.
        const plan = worldEntryPlan(this.inGame);
        if (plan.resetParty) {
          resetParty();
          this.enteringWorld = true;
        }
        // Guild, friends and ignores outlive the session; ask on every entry.
        this.connection.sendGuildRosterRequest();
        this.connection.sendSocialListRequest();
        // Held: the player's body exists only once the zone loads, and
        // `NetworkBodies.open` clears the id map. `loadZoneWithScreen` links it.
        this.selfNetworkId = selfNetworkId;
        if (player.value) setPlayer({ ...player.value, networkId: selfNetworkId });
        // A crossing takes effects off without an `aura.ended` for each.
        this.wearAuras(selfNetworkId, heroAuras);
        if (plan.arriveByTeleport) {
          /*
           * A cross-map bus teleport arrives as a full world entry, not a
           * relocation. `gameYaw` is self-inverse, so passing the converted
           * yaw keeps the facing through `arriveByTeleport`.
           */
          void this.arriveByTeleport(mapId, position, gameYaw(this.movement.yaw));
          return;
        }
        if (plan.finishSignIn) account.worldEntered();
      },

      onProtocolError: (code, reason) => {
        noteRefusal(code, reason);
        // The screens before the world wait on an answer; a refusal is one.
        account.refuse(reason);
        const said = refusalLines({
          code,
          reason,
          askedRecently: performance.now() - this.askedPlayerAt < ASK_ANSWER_MS,
        });
        for (const line of said.report) reportToPlayer(line);
        if (said.notice !== null) this.sayNotice(said.notice);
        // A refused `trade.offer` sends no `trade.updated`; drop the pending offer.
        if (tradePhase.value === 'open') clearPendingOffer();
        log.info(`refused: ${code} — ${reason}`);
      },
    };
  }

  private installSessionActions(account: AccountSession, frontEnd: FrontEnd): void {
    // Back to the character list on the same connection: the server keeps the
    // account signed in.
    let leaving = false;
    setSessionActions({
      backToCharacterList: () => {
        if (!this.inGame || leaving) return;
        leaving = true;
        void (async () => {
          try {
            await account.returnToList();
            this.leaveTheWorld();
            setCharacters(await account.refreshCharacters());
            setStage('characters');
            const again = frontEnd.open();
            this.playTitleMusic();
            await again;
            frontEnd.close();
            await this.arrive();
          } catch (err) {
            log.warn(`could not go back to the character list: ${String(err)}`);
            reportToPlayer('Could not go back to the character list.');
          } finally {
            leaving = false;
          }
        })();
      },
      backToMainMenu: () => {
        // Closing the connection signs out; the server saves the hero.
        this.connection.disconnect();
        window.location.reload();
      },
    });
  }

  /** The title music, with no ambience under it: the world is not drawn behind the screens. */
  private playTitleMusic(): void {
    this.audio.setAmbience(0);
    void this.audio.ready().then(() => {
      if (!this.inGame) this.audio.setMusic(this.audio.cueNamed(TITLE_MUSIC)?.id ?? 0);
    });
  }

  /** Forget everything keyed by body id; ids are handed out again. */
  private forgetBodyBoundState(): void {
    closeLoot();
    this.clearAllDefences();
    this.lootAuras.clear();
    this.fightingMe.clear();
    this.cancelApproach();
    this.lastTapped = null;
  }

  /** Forget what belonged to one server session: on disconnect, and on leaving for the character list. */
  private forgetSession(): void {
    // These arrived over the socket that is gone and cannot be asked for again.
    clearInventory();
    clearAuras();
    this.forgetBodyBoundState();
    // Party, trade, duel and PvP flag end with the session; the guild
    // roster was only an answer to a request that can no longer be made.
    resetParty();
    resetSharedQuests();
    resetGuild();
    resetSocialLists();
    resetTrade();
    resetPvp();
    resetInstance();
  }

  /** Take the hero out of the world, for the character list. */
  private leaveTheWorld(): void {
    this.stop();
    this.inGame = false;
    this.forgetSession();
    this.clearTarget();
    closeMap();
    clearChat();
    clearPopMessages();
    clearQuestMessages();
    if (this.heroDeath.isDown) this.heroDeath.revive();
    this.bodies.close();
    this.combat.clear();
    forgetBodyCasts();
  }

  /** Bodies other than the hero. */
  private entityHandlers(): Partial<ConnectionEvents> {
    return {
      onEntitiesAppeared: entities => {
        for (const snapshot of entities) {
          this.bodies.take({ kind: 'spawned', snapshot });
          this.equipmentByNetworkId.set(snapshot.networkId, snapshot.equipment);
          this.warmVoice(snapshot.networkId);
          this.wearAuras(snapshot.networkId, snapshot.auras ?? []);
          // Quest status is per player, so ask as each giver comes into view.
          if (snapshot.npcFlags !== undefined || snapshot.kind === 'staticObject') {
            this.connection.sendQuestStatus(snapshot.networkId);
          }
        }
      },
      onEntitiesMoved: moves => {
        // The player's own body is client-owned. Applying the server's echo of
        // an accepted move fought local prediction and pinned the body in
        // place; corrections arrive on `onPlayerPositionCorrected`.
        for (const move of moves) {
          if (this.whoIs.isSelf(move.networkId)) continue;
          this.bodies.take({ kind: 'moved', move });
        }
      },
      onEntitiesRemoved: networkIds => {
        for (const networkId of networkIds) this.voiceGate.forget(networkId);
        for (const networkId of networkIds) {
          this.combat.forget(networkId);
          this.clearDefence(networkId);
          clearAura(auraKey(networkId), 0);
          // Ids are reused; a body must not leave its loot state or grudge behind.
          this.lootAuras.forget(networkId);
          this.fightingMe.delete(networkId);
          this.equipmentByNetworkId.delete(networkId);
          this.bodies.take({ kind: 'removed', networkId });
        }
      },
      onEntityAppearanceChanged: (networkId, equipment, weapons) => {
        this.bodies.take({ kind: 'appearance', networkId, equipment, weapons });
        this.equipmentByNetworkId.set(networkId, equipment);
      },
      onEntityValuesChanged: update => {
        this.bodies.updateValues(update);
        // Kept by network id: it often arrives before the body is built.
        const mountId = update.values[FIELD_IDS.mount];
        if (mountId !== undefined && !this.whoIs.isSelf(update.networkId))
          this.bodies.setMount(update.networkId, mountId);
        const local = this.bodies.localIdOf(update.networkId);
        if (local !== undefined) this.applyAuraState(local, update.values);
      },
    };
  }

  /** The hero's replicated state, experience, teleports and corrections. */
  private playerHandlers(): Partial<ConnectionEvents> {
    return {
      onPlayerValuesChanged: values => {
        const current = this.selectedCharacter;
        if (!current) return;
        const purse = moneyChange(this.playerMoney, values[FIELD_IDS.gold]);
        if (purse) {
          const money = purse.money;
          // Not on a session's first push, which is the starting purse.
          if (purse.gained !== null) popMoneyGained(purse.gained);
          this.playerMoney = money;
          setMoney(money);
          if (shopInteraction.value) {
            shopInteraction.value = { ...shopInteraction.value, balance: money };
          }
        }
        // Fold, never rebuild (`applyPlayerValues`): a rebuilt hero loses
        // `dead`, and the death's gold penalty arrives in the same batch.
        applyPlayerValues(values, {
          name: current.name,
          level: current.level,
          classId: current.class,
          gender: current.gender,
          networkId: this.selfNetworkId,
        });
        // The hero is not a `NetworkBodies` actor and `player.updated` has no
        // network id, so auras apply to the local body here.
        const body = this.world.player;
        if (body) this.applyAuraState(body.id, values);
        const mountId = values[FIELD_IDS.mount];
        if (mountId !== undefined) void this.applyHeroMount(mountId);
        const share = speedShare(values);
        if (share !== undefined) this.movement.setSpeedShare(share);
      },
      onPlayerExpGained: (amount, levelUp) => {
        // A GM setting a level sends no experience, only the level.
        if (amount > 0) popExpGained(amount);
        if (levelUp) {
          popLevelUp(player.value?.level ?? 0);
          this.audio.play(LEVEL_UP_SOUND);
          this.playLevelUpEffect();
        }
      },
      onPlayerTeleported: (mapId, position, yaw) => {
        void this.arriveByTeleport(mapId, position, yaw);
      },
      onPlayerPositionCorrected: position => {
        // The server adopts client movement, so this only fires on relocations such as teleports.
        const player = this.world.player;
        if (!player) return; // no zone loaded yet; the spawn position covers it
        // Clear any jump in flight, or the body arrives mid-hop.
        this.movement.reset();
        this.world.setPosition(player, position[0], position[1], position[2]);
      },
    };
  }

  private chatHandlers(): Partial<ConnectionEvents> {
    return {
      onChat: message => {
        // A creature is named by id; anyone else by name, and a name nobody in view has is a log line only.
        const { senderId, ...line } = message;
        noteChat(
          { ...line, mine: message.sender === this.selectedCharacter?.name },
          senderId === undefined ? this.saidBy(message.sender) : this.bodies.localIdOf(senderId),
        );
      },
      onWhisperReceived: (_senderNetworkId, senderName, text) => {
        // Private, so never a box over a head.
        noteChat({ channel: WHISPER_CHANNEL, sender: senderName, text });
      },
      onWhisperSent: (_targetNetworkId, targetName, text) => {
        // Logged on arrival, not on send: the server refuses offline and self whispers.
        noteChat({ channel: WHISPER_CHANNEL, sender: `To ${targetName}`, text, mine: true });
      },
      onEmotePerformed: (networkId, animationId) => this.playEmote(networkId, animationId),
    };
  }

  /** A conversation opened by the server: the giver greets the hero aloud, and its first page shows. */
  private conversationHandlers(): Partial<ConnectionEvents> {
    return {
      onNpcConversation: (networkId, entry) => {
        this.greet(networkId);
        this.conversation.open(networkId, entry);
      },
      ...this.conversation.handlers(),
    };
  }

  private travelHandlers(): Partial<ConnectionEvents> {
    return {
      onBusFare: (from, to, cost) => {
        log.info(`teleport fare quoted: ${from} -> ${to} costs ${cost}`);
        this.pendingFare = null;
        window.clearTimeout(this.fareTimeout);
        const stop = this.travel.stopById(to);
        const destination = teleportDestinationName(to, stop, this.zoneCache, DETAIL_ZONE_PRIORITY);
        askTravel({
          place: destination,
          fare: fareWords(cost),
          accept: () => {
            this.connection.sendBusConfirm(from, to);
            closeMap();
          },
          decline: () => {},
        });
      },
      onTeleportResult: (ok, networkId) => {
        // The gossip teleport asks first; a teleport master opens the map at once.
        if (ok) openTeleportMap();
        else log.warn(`teleport request rejected by NPC ${networkId}`);
      },
    };
  }

  /** The spellbook, the action bar, and one cast's progress through its states. */
  private spellHandlers(): Partial<ConnectionEvents> {
    return {
      onSpellBook: (spells, actionBar) => {
        this.warmSpellSounds(spells);
        // Both bars are the server's; a slot the character cannot use stays empty.
        void loadSpellBook(spells, actionBar, this.resources, {
          install: initSpells,
          mountSpells: setMountSpells,
          name: setSpellName,
          icon: setSpellIcon,
          castTime: setSpellCastTime,
          rank: setSpellRank,
        }).then(castable => log.info(`spells: ${castable.length} castable of ${spells.length}`));
      },

      onActionBarAssigned: record => {
        assignActionBar(record);
      },

      onSpellLearned: spellIds => {
        for (const spellId of spellIds) {
          void this.resources.spellName(spellId).then(name => {
            if (name)
              reportToPlayer(`You have learned ${name}.`, performance.now(), { tone: 'done' });
          });
        }
      },

      onSpellCasting: (casterId, spellId, castTime) => {
        if (this.whoIs.isSelf(casterId)) startCast(spellId, null, castTime);
        else startBodyCast(casterId, spellId, castTime, performance.now());
        const tool = GATHER_HELD_ITEMS.get(spellId);
        const body = this.bodyOf(casterId);
        if (tool !== undefined && body !== undefined) void this.renderer.holdItem(body, tool);
        void this.spellVisualFor(spellId).then(visual => {
          this.combat.beginCast(casterId, visual);
        });
      },

      onSpellReleased: (casterId, spellId, speed, targets, resisted) => {
        this.putToolAway(casterId);
        if (this.whoIs.isSelf(casterId)) {
          completeCast();
          this.castFacing.released(performance.now());
        } else endBodyCast(casterId);
        // A gather has no release: the loot window kneels the body, and a
        // release clip would stand it back up.
        if (GATHER_SPELL_IDS.has(spellId)) {
          this.combat.stopCast(casterId);
          return;
        }
        // The release follows the spell's table cast time, not this cast's.
        void Promise.all([
          this.resources.spellCastingTime(spellId),
          this.spellVisualFor(spellId),
        ]).then(([castMs, visual]) => {
          void this.combat.release(casterId, visual, castMs, speed, targets);
        });
        if (resisted.length > 0) {
          log.debug(`spell ${spellId} resisted by ${resisted.join(', ')}`);
        }
      },

      onSpellFailure: (casterId, spellId, errorCode) => {
        this.putToolAway(casterId);
        if (this.whoIs.isSelf(casterId)) {
          failCast(spellId);
          this.castFacing.dropped();
          this.audio.play(SKILL_REFUSED_SOUND);
        } else endBodyCast(casterId);
        this.combat.stopCast(casterId);
        log.debug(`spell ${spellId} failed: error ${errorCode}`);
        /*
         * A refused cast is otherwise silent and reads as a broken button.
         * Only the player's own refusals.
         */
        if (this.whoIs.isSelf(casterId)) reportToPlayer(spellErrorMessage(errorCode));
      },

      onSpellInterrupted: casterId => {
        this.putToolAway(casterId);
        if (this.whoIs.isSelf(casterId)) {
          interruptCast();
          this.castFacing.dropped();
        } else endBodyCast(casterId);
        this.combat.stopCast(casterId);
      },

      onCooldownStarted: (spellId, duration) => {
        // Spell 0 is the global cooldown.
        if (spellId === 0) startGlobalCooldown(duration);
        else startCooldown(spellId, duration);
      },
    };
  }

  /** Fights, and auras, which are combat state. */
  private combatHandlers(): Partial<ConnectionEvents> {
    return {
      onAttackMeleeStart: (attackerId, targetId) => {
        this.setCombatPosture(attackerId, 'melee');
        this.faceWhileFighting(attackerId, targetId);
      },

      onAttackRangeStart: (attackerId, targetId) => {
        this.setCombatPosture(attackerId, 'ranged');
        this.faceWhileFighting(attackerId, targetId);
      },

      onAttackHalted: networkId => {
        this.shots.stopped(networkId);
        this.swings.stopped(networkId);
        this.setCombatPosture(networkId, null);
        this.faceWhileFighting(networkId, null);
      },

      onSwingResult: hit => {
        const body = this.whoIs.isSelf(hit.attackerId)
          ? this.world.player?.id
          : this.whoIs.localIdOf(hit.attackerId);
        const weapons = body === undefined ? null : this.renderer.weaponsOf(body);
        const swing = planSwing({
          outcome: hit.outcome,
          hand: hit.hand,
          roll: Math.random(),
          weapons,
          clipSeconds: clip => (body === undefined ? null : this.renderer.clipLength(body, clip)),
          queue: this.swings,
          attacker: hit.attackerId,
          now: performance.now(),
        });
        const blow = this.weaponOf(hit.attackerId, hit.hand === 'off' ? 'offhand' : 'mainhand');
        if (swing && !this.isCastingBody(hit.attackerId)) {
          const { clip, waitMs } = swing;
          // The swoosh leaves with the swing, so a queued off-hand blow
          // does not swish before its arm moves.
          const heard = () => this.playCombatSound(swingSound(blow), hit.attackerId);
          if (waitMs > 0)
            setTimeout(() => {
              this.playClipNamed(hit.attackerId, clip);
              heard();
            }, waitMs);
          else {
            this.playClipNamed(hit.attackerId, clip);
            heard();
          }
        } else {
          this.playCombatSound(swingSound(blow), hit.attackerId);
        }
        this.cry(hit.attackerId, 'attack');
        this.applyFinalHealth(hit.targetId, hit.finalHealth);
        this.showDamage(hit.attackerId, hit.targetId, hit.damage, hit.outcome, {
          finalHealth: hit.finalHealth,
          offHand: hit.hand === 'off',
          absorbed: hit.absorbed,
        });
        this.showDefence(hit.targetId, hit.outcome, blow);
      },

      onShotFired: (attackerId, targetId, spellVisualId, speed) => {
        this.shots.left(attackerId);
        this.playCombatSound(swingSound(this.weaponOf(attackerId, 'ranged')), attackerId);
        const rangedSubclass = this.whoIs.isSelf(attackerId)
          ? (this.playerWeapons?.ranged.subClass ?? this.playerRangedSubclass)
          : undefined;
        void this.combat
          .rangeLaunch(attackerId, targetId, spellVisualId, speed, rangedSubclass)
          .then(clip => {
            if (this.isCastingBody(attackerId)) return;
            // A plain bow has no shot clip and falls back to `combat_fire`.
            if (clip) this.playClip(attackerId, clip);
            else this.playClipNamed(attackerId, ATTACK_CLIPS.shoot);
          });
      },

      onShotResult: hit => {
        const shot = this.shots.landed(hit.attackerId);
        if (shot && !this.isCastingBody(hit.attackerId)) {
          // This screen never saw the shot leave or the bow come up; raise it now.
          this.setCombatPosture(hit.attackerId, 'ranged');
          this.faceWhileFighting(hit.attackerId, hit.targetId);
          this.playClipNamed(hit.attackerId, shot);
        }
        this.applyFinalHealth(hit.targetId, hit.finalHealth);
        this.showDamage(hit.attackerId, hit.targetId, hit.damage, hit.outcome, {
          finalHealth: hit.finalHealth,
          absorbed: hit.absorbed,
        });
        this.showDefence(hit.targetId, hit.outcome, this.weaponOf(hit.attackerId, 'ranged'));
      },

      onAuraApplied: (unitId, casterId, spellId, remaining, maxDuration, harmful) => {
        // The HUD's record: the message has no visual and no stacks, so the
        // visual comes from the spell's row and stacks count as one. Set at
        // once: a spell with no visual still has an icon.
        const held = { casterId, spellId, remaining, maxDuration, harmful };
        setAura(auraKey(unitId), appliedFrom(held));
        this.showAura(unitId, held);
      },

      onAuraEnded: (_casterId, unitId, spellId) => {
        // Spell 0 clears every icon.
        clearAura(auraKey(unitId), spellId);
        const turnedBy = this.turnedBy.get(unitId);
        if (turnedBy !== undefined && (spellId === 0 || spellId === turnedBy)) {
          this.turnedBy.delete(unitId);
          this.turnInto(unitId, 0);
        }
        /*
         * Resolved from the spell's row like the add. A visual of 0 means
         * "every aura" to `removeAura`, so a named spell with no visual
         * removes nothing; only a message naming no spell clears all.
         */
        void this.spellVisualFor(spellId).then(resolved => {
          const visual = auraRemovalVisual(spellId, resolved);
          if (visual !== null) this.combat.removeAura(unitId, visual);
        });
      },

      onSpellOutcome: (casterId, targetId, spellId, outcome, damage, finalHealth, absorbed) => {
        this.applyFinalHealth(targetId, finalHealth);
        this.showDamage(casterId, targetId, damage, outcome, {
          spell: true,
          spellId,
          finalHealth,
          absorbed,
        });
        this.showDefence(targetId, outcome);
      },

      onAttackEnterCombat: networkId => {
        if (this.whoIs.isSelf(networkId)) setInCombat(true, performance.now(), this.combatWords());
        else this.cry(networkId, 'aggro');
        this.setNetworkCombat(networkId, true);
      },

      onAttackExitCombat: networkId => {
        if (this.whoIs.isSelf(networkId)) {
          setInCombat(false, performance.now(), this.combatWords());
          this.forgetEveryFight();
        }
        this.clearDefence(networkId);
        this.forgetFightingMe(networkId);
        this.setNetworkCombat(networkId, false);
        this.shots.stopped(networkId);
        this.setCombatPosture(networkId, null);
        // A non-player stops facing its foe and, after a moment, its spawn.
        this.faceWhileFighting(networkId, null);
      },
    };
  }

  private worldHandlers(): Partial<ConnectionEvents> {
    return {
      onNavigationGround: data => {
        this.navigationGround = new NavigationGround(data);
        const waiting = this.navigationWaiting;
        this.navigationWaiting = null;
        waiting?.(this.navigationGround);
      },

      onWorldHiddenObjects: positions => {
        this.world.setHidden(positions);
        if (positions.length > 0)
          log.info(`world: ${positions.length} map object(s) hidden by the server`);
      },

      onDungeonsRestarted: () => reportToPlayer(sayLine(LINES.dungeonsReset)),
      onDungeonModeChosen: (mode, count) => {
        dungeonMode.value = mode;
        reportToPlayer(mode === 'legend' ? 'Dungeons set to Legend.' : 'Dungeons set to Normal.');
        if (count > 0) reportToPlayer(sayLine(LINES.dungeonsReset));
      },
      // With no models named, walls inside the box stop blocking and stay
      // drawn. May arrive before the tile; `World` reapplies it.
      onDungeonBarrierOpened: (barrierId, announce, area, models) => {
        this.world.openBarrier(barrierId, area, models);
        if (announce) log.info(`a way opened: ${barrierId}`);
      },
    };
  }

  private deathHandlers(): Partial<ConnectionEvents> {
    return {
      onUnitDied: (networkId, position) => {
        // A death for a hero already down is dropped (`HeroDeath`).
        if (this.whoIs.isSelf(networkId) && !this.heroDeath.markDown()) return;
        this.clearDefence(networkId);
        this.cry(networkId, 'dead');
        this.combat.forget(networkId);
        this.putToolAway(networkId);
        clearAura(auraKey(networkId), 0);
        // The dead test outranks the grudge, but the id will be reused.
        this.forgetFightingMe(networkId);
        this.noteDeath(networkId);
        // Nobody rides on dead; the server sends no value to a corpse.
        if (!this.whoIs.isSelf(networkId)) this.bodies.setMount(networkId, 0);
        else if (this.movement.isMounted()) void this.applyHeroMount(0);
        if (this.whoIs.isSelf(networkId)) {
          // The player is not a `NetworkBodies` actor; `bodies.take` would do
          // nothing for it.
          this.movement.reset();
          const self = player.value;
          if (self) setPlayer({ ...self, dead: true });
          void this.resources.animationNamed(DEATH_CLIP).then(clip => {
            this.heroDeath.holdClip(clip ?? 'idle');
          });
          reportToPlayer('You have died.');
          return;
        }
        this.bodies.take({ kind: 'dead', networkId, position });
      },
      onPlayerDeath: (killerId, deathCost) => {
        // Only the dying player is told the cost. The killer is named here
        // because `ui/` has no world and the body may already be gone.
        const killer =
          killerId === null
            ? undefined
            : this.world.entities.get(this.bodies.localIdOf(killerId) ?? -1);
        setDeathToll({ deathCost, killerName: killer?.networkName || undefined });
      },

      onPlayerRevived: (networkId, hp, hpMax, power, powerMax) => {
        // TODO: Verify how another player's body should stand back up; for now only the hero's own revival counts.
        if (!this.whoIs.isSelf(networkId)) return;
        this.heroDeath.revive();
        setDeathToll(null);
        const self = player.value;
        if (self) {
          setPlayer({
            ...self,
            health: hp,
            maxHealth: hpMax,
            mana: power,
            maxMana: powerMax,
            dead: false,
          });
        }
        reportToPlayer('Revived.', performance.now(), { tone: 'done' });
      },
    };
  }

  /** The talent window's server answers. */
  private talentHandlers(): Partial<ConnectionEvents> {
    return {
      onTalentState: (points, ranks) => applyTalentState(points, ranks),
      onTalentRefused: (_talentId, reason) => reportToPlayer(talentErrorMessage(reason)),
    };
  }

  private async pickZone(): Promise<ZoneInfo> {
    const index = await this.resources.zoneIndex();
    if (index.zones.length === 0) {
      throw new Error('the mounted game data contains no zones');
    }
    const picked = zoneForArrival(index.zones, this.spawn, {
      id: this.config.defaultZoneId,
      name: this.config.defaultZoneName,
    });
    for (const problem of picked.problems) {
      this.status = problem;
      log.warn(this.status);
    }
    return picked.zone;
  }

  private run(): void {
    this.running = true;
    this.lastFrame = performance.now();
    const frame = (now: number, drawn: boolean): void => {
      if (!this.running) return;
      // Clamp so an alt-tabbed tab does not teleport the player on return.
      const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
      this.lastFrame = now;
      this.fps = dt > 0 ? Math.round(1 / dt) : this.fps;

      const input = this.input.sample();
      // Before movement, so the run aims at where the target is now.
      this.steerApproach(input);
      this.steerFollow(input);
      if (!this.heroDeath.isDown) this.movement.update(input, dt);
      if (this.movement.justJumped()) this.callOffCast();
      this.castFromKeys(input.castSlots);
      if (input.deselect) this.clearTarget();
      this.easeCombatFacing(dt);
      // Mounts do not swim: deep water dismounts.
      if (this.movement.isMounted() && this.movement.locomotion === 'swim') this.dismount();
      this.world.update();
      let mark = performance.now();
      this.world.updateNetwork(dt);
      this.debug.frameMs.network = performance.now() - mark;
      this.bodies.settle();
      // Statuses that arrived before their giver's body.
      if (this.questMarks.waiting) this.questMarks.settle();
      expireQuestMessages();
      this.syncTargetRing();
      this.syncGuideArrow();
      this.lootAuras.sync();
      mark = performance.now();
      this.renderer.sync(this.world);
      this.debug.frameMs.sync = performance.now() - mark;
      this.renderer.setViewCover(viewCover.value);
      if (drawn) this.renderer.render(dt);
      this.updatePlayerClip(dt);
      mark = performance.now();
      this.bodies.updateClips(dt);
      this.debug.frameMs.clips = performance.now() - mark;
      this.combat.update(dt);
      this.updateSound(dt);
      tickSpells(dt);
      this.trackFloatingNumbers();
      tickPopMessages(dt * 1000);
      this.trackPopMessages();
      this.trackChatSaid();
      this.reportPosition(now);
      this.updateHud();
    };
    this.frameClock.start(frame);
  }

  /** Rebuild the player with new equipment; `NetworkBodies` does not hold this body. */
  private changePlayerEquipment(equipment: number[], weapons?: EquippedHands): void {
    const character = this.selectedCharacter;
    if (!character) return; // offline, or no character chosen yet
    // So the next zone load can restore weapons without waiting for the server.
    this.playerWeapons = weapons;
    if (!weapons) this.readHeroHands(equipment);
    void this.resources
      .networkAppearance({
        entry: 0,
        displayInfoId: character.displayInfoId,
        race: character.race,
        gender: character.gender,
        skin: character.appearance.skin,
        face: character.appearance.face,
        hairStyle: character.appearance.hairStyle,
        hairColor: character.appearance.hairColour,
        equipment,
        animationId: 0,
        shape: this.heroShape.current,
      })
      .then(look => {
        if (!look.appearance) return;
        // Re-read: a zone load can rebuild the world meanwhile.
        const player = this.world.player;
        character.equipment = [...equipment];
        if (!player) return;
        this.world.setAppearance(player, look.appearance);
        void this.renderer.refreshAppearance(player);
        this.applyPlayerWeapons();
      })
      .catch(err => log.warn(`could not refresh the player's appearance: ${String(err)}`));
  }

  /**
   * The server adopts whatever the client reports, so arriving at the zone
   * centre would stick. Height comes from the loaded terrain.
   */
  private standWhereTheServerPutUs(): void {
    if (this.spawn === null) return;
    const player = this.world.player;
    if (!player) return;

    const [x, , z] = this.spawn.position;
    const resting = this.world.restingHeight(x, z, this.spawn.position[1]);
    this.world.setPosition(player, x, resting.y, z);
    // Recentre the window on where the player actually is before reading ground.
    this.world.update();
    this.movement.reset();
    log.info(`server placed the character at ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }

  /** The server's id for an entity, for the debug panel; never the local id. */
  private wireIdFor(networkId: number): string | undefined {
    return this.connection instanceof WebSocketConnection
      ? this.connection.wireIdFor(networkId)
      : undefined;
  }

  /** Cast from the bar. Ranks are deduplicated, so an overtaken lower rank is refused here. */
  private castSpell(spellId: number): void {
    const targetNetworkId = castTargetFromBar({
      spellId,
      bar: spellBarSignal.value,
      mayStartCast: mayStartCast(),
      hudTargetId: hudTargetId.value,
      networkIdOf: localId => this.bodies.networkIdOf(localId),
    });
    if (targetNetworkId === null) return;

    // The server takes id 0 for self or no target.
    this.connection.sendCastSpell(spellId, targetNetworkId);
    if (targetNetworkId !== 0 && !this.whoIs.isSelf(targetNetworkId)) {
      this.castFacing.aimed(targetNetworkId, performance.now());
    }
  }

  /** Report position now, for a teleport or arrival rather than a walk. */
  private reportPositionNow(state: EntityMovementState): void {
    if (!this.connection.connected || !this.online) return;
    const player = this.world.player;
    if (!player) return;

    this.lastPositionSent = performance.now();
    this.lastReportedState = state;
    this.connection.sendPlayerPosition(player.position, gameYaw(this.movement.yaw), false, state);
  }

  /**
   * Rate-limited; the server keeps only the last report. A stop ignores the
   * timer, or the character runs on the spot for everyone else.
   */
  private reportPosition(now: number): void {
    if (!this.connection.connected || !this.online) return;

    const player = this.world.player;
    if (!player) return;

    const moving = this.movement.moving;
    const state = this.movementState();
    const report = decideTimedPositionReport({
      now,
      lastSent: this.lastPositionSent,
      intervalMs: POSITION_INTERVAL_MS,
      lastState: this.lastReportedState,
      state,
      moving,
      velocity: this.movement.velocity,
    });
    if (!report) return;

    this.lastPositionSent = report.sentAt;
    this.lastReportedState = report.state;
    // In the wire's convention: anything other than this client reading it
    // would disagree otherwise.
    this.connection.sendPlayerPosition(
      player.position,
      gameYaw(this.movement.yaw),
      moving,
      report.state,
      report.velocity,
      report.speed,
    );
  }

  /** `fly` is this client's own and goes out as ordinary movement. */
  private movementState(): EntityMovementState {
    return movementStateForPosture(this.posture(), this.movement.moving, this.movement.direction);
  }

  private syncGuideArrow(): void {
    const player = this.world.player;
    const mapId = this.world.zone?.mapId;
    const target =
      player && mapId !== undefined
        ? guideTarget(trackedQuest.value, mapId, player.position)
        : null;
    this.renderer.setGuideArrow(target && player ? guidePlacement(target, player.position) : null);
    // The log says when a quest has nowhere to point, which otherwise looks broken.
    setGuideTargetKnown(target !== null);
  }

  /** Selection can change outside `selectTarget`; recolouring alone replays no pop. */
  private syncTargetRing(): void {
    const id = this.targetId;
    if (id === null) {
      this.renderer.setTargetEntity(null);
      return;
    }
    const entity = this.world.entities.get(id);
    if (!entity) {
      setTarget(null);
      this.renderer.setTargetEntity(null);
      return;
    }
    this.renderer.setTargetEntity(id, this.whoIs.relationTo(entity));
  }

  private updateHud(): void {
    const now = performance.now();
    if (!this.hudDirty && now - this.lastHudUpdate < 100) return;
    this.hudDirty = false;
    this.lastHudUpdate = now;
    this.publishHud();
    this.debug.frameMs.hud = performance.now() - now;
  }

  private publishHud(): void {
    const stats = this.renderer.stats();
    if (this.diagnosticsRoot.style.display !== 'none')
      this.hud.render({
        zoneName: this.world.zone?.name ?? '',
        position: this.world.player?.position ?? [0, 0, 0],
        fps: this.fps,
        entities: stats.entityViews,
        animated: stats.animatedEntities,
        terrainTiles: stats.terrainTiles,
        pendingTiles: this.world.pendingTiles,
        drawCalls: stats.drawCalls,
        triangles: stats.triangles,
        textures: stats.texturesUploaded,
        effectsMs: stats.effectsMs,
        clipsMs: this.debug.frameMs.clips,
        status: this.status,
      });
    // Every row below is a creature or a player; the zone's scenery is never read.
    const bodies = [...this.world.movers];
    // Another player's name follows the ground ring's relationship.
    for (const row of remotePlayerNameRelations(bodies, this.world.player?.id, entity =>
      this.whoIs.relationTo(entity),
    )) {
      this.renderer.setPlayerNameRelation(row.id, row.relation);
    }
    setWorldUnits(
      hudUnitsFromEntities({
        entities: bodies,
        playerId: this.world.player?.id,
        relationTo: entity => this.whoIs.relationTo(entity),
        networkIdOf: id => this.bodies.networkIdOf(id),
        resourceForClass,
        dispositionOf: DISPOSITION_OF,
      }),
    );
    const mapZone = this.world.zone;
    const playerBody = this.world.player;
    const playerYaw = playerYawFromRotation(playerBody);
    const playerPosition = playerBody?.position ?? ([0, 0, 0] as [number, number, number]);
    const serviceMarkers: MapMarker[] = serviceMarkersForMap(
      bodies,
      this.world.player,
      this.mapIconUrls,
      entity => serviceMarkerKind(entity, showsOnMap),
    );

    if (!mapOpen.value && this.mapBrowseZoneId !== null) this.mapBrowseZoneId = null;
    const viewZone = selectViewZone({
      mapOpen: mapOpen.value,
      browsed: this.mapBrowseZoneId !== null ? this.zoneById(this.mapBrowseZoneId) : null,
      teleporting: mapTeleporting.value,
      travel: this.travelZone(),
      display: this.mapDisplayZone,
    });
    setMapState({
      zoneName: viewZone?.name ?? mapZone?.name ?? '',
      placeName: viewZone
        ? placeNameAt(
            detailZonesInTop(this.zoneCache, viewZone.id, DETAIL_ZONE_PRIORITY),
            mapZone?.mapId,
            playerPosition,
          )
        : '',
      bounds: viewZone?.bounds ?? mapZone?.bounds ?? null,
      playerPosition,
      playerYaw,
      markers: serviceMarkers,
      imageUrl: viewZone ? (this.areaMapUrls.get(viewZone.id) ?? null) : null,
      routeImageUrl: viewZone ? this.routeMapUrls.get(viewZone.id) : undefined,
      minimapUrl: this.minimap.url,
      minimapWindow: this.minimap.patch
        ? minimapWindow(
            playerPosition[0],
            playerPosition[2],
            MINIMAP_ZOOMS[minimapZoomStep.value] ?? 1,
            this.minimap.patch,
          )
        : null,
      places: viewZone ? this.placesIn(viewZone) : [],
      regions: this.worldRegions(),
      neighbours: viewZone ? this.neighboursOf(viewZone.id) : [],
      routes: viewZone && mapTeleporting.value ? this.routeLegsIn(viewZone) : [],
      worldMapUrl: this.worldMapUrl,
      worldMapSize: this.worldMapDrawn,
    });
    const mapLoads = mapHudLoads({
      mapZone,
      viewZone,
      playerPosition,
      hasAreaMapUrl: id => this.areaMapUrls.has(id),
      hasRouteMapUrl: id => this.routeMapUrls.has(id),
      mapOpen: mapOpen.value,
      teleporting: mapTeleporting.value,
      zonesWarmed: this.zoneCache.length > 0,
      hasAreaLinks: this.areaLinks !== null,
      hasWorldMap: this.worldMapUrl !== null,
      hasPlayerBody: playerBody !== null,
    });
    if (mapLoads.refreshMapZone && mapZone) void this.refreshMapZone(mapZone, playerPosition);
    if (mapLoads.loadAreaMapId !== null) {
      void this.areaMapUrl(mapLoads.loadAreaMapId).then(url => {
        if (url) this.hudDirty = true;
      });
    }
    if (mapLoads.loadRouteMapId !== null) {
      void this.routeMapUrl(mapLoads.loadRouteMapId).then(() => {
        this.hudDirty = true;
      });
    }
    if (mapLoads.warmZones)
      void this.warmZones().then(() => {
        this.hudDirty = true;
      });
    if (mapLoads.loadAreaLinks) void this.loadAreaLinks();
    if (mapLoads.loadWorldMap) void this.loadWorldMap();
    if (mapLoads.ensureMinimap) {
      void this.ensureMinimap(
        mapLoads.ensureMinimap.mapId,
        mapLoads.ensureMinimap.x,
        mapLoads.ensureMinimap.z,
      );
    }
    const mapIconRefs = collectMapIconRefs(serviceMarkers, this.world.entities);
    for (const ref of uncachedIconRefs(mapIconRefs, this.mapIconUrls)) {
      void this.mapIconUrl(ref).then(() => {
        this.hudDirty = true;
      });
    }
    for (const entity of bodies) {
      if (entity.kind !== 'creature') continue;
      for (const lookup of creatureNameLookups(entity, {
        pendingIds: this.pendingCreatureNames,
        pendingEntries: this.pendingEntryNames,
        namelessEntries: this.namelessEntries,
      })) {
        this.startNameLookup(entity, lookup);
      }
    }
  }

  private startNameLookup(entity: Entity, lookup: NameLookup): void {
    if (lookup.kind === 'subName') {
      const id = lookup.id;
      this.pendingCreatureNames.add(id);
      void this.resources
        .creatureName(id)
        .then(subName => {
          entity.networkSubName = subName ?? '';
          this.hudDirty = true;
        })
        .finally(() => this.pendingCreatureNames.delete(id));
    } else if (lookup.kind === 'entryName') {
      const entry = lookup.entry;
      this.pendingEntryNames.add(entry);
      void this.resources
        .creatureEntryName(entry)
        .then(name => {
          if (name) entity.networkName = name;
          else this.namelessEntries.add(entry);
          this.hudDirty = true;
        })
        .finally(() => this.pendingEntryNames.delete(entry));
    } else {
      const id = lookup.id;
      this.pendingCreatureNames.add(id);
      void this.resources
        .creatureName(id)
        .then(name => {
          if (name) entity.networkName = name;
          else log.warn(`no localized name for creature string id ${id}`);
          // Not a forced refresh: arriving among dozens of creatures would
          // rescan every entity once per resolved name.
          this.hudDirty = true;
        })
        .finally(() => this.pendingCreatureNames.delete(id));
    }
  }

  /* Selection is a tap, through pointer events only (synthesised clicks are
   * suppressed on touch). A press that travels is a look-drag. */
  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDown = pressFor(this.pointerDown, event) ?? this.pointerDown;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    const down = this.pointerDown;
    if (!down || down.id !== event.pointerId) return;
    this.pointerDown = null;
    if (!releaseIsTap(down, event, TAP_SLOP)) return;

    const nextTap = nextTapState({
      previous: this.lastTap,
      x: event.clientX,
      y: event.clientY,
      at: performance.now(),
      doubleTapMs: DOUBLE_TAP_MS,
      tapSlop: TAP_SLOP,
    });
    this.lastTap = nextTap.next;
    this.tap(event.clientX, event.clientY, nextTap.isSecondTap);
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.pointerDown?.id === event.pointerId) this.pointerDown = null;
  };

  /** One tap targets; a second tap on the target acts, once in reach (`tapSelection`). */
  private tap(clientX: number, clientY: number, isSecondTap: boolean): void {
    const iconId = this.renderer.pickInteractionEntity(clientX, clientY);
    const picked = tapSelection({
      bodyId: this.renderer.pickEntity(clientX, clientY),
      iconId,
      lastTapped: this.lastTapped,
      isSecondTap,
    });
    if (picked === null) {
      this.clearTarget();
      return;
    }

    this.lastTapped = picked.id;
    this.selectTarget(String(picked.id));
    if (picked.action === 'interact') this.approachTarget(picked.id);
  }

  /** Walk into reach of a body, then act. */
  private approachTarget(id: EntityId): void {
    const entity = this.world.entities.get(id);
    if (!entity || this.whoIs.isOwnBody(id)) return;
    const asked = interactionWithEntity({
      relation: this.whoIs.relationTo(entity),
      canAttack: this.canAttack(entity),
      interactable: isInteractable(entity),
    });
    if (asked === 'none') return;
    this.stopFollow();
    const ranged = hasRangedWeaponEquipped(
      this.playerWeapons?.ranged,
      this.playerRangedSubclass,
      ITEM_CLASS.weapon,
    );
    const kind = entity.kind === 'player' || entity.kind === 'creature' ? entity.kind : 'static';
    this.approach = beginApproach({
      id,
      asked,
      targetKind: kind,
      holdsRangedWeapon: ranged,
      targetWhenAsked: hudTargetId.value,
    });
    this.updateApproach();
  }

  /**
   * Drive the approach per frame; the rules are `approachStep`'s.
   * @param directionHeld false for a tap, which is not a direction.
   */
  private updateApproach(directionHeld = false): void {
    const approach = this.approach;
    if (!approach) return;

    const entity = this.world.entities.get(approach.id);
    const here = this.world.player?.position ?? null;
    const there = entity?.position ?? null;
    const now = performance.now() / 1000;
    approach.progress = updateApproachProgress(approach.progress, here, there, now);
    const action = approachActionNow({
      heroDead: this.heroDeath.isDown,
      directionHeld,
      here,
      there,
      stillWanted: this.lastTapped === approach.id,
      retargeted: hudTargetId.value !== approach.targetWhenAsked,
      asked: approach.asked,
      now: entity
        ? interactionWithEntity({
            relation: this.whoIs.relationTo(entity),
            canAttack: this.canAttack(entity),
            interactable: isInteractable(entity),
          })
        : 'none',
      stopDistance: approach.stopDistance,
      reach: approach.reach,
      progress: approach.progress,
      nowSeconds: now,
      running: this.movement.autoRunTo !== null,
    });

    switch (action.kind) {
      case 'cancel':
        this.cancelApproach();
        return;
      case 'giveUp':
        this.cancelApproach();
        reportToPlayer("Can't get there from here");
        return;
      case 'run':
        this.movement.autoRunTo = [...action.to];
        return;
      case 'brake':
        this.movement.autoRunTo = null;
        return;
      case 'act':
        this.approach = null;
        this.interactWith(String(approach.id));
        return;
    }
  }

  /** Held input cancels an approach outright, rather than merely winning. */
  private steerApproach(input: InputState): void {
    if (this.approach === null) return;
    this.updateApproach(heldDirection(input));
  }

  /** Drop the approach without acting; the player has taken the controls. */
  private cancelApproach(): void {
    if (this.approach === null && this.movement.autoRunTo === null) return;
    this.approach = null;
    this.movement.autoRunTo = null;
  }

  /** Follow a player, or stop following. */
  private toggleFollow(id: EntityId): void {
    if (this.follow?.id === id) {
      this.stopFollow();
      return;
    }
    const entity = this.world.entities.get(id);
    if (!entity || entity.kind !== 'player' || this.whoIs.isOwnBody(id)) return;
    // Approach and follow share one auto-run field.
    this.cancelApproach();
    this.follow = { id, stopDistance: approachStopDistance({ kind: 'player' }) };
    setFollowing({ unitId: String(id) });
    this.updateFollow();
  }

  private stopFollow(): void {
    if (this.follow === null) return;
    this.follow = null;
    this.movement.autoRunTo = null;
    setFollowing(null);
  }

  /**
   * Drive the follow per frame on `approachStep`'s rules, except arriving
   * waits instead of acting.
   */
  private updateFollow(directionHeld = false): void {
    const follow = this.follow;
    if (!follow) return;

    const entity = this.world.entities.get(follow.id);
    const action = followActionNow({
      heroDead: this.heroDeath.isDown,
      directionHeld,
      here: this.world.player?.position ?? null,
      there: entity?.position ?? null,
      stopDistance: follow.stopDistance,
      running: this.movement.autoRunTo !== null,
    });

    switch (action.kind) {
      case 'cancel':
      case 'giveUp':
        this.stopFollow();
        return;
      case 'run':
        this.movement.autoRunTo = [...action.to];
        return;
      case 'brake':
      case 'act':
        this.movement.autoRunTo = null;
        return;
    }
  }

  /** Held input cancels a follow outright, the same rule `steerApproach` runs on. */
  private steerFollow(input: InputState): void {
    if (this.follow === null) return;
    this.updateFollow(heldDirection(input));
  }

  private canAttack(entity: Entity): boolean {
    return canAttackEntity({
      kind: entity.kind,
      dead: entity.networkDead === true,
      standing: this.whoIs.standingTo(entity),
    });
  }

  private attackTarget(id: EntityId): void {
    const entity = this.world.entities.get(id);
    if (!entity || this.whoIs.isOwnBody(id)) return;
    if (!this.canAttack(entity)) return;
    const networkId = this.bodies.networkIdOf(id);
    if (networkId === undefined) return;
    this.connection.sendAttackStart(networkId);
  }

  /** Let go of the target; the next tap on it only selects. */
  private clearTarget(): void {
    if (this.targetId === null) return;
    this.lastTapped = null;
    setTarget(null);
    this.renderer.setTargetEntity(null);
  }

  private selectTarget(localId: string): void {
    const id = Number(localId);
    const entity = this.world.entities.get(id) ?? null;
    const isOwnBody = this.whoIs.isOwnBody(id);
    const selection = pickTargetSelection({
      localId,
      entity,
      isOwnBody,
      onOwnSide: this.onOwnSide(id),
      followId: this.follow?.id ?? null,
    });
    if (!selection || !entity) return;
    if (selection.stopFollow) this.stopFollow();
    setTarget(selection.localId);
    this.renderer.setTargetEntity(selection.id, this.whoIs.relationTo(entity));
    const networkId = this.bodies.networkIdOf(selection.id);
    if (networkId !== undefined) {
      this.connection.sendTarget(networkId);
    }
  }

  /**
   * What clicking an NPC or static does. The teleport map is local; the
   * bank's window opens off `inventory.bankOpen`.
   */
  private interactWith(localId: string): void {
    const entity = this.world.entities.get(Number(localId));
    if (!entity) return;
    /*
     * A corpse is not an NPC: alive-or-dead decides first, then the kind of
     * thing. Interacting with something attackable attacks it.
     * `interactionFor` holds the order.
     */
    const interaction = interactionWithEntity({
      relation: this.whoIs.relationTo(entity),
      canAttack: this.canAttack(entity),
      interactable: isInteractable(entity),
    });
    const route = routeInteraction(interaction, serviceFor(entity));
    if (route === null) return;
    if (route.kind === 'loot') {
      this.lootOpener.open(Number(localId));
      return;
    }
    if (route.kind === 'attack') {
      this.attackTarget(Number(localId));
      return;
    }
    if (route.kind === 'travel') {
      openTeleportMap();
      return;
    }
    const service = route.service;
    // A static object exists locally and again as a networked entity at the
    // same spot; the click may hit either, so find the networked twin.
    const networkId = serviceNetworkIdForInteraction({
      service,
      entityKind: entity.kind,
      directNetworkId: this.bodies.networkIdOf(entity.id),
      twinNetworkId: this.networkTwinOf(entity),
    });
    if (networkId === undefined) {
      this.showOffline(entity, service);
      return;
    }
    dispatchOnlineService(service, networkId, {
      storage: unitId => {
        log.info(`storage: asking to open box ${unitId}`);
        this.connection.sendOpenBank(unitId);
      },
      mail: unitId => {
        log.info(`mail: asking to open mailbox ${unitId}`);
        this.connection.sendMailOpen(unitId);
      },
      summon: unitId => {
        this.connection.sendSummonOpen(unitId);
      },
      quests: unitId => {
        this.quests.listFrom(unitId);
      },
      shop: unitId => {
        this.shopVendorId = unitId;
        showShop(
          vendorShopInteraction({
            vendorName: entity.networkName || 'Vendor',
            balance: this.playerMoney ?? 0,
            networkId: unitId,
            sendVendorBuy: (id, slot, itemId, quantity) =>
              this.connection.sendVendorBuy(id, slot, itemId, quantity),
            sendVendorSell: (id, slot, itemId) => this.connection.sendVendorSell(id, slot, itemId),
            openBag: () => openCharacterWindow('bag', true),
          }),
        );
        this.connection.sendVendorOpen(unitId);
      },
      auction: unitId => {
        // Whether an NPC runs a market is the server's to say.
        this.connection.sendAuctioneerOpen(unitId);
      },
      talk: unitId => {
        this.connection.sendNpcTalk(unitId);
      },
      use: unitId => {
        /*
         * Whether a quest-item static object has anything to give depends on
         * the player's quests, so every plain static click goes to the
         * server, which silently refuses an empty one.
         */
        this.connection.sendStaticObjectInteract(unitId);
      },
    });
  }

  private showOffline(entity: Entity, service: Service): void {
    const view = offlineServiceView({
      service,
      entityId: entity.id,
      vendorName: entity.networkName || 'Vendor',
      balance: this.playerMoney ?? 0,
    });
    if (!view) return;
    switch (view.kind) {
      case 'warn':
        log.warn(view.message);
        return;
      case 'shop':
        showShop(view.interaction);
        return;
      case 'debug':
        showDebugInteraction(view.interaction);
        return;
    }
  }

  /**
   * The server's networked twin of a locally spawned static object. Matched
   * on position and `entry`, never on nearness: two banks may stand close.
   */
  private networkTwinOf(entity: Entity): number | undefined {
    return networkTwinNetworkIdFor(entity, this.world.entities.values(), id =>
      this.bodies.networkIdOf(id),
    );
  }

  private get targetId(): number | null {
    const v = hudTargetId.value;
    return v !== null ? Number(v) : null;
  }

  /** Switch the player's clip when the movement state changes. */
  private updatePlayerClip(dt: number): void {
    const player = this.world.player;
    if (!player) return;

    if (this.heroDeath.isDown) {
      const clip = this.heroDeath.takeClip();
      if (clip !== null) void this.renderer.setEntityClip(player.id, clip, 1, true);
      return;
    }

    // Moving ends a chant (the server interrupts it too). Swings and releases
    // play on the upper body and carry on.
    if (this.movement.direction !== 'idle' && this.renderer.hasHeldAction(player.id)) {
      this.renderer.clearEntityAction(player.id);
    }

    this.clips.setMounted(this.movement.isMounted());
    const want = this.clips.update(this.posture(), movementOf(this.movement.direction), dt, clip =>
      this.renderer.clipLength(player.id, clip),
    );
    if (want) void this.renderer.setEntityClip(player.id, want.clip, 1, want.once);
  }

  /** A stationary combatant, or caster, eases toward its target without locking movement yaw. */
  private easeCombatFacing(dt: number): void {
    if (this.movement.moving) return;
    const castAt = this.castFacing.target(!mayStartCast(), performance.now());
    const targetId =
      castAt !== null
        ? (this.whoIs.localIdOf(castAt) ?? null)
        : this.combatStance !== null
          ? this.targetId
          : null;
    if (targetId === null) return;
    const target = this.world.entities.get(targetId);
    if (!target || (target.kind !== 'creature' && target.kind !== 'player')) return;
    this.movement.easeTowards(target.position, dt);
  }

  /**
   * `justLanded` lasts one frame, but the landing one-shot it starts runs on:
   * `stand` leaves the one-shot alone.
   */
  private posture(): Posture {
    const mode = this.movement.locomotion;
    if (mode === 'fly') return 'fly';
    if (mode === 'swim') return 'swim';
    if (mode === 'air') {
      return this.movement.airborneReason() === 'fall' ? 'fall' : 'jump';
    }
    if (this.movement.justLanded()) {
      return this.movement.direction === 'idle' ? 'landStill' : 'landMoving';
    }
    if (this.movement.isFlourishing()) return 'flourish';
    // A guard replaces standing and running only; a stun replaces both.
    return stunnedPosture(
      this.world.player?.networkStunned === true,
      combatPosture(this.combatStance, this.movement.direction === 'idle' ? 'stand' : 'run'),
    );
  }

  /** Advance and draw one frame, for when `requestAnimationFrame` is paused. */
  step(dt = 1 / 60): void {
    const input = this.input.sample();
    this.steerApproach(input);
    this.steerFollow(input);
    if (!this.heroDeath.isDown) this.movement.update(input, dt);
    this.castFromKeys(input.castSlots);
    if (input.deselect) this.clearTarget();
    if (this.movement.isMounted() && this.movement.locomotion === 'swim') this.dismount();
    this.world.update();
    this.world.updateNetwork(dt);
    this.bodies.settle();
    this.renderer.sync(this.world);
    this.renderer.render(dt);
    this.updatePlayerClip(dt);
    this.bodies.updateClips(dt);
    this.combat.update(dt);
    tickSpells(dt);
    this.updateHud();
  }

  /** Move the player and let them settle onto whatever is under the destination. */
  teleport(x: number, y: number, z: number): Record<string, unknown> {
    const player = this.world.player;
    if (!player) return { error: 'no player' };
    this.movement.reset();
    this.world.setPosition(player, x, y, z);
    this.world.update();
    const resting = this.world.restingHeight(x, z, y).y;
    this.world.setPosition(player, x, resting, z);

    // Report at once: the server picks what to send you from your last
    // reported position, and there is no separate teleport message.
    this.reportPositionNow(EntityMovementState.Standing);

    // The drop to standing height is silent, so report where they landed.
    return {
      asked: [x, y, z],
      landed: player.position.map(v => Number(v.toFixed(2))),
      droppedBy: Number((y - resting).toFixed(2)),
      zone: this.world.zone?.name ?? null,
      tilesPending: this.world.pendingTiles,
    };
  }

  /**
   * Null when nothing came back in time: an unknown message or a non-operator
   * account, whose refusal is already in the log.
   */
  private askForNavigationGround(radius?: number): Promise<NavigationGround | null> {
    return new Promise(resolve => {
      const timer = window.setTimeout(() => {
        if (this.navigationWaiting === settle) this.navigationWaiting = null;
        resolve(null);
      }, NAVIGATION_ANSWER_TIMEOUT_MS);
      const settle = (ground: NavigationGround): void => {
        window.clearTimeout(timer);
        resolve(ground);
      };
      this.navigationWaiting = settle;
      this.connection.sendNavigationRequest(radius);
    });
  }

  stop(): void {
    this.running = false;
    this.frameClock.stop();
  }

  /**
   * The unstuck request: release spirit when dead, "send me to a graveyard"
   * when alive. TODO: the alive half has no control, and `unstuck_refused`
   * gets no reaction.
   */
  releaseSpirit(): void {
    this.connection.sendPlayerUnstuck();
  }

  /**
   * Load a zone behind the boot screen, for first start and teleports. It
   * hides once drawable (attach and texture queues empty), not on arrival.
   */
  private async loadZoneWithScreen(zone: ZoneInfo): Promise<void> {
    // The progress bar takes the destination's fog colour.
    const accent = fogAccent(this.world.atmosphere.fogColor);

    // Not awaited: the zone does not wait on its wallpaper.
    void this.loadSplash(zone.id);

    // Chosen now so it decodes behind the loading screen.
    const [soundX, soundZ] = soundscapePoint(zone, this.spawn);
    void this.soundscapeAt(zone.mapId, soundX, soundZ);
    this.warmHeroSounds();

    // `World.loadZone` resets the world; combat visuals point into it.
    this.bodies.close();
    this.combat.clear();
    forgetBodyCasts();

    this.boot.progress(`Loading ${zone.name} — map data`, null, accent);
    // Before `loadZone`: the streamer fills the first window during it.
    this.renderer.resetZone();
    // Without an explicit look the default wears every slot's variant 0.
    let playerModel = PLACEHOLDER_PLAYER_MODEL;
    let playerLook = await this.resources.tryGet(avatarLookId(PLACEHOLDER_PLAYER_MODEL));
    if (this.selectedCharacter) {
      try {
        const resolved = await this.resources.networkAppearance(
          characterAppearanceRequest(this.selectedCharacter),
        );
        playerModel = resolved.model;
        playerLook = resolved.appearance ?? playerLook;
      } catch (err) {
        log.warn(`could not resolve selected character appearance: ${String(err)}`);
      }
    }
    await this.world.loadZone(zone.id, playerModel, playerLook ?? undefined, stage => {
      const step = stageProgress(stage, zone.name, this.world.terrain.tileCount);
      this.boot.progress(step.text, step.fraction, accent);
    });
    // The area map is per top region; adopt it before a teleport result can
    // open the map on the previous one.
    this.mapDisplayZone = await this.topZone(zone.id);
    if (this.mapDisplayZone)
      void this.areaMapUrl(this.mapDisplayZone.id).then(() => {
        this.hudDirty = true;
      });
    this.bodies.open();
    // The player joins the id map here: it needs the new body and must
    // survive `open`, which clears the map.
    if (this.selfNetworkId && this.world.player) {
      this.bodies.linkSelf(this.selfNetworkId, this.world.player.id);
    }
    this.applyPlayerWeapons();

    // `Renderer.sync` gates attaching by distance from `rig.target`, which
    // nothing has aimed yet on the first load.
    if (this.world.player) {
      const [x, y, z] = this.world.player.position;
      this.renderer.rig.target.set(x, y + DEFAULT_MOVEMENT.eyeHeight, z);
    }

    const entities = this.world.entities.size;
    const attachments = this.renderer.pendingAttachments;
    const startAttached = this.renderer.attachedSoFar;
    let textures = -1;
    let calmReadings = 0;
    while (calmReadings < 2) {
      // First load only: the frame loop syncs every frame afterwards.
      if (!this.running) this.renderer.sync(this.world);
      if (textures < 0) textures = Math.max(this.renderer.pendingTextures, 0);
      const step = buildStep(
        {
          zoneName: zone.name,
          entities,
          attachments,
          textures,
          pendingAttachments: this.renderer.pendingAttachments,
          pendingTextures: this.renderer.pendingTextures,
          attachedSince: this.renderer.attachedSoFar - startAttached,
        },
        LOAD_SCREEN_SETTLE_THRESHOLD,
      );
      if (step.drained) {
        calmReadings++;
        if (calmReadings >= 2) break;
      } else {
        calmReadings = 0;
      }
      this.boot.progress(step.text, step.fraction, accent);
      await frameDelay();
    }
    // Portraits taken while the world was still arriving round them are taken again.
    this.renderer.forgetHeadshots();
    this.boot.hide();
  }

  /** A build extracted without sound: ask once for the file, and remember a no. */
  private async offerSound(): Promise<void> {
    if (await this.local.hasSound()) return;
    try {
      if (globalThis.localStorage?.getItem(NO_SOUND_KEY)) return;
    } catch {
      return;
    }
    const files = await this.boot.pickFile(
      'This build was extracted without its music and sound effects.\n\n' +
        'Choose your .ipa to add them, or carry on in silence.',
      pickIpa,
      { label: 'Choose game file...', skipLabel: 'Carry on without sound' },
    );
    if (files.length) {
      await this.local.attachSource(files[0]);
      return;
    }
    try {
      globalThis.localStorage?.setItem(NO_SOUND_KEY, '1');
    } catch {
      // Storage blocked: the question returns next time.
    }
  }

  /** Offer the game file after a missing-pack failure; true means retry. */
  private async reconnectAndRetry(err: unknown): Promise<boolean> {
    if (await this.local.isComplete()) return false;
    if (await this.local.canExtractMore()) return false;
    if (!isMissingMapFailure(err)) return false;

    const stored = await storedIpa();
    const offer = missingMapOffer(stored);
    const files = await this.boot.pickFile(
      offer.prompt,
      stored
        ? async () => {
            const file = await reopenIpa(true);
            return file ? [file] : [];
          }
        : pickIpa,
      { label: offer.label, skipLabel: offer.skipLabel },
    );
    if (!files.length) return false;
    await this.local.attachSource(files[0]);
    return true;
  }

  /**
   * The server moved the player (bus, dungeon gate, GM). Across maps the
   * position is applied after the load, or the new zone's spawn point wins.
   */
  private async arriveByTeleport(
    mapId: number,
    position: [number, number, number],
    yaw: number,
  ): Promise<void> {
    // The server announces a map change twice, in either order.
    if (this.arriving) return;
    this.arriving = true;
    try {
      await this.applyArrival(mapId, position, yaw);
    } finally {
      this.arriving = false;
    }
  }

  private async applyArrival(
    mapId: number,
    position: [number, number, number],
    yaw: number,
  ): Promise<void> {
    log.info(`server moved us to map ${mapId} at ${position.map(v => v.toFixed(1)).join(', ')}`);
    closeDebugInteraction();
    closeGossip();
    closeMap();

    const sameMap = this.world.zone?.mapId === mapId;
    if (!sameMap) {
      const zone = await this.zoneAt(mapId, position);
      if (!zone) {
        this.status = `the server moved us to map ${mapId}, which the mounted data has no zone for`;
        log.warn(this.status);
        return;
      }
      // Seeded before the load, as on first entry.
      this.spawn = { mapId, position };
      await this.teleportToZone(zone.id);
    }

    const player = this.world.player;
    if (!player) return;
    this.movement.reset();
    this.clips.reset();
    this.world.setPosition(
      player,
      position[0],
      this.world.restingHeight(position[0], position[2], position[1]).y,
      position[2],
    );
    // In the server's convention. Movement holds its own facing and would
    // snap back otherwise.
    this.world.setYaw(player, gameYaw(yaw));
    this.movement.yaw = gameYaw(yaw);
    // The destination is usually a different region even on the same map.
    this.mapDisplayZone = null;
    this.hudDirty = true;
    this.reportPositionNow(EntityMovementState.Standing);
  }

  /** The smallest zone on `mapId` whose bounds hold this position. */
  private async zoneAt(
    mapId: number,
    position: [number, number, number],
  ): Promise<ZoneInfo | null> {
    const index = await this.resources.zoneIndex();
    return pickZoneAt(index.zones, mapId, position);
  }

  /**
   * With a server, the server moves the player, as for any other journey;
   * a zone loaded here alone would leave it holding the old map. The
   * arrival comes back as `world.entered`. Offline, the zone just loads.
   */
  /** Every named item in the build, read once for the admin panel's search. */
  private itemCatalogue: Promise<ItemHit[]> | null = null;

  private itemCatalog(): Promise<ItemHit[]> {
    this.itemCatalogue ??= this.resources
      .itemCatalog()
      .then(items => [...items])
      .catch(() => {
        // Not mounted yet: ask again on the next search.
        this.itemCatalogue = null;
        return [];
      });
    return this.itemCatalogue;
  }

  private async adminTeleport(zoneId: number): Promise<void> {
    if (!this.online || !this.connection.connected) return this.teleportToZone(zoneId);
    const zone = await this.resources.zone(zoneId).catch(() => null);
    if (!zone) {
      this.status = `zone ${zoneId} not found`;
      return;
    }
    const [x, z] = zone.spawn;
    this.connection.sendAdminTeleport(zone.info.mapId, x, z);
  }

  private async teleportToZone(zoneId: number): Promise<void> {
    const index = await this.resources.zoneIndex();
    const zone = index.zones.find(z => z.id === zoneId);
    if (!zone) {
      this.status = `zone ${zoneId} not found`;
      return;
    }
    this.status = `loading ${zone.name}...`;
    try {
      try {
        await this.loadZoneWithScreen(zone);
      } catch (err) {
        // A map pack never extracted and no file attached: offer the file now.
        if (!(await this.reconnectAndRetry(err))) throw err;
        await this.loadZoneWithScreen(zone);
      }
      this.status = '';
    } catch (err) {
      this.status = `could not load ${zone.name}: ${String(err)}`;
      log.warn(this.status);
    } finally {
      // A zone whose packs are not extracted throws part-way; never leave the overlay up.
      this.boot.hide();
    }
    this.reportMissing(zone.name);
    this.movement.reset();
    this.clips.reset();
    // The server picks what to send from your last reported position.
    this.reportPositionNow(EntityMovementState.Standing);
  }

  /** Extraction progress: the boot screen before the world exists, the HUD after. */
  private reportExtraction(p: {
    pack: string;
    done: number;
    total: number;
    index?: number;
    count?: number;
    overallDone?: number;
    overallTotal?: number;
  }): void {
    const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
    if (this.inGame) {
      this.status = `extracting ${p.pack} ${pct}%`;
      return;
    }
    // A whole-build extraction needs overall progress, or "45% of res.bin" reads as stuck.
    if (p.index && p.count && p.overallTotal) {
      const done = p.overallDone ?? 0;
      this.boot.progress(
        `Extracting the game — ${gb(done)} of ${gb(p.overallTotal)}
` +
          `${p.pack}  (${p.index} of ${p.count})
` +
          'This happens once. Afterwards the game file is not needed.',
        done / p.overallTotal,
      );
      return;
    }
    this.boot.progressBytes(`Extracting ${p.pack}`, p.done, p.total);
  }

  // — combat helpers --------------------------------------------------------

  /**
   * Tell the renderer what the player holds. Combat clips are named per
   * weapon (`combat_ready_1h`), so the bare name silently plays nothing.
   */
  private applyPlayerWeapons(): void {
    const player = this.world.player;
    const character = this.selectedCharacter;
    if (!player) return;
    if (this.playerWeapons) {
      this.playerRangedSubclass = this.playerWeapons.ranged.subClass;
      this.renderer.setEntityWeapons(player.id, weaponsFromHands(this.playerWeapons));
      return;
    }
    if (!character) {
      this.renderer.setEntityWeapons(player.id, UNARMED);
      return;
    }
    this.readHeroHands(character.equipment);
    void this.resources
      .equippedWeapons(character.equipment)
      .then(weapons => {
        // Re-read: a zone load can rebuild the world meanwhile.
        const current = this.world.player;
        if (current) this.renderer.setEntityWeapons(current.id, weapons);
      })
      .catch(() => {
        const current = this.world.player;
        if (current) this.renderer.setEntityWeapons(current.id, UNARMED);
      });
    void this.resources
      .itemWeaponClass(character.equipment[15] ?? 0)
      .then(item => {
        this.playerRangedSubclass = item.itemClass === 2 ? item.subClass : undefined;
      })
      .catch(() => {
        this.playerRangedSubclass = undefined;
      });
  }

  private readHeroHands(equipment: readonly number[]): void {
    const hand = async (slot: number): Promise<WeaponHand> => {
      const entry = equipment[slot] ?? 0;
      if (!entry) return { entry: 0, itemClass: 0, subClass: 0 };
      const item = await this.resources
        .itemWeaponClass(entry)
        .catch(() => ({ itemClass: 0, subClass: 0 }));
      return { entry, ...item };
    };
    void Promise.all([
      hand(WEAPON_SLOT.mainhand),
      hand(WEAPON_SLOT.offhand),
      hand(WEAPON_SLOT.ranged),
    ]).then(([mainhand, offhand, ranged]) => {
      this.heroHands = { mainhand, offhand, ranged };
    });
  }

  /** The hero's current look with other pieces on, for the fitting room. */
  private async lookWearing(entries: readonly number[]): Promise<Entity['appearance'] | undefined> {
    const character = this.selectedCharacter;
    if (!character) return undefined;
    const equipment = [...character.equipment];
    for (const [slot, item] of Object.entries(equippedSlots.peek())) {
      if (item) equipment[Number(slot)] = item.entry;
    }
    for (const entry of entries) {
      const facts = itemFacts.peek().get(entry) ?? (await this.resources.itemFacts(entry));
      const at = equipmentHomesFor(facts?.inventoryType ?? 0)[0];
      if (at !== undefined) equipment[at] = entry;
    }
    const resolved = await this.resources.networkAppearance({
      entry: 0,
      displayInfoId: character.displayInfoId,
      race: character.race,
      gender: character.gender,
      skin: character.appearance.skin,
      face: character.appearance.face,
      hairStyle: character.appearance.hairStyle,
      hairColor: character.appearance.hairColour,
      equipment,
      animationId: 0,
    });
    return resolved.appearance;
  }

  private combatWords(): CombatWords {
    return { enter: sayLine(LINES.combatEnter), leave: sayLine(LINES.combatLeave) };
  }

  /** Stamps that the player just asked another player something, so a silent refusal can be matched to it. */
  private noteAsked(): void {
    this.askedPlayerAt = performance.now();
  }

  private sayNotice(text: string | null): void {
    if (text) noteChat({ channel: 'notice', sender: '', text });
  }

  /** Follow, inspect, talent and instance windows: all requests; the answers come as server messages. */
  private installWindowActions(): void {
    setFollowActions({
      toggleTarget: () => {
        const local = hudTargetId.value;
        if (local !== null) this.toggleFollow(Number(local));
      },
    });

    setInspectActions({
      openTarget: () => {
        const local = hudTargetId.value;
        const networkId = this.whoIs.targetNetworkId();
        if (local === null || networkId === undefined) return;
        const unit = worldUnitsSignal.value.find(one => one.id === local);
        const equipment = this.equipmentByNetworkId.get(networkId) ?? [];
        this.art.resolveInspectArt(equipment);
        openInspect({
          unitId: local,
          name: unit?.name ?? '',
          equipment,
          ...(unit?.classId ? { classId: unit.classId } : {}),
          ...(this.bodies.genderOf(networkId) !== undefined
            ? { gender: this.bodies.genderOf(networkId) }
            : {}),
        });
      },
    });

    setTalentActions({
      learn: talentId => {
        this.connection.sendTalentLearn(talentId);
        this.audio.play(TALENT_ADD_SOUND);
      },
    });

    setInstanceActions({
      enter: (mapId, position, yaw) => {
        noteInstanceRequested(mapId);
        this.connection.sendInstanceEnter(mapId, position, yaw);
      },
      resetDungeons: () => this.connection.sendDungeonRestart(),
      chooseDungeonMode: mode => this.connection.sendDungeonChooseMode(mode),
    });
  }

  /** Give up the player's cast, as a jump does; the chant stops here at once. */
  private callOffCast(): void {
    const spellId = abandonCast();
    if (spellId === null) return;
    this.connection.sendCancelSpell(spellId);
    this.combat.stopCast(this.selfNetworkId);
    const player = this.world.player;
    if (player && this.renderer.hasHeldAction(player.id)) {
      this.renderer.clearEntityAction(player.id);
    }
  }

  private onOwnSide(id: EntityId): boolean {
    return onOwnSideId({
      id,
      isOwnBody: this.whoIs.isOwnBody(id),
      networkId: this.bodies.networkIdOf(id),
      partyNetworkIds: partyRoster.peek().members.map(member => member.networkId),
    });
  }

  /** What a body wears on arrival; replaces its icons rather than adding. */
  private wearAuras(unitId: number, held: readonly HeldAura[]): void {
    setAurasOf(auraKey(unitId), held.map(appliedFrom));
    for (const aura of held) this.showAura(unitId, aura);
  }

  /** The aura each body is turned by (its shape is another creature's), so ending it can turn it back. */
  private readonly turnedBy = new Map<number, number>();

  private readonly heroShape = new HeroShape({
    look: async shape => {
      const character = this.selectedCharacter;
      if (!character) return null;
      try {
        const look = await this.resources.networkAppearance({
          entry: 0,
          displayInfoId: character.displayInfoId,
          race: character.race,
          gender: character.gender,
          skin: character.appearance.skin,
          face: character.appearance.face,
          hairStyle: character.appearance.hairStyle,
          hairColor: character.appearance.hairColour,
          equipment: [...character.equipment],
          animationId: 0,
          shape,
        });
        return { model: look.model, scale: look.scale, appearance: look.appearance as Appearance };
      } catch (err) {
        log.warn(`could not shape the hero: ${String(err)}`);
        return null;
      }
    },
    hero: () => this.world.player ?? undefined,
    setAppearance: (entity, appearance) => this.world.setAppearance(entity, appearance),
    refresh: entity => void this.renderer.refreshAppearance(entity),
  });

  private showAura(unitId: number, aura: HeldAura, spellVisualId = 0): void {
    void this.resources.spellAvatar(aura.spellId).then(display => {
      if (display <= 0) return;
      this.turnedBy.set(unitId, aura.spellId);
      this.turnInto(unitId, display);
    });

    void this.spellVisualFor(aura.spellId, spellVisualId).then(visual => {
      void this.combat.addAura(unitId, visual, aura.remaining || aura.maxDuration);
    });
  }

  /** Turn a body, the hero's own included, into a creature display, or back to itself with 0. */
  private turnInto(unitId: number, display: number): void {
    if (this.whoIs.isSelf(unitId)) void this.heroShape.set(display);
    else this.bodies.transform(unitId, display);
  }

  /** Wire value, else the spell's own row; 0 is no visual. */
  private async spellVisualFor(spellId: number, fromServer = 0): Promise<number> {
    if (fromServer !== 0) return fromServer;
    if (!spellId) return 0;
    return castVisualId(fromServer, await this.resources.spellVisualOf(spellId));
  }

  /** A combat clip on the action level, blended over the legs. */
  private playClip(
    networkId: number,
    clip: string,
    options: PlayClipOptions = COMBAT_ACTION,
  ): void {
    const player = this.world.player;
    if (this.whoIs.isSelf(networkId)) {
      if (player) void this.renderer.setEntityAction(player.id, clip, options);
    } else {
      this.bodies.playAction(networkId, clip, options.hold, options.allBody);
    }
  }

  /** The local body behind a server id, the hero's own included. */
  private bodyOf(networkId: number): EntityId | undefined {
    return this.whoIs.isSelf(networkId) ? this.world.player?.id : this.whoIs.localIdOf(networkId);
  }

  /** A gather's tool goes when the gather ends, however it ends. */
  private putToolAway(networkId: number): void {
    const body = this.bodyOf(networkId);
    if (body !== undefined) this.renderer.dropHeldItem(body);
  }

  /** A body with a cast bar filling: a swing, shot or flinch clip would take the cast's pose away. */
  private isCastingBody(networkId: number): boolean {
    return this.whoIs.isSelf(networkId) ? !mayStartCast() : bodyCasts.value.has(networkId);
  }

  private playClipNamed(networkId: number, name: string): void {
    void this.resources.animationNamed(name).then(clip => {
      if (clip) this.playClip(networkId, clip);
      else log.once('debug', `clip:${name}`, `the animation table has no clip named ${name}`);
    });
  }

  /**
   * Play a server-named emote as a one-shot base clip, not an action: the
   * guard coming down at a fight's end would stop an action at once.
   */
  private playEmote(networkId: number, animationId: number): void {
    void this.resources.animationName(animationId).then(clip => {
      if (!clip) {
        log.once('debug', `anim:${animationId}`, `no clip named by animation ${animationId}`);
        return;
      }
      const player = this.world.player;
      if (!this.whoIs.isSelf(networkId)) this.bodies.gesture(networkId, clip);
      else if (player) this.clips.playOnce(clip, name => this.renderer.clipLength(player.id, name));
    });
  }

  private stopClip(networkId: number): void {
    const player = this.world.player;
    if (this.whoIs.isSelf(networkId)) {
      if (player) this.renderer.clearEntityAction(player.id);
    } else {
      this.bodies.stopAction(networkId);
    }
  }

  /** Hold a body's guard or aim between swings; null lets it down. */
  private setCombatPosture(networkId: number, stance: CombatStance): void {
    if (this.whoIs.isSelf(networkId)) {
      this.combatStance = stance;
      const player = this.world.player;
      if (player) this.renderer.setEntityCombatStance(player.id, stance);
    } else {
      this.bodies.setStance(networkId, stance);
      const local = this.bodies.localIdOf(networkId);
      if (local !== undefined) this.renderer.setEntityCombatStance(local, stance);
    }
  }

  /** A standing unit faces its target every frame; the player's body is never turned. */
  private faceWhileFighting(networkId: number, targetId: number | null): void {
    if (this.whoIs.isSelf(networkId)) return;
    this.bodies.setFaceTarget(networkId, targetId);
  }

  /** The hero rides `mountId` (0 on foot); any other body is seated by `NetworkBodies`. */
  private async applyHeroMount(mountId: number): Promise<void> {
    const player = this.world.player;
    if (!player) return;
    this.movement.setMounted(mountId > 0);
    void this.renderer.setEntityMount(player.id, mountId);
    const rows = mountId > 0 ? await this.resources.mountList().catch(() => []) : [];
    this.heroMountSound = rows.find(row => row.id === mountId)?.effect || null;
  }

  /** Get down here at once, and tell the server, which would otherwise keep the rider up. */
  private dismount(): void {
    void this.applyHeroMount(0);
    this.connection.sendDismount();
  }

  /** A value batch names only values that moved; an absent stealth state is left alone. */
  private applyAuraState(entityId: EntityId, values: Record<string, number>): void {
    const stunned = isStunned(values);
    const stunnedBody = this.world.entities.get(entityId);
    if (stunned !== undefined && stunnedBody) stunnedBody.networkStunned = stunned;
    const ghosted = isGhosted(values);
    if (ghosted === undefined) return;
    const entity = this.world.entities.get(entityId);
    if (entity) entity.networkStealthed = ghosted;
    const sight = stealthSight(ghosted, this.onOwnSide(entityId));
    if (sight === 'hidden' && this.targetId === entityId) this.clearTarget();
    this.renderer.setEntityGhost(
      entityId,
      sight === 'faded' ? GHOST_ALPHA : sight === 'hidden' ? 0 : 1,
    );
  }

  private setNetworkCombat(networkId: number, fighting: boolean): void {
    const local = this.bodies.localIdOf(networkId);
    if (local === undefined) return;
    const entity = this.world.entities.get(local);
    if (entity) entity.networkInCombat = fighting;
  }

  /** A blow passed between the player and a body; `blowStartsFight` decides hostility. */
  private markFightingMe(attackerId: number, targetId: number, outcome: Outcome | null): void {
    const struckByPlayer = this.whoIs.isSelf(attackerId);
    const other = struckByPlayer ? targetId : this.whoIs.isSelf(targetId) ? attackerId : 0;
    if (other === 0 || this.whoIs.isSelf(other)) return;
    if (this.fightingMe.has(other)) return;
    const local = this.bodies.localIdOf(other);
    const entity = local === undefined ? undefined : this.world.entities.get(local);
    const standing = entity ? this.whoIs.standingTo(entity, false) : 'enemy';
    const fightsBack = entity?.networkNeverFightsBack !== true;
    if (!blowStartsFight(outcome, struckByPlayer, standing, fightsBack)) return;
    this.fightingMe.add(other);
    this.recolour(other);
  }

  private noteDeath(networkId: number): void {
    const local = this.bodies.localIdOf(networkId);
    const entity = local === undefined ? undefined : this.world.entities.get(local);
    if (!entity) return;
    if (this.recentDeaths.some(death => death.networkId === networkId)) return;
    this.recentDeaths.push({
      networkId,
      entry: entity.entry,
      name: entity.networkName ?? '',
    });
    if (this.recentDeaths.length > 8) this.recentDeaths.shift();
  }

  private forgetFightingMe(networkId: number): void {
    if (!this.fightingMe.delete(networkId)) return;
    this.recolour(networkId);
  }

  private forgetEveryFight(): void {
    if (this.fightingMe.size === 0) return;
    const were = [...this.fightingMe];
    this.fightingMe.clear();
    for (const networkId of were) this.recolour(networkId);
  }

  /**
   * Re-apply colour after a relationship change. The ground ring and target
   * label settle their colour at selection, so they must be told.
   */
  private recolour(networkId: number): void {
    this.hudDirty = true;
    const local = this.bodies.localIdOf(networkId);
    if (local === undefined || local !== this.targetId) return;
    const entity = this.world.entities.get(local);
    if (entity) this.renderer.setTargetEntity(local, this.whoIs.relationTo(entity));
  }

  private answerBlow(attackerId: number, outcome: Outcome | null): void {
    const local = this.bodies.localIdOf(attackerId);
    const attacker = local === undefined ? undefined : this.world.entities.get(local);
    if (local === undefined || !attacker) return;
    const picked = this.targetId === null ? undefined : this.world.entities.get(this.targetId);
    const target: PickSeen =
      picked === undefined
        ? 'none'
        : this.targetId === local
          ? 'attacker'
          : picked.networkDead === true
            ? 'fallen'
            : 'other';
    const reply = replyToBlow({
      heroAlive: player.value?.dead !== true,
      harmful: !restoresHealth(outcome),
      attackerAlive: attacker.networkDead !== true,
      attackerHostile: this.whoIs.standingTo(attacker) === 'enemy',
      target,
      swinging: this.combatStance !== null,
      casting: !mayStartCast(),
    });
    if (reply.pick) this.selectTarget(String(local));
    if (reply.swing && this.targetId === local) this.connection.sendAttackStart(attackerId);
  }

  /** A unit's health as of a blow that has just landed, ahead of the batched value push. */
  private applyFinalHealth(targetId: number, finalHealth: number | undefined): void {
    if (finalHealth === undefined || finalHealth < 0) return;
    this.healthBeforeBlow = this.healthOf(targetId);
    const values = { [FIELD_IDS.health]: finalHealth };
    this.bodies.updateValues({ networkId: targetId, values });
    if (!this.whoIs.isSelf(targetId)) return;

    const current = this.selectedCharacter;
    if (!current) return;
    applyPlayerValues(values, {
      name: current.name,
      level: current.level,
      classId: current.class,
      gender: current.gender,
      networkId: this.selfNetworkId,
    });
  }

  private healthOf(networkId: number): { health: number; maxHealth: number } | undefined {
    if (this.whoIs.isSelf(networkId)) {
      const hero = player.value;
      return hero === undefined || hero === null
        ? undefined
        : { health: hero.health, maxHealth: hero.maxHealth };
    }
    return this.bodies.healthOf(networkId);
  }

  /** Health just before the blow being drawn; read once and cleared. */
  private healthBeforeBlow: { health: number; maxHealth: number } | undefined;

  /** Float a damage number over the defender; `spell` picks the colour. */
  private showDamage(
    attackerId: number,
    targetId: number,
    damage: number,
    outcome: Outcome | null = 'hit',
    options: {
      spell?: boolean;
      spellId?: number;
      finalHealth?: number;
      offHand?: boolean;
      absorbed?: number;
    } = {},
  ): void {
    const numbered = showsANumber(damage, options.absorbed ?? 0);
    /*
     * Only the hero's fights are shown. With no self id at all the filter
     * stands down rather than hiding every number.
     */
    const knowsSelf = this.selfNetworkId !== 0;
    const mine = !knowsSelf || this.whoIs.isSelf(attackerId) || this.whoIs.isSelf(targetId);
    if (knowsSelf && !mine) {
      // If this fires for the player's own blows, the self id is wrong.
      log.once(
        'warn',
        'combat-not-mine',
        `combat between ${attackerId} and ${targetId} names neither the player ` +
          `(${this.selfNetworkId}); no damage number drawn. ubiquitous.combat() for the rest.`,
      );
    }
    // Attack start is a posture, not a blow; only blows turn a body red.
    if (mine) this.markFightingMe(attackerId, targetId, outcome);
    if (this.whoIs.isSelf(targetId) && !this.whoIs.isSelf(attackerId))
      this.answerBlow(attackerId, outcome);
    this.debug.recordCombat({
      kind: options.spell === true ? 'spell' : 'attack',
      attacker: attackerId,
      target: targetId,
      self: this.selfNetworkId,
      damage,
      outcome,
      drawn: numbered && mine,
      why: numbered
        ? mine
          ? ''
          : 'neither end of it was the player'
        : 'the health change was zero',
      knowsSelf,
      targetAt: this.whoIs.positionOf(targetId),
      spellId: options.spellId,
      finalHealth: options.finalHealth,
    });

    const before = this.healthBeforeBlow;
    this.healthBeforeBlow = undefined;
    if (this.debug.damageLogOn && mine) {
      log.info(
        describeCombatEvent(
          {
            kind: options.spell === true ? 'spell' : 'attack',
            attacker: attackerId,
            target: targetId,
            self: this.selfNetworkId,
            damage,
            outcome,
            spellId: options.spellId,
            finalHealth: options.finalHealth,
            healthBefore: before?.health,
            maxHealth: before?.maxHealth,
          },
          { nameOf: (id: number) => this.bodies.nameOf(id) },
        ),
      );
    }
    /* Damage is a signed health change; zero is dropped unless a shield took
     * the whole blow or the blow was turned aside. */
    if (!numbered && !turnedAside(outcome)) return;
    if (!mine) return;
    // Logged regardless; only the drawing is optional.
    if (!savedOptions.value.damageNumbers) return;
    const aside = turnedAside(outcome);

    const healing = restoresHealth(outcome);
    const critical = isCritical(outcome);

    const onHero = this.whoIs.isSelf(targetId);
    addDamageNumber(
      damage,
      // Anchored to the body, so a fleeing mob carries its number.
      this.whoIs.localIdOf(targetId) ?? null,
      DAMAGE_NUMBER_HEIGHT,
      {
        healing,
        spell: options.spell === true,
        critical,
        onSelf: onHero,
        ...(aside ? { word: sayLine(LINES[TURNED_ASIDE_LINE[aside]]) } : {}),
        offHand: options.offHand === true,
        // Scatter, so two blows in one frame both read; the hero's are pinned.
        offsetX: onHero
          ? 0
          : (Math.random() - 0.5) * DAMAGE_NUMBER_SCATTER +
            (options.offHand === true ? DAMAGE_NUMBER_SCATTER : 0),
        offsetY: onHero ? 0 : (Math.random() - 0.5) * DAMAGE_NUMBER_SCATTER * 0.6,
      },
    );
  }

  /** Re-project floating numbers onto their bodies each frame, mutating entries. */
  private trackFloatingNumbers(): void {
    const numbers = floatingNumbersSignal.value;
    if (numbers.length === 0) return;
    for (const n of numbers) {
      // The hero's numbers draw at a fixed HUD place, unprojected.
      if (n.onSelf) continue;
      const entity = n.entityId === null ? undefined : this.world.entities.get(n.entityId);
      if (!entity) continue;
      const projected = this.renderer.projectToScreen(
        entity.position[0],
        entity.position[1] + n.worldY,
        entity.position[2],
      );
      n.onScreen = projected !== null;
      if (!projected) continue;
      n.x = projected.x + n.offsetX;
      n.y = projected.y + n.offsetY - floatRise(n);
    }
  }

  /** Put this frame's pop messages under the hero's projected nameplate. */
  private trackPopMessages(): void {
    const messages = popMessagesSignal.value;
    if (messages.length === 0) return;
    const hero = this.world.player;
    for (const message of messages) {
      if (message.place === 'banner') continue;
      if (!hero) {
        message.onScreen = false;
        continue;
      }
      const projected = this.renderer.projectToScreen(
        hero.position[0],
        hero.position[1] + DAMAGE_NUMBER_HEIGHT,
        hero.position[2],
      );
      message.onScreen = projected !== null;
      if (!projected) continue;
      message.x = projected.x;
      message.y = projected.y + POP_MESSAGE_DROP;
    }
  }

  /** Whose head a chat line goes over: the player first, then whoever in view has that name. */
  private saidBy(sender: string): number | undefined {
    if (!sender) return undefined;
    const hero = this.world.player;
    if (hero && sender === this.selectedCharacter?.name) return hero.id;
    for (const entity of this.world.entities.values()) {
      if (entity.networkName === sender) return entity.id;
    }
    return undefined;
  }

  /** Put speech over the top of the speaker's bounding box. */
  private trackChatSaid(): void {
    forgetOldSaid();
    const said = chatSaid.value;
    if (said.length === 0) return;
    for (const one of said) {
      const entity = this.world.entities.get(one.networkId);
      if (!entity) {
        one.onScreen = false;
        continue;
      }
      const projected = this.renderer.projectToScreen(
        entity.position[0],
        entity.position[1] + this.renderer.chatHeight(entity.id) + SAID_CLEARANCE,
        entity.position[2],
      );
      one.onScreen = projected !== null;
      if (!projected) continue;
      one.x = projected.x;
      one.y = projected.y;
    }
  }

  /**
   * The defender's reaction, played `SWING_LANDS_AFTER_MS` after the blow so
   * it meets the swing. A newer blow replaces one still waiting.
   */
  private showDefence(defenderId: number, outcome: Outcome | null, blow?: WeaponFamily): void {
    if (restoresHealth(outcome)) return;
    this.clearDefence(defenderId);
    const timer = window.setTimeout(() => {
      this.defendTimers.delete(defenderId);
      this.applyDefence(defenderId, outcome, blow);
    }, SWING_LANDS_AFTER_MS);
    this.defendTimers.set(defenderId, timer);
  }

  /** Drop one defender's waiting reaction: its blow will never land here. */
  private clearDefence(networkId: number): void {
    const pending = this.defendTimers.get(networkId);
    if (pending === undefined) return;
    window.clearTimeout(pending);
    this.defendTimers.delete(networkId);
  }

  /** Drop every waiting reaction: blows from another map must not land in this one. */
  private clearAllDefences(): void {
    for (const networkId of this.defendTimers.keys()) this.clearDefence(networkId);
  }

  /** Nothing when it is gone — a sound without a place would come out at full volume. */
  private playCombatSound(sound: number | string | readonly string[], networkId: number): void {
    if (this.whoIs.isSelf(networkId)) {
      this.audio.play(sound);
      return;
    }
    const at = this.whoIs.positionOf(networkId);
    if (at) this.audio.play(sound, at);
  }

  private playLevelUpEffect(): void {
    const hero = this.selfNetworkId;
    if (!hero) return;
    void this.resources.impactVisual(LEVEL_UP_EFFECT).then(visual => {
      if (visual !== null) this.combat.playHit(hero, visual);
      else
        log.once(
          'debug',
          `levelup:${LEVEL_UP_EFFECT}`,
          `no spell visual plays ${LEVEL_UP_EFFECT} alone`,
        );
    });
  }

  private applyDefence(defenderId: number, outcome: Outcome | null, blow?: WeaponFamily): void {
    const fighting = this.whoIs.isSelf(defenderId)
      ? this.combatStance === 'melee'
      : this.bodies.stanceOf(defenderId) === 'melee';
    const reaction = defendReaction(outcome, fighting);
    if (!reaction) return;
    this.defenceSound(defenderId, outcome, blow);
    if (reaction.spark) {
      const file = reaction.spark;
      void this.resources.impactVisual(file).then(visual => {
        if (visual !== null) this.combat.playHit(defenderId, visual);
        else log.once('debug', `spark:${file}`, `no spell visual plays ${file} alone`);
      });
    }
    // Struck mid-cast, the caster keeps casting; only death or the cast's end stops it.
    if (!this.isCastingBody(defenderId)) this.playClipNamed(defenderId, reaction.clip);
  }

  /** One summary line of what the zone referenced and the build does not ship. */
  private reportMissing(zoneName: string): void {
    const failures = this.resources.failureSummary();
    if (!failures.length) return;
    const total = failures.reduce((n, [, count]) => n + count, 0);
    log.info(
      `${zoneName}: ${failures.length} distinct assets unavailable ` +
        `(${total} requests). ubiquitous.missing() lists them.`,
    );
  }

  /** Push settings into the game, at construction and on change. `?tiles=` pins the window. */
  private applyOptions(current: OptionsState): void {
    const profile = resolveGraphics(current.quality, current);
    this.renderer.setGraphics(profile);
    this.renderer.setFog(current.fog);
    this.world.setTileWindow(this.config.tileWindow ?? profile.tileWindow);
    this.input.setJoystickEnabled(current.touchStick);
    this.input.setBindings(current.keybinds);
    this.renderer.setPostSettings({
      toneMapping: current.toneMapping,
    });
    this.diagnosticsRoot.style.display = current.diagnostics ? '' : 'none';
    this.audio.setMusicEnabled(current.music);
    this.audio.setEffectsEnabled(current.sound);
  }

  /** The ears follow the hero; music and ambience follow the zone, a few times a second. */
  private updateSound(dt: number): void {
    const hero = this.world.player;
    this.countWindows();
    for (const networkId of this.bodies.takeStopped()) this.cry(networkId, 'idle');
    if (!hero) return;
    this.audio.setListener(hero.position, this.renderer.cameraForward());
    this.heroMoveSounds(hero.position, dt);
    this.soundscapeInS -= dt;
    if (this.soundscapeInS > 0) return;
    this.soundscapeInS = SOUNDSCAPE_EVERY_S;
    const mapId = this.world.zone?.mapId;
    if (mapId !== undefined) void this.soundscapeAt(mapId, hero.position[0], hero.position[2]);
  }

  private async soundscapeAt(mapId: number, x: number, z: number): Promise<void> {
    if (!this.audio.loaded) await this.audio.ready();
    const zones = this.zoneCache.length ? this.zoneCache : await this.warmZones().catch(() => []);
    const here = zoneSoundAt(zones, mapId, x, z);
    if (!here) return;
    const fight = this.battleMusic ? this.audio.battleMusic(here.zoneId) : 0;
    this.audio.setMusic(fight || here.music);
    this.audio.setAmbience(here.ambience);
  }

  private cry(networkId: number, state: UnitSoundState): void {
    if (!this.whoIs.isSelf(networkId) && !this.whoIs.positionOf(networkId)) return;
    const nowS = performance.now() / 1000;
    if (!this.voiceGate.allows(networkId, state, nowS, this.whoIs.isSelf(networkId))) return;
    const at = this.soundPlace(networkId);
    void this.voiceSet(networkId)
      .then(sounds => {
        // Own choice: no death cry falls back to the hurt cry.
        const cue = sounds?.[state] ?? (state === 'dead' ? sounds?.hurt : undefined);
        if (cue) this.audio.play(cue, at);
      })
      .catch(() => undefined);
  }

  private warmVoice(networkId: number): void {
    void this.audio
      .ready()
      .then(() => this.voiceSet(networkId))
      .then(sounds => {
        if (sounds) this.audio.preload(Object.values(sounds) as number[]);
      })
      .catch(() => undefined);
  }

  /** Decode the hero's own sounds once per session; one played early is late, never lost. */
  private warmHeroSounds(): void {
    if (this.heroSoundsWarm) return;
    this.heroSoundsWarm = true;
    void this.audio.ready().then(() => {
      const names: string[] = [...HERO_SOUNDS];
      for (const family of WEAPON_FAMILIES) {
        names.push(
          swingSound(family),
          impactSound(family, false),
          impactSound(family, true),
          parrySound(family),
        );
      }
      this.audio.preload(names);
      this.warmVoice(this.selfNetworkId);
    });
  }

  private warmSpellSounds(spells: readonly number[]): void {
    void this.audio.ready().then(async () => {
      for (const spellId of spells) {
        const visualId = await this.resources.spellVisualOf(spellId).catch(() => 0);
        const visual = visualId
          ? await this.resources.spellVisual(visualId).catch(() => null)
          : null;
        const sounds = Object.values(visual?.phases ?? {})
          .map(phase => phase?.sound ?? 0)
          .filter(id => id > 0);
        if (sounds.length) this.audio.preload(sounds);
      }
    });
  }

  private async voiceSet(networkId: number): Promise<UnitSounds | null> {
    const who = this.voiceOf(networkId);
    if (!who) return null;
    return this.resources.unitSounds(who.entry, who.displayInfoId, who.race, who.gender);
  }

  /** The hero's sounds are heard as the hero's, not from a point in the world. */
  private soundPlace(networkId: number): [number, number, number] | undefined {
    if (this.whoIs.isSelf(networkId)) return undefined;
    return this.whoIs.positionOf(networkId) ?? undefined;
  }

  private heroMoveSounds(at: readonly [number, number, number], dt: number): void {
    const m = this.movement;
    const locomotion = m.locomotion;
    const water = locomotion === 'ground' ? this.world.waterAt(at[0], at[2]) : null;
    const heard = this.moveSounds.step(
      {
        locomotion,
        moving: m.moving,
        backward: m.direction === 'backward',
        jumped:
          locomotion === 'air' && this.lastLocomotion !== 'air' && m.airborneReason() === 'jump',
        landed: m.justLanded(),
        wading: water?.surface != null && water.surface > at[1],
        surface: locomotion === 'ground' ? this.world.surfaceAt(at[0], at[2], at[1]) : 'ground',
        underwater: m.isDiving(),
        mount: m.isMounted() ? this.heroMountSound : null,
        stride: this.world.player ? this.renderer.stride(this.world.player.id) : null,
      },
      dt,
    );
    this.lastLocomotion = locomotion;
    for (const choice of heard.sounds) this.audio.play(choice);
    if (heard.jumpVoice) this.cry(this.selfNetworkId, 'jump');
  }

  /** `blow` is the striking weapon's family; a spell brings its own sound. */
  private defenceSound(defenderId: number, outcome: Outcome | null, blow?: WeaponFamily): void {
    switch (outcome) {
      case 'hit':
      case 'critical':
        if (blow) this.playCombatSound(impactSound(blow, outcome === 'critical'), defenderId);
        this.cry(defenderId, 'hurt');
        break;
      case 'block':
        this.playCombatSound(BLOCK_SOUND, defenderId);
        break;
      case 'parry':
        this.playCombatSound(parrySound(this.weaponOf(defenderId, 'mainhand')), defenderId);
        break;
    }
  }

  /** A body the server said nothing about fights with its fists. */
  private weaponOf(networkId: number, hand: 'mainhand' | 'offhand' | 'ranged'): WeaponFamily {
    const hands = this.whoIs.isSelf(networkId)
      ? (this.playerWeapons ?? this.heroHands)
      : this.bodies.handsOf(networkId);
    return weaponFamily(hands?.[hand]);
  }

  private itemSound(entry: number, pick: (kind: ItemKind) => string): void {
    void this.resources
      .itemFacts(entry)
      .then(facts => {
        if (facts) this.audio.play(pick(facts));
      })
      .catch(() => undefined);
  }

  private greet(networkId: number): void {
    this.talkingTo = networkId;
    this.cry(networkId, Math.random() < 0.5 ? 'greeting' : 'hello');
  }

  /** A press clicks unless it made its own sound a moment later (a window opening, say). */
  private readonly onUiClick = (event: MouseEvent): void => {
    const click = clickOf(event.target);
    if (!click) return;
    const before = this.audio.started;
    window.setTimeout(() => {
      if (this.audio.started !== before) return;
      this.audio.play(click === 'tab' ? TAB_SOUND : BUTTON_SOUND);
    }, CLICK_YIELD_MS);
  };

  /** Counted each frame from the window stores, so no window has to announce itself. */
  private countWindows(): void {
    const open = [
      openScreen.peek() !== null,
      mapOpen.peek(),
      bankOpen.peek(),
      shopInteraction.peek() !== null,
      lootWindow.peek() !== null,
      gossip.peek() !== null,
      questConversation.peek() !== null,
    ].filter(Boolean).length;
    if (open > this.openWindows) this.audio.play(WINDOW_OPEN_SOUND);
    else if (open < this.openWindows) this.audio.play(WINDOW_CLOSE_SOUND);
    this.openWindows = open;
    if (this.talkingTo !== null && gossip.peek() === null && questConversation.peek() === null) {
      this.cry(this.talkingTo, 'bye');
      this.talkingTo = null;
    }
  }

  /** The hero's voice: their own display row, else their race's. */
  private voiceOf(
    networkId: number,
  ): { entry: number; displayInfoId: number; race: number; gender: number } | null {
    if (!this.whoIs.isSelf(networkId)) return this.bodies.voiceOf(networkId) ?? null;
    const character = this.selectedCharacter;
    if (!character) return null;
    return {
      entry: 0,
      displayInfoId: character.displayInfoId,
      race: character.race,
      gender: character.gender,
    };
  }

  private castFromKeys(slots: readonly number[]): void {
    for (const slot of slots) {
      const spellId = barSlotsSignal.value[slot];
      if (spellId !== undefined && spellId !== null) this.castSpell(spellId);
    }
  }

  dispose(): void {
    this.stopOptions();
    this.stopPieces();
    this.stopDialogs();
    this.stopEmblems();
    this.stopSpellIcons();
    this.stopSpellStats();
    this.stopTalentWords();
    this.stop();
    for (const timer of this.defendTimers.values()) window.clearTimeout(timer);
    this.defendTimers.clear();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('click', this.onUiClick, true);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    clearChat();
    this.input.dispose();
    this.renderer.dispose();
    this.audio.dispose();
    this.connection.disconnect();
    this.resources.dispose();
    void this.admin?.then(panel => panel.dispose());
  }
}

/** The window's longest edge in device pixels, capped at the packs' largest rung (1024). */
function splashSize(): number {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const edge = Math.max(window.innerWidth, window.innerHeight) * dpr;
  return Math.min(1024, Math.max(512, Math.round(edge)));
}

function gb(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** Yield one frame; a timeout covers hidden tabs where rAF never fires. */
export function frameDelay(): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    const settle = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(settle);
    setTimeout(settle, 50);
  });
}

function describeStartupFailure(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof ProviderNotReadyError) return message;

  return [
    `Could not start: ${message}`,
    '',
    'If a previous extraction was interrupted, clear it and try again:',
    '  await ubiquitous.clearPacks()   then reload',
    '  await ubiquitous.storage()      shows how much room is left',
  ].join('\n');
}

/**
 * Storage tools on `window.ubiquitous`, available before the game starts. Chrome's
 * "Clear site data" does not reliably empty the origin-private filesystem.
 */
function installStorageTools(): void {
  const w = window as unknown as { ubiquitous?: Record<string, unknown> };
  w.ubiquitous ??= {};
  Object.assign(w.ubiquitous, {
    /** Delete every extracted pack. Reload afterwards. */
    clearPacks: async (): Promise<string> => {
      await clearAllPacks();
      return 'cleared - reload the page';
    },
    /** How much storage the extracted packs are using, and what is left. */
    storage: async (): Promise<Record<string, string>> => {
      const { quota, usage } = await storageEstimate();
      return {
        used: `${(usage / 1e9).toFixed(2)} GB`,
        quota: `${(quota / 1e9).toFixed(2)} GB`,
        free: `${((quota - usage) / 1e9).toFixed(2)} GB`,
        persisted: String((await navigator.storage?.persisted?.()) ?? false),
      };
    },
    /** Logging: 1 everything, 2 warnings (default), 3 errors only. */
    log: (level: 1 | 2 | 3): string => {
      localStorage.ubiquitousDebug = String(level);
      return `log level ${level} - reload to apply everywhere`;
    },
  });
  log.info('storage: window.ubiquitous.clearPacks() / .storage() / .log(1|2|3)');
}
