/**
 * Which shipped typeface letters which part of the interface.
 *
 * The movies name a typeface on every text field; the rule pairs the two
 * names used most with the shipped files of the same family. Synthetic
 * names only.
 */

import { describe, expect, it } from 'vitest';

import type { SwfEdit, SwfFont } from '../src/assets/formats/swf';
import { facesByUse, pickUiFaces } from '../src/assets/providers/uiFaces';

function field(fontId: number | null): SwfEdit {
  return {
    id: 1,
    bounds: { x: 0, y: 0, w: 10, h: 10 },
    varName: '',
    initialHtml: '',
    fontId,
    fontHeight: 12,
    color: null,
    align: 0,
  };
}

function movie(fonts: SwfFont[], uses: (number | null)[]): { fonts: SwfFont[]; edits: SwfEdit[] } {
  return { fonts, edits: uses.map(field) };
}

const bytes = (n: number): Uint8Array => new Uint8Array([n]);

describe('the typefaces the movies letter in', () => {
  it('ranks names by how many fields use them, across movies whose ids differ', () => {
    const one = movie(
      [
        { id: 1, name: 'Body' },
        { id: 2, name: 'Title' },
      ],
      [1, 1, 2, null],
    );
    const other = movie(
      [
        { id: 7, name: 'Body' },
        { id: 8, name: 'Rare' },
        { id: 9, name: 'Title' },
      ],
      [7, 9, 8, 7, 9],
    );
    expect(facesByUse([one, other])).toEqual(['Body', 'Title', 'Rare']);
  });

  it('pairs the most used name with the body and the next with the title', () => {
    const faces = pickUiFaces(
      ['Body', 'Title'],
      [
        { family: 'title', bytes: bytes(2) },
        { family: 'Body', bytes: bytes(1) },
        { family: null, bytes: bytes(3) },
      ],
    );
    expect(faces.body).toEqual({ family: 'Body', bytes: bytes(1) });
    expect(faces.title).toEqual({ family: 'Title', bytes: bytes(2) });
  });

  it('leaves the title unpaired rather than handing it a face the screens barely use', () => {
    // The second most used name is not shipped; the third is. A title set in
    // the third would be a heading in a typeface only a handful of fields use.
    const faces = pickUiFaces(
      ['Body', 'Title', 'Rare'],
      [
        { family: 'Body', bytes: bytes(1) },
        { family: 'Rare', bytes: bytes(3) },
      ],
    );
    expect(faces.body?.family).toBe('Body');
    expect(faces.title).toBeNull();
  });

  it('pairs nothing when nothing shipped matches', () => {
    expect(pickUiFaces(['Body'], [{ family: 'Other', bytes: bytes(1) }])).toEqual({
      body: null,
      title: null,
    });
  });
});
