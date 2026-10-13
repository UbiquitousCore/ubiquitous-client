/**
 * The question the build asks before a character is deleted.
 *
 * It is stored the way the interface stores anything with a colour in
 * it: wrapped in the build's own markup, with the name to be dropped in
 * where it says. None of that markup is ours to draw.
 */

import { describe, expect, it } from 'vitest';

import { asked } from '../../src/ui/frontend/ArtConfirmDelete';

describe('the question asked before deleting', () => {
  it('puts the name in and takes the markup out', () => {
    // The shape the line comes in, in the user's strings: tags between \u0012 and
    // \u0013, a colour argument inside one of them, and the name.
    const line =
      '\u0012HTML\u0013\u0012font\u0013Removing this hero:\u0012/font\u0013\n' +
      "\u0012font color='#%x'\u0013%s\u0012/font\u0013\n" +
      '\u0012font\u0013Hold the yes for a moment.\u0012/font\u0013';

    expect(asked(line, 'Ayla')).toEqual([
      'Removing this hero:',
      'Ayla',
      'Hold the yes for a moment.',
    ]);
  });

  it('says nothing where the build has no such line', () => {
    expect(asked(undefined, 'Ayla')).toEqual([]);
  });

  it('hands the lines back one by one, so the name can be written in its own colour', () => {
    const line = '\u0012font\u0013one\u0012/font\u0013\n%s\nthree';

    expect(asked(line, 'Ayla')).toHaveLength(3);
    expect(asked(line, 'Ayla')[1]).toBe('Ayla');
  });
});
