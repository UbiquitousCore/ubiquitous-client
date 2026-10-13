import { describe, expect, it, vi } from 'vitest';

import { askOnce } from '../src/core/askOnce';

describe('asking once', () => {
  it('reads once and hands the same answer back after that', async () => {
    const read = vi.fn(async () => 'the answer');
    const ask = askOnce(read);
    expect(await ask()).toBe('the answer');
    expect(await ask()).toBe('the answer');
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('reads again after a read that came back with nothing', async () => {
    // The whole point. A screen asks for the art it wears before the
    // player has chosen their game file, so the first ask fails because
    // nothing is mounted — and remembering that would leave the screen
    // without art for the rest of the session.
    const read = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValue('mounted now');
    const ask = askOnce(read);
    expect(await ask()).toBeNull();
    expect(await ask()).toBe('mounted now');
    expect(read).toHaveBeenCalledTimes(2);
    // And once it has answered, it is not read a third time.
    expect(await ask()).toBe('mounted now');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('reads again after a read that threw', async () => {
    const read = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('no game data mounted'))
      .mockResolvedValue('mounted now');
    const ask = askOnce(read);
    expect(await ask()).toBeNull();
    expect(await ask()).toBe('mounted now');
  });

  it('reads once however many ask before the first read comes back', async () => {
    // Every caller waits on the read in flight; a second one starts only
    // once the first has come back empty.
    let answer: (value: string) => void = () => {};
    const read = vi.fn(() => new Promise<string>(settle => (answer = settle)));
    const ask = askOnce(read);
    const waiting = [ask(), ask(), ask()];
    answer('the answer');
    expect(await Promise.all(waiting)).toEqual(['the answer', 'the answer', 'the answer']);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('keeps an answer that says there is no such thing', async () => {
    // A build that ships no words answers with none, which is an answer.
    // Only a failure to read at all is forgotten.
    const read = vi.fn(async () => [] as readonly string[]);
    const ask = askOnce(read);
    expect(await ask()).toEqual([]);
    expect(await ask()).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
  });
});
