/**
 * The concurrency cap the asset worker's loads go through.
 *
 * The property that matters: with a limit of N, at most N tasks run at once
 * and the rest start in the order they arrived, each as soon as a slot frees.
 * A task that throws must free its slot too, or the queue stalls for ever.
 */

import { describe, expect, it } from 'vitest';

import { Limiter } from '../src/core/limiter';

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe('Limiter', () => {
  it('runs up to the limit at once and queues the rest in order', async () => {
    const limiter = new Limiter(2);
    const started: number[] = [];
    const gates = [deferred<void>(), deferred<void>(), deferred<void>()];
    const results = gates.map((gate, i) =>
      limiter.run(async () => {
        started.push(i);
        await gate.promise;
        return i;
      }),
    );
    await tick();

    expect(started).toEqual([0, 1]);
    expect(limiter.running).toBe(2);
    expect(limiter.pending).toBe(1);

    gates[0]!.resolve();
    await tick();
    expect(started).toEqual([0, 1, 2]);
    expect(limiter.pending).toBe(0);

    gates[1]!.resolve();
    gates[2]!.resolve();
    expect(await Promise.all(results)).toEqual([0, 1, 2]);
    expect(limiter.running).toBe(0);
  });

  it('frees the slot when a task throws', async () => {
    const limiter = new Limiter(1);
    const failing = limiter.run(async () => {
      throw new Error('no');
    });
    await expect(failing).rejects.toThrow('no');
    expect(await limiter.run(async () => 'next')).toBe('next');
    expect(limiter.running).toBe(0);
  });

  it('refuses a limit that would run nothing', () => {
    expect(() => new Limiter(0)).toThrow(RangeError);
    expect(() => new Limiter(1.5)).toThrow(RangeError);
  });
});
