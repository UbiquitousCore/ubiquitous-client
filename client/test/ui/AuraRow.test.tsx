/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The names of the parts in every picture drawn, one list per picture. */
const drawn: string[][] = [];
vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: (plan: { parts: Array<{ path: string }> }) => {
    drawn.push(plan.parts.map(part => part.path));
    return { url: 'blob:aura', width: 30, height: 30 };
  },
}));

import { AuraRow, auraIconStates } from '../../src/ui/components/AuraRow';
import { auraCard, clearAuras } from '../../src/ui/auraStore';
import type { Aura } from '../../src/ui/auraStore';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

afterEach(() => {
  drawn.length = 0;
  cleanup();
  clearMovies();
  clearAuras();
  uiSpec.value = null;
});

const buff: Aura = {
  spellId: 9000,
  casterId: 1,
  harmful: false,
  stacks: 1,
  durationMs: 20_000,
  endsAt: null,
};
const debuff: Aura = { ...buff, spellId: 9002, harmful: true, stacks: 3 };

describe('AuraRow, without a movie', () => {
  it('draws nothing for a unit carrying no auras', () => {
    const { container } = render(<AuraRow unitKey="1" auras={[]} />);
    expect(container.querySelector('[role="list"]')).toBeNull();
  });

  it('draws one pressable icon per aura', () => {
    const { getAllByRole } = render(<AuraRow unitKey="1" auras={[buff, debuff]} />);
    expect(getAllByRole('listitem')).toHaveLength(2);
    expect(getAllByRole('listitem').every(one => one.tagName === 'BUTTON')).toBe(true);
  });

  it('says which are harmful and how many stacks they hold', () => {
    const { getByLabelText } = render(<AuraRow unitKey="1" auras={[buff, debuff]} />);
    expect(getByLabelText('Spell 9000')).toBeTruthy();
    expect(getByLabelText('Spell 9002, harmful, 3 stacks')).toBeTruthy();
  });

  it('writes a stack count only past one stack', () => {
    const { container } = render(<AuraRow unitKey="1" auras={[buff, debuff]} />);
    const [first, second] = [...container.querySelectorAll('[data-aura-icon]')];
    expect(first!.textContent).toBe('');
    expect(second!.textContent).toBe('3');
  });

  it('leaves out an aura whose time has run out', () => {
    const { getAllByRole } = render(
      <AuraRow unitKey="1" auras={[buff, { ...debuff, endsAt: 0 }]} />,
    );
    expect(getAllByRole('listitem')).toHaveLength(1);
  });

  it('opens the pressed aura’s card, without the press reaching what holds the row', () => {
    const behind = vi.fn();
    const { getByLabelText } = render(
      <div onClick={behind}>
        <AuraRow unitKey="7" auras={[buff, debuff]} />
      </div>,
    );
    fireEvent.click(getByLabelText('Spell 9002, harmful, 3 stacks'));
    expect(auraCard.value).toMatchObject({ unitKey: '7', spellId: 9002 });
    expect(behind).not.toHaveBeenCalled();
  });
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (
  characterId: number,
  matrix: UiSkinPlaced['matrix'],
  name: string,
): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix,
  name,
  opacity: 1,
});

/** The movie's aura spot: two rims, the picture's point, a badge and its count. */
function skin(): UiSkinData {
  return {
    movie: 'TEST',
    width: 300,
    height: 300,
    background: null,
    exports: [],
    shapes: [
      {
        id: 11,
        bounds: { x: 0, y: 0, w: 30, h: 30 },
        fills: [{ kind: 'solid', css: 'rgb(1, 2, 3)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L30 0L30 30L0 30Z' }],
      },
      {
        id: 12,
        bounds: { x: 0, y: 0, w: 10, h: 10 },
        fills: [{ kind: 'solid', css: 'rgb(4, 5, 6)', opacity: 1 }],
        paths: [{ fill: 1, d: 'M0 0L10 0L10 10L0 10Z' }],
      },
    ],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(11, at(0, 0), 'outer_light_debuff'),
            place(11, at(0, 0), 'outer_light'),
            place(12, at(2, 2), 'displaycallback'),
            place(12, at(18, 18), 'bgCount'),
            place(12, at(18, 18), 'textCount'),
          ],
        ],
      },
      { id: 21, frameCount: 1, frames: [[place(20, at(0, 0), 'btnTopBuff')]] },
    ],
    edits: [],
    root: [[place(21, at(0, 0), 'DlgBuff')]],
  };
}

const spec = {
  screens: {
    auraIcon: {
      dialog: 'DlgBuff',
      frame: 'btnTopBuff',
      groups: {
        picture: 'btnTopBuff/displaycallback',
        buff: 'btnTopBuff/outer_light',
        debuff: 'btnTopBuff/outer_light_debuff',
        badge: 'btnTopBuff/bgCount',
      },
      values: { stacks: 'btnTopBuff/textCount' },
    },
  },
};

describe('auraIconStates', () => {
  it('shows a buff’s rim and hides a debuff’s, and the badge on one stack', () => {
    expect(auraIconStates(buff, spec.screens.auraIcon)).toEqual({
      hidden: ['btnTopBuff/outer_light_debuff', 'btnTopBuff/bgCount', 'btnTopBuff/textCount'],
      shown: ['btnTopBuff/outer_light'],
    });
  });

  it('shows a debuff’s rim and its badge once it stacks', () => {
    expect(auraIconStates(debuff, spec.screens.auraIcon)).toEqual({
      hidden: ['btnTopBuff/outer_light'],
      shown: ['btnTopBuff/outer_light_debuff'],
    });
  });
});

describe('AuraRow, wearing the movie', () => {
  it('draws each aura on the movie’s spot, in the rim for its kind', () => {
    uiSpec.value = spec as never;
    setMovie({ skin: skin(), art: new Map() });
    const { getAllByRole } = render(<AuraRow unitKey="1" auras={[buff, debuff]} />);
    expect(getAllByRole('listitem')).toHaveLength(2);
    const pictures = drawn.map(parts => parts.join(' '));
    expect(
      pictures.some(one => one.includes('outer_light') && !one.includes('outer_light_debuff')),
    ).toBe(true);
    expect(pictures.some(one => one.includes('outer_light_debuff'))).toBe(true);
  });
});
