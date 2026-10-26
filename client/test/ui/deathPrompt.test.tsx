/** @vitest-environment happy-dom */

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:death', width: 200, height: 120 }),
}));

/**
 * The death dialog, in the form the server can honour.
 *
 * The rules worth having are all about *whose* death raises it and *when* it
 * goes: it belongs to the local player alone, it is never up while alive, it
 * waits a beat after the death animation, it survives the
 * press that asks to revive (that is a request, and the server answers it),
 * and it goes when the server says the player is back up.
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEATH_PROMPT_DELAY_MS, DeathPromptContainer } from '../../src/ui/DeathPromptContainer';
import { fill } from '../../src/ui/art/wornWords';
import { LINES } from '../../src/ui/gameLines';
import { GameHud } from '../../src/ui/GameHud';
import { playerDead, setDeathActions, setDeathToll } from '../../src/ui/deathStore';
import { applyPlayerValues, player, setPlayer, setWorldUnits } from '../../src/ui/hudStore';
import type { Unit } from '../../src/ui/hudStore';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData } from '../../src/assets/types';
import { clearDeathActions, clearMovies } from '../helpers/stores';

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

const DEAD_HERO: Unit = { ...HERO, health: 0, dead: true };

const OTHER: Unit = {
  id: 'someone-else',
  name: 'Corvin',
  level: 58,
  health: 0,
  maxHealth: 5000,
  mana: 0,
  maxMana: 2400,
  disposition: 'friendly',
  dead: true,
};

/** The store is module state, so each test starts from a live hero. */
beforeEach(() => {
  vi.useFakeTimers();
  setPlayer(HERO);
  setWorldUnits([]);
  clearDeathActions();
  setDeathToll(null);
});

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  vi.useRealTimers();
});

const modal = (): HTMLElement | null => screen.queryByRole('dialog');
const cemetery = (): HTMLElement | null =>
  screen.queryByRole('button', { name: LINES.reviveAtGraveyard.fallback });

/** Let the post-animation beat elapse. */
function settle(): void {
  act(() => {
    vi.advanceTimersByTime(DEATH_PROMPT_DELAY_MS);
  });
}

describe('the death dialog', () => {
  it('stays away while the player is alive', () => {
    render(<DeathPromptContainer />);
    settle();

    expect(playerDead.value).toBe(false);
    expect(modal()).toBeNull();
  });

  it('comes up when the server says this player is dead', () => {
    setPlayer(DEAD_HERO);
    render(<DeathPromptContainer />);
    settle();

    expect(playerDead.value).toBe(true);
    expect(modal()).not.toBeNull();
    expect(cemetery()).not.toBeNull();
  });

  it('waits a beat after the death animation', () => {
    // The game sits on the die animation for 2000 ms before it raises the
    // dialog; landing it on the same frame as the fall is ours, not the
    // game's.
    setPlayer(DEAD_HERO);
    render(<DeathPromptContainer />);

    act(() => {
      vi.advanceTimersByTime(DEATH_PROMPT_DELAY_MS - 1);
    });
    expect(modal()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(modal()).not.toBeNull();
  });

  it('ignores another player dying', () => {
    // Every other body's death lands in `worldUnits`. Only the hero's own
    // `unit.died` touches `player`, and only that raises this.
    setWorldUnits([OTHER]);
    render(<DeathPromptContainer />);
    settle();

    expect(playerDead.value).toBe(false);
    expect(modal()).toBeNull();
  });

  it('offers only the choice this server can honour', () => {
    // Reviving on the spot costs rune stones, which this project has no
    // concept of. One button, and no dismiss.
    setPlayer(DEAD_HERO);
    render(<DeathPromptContainer />);
    settle();

    expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
      LINES.reviveAtGraveyard.fallback,
    ]);
  });

  it('asks the game to revive, and does not close on the press', () => {
    // Reviving is a request. The dialog goes when the server answers, not
    // when the button is pressed — closing it first would leave a refused
    // player with a corpse's health bar and no way back.
    const reviveAtCemetery = vi.fn();
    setDeathActions({ reviveAtCemetery });
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);
    settle();

    fireEvent.click(cemetery()!);
    rerender(<DeathPromptContainer />);

    expect(reviveAtCemetery).toHaveBeenCalledTimes(1);
    expect(modal()).not.toBeNull();
  });

  it('goes away once the server revives the player', () => {
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);
    settle();
    expect(modal()).not.toBeNull();

    setPlayer({ ...HERO, dead: false });
    rerender(<DeathPromptContainer />);

    expect(playerDead.value).toBe(false);
    expect(modal()).toBeNull();
  });

  it('comes back on a second death, with the same wait', () => {
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);
    settle();
    setPlayer({ ...HERO, dead: false });
    rerender(<DeathPromptContainer />);
    expect(modal()).toBeNull();

    setPlayer(DEAD_HERO);
    rerender(<DeathPromptContainer />);
    expect(modal()).toBeNull();
    settle();

    expect(modal()).not.toBeNull();
  });

  it('names the killer when the server named one', () => {
    // `player.death` is the only message that carries a killer to the dying
    // player; `unit.died` is a bare guid.
    setPlayer(DEAD_HERO);
    setDeathToll({ deathCost: 0, killerName: 'Grimtusk' });
    render(<DeathPromptContainer />);
    settle();

    expect(screen.queryByText(fill(LINES.killedBy.fallback, 'Grimtusk'))).not.toBeNull();
  });

  it('says the player died when no killer was named', () => {
    setPlayer(DEAD_HERO);
    setDeathToll({ deathCost: 500 });
    render(<DeathPromptContainer />);
    settle();

    expect(screen.queryByText(LINES.dead.fallback)).not.toBeNull();
  });

  it('says what the death cost, in coin denominations', () => {
    setPlayer(DEAD_HERO);
    setDeathToll({ deathCost: 8000 });
    render(<DeathPromptContainer />);
    settle();

    expect(screen.queryByText(fill(LINES.deathPenalty.fallback, '80 silver'))).not.toBeNull();
  });

  it('still draws the penalty line for a death that cost nothing', () => {
    // Low-level deaths cost nothing, and hiding the line would leave the
    // player unsure whether they paid.
    setPlayer(DEAD_HERO);
    setDeathToll({ deathCost: 0 });
    render(<DeathPromptContainer />);
    settle();

    expect(screen.queryByText(fill(LINES.deathPenalty.fallback, '0 copper'))).not.toBeNull();
  });

  it('says nothing about a cost until the server has said what it was', () => {
    // The body falls on `unit.died` and the bill arrives on `player.death`.
    // A line invented in that gap would be a guess.
    setPlayer(DEAD_HERO);
    render(<DeathPromptContainer />);
    settle();

    expect(screen.queryByText(fill(LINES.deathPenalty.fallback, '0 copper'))).toBeNull();
    expect(document.body.textContent).not.toContain(LINES.deathPenalty.fallback.split('%s')[0]!);
  });

  it('is mounted by the HUD, not by anything the player has to open', () => {
    // The one affordance that has to find the player without being asked for.
    setPlayer(DEAD_HERO);
    render(<GameHud />);
    settle();

    expect(modal()).not.toBeNull();
    expect(cemetery()).not.toBeNull();
  });
});

