/**
 * What a quest window needs looked up before it opens.
 *
 * The server sends a quest as numbers. The words, the pictures of what
 * it pays with, and what each of those things is, are the client's to
 * find, read from the player's own copy of the game.
 */

import type { ResourceSystem } from '../../../assets/ResourceSystem';
import type { QuestRecord } from '../../../net/GameConnection';
import { setItemFacts, setItemIcon, setItemName } from '../../../ui/inventoryStore';
import { questString, setQuestText } from '../../../ui/questStore';
import { resolveItemWords, type ItemWordLookups } from '../../itemLookups';

/** The lookups a quest's window reads through. */
export type QuestLookups = Pick<
  ResourceSystem,
  'questText' | 'itemName' | 'itemIcon' | 'itemFacts'
> &
  ItemWordLookups;

/**
 * Everything the giver's window needs, resolved before it opens.
 *
 * A window that opened first and filled in afterwards would flash through
 * a blank page and a row of empty plinths. A lookup that fails leaves its
 * gap and does not hold the others up.
 */
export async function resolveQuestArt(quest: QuestRecord, lookups: QuestLookups): Promise<void> {
  const text = [
    quest.titleStringId,
    quest.detailsStringId,
    quest.completionStringId,
    quest.incompleteStringId,
    ...(quest.objectives ?? []).map(objective => objective.objectiveStringId),
  ].map(async id => {
    if (id === undefined || id === 0 || questString(id) !== undefined) return;
    const resolved = await lookups.questText(id).catch(() => null);
    if (resolved) setQuestText(id, resolved);
  });

  const items = [...(quest.rewards ?? []), ...(quest.rewardChoices ?? [])].map(async item => {
    // The same lookups the bag makes for an item, and the same caches, so
    // a reward already seen in the bag costs nothing here. A reward's card
    // is the card a thing you have opens, and it writes what the item's own
    // row says: without the row it is a name and nothing else.
    await Promise.all([
      lookups
        .itemName(item.entry)
        .then(name => {
          if (name) setItemName(item.entry, name);
        })
        .catch(() => {}),
      lookups
        .itemIcon(item.entry)
        .then(icon => {
          if (icon) setItemIcon(item.entry, icon);
        })
        .catch(() => {}),
      lookups
        .itemFacts(item.entry)
        .then(async facts => {
          if (!facts) return;
          setItemFacts(item.entry, facts);
          await resolveItemWords(facts, lookups);
        })
        .catch(() => {}),
    ]);
  });

  await Promise.all([...text, ...items]);
}
