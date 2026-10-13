/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The names of the parts in every picture drawn, one list per picture. */
const drawn: string[][] = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: (plan: { parts: Array<{ path: string }> }) => {
    drawn.push(plan.parts.map(part => part.path));
    return { url: 'blob:target', width: 300, height: 300 };
  },
}));

import { ArtFocusPanel, castFaces, gaugeFaces } from '../../src/ui/components/ArtFocusPanel';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { Unit } from '../../src/ui/hudStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  drawn.length = 0;
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix,
  name,
  opacity: 1,
});

/** The target cluster's controls, plus the plus-menu's five slots. */
function skin(): UiSkinData {
  const rect = (name: string, x: number, y = 0): UiSkinPlaced => place(11, at(x, y), name);
  return {
    movie: 'TEST',
    width: 300,
    height: 300,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 60, h: 60 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L60 0L60 60L0 60Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            rect('btnTarget', 0, 0),
            rect('displayCallback', 30, 30),
            rect('targetHP', 70, 0),
            rect('targetMP', 140, 0),
            rect('targetPower', 140, 0),
            rect('targetRage', 140, 0),
            rect('targetLv', 0, 70),
            rect('targetDead', 70, 70),
            rect('elitemask', 140, 70),
            rect('animCombatTarget', 210, 70),
            rect('btnChangetarget', 0, 140),
            rect('groupTip', 0, 0),
          ],
        ],
      },
      {
        id: 21,
        frameCount: 1,
        frames: [
          [
            rect('btn01', 0, 0),
            rect('btn02', 40, 0),
            rect('btn03', 80, 0),
            rect('btn04', 120, 0),
            rect('btn05', 160, 0),
          ],
        ],
      },
      {
        id: 50,
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
        id: 51,
        frameCount: 1,
        frames: [
          [
            place(50, at(0, 0), 'group'),
            rect('background', 0, 0),
            rect('sideLarge', 0, 0),
            rect('sideSmall', 0, 0),
            rect('sideTop', 0, 0),
          ],
        ],
      },
      { id: 52, frameCount: 1, frames: [[rect('textName', 0, 0)]] },
      { id: 53, frameCount: 1, frames: [[rect('back', 0, 0)]] },
      {
        id: 54,
        frameCount: 1,
        frames: [
          [
            place(52, at(0, 0), 'panelName'),
            place(51, at(0, 20), 'panelToolBar'),
            place(53, at(200, 0), 'targetclass'),
          ],
        ],
      },
    ],
    edits: [],
    root: [
      [
        place(20, at(0, 0), 'hud'),
        place(21, at(0, 0), 'dlgPlayerLink'),
        place(54, at(0, 0), 'dlgTopBar'),
      ],
    ],
  };
}

