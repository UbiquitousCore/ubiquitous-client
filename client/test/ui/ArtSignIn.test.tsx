/** @vitest-environment happy-dom */
/**
 * Signing in on the build's own panel: what it hands the game, and the
 * account name it keeps for next time — never the password.
 */

import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:sign-in', width: 200, height: 200 }),
}));

import { ArtSignIn } from '../../src/ui/frontend/ArtSignIn';
import { REMEMBERED_ACCOUNT_KEY } from '../../src/ui/frontend/rememberedAccount';
import { notice, setFrontEndActions } from '../../src/ui/frontend/frontEndStore';
import type { FrontEndActions } from '../../src/ui/frontend/frontEndStore';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y },
  name,
  opacity: 1,
});

/** A backing with two fields, a button, and the remember control with its cross. */
function skin(): UiSkinData {
  const bar = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w, h },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
  });
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [bar(11, 200, 200), bar(12, 100, 20)],
    sprites: [
      {
        id: 20,
        frameCount: 1,
        frames: [
          [
            place(11, 0, 0, 'back'),
            place(12, 10, 10, 'btnAccount'),
            place(12, 10, 40, 'btnPassword'),
            place(12, 10, 70, 'btnRemember'),
            place(12, 10, 70, 'radioRemember'),
            place(12, 10, 100, 'btnLogin'),
          ],
        ],
      },
    ],
    edits: [],
    root: [[place(20, 0, 0, 'login_panel')]],
  };
}

const spec = {
  screens: {
    signIn: {
      dialog: 'login_panel',
      frame: 'back',
      edits: { btnAccount: { holds: 'account' }, btnPassword: { holds: 'password' } },
      actions: { btnLogin: 'signIn', btnRemember: 'remember' },
      panels: { remembered: 'radioRemember' },
    },
  },
};

let signIn: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  notice.value = '';
  signIn = vi.fn(async () => {});
  setFrontEndActions({ signIn } as Partial<FrontEndActions> as FrontEndActions);
  uiSpec.value = spec;
  setMovie({ skin: skin(), art: new Map() });
});

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
  localStorage.clear();
});

function open() {
  const view = render(<ArtSignIn />);
  const type = (label: string, value: string) =>
    fireEvent.input(view.getByLabelText(label), { target: { value } });
  return { ...view, type, signIn: () => fireEvent.click(view.getByLabelText('Sign in')) };
}

describe('signing in on the build’s panel', () => {
  it('hands the game exactly what was typed', () => {
    const view = open();
    view.type('Account', ' Ayla ');
    view.type('Password', 'p@ss word');
    view.signIn();
    expect(signIn).toHaveBeenCalledWith(' Ayla ', 'p@ss word');
  });

  it('asks for an account name rather than sending an empty one', () => {
    const view = open();
    view.type('Password', 'secret');
    view.signIn();
    expect(signIn).not.toHaveBeenCalled();
    expect(notice.value).toBe('An account name is needed.');
  });
});

describe('remembering the account', () => {
  it('keeps the account name, and never the password, when asked to', () => {
    const view = open();
    fireEvent.click(view.getByLabelText('Remember me'));
    view.type('Account', 'Ayla');
    view.type('Password', 'secret');
    view.signIn();
    expect(localStorage.getItem(REMEMBERED_ACCOUNT_KEY)).toBe('Ayla');
    expect(JSON.stringify({ ...localStorage })).not.toContain('secret');
  });

  it('fills the remembered name in next time, with remembering still on', () => {
    localStorage.setItem(REMEMBERED_ACCOUNT_KEY, 'Ayla');
    const view = open();
    expect((view.getByLabelText('Account') as HTMLInputElement).value).toBe('Ayla');
    expect(view.getByLabelText('Remember me').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps nothing when not asked to', () => {
    const view = open();
    view.type('Account', 'Ayla');
    view.signIn();
    expect(localStorage.getItem(REMEMBERED_ACCOUNT_KEY)).toBeNull();
  });

  it('forgets the name the moment remembering is turned off', () => {
    localStorage.setItem(REMEMBERED_ACCOUNT_KEY, 'Ayla');
    const view = open();
    fireEvent.click(view.getByLabelText('Remember me'));
    expect(localStorage.getItem(REMEMBERED_ACCOUNT_KEY)).toBeNull();
  });
});
