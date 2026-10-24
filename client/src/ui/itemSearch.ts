/** Finding an item by name or entry number, for an administrator giving one. */

export interface ItemHit {
  entry: number;
  name: string;
}

/** How many matches the list shows: enough to browse, few enough to draw at once. */
export const MOST_ITEM_HITS = 50;

/** The shortest name search that runs; one letter matches most of the game. */
export const SHORTEST_ITEM_SEARCH = 2;

/**
 * The items whose name holds the words asked, names opening with them first;
 * a number asks for that entry. Fewer than `SHORTEST_ITEM_SEARCH` letters
 * finds nothing.
 */
export function searchItems(
  catalog: readonly ItemHit[],
  query: string,
  limit = MOST_ITEM_HITS,
): ItemHit[] {
  const asked = query.trim().toLowerCase();
  if (/^\d+$/.test(asked)) {
    const entry = Number(asked);
    return catalog.filter(item => item.entry === entry).slice(0, limit);
  }
  if (asked.length < SHORTEST_ITEM_SEARCH) return [];
  const opening: ItemHit[] = [];
  const holding: ItemHit[] = [];
  for (const item of catalog) {
    const at = item.name.toLowerCase().indexOf(asked);
    if (at === 0) opening.push(item);
    else if (at > 0) holding.push(item);
    if (opening.length >= limit) break;
  }
  return [...opening, ...holding].slice(0, limit);
}
