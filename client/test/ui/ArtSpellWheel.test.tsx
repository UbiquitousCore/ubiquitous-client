/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

const asked: Array<{
  frames?: Record<string, number>;
  only?: string | readonly string[];
  hidden?: readonly string[];
}> = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:ring', width: 100, height: 100 }),
}));
vi.mock('../../src/ui/iconUrl', () => ({ iconUrl: () => 'blob:icon' }));
vi.mock('../../src/ui/art/piecePlan', async actual => {
  const real = await actual<typeof import('../../src/ui/art/piecePlan')>();
  return {
    ...real,
    planPiece: (...args: Parameters<typeof real.planPiece>) => {
      if (args[1] === 'ring' && args[2]) asked.push(args[2]);
      return real.planPiece(...args);
    },
  };
});

import { setSpellIcon, setSpellName } from '../../src/gameplay/SpellBook';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import { ArtSpellWheel } from '../../src/ui/components/ArtSpellWheel';
import type { ArtSpellWheelProps } from '../../src/ui/components/ArtSpellWheel';
import { spellDragOver } from '../../src/ui/components/spellDrag';
import { WHEEL_SPEC, spellBarMovie } from '../helpers/spellBarMovie';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  asked.length = 0;
  cleanup();
  clearMovies();
  uiSpec.value = null;
  spellDragOver.value = null;
});

function props(over: Partial<ArtSpellWheelProps> = {}): ArtSpellWheelProps {
  return {
    spells: [101, null],
    firstSlot: 20,
    cooldowns: new Map(),
    globalCooldown: null,
    castingSpellId: null,
    onCast: () => {},
    ...over,
  };
}

function wear(): void {
  uiSpec.value = { screens: { spellWheel: WHEEL_SPEC } };
  setMovie({ skin: spellBarMovie(), art: new Map() });
  setSpellName(101, 'Sample Bolt');
}

const wheel = (container: Element) => container.querySelector<HTMLElement>('[data-spell-wheel]')!;

describe('ArtSpellWheel', () => {
  it('draws nothing until the shipped ring has arrived', () => {
    const { container } = render(<ArtSpellWheel {...props()} />);
    expect(container.innerHTML).toBe('');
  });

  it('puts a press area on each slot, numbered from the first the ring is dropped on', () => {
    wear();
    const { container } = render(<ArtSpellWheel {...props()} />);
    const slots = [...container.querySelectorAll<HTMLElement>('[data-spell-slot]')];
    expect(slots.map(slot => slot.dataset.spellSlot)).toEqual(['20', '21']);
    expect(slots.map(slot => slot.getAttribute('aria-label'))).toEqual([
      'Sample Bolt',
      'Empty ring slot 2',
    ]);
  });

  it('lays a plain disc over an empty slot, so no swirl shows, and none over a slot with a spell', () => {
    wear();
    setSpellIcon(101, {} as ImageBitmap);
    const { container } = render(<ArtSpellWheel {...props()} />);
    expect(container.querySelector('[data-wheel-empty="1"]')).not.toBeNull();
    expect(container.querySelector('[data-wheel-empty="0"]')).toBeNull();
  });

  it('casts what is in a slot when it is pressed, and nothing from an empty one', () => {
    wear();
    const onCast = vi.fn();
    const { getByLabelText } = render(<ArtSpellWheel {...props({ onCast })} />);
    fireEvent.click(getByLabelText('Empty ring slot 2'));
    fireEvent.click(getByLabelText('Sample Bolt'));
    expect(onCast.mock.calls).toEqual([[101]]);
  });

  it('casts nothing from a slot that is cooling, and sweeps it', () => {
    wear();
    const onCast = vi.fn();
    const { getByLabelText } = render(
      <ArtSpellWheel
        {...props({ onCast, cooldowns: new Map([[101, { remaining: 500, total: 1000 }]]) })}
      />,
    );
    fireEvent.click(getByLabelText('Sample Bolt'));
    expect(onCast).not.toHaveBeenCalled();
    expect(asked.some(states => states.frames?.['spellpanel/skill01/cooldown'] === 1)).toBe(true);
  });

  it('glows the slot a dragged spell is over', () => {
    wear();
    spellDragOver.value = 21;
    render(<ArtSpellWheel {...props()} />);
    expect(asked.at(-1)?.only).toContain('spellpanel/effect02/autoAttack');
  });

  it('turns when it is dragged, settles on a slot, and does not cast from the press that turned it', () => {
    vi.useFakeTimers();
    wear();
    setSpellIcon(101, {} as ImageBitmap);
    const onCast = vi.fn();
    const { container, getByLabelText } = render(<ArtSpellWheel {...props({ onCast })} />);
    const slot = getByLabelText('Sample Bolt');
    fireEvent.pointerDown(slot, { clientX: 100, clientY: 0, button: 0 });
    fireEvent.pointerMove(slot, { clientX: 100, clientY: 40, button: 0 });
    expect(wheel(container).style.transform).toMatch(/rotate\(/);
    expect(wheel(container).style.transform).not.toBe('rotate(0rad)');
    fireEvent.pointerUp(slot, { clientX: 100, clientY: 40, button: 0 });
    fireEvent.click(slot);
    expect(onCast).not.toHaveBeenCalled();
    // The icon is turned back so it stays upright.
    const icon = container.querySelector<HTMLElement>('[data-wheel-icon="0"]')!;
    const turn = Number(/rotate\((-?[\d.e-]+)rad\)/.exec(wheel(container).style.transform)![1]);
    expect(icon.style.transform).toBe(`rotate(${-turn}rad)`);
    // The next plain press casts.
    vi.runAllTimers();
    fireEvent.click(slot);
    expect(onCast).toHaveBeenCalledWith(101);
    vi.useRealTimers();
  });

  it('does not turn for a press that stays where it is', () => {
    wear();
    const { container, getByLabelText } = render(<ArtSpellWheel {...props()} />);
    const slot = getByLabelText('Sample Bolt');
    fireEvent.pointerDown(slot, { clientX: 100, clientY: 0, button: 0 });
    fireEvent.pointerMove(slot, { clientX: 102, clientY: 1, button: 0 });
    fireEvent.pointerUp(slot, { clientX: 102, clientY: 1, button: 0 });
    expect(wheel(container).style.transform).toBe('rotate(0rad)');
  });
});
