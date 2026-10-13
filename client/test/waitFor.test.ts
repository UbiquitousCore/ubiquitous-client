/**
 * Waiting on the server before the world.
 *
 * The give-up half exists because of a real report: a character list that
 * never arrived left the screen saying it was making a character until the
 * page was reloaded. Nothing checked that the giving up actually worked.
 */

import { describe, expect, it, vi } from 'vitest';

import { waitOrFail, waitOrGiveUp } from '../src/app/features/frontEnd/waitFor';

describe('waiting for an answer the server always sends', () => {
  it('resolves when the answer arrives', async () => {
    let answer: (() => void) | null = null;
    const waiting = waitOrFail(
      resolve => {
        answer = resolve;
      },
      () => {},
    );

    answer!();

    await expect(waiting).resolves.toBeUndefined();
  });

  it('rejects with the reason when the server says no', async () => {
    let refuse: ((why: string) => void) | null = null;
    const waiting = waitOrFail(
      () => {},
      fail => {
        refuse = fail;
      },
    );

    refuse!('that name is taken');

    await expect(waiting).rejects.toThrow('that name is taken');
  });

  it('waits for ever when neither happens', async () => {
    const waiting = waitOrFail(
      () => {},
      () => {},
    );

    // Nothing to settle it: whichever arrives first wins, and neither has.
    const raced = await Promise.race([waiting.then(() => 'settled'), Promise.resolve('pending')]);
    expect(raced).toBe('pending');
  });
});

describe('waiting for an answer the server may never send', () => {
  it('resolves when the answer arrives, and cancels the giving up', async () => {
    vi.useFakeTimers();
    try {
      const gaveUp = vi.fn();
      let answer: (() => void) | null = null;
      const waiting = waitOrGiveUp(
        resolve => {
          answer = resolve;
        },
        5000,
        gaveUp,
      );

      answer!();
      await waiting;
      // Past the deadline, and it must not fire after the answer landed.
      vi.advanceTimersByTime(10_000);

      expect(gaveUp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries on by itself once its patience runs out', async () => {
    vi.useFakeTimers();
    try {
      const gaveUp = vi.fn();
      const waiting = waitOrGiveUp(() => {}, 5000, gaveUp);

      vi.advanceTimersByTime(5000);
      await waiting;

      // This is the bug it exists for: without it the screen never moves on.
      expect(gaveUp).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds on right up to its deadline', async () => {
    vi.useFakeTimers();
    try {
      const gaveUp = vi.fn();
      waitOrGiveUp(() => {}, 5000, gaveUp);

      vi.advanceTimersByTime(4999);

      expect(gaveUp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('needs nobody to tell it anything happened', async () => {
    vi.useFakeTimers();
    try {
      // No `onGiveUp` at all: it still has to settle.
      const waiting = waitOrGiveUp(() => {}, 100);
      vi.advanceTimersByTime(100);
      await expect(waiting).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
