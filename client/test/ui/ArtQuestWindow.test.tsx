/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:quest', width: 400, height: 280 }),
}));

import { ArtQuestWindow } from '../../src/ui/components/ArtQuestWindow';
import { GossipWindow } from '../../src/ui/GossipWindow';
import { closeGossip, showGossip } from '../../src/ui/hudStore';
import { setMovie, wantedDialogs } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { setItemName } from '../../src/ui/inventoryStore';
import { questText, setQuestText } from '../../src/ui/questStore';
import type { QuestRecord } from '../../src/net/GameConnection';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  closeGossip();
  clearMovies();
  uiSpec.value = null;
  questText.value = new Map();
  wantedDialogs.value = [];
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/** The quest screen: a backing, a title bar, a scroll area with a group to choose from, and a control. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 280,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 30, h: 30 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L30 0L30 30L0 30Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 300, h: 150 },
        fills: [{ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L300 0L300 150L0 150Z' }],
      },
      {
        id: 13,
        bounds: { x: 0, y: 0, w: 200, h: 30 },
        fills: [{ kind: 'solid', css: 'rgb(7, 8, 9)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 30L0 30Z' }],
      },
    ],
    sprites: [
      { id: 40, frameCount: 1, frames: [[place(11, 0, 0, 'plinth')]] },
      {
        id: 41,
        frameCount: 1,
        frames: [
          [place(11, 0, 0, 'title'), place(11, 0, 10, 'line'), place(40, 0, 20, 'btnitem1')],
        ],
      },
      {
        id: 45,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'iconGold'),
            place(11, 0, 0, 'iconSilver'),
            place(11, 0, 0, 'iconIron'),
            place(11, 30, 0, 'textGold'),
            place(11, 30, 0, 'textSilver'),
            place(11, 30, 0, 'textIron'),
          ],
        ],
      },
      {
        id: 42,
        frameCount: 1,
        frames: [
          [
            place(41, 0, 0, 'groupchoose'),
            place(11, 0, 0, 'rewardmoney'),
            place(45, 0, 0, 'money'),
          ],
        ],
      },
      {
        id: 43,
        frameCount: 1,
        frames: [[place(12, 0, 0, 'btnScroll'), place(42, 0, 0, 'scroll')]],
      },
      // The title's field runs deeper than the band it is written across.
      { id: 44, frameCount: 1, frames: [[place(13, 0, 0, 'bar'), place(14, 0, 4, 'text')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, 0, 0, 'back'),
            place(44, 20, 10, 'panelTitle'),
            place(43, 20, 50, 'questScroll'),
            place(11, 300, 230, 'btnOK'),
            place(11, 180, 230, 'btnMiddle'),
            place(11, 60, 230, 'btnCancel'),
          ],
        ],
      },
    ],
    edits: [
      {
        id: 14,
        bounds: { x: 0, y: 0, w: 250, h: 60 },
        varName: '',
        sampleHtml: '',
        sizePx: 16,
        color: null,
        face: null,
      },
    ],
    root: [[place(20, 0, 0, 'theQuest')]],
  };
}

const spec = {
  screens: {
    questTalk: {
      dialog: 'theQuest',
      values: { title: 'panelTitle/text' },
      groups: { choices: 'questScroll/scroll/groupchoose' },
      captions: { 'questScroll/scroll/groupchoose/title': 'Pick a reward:' },
      panels: { window: 'questScroll/btnScroll' },
      actions: { btnOK: 'first', btnMiddle: 'second', btnCancel: 'close' },
      words: { handIn: 'Complete', close: 'Close' },
    },
  },
};

/** The same screen, with a card for what a reward is. */
const withCard = {
  screens: {
    ...spec.screens,
    questTalk: {
      ...spec.screens.questTalk,
      groups: { ...spec.screens.questTalk.groups, rewards: 'questScroll/scroll/groupchoose' },
    },
    held: { dialog: 'theCard' },
  },
};

const quest = {
  id: 7,
  name: 'Sample Quest One',
  status: 'finished',
  rewardChoices: [
    { entry: 101, nameTextId: 0, quality: 2, count: 1 },
    { entry: 102, nameTextId: 0, quality: 2, count: 1 },
  ],
} as unknown as QuestRecord;

