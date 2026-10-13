/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { setUiSprites } from '../../src/ui/art/uiSprites';
import { Coin } from '../../src/ui/components/Coin';
import { clearUiSprites } from '../helpers/stores';

afterEach(() => {
  cleanup();
  clearUiSprites();
});

describe('Coin', () => {
  it('draws a plain disc before any coin art is cut', () => {
    const { container } = render(<Coin metal="gold" />);
    const coin = container.querySelector('[data-coin="gold"]')!;
    expect(coin.tagName).toBe('SPAN');
    expect(container.querySelector('img')).toBeNull();
  });

  it('wears the coin cut from the player’s sheet once there is one', () => {
    setUiSprites(new Map([['coin-silver', 'blob:silver']]));
    const { container } = render(<Coin metal="silver" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:silver');
  });
});
