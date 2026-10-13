/** @vitest-environment happy-dom */
/**
 * The panel a screen wearing the shipped art is drawn on.
 *
 * Everything on such a screen is placed as a fraction of the panel, so
 * the picture has to be the panel. Drawn instead at the size it was
 * rasterised at, the two come out different sizes and every control
 * drifts off its own art — a little at the top corner and half a button
 * away at the bottom of the screen.
 */

import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';

import { WornPanel } from '../../src/ui/frontend/wornBits';
import type { Worn } from '../../src/ui/art/useWorn';

afterEach(cleanup);

function stubWorn(placed: Record<string, string>): Worn {
  return {
    frame: { x: 0, y: 0, w: 400, h: 300 },
    image: { url: 'data:,' },
    placed,
    // What the picture was rasterised at, which is not what it is shown at.
    sized: { width: '800px', height: '600px' },
    pictureRef: { current: null },
    parts: [],
    whole: [],
  } as unknown as Worn;
}

describe('a worn panel', () => {
  it('fills itself with its picture where the stage placed it', () => {
    const { container } = render(
      <WornPanel worn={stubWorn({ position: 'absolute', width: '90%' })} name="race" />,
    );

    const picture = container.querySelector('img') as HTMLImageElement;
    expect(picture.style.width, 'the picture is the panel, not the raster').toBe('100%');
    expect(picture.style.height).toBe('100%');
  });

  it('stands at its own size where nothing placed it', () => {
    const { container } = render(
      <WornPanel worn={stubWorn({ position: 'relative' })} name="race" />,
    );

    const picture = container.querySelector('img') as HTMLImageElement;
    expect(picture.style.width).toBe('800px');
  });
});
