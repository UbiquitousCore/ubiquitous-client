/**
 * A screen is drawn once per look, however often it opens, and what is kept
 * is bounded by encoded size.
 */

import { describe, expect, it, vi } from 'vitest';

import { PieceImageCache } from '../../src/ui/art/pieceImages';
import type { PieceImage } from '../../src/ui/art/pieceCanvas';

function image(url: string, bytes = 40): PieceImage {
  return { url, width: 4, height: 2, bytes };
}

function cache(budgetBytes = 100) {
  const revoked: string[] = [];
  const store = new PieceImageCache({ revoke: url => void revoked.push(url), budgetBytes });
  return { store, revoked };
}

describe('PieceImageCache', () => {
  it('draws a look once and answers later opens from the cache', () => {
    const { store } = cache();
    const draw = vi.fn(() => image('data:bag'));
    expect(store.peek('bag')).toBeUndefined();
    expect(store.draw('bag', draw)).toEqual(image('data:bag'));
    expect(store.draw('bag', draw)).toEqual(image('data:bag'));
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('remembers a screen that draws nothing, so it is not drawn again', () => {
    const { store } = cache();
    const draw = vi.fn(() => null);
    expect(store.draw('blank', draw)).toBeNull();
    expect(store.peek('blank')).toBeNull();
    store.draw('blank', draw);
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('lets the least recently opened go once over budget, revoking its URL', () => {
    const { store, revoked } = cache(100);
    store.draw('a', () => image('blob:a'));
    store.draw('b', () => image('blob:b'));
    store.peek('a');
    store.draw('c', () => image('blob:c'));
    expect(revoked).toEqual(['blob:b']);
    expect(store.peek('b')).toBeUndefined();
    expect(store.peek('a')).toBeDefined();
  });

  it('keeps the newest screen even when it alone is over budget', () => {
    const { store, revoked } = cache(10);
    store.draw('huge', () => image('blob:huge'));
    expect(store.peek('huge')).toEqual(image('blob:huge'));
    expect(revoked).toEqual([]);
  });

  it('never revokes a look a screen is still showing, and lets it go once none is', () => {
    const { store, revoked } = cache(100);
    store.draw('char', () => image('blob:char'));
    store.hold('char');
    for (const name of ['b', 'c', 'd']) store.draw(name, () => image(`blob:${name}`));
    expect(revoked).toEqual(['blob:b']);
    store.release('char');
    expect(revoked).toEqual(['blob:b', 'blob:char']);
  });

  it('does not count what is on screen against the budget', () => {
    const { store, revoked } = cache(100);
    for (const name of ['minimap', 'frame', 'bar']) {
      store.draw(name, () => image(`blob:${name}`));
      store.hold(name);
    }
    store.draw('bag', () => image('blob:bag'));
    store.draw('quests', () => image('blob:quests'));
    expect(revoked).toEqual([]);
    expect(store.peek('bag')).toBeDefined();
  });

  it('counts each screen holding a look', () => {
    const { store, revoked } = cache(10);
    store.draw('bag', () => image('blob:bag'));
    store.hold('bag');
    store.hold('bag');
    store.draw('other', () => image('blob:other'));
    store.release('bag');
    expect(revoked).toEqual([]);
    store.release('bag');
    expect(revoked).toContain('blob:bag');
  });
});
