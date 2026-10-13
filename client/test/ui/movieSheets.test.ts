/**
 * Sheets of two movies that share a name.
 *
 * The bug this pins: one map under bare names meant the sign-in panel
 * was drawn with the in-game movie's bags and coins, or not, depending
 * on which screen had asked first.
 */

import { describe, expect, it } from 'vitest';

import { MovieSheets } from '../../src/ui/art/movieSheets';
import type { UiSkinArt } from '../../src/assets/types';

const art = (what: string): UiSkinArt => ({ what }) as unknown as UiSkinArt;

describe('the sheets a movie is drawn from', () => {
  it('keeps two movies apart where they name a sheet the same', () => {
    const sheets = new MovieSheets();
    sheets.of('IGM').set('sheet01', art('bags and coins'));
    sheets.of('LGM').set('sheet01', art('the sign-in panel'));

    expect(sheets.of('LGM').get('sheet01')).toEqual(art('the sign-in panel'));
    expect(sheets.of('IGM').get('sheet01')).toEqual(art('bags and coins'));
  });

  it('asks for a name a second movie has not got, however long the first has held it', () => {
    const sheets = new MovieSheets();
    sheets.of('IGM').set('sheet01', art('bags and coins'));

    expect(sheets.missing('LGM', ['sheet01', 'sheet02'])).toEqual(['sheet01', 'sheet02']);
    expect(sheets.missing('IGM', ['sheet01', 'sheet02'])).toEqual(['sheet02']);
  });

  it('hands out a copy, so what it holds is not changed by whoever draws with it', () => {
    const sheets = new MovieSheets();
    sheets.of('LGM').set('sheet01', art('the sign-in panel'));

    const handed = sheets.copyOf('LGM');
    handed.delete('sheet01');
    expect(sheets.of('LGM').has('sheet01')).toBe(true);
  });
});
