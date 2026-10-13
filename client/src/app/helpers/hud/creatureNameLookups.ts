/** The identity fields of a replicated creature that name lookups read. */
interface NameFields {
  entry?: number;
  networkName?: string;
  networkNameId?: number;
  networkSubName?: string;
  networkSubNameId?: number;
}

/** A lookup into the localized names table that a creature still needs. */
export type NameLookup =
  | { kind: 'subName'; id: number }
  | { kind: 'entryName'; entry: number }
  | { kind: 'name'; id: number };

/** What is already being looked up, or already known to have no answer. */
export interface NameLookupState {
  pendingIds: ReadonlySet<number>;
  pendingEntries: ReadonlySet<number>;
  namelessEntries: ReadonlySet<number>;
}

/**
 * The lookups a creature needs started now.
 *
 * The role under the name is independent of the name itself. The name has two
 * routes: a body the server named by entry alone is looked up by that entry,
 * and one that carries a string id is looked up by the id. The entry route
 * wins when both could apply, and a nameless entry is never asked again.
 */
export function creatureNameLookups(creature: NameFields, state: NameLookupState): NameLookup[] {
  const lookups: NameLookup[] = [];
  if (
    creature.networkSubName === undefined &&
    creature.networkSubNameId &&
    !state.pendingIds.has(creature.networkSubNameId)
  ) {
    lookups.push({ kind: 'subName', id: creature.networkSubNameId });
  }
  if (!creature.networkName && !creature.networkNameId && creature.entry) {
    if (!state.pendingEntries.has(creature.entry) && !state.namelessEntries.has(creature.entry)) {
      lookups.push({ kind: 'entryName', entry: creature.entry });
    }
    return lookups;
  }
  if (
    !creature.networkName &&
    creature.networkNameId &&
    !state.pendingIds.has(creature.networkNameId)
  ) {
    lookups.push({ kind: 'name', id: creature.networkNameId });
  }
  return lookups;
}
