import { describe, expect, it, vi } from 'vitest';

import { loadQuestTitle, unresolvedQuestTextIds } from '../src/app/features/quest/questTextHelpers';

describe('loadQuestTitle', () => {
  it('returns quest name when title id is missing/zero', async () => {
    await expect(
      loadQuestTitle({
        quest: { name: 'Fallback', titleStringId: 0 } as never,
        knownText: () => undefined,
        readText: async () => null,
        rememberText: () => {},
      }),
    ).resolves.toBe('Fallback');
  });

  it('uses cached title when present', async () => {
    await expect(
      loadQuestTitle({
        quest: { name: 'Fallback', titleStringId: 42 } as never,
        knownText: id => (id === 42 ? 'Known title' : undefined),
        readText: async () => null,
        rememberText: () => {},
      }),
    ).resolves.toBe('Known title');
  });

  it('loads and remembers title when uncached', async () => {
    const remember = vi.fn();
    await expect(
      loadQuestTitle({
        quest: { name: 'Fallback', titleStringId: 42 } as never,
        knownText: () => undefined,
        readText: async id => (id === 42 ? 'Loaded title' : null),
        rememberText: remember,
      }),
    ).resolves.toBe('Loaded title');
    expect(remember).toHaveBeenCalledWith(42, 'Loaded title');
  });
});

describe('unresolvedQuestTextIds', () => {
  it('returns only non-zero ids not already known', () => {
    const quest = {
      titleStringId: 10,
      detailsStringId: 0,
      completionStringId: 30,
      incompleteStringId: 40,
      objectives: [{ objectiveStringId: 50 }, { objectiveStringId: 0 }],
    } as never;

    const out = unresolvedQuestTextIds(quest, id => id === 30);
    expect(out).toEqual([10, 40, 50]);
  });
});
