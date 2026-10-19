/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:team', width: 240, height: 320 }),
}));

import { ArtTeamWindow, kickChoice, teamControlsOff } from '../../src/ui/components/ArtTeamWindow';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { player } from '../../src/ui/hudStore';
import { resetParty, setPartyActions, setPartyRoster } from '../../src/ui/partyStore';
import type { PartyActions } from '../../src/ui/partyStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';
import { dungeonMode, setInstanceActions } from '../../src/ui/instanceStore';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  player.value = null;
  resetParty();
  dungeonMode.value = 'normal';
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** A panel, and a dropdown in it: its toggle, the choice it shows, and three rows. */
function skin(): UiSkinData {
  const bar = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w, h },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
  });
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [bar(11, 240, 320), bar(12, 100, 18), bar(13, 20, 20)],
    sprites: [
      { id: 20, frameCount: 1, frames: [[place(12, 0, 0, 'text')]] },
      {
        id: 21,
        frameCount: 1,
        frames: [
          [place(20, 0, 0, 'item01'), place(20, 0, 18, 'item02'), place(20, 0, 36, 'item03')],
        ],
      },
      {
        id: 22,
        frameCount: 1,
        frames: [
          [place(21, 0, 0, 'items'), place(12, 0, 60, 'CurName'), place(13, 100, 60, 'btn')],
        ],
      },
      { id: 23, frameCount: 1, frames: [[place(22, 60, 180, 'NameLists')]] },
      {
        id: 24,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'btnempty'),
            place(23, 0, 0, 'teamsetting'),
            place(13, 0, 290, 'btnInvite'),
            place(13, 40, 290, 'btnQuit'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(24, 0, 0, 'dlgteam')]],
  };
}

const spec = {
  screens: {
    team: {
      dialog: 'dlgteam',
      frame: 'btnempty',
      lists: {
        members: {
          view: 'teamsetting/NameLists/items',
          row: 'teamsetting/NameLists/items/item',
          fields: { name: 'text' },
        },
      },
      combos: [
        {
          control: 'teamsetting/NameLists/btn',
          list: 'teamsetting/NameLists/items',
          value: 'teamsetting/NameLists/CurName',
          of: 'member',
        },
      ],
    },
  },
};

const members = [
  { networkId: 1, name: 'Me', isLeader: true, online: true },
  { networkId: 2, name: 'Ayla', isLeader: false, online: true },
  { networkId: 3, name: 'Bram', isLeader: false, online: true },
];

function actions(): PartyActions & {
  kick: ReturnType<typeof vi.fn>;
  voteKick: ReturnType<typeof vi.fn>;
} {
  const kick = vi.fn();
  const voteKick = vi.fn();
  const all = {
    inviteTarget: () => {},
    invite: () => {},
    inviteNamed: () => {},
    kickTarget: () => {},
    accept: () => {},
    decline: () => {},
    leave: () => {},
    kick,
    voteKick,
    answerVoteKick: () => {},
  };
  setPartyActions(all);
  return all;
}

function mount(self: string) {
  uiSpec.value = spec;
  setMovie({ skin: skin(), art: new Map() });
  player.value = { id: 'me', name: self } as (typeof player)['value'];
  setPartyRoster({ partyId: 'p1', members });
  return render(<ArtTeamWindow onClose={() => {}} />);
}

describe('kickChoice', () => {
  it('offers the leader everyone but themselves', () => {
    const choice = kickChoice(spec.screens.team, members, 'Me');
    expect(choice.members.map(member => member.name)).toEqual(['Ayla', 'Bram']);
    expect(choice.can).toBe(true);
  });

  it('offers a member who does not lead the rest of the party too', () => {
    const choice = kickChoice(spec.screens.team, members, 'Ayla');
    expect(choice.members.map(member => member.name)).toEqual(['Me', 'Bram']);
    expect(choice.can).toBe(true);
  });

  it('offers nothing to someone outside the party', () => {
    expect(kickChoice(spec.screens.team, members, 'Stranger').can).toBe(false);
  });

  it('stands the list open with everyone in it where no dropdown is named', () => {
    const choice = kickChoice({}, members, 'Me');
    expect(choice.combo).toBeUndefined();
    expect(choice.members).toHaveLength(3);
  });
});

