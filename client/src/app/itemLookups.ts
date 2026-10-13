/** An item card's words beyond its name (description, spell effects), via string ids, cached by id. */

import type { ResourceSystem } from '../assets/ResourceSystem';
import type { ItemFacts } from '../assets/types';
import { setItemText, setSpellText } from '../ui/inventoryStore';

/** The lookups an item's words are read through. */
export type ItemWordLookups = Pick<ResourceSystem, 'itemText' | 'spellText'>;

/** Resolve an item's description and its spells' words; a failed lookup leaves its gap. */
export async function resolveItemWords(facts: ItemFacts, lookups: ItemWordLookups): Promise<void> {
  const description = facts.descriptionId
    ? lookups
        .itemText(facts.descriptionId)
        .then(text => {
          if (text) setItemText(facts.descriptionId, text);
        })
        .catch(() => {})
    : null;
  const spells = facts.spells.map(spellId =>
    lookups
      .spellText(spellId)
      .then(text => {
        if (text) setSpellText(spellId, text);
      })
      .catch(() => {}),
  );
  await Promise.all([description, ...spells]);
}
