/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The face asked of the bar in every picture drawn. */
const faces: Array<number | undefined> = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:cast', width: 200, height: 20 }),
}));
vi.mock('../../src/ui/art/piecePlan', async actual => {
  const real = await actual<typeof import('../../src/ui/art/piecePlan')>();
  return {
    ...real,
    planPiece: (...args: Parameters<typeof real.planPiece>) => {
      faces.push(args[2]?.frames?.meter);
      return real.planPiece(...args);
    },
  };
});

import { ArtCastBar, castFace } from '../../src/ui/components/ArtCastBar';
import { setSpellName } from '../../src/gameplay/SpellBook';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  faces.length = 0;
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

/** A bar that is a clip of three faces, standing on the stage. */
function skin(): UiSkinData {
  const plate = {
    depth: 1,
    characterId: 11,
    matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
    name: null,
    opacity: 1,
  };
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 200, h: 20 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L200 0L200 20L0 20Z' }],
      },
    ],
    sprites: [{ id: 30, frameCount: 3, frames: [[plate], [plate], [plate]] }],
    edits: [],
    root: [[{ ...plate, characterId: 30, name: 'meter' }]],
  };
}

const spec = {
  screens: { castBar: { dialog: 'meter', bars: { frames: 2, of: { cast: 'meter' } } } },
};

describe('castFace', () => {
  it('is empty at the start of a cast and full at its end', () => {
    expect(castFace(0, 50)).toBe(50);
    expect(castFace(1, 50)).toBe(0);
  });

  it('rounds a part-filled bar down to a whole face', () => {
    expect(castFace(0.5, 50)).toBe(25);
    expect(castFace(0.01, 50)).toBe(50);
  });

  it('keeps inside the run for a share out of range', () => {
    expect(castFace(2, 50)).toBe(0);
    expect(castFace(-1, 50)).toBe(50);
  });
});

describe('ArtCastBar', () => {
  it('draws nothing until the shipped bar has arrived', () => {
    const { container } = render(<ArtCastBar spellId={1} castTime={1000} elapsed={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('names the spell over the bar, and turns the bar to the face for how far the cast has gone', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setSpellName(9901, 'Sample Bolt');
    const { getByText } = render(<ArtCastBar spellId={9901} castTime={1000} elapsed={500} />);
    expect(getByText('Sample Bolt')).toBeTruthy();
    expect(faces).toContain(1);
  });

  it('writes that the cast was interrupted where the name stood, keeping the face it reached', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    setSpellName(9901, 'Sample Bolt');
    const { getByText, queryByText } = render(
      <ArtCastBar spellId={9901} castTime={1000} elapsed={500} interrupted />,
    );
    expect(getByText('Interrupted')).toBeTruthy();
    expect(queryByText('Sample Bolt')).toBeNull();
    expect(faces).toContain(1);
  });
});
