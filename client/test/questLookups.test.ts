/**
 * What a quest window needs looked up before it opens.
 *
 * The server sends a quest as numbers. Its words and the pictures of what
 * it pays with are read from the player's own copy of the game, and are
 * all waited on, so the window never opens on a blank page.
 */

import { describe, expect, it } from 'vitest';

import { resolveQuestArt, type QuestLookups } from '../src/app/features/quest/questLookups';
import type { QuestRecord } from '../src/net/GameConnection';
import type { ItemFacts } from '../src/assets/types';
import { cardFor } from '../src/ui/components/ArtItemCard';
import { itemIcons, itemNames, spellTexts } from '../src/ui/inventoryStore';
import { questString } from '../src/ui/questStore';

/** A picture that is only ever compared by identity. */
const picture = (): ImageBitmap => ({ width: 1, height: 1, close() {} }) as ImageBitmap;

/** Lookups over a few sample rows, answering null for anything else. */
function lookups(rows: {
  names?: Record<number, string>;
  icons?: Record<number, ImageBitmap>;
  quest?: Record<number, string>;
  facts?: Record<number, ItemFacts>;
  texts?: Record<number, string>;
  spells?: Record<number, string>;
}): QuestLookups {
  return {
    questText: async id => rows.quest?.[id] ?? null,
    itemName: async entry => rows.names?.[entry] ?? null,
    itemIcon: async entry => rows.icons?.[entry] ?? null,
    itemFacts: async entry => rows.facts?.[entry] ?? null,
    itemText: async id => rows.texts?.[id] ?? null,
    spellText: async id => rows.spells?.[id] ?? null,
  };
}

describe('resolveQuestArt', () => {
  it("has the quest's words and every reward's name and picture in hand once it settles", async () => {
    const hood = picture();
    const cap = picture();
    await resolveQuestArt(
      {
        id: 1,
        name: '',
        status: 'finished',
        titleStringId: 9101,
        detailsStringId: 9102,
        rewards: [{ entry: 8101, nameTextId: 0, quality: 1, count: 1 }],
        rewardChoices: [{ entry: 8102, nameTextId: 0, quality: 1, count: 1 }],
      } as QuestRecord,
      lookups({
        quest: { 9101: 'A sample errand', 9102: 'Fetch the sample.' },
        names: { 8101: 'Sample Hood', 8102: 'Sample Cap' },
        icons: { 8101: hood, 8102: cap },
      }),
    );
    expect(questString(9101)).toBe('A sample errand');
    expect(questString(9102)).toBe('Fetch the sample.');
    expect(itemNames.value.get(8101)).toBe('Sample Hood');
    expect(itemNames.value.get(8102)).toBe('Sample Cap');
    expect(itemIcons.value.get(8101)).toBe(hood);
    expect(itemIcons.value.get(8102)).toBe(cap);
  });

  it("hands each reward's card the item's own facts and the words they point to", async () => {
    const helm: ItemFacts = {
      itemClass: 4,
      subClass: 2,
      quality: 2,
      requiredLevel: 12,
      descriptionId: 7101,
      inventoryType: 1,
      armour: 30,
      binding: 1,
      allowedClasses: 0,
      stats: [{ kind: 7, value: 3 }],
      damage: [],
      delay: 0,
      block: 0,
      spells: [6101],
      spellSlots: [{ id: 6101, trigger: 1 }],
      startsQuest: 0,
    };
    const cloak: ItemFacts = {
      ...helm,
      descriptionId: 0,
      inventoryType: 16,
      armour: 9,
      spells: [],
      spellSlots: [],
      startsQuest: 0,
    };
    await resolveQuestArt(
      {
        id: 3,
        name: '',
        status: 'finished',
        rewards: [{ entry: 8104, nameTextId: 0, quality: 2, count: 1 }],
        rewardChoices: [{ entry: 8105, nameTextId: 0, quality: 2, count: 1 }],
      } as QuestRecord,
      lookups({
        names: { 8104: 'Sample Helm', 8105: 'Sample Cloak' },
        facts: { 8104: helm, 8105: cloak },
        texts: { 7101: 'Worn by sample wardens.' },
        spells: { 6101: 'Mends a little of the wearer.' },
      }),
    );
    const helmCard = cardFor({ id: 'reward', entry: 8104, count: 1 });
    expect(helmCard.facts).toEqual(helm);
    expect(helmCard.description).toBe('Worn by sample wardens.');
    expect(spellTexts.value.get(6101)).toBe('Mends a little of the wearer.');
    expect(cardFor({ id: 'choice', entry: 8105, count: 1 }).facts).toEqual(cloak);
  });

  it('settles even where a lookup fails', async () => {
    const failing: QuestLookups = {
      ...lookups({}),
      itemName: async () => {
        throw new Error('no such row');
      },
    };
    await expect(
      resolveQuestArt(
        {
          id: 2,
          name: '',
          status: 'finished',
          rewards: [{ entry: 8103, nameTextId: 0, quality: 1, count: 1 }],
        } as QuestRecord,
        failing,
      ),
    ).resolves.toBeUndefined();
  });
});
