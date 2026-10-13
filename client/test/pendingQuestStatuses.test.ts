import { describe, expect, it } from 'vitest';

import { pendingQuestStatusesToClear } from '../src/app/features/quest/pendingQuestStatuses';

describe('pendingQuestStatusesToClear', () => {
  it('returns ids whose status was applied', () => {
    const pending = new Map<number, string>([
      [1, 'a'],
      [2, 'b'],
      [3, 'c'],
    ]);
    const out = pendingQuestStatusesToClear(pending, id => id !== 2);
    expect(out).toEqual([1, 3]);
  });
});
