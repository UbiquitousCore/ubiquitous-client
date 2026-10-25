/** @vitest-environment happy-dom */
/**
 * The fallback screens: what a build without its own panels hands the
 * game, and the mark that tells its plain windows from the game's art.
 */

import { cleanup, fireEvent, render } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FallbackCharacters } from '../../src/ui/fallback/FallbackCharacters';
import { FallbackMakeCharacter } from '../../src/ui/fallback/FallbackMakeCharacter';
import { FallbackSignIn } from '../../src/ui/fallback/FallbackSignIn';
import {
  busy,
  draft,
  notice,
  setCharacters,
  setFrontEndActions,
  setKinds,
  setLooks,
  setStage,
  stage,
  startDraft,
  type DraftCharacter,
} from '../../src/ui/frontend/frontEndStore';
import type { FrontEndActions } from '../../src/ui/frontend/frontEndStore';
import type { CharacterSummary } from '../../src/net/GameConnection';

function actions(over: Partial<FrontEndActions> = {}): FrontEndActions {
  const base: FrontEndActions = {
    signIn: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined),
    choose: vi.fn(async () => undefined),
    remove: vi.fn(async () => undefined),
    signOut: vi.fn(),
    cancelSignIn: vi.fn(),
    celebrate: vi.fn(),
    preview: vi.fn(),
    askOutfit: vi.fn(),
    wantPortrait: vi.fn(),
    stageCanvas: vi.fn(),
    turnBody: vi.fn(),
    releaseBody: vi.fn(),
    watchGround: vi.fn(),
  };
  setFrontEndActions({ ...base, ...over });
  return { ...base, ...over };
}

function reset() {
  cleanup();
  setStage('signIn');
  setCharacters([]);
  setKinds({ races: [], classes: [] });
  setLooks({ skins: [], faces: [], hairStyles: [], bareHairStyles: [], hairColours: [] });
  startDraft(0, 0);
  notice.value = '';
  busy.value = false;
  try {
    globalThis.localStorage?.clear();
  } catch {
    // No storage in this environment; the form works without it.
  }
}

beforeEach(reset);
afterEach(reset);

describe('FallbackSignIn', () => {
  it('is marked as fallback, never as the game art', () => {
    const { container } = render(<FallbackSignIn />);
    const form = container.querySelector('form')!;
    expect(form.getAttribute('data-fallback')).not.toBeNull();
    expect(form.getAttribute('data-screen')).toBe('sign-in');
  });

  it('hands the typed account and password to the game', () => {
    const run = actions();
    const { getByLabelText, getByRole } = render(<FallbackSignIn />);
    fireEvent.input(getByLabelText('Account'), { target: { value: 'ayla' } });
    fireEvent.input(getByLabelText('Password'), { target: { value: 's3cret' } });
    fireEvent.click(getByRole('button', { name: 'Sign in' }));
    expect(run.signIn).toHaveBeenCalledWith('ayla', 's3cret');
  });

  it('asks for an account name instead of signing in empty', () => {
    const run = actions();
    const { getByRole } = render(<FallbackSignIn />);
    fireEvent.click(getByRole('button', { name: 'Sign in' }));
    expect(run.signIn).not.toHaveBeenCalled();
    expect(notice.value).toMatch(/account name/i);
  });
});

describe('FallbackCharacters', () => {
  it('enters, deletes on a second press, makes, and signs out', () => {
    const run = actions();
    setCharacters([
      {
        guid: 'g-ayla',
        name: 'Ayla',
        level: 4,
        race: 1,
        class: 1,
      } as CharacterSummary,
    ]);
    const { getByText, getAllByRole } = render(<FallbackCharacters />);
    expect(getByText('Ayla · 4')).toBeDefined();

    fireEvent.click(getByText('Enter'));
    expect(run.choose).toHaveBeenCalledWith('Ayla');

    const remove = getByText('Delete');
    fireEvent.click(remove);
    expect(run.remove).not.toHaveBeenCalled();
    fireEvent.click(getByText('Sure?'));
    expect(run.remove).toHaveBeenCalledWith('Ayla');

    fireEvent.click(getByText('New'));
    expect(stage.value).toBe('race');
    expect(draft.value.race).toBe(0);

    fireEvent.click(getByText('Sign out'));
    expect(run.signOut).toHaveBeenCalled();
    expect(getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('FallbackMakeCharacter', () => {
  function stock() {
    setKinds({
      races: [
        { race: 1, maleDisplayInfoId: 0, femaleDisplayInfoId: 0, nameTextId: 0, name: 'Elf' },
        { race: 2, maleDisplayInfoId: 0, femaleDisplayInfoId: 0, nameTextId: 0, name: null },
      ],
      classes: [{ playerClass: 3 }, { playerClass: 4 }],
    });
    setLooks({
      skins: [7],
      faces: [8],
      hairStyles: [9],
      bareHairStyles: [],
      hairColours: [10],
    });
    startDraft(1, 0);
  }

  it('walks race, class, look and name to creation', () => {
    const run = actions();
    stock();

    setStage('race');
    const race = render(<FallbackMakeCharacter />);
    fireEvent.click(race.getByText('Race 2'));
    fireEvent.click(race.getByText('Continue'));
    expect(stage.value).toBe('class');
    cleanup();

    setStage('class');
    const cls = render(<FallbackMakeCharacter />);
    fireEvent.click(cls.getByText('Class 4'));
    fireEvent.click(cls.getByText('Continue'));
    expect(stage.value).toBe('look');
    expect(draft.value).toMatchObject({ race: 2, playerClass: 4 });
    cleanup();

    setStage('look');
    const look = render(<FallbackMakeCharacter />);
    fireEvent.click(look.getByText('Continue'));
    expect(stage.value).toBe('name');
    expect(draft.value).toMatchObject({
      skin: 7,
      face: 8,
      hairStyle: 9,
      hairColour: 10,
    });
    cleanup();

    setStage('name');
    const naming = render(<FallbackMakeCharacter />);
    fireEvent.input(naming.getByLabelText('Name'), { target: { value: 'Ayla' } });
    fireEvent.click(naming.getByText('Create'));
    expect(run.create).toHaveBeenCalledWith(
      expect.objectContaining({ race: 2, playerClass: 4, name: 'Ayla' } as Partial<DraftCharacter>),
    );
  });

  it('asks for a name instead of creating nameless', () => {
    const run = actions();
    stock();
    setStage('name');
    const { getByText } = render(<FallbackMakeCharacter />);
    fireEvent.click(getByText('Create'));
    expect(run.create).not.toHaveBeenCalled();
    expect(notice.value).toMatch(/name/i);
  });
});
