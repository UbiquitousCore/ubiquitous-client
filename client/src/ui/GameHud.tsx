import { render } from 'preact';
import type { JSX } from 'preact';
import { useCallback, useEffect, useState } from 'preact/hooks';
import { ShopWindowContainer } from './ShopWindowContainer';
import { useWornScreen } from './art/useWorn';
import { ArtAuctionWindow } from './components/ArtAuctionWindow';
import { MENU_SCREEN } from './components/ArtMenuBar';
import { ArtFocusPanel } from './components/ArtFocusPanel';
import { ArtMapWindow } from './components/ArtMapWindow';
import { ArtMinimap } from './components/ArtMinimap';
import { useMapKeys } from './components/mapKeys';
import { ArtPlayerFrame } from './components/ArtPlayerFrame';
import type { TopbarAction } from './components/ArtTopbarMenu';
import { beginWhisper } from './chatStore';
import { addFriend } from './socialListStore';
import { ReportPlayerContainer } from './ReportPlayerContainer';
import { InspectPanelContainer } from './InspectPanelContainer';
import { Button } from './components/Button';
import { ArtCastBar } from './components/ArtCastBar';
import { DamageNumbers } from './components/DamageNumbers';
import { ChatBubbles } from './components/ChatBubbles';
import { ChatPanel } from './components/ChatPanel';
import { PopMessages } from './components/PopMessages';
import { QuestMessages } from './components/QuestMessages';
import { BankWindowContainer } from './BankWindowContainer';
import { AskPromptContainer } from './AskPromptContainer';
import { ArtTeamFrames } from './components/ArtTeamFrames';
import { DeathPromptContainer } from './DeathPromptContainer';
import { LootWindowContainer } from './LootWindowContainer';
import { SummonWindowContainer } from './SummonWindowContainer';
import { MailWindowContainer } from './MailWindowContainer';
import { inInstance, instanceMapId } from './instanceStore';
import { partyActions, partyRoster } from './partyStore';
import { GuildInvitePromptContainer } from './GuildInvitePromptContainer';
import { GuildFoundPromptContainer } from './GuildFoundPromptContainer';
import { TradeWindowContainer } from './TradeWindowContainer';
import { tradeActions } from './tradeStore';
import { pvpActions } from './pvpStore';
import { followActions, following } from './followStore';
import { inspectActions } from './inspectStore';
import { GossipWindow } from './GossipWindow';
import { QuestConversationWindow } from './QuestConversationWindow';
import { Dialog } from './components/Dialog';
import { ArtJumpButton } from './components/ArtJumpButton';
import { ArtSpellBar } from './components/ArtSpellBar';
import { ArtSpellWheel } from './components/ArtSpellWheel';
import { InventoryWindow } from './InventoryWindow';
import {
  barSlots as barSlotsSignal,
  casting as castingSignal,
  brokenCast as brokenCastSignal,
  cooldowns as cooldownsSignal,
  globalCooldown as globalCooldownSignal,
  banner as bannerSignal,
  inCombat as inCombatSignal,
  mountSlot,
  WHEEL_FIRST,
  wheelSlots,
} from '../gameplay/SpellBook';
import { setSpellBarOpen, spellBarOpen } from './spellBarModel';
import { bodyCastShare, bodyCasts } from '../gameplay/bodyCasts';
import { auctionInteraction, closeAuction } from './auctionStore';
import {
  clearTarget,
  closeCharacterWindow,
  closeDebugInteraction,
  debugInteraction,
  openCharacterWindow,
  openScreen,
  showScreen,
  mapState,
  mapTeleport,
  mapTeleporting,
  selectMapRegion,
  player,
  target,
  setTarget,
  worldUnits,
} from './hudStore';
import type { Unit } from './hudStore';
import { auraKey, aurasFor } from './auraStore';
import { AuraRow } from './components/AuraRow';
import { AuraCard } from './components/AuraCard';

/**
 * How the HUD gets a portrait: `Game` hands it a headshot for a unit id and
 * it comes back as a data URL for the frame's socket. Null when the body is
 * not built yet — the frame shows its own cabochon then.
 */
export type HeadshotSource = (id: string) => string | null | undefined;

let headshotOf: HeadshotSource = () => null;

/** The one engine seam the HUD is allowed: ask it for a unit's portrait. */
export function setHeadshotSource(source: HeadshotSource): void {
  headshotOf = source;
}

