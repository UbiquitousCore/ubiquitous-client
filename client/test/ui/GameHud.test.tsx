/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:hud', width: 200, height: 200 }),
}));

import { GameHud, setCastCallback, setHeadshotSource, setJumpCallback } from '../../src/ui/GameHud';
import {
  clearTarget,
  closeCharacterWindow,
  closeShop,
  setMapState,
  setPlayer,
  setTarget,
  setWorldUnits,
  showDebugInteraction,
  closeDebugInteraction,
} from '../../src/ui/hudStore';
import type { Unit } from '../../src/ui/hudStore';
import {
  banner,
  casting,
  cooldowns,
  globalCooldown,
  initSpells,
  reportToPlayer,
  setInCombat,
  startCast,
} from '../../src/gameplay/SpellBook';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { openScreen } from '../../src/ui/hudStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';
import { JUMP_SPEC, SPELL_BAR_SPEC, WHEEL_SPEC, spellBarMovie } from '../helpers/spellBarMovie';
import { chatAsking, chatOpen, chatWhisperTarget, clearChat } from '../../src/ui/chatStore';
import { resetSocialLists, setSocialListActions } from '../../src/ui/socialListStore';
import { closeReport } from '../../src/ui/reportStore';
import { partyRoster, resetParty, setPartyActions } from '../../src/ui/partyStore';
import { resetTrade, setTradeActions } from '../../src/ui/tradeStore';
import { resetPvp, setPvpActions } from '../../src/ui/pvpStore';
import { setFollowActions, setFollowing } from '../../src/ui/followStore';
import { closeInspect, setInspectActions } from '../../src/ui/inspectStore';
import { auraCard, clearAuras, setAura } from '../../src/ui/auraStore';

const HERO: Unit = {
  id: 'hero',
  name: 'Naevia',
  level: 60,
  health: 4200,
  maxHealth: 5000,
  mana: 1800,
  maxMana: 2400,
  disposition: 'friendly',
};

const MOB: Unit = {
  id: 'mob-1',
  name: 'Rock Elemental',
  level: 62,
  health: 8200,
  maxHealth: 12_000,
  mana: 0,
  maxMana: 0,
  disposition: 'hostile',
};

/** A player target, for the plus-menu's own tests — the menu is players only. */
const PLAYER_TARGET: Unit = {
  id: 'player-1',
  name: 'Ayla',
  level: 58,
  health: 5000,
  maxHealth: 5000,
  mana: 2000,
  maxMana: 2000,
  disposition: 'neutral',
  kind: 'player',
};

const EMPTY_MAP = {
  zoneName: 'Test Vale',
  bounds: null,
  playerPosition: [0, 0, 0] as [number, number, number],
  playerYaw: 0,
  markers: [],
};

/**
 * A movie carrying one named piece and nothing else.
 *
 * Enough to say the shipped screen can be drawn at all, which is the
 * decision under test. What it then draws is the screen's own business
 * and is covered where it lives.
 */
function movieCarrying(name: string): UiSkinData {
  return {
    movie: 'TEST',
    width: 0,
    height: 0,
    background: null,
    exports: [],
    shapes: [],
    sprites: [],
    edits: [],
    root: [
      [
        {
          depth: 1,
          characterId: 1,
          matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
          opacity: 1,
          name,
        },
      ],
    ],
  };
}

/**
 * Wear the shipped target frame and its plus-menu, `ArtTopbarMenu`.
 *
 * Both wear real decoded art now (`hud` for the frame, `dlgTopBar` for the
 * menu — see `ArtTopbarMenu.tsx`), so the movie needs both dialogs' pieces
 * and `uiSpec` needs both screens. The menu's fallback buttons (no icon
 * bitmap is ever resolved in this harness) are plain text inside the
 * button, but every button still carries its own `aria-label`, which is
 * what `getByRole('menuitem', {name})` actually matches on.
 */
