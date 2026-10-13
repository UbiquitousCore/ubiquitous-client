import { describe, expect, it } from 'vitest';

import { shadeOf } from '../../src/ui/art/wornTile';

const pixels = (...rgba: number[][]): Uint8ClampedArray => new Uint8ClampedArray(rgba.flat());

describe('shadeOf', () => {
  it('calls a pale face light, so dark words go on it', () => {
    expect(shadeOf(pixels([240, 235, 150, 255], [230, 225, 140, 255]))).toBe('light');
  });

  it('calls a deep red face dark, so light words go on it', () => {
    expect(shadeOf(pixels([150, 30, 10, 255], [200, 70, 20, 255]))).toBe('dark');
  });

  it('passes over what is see-through, and has no answer for nothing', () => {
    expect(shadeOf(pixels([255, 255, 255, 0], [20, 20, 20, 255]))).toBe('dark');
    expect(shadeOf(pixels([255, 255, 255, 0]))).toBeNull();
  });
});
