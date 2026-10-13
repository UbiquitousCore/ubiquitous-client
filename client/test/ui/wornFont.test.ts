/**
 * Which token a worn field is lettered in.
 *
 * A field whose movie names the build's title face takes the title token;
 * every other field, and every field before the build's faces are known,
 * takes the body token.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  class LoadingFace {
    load(): Promise<this> {
      return Promise.resolve(this);
    }
  }
  vi.stubGlobal('FontFace', LoadingFace);
  vi.stubGlobal('document', { fonts: { add: () => {} } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const bytes = new Uint8Array([0, 1, 0, 0]);

describe('the lettering of a worn field', () => {
  it('is the body token until the build’s faces are known, whatever the field names', async () => {
    const { wornLettering } = await import('../../src/ui/art/wornFont');
    expect(wornLettering()).toBe('var(--font-chrome)');
    expect(wornLettering('Title Face')).toBe('var(--font-chrome)');
  });

  it('is the title token where the field names the build’s title face', async () => {
    const { wornLettering } = await import('../../src/ui/art/wornFont');
    const { registerFaces } = await import('../../src/core/lettering');
    await registerFaces({
      body: { family: 'Body Face', bytes },
      title: { family: 'Title Face', bytes },
    });
    expect(wornLettering('title face')).toBe('var(--font-title)');
    expect(wornLettering('Body Face')).toBe('var(--font-chrome)');
    expect(wornLettering('Some Other Face')).toBe('var(--font-chrome)');
    expect(wornLettering(null)).toBe('var(--font-chrome)');
  });
});