function mountPlusMenu(): ReturnType<typeof render> {
  const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({
    a: 1,
    b: 0,
    c: 0,
    d: 1,
    tx,
    ty,
  });
  const place = (
    characterId: number,
    matrix: UiSkinPlaced['matrix'],
    name: string,
  ): UiSkinPlaced => ({ depth: 1, characterId, matrix, name, opacity: 1 });
  const rect = (name: string, x: number, y = 0): UiSkinPlaced => place(11, at(x, y), name);

  uiSpec.value = {
    screens: {
      targetFrame: {
        dialog: 'hud',
        frame: ['btnTarget', 'targetHP', 'targetMP', 'targetLv'],
        groups: { portrait: 'displayCallback' },
        values: { level: 'targetLv' },
        bars: { frames: 50, of: { health: 'targetHP', mana: 'targetMP' } },
      },
      topbarMenu: {
        dialog: 'dlgTopBar',
        frame: ['panelName', 'panelToolBar', 'targetclass'],
        actions: {
          'panelToolBar/group/btn01': 'slot1',
          'panelToolBar/group/btn02': 'slot2',
          'panelToolBar/group/btn03': 'slot3',
          'panelToolBar/group/btn04': 'slot4',
          'panelToolBar/group/btn05': 'slot5',
          'panelToolBar/group/btn06': 'slot6',
          'panelToolBar/group/btn07': 'slot7',
          'panelToolBar/group/btn08': 'slot8',
        },
        values: { name: 'panelName/textName' },
        groups: { banner: 'panelName', badge: 'targetclass' },
      },
    },
  };
  setMovie({
    skin: {
      movie: 'TEST',
      width: 200,
      height: 200,
      background: null,
      exports: [],
      shapes: [
        {
          id: 11,
          bounds: { x: 0, y: 0, w: 40, h: 40 },
          fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
          paths: [{ fill: 1, d: 'M0 0L40 0L40 40L0 40Z' }],
        },
      ],
      sprites: [
        {
          id: 20,
          frameCount: 1,
          frames: [
            [
              rect('btnTarget', 0),
              rect('displayCallback', 20, 20),
              rect('targetHP', 50),
              rect('targetMP', 100),
              rect('targetLv', 150),
            ],
          ],
        },
        {
          id: 40,
          frameCount: 1,
          frames: [
            [
              rect('btn01', 0, 0),
              rect('btn02', 44, 0),
              rect('btn03', 88, 0),
              rect('btn04', 132, 0),
              rect('btn05', 0, 44),
              rect('btn06', 44, 44),
              rect('btn07', 88, 44),
              rect('btn08', 132, 44),
            ],
          ],
        },
        {
          id: 41,
          frameCount: 1,
          frames: [
            [
              place(40, at(0, 0), 'group'),
              rect('background', 0, 0),
              rect('sideLarge', 0, 0),
              rect('sideSmall', 0, 0),
              rect('sideTop', 0, 0),
            ],
          ],
        },
        { id: 42, frameCount: 1, frames: [[rect('textName', 0, 0)]] },
        { id: 43, frameCount: 1, frames: [[rect('back', 0, 0)]] },
        {
          id: 30,
          frameCount: 1,
          frames: [
            [
              place(42, at(0, 0), 'panelName'),
              place(41, at(0, 20), 'panelToolBar'),
              place(43, at(200, 0), 'targetclass'),
            ],
          ],
        },
      ],
      edits: [],
      root: [[place(20, at(0, 0), 'hud'), place(30, at(0, 0), 'dlgTopBar')]],
    },
    art: new Map(),
  });

  const worn = render(<GameHud />);
  fireEvent.click(worn.getByLabelText(`${PLAYER_TARGET.name}: actions`));
  return worn;
}

/** The HUD reads module-level signals, so each test starts from a clean set. */
beforeEach(() => {
  setPlayer(null);
  setWorldUnits([]);
  clearTarget();
  closeShop();
  closeDebugInteraction();
  setMapState(EMPTY_MAP);
  closeCharacterWindow();
  initSpells([], []);
  cooldowns.value = new Map();
  globalCooldown.value = null;
  casting.value = null;
  banner.value = null;
  setInCombat(false);
  setHeadshotSource(() => null);
  setCastCallback(() => undefined);
  uiSpec.value = null;
  clearMovies();
  clearChat();
  closeReport();
  closeInspect();
  resetSocialLists();
  resetParty();
  resetTrade();
  resetPvp();
  setFollowing(null);
  setSocialListActions({
    addFriend: () => {},
    addFriendNamed: () => {},
    removeFriend: () => {},
    addIgnore: () => {},
    removeIgnore: () => {},
    refresh: () => {},
  });
  setPartyActions({
    inviteTarget: () => {},
    invite: () => {},
    inviteNamed: () => {},
    kickTarget: () => {},
    accept: () => {},
    decline: () => {},
    leave: () => {},
    kick: () => {},
    voteKick: () => {},
    answerVoteKick: () => {},
  });
  setTradeActions({
    requestTarget: () => {},
    accept: () => {},
    decline: () => {},
    offer: () => {},
    confirm: () => {},
    cancel: () => {},
  });
  setPvpActions({
    challengeTarget: () => {},
    accept: () => {},
    decline: () => {},
    forfeit: () => {},
    setFlagged: () => {},
  });
  setFollowActions({ toggleTarget: () => {} });
  setInspectActions({ openTarget: () => {} });
});