const standingGroups = {
  groups: {
    invite: 'btnInvite',
    quit: 'btnQuit',
    inviteWords: 'textInvite',
    quitWords: 'textQuit',
  },
};

describe('teamControlsOff', () => {
  it('leaves Quit and its words off for someone in no team, and keeps Invite', () => {
    expect(teamControlsOff(standingGroups, { inParty: false, leads: true })).toEqual([
      'btnQuit',
      'textQuit',
    ]);
  });

  it('keeps both for the leader', () => {
    expect(teamControlsOff(standingGroups, { inParty: true, leads: true })).toEqual([]);
  });

  it('leaves Invite and its words off for a member who does not lead', () => {
    expect(teamControlsOff(standingGroups, { inParty: true, leads: false })).toEqual([
      'btnInvite',
      'textInvite',
    ]);
  });
});

describe('ArtTeamWindow', () => {
  it('keeps the dropdown shut until it is pressed, then lists the rest of the party', () => {
    const { kick, voteKick } = actions();
    const { getByRole, queryByRole } = mount('Me');
    expect(queryByRole('button', { name: /^Kick out / })).toBeNull();

    const toggle = getByRole('button', { name: 'Choose someone to kick out' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);

    expect(queryByRole('button', { name: 'Kick out Me' })).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Kick out Bram' }));
    expect(kick).toHaveBeenCalledWith(3);
    expect(voteKick).not.toHaveBeenCalled();
    // Picking a name shuts the list again.
    expect(queryByRole('button', { name: /^Kick out / })).toBeNull();
  });

  it('offers no kick-out control to someone who is in no team', () => {
    actions();
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    player.value = { id: 'me', name: 'Me' } as (typeof player)['value'];
    setPartyRoster({ partyId: null, members: [] });
    const { queryByRole } = render(<ArtTeamWindow onClose={() => {}} />);

    expect(queryByRole('button', { name: 'Choose someone to kick out' })).toBeNull();
  });

  it('offers Invite and Quit by where the player stands in the team', () => {
    actions();
    const withButtons = {
      screens: {
        team: {
          ...spec.screens.team,
          ...standingGroups,
          actions: { btnInvite: 'invite', btnQuit: 'quit' },
        },
      },
    };
    const open = (self: string, partyId: string | null) => {
      uiSpec.value = withButtons;
      setMovie({ skin: skin(), art: new Map() });
      player.value = { id: 'me', name: self } as (typeof player)['value'];
      setPartyRoster({ partyId, members: partyId ? members : [] });
      return render(<ArtTeamWindow onClose={() => {}} />);
    };

    const alone = open('Me', null);
    expect(alone.queryByRole('button', { name: 'Leave the party' })).toBeNull();
    expect(alone.queryByRole('button', { name: /^Invite/ })).not.toBeNull();
    alone.unmount();

    const leading = open('Me', 'p1');
    expect(leading.queryByRole('button', { name: 'Leave the party' })).not.toBeNull();
    expect(leading.queryByRole('button', { name: /^Invite/ })).not.toBeNull();
    leading.unmount();

    const following = open('Ayla', 'p1');
    expect(following.queryByRole('button', { name: 'Leave the party' })).not.toBeNull();
    expect(following.queryByRole('button', { name: /^Invite/ })).toBeNull();
  });

  it('asks the team to vote when a member who does not lead picks a name', () => {
    const { kick, voteKick } = actions();
    const { getByRole } = mount('Ayla');

    fireEvent.click(getByRole('button', { name: 'Choose someone to kick out' }));
    fireEvent.click(getByRole('button', { name: 'Kick out Bram' }));

    expect(voteKick).toHaveBeenCalledWith(3);
    expect(kick).not.toHaveBeenCalled();
  });
});

describe('the dungeon page', () => {
  /** The team page above, with two tabs and a dungeon page holding a reset button. */
  function withDungeonPage(): UiSkinData {
    const base = skin();
    base.sprites.push({
      id: 30,
      frameCount: 1,
      frames: [
        [
          place(13, 0, 100, 'btndungeonreset'),
          place(13, 30, 100, 'btndungeonmoderight'),
          place(13, 60, 100, 'btndungeonsave'),
        ],
      ],
    });
    base.sprites[4]!.frames[0]!.push(
      place(13, 0, 0, 'btnteamsetting'),
      place(13, 30, 0, 'btndungeonsetting'),
      place(30, 0, 0, 'dungeonsetting'),
    );
    return base;
  }
  const dungeonSpec = {
    screens: {
      team: {
        ...spec.screens.team,
        actions: {
          btnteamsetting: 'teamPage',
          btndungeonsetting: 'dungeonPage',
          'dungeonsetting/btndungeonreset': 'resetDungeons',
          'dungeonsetting/btndungeonmoderight': 'otherMode',
          'dungeonsetting/btndungeonsave': 'saveMode',
        },
        words: { normal: 'Normal', legend: 'Legend' },
        panels: { team: 'teamsetting', dungeon: 'dungeonsetting' },
      },
    },
  };

  function mountDungeon(self: string, roster = members) {
    const resetDungeons = vi.fn();
    const chooseDungeonMode = vi.fn();
    setInstanceActions({ enter: () => {}, resetDungeons, chooseDungeonMode });
    actions();
    uiSpec.value = dungeonSpec;
    setMovie({ skin: withDungeonPage(), art: new Map() });
    player.value = { id: 'me', name: self } as (typeof player)['value'];
    setPartyRoster({ partyId: roster.length ? 'p1' : null, members: roster });
    return { resetDungeons, chooseDungeonMode, ...render(<ArtTeamWindow onClose={() => {}} />) };
  }

  it('offers the reset only on the dungeon page', () => {
    const { queryByRole, getByRole } = mountDungeon('Me');
    expect(queryByRole('button', { name: 'Reset all dungeons' })).toBeNull();
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    expect(getByRole('button', { name: 'Reset all dungeons' })).toBeTruthy();
  });

  it('lets the leader reset the dungeons', () => {
    const { resetDungeons, getByRole } = mountDungeon('Me');
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    fireEvent.click(getByRole('button', { name: 'Reset all dungeons' }));
    expect(resetDungeons).toHaveBeenCalledTimes(1);
  });

  it('lets a player on their own reset their dungeons', () => {
    const { resetDungeons, getByRole } = mountDungeon('Me', []);
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    fireEvent.click(getByRole('button', { name: 'Reset all dungeons' }));
    expect(resetDungeons).toHaveBeenCalledTimes(1);
  });

  it('does not let a member who does not lead reset them', () => {
    const { resetDungeons, getByRole } = mountDungeon('Ayla');
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    const reset = getByRole('button', { name: 'Reset all dungeons' }) as HTMLButtonElement;
    expect(reset.disabled).toBe(true);
    fireEvent.click(reset);
    expect(resetDungeons).not.toHaveBeenCalled();
  });

  it('lets the leader step to Legend and save it', () => {
    const { chooseDungeonMode, getByRole } = mountDungeon('Me');
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    fireEvent.click(getByRole('button', { name: 'Switch to Legend' }));
    fireEvent.click(getByRole('button', { name: 'Save the dungeon mode' }));
    expect(chooseDungeonMode).toHaveBeenCalledWith('legend');
  });

  it('has nothing to save until the mode is stepped away from the one in force', () => {
    const { chooseDungeonMode, getByRole } = mountDungeon('Me');
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    const save = getByRole('button', { name: 'Save the dungeon mode' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(chooseDungeonMode).not.toHaveBeenCalled();
  });

  it('does not let a member who does not lead change the mode', () => {
    const { chooseDungeonMode, getByRole } = mountDungeon('Ayla');
    fireEvent.click(getByRole('tab', { name: 'Dungeon' }));
    const step = getByRole('button', { name: 'Switch to Legend' }) as HTMLButtonElement;
    expect(step.disabled).toBe(true);
    fireEvent.click(step);
    fireEvent.click(getByRole('button', { name: 'Save the dungeon mode' }));
    expect(chooseDungeonMode).not.toHaveBeenCalled();
  });
});
