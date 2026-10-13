import { describe, expect, it } from 'vitest';

import { placeNameAt } from '../src/app/helpers/map/placeName';

const places = [
  { name: 'Hall', mapId: 1, bounds: [0, 0, 10, 10] as [number, number, number, number] },
  { name: 'Yard', mapId: 1, bounds: [20, 0, 30, 10] as [number, number, number, number] },
];

describe('placeNameAt', () => {
  it('names the place a position stands in', () => {
    expect(placeNameAt(places, 1, [25, 0, 5])).toBe('Yard');
  });

  it('is empty on open ground and on another map', () => {
    expect(placeNameAt(places, 1, [15, 0, 5])).toBe('');
    expect(placeNameAt(places, 2, [5, 0, 5])).toBe('');
    expect(placeNameAt(places, undefined, [5, 0, 5])).toBe('');
  });
});