describe('ArtQuestWindow', () => {
  it('offers the rewards to choose from, and hands in with the one picked', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setItemName(101, 'Golden Hood');
    setItemName(102, 'Leather Cap');
    const onPick = vi.fn();
    const { getByRole, getByText } = render(
      <ArtQuestWindow quest={quest} offers={[{ key: 'handIn', onPick }]} onClose={() => {}} />,
    );
    expect(getByText('Pick a reward:')).toBeTruthy();
    const first = getByRole('button', { name: 'Golden Hood' });
    const second = getByRole('button', { name: 'Leather Cap' });
    expect(first.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(getByRole('button', { name: 'Complete' }));
    expect(onPick).toHaveBeenCalledWith(1);
  });

  it('writes the title across the band at the top, not below it', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { getByText } = render(
      <ArtQuestWindow
        quest={quest}
        offers={[{ key: 'handIn', onPick: () => {} }]}
        onClose={() => {}}
      />,
    );
    const title = getByText('Sample Quest One') as HTMLElement;
    // The screen is 260 tall to the foot of its controls; the band is 30
    // of that, 10 down from the top.
    expect(parseFloat(title.style.top)).toBeCloseTo((10 / 260) * 100, 3);
    expect(parseFloat(title.style.height)).toBeCloseTo((30 / 260) * 100, 3);
    expect(title.style.justifyContent).toBe('flex-start');
  });

  it('says what the quest says while it is handed back, where it has no words for that', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setQuestText(31, 'Bring the sample back to me.');
    const { getByText } = render(
      <ArtQuestWindow
        quest={{ ...quest, rewardChoices: [], detailsStringId: 31 } as QuestRecord}
        offers={[{ key: 'handIn', onPick: () => {} }]}
        onClose={() => {}}
      />,
    );
    expect(getByText('Bring the sample back to me.')).toBeTruthy();
  });

  it('writes the money it pays as figures, each with its own coin beside it', () => {
    uiSpec.value = {
      screens: {
        questTalk: {
          ...spec.screens.questTalk,
          values: { ...spec.screens.questTalk.values, gold: 'questScroll/scroll/money/textGold' },
          groups: {
            ...spec.screens.questTalk.groups,
            moneyTitle: 'questScroll/scroll/rewardmoney',
          },
          // What the movie's own purse inference finds in the money group.
          coins: {
            gold: 'questScroll/scroll/money/iconGold',
            silver: 'questScroll/scroll/money/iconSilver',
            copper: 'questScroll/scroll/money/iconIron',
          },
          captions: {
            ...spec.screens.questTalk.captions,
            'questScroll/scroll/rewardmoney': 'Paid:',
          },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { container, getByText } = render(
      <ArtQuestWindow
        quest={{ ...quest, rewardMoney: 12_345 } as QuestRecord}
        offers={[{ key: 'handIn', onPick: () => {} }]}
        onClose={() => {}}
      />,
    );
    expect(getByText('Paid:')).toBeTruthy();
    const coins = [...container.querySelectorAll<HTMLElement>('[data-coin]')];
    expect(coins.map(coin => [coin.dataset.coin, coin.textContent])).toEqual([
      ['gold', '1'],
      ['silver', '23'],
      ['copper', '45'],
    ]);
    for (const coin of coins) expect(coin.querySelector('img')).not.toBeNull();
  });

  it('stands the one thing to do in the middle, with the cross the only way out', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const { queryAllByRole, getByRole } = render(
      <ArtQuestWindow
        quest={quest}
        offers={[{ key: 'handIn', onPick: () => {} }]}
        onClose={() => {}}
      />,
    );
    const complete = getByRole('button', { name: 'Complete' });
    // The middle control is 180 across a screen that is 320 wide once the
    // control to its right is left out.
    expect(parseFloat(complete.style.left)).toBeCloseTo((180 / 320) * 100, 3);
    expect(queryAllByRole('button', { name: 'Close' })).toHaveLength(0);
  });

  it('leaves room either side of what the quest says', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setQuestText(31, 'Bring the sample back to me.');
    const { getByText } = render(
      <ArtQuestWindow
        quest={{ ...quest, detailsStringId: 31 } as QuestRecord}
        offers={[{ key: 'handIn', onPick: () => {} }]}
        onClose={() => {}}
      />,
    );
    const middle = getByText('Bring the sample back to me.').parentElement as HTMLElement;
    // Twelve units a side, on a screen 320 across.
    expect(parseFloat(middle.style.paddingLeft)).toBeCloseTo((12 / 320) * 100, 3);
    expect(middle.style.paddingRight).toBe(middle.style.paddingLeft);
  });

  it('opens the card for a reward pressed, and picks it where the rewards are a choice', () => {
    uiSpec.value = withCard;
    setMovie({ skin: skin(), art: new Map() });
    setItemName(101, 'Golden Hood');
    setItemName(102, 'Leather Cap');
    setItemName(150, 'Wool Cloth');
    const { getByRole } = render(
      <ArtQuestWindow
        quest={
          {
            ...quest,
            rewards: [{ entry: 150, nameTextId: 0, quality: 1, count: 2 }],
          } as QuestRecord
        }
        offers={[{ key: 'handIn', onPick: () => {} }]}
        onClose={() => {}}
      />,
    );
    expect(wantedDialogs.value.map(one => one.dialog)).not.toContain('theCard');
    fireEvent.click(getByRole('button', { name: 'Wool Cloth' }));
    expect(wantedDialogs.value.map(one => one.dialog)).toContain('theCard');
    const second = getByRole('button', { name: 'Leather Cap' });
    fireEvent.click(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('somebody with nothing but words, where the build has no talking screen', () => {
  it('speaks from the quest page: their name across the top, their words, nothing to take', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const onPick = vi.fn();
    const onClose = vi.fn();
    const { getByRole, getByText, queryByText } = render(
      <ArtQuestWindow
        speech={{
          speaker: 'Sample Keeper',
          words: 'Hi, friend.',
          replies: [{ label: 'Tell me more', onPick }],
        }}
        onClose={onClose}
      />,
    );
    expect(getByRole('dialog', { name: 'Sample Keeper' })).toBeTruthy();
    expect(getByText('Hi, friend.')).toBeTruthy();
    expect(queryByText('Pick a reward:')).toBeNull();
    fireEvent.click(getByRole('button', { name: 'Tell me more' }));
    expect(onPick).toHaveBeenCalledOnce();
    fireEvent.click(getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('is where GossipWindow puts an NPC the talking screen is missing for', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    showGossip({
      title: 'Sample Keeper',
      text: [{ text: 'Hm.', tone: 'plain' }],
      choices: [],
      onBack: () => {},
    });
    const { getByRole } = render(<GossipWindow />);
    expect(getByRole('dialog', { name: 'Sample Keeper' }).textContent).toContain('Hm.');
  });
});
