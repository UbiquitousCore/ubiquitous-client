import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TalentRow } from '../src/assets/types';
import { setTalentPlaces } from '../src/gameplay/SpellBook';
import {
  applyTalentState,
  confirmTalents,
  learnOrder,
  pointsToSpend,
  setTalentActions,
  stageTalent,
  talentPoints,
  talentRanks,
  talentStaged,
  talentStanding,
  unstageTalent,
} from '../src/gameplay/talents';
import { talentErrorMessage } from '../src/net/talentErrors';

function place(id: number, over: Partial<TalentRow> = {}): TalentRow {
  return {
    id,
    tier: 1,
    column: 1,
    classId: 110,
    requires: 0,
    after: 0,
    ranks: 1,
    spells: [id * 10],
    icon: '',
    says: 0,
    ...over,
  };
}

const first = place(1, { ranks: 3 });
const beside = place(2, { column: 2 });
const deep = place(3, { tier: 2, requires: 3, after: 1 });
const tree = [first, beside, deep];

describe('talentStanding', () => {
  it('is open with a point to spend and nothing in the way', () => {
    expect(talentStanding(first, tree, new Map(), 1)).toBe('open');
  });

  it('says every rank is bought before anything else', () => {
    expect(talentStanding(beside, tree, new Map([[2, 1]]), 0)).toBe('maxRank');
  });

  it('says there is nothing to spend', () => {
    expect(talentStanding(first, tree, new Map(), 0)).toBe('noPoints');
  });

  it('holds a tier back until enough points are spent in the tree', () => {
    expect(talentStanding(deep, tree, new Map([[1, 2]]), 5)).toBe('tierLocked');
  });

  it('holds a place back until the place it follows is at full rank', () => {
    expect(
      talentStanding(
        deep,
        tree,
        new Map([
          [1, 2],
          [2, 1],
        ]),
        5,
      ),
    ).toBe('prerequisite');
    expect(talentStanding(deep, tree, new Map([[1, 3]]), 5)).toBe('open');
  });
});

describe('talent state', () => {
  it('holds what the server last said, whole', () => {
    applyTalentState(4, [{ talentId: 1, rank: 2 }]);
    expect(talentPoints.value).toBe(4);
    expect(talentRanks.value.get(1)).toBe(2);
    applyTalentState(5, []);
    expect(talentRanks.value.size).toBe(0);
  });

  it('has a sentence for a refusal it does not know, naming it', () => {
    expect(talentErrorMessage('somethingNew')).toContain('(somethingNew)');
  });
});

describe('the order staged points are learned in', () => {
  it('learns a place before the place that follows it', () => {
    const staged = new Map([
      [3, 1],
      [1, 3],
    ]);
    expect(learnOrder(tree, new Map(), staged, 4)).toEqual([1, 1, 1, 3]);
  });

  it('has no order where the points run out or a place cannot be reached', () => {
    expect(learnOrder(tree, new Map(), new Map([[1, 3]]), 2)).toBeNull();
    expect(learnOrder(tree, new Map(), new Map([[3, 1]]), 5)).toBeNull();
    expect(learnOrder(tree, new Map(), new Map([[2, 2]]), 5)).toBeNull();
  });

  it('counts what is already learned', () => {
    expect(learnOrder(tree, new Map([[1, 3]]), new Map([[3, 1]]), 1)).toEqual([3]);
  });
});

describe('staging points', () => {
  const learned = vi.fn();
  afterEach(() => {
    setTalentActions(null);
    setTalentPlaces([]);
    applyTalentState(0, []);
    talentStaged.value = new Map();
    learned.mockReset();
  });
  function start(points: number, ranks: { talentId: number; rank: number }[] = []): void {
    setTalentPlaces(tree);
    applyTalentState(points, ranks);
    setTalentActions({ learn: learned });
  }

  it('stages a point without sending it, and counts it against the points left', () => {
    start(4);
    expect(stageTalent(1)).toBe(true);
    expect(talentStaged.value.get(1) ?? 0).toBe(1);
    expect(pointsToSpend()).toBe(3);
    expect(learned).not.toHaveBeenCalled();
  });

  it('stages no further than the place allows, or the points do', () => {
    start(2);
    expect(stageTalent(2)).toBe(true);
    // One rank is all the place has.
    expect(stageTalent(2)).toBe(false);
    expect(stageTalent(1)).toBe(true);
    // Both points are staged.
    expect(stageTalent(1)).toBe(false);
    expect(pointsToSpend()).toBe(0);
  });

  it('stages a place its tier and the place before it open, once those are staged', () => {
    start(4);
    expect(stageTalent(3)).toBe(false);
    for (let i = 0; i < 3; i++) stageTalent(1);
    expect(stageTalent(3)).toBe(true);
  });

  it('takes back a staged point, never one already learned', () => {
    start(3, [{ talentId: 1, rank: 1 }]);
    stageTalent(1);
    expect(unstageTalent(1)).toBe(true);
    expect(talentStaged.value.get(1) ?? 0).toBe(0);
    expect(unstageTalent(1)).toBe(false);
    expect(talentRanks.value.get(1)).toBe(1);
  });

  it('keeps a staged point that a later one stands on', () => {
    start(4);
    for (let i = 0; i < 3; i++) stageTalent(1);
    stageTalent(3);
    // Taking one back from the first place would strand the one after it.
    expect(unstageTalent(1)).toBe(false);
    expect(unstageTalent(3)).toBe(true);
    expect(unstageTalent(1)).toBe(true);
  });

  it('sends one learn a point on confirm, in an order the server accepts, then clears', () => {
    start(4);
    for (let i = 0; i < 3; i++) stageTalent(1);
    stageTalent(3);
    confirmTalents();
    expect(learned.mock.calls.map(([id]) => id)).toEqual([1, 1, 1, 3]);
    expect(talentStaged.value.size).toBe(0);
    expect(pointsToSpend()).toBe(4);
  });

  it('sends nothing on confirm with nothing staged', () => {
    start(4);
    confirmTalents();
    expect(learned).not.toHaveBeenCalled();
  });
});
