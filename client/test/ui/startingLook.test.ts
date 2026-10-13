/**
 * The hair a new character starts with.
 *
 * Most bodies carry a bare-scalp hair style first, and one of them carries
 * two. A draft that took whatever came first started every new character
 * bald, and the one sent to the server with it.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { LookOptions } from '../../src/assets/types';
import {
  EMPTY_DRAFT,
  draft,
  editDraft,
  setLooks,
  startDraft,
  startingHairStyle,
} from '../../src/ui/frontend/frontEndStore';

const offer = (hairStyles: number[], bareHairStyles: number[]): LookOptions => ({
  skins: [1, 2],
  faces: [1, 2],
  hairStyles,
  bareHairStyles,
  hairColours: [1, 2],
});

beforeEach(() => {
  draft.value = EMPTY_DRAFT;
});

describe('startingHairStyle', () => {
  it('is the first style the body offers that is not bare scalp', () => {
    expect(startingHairStyle(offer([0, 1, 2, 3], [0]))).toBe(1);
    expect(startingHairStyle(offer([0, 1, 2, 3], [0, 1]))).toBe(2);
    expect(startingHairStyle(offer([0, 1, 2], [1]))).toBe(0);
  });

  it('falls back to the first style when every style is bare, and to none when none is offered', () => {
    expect(startingHairStyle(offer([0, 1], [0, 1]))).toBe(0);
    expect(startingHairStyle(offer([], []))).toBe(0);
  });
});

describe('a new draft', () => {
  it('starts on a style with hair once the body says what it offers', () => {
    startDraft(0, 0);
    setLooks(offer([0, 1, 2, 3], [0, 1]));
    expect(draft.value.hairStyle).toBe(2);
    expect(draft.value.skin).toBe(1);
  });

  it('keeps a bare scalp the player picked when the same offer arrives again', () => {
    startDraft(0, 0);
    setLooks(offer([0, 1, 2, 3], [0]));
    editDraft({ hairStyle: 0 });
    setLooks(offer([0, 1, 2, 3], [0]));
    expect(draft.value.hairStyle).toBe(0);
  });

  it('starts the hair again on a new body, which may number its bare styles differently', () => {
    startDraft(0, 1);
    setLooks(offer([0, 1, 2], [0]));
    expect(draft.value.hairStyle).toBe(1);

    editDraft({ gender: 0 });
    setLooks(offer([0, 1, 2], [0, 1]));
    expect(draft.value.hairStyle).toBe(2);

    editDraft({ race: 2 });
    setLooks(offer([0, 1, 2], [0]));
    expect(draft.value.hairStyle).toBe(1);
  });

  it('leaves a picked style alone when only the class changes', () => {
    startDraft(0, 0);
    setLooks(offer([0, 1, 2, 3], [0]));
    editDraft({ hairStyle: 3 });
    editDraft({ playerClass: 2 });
    setLooks(offer([0, 1, 2, 3], [0]));
    expect(draft.value.hairStyle).toBe(3);
  });
});
