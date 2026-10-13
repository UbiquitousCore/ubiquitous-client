/** @vitest-environment happy-dom */
/**
 * The diagnostics readout: two large numbers (fps, draws/tris), a condensed
 * counts line, and a place line underneath — no asset provider, no pack
 * list, no build stamp. Just the DOM structure and what lands where; the
 * exact wording is free to move.
 */
import { describe, expect, it } from 'vitest';

import { Hud } from '../../src/ui/Hud';
import type { HudModel } from '../../src/ui/Hud';

const MODEL: HudModel = {
  zoneName: 'Silence',
  position: [-563.5, 10, 96],
  fps: 58,
  entities: 23675,
  animated: 16,
  terrainTiles: 81,
  pendingTiles: 0,
  drawCalls: 1737,
  triangles: 562049,
  textures: 356,
  effectsMs: 1.2,
  clipsMs: 0.4,
  status: '',
};

describe('Hud', () => {
  it('puts fps and draws/tris up big, everything else condensed underneath', () => {
    const root = document.createElement('div');
    const hud = new Hud(root);
    hud.render(MODEL);

    expect(root.textContent).toContain('58 fps');
    expect(root.textContent).toContain('1737 draws');
    // Triangles in thousands, not the raw count.
    expect(root.textContent).toContain('562k tris');
    expect(root.textContent).not.toContain('562049');

    expect(root.textContent).toContain('81 tiles');
    expect(root.textContent).toContain('23675 entities');
    expect(root.textContent).toContain('16 animated');
    expect(root.textContent).toContain('356 textures');
    expect(root.textContent).toContain('fx 1.2ms clips 0.4ms');

    expect(root.textContent).toContain('Silence');
    // Never the pack list or a build stamp — that's `ubiquitous.inspect()`'s job now.
    expect(root.textContent).not.toContain('assets:');
    expect(root.textContent).not.toContain('build:');
  });

  it('marks pending tiles without them dominating the line', () => {
    const root = document.createElement('div');
    const hud = new Hud(root);
    hud.render({ ...MODEL, pendingTiles: 3 });

    expect(root.textContent).toContain('81 tiles (+3)');
  });

  it('updates in place rather than rebuilding the DOM each frame', () => {
    const root = document.createElement('div');
    const hud = new Hud(root);
    hud.render(MODEL);
    const spans = [...root.querySelectorAll('span')];

    hud.render({ ...MODEL, fps: 30 });

    expect([...root.querySelectorAll('span')]).toEqual(spans);
    expect(root.textContent).toContain('30 fps');
  });
});
