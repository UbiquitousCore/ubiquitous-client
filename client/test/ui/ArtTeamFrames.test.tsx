/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:team', width: 100, height: 120 }),
}));

import { ArtTeamFrames, memberFaces, teamRows } from '../../src/ui/components/ArtTeamFrames';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { Unit } from '../../src/ui/hudStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** Two rows, each a name, a button and a health bar. */
function skin(): UiSkinData {
  const row = [place(12, 0, 0, 'name'), place(11, 0, 10, 'btnplayer'), place(11, 0, 20, 'hp')];
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 60, h: 8 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L60 0L60 8L0 8Z' }],
      },
    ],
    sprites: [
      { id: 30, frameCount: 1, frames: [row] },
      {
        id: 31,
        frameCount: 1,
        frames: [[place(30, 0, 0, 'player1'), place(30, 0, 40, 'player2')]],
      },
      { id: 32, frameCount: 1, frames: [[place(31, 0, 0, 'namearea')]] },
    ],
    edits: [
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 60, h: 8 },
        varName: '',
        sampleHtml: '',
        sizePx: 8,
        color: '#ffffff',
        face: null,
      },
    ],
    root: [[place(32, 0, 0, 'dlgteam')]],
  };
}

const spec = {
  screens: {
    teamFrames: {
      dialog: 'dlgteam',
      frame: ['namearea'],
      bars: { frames: 50, of: { health: 'hp' } },
      values: { name: 'name' },
      actions: { btnplayer: 'select' },
      groups: { member1: 'namearea/player1', member2: 'namearea/player2' },
      tones: { mark1: '#00FF00', mark2: '#FF0000' },
    },
  },
};

const unit = (id: string, networkId: number, health: number): Unit => ({
  id,
  networkId,
  name: '',
  level: 1,
  health,
  maxHealth: 100,
  mana: 0,
  maxMana: 0,
  disposition: 'friendly',
  kind: 'player',
});

const members = [
  { networkId: 1, name: 'Me', isLeader: false, online: true },
  { networkId: 2, name: 'Ayla', isLeader: true, online: true },
  { networkId: 3, name: 'Bram', isLeader: false, online: true },
];

describe('teamRows', () => {
  it('leaves the hero out, keeps roster order, and finds each body that is in sight', () => {
    const rows = teamRows(members, 'Me', [unit('u2', 2, 50)]);
    expect(rows.map(row => row.member.name)).toEqual(['Ayla', 'Bram']);
    expect(rows[0]!.unit?.id).toBe('u2');
    expect(rows[1]!.unit).toBeUndefined();
  });
});

describe('memberFaces', () => {
  const bars = {
    frames: 50,
    of: { health: 'hp', mana: 'mp', vigor: 'power' },
    runs: {
      'rows/one/hp': [{ first: 0, last: 50 }],
      'rows/one/power': [{ first: 0, last: 30 }],
    },
  };
  const body = { ...unit('u2', 2, 51), mana: 10, maxMana: 40, resource: 'vigor' as const };

  it('steps health and what the member spends along the runs the movie gives each bar', () => {
    expect(memberFaces('rows/one', body, bars)).toEqual({
      'rows/one/hp': 24,
      'rows/one/power': 22,
    });
  });

  it('keeps a member with a sliver of health off the empty face', () => {
    expect(memberFaces('rows/one', { ...body, health: 0.4 }, bars)['rows/one/hp']).toBe(49);
  });

  it('reads a bar with nothing to measure against as empty', () => {
    expect(memberFaces('rows/one', { ...body, maxHealth: 0 }, bars)['rows/one/hp']).toBe(50);
  });
});

describe('ArtTeamFrames', () => {
  it('shows nothing outside a team', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { queryByRole } = render(
      <ArtTeamFrames members={[]} selfName="Me" units={[]} onSelect={() => {}} />,
    );
    expect(queryByRole('list')).toBeNull();
  });

  it('names a member in the colour the movie letters the field in, where the map gives none', () => {
    const { tones: _tones, ...untoned } = spec.screens.teamFrames;
    uiSpec.value = { screens: { teamFrames: untoned } };
    setMovie({ skin: skin(), art: new Map() });
    const { getByText } = render(
      <ArtTeamFrames members={members} selfName="Me" units={[]} onSelect={vi.fn()} />,
    );
    expect(getByText('Ayla').style.color).toMatch(/#ffffff|rgb\(255, 255, 255\)/i);
  });

  it('names each other member in their map colour, and targets one that is in sight', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onSelect = vi.fn();
    const { getByText, getByRole } = render(
      <ArtTeamFrames
        members={members}
        selfName="Me"
        units={[unit('u2', 2, 50)]}
        onSelect={onSelect}
      />,
    );
    expect(getByText('Ayla').style.color).toMatch(/#00FF00|rgb\(0, 255, 0\)/i);
    expect(getByText('Bram').style.color).toMatch(/#FF0000|rgb\(255, 0, 0\)/i);
    fireEvent.click(getByRole('button', { name: 'Ayla' }));
    expect(onSelect).toHaveBeenCalledWith('u2');
    // Out of sight there is no body to target.
    expect((getByRole('button', { name: 'Bram' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows a member who has left the world as offline, with nothing to target', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onSelect = vi.fn();
    const away = members.map(one => (one.name === 'Ayla' ? { ...one, online: false } : one));
    const { getByRole } = render(
      <ArtTeamFrames
        members={away}
        selfName="Me"
        units={[unit('u2', 2, 50)]}
        onSelect={onSelect}
      />,
    );
    const row = getByRole('button', { name: 'Ayla, offline' }) as HTMLButtonElement;
    expect(row.disabled).toBe(true);
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
