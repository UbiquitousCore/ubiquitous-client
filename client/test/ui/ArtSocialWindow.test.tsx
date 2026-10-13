/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:people', width: 200, height: 200 }),
}));

import { ArtSocialWindow } from '../../src/ui/components/ArtSocialWindow';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { resetGuild, setGuildRoster } from '../../src/ui/guildStore';
import {
  resetSocialLists,
  setFriendList,
  setIgnoreList,
  setSocialListActions,
} from '../../src/ui/socialListStore';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';
import { SCREEN_MEANINGS } from '../../src/ui/art/screenMeanings';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  resetSocialLists();
  resetGuild();
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** Three tabs over a list three rows tall. */
function skin(): UiSkinData {
  const rows: UiSkinPlaced[] = [];
  for (let i = 1; i <= 3; i++) rows.push(place(21, 0, (i - 1) * 20, `btn0${i}`));
  return {
    movie: 'TEST',
    width: 200,
    height: 200,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 100, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L100 0L100 20L0 20Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 120, h: 120 },
        fills: [{ kind: 'solid', css: 'rgb(9, 9, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L120 0L120 120L0 120Z' }],
      },
    ],
    sprites: [
      {
        id: 21,
        frameCount: 1,
        frames: [[place(11, 0, 0, 'background'), place(11, 0, 0, 'textPrefix')]],
      },
      { id: 22, frameCount: 1, frames: [[...rows, place(12, 0, 0, 'mask')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, 0, 0, 'back'),
            place(22, 0, 40, 'group'),
            place(11, 0, 0, 'btnGuild'),
            place(11, 40, 0, 'btnFriend'),
            place(11, 80, 0, 'btnIgnored'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'thePeople')]],
  };
}

const spec = {
  screens: {
    social: {
      dialog: 'thePeople',
      frame: 'back',
      tabs: [
        { control: 'btnGuild', text: 'textGuild', panel: 'guild', caption: 'Guild' },
        { control: 'btnFriend', text: 'textFriend', panel: 'friends', caption: 'Friends' },
        { control: 'btnIgnored', text: 'textIgnored', panel: 'ignored', caption: 'Ignored' },
      ],
      lists: {
        people: {
          view: 'group',
          viewport: 'group/mask',
          row: 'group/btn',
          chosen: 'background',
          fields: { name: 'textPrefix' },
        },
      },
      words: {
        kick: 'Send away',
        remove: 'Delete',
        offline: 'Offline',
        whisper: 'Whisper',
        teamInvite: 'Invite',
      },
      names: { classes: ['Warrior', 'Warrioress'] },
    },
    rowMenu: { dialog: 'thePeople', frame: 'btnGuild', actions: { btnGuild: 'pick' } },
    playerLink: {
      dialog: 'thePeople',
      frame: 'back',
      actions: { btnGuild: 'link1', btnFriend: 'link2', btnIgnored: 'link3' },
    },
  },
};

describe('ArtSocialWindow', () => {
  it('lists the friends the server sent on the friends tab, and the ignored on theirs', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setGuildRoster({
      guildId: 'g',
      guildName: 'G',
      members: [{ networkId: 5, name: 'Guildie', isLeader: true }],
    });
    setFriendList([{ networkId: 7, name: 'Ayla' }]);
    setIgnoreList([{ networkId: 8, name: 'Pest' }]);
    const { getByLabelText, queryByLabelText } = render(<ArtSocialWindow onClose={() => {}} />);
    expect(getByLabelText('Guildie')).toBeTruthy();
    fireEvent.click(getByLabelText('Friends'));
    expect(getByLabelText('Ayla')).toBeTruthy();
    expect(queryByLabelText('Guildie')).toBeNull();
    fireEvent.click(getByLabelText('Ignored'));
    expect(getByLabelText('Pest')).toBeTruthy();
  });

  it('lists the guild on its own tab where the friends tab comes first', () => {
    const tabs = spec.screens.social.tabs;
    uiSpec.value = {
      screens: {
        ...spec.screens,
        social: { ...spec.screens.social, tabs: [tabs[1]!, tabs[0]!, tabs[2]!] },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    setGuildRoster({
      guildId: 'g',
      guildName: 'G',
      members: [{ networkId: 5, name: 'Guildie', isLeader: true }],
    });
    setFriendList([{ networkId: 7, name: 'Ayla' }]);
    const { getByLabelText } = render(<ArtSocialWindow onClose={() => {}} />);
    expect(getByLabelText('Ayla')).toBeTruthy();
    fireEvent.click(getByLabelText('Guild'));
    expect(getByLabelText('Guildie')).toBeTruthy();
  });

  it('takes a friend off the list from the menu beside their name', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const removeFriend = vi.fn();
    setSocialListActions({
      addFriend: vi.fn(),
      addFriendNamed: vi.fn(),
      removeFriend,
      addIgnore: vi.fn(),
      removeIgnore: vi.fn(),
      refresh: vi.fn(),
    });
    setFriendList([{ networkId: 7, name: 'Ayla' }]);
    const { getByLabelText, getByRole } = render(<ArtSocialWindow onClose={() => {}} />);
    fireEvent.click(getByLabelText('Friends'));
    fireEvent.click(getByLabelText('Ayla'));
    fireEvent.click(getByRole('menuitem', { name: 'Delete' }));
    expect(removeFriend).toHaveBeenCalledWith(7);
  });

  it('offers a friend in the world a whisper and a team invitation from the menu beside their name', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setFriendList([{ networkId: 7, name: 'Ayla', online: true, level: 9 }]);
    const { getByLabelText, getAllByRole } = render(<ArtSocialWindow onClose={() => {}} />);
    fireEvent.click(getByLabelText('Friends'));
    fireEvent.click(getByLabelText('Ayla'));
    expect(getAllByRole('menuitem').map(item => item.getAttribute('aria-label'))).toEqual([
      'Whisper',
      'Invite',
      'Delete',
    ]);
  });

  it('writes a friend in the world with their level, race, class and zone, and one who is not as offline', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setFriendList([
      {
        networkId: 7,
        name: 'Heddes',
        online: true,
        level: 60,
        classId: 1,
        gender: 0,
        raceName: 'Human',
        zoneName: 'Test Vale',
      },
      { networkId: 8, name: 'Borin' },
    ]);
    const { getByLabelText, getByText } = render(<ArtSocialWindow onClose={() => {}} />);
    fireEvent.click(getByLabelText('Friends'));
    expect(getByText('Heddes, level 60 Human Warrior')).toBeTruthy();
    expect(getByText('Test Vale')).toBeTruthy();
    expect(getByText('Borin - Offline')).toBeTruthy();
  });

  it('writes where an online friend is in green', () => {
    uiSpec.value = {
      screens: {
        ...spec.screens,
        social: { ...spec.screens.social, tones: SCREEN_MEANINGS.social!.tones },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    setFriendList([
      { networkId: 7, name: 'Heddes', online: true, level: 60, zoneName: 'Test Vale' },
    ]);
    const { getByLabelText, getByText } = render(<ArtSocialWindow onClose={() => {}} />);
    fireEvent.click(getByLabelText('Friends'));
    expect(getByText('Test Vale').style.color).toBe('var(--color-ink-success)');
  });
});
