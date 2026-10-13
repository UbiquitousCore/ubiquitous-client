import { describe, expect, it } from 'vitest';
import { creatureNameLookups } from '../src/app/helpers/hud/creatureNameLookups';

const none = () => ({
  pendingIds: new Set<number>(),
  pendingEntries: new Set<number>(),
  namelessEntries: new Set<number>(),
});

describe('creatureNameLookups', () => {
  it('asks for nothing when the creature has a name and no role id', () => {
    expect(creatureNameLookups({ networkName: 'Wolf', networkNameId: 5 }, none())).toEqual([]);
  });

  it('looks a body named by entry alone up by that entry', () => {
    expect(creatureNameLookups({ entry: 77 }, none())).toEqual([{ kind: 'entryName', entry: 77 }]);
  });

  it('does not repeat an entry lookup in flight or one that found nothing', () => {
    const state = none();
    state.pendingEntries.add(77);
    expect(creatureNameLookups({ entry: 77 }, state)).toEqual([]);
    state.pendingEntries.clear();
    state.namelessEntries.add(77);
    expect(creatureNameLookups({ entry: 77 }, state)).toEqual([]);
  });

  it('looks a name up by its string id, once', () => {
    const state = none();
    expect(creatureNameLookups({ networkNameId: 9 }, state)).toEqual([{ kind: 'name', id: 9 }]);
    state.pendingIds.add(9);
    expect(creatureNameLookups({ networkNameId: 9 }, state)).toEqual([]);
  });

  it('prefers the id over the entry when the server sent one', () => {
    expect(creatureNameLookups({ entry: 77, networkNameId: 9 }, none())).toEqual([
      { kind: 'name', id: 9 },
    ]);
  });

  it('asks for the role beside the name, and never again once it resolved to empty', () => {
    expect(creatureNameLookups({ networkName: 'Smith', networkSubNameId: 4 }, none())).toEqual([
      { kind: 'subName', id: 4 },
    ]);
    expect(
      creatureNameLookups(
        { networkName: 'Smith', networkSubNameId: 4, networkSubName: '' },
        none(),
      ),
    ).toEqual([]);
    const state = none();
    state.pendingIds.add(4);
    expect(creatureNameLookups({ networkName: 'Smith', networkSubNameId: 4 }, state)).toEqual([]);
  });

  it('can start the role and the entry name together', () => {
    expect(creatureNameLookups({ entry: 3, networkSubNameId: 4 }, none())).toEqual([
      { kind: 'subName', id: 4 },
      { kind: 'entryName', entry: 3 },
    ]);
  });
});
