import { describe, expect, it } from 'vitest';

import { selectViewZone } from '../src/app/helpers/map/viewZone';

describe('selectViewZone', () => {
  it('prefers the browsed zone while the map is open', () => {
    expect(
      selectViewZone({
        mapOpen: true,
        browsed: 'browsed',
        teleporting: true,
        travel: 'travel',
        display: 'display',
      }),
    ).toBe('browsed');
  });

  it('falls back to travel zone when teleporting and no browsed zone is selected', () => {
    expect(
      selectViewZone({
        mapOpen: true,
        browsed: null,
        teleporting: true,
        travel: 'travel',
        display: 'display',
      }),
    ).toBe('travel');
  });

  it('uses the display zone when not teleporting or when no travel zone is available', () => {
    expect(
      selectViewZone({
        mapOpen: true,
        browsed: null,
        teleporting: false,
        travel: 'travel',
        display: 'display',
      }),
    ).toBe('display');

    expect(
      selectViewZone({
        mapOpen: true,
        browsed: null,
        teleporting: true,
        travel: null,
        display: 'display',
      }),
    ).toBe('display');
  });

  it('ignores stale browsed zone when the map is closed', () => {
    expect(
      selectViewZone({
        mapOpen: false,
        browsed: 'browsed',
        teleporting: true,
        travel: 'travel',
        display: 'display',
      }),
    ).toBe('travel');
  });
});
