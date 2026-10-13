/** @vitest-environment happy-dom */
/**
 * The card a quest's reward opens, in the giver's window and in the log.
 *
 * What the card writes — armour, what the item gives, the level it asks
 * for, the colour its name is written in — is all the item's own row in
 * the user's item table. These check that the row reaches the card from
 * both screens, and that the quality is the row's rather than the one the
 * quest message carries.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:quest', width: 200, height: 200 }),
}));

/** Every listing a card was opened with, in order. */
const opened: AuctionListingView[] = [];

vi.mock('../../src/ui/components/ArtItemCard', async importOriginal => {
  const real = await importOriginal<typeof import('../../src/ui/components/ArtItemCard')>();
  return {
    ...real,
    ArtItemCard: (props: { listing: AuctionListingView }) => {
      opened.push(props.listing);
      return <div role="dialog" aria-label={`Card for ${props.listing.name}`} />;
    },
  };
});

import { ArtQuestLogWindow } from '../../src/ui/components/ArtQuestLogWindow';
import { ArtQuestWindow } from '../../src/ui/components/ArtQuestWindow';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { AuctionListingView } from '../../src/ui/auctionStore';
import { setItemFacts, setItemName } from '../../src/ui/inventoryStore';
import { ITEM_QUALITY } from '../../src/ui/items';
import { closeQuestConversation, setQuestLog } from '../../src/ui/questStore';
import type { QuestRecord } from '../../src/net/GameConnection';
import type { ItemFacts, UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  opened.length = 0;
  setQuestLog([]);
  closeQuestConversation();
});

/** A sample helm's own row: an ordinary item that is worn and gives something. */
const HELM: ItemFacts = {
  itemClass: 4,
  subClass: 2,
  quality: ITEM_QUALITY.common,
  requiredLevel: 12,
  descriptionId: 0,
  inventoryType: 1,
  armour: 30,
  binding: 1,
  allowedClasses: 0,
  stats: [{ kind: 7, value: 3 }],
  damage: [],
  delay: 0,
  block: 0,
  spells: [],
  spellSlots: [],
  startsQuest: 0,
};

/**
 * A reward whose message says it is rare. Its row says it is ordinary,
 * and the row is what the card is to believe.
 */
const REWARD = { entry: 8200, nameTextId: 0, quality: ITEM_QUALITY.rare, count: 1 };

function seedReward(): void {
  setItemName(REWARD.entry, 'Sample Warden Helm');
  setItemFacts(REWARD.entry, HELM);
}

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});
const box = (id: number, w: number, h: number) => ({
  id,
  bounds: { x: 0, y: 0, w, h },
  fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
  paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
});

/** The giver's window: a backing, a scroll area with a group of rewards, and a control. */
function questSkin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 400,
    height: 280,
    background: null,
    exports: [],
    shapes: [box(11, 30, 30), box(12, 300, 150)],
    sprites: [
      { id: 40, frameCount: 1, frames: [[place(11, 0, 0, 'plinth')]] },
      {
        id: 41,
        frameCount: 1,
        frames: [[place(11, 0, 0, 'title'), place(40, 0, 20, 'btnitem1')]],
      },
      { id: 42, frameCount: 1, frames: [[place(41, 0, 0, 'groupreward')]] },
      {
        id: 43,
        frameCount: 1,
        frames: [[place(12, 0, 0, 'btnScroll'), place(42, 0, 0, 'scroll')]],
      },
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(12, 0, 0, 'back'),
            place(43, 20, 50, 'questScroll'),
            place(11, 180, 230, 'btnMiddle'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'theQuest')]],
  };
}

/** The log: a backing, a list three rows tall inside a window, and room under each row. */
function logSkin(): UiSkinData {
  const rows: UiSkinPlaced[] = [];
  for (let i = 1; i <= 3; i++) rows.push(place(21, 0, (i - 1) * 20, `btn0${i}`));
  return {
    movie: 'TEST',
    width: 200,
    height: 200,
    background: null,
    exports: [],
    shapes: [box(11, 100, 20), box(12, 120, 120), box(13, 200, 200)],
    sprites: [
      { id: 21, frameCount: 1, frames: [[place(11, 0, 0, 'background'), place(11, 0, 0, 'name')]] },
      { id: 22, frameCount: 1, frames: [[...rows, place(12, 0, 0, 'mask')]] },
      {
        id: 20,
        frameCount: 1,
        frames: [[place(13, 0, 0, 'back'), place(22, 0, 40, 'group')]],
      },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'theLog')]],
  };
}

const QUEST_SPEC = {
  dialog: 'theQuest',
  groups: { rewards: 'questScroll/scroll/groupreward' },
  panels: { window: 'questScroll/btnScroll' },
  actions: { btnMiddle: 'second' },
  words: { handIn: 'Complete' },
};

const LOG_SPEC = {
  dialog: 'theLog',
  frame: 'back',
  lists: {
    log: { view: 'group', viewport: 'group/mask', row: 'group/btn', fields: { name: 'name' } },
  },
  panels: { window: 'group/mask' },
  groups: { rewards: 'group' },
};

const QUEST = {
  id: 31,
  name: 'A sample errand',
  status: 'finished',
  rewards: [REWARD],
} as unknown as QuestRecord;

describe("a quest reward's card", () => {
  it("is handed the item's own row in the giver's window, quality and all", () => {
    uiSpec.value = { screens: { questTalk: QUEST_SPEC } };
    setMovie({ skin: questSkin(), art: new Map() });
    seedReward();
    render(<ArtQuestWindow quest={QUEST} offers={[]} onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Sample Warden Helm' }));

    const card = opened.at(-1)!;
    expect(card.itemEntry).toBe(REWARD.entry);
    expect(card.facts).toEqual(HELM);
    expect(card.facts?.quality).toBe(ITEM_QUALITY.common);
  });

  it('opens from the quest log too, with the same row behind it', () => {
    uiSpec.value = { screens: { quests: LOG_SPEC } };
    setMovie({ skin: logSkin(), art: new Map() });
    seedReward();
    setQuestLog([QUEST]);
    render(<ArtQuestLogWindow onClose={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'A sample errand' }));
    expect(opened).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Sample Warden Helm' }));

    expect(screen.getByRole('dialog', { name: 'Card for Sample Warden Helm' })).toBeTruthy();
    const card = opened.at(-1)!;
    expect(card.itemEntry).toBe(REWARD.entry);
    expect(card.facts).toEqual(HELM);
  });
});
