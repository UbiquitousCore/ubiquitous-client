/** @vitest-environment happy-dom */
/**
 * Choosing and making a character on the build's own screens: what each
 * one asks the game to do.
 */

import { act, cleanup, fireEvent, render, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/art/pieceCanvas', () => ({
  drawPiece: () => ({ url: 'blob:front', width: 200, height: 200 }),
}));

import { ArtChooseCharacter } from '../../src/ui/frontend/ArtChooseCharacter';
import { HOLD_TO_DELETE } from '../../src/ui/frontend/ArtConfirmDelete';
import { ArtMakeCharacter } from '../../src/ui/frontend/ArtMakeCharacter';
import {
  EMPTY_DRAFT,
  characters,
  draft,
  kinds,
  looks,
  notice,
  setFrontEndActions,
  setLooks,
  setStage,
  stage,
} from '../../src/ui/frontend/frontEndStore';
import { setMovie } from '../../src/ui/art/pieceStore';
import { uiSpec } from '../../src/ui/art/uiSpec';
import type { CharacterSummary } from '../../src/net/GameConnection';
import type { UiSkinData, UiSkinPlaced } from '../../src/assets/types';
import { clearMovies } from '../helpers/stores';

const place = (characterId: number, x: number, y: number, name: string): UiSkinPlaced => ({
  depth: 1,
  characterId,
  matrix: { a: 1, b: 0, c: 0, d: 1, tx: x, ty: y },
  name,
  opacity: 1,
});

/** One sprite per screen: a backing, then a control per name, down the page. */
function skin(screens: Record<string, string[]>): UiSkinData {
  const bar = (id: number, w: number, h: number) => ({
    id,
    bounds: { x: 0, y: 0, w, h },
    fills: [{ kind: 'solid' as const, css: 'rgb(1, 2, 3)', opacity: 1 }],
    paths: [{ fill: 1, d: `M0 0L${w} 0L${w} ${h}L0 ${h}Z` }],
  });
  const sprites = Object.values(screens).map((controls, at) => ({
    id: 20 + at,
    frameCount: 1,
    frames: [
      [
        place(11, 0, 0, 'back'),
        ...controls.map((control, row) => place(12, 10, 10 + row * 22, control)),
      ],
    ],
  }));
  return {
    movie: 'TEST',
    width: 400,
    height: 400,
    background: null,
    exports: [],
    shapes: [bar(11, 200, 300), bar(12, 100, 20)],
    sprites,
    edits: [],
    root: [Object.keys(screens).map((dialog, at) => place(20 + at, 0, 0, dialog))],
  };
}

const MOVIE = skin({
  chooseDlg: ['playerbutton01', 'playerbutton02', 'playerbutton03', 'btnEnter', 'btnDelete'],
  askDlg: ['textMsg', 'btnYes', 'btnNo'],
  raceDlg: ['raceslot01', 'raceslot02', 'btnMale', 'btnFemale', 'btnBack', 'btnNext'],
  classDlg: ['btnWarrior', 'btnMage', 'btnBack', 'btnNext'],
  lookDlg: ['btnSkin', 'btnHair', 'btnColour', 'btnFace', 'btnBack', 'btnNext'],
  nameDlg: ['btnName', 'btnBack', 'btnFinish'],
});

const SPEC = {
  screens: {
    characters: {
      dialog: 'chooseDlg',
      frame: 'back',
      grids: { characters: { slot: 'playerbutton' } },
      actions: { btnEnter: 'enter', btnDelete: 'delete' },
    },
    deleteCharacter: {
      dialog: 'askDlg',
      frame: 'back',
      values: { message: 'textMsg' },
      actions: { btnYes: 'confirm', btnNo: 'cancel' },
      words: { prompt: 'Delete %s?' },
    },
    race: {
      dialog: 'raceDlg',
      frame: 'back',
      grids: { races: { slot: 'raceslot' } },
      actions: { btnMale: 'male', btnFemale: 'female', btnBack: 'back', btnNext: 'next' },
    },
    class: {
      dialog: 'classDlg',
      frame: 'back',
      actions: { btnWarrior: 'class:1', btnMage: 'class:8', btnBack: 'back', btnNext: 'next' },
    },
    look: {
      dialog: 'lookDlg',
      frame: 'back',
      actions: {
        btnSkin: 'skin',
        btnHair: 'hairStyle',
        btnColour: 'hairColour',
        btnFace: 'face',
        btnBack: 'back',
        btnNext: 'next',
      },
    },
    name: {
      dialog: 'nameDlg',
      frame: 'back',
      edits: { btnName: {} },
      actions: { btnBack: 'back', btnFinish: 'finish' },
    },
  },
};

const AYLA: CharacterSummary = {
  guid: 'char-a',
  name: 'Ayla',
  level: 7,
  gender: 0,
  race: 0,
  class: 3,
  displayInfoId: 1684,
  appearance: { skin: 1, hairStyle: 2, hairColour: 1, face: 1 },
  mapId: 1,
  position: [0, 0, 0],
  equipment: [],
  xp: 0,
  xpToLevel: 100,
};
const BRAM: CharacterSummary = { ...AYLA, guid: 'char-b', name: 'Bram', race: 2 };

let actions: {
  choose: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  preview: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  actions = {
    choose: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    create: vi.fn(async () => {}),
    preview: vi.fn(),
  };
  setFrontEndActions(actions as never);
  uiSpec.value = SPEC as never;
  setMovie({ skin: MOVIE, art: new Map() });
  characters.value = [];
  kinds.value = { races: [], classes: [] };
  looks.value = { skins: [], faces: [], hairStyles: [], bareHairStyles: [], hairColours: [] };
  draft.value = EMPTY_DRAFT;
  notice.value = '';
});

