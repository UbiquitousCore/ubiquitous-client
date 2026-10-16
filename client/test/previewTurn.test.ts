import { describe, expect, it } from 'vitest';
import { previewTurn } from '../src/renderer/previewTurn';

describe('previewTurn', () => {
  it('turns a full turn for a swipe across the preview, at any width', () => {
    expect(previewTurn(360, 360)).toBeCloseTo(Math.PI * 2);
    expect(previewTurn(900, 900)).toBeCloseTo(Math.PI * 2);
  });

  it('follows the drag direction', () => {
    expect(previewTurn(-90, 360)).toBeCloseTo(-Math.PI / 2);
  });

  it('does not divide by zero for a collapsed canvas', () => {
    expect(Number.isFinite(previewTurn(10, 0))).toBe(true);
  });
});