/** Callback to cast a spell from the bar. */
export type CastCallback = (spellId: number) => void;

let castHandler: CastCallback = () => {};

/** Install the cast callback from Game.ts. */
export function setCastCallback(handler: CastCallback): void {
  castHandler = handler;
}

/** Callback to jump from the button in the corner. */
export type JumpCallback = () => void;

let jumpHandler: JumpCallback = () => {};

/** Install the jump callback from Game.ts. */
export function setJumpCallback(handler: JumpCallback): void {
  jumpHandler = handler;
}

/** Shared bottom-row classes; each row states only its distance from the edge. */
const BOTTOM_ROW = 'fixed left-1/2 z-hud-bar -translate-x-1/2';

/** Poll for a headshot: the body may not be built yet, and looks change; `setPortrait` dedupes. */
function usePortrait(unitId: string): string | null {
  const [portrait, setPortrait] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const refresh = (): void => {
      const url = headshotOf(unitId);
      // Clear the previous unit's portrait immediately. Otherwise an NPC whose
      // body is still loading inherits the player's last rendered image.
      if (live) setPortrait(url ?? null);
    };
    refresh();
    const timer = window.setInterval(refresh, 1000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [unitId]);
  return portrait;
}

/**
 * How far a body's cast has gone, 0 to 1, redrawn every frame while it
 * runs; null while it casts nothing.
 */
function useBodyCastShare(networkId: number | undefined): number | null {
  const cast = networkId === undefined ? undefined : bodyCasts.value.get(networkId);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!cast) return;
    let frame = 0;
    const tick = (): void => {
      setNow(performance.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cast]);
  return bodyCastShare(cast, now);
}

/**
 * The auras on a unit, in a row under its frame, found by the id the
 * server addresses the unit by — which is what every `aura.applied`
 * names it by.
 */
function UnitAuras({ unit }: { unit: Unit }): JSX.Element | null {
  const key = auraKey(unit.networkId);
  if (key === undefined) return null;
  return <AuraRow unitKey={key} auras={aurasFor(key)} className="mt-0.5" />;
}

/** The hero's own frame, with the hero's face in it once one has rendered. */
function PlayerFrame({ unit }: { unit: Unit }): JSX.Element {
  const portrait = usePortrait(unit.id);
  return <ArtPlayerFrame unit={unit} portraitUrl={portrait ?? undefined} />;
}

/**
 * The target frame in the shipped art, or nothing without a build. The
 * plus-menu offers whisper, trade, follow, friend, duel and observe always,
 * and invite or remove (with confirm) only when leading a team or in none.
 */
function TargetFrame({ unit }: { unit: Unit }): JSX.Element {
  const portrait = usePortrait(unit.id);
  const cast = useBodyCastShare(unit.networkId);

  const roster = partyRoster.value;
  const selfIsLeader = roster.members.find(m => m.name === player.value?.name)?.isLeader ?? false;
  const targetInParty = roster.members.some(m => m.name === unit.name);

  const actions: TopbarAction[] = [
    { icon: 'whisper', label: 'Whisper', onPick: () => beginWhisper(unit.id, unit.name) },
  ];
  if (selfIsLeader && targetInParty) {
    actions.push({
      icon: 'remove',
      label: 'Remove from team',
      onPick: () => partyActions().kickTarget(),
    });
  } else if (selfIsLeader || roster.partyId === null) {
    actions.push({
      icon: 'invite',
      label: 'Invite to team',
      onPick: () => partyActions().inviteTarget(),
    });
  }
  actions.push(
    { icon: 'trade', label: 'Trade', onPick: () => tradeActions().requestTarget() },
    {
      icon: 'follow',
      label: 'Follow',
      active: following.value?.unitId === unit.id,
      onPick: () => followActions().toggleTarget(),
    },
    { icon: 'friend', label: 'Add friend', onPick: () => addFriend(unit.id) },
    { icon: 'duel', label: 'Duel', onPick: () => pvpActions().challengeTarget() },
    { icon: 'observe', label: 'Inspect', onPick: () => inspectActions().openTarget() },
  );

  return (
    <ArtFocusPanel unit={unit} portraitUrl={portrait ?? undefined} actions={actions} cast={cast} />
  );
}