/**
 * The dialog is the dead player's only way back up, so the rules that matter
 * most are the ones that say it cannot be lost. The server keeps talking about
 * a hero who is down — the gold penalty, power regen, a level-up's own field
 * push — and none of that is permission to take the prompt away.
 */
describe('the death dialog, once the player is down', () => {
  const IDENTITY = { name: 'Naevia', level: 60, classId: 2 };

  it('survives the gold penalty that arrives in the same breath as the death', () => {
    // The order the server sends them in: `unit.died` sets the flag, then
    // `player.death` prices it, then the penalty lands as an ordinary
    // `player.updated` carrying the gold alone. Rebuilding the hero from that
    // last one must not put a dead player back on their feet as far as the
    // HUD is concerned — no prompt, and movement still frozen.
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);

    applyPlayerValues({ gold: 3500 }, IDENTITY);
    rerender(<DeathPromptContainer />);

    expect(playerDead.value).toBe(true);
    settle();
    expect(cemetery()).not.toBeNull();
  });

  it('is still reachable after a run of unrelated field pushes', () => {
    // Power regen, experience, a level: none of them say anything about being
    // alive, and the wait may not restart for any of them either.
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);

    act(() => {
      vi.advanceTimersByTime(DEATH_PROMPT_DELAY_MS - 1);
    });
    applyPlayerValues({ power: 90, maxPower: 100 }, IDENTITY);
    rerender(<DeathPromptContainer />);
    applyPlayerValues({ xp: 4100 }, IDENTITY);
    rerender(<DeathPromptContainer />);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(cemetery()).not.toBeNull();
  });

  it('stays up while the server goes on talking about the corpse', () => {
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);
    settle();
    expect(modal()).not.toBeNull();

    applyPlayerValues({ gold: 0 }, IDENTITY);
    rerender(<DeathPromptContainer />);
    applyPlayerValues({ power: 100 }, IDENTITY);
    rerender(<DeathPromptContainer />);

    expect(modal()).not.toBeNull();
    expect(cemetery()).not.toBeNull();
  });

  it('still goes when the server actually revives the player', () => {
    // The one thing that does take it away, and it still does.
    setPlayer(DEAD_HERO);
    const { rerender } = render(<DeathPromptContainer />);
    settle();

    setPlayer({ ...HERO, dead: false });
    rerender(<DeathPromptContainer />);

    expect(modal()).toBeNull();
  });
});