afterEach(() => {
  cleanup();
  clearMovies();
  uiSpec.value = null;
});

describe('choosing a character', () => {
  beforeEach(() => {
    characters.value = [AYLA, BRAM];
    setStage('characters');
  });

  it('stands the picked character on the ground behind', () => {
    const { getByLabelText } = render(<ArtChooseCharacter />);
    expect(actions.preview).toHaveBeenLastCalledWith(expect.objectContaining({ race: 0 }));
    fireEvent.click(getByLabelText('Bram'));
    expect(actions.preview).toHaveBeenLastCalledWith(expect.objectContaining({ race: 2 }));
  });

  it('enters the world as whoever is picked', () => {
    const { getByLabelText } = render(<ArtChooseCharacter />);
    fireEvent.click(getByLabelText('Bram'));
    fireEvent.click(getByLabelText('Enter the world'));
    expect(actions.choose).toHaveBeenCalledWith('Bram');
  });

  it('asks in the build’s box before deleting, and deletes only once the yes is held', () => {
    vi.useFakeTimers();
    try {
      const { getByLabelText, container } = render(<ArtChooseCharacter />);
      fireEvent.click(getByLabelText('Delete'));
      const asking = container.querySelector('[data-screen="confirm-delete"]') as HTMLElement;
      expect(asking.textContent).toContain('Delete Ayla?');
      const yes = within(asking).getByLabelText('Delete');
      // A press is not enough: the question asks for the yes to be held.
      fireEvent.pointerDown(yes);
      fireEvent.pointerUp(yes);
      act(() => {
        vi.advanceTimersByTime(HOLD_TO_DELETE);
      });
      expect(actions.remove).not.toHaveBeenCalled();
      fireEvent.pointerDown(yes);
      act(() => {
        vi.advanceTimersByTime(HOLD_TO_DELETE);
      });
      expect(actions.remove).toHaveBeenCalledWith('Ayla');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the character when the asking is turned down', () => {
    const { getByLabelText } = render(<ArtChooseCharacter />);
    fireEvent.click(getByLabelText('Delete'));
    fireEvent.click(getByLabelText('Keep'));
    expect(actions.remove).not.toHaveBeenCalled();
  });

  it('starts a new character from the empty place', () => {
    const { getByLabelText } = render(<ArtChooseCharacter />);
    fireEvent.click(getByLabelText('Make a character'));
    expect(stage.value).toBe('race');
  });
});

describe('making a character', () => {
  beforeEach(() => {
    kinds.value = {
      races: [
        { race: 0, name: 'Human', maleDisplayInfoId: 1, femaleDisplayInfoId: 2, nameTextId: 0 },
        { race: 2, name: 'Elf', maleDisplayInfoId: 3, femaleDisplayInfoId: 4, nameTextId: 0 },
      ],
      classes: [{ playerClass: 1 }, { playerClass: 8 }],
    };
    setLooks({
      skins: [1, 2],
      faces: [1],
      hairStyles: [3, 4],
      bareHairStyles: [],
      hairColours: [1],
    });
  });

  it('walks race, class, look and name, and hands over what was picked', () => {
    setStage('race');
    const view = render(<ArtMakeCharacter />);
    fireEvent.click(view.getByLabelText('Elf'));
    fireEvent.click(view.getByLabelText('Female'));
    fireEvent.click(view.getByLabelText('Next'));
    expect(stage.value).toBe('class');

    view.rerender(<ArtMakeCharacter />);
    fireEvent.click(view.getByLabelText('Class 8'));
    fireEvent.click(view.getByLabelText('Next'));
    expect(stage.value).toBe('look');

    view.rerender(<ArtMakeCharacter />);
    fireEvent.click(view.getByLabelText('skin'));
    fireEvent.click(view.getByLabelText('Next'));
    expect(stage.value).toBe('name');

    view.rerender(<ArtMakeCharacter />);
    fireEvent.input(view.getByLabelText('Name'), { target: { value: 'Wren' } });
    fireEvent.click(view.getByLabelText('Finish'));
    expect(actions.create).toHaveBeenCalledWith(
      expect.objectContaining({ race: 2, gender: 1, playerClass: 8, skin: 2, name: 'Wren' }),
    );
  });

  it('will not send a character with no name', () => {
    setStage('name');
    const { getByLabelText } = render(<ArtMakeCharacter />);
    fireEvent.click(getByLabelText('Finish'));
    expect(actions.create).not.toHaveBeenCalled();
    expect(notice.value).toBe('A name is needed.');
  });

  it('offers no choice on a row the body ships only one of', () => {
    setStage('look');
    const { getByLabelText } = render(<ArtMakeCharacter />);
    expect((getByLabelText('face') as HTMLButtonElement).disabled).toBe(true);
    expect((getByLabelText('hairStyle') as HTMLButtonElement).disabled).toBe(false);
  });

  it('keeps a look the player picked when the same offer arrives again', () => {
    setStage('look');
    const { getByLabelText } = render(<ArtMakeCharacter />);
    fireEvent.click(getByLabelText('skin'));
    expect(draft.value.skin).toBe(2);
    setLooks({
      skins: [1, 2],
      faces: [1],
      hairStyles: [3, 4],
      bareHairStyles: [],
      hairColours: [1],
    });
    expect(draft.value.skin).toBe(2);
  });

  it('cannot go on from a race step the build carries no races for', () => {
    kinds.value = { races: [], classes: [] };
    setStage('race');
    const { getByLabelText } = render(<ArtMakeCharacter />);
    expect((getByLabelText('Next') as HTMLButtonElement).disabled).toBe(true);
  });
});
