/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** What every picture of the button was asked to draw. */
const asked: Array<{
  frames?: Record<string, number>;
  hidden?: readonly string[];
  only?: string | readonly string[];
}> = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:jump', width: 100, height: 100 }),
}));
vi.mock('../../src/ui/art/piecePlan', async actual => {
  const real = await actual<typeof import('../../src/ui/art/piecePlan')>();
  return {
    ...real,
    planPiece: (...args: Parameters<typeof real.planPiece>) => {
      if (args[1] === 'hud' && args[2]) asked.push(args[2]);
      return real.planPiece(...args);
    },
  };
});

import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { ArtJumpButton, PRESS_MS } from '../../src/ui/components/ArtJumpButton';
import { jumpRoom } from '../../src/ui/spellBarModel';
import { clearMovies } from '../helpers/stores';
import { JUMP_SPEC, spellBarMovie } from '../helpers/spellBarMovie';

afterEach(() => {
  asked.length = 0;
  cleanup();
  clearMovies();
  uiSpec.value = null;
  jumpRoom.value = 0;
  vi.useRealTimers();
});

function wear(): void {
  uiSpec.value = { screens: { jumpButton: JUMP_SPEC } };
  setMovie({ skin: spellBarMovie(), art: new Map() });
}

describe('ArtJumpButton', () => {
  it('draws nothing until the shipped button has arrived', () => {
    const { container } = render(<ArtJumpButton onJump={() => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('jumps once for each press', () => {
    wear();
    const onJump = vi.fn();
    const { getByLabelText } = render(<ArtJumpButton onJump={onJump} />);
    fireEvent.click(getByLabelText('Jump'));
    fireEvent.click(getByLabelText('Jump'));
    expect(onJump).toHaveBeenCalledTimes(2);
  });

  it('draws the button’s first face while it is not pressed', () => {
    wear();
    render(<ArtJumpButton onJump={() => {}} />);
    const first = asked.at(-1)!;
    expect(first.only).toEqual(['animJump']);
    expect(first.frames).toEqual({ animJump: 0 });
  });

  it('wears its second face for a moment after a press, and then goes back', () => {
    vi.useFakeTimers();
    wear();
    const { getByLabelText } = render(<ArtJumpButton onJump={() => {}} />);
    fireEvent.click(getByLabelText('Jump'));
    expect(asked.at(-1)!.frames).toEqual({ animJump: 1 });
    act(() => {
      vi.advanceTimersByTime(PRESS_MS + 1);
    });
    expect(asked.at(-1)!.frames).toEqual({ animJump: 0 });
  });

  it('tells the spell bar how much of the corner it takes, and gives it back when it goes', () => {
    wear();
    const { unmount } = render(<ArtJumpButton onJump={() => {}} />);
    // Unit size is the player's setting; the frame stands 70 units off the bottom.
    expect(jumpRoom.value).toBeGreaterThan(0);
    unmount();
    expect(jumpRoom.value).toBe(0);
  });
});
