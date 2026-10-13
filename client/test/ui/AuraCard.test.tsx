/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:card', width: 400, height: 400 }),
}));

import { AuraCard } from '../../src/ui/components/AuraCard';
import {
  auraCancel,
  auraCard,
  clearAura,
  clearAuras,
  setAura,
  toggleAuraCard,
} from '../../src/ui/auraStore';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';
import { setSpellName } from '../../src/gameplay/SpellBook';
import { setSpellText } from '../../src/ui/inventoryStore';

let clock = 0;

beforeEach(() => {
  vi.useFakeTimers();
  clock = 100_000;
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  setSpellName(9000, 'Sample Ward');
  setSpellText(9000, 'Wards the sample.');
  setAura('1', {
    spellId: 9000,
    casterId: 2,
    harmful: false,
    stacks: 1,
    remainingMs: 65_000,
    durationMs: 65_000,
  });
});

afterEach(() => {
  cleanup();
  clearAuras();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const open = () => toggleAuraCard({ unitKey: '1', spellId: 9000, at: { x: 10, y: 10 } });

describe('AuraCard, without a movie', () => {
  it('draws nothing while no aura’s card is open', () => {
    const { container } = render(<AuraCard />);
    expect(container.innerHTML).toBe('');
  });

  it('says the aura’s name, what it does, and the time left', () => {
    open();
    const { getByRole } = render(<AuraCard />);
    const card = getByRole('dialog', { name: 'Sample Ward' });
    expect(card.textContent).toContain('Wards the sample.');
    expect(card.textContent).toContain('1:05');
  });

  it('counts the time left down while it is open', () => {
    open();
    const { getByRole } = render(<AuraCard />);
    act(() => {
      clock += 6_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(getByRole('dialog').textContent).toContain('0:59');
  });

  it('goes away when the aura ends', () => {
    open();
    const { queryByRole } = render(<AuraCard />);
    act(() => clearAura('1', 9000));
    expect(queryByRole('dialog')).toBeNull();
    expect(auraCard.value).toBeNull();
  });

  it('goes away when its time runs out', () => {
    open();
    const { queryByRole } = render(<AuraCard />);
    act(() => {
      clock += 65_000;
      vi.advanceTimersByTime(1_000);
    });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('goes away on a press elsewhere, and stays for a press on an aura’s icon', () => {
    open();
    const { getByRole, queryByRole, container } = render(
      <>
        <button type="button" data-aura-icon="9000">
          icon
        </button>
        <AuraCard />
      </>,
    );
    act(() => {
      fireEvent.pointerDown(container.querySelector('[data-aura-icon]')!);
    });
    expect(getByRole('dialog')).toBeTruthy();
    act(() => {
      fireEvent.pointerDown(document.body);
    });
    expect(queryByRole('dialog')).toBeNull();
  });
});

describe('AuraCard, in the movie', () => {
  /** The card's sheet with the confirm strip parked below it, as the talent card has. */
  const skin = (): UiSkinData => {
    const box = (id: number, w: number, h: number) => ({
      id,
      bounds: { x: 0, y: 0, w: w * 20, h: h * 20 },
      fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
      paths: [{ fill: 1, d: `M0 0L${w * 20} 0L${w * 20} ${h * 20}L0 ${h * 20}Z` }],
    });
    const at = (id: number, x: number, y: number, name: string, opacity = 1) => ({
      depth: id,
      characterId: id,
      matrix: { a: 1, b: 0, c: 0, d: 1, tx: x * 20, ty: y * 20 },
      opacity,
      name,
    });
    return {
      movie: 'TEST',
      width: 200,
      height: 300,
      background: null,
      exports: [],
      shapes: [box(11, 100, 100), box(12, 80, 20)],
      sprites: [
        { id: 22, frameCount: 1, frames: [[at(12, 0, 0, 'btnConfirm')]] },
        { id: 21, frameCount: 1, frames: [[{ ...at(22, 0, 0, 'panelConfirm'), characterId: 22 }]] },
        {
          id: 20,
          frameCount: 1,
          frames: [
            [at(11, 0, 0, 'sheet'), { ...at(21, 10, 110, 'panelAddPoint', 0), characterId: 21 }],
          ],
        },
      ],
      edits: [],
      root: [[{ ...at(20, 0, 0, 'theCard'), characterId: 20 }]],
    } as unknown as UiSkinData;
  };

  const spec = {
    screens: {
      auraCard: {
        dialog: 'theCard',
        frame: ['sheet'],
        card: {
          title: 'sheet',
          body: 'sheet',
          actions: {
            cancel: {
              strip: 'panelAddPoint/panelConfirm',
              control: 'panelAddPoint/panelConfirm/btnConfirm',
              says: 'Cancel',
            },
          },
        },
        hidden: ['panelAddPoint'],
      },
    },
  };

  afterEach(() => {
    clearMovies();
    uiSpec.value = null;
    auraCancel.value = () => null;
  });

  it('offers to take off an aura the player may, and does so', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    const takeOff = vi.fn();
    auraCancel.value = (unitKey, spellId) => (unitKey === '1' && spellId === 9000 ? takeOff : null);
    open();
    const { getByRole } = render(<AuraCard />);
    fireEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(takeOff).toHaveBeenCalled();
    expect(auraCard.value).toBeNull();
  });

  it('offers nothing for an aura the player may not take off', () => {
    uiSpec.value = spec;
    setMovie({ skin: skin(), art: new Map() });
    open();
    const { queryByRole } = render(<AuraCard />);
    expect(queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
});
