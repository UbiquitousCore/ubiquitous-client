/** @vitest-environment happy-dom */
/**
 * The screens before the world: the ground they stand on, and the draft
 * they build.
 *
 * The game itself is a stub here — these tests are about the screens, and
 * a screen that only works with a socket behind it is a screen nobody can
 * check.
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrontEnd } from '../../src/ui/frontend/FrontEnd';
import type { DraftCharacter, FrontEndActions } from '../../src/ui/frontend/frontEndStore';
import {
  EMPTY_DRAFT,
  characters,
  draft,
  kinds,
  looks,
  notice,
  setFrontEndActions,
  setStage,
} from '../../src/ui/frontend/frontEndStore';

function stubActions(): FrontEndActions & {
  signIn: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  choose: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
} {
  return {
    signIn: vi.fn(async () => {}),
    create: vi.fn(async () => {}),
    choose: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    preview: vi.fn(),
    askOutfit: vi.fn(),
    stageCanvas: vi.fn(),
    turnBody: vi.fn(),
    releaseBody: vi.fn(),
    watchGround: vi.fn(),
  } as never;
}

let actions = stubActions();

beforeEach(() => {
  actions = stubActions();
  setFrontEndActions(actions);
  characters.value = [];
  kinds.value = { races: [], classes: [] };
  looks.value = { skins: [], faces: [], hairStyles: [], bareHairStyles: [], hairColours: [] };
  draft.value = EMPTY_DRAFT;
  notice.value = '';
  setStage('signIn');
});

afterEach(cleanup);

describe('the ground behind', () => {
  it('is handed over as it mounts and given back as it goes', () => {
    const { unmount } = render(<FrontEnd />);

    expect(actions.stageCanvas).toHaveBeenCalledWith(expect.any(Object));
    unmount();
    expect(actions.stageCanvas).toHaveBeenLastCalledWith(null);
  });

  it('asks nothing of a game that answers nothing, and keeps working', () => {
    // An action nobody filled in must not throw inside an effect: an
    // effect that throws takes every effect queued after it down with
    // it, and the screens lose their pictures, their measurements and the
    // size of their own lettering.
    setFrontEndActions({});
    setStage('characters');

    expect(() => render(<FrontEnd />)).not.toThrow();
  });

  it('watches the whole place while signing in, and the dais once signed in', async () => {
    // The build shows its sign-in panel over the place seen from a
    // distance and moves in on the dais to pick a character. Asking for
    // one view or the other is all the screens do about it.
    setStage('signIn');
    render(<FrontEnd />);
    expect(actions.watchGround).toHaveBeenCalledWith('wide');

    setStage('characters');
    await waitFor(() => expect(actions.watchGround).toHaveBeenLastCalledWith('close'));
  });

  it('turns the body as a pointer is dragged across it', () => {
    const { container } = render(<FrontEnd />);

    const ground = container.querySelector('[data-part="ground"]')!;
    fireEvent.pointerDown(ground, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(ground, { clientX: 140, pointerId: 1 });

    expect(actions.turnBody).toHaveBeenCalledOnce();
    expect(vi.mocked(actions.turnBody).mock.calls[0]![0]).toBeGreaterThan(0);
  });

  it('turns from where a touch is, which reports no movement of its own', () => {
    const { container } = render(<FrontEnd />);

    const ground = container.querySelector('[data-part="ground"]')!;
    fireEvent.pointerDown(ground, { clientX: 200, pointerId: 2, pointerType: 'touch' });
    fireEvent.pointerMove(ground, { clientX: 150, pointerId: 2, pointerType: 'touch' });

    expect(vi.mocked(actions.turnBody).mock.calls.at(-1)![0]).toBeLessThan(0);
  });

  it('does not turn for a pointer that is not pressed', () => {
    const { container } = render(<FrontEnd />);

    const ground = container.querySelector('[data-part="ground"]')!;
    fireEvent.pointerMove(ground, { clientX: 140, pointerId: 1 });

    expect(actions.turnBody).not.toHaveBeenCalled();
  });
});

/** Kept honest: the draft the screens build is the shape the wire wants. */
describe('the draft', () => {
  it('carries numbers only', () => {
    const shape: DraftCharacter = draft.value;
    expect(typeof shape.race).toBe('number');
    expect(typeof shape.gender).toBe('number');
    expect(typeof shape.playerClass).toBe('number');
  });
});
