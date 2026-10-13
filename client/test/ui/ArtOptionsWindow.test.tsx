/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:options', width: 240, height: 320 }),
}));

import { ArtOptionsWindow } from '../../src/ui/components/ArtOptionsWindow';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies, resetOptions } from '../helpers/stores';
import { options } from '../../src/ui/optionsStore';
import { setSessionActions } from '../../src/ui/sessionStore';

afterEach(() => {
  resetOptions();
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

const at = (tx: number, ty: number): UiSkinPlaced['matrix'] => ({ a: 1, b: 0, c: 0, d: 1, tx, ty });
const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: at(x, y),
  name,
  opacity: 1,
});

/**
 * A page with a window cut in it, and a column of one switch standing a
 * little right of and below the window's corner.
 */
function skin(): UiSkinData {
  const bar = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w, h },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
  });
  return {
    movie: 'TEST',
    width: 480,
    height: 320,
    background: null,
    exports: [],
    shapes: [bar(11, 200, 200), bar(12, 100, 100), bar(13, 50, 20)],
    sprites: [
      { id: 20, frameCount: 1, frames: [[place(13, 0, 0, 'btnFirst')]] },
      {
        id: 24,
        frameCount: 1,
        frames: [
          [place(11, 0, 0, 'btnempty'), place(12, 20, 20, 'window'), place(20, 30, 45, 'column')],
        ],
      },
    ],
    edits: [],
    root: [[place(24, 0, 0, 'dlgPage')]],
  };
}