afterEach(cleanup);

/** Give the HUD the shipped spell bar and jump button to wear. */
function wearBar(): void {
  uiSpec.value = {
    screens: { spellBar: SPELL_BAR_SPEC, jumpButton: JUMP_SPEC, spellWheel: WHEEL_SPEC },
  };
  setMovie({ skin: spellBarMovie(), art: new Map() });
}

describe('GameHud', () => {
  it('passes clicks through to the world except where a component takes them', () => {
    // The HUD covers the whole viewport. If it swallowed pointer events the
    // player could not click the world at all.
    const { container } = render(<GameHud />);

    expect(container.firstElementChild!.className).toContain('pointer-events-none');
  });

  it('draws no unit frame until there is a unit', () => {
    const { container } = render(<GameHud />);

    expect(container.querySelector('[data-hud="player"]')).toBeNull();
    expect(container.querySelector('[data-hud="target"]')).toBeNull();
  });

  it('opens the character screens on the bag, with the menu beside them', () => {
    // The menu is part of the screens rather than a thing of its own: it
    // stays up beside whichever one is open, so the portrait opens the
    // screens themselves and the bag is the one they open on.
    setPlayer(HERO);
    uiSpec.value = {
      screens: {
        menu: {
          dialog: 'theBar',
          items: [{ control: 'pick1', text: 'w1', screen: 'bag', says: 'Bag' }],
        },
      },
    };
    setMovie({ skin: movieCarrying('theBar'), art: new Map() });
    const { getByLabelText } = render(<GameHud />);
    fireEvent.click(getByLabelText(/open character screens/i));
    expect(openScreen.value).toBe('bag');
    expect(getByLabelText(/open character screens/i).getAttribute('aria-expanded')).toBe('true');
    // Pressing it again puts them away.
    fireEvent.click(getByLabelText(/open character screens/i));
    expect(openScreen.value).toBeNull();
  });

  it('marks the hero frame so the damage canvas can find the portrait', () => {
    // `DamageNumbers` asks the document where the hero's portrait is, and
    // draws the hero's own numbers over it — over the face the frame marks
    // once one has rendered, and over the frame itself until then.
    setPlayer(HERO);
    const { container } = render(<GameHud />);

    expect(container.querySelector('[data-hud="player"]')).toBeTruthy();
  });

  it('shows the target frame, and clears the target when it is clicked', () => {
    setPlayer(HERO);
    setWorldUnits([MOB]);
    setTarget(MOB.id);
    const { container, rerender } = render(<GameHud />);

    fireEvent.click(container.querySelector('[data-hud="target"]')!);
    rerender(<GameHud />);
    expect(container.querySelector('[data-hud="target"]')).toBeNull();
  });

  it('wears the shipped target frame once the build can draw it, falling back otherwise', () => {
    // With no spec at all (the default in this file's beforeEach) the
    // target frame falls back to the hand-drawn one — no [role="group"]
    // named after the unit, because that is `ArtFocusPanel`'s own mark.
    setWorldUnits([MOB]);
    setTarget(MOB.id);
    const plain = render(<GameHud />);
    expect(plain.queryByRole('group', { name: MOB.name })).toBeNull();
    plain.unmount();

    // Once the piece the target frame wears is in hand, the shipped one
    // takes over.
    const at = (tx: number, ty: number) => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
    const place = (characterId: number, matrix: ReturnType<typeof at>, name: string) => ({
      depth: 1,
      characterId,
      matrix,
      name,
      opacity: 1,
    });
    const rect = (name: string, x: number) => place(11, at(x, 0), name);
    uiSpec.value = {
      screens: {
        targetFrame: {
          dialog: 'hud',
          frame: ['btnTarget', 'targetHP', 'targetMP', 'targetLv'],
          groups: { portrait: 'btnTarget' },
          values: { level: 'targetLv' },
          bars: { frames: 50, of: { health: 'targetHP', mana: 'targetMP' } },
        },
      },
    };
    setMovie({
      skin: {
        movie: 'TEST',
        width: 200,
        height: 200,
        background: null,
        exports: [],
        shapes: [
          {
            id: 11,
            bounds: { x: 0, y: 0, w: 40, h: 40 },
            fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
            paths: [{ fill: 1, d: 'M0 0L40 0L40 40L0 40Z' }],
          },
        ],
        sprites: [
          {
            id: 20,
            frameCount: 1,
            frames: [
              [
                rect('btnTarget', 0),
                rect('targetHP', 50),
                rect('targetMP', 100),
                rect('targetLv', 150),
              ],
            ],
          },
        ],
        edits: [],
        root: [[place(20, at(0, 0), 'hud')]],
      },
      art: new Map(),
    });
    const worn = render(<GameHud />);
    expect(worn.getByRole('group', { name: MOB.name })).toBeTruthy();
  });

  it("opens the chat box addressed at the target from its plus-menu's whisper button", () => {
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);

    const worn = mountPlusMenu();
    fireEvent.click(worn.getByRole('menuitem', { name: 'Whisper' }));

    expect(chatWhisperTarget.value).toEqual({ id: PLAYER_TARGET.id, name: PLAYER_TARGET.name });
    expect(chatOpen.value).toBe(true);
    expect(chatAsking.value).toBe(true);
  });

  it("sends the add request from the plus-menu's Add friend button", () => {
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);
    const addFriend = vi.fn();
    setSocialListActions({
      addFriend,
      addFriendNamed: () => {},
      removeFriend: vi.fn(),
      addIgnore: vi.fn(),
      removeIgnore: vi.fn(),
      refresh: vi.fn(),
    });

    const worn = mountPlusMenu();
    fireEvent.click(worn.getByRole('menuitem', { name: 'Add friend' }));
    expect(addFriend).toHaveBeenCalledWith(PLAYER_TARGET.id);
  });

  it('offers Trade, Duel and Inspect, each calling the store action already wired for it', () => {
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);
    const requestTarget = vi.fn();
    const challengeTarget = vi.fn();
    const openTarget = vi.fn();
    setTradeActions({
      requestTarget,
      accept: () => {},
      decline: () => {},
      offer: () => {},
      confirm: () => {},
      cancel: () => {},
    });
    setPvpActions({
      challengeTarget,
      accept: () => {},
      decline: () => {},
      forfeit: () => {},
      setFlagged: () => {},
    });
    setInspectActions({ openTarget });

    const worn = mountPlusMenu();
    const reopen = (): void => {
      fireEvent.click(worn.getByLabelText(`${PLAYER_TARGET.name}: actions`));
    };
    // Picking an action closes the panel back to just the name — each
    // pick needs its own re-open, the same as a player would tap twice.
    fireEvent.click(worn.getByRole('menuitem', { name: 'Trade' }));
    reopen();
    fireEvent.click(worn.getByRole('menuitem', { name: 'Duel' }));
    reopen();
    fireEvent.click(worn.getByRole('menuitem', { name: 'Inspect' }));

    expect(requestTarget).toHaveBeenCalled();
    expect(challengeTarget).toHaveBeenCalled();
    expect(openTarget).toHaveBeenCalled();
  });

  it("toggles following from the plus-menu's Follow button, highlighted while this target is the one being followed", () => {
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);
    const toggleTarget = vi.fn();
    setFollowActions({ toggleTarget });

    const first = mountPlusMenu();
    expect(first.getByRole('menuitem', { name: 'Follow' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    fireEvent.click(first.getByRole('menuitem', { name: 'Follow' }));
    expect(toggleTarget).toHaveBeenCalled();

    cleanup();
    setFollowing({ unitId: PLAYER_TARGET.id });
    setTarget(PLAYER_TARGET.id);
    const second = mountPlusMenu();
    expect(second.getByRole('menuitem', { name: 'Follow' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it("offers Invite to team while the target is not in the hero's team, and Remove — never both", () => {
    setPlayer(HERO);
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);
    const inviteTarget = vi.fn();
    setPartyActions({
      inviteTarget,
      invite: () => {},
      inviteNamed: () => {},
      kickTarget: () => {},
      accept: () => {},
      decline: () => {},
      leave: () => {},
      kick: () => {},
      voteKick: () => {},
      answerVoteKick: () => {},
    });

    const worn = mountPlusMenu();
    expect(worn.queryByRole('menuitem', { name: 'Remove from team' })).toBeNull();
    fireEvent.click(worn.getByRole('menuitem', { name: 'Invite to team' }));
    expect(inviteTarget).toHaveBeenCalled();
  });

  it('offers Remove from team, with a confirm, once the hero leads a team the target is already in', () => {
    setPlayer(HERO);
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);
    partyRoster.value = {
      partyId: 'party-1',
      members: [
        { networkId: 1, name: HERO.name, isLeader: true, online: true },
        { networkId: 2, name: PLAYER_TARGET.name, isLeader: false, online: true },
      ],
    };
    const kickTarget = vi.fn();
    setPartyActions({
      inviteTarget: () => {},
      invite: () => {},
      inviteNamed: () => {},
      kickTarget,
      accept: () => {},
      decline: () => {},
      leave: () => {},
      kick: () => {},
      voteKick: () => {},
      answerVoteKick: () => {},
    });

    const worn = mountPlusMenu();
    expect(worn.queryByRole('menuitem', { name: 'Invite to team' })).toBeNull();
    fireEvent.click(worn.getByRole('menuitem', { name: 'Remove from team' }));
    expect(kickTarget).toHaveBeenCalled();
  });

  it('offers neither invite nor remove while the hero is in a team but not its leader', () => {
    setPlayer(HERO);
    setWorldUnits([PLAYER_TARGET]);
    setTarget(PLAYER_TARGET.id);
    partyRoster.value = {
      partyId: 'party-1',
      members: [
        { networkId: 1, name: HERO.name, isLeader: false, online: true },
        { networkId: 2, name: PLAYER_TARGET.name, isLeader: true, online: true },
      ],
    };

    const worn = mountPlusMenu();
    expect(worn.queryByRole('menuitem', { name: 'Invite to team' })).toBeNull();
    expect(worn.queryByRole('menuitem', { name: 'Remove from team' })).toBeNull();
  });

  it('draws no spell bar and no jump button until the shipped art has arrived', () => {
    initSpells([101, 102], []);
    const { container } = render(<GameHud />);
    expect(container.querySelector('[data-spell-bar]')).toBeNull();
    expect(container.querySelector('[data-jump]')).toBeNull();
  });

  describe('wearing the shipped bar and jump button', () => {
    afterEach(() => {
      clearMovies();
      uiSpec.value = null;
    });

    it('hangs the bar off the right edge, one button per slot, the spells the server lists in the first', () => {
      wearBar();
      initSpells([101, 102], []);
      const { container } = render(<GameHud />);
      const bar = container.querySelector('[data-spell-bar]')!;
      expect(bar).not.toBeNull();
      expect(bar.querySelectorAll('[data-spell-slot]')).toHaveLength(3);
      expect(bar.querySelector('[title="Spell 101"]')).not.toBeNull();
      expect(bar.querySelector('[title="Spell 102"]')).not.toBeNull();
    });

    it('slides the bar away and back from its handle', () => {
      wearBar();
      initSpells([101], []);
      const { container } = render(<GameHud />);
      const bar = container.querySelector('[data-spell-bar]')!;
      fireEvent.click(container.querySelector('button[aria-label="Hide spell bar"]')!);
      expect(bar.getAttribute('data-open')).toBe('false');
      fireEvent.click(container.querySelector('button[aria-label="Show spell bar"]')!);
      expect(bar.getAttribute('data-open')).toBe('true');
    });

    it('casts by spell from the bar', () => {
      wearBar();
      const onCast = vi.fn();
      setCastCallback(onCast);
      initSpells([101], []);
      const { container } = render(<GameHud />);

      fireEvent.click(container.querySelector('[title="Spell 101"]')!);
      expect(onCast).toHaveBeenCalledWith(101);
    });

    it('stands the ring in the corner, empty until a spell is put on it', () => {
      wearBar();
      initSpells([101], []);
      const { container } = render(<GameHud />);
      const ring = container.querySelector('[data-spell-wheel]')!;
      expect(ring).not.toBeNull();
      expect(ring.querySelectorAll('[aria-label^="Empty ring slot"]')).toHaveLength(2);
    });

    it('jumps from the button in the corner', () => {
      wearBar();
      const onJump = vi.fn();
      setJumpCallback(onJump);
      const { container } = render(<GameHud />);
      fireEvent.click(container.querySelector('[data-jump]')!);
      expect(onJump).toHaveBeenCalledTimes(1);
    });
  });

  it('announces the combat banner, so it is not colour alone', () => {
    reportToPlayer('Fighting now', 0);
    const { container } = render(<GameHud />);

    // By its own hook, not by being the only live region on the HUD: the
    // lines that pop over the hero are one too, and theirs stands whether
    // or not it holds anything.
    const line = container.querySelector('[data-hud="banner"]')!;
    expect(line.textContent).toBe('Fighting now');
    // Red on whatever the scene is doing needs its own shadow to be readable.
    expect(line.className).toContain('text-shadow-world');
  });

  it('opens an interaction window, and closes it again', () => {
    const action = vi.fn();
    showDebugInteraction({
      title: 'Talk to Mira',
      lines: ['She has wares.'],
      actions: [{ label: 'Trade', onClick: action }],
    });
    const { container, rerender } = render(<GameHud />);

    const dialog = container.querySelector('[aria-label="Talk to Mira"]')!;
    expect(dialog.textContent).toContain('She has wares.');

    fireEvent.click([...dialog.querySelectorAll('button')].find(b => b.textContent === 'Trade')!);
    expect(action).toHaveBeenCalledOnce();

    fireEvent.click([...dialog.querySelectorAll('button')].find(b => b.textContent === 'Close')!);
    rerender(<GameHud />);
    expect(container.querySelector('[aria-label="Talk to Mira"]')).toBeNull();
  });

  it('opens the character screens from the hero’s own frame', () => {
    // The frame is the trigger, so it has to be a real button
    // rather than a card with a click handler on it.
    setPlayer(HERO);
    const { container, rerender } = render(<GameHud />);

    const frame = container.querySelector('[data-hud="player"]')!;
    expect(frame.tagName).toBe('BUTTON');
    expect(frame.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(frame);
    rerender(<GameHud />);
    expect(openScreen.value).toBe('bag');
    expect(container.querySelector('[data-hud="player"]')!.getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('keeps the character screens out of the DOM while they are shut', () => {
    // Seven menu buttons and a whole screen a keyboard could otherwise reach.
    setPlayer(HERO);
    const { container } = render(<GameHud />);

    expect(container.querySelector('nav[aria-label="Character screens"]')).toBeNull();
  });

  it('keeps the cast bar and the spell bar on one layer, so they cannot fight for depth', () => {
    wearBar();
    initSpells([101], []);
    startCast(101, null, 2000);
    const { container } = render(<GameHud />);

    const layers = [...container.querySelectorAll('.z-hud-bar')];
    expect(layers.length).toBeGreaterThanOrEqual(2);
  });

  describe('auras', () => {
    afterEach(clearAuras);
    const aura = (spellId: number, harmful: boolean) => ({
      spellId,
      casterId: 3,
      harmful,
      stacks: 1,
      remainingMs: 30_000,
      durationMs: 30_000,
    });

    it('stands the hero’s own auras under the hero’s frame, found by the id the server gives the hero', () => {
      setPlayer({ ...HERO, networkId: 41 });
      setAura('41', aura(9000, false));
      setAura('41', aura(9002, true));
      const { container } = render(<GameHud />);
      const row = container.querySelector('[data-hud="player"]')!.parentElement!;
      expect(row.querySelectorAll('[data-aura-icon]')).toHaveLength(2);
    });

    it('stands the target’s auras under the target’s frame, and a press on one keeps the target', () => {
      setPlayer({ ...HERO, networkId: 41 });
      setWorldUnits([{ ...MOB, networkId: 70 }]);
      setTarget(MOB.id);
      setAura('70', aura(9003, true));
      setAura('41', aura(9000, false));
      const { container } = render(<GameHud />);
      const frame = container.querySelector('[data-hud="target"]')!;
      const icons = frame.querySelectorAll('[data-aura-icon]');
      expect(icons).toHaveLength(1);
      fireEvent.click(icons[0]!);
      expect(auraCard.value).toMatchObject({ unitKey: '70', spellId: 9003 });
      expect(container.querySelector('[data-hud="target"]')).not.toBeNull();
    });

    it('draws no row for a unit the server has given no id', () => {
      setPlayer(HERO);
      setAura('hero', aura(9000, false));
      const { container } = render(<GameHud />);
      expect(container.querySelector('[data-aura-icon]')).toBeNull();
    });
  });
});