/**
 * The map, subscribed on its own. The map state changes whenever the player
 * moves; read in `GameHud`'s body, every step re-rendered the whole HUD.
 */
function LiveMapWindow(): JSX.Element {
  useMapKeys();
  return (
    <ArtMapWindow
      {...mapState.value}
      teleporting={mapTeleporting.value}
      onTeleport={mapTeleport}
      onSelectRegion={selectMapRegion}
    />
  );
}

/** The game HUD with player/target frames, action bar, cast bar, spell book, and damage numbers. */
export function GameHud(): JSX.Element {
  const currentPlayer = player.value;
  const currentTarget = target.value;
  // The game hangs an animated marker on the hero's frame while the hero is
  // in a fight, and one on the target's frame while *that unit* is — so a mob
  // swinging at you is marked on its own frame whichever of you started it.
  const fighting = inCombatSignal.value;
  const currentBanner = bannerSignal.value;
  const currentCasting = castingSignal.value;
  const shownCast = currentCasting ?? brokenCastSignal.value;
  const currentBarSlots = barSlotsSignal.value;
  const currentCooldowns = cooldownsSignal.value;
  const currentGlobalCooldown = globalCooldownSignal.value;

  // Whether the shipped menu can be drawn at all.
  const wornMenu = useWornScreen(MENU_SCREEN) !== null;

  const handleCast = useCallback((spellId: number) => {
    castHandler(spellId);
  }, []);

  return (
    /* `select-none` on the whole layer, not on the pieces that showed the
       problem. Every gesture here is aimed at the game: a drag that starts on
       the minimap and ends over the world is a drag, and letting the browser
       read it as a text selection paints its highlight over the compass, the
       zone name, every number on both unit frames and every key hint on the
       bar. Anything that ever wants selecting,
       a chat log being the obvious one, opts back in with `select-text`. */
    <div className="pointer-events-none fixed inset-0 z-hud flex items-start gap-2 overflow-hidden select-none max-sm:overflow-x-auto sm:gap-3">
      {currentPlayer && (
        /* `data-hud` rather than a class: `DamageNumbers` asks the document
           where the hero's portrait is, and a styling class is the wrong
           thing to hang a contract off.

           A real button, because tapping your own frame is how the character
           window opens. */
        <div className="relative shrink-0">
          <button
            type="button"
            data-hud="player"
            aria-label={`${currentPlayer.name}, open character screens`}
            aria-expanded={openScreen.value !== null}
            aria-haspopup={wornMenu ? 'menu' : undefined}
            // Tapping your own portrait opens the character screens. The
            // menu is part of them rather
            // than a thing of its own: it stays up beside whichever screen
            // is open, and the bag is the one it opens on.
            // Shut it if it is already open; otherwise open it on the bag.
            onClick={() =>
              openScreen.value === null ? openCharacterWindow('bag') : closeCharacterWindow()
            }
            className="pointer-events-auto block cursor-pointer border-0 bg-transparent p-0 focus-visible:shadow-selected focus-visible:outline-none"
          >
            <PlayerFrame unit={{ ...currentPlayer, inCombat: fighting }} />
          </button>
          <UnitAuras unit={currentPlayer} />
          {/* The rest of the team, straight under the hero's own frame. */}
          <div className="absolute top-full left-0">
            <ArtTeamFrames
              members={partyRoster.value.members}
              selfName={currentPlayer.name}
              units={worldUnits.value}
              onSelect={setTarget}
            />
          </div>
        </div>
      )}
      <ArtMinimap />
      <LiveMapWindow />
      {currentTarget && (
        <div
          data-hud="target"
          className="pointer-events-auto w-max max-w-80 shrink-0"
          onClick={clearTarget}
        >
          <TargetFrame unit={currentTarget} />
          <UnitAuras unit={currentTarget} />
        </div>
      )}

      {shownCast && (
        <div className={`${BOTTOM_ROW} pointer-events-none bottom-18`}>
          <ArtCastBar
            spellId={shownCast.spellId}
            castTime={shownCast.castTime}
            elapsed={shownCast.elapsed}
            interrupted={!currentCasting}
          />
        </div>
      )}

      <ArtSpellBar
        spells={currentBarSlots}
        mountSpell={mountSlot.value}
        cooldowns={currentCooldowns}
        globalCooldown={currentGlobalCooldown}
        castingSpellId={currentCasting?.spellId ?? null}
        power={currentPlayer?.mana ?? 0}
        dead={currentPlayer?.dead ?? false}
        onCast={handleCast}
        open={spellBarOpen.value}
        onOpenChange={setSpellBarOpen}
      />
      <ArtSpellWheel
        spells={wheelSlots.value}
        firstSlot={WHEEL_FIRST}
        cooldowns={currentCooldowns}
        globalCooldown={currentGlobalCooldown}
        castingSpellId={currentCasting?.spellId ?? null}
        onCast={handleCast}
      />
      <ArtJumpButton onJump={() => jumpHandler()} />

      {/* Self-driving: paints from its signal, not via HUD re-renders. */}
      <DamageNumbers />

      <AuraCard />

      <QuestMessages />

      <PopMessages />
      <ChatBubbles />
      <ChatPanel />

      <div className="pointer-events-none absolute inset-0 z-dialog flex items-center justify-center p-4">
        <QuestConversationWindow />
      </div>

      <div className="pointer-events-none absolute inset-0 z-dialog flex items-center justify-center p-4">
        <GossipWindow />
      </div>

      <div className="pointer-events-none absolute inset-0 z-dialog flex items-center justify-center p-4">
        <LootWindowContainer />
      </div>

      <div className="pointer-events-none absolute inset-0 z-dialog flex items-center justify-center p-4">
        <MailWindowContainer />
      </div>

      <div className="pointer-events-none absolute inset-0 z-dialog flex items-center justify-center p-4">
        <SummonWindowContainer />
      </div>

      <div className="pointer-events-none absolute inset-0 z-dialog flex items-center justify-center p-4">
        <TradeWindowContainer />
      </div>

      {/* Inferred from having asked, not reported by the server. */}
      {inInstance.value && (
        <div
          data-hud="instance"
          role="status"
          className="pointer-events-none fixed top-safe-t left-1/2 z-hud-float -translate-x-1/2 rounded-chrome border border-brass-600 bg-chrome-950/85 px-3 py-1 font-chrome text-tiny text-brass-300 shadow-frame"
        >
          Instance copy of map {instanceMapId.value} · inferred, not reported
        </div>
      )}

      {/* Keyed so a repeated message restarts the fade. */}
      {/* Where the banner stands and how large it is lettered are observed
        in play by the owner. */}
      {currentBanner && (
        <div
          key={currentBanner.key}
          data-hud="banner"
          role="status"
          className="pointer-events-none fixed top-1/3 left-1/2 z-hud-float -translate-x-1/2 animate-banner text-xl font-bold whitespace-nowrap text-alert text-shadow-world"
        >
          {currentBanner.text}
        </div>
      )}

      {/* Out of the DOM while shut, so keyboards cannot tab into it. */}
      {openScreen.value !== null && (
        <InventoryWindow
          screen={openScreen.value}
          onScreenChange={showScreen}
          onClose={closeCharacterWindow}
        />
      )}

      <ShopWindowContainer />

      {/* The auction house wears the shipped screen and nothing else:
          without a mounted build it draws nothing, the same as every
          other thing on screen that needs art from the user's game file. */}
      {auctionInteraction.value && (
        <ArtAuctionWindow {...auctionInteraction.value} onClose={closeAuction} />
      )}

      <BankWindowContainer />

      {debugInteraction.value && (
        <Dialog label={debugInteraction.value.title} size="md">
          <h2 className="m-0 border-b border-brass-600 pb-2 font-title text-sm text-brass-300">
            {debugInteraction.value.title}
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto py-2">
            {debugInteraction.value.lines.map((line, index) => (
              <p key={`${index}-${line}`} className="m-0">
                {line}
              </p>
            ))}
          </div>
          <div className="flex min-h-0 flex-1 flex-col items-stretch gap-2 overflow-y-auto">
            {debugInteraction.value.actions.map(action => (
              <Button key={action.label} onClick={action.onClick}>
                {action.label}
              </Button>
            ))}
            <Button onClick={closeDebugInteraction}>Close</Button>
          </div>
        </Dialog>
      )}

      <GuildInvitePromptContainer />
      <AskPromptContainer />
      <GuildFoundPromptContainer />

      <DeathPromptContainer />

      <ReportPlayerContainer />
      <InspectPanelContainer />
    </div>
  );
}

export function mountGameHud(container: HTMLElement): void {
  render(<GameHud />, container);
}