describe('ArtOptionsWindow', () => {
  it('stands the column where the movie stands it inside its window', () => {
    uiSpec.value = {
      screens: {
        options: {
          dialog: 'dlgPage',
          frame: 'btnempty',
          panels: { scroll: 'column', window: 'window' },
          actions: { 'column/btnFirst': 'music' },
        },
      },
    };
    setMovie({ skin: skin(), art: new Map() });
    const { container } = render(<ArtOptionsWindow onClose={() => {}} />);
    const column = container.querySelector<HTMLElement>('.will-change-transform');
    expect(column?.style.left).toBe('10%');
    expect(column?.style.top).toBe('25%');
  });

  it('adds a row below the last switch for each setting the column has no switch for', () => {
    // Two switch rows, 30 units apart, each with the field its words go in.
    const rows = skin();
    rows.edits = [
      {
        id: 30,
        bounds: { x: 0, y: 0, w: 80, h: 16 },
        varName: '',
        sampleHtml: '',
        sizePx: 12,
        color: null,
        face: null,
      },
    ];
    rows.sprites[0]!.frames[0] = [
      place(13, 0, 0, 'btnFirst'),
      place(30, 60, 0, 'textFirst'),
      place(13, 0, 30, 'btnSecond'),
      place(30, 60, 30, 'textSecond'),
    ];
    uiSpec.value = {
      screens: {
        options: {
          dialog: 'dlgPage',
          frame: 'btnempty',
          panels: { scroll: 'column', window: 'window' },
          actions: { 'column/btnFirst': 'music', 'column/btnSecond': 'sound' },
          values: { music: 'column/textFirst', sound: 'column/textSecond' },
        },
      },
    };
    setMovie({ skin: rows, art: new Map() });
    const { container } = render(<ArtOptionsWindow onClose={() => {}} />);
    const extra = (what: string) =>
      container.querySelector<HTMLButtonElement>(`[data-extra-setting="${what}"]`);
    const fog = extra('fog');
    const tone = extra('toneMapping');
    // A page with no slider to lay across the row steps the fog instead.
    expect(fog?.getAttribute('aria-label')).toBe('Fog: 100%');
    expect(tone?.getAttribute('aria-label')).toBe('Tone mapping: None (as painted)');
    // In order, one row-height apart, below the column's own last row.
    const topOf = (el: HTMLElement | null) => parseFloat(el?.style.top ?? 'NaN');
    const second = container.querySelector<HTMLButtonElement>('[aria-label="Sound effects"]');
    expect(topOf(fog)).toBeGreaterThan(topOf(second));
    expect(topOf(tone) - topOf(fog)).toBeCloseTo(topOf(fog) - topOf(second), 5);
    fog!.click();
    expect(options.value.fog).toBe(0);
    tone!.click();
    expect(options.value.toneMapping).toBe('aces');
  });

  it('gives no extra row to a setting the column has a switch for', () => {
    const rows = skin();
    rows.edits = [
      {
        id: 30,
        bounds: { x: 0, y: 0, w: 80, h: 16 },
        varName: '',
        sampleHtml: '',
        sizePx: 12,
        color: null,
        face: null,
      },
    ];
    rows.sprites[0]!.frames[0] = [
      place(13, 0, 0, 'btnFirst'),
      place(30, 60, 0, 'textFirst'),
      place(13, 0, 30, 'btnSecond'),
      place(30, 60, 30, 'textSecond'),
    ];
    uiSpec.value = {
      screens: {
        options: {
          dialog: 'dlgPage',
          frame: 'btnempty',
          panels: { scroll: 'column', window: 'window' },
          actions: { 'column/btnFirst': 'music', 'column/btnSecond': 'diagnostics' },
          values: { music: 'column/textFirst', diagnostics: 'column/textSecond' },
        },
      },
    };
    setMovie({ skin: rows, art: new Map() });
    const { container } = render(<ArtOptionsWindow onClose={() => {}} />);
    expect(container.querySelector('[data-extra-setting="diagnostics"]')).toBeNull();
    expect(container.querySelector('[data-extra-setting="toneMapping"]')).not.toBeNull();
    expect(container.querySelectorAll('[aria-label="Diagnostics overlay"]')).toHaveLength(1);
  });

  it('binds a key from its own row: the next key pressed, and Escape leaves it', () => {
    const rows = skin();
    rows.edits = [
      {
        id: 30,
        bounds: { x: 0, y: 0, w: 80, h: 16 },
        varName: '',
        sampleHtml: '',
        sizePx: 12,
        color: null,
        face: null,
      },
    ];
    rows.sprites[0]!.frames[0] = [
      place(13, 0, 0, 'btnFirst'),
      place(30, 60, 0, 'textFirst'),
      place(13, 0, 30, 'btnSecond'),
      place(30, 60, 30, 'textSecond'),
    ];
    uiSpec.value = {
      screens: {
        options: {
          dialog: 'dlgPage',
          frame: 'btnempty',
          panels: { scroll: 'column', window: 'window' },
          actions: { 'column/btnFirst': 'music', 'column/btnSecond': 'sound' },
          values: { music: 'column/textFirst', sound: 'column/textSecond' },
        },
      },
    };
    setMovie({ skin: rows, art: new Map() });
    const { container } = render(<ArtOptionsWindow onClose={() => {}} />);
    const row = (action: string) =>
      container.querySelector<HTMLButtonElement>(`[data-extra-setting="key:${action}"]`)!;

    // Below the client's own rows, one per action.
    const topOf = (el: HTMLElement) => parseFloat(el.style.top);
    const tone = container.querySelector<HTMLButtonElement>('[data-extra-setting="toneMapping"]')!;
    expect(topOf(row('forward'))).toBeGreaterThan(topOf(tone));
    expect(row('forward').getAttribute('aria-label')).toBe('Walk forward: W, ↑');

    fireEvent.click(row('forward'));
    expect(row('forward').getAttribute('aria-label')).toBe('Walk forward: Press a key…');
    expect(row('forward').getAttribute('aria-pressed')).toBe('true');
    const walked = vi.fn();
    window.addEventListener('keydown', walked);
    fireEvent.keyDown(row('forward'), { key: 'I' });
    window.removeEventListener('keydown', walked);
    expect(options.value.keybinds.forward).toEqual(['i']);
    // The key went to the binding, not to the game.
    expect(walked).not.toHaveBeenCalled();
    expect(row('forward').getAttribute('aria-label')).toBe('Walk forward: I');

    fireEvent.click(row('jump'));
    fireEvent.keyDown(row('jump'), { key: 'Escape' });
    expect(options.value.keybinds.jump).toEqual([' ']);
    expect(row('jump').getAttribute('aria-label')).toBe('Jump: Space');
  });

  describe('the page it opens on', () => {
    /** The page above, with a main page beside the column holding two buttons. */
    function withMainPage(): UiSkinData {
      const base = skin();
      base.sprites.push({
        id: 30,
        frameCount: 1,
        frames: [[place(13, 0, 0, 'buttonGameSetting'), place(13, 0, 40, 'buttonCharacterList')]],
      });
      base.sprites[1]!.frames[0]!.push(place(30, 60, 60, 'mainPage'));
      return base;
    }
    const spec = {
      dialog: 'dlgPage',
      frame: 'btnempty',
      panels: { scroll: 'column', window: 'window', main: 'mainPage' },
      actions: {
        'column/btnFirst': 'music',
        'mainPage/buttonGameSetting': 'gameSettings',
        'mainPage/buttonCharacterList': 'characterList',
      },
    };

    it('opens on the main page, and its settings button leads to the settings', () => {
      uiSpec.value = { screens: { options: spec } };
      setMovie({ skin: withMainPage(), art: new Map() });
      const { container, getByRole } = render(<ArtOptionsWindow onClose={() => {}} />);
      expect(container.querySelector('.will-change-transform')).toBeNull();

      fireEvent.click(getByRole('button', { name: 'gameSettings' }));
      expect(container.querySelector('.will-change-transform')).not.toBeNull();
    });

    it('goes back to the character list from its button, and closes', () => {
      const backToCharacterList = vi.fn();
      setSessionActions({ backToCharacterList, backToMainMenu: vi.fn() });
      uiSpec.value = { screens: { options: spec } };
      setMovie({ skin: withMainPage(), art: new Map() });
      const onClose = vi.fn();
      const { getByRole } = render(<ArtOptionsWindow onClose={onClose} />);

      fireEvent.click(getByRole('button', { name: 'characterList' }));
      expect(backToCharacterList).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