/**
 * `player.updated` names only the fields that moved, so folding one in may
 * never disturb anything it did not name. What the hero knows about itself
 * that no `player.updated` ever carries — dead, in combat, its resource
 * channel — arrives on other messages entirely and has to survive.
 */
describe('folding a player.updated into the hero', () => {
  const IDENTITY = { name: 'Naevia', level: 60, classId: 2 };

  beforeEach(() => {
    setPlayer(null);
  });

  it('carries the dead flag through a push that says nothing about it', () => {
    setPlayer(DEAD_HERO);

    applyPlayerValues({ gold: 3500 }, IDENTITY);

    expect(player.value?.dead).toBe(true);
  });

  it('carries the in-combat marker through too', () => {
    setPlayer({ ...HERO, inCombat: true });

    applyPlayerValues({ health: 3000 }, IDENTITY);

    expect(player.value?.inCombat).toBe(true);
    expect(player.value?.health).toBe(3000);
  });

  it('moves only the fields the push actually named', () => {
    setPlayer(HERO);

    applyPlayerValues({ power: 900 }, IDENTITY);

    expect(player.value).toMatchObject({
      health: HERO.health,
      maxHealth: HERO.maxHealth,
      mana: 900,
      maxMana: HERO.maxMana,
      level: HERO.level,
    });
  });

  it('keeps the resource channel the class was read for', () => {
    setPlayer({ ...HERO, resource: 'vigor' });

    applyPlayerValues({ health: 10 }, IDENTITY);

    expect(player.value?.resource).toBe('vigor');
  });

  it('builds the hero from the chosen character when there is no snapshot yet', () => {
    // The first push of a session, before anything else has written one.
    applyPlayerValues({ health: 120, maxHealth: 553 }, { name: 'Naevia', level: 12, classId: 1 });

    expect(player.value).toMatchObject({
      id: 'player',
      name: 'Naevia',
      level: 12,
      health: 120,
      maxHealth: 553,
      disposition: 'friendly',
      resource: 'morale',
    });
    expect(player.value?.dead).toBeUndefined();
  });
});

/**
 * Where the build has its own death box, the prompt wears that instead of
 * the client-built dialog: the same lines and the same one way back.
 */
describe('the death prompt, worn from the build', () => {
  const place = (characterId: number, x: number, y: number, name: string) => ({
    depth: 1,
    characterId,
    matrix: { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y },
    name,
    opacity: 1,
  });

  function skin(): UiSkinData {
    const bar = (id: number, w: number, h: number) => ({
      id,
      bounds: { x: 0, y: 0, w, h },
      fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
      paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
    });
    return {
      movie: 'IGM',
      width: 400,
      height: 300,
      background: null,
      exports: [],
      shapes: [bar(11, 200, 120), bar(12, 60, 30)],
      sprites: [
        {
          id: 20,
          frameCount: 1,
          frames: [
            [
              place(11, 0, 0, 'background'),
              place(11, 0, 20, 'textMsg'),
              place(12, 70, 80, 'btnYes'),
              place(12, 70, 84, 'textYes'),
              place(11, 0, 0, 'btnempty'),
            ],
          ],
        },
      ],
      edits: [],
      root: [[place(20, 0, 0, 'dlgMsg')]],
    };
  }

  function mountWorn() {
    uiSpec.value = {
      screens: {
        death: {
          dialog: 'dlgMsg',
          frame: 'background',
          values: { message: 'textMsg' },
          panels: { sheet: 'btnempty' },
          actions: { btnYes: 'revive' },
          hidden: ['btnNo', 'textNo', 'btnRight', 'btnMsgInfo'],
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    setPlayer(DEAD_HERO);
    setDeathToll({ deathCost: 8000, killerName: 'Grimtusk' });
    return render(<DeathPromptContainer />);
  }

  const revive = (): HTMLElement | null =>
    screen.queryByRole('button', { name: LINES.reviveAtGraveyard.fallback });

  it('wears the build box and names the killer on it', () => {
    mountWorn();
    settle();

    expect(screen.queryByRole('alertdialog')).not.toBeNull();
    expect(screen.queryByText(fill(LINES.killedBy.fallback, 'Grimtusk'))).not.toBeNull();
    expect(screen.queryByText(fill(LINES.deathPenalty.fallback, '80 silver'))).not.toBeNull();
    expect(revive()).not.toBeNull();
  });

  it('revives from the worn control and keeps no other button', () => {
    const reviveAtCemetery = vi.fn();
    setDeathActions({ reviveAtCemetery });
    const { rerender } = mountWorn();
    settle();

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(revive()).not.toBeNull();
    expect(screen.queryByText(LINES.reviveAtGraveyard.fallback)).not.toBeNull();
    fireEvent.click(revive()!);
    rerender(<DeathPromptContainer />);

    expect(reviveAtCemetery).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).not.toBeNull();
  });
});