const spec = {
  screens: {
    targetFrame: {
      dialog: 'hud',
      frame: [
        'btnTarget',
        'targetHP',
        'targetMP',
        'targetPower',
        'targetRage',
        'targetLv',
        'targetDead',
        'elitemask',
      ],
      groups: {
        portrait: 'displayCallback',
        dead: 'targetDead',
        combat: 'animCombatTarget',
        elite: 'elitemask',
      },
      values: { level: 'targetLv' },
      bars: {
        frames: 50,
        of: { health: 'targetHP', mana: 'targetMP', vigor: 'targetPower', morale: 'targetRage' },
      },
      hidden: ['elitemask'],
      pieces: { switch: { part: 'btnChangetarget' } },
    },
    playerLink: {
      dialog: 'dlgPlayerLink',
      frame: ['btn01', 'btn02', 'btn03', 'btn04', 'btn05'],
      actions: {
        btn01: 'slot1',
        btn02: 'slot2',
        btn03: 'slot3',
        btn04: 'slot4',
        btn05: 'slot5',
      },
      values: {
        slot1: 'text01',
        slot2: 'text02',
        slot3: 'text03',
        slot4: 'text04',
        slot5: 'text05',
      },
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

const mob: Unit = {
  id: 'mob-1',
  name: 'Rock Elemental',
  level: 62,
  health: 6000,
  maxHealth: 12_000,
  mana: 0,
  maxMana: 0,
  disposition: 'hostile',
  resource: 'mana',
};

/** A player target, for the plus-menu's own tests — the menu is players only. */
const player: Unit = { ...mob, id: 'player-1', name: 'Ayla', kind: 'player' };

describe('ArtFocusPanel', () => {
  it('draws nothing until the shipped screen has arrived', () => {
    const { container } = render(<ArtFocusPanel unit={mob} actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('is named after the unit it shows', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByRole } = render(<ArtFocusPanel unit={mob} actions={[]} />);
    expect(getByRole('group', { name: 'Rock Elemental' })).toBeTruthy();
  });

  it('shows its name banner without the actions menu being open', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByText, queryByRole } = render(<ArtFocusPanel unit={mob} actions={[]} />);
    expect(queryByRole('menu')).toBeNull();
    expect(getByText('Rock Elemental')).toBeTruthy();
  });

  it("writes the unit's level into the frame's own level field", () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(<ArtFocusPanel unit={mob} actions={[]} />);
    expect(container.textContent).toContain('62');
  });

  it('opens its actions the moment a player is targeted, closes them on a pick, and reopens from the banner', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = render(
      <ArtFocusPanel unit={player} actions={[{ icon: 'whisper', label: 'Whisper', onPick }]} />,
    );
    expect(getByRole('menu')).toBeTruthy();
    fireEvent.click(getByRole('menuitem', { name: 'Whisper' }));
    expect(onPick).toHaveBeenCalled();
    expect(queryByRole('menu')).toBeNull();
    fireEvent.click(getByLabelText('Ayla: actions'));
    expect(getByRole('menu')).toBeTruthy();
  });

  it('draws no tap target for a creature — whisper, trade, friend and duel mean nothing against one', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { queryByLabelText } = render(
      <ArtFocusPanel
        unit={mob}
        actions={[{ icon: 'whisper', label: 'Whisper', onPick: vi.fn() }]}
      />,
    );
    expect(queryByLabelText('Rock Elemental: actions')).toBeNull();
  });

  it('draws none of the rest of the shared dialog over the frame, the first-run tour included', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    render(<ArtFocusPanel unit={player} actions={[]} />);
    const frames = drawn.filter(parts => parts.includes('btnTarget'));
    expect(frames.length).toBeGreaterThan(0);
    for (const parts of frames) {
      expect(parts).not.toContain('groupTip');
      expect(parts).not.toContain('btnChangetarget');
    }
  });

  it('stands the switch beside a creature it targets', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(<ArtFocusPanel unit={mob} actions={[]} />);
    expect(container.querySelector('[data-switch] img')).toBeTruthy();
  });

  it('stands no switch beside a player', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(<ArtFocusPanel unit={player} actions={[]} />);
    expect(container.querySelector('[data-switch]')).toBeNull();
  });
});

describe('gaugeFaces', () => {
  // A health clip of three runs, as the movie reads: who each is for is
  // the screen table's, and the runs are read off the clip.
  const bars = {
    frames: 40,
    of: { health: 'hp', mana: 'mp', vigor: 'power', morale: 'rage' },
    runs: {
      hp: [
        { first: 0, last: 20 },
        { first: 21, last: 41 },
        { first: 42, last: 67 },
      ],
      mp: [{ first: 0, last: 40 }],
      power: [{ first: 0, last: 40 }],
    },
    runsFor: { health: ['hostile', 'friendly', 'neutral'] },
  };
  const unit = {
    health: 100,
    maxHealth: 100,
    mana: 40,
    maxMana: 40,
    dead: false,
  };

  it('steps health along the green run, which is the only run it wears', () => {
    expect(gaugeFaces(unit, bars, 'mana').hp).toBe(21);
    expect(gaugeFaces({ ...unit, health: 50 }, bars, 'mana').hp).toBe(31);
  });

  it('wears the first run where the table says nothing of who the runs are for', () => {
    const { runsFor: _unsaid, ...unsaid } = bars;
    expect(gaugeFaces({ ...unit, health: 50 }, unsaid, 'mana').hp).toBe(10);
  });

  it('steps only the clip for the resource this unit spends', () => {
    const faces = gaugeFaces({ ...unit, mana: 10 }, bars, 'vigor');
    expect(faces.power).toBe(30);
    expect(faces.mp).toBeUndefined();
    expect(faces.rage).toBeUndefined();
  });

  it('shows no resource as an empty track, and a dead unit with both bars empty', () => {
    expect(gaugeFaces({ ...unit, mana: 0, maxMana: 0 }, bars, 'mana').mp).toBe(40);
    expect(gaugeFaces({ ...unit, dead: true }, bars, 'mana')).toEqual({ hp: 41, mp: 40 });
  });
});

describe('castFaces', () => {
  const own = { at: 'cast', frames: 49 };

  it('leaves the cast bar out while the target casts nothing', () => {
    expect(castFaces(null, own)).toEqual({ hidden: ['cast'], frames: {} });
  });

  it('turns the bar to how far the cast has gone: empty at the start, full at the end', () => {
    expect(castFaces(0, own).frames.cast).toBe(49);
    expect(castFaces(0.5, own).frames.cast).toBe(24);
    expect(castFaces(1, own)).toEqual({ hidden: [], frames: { cast: 0 } });
  });

  it('does nothing where the build has no cast bar on the target frame', () => {
    expect(castFaces(0.5, undefined)).toEqual({ hidden: [], frames: {} });
  });
});
