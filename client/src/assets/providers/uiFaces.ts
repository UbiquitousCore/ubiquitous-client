/**
 * Pair the movies' typeface names with shipped files: the most used is the
 * body face, the next the title face, each matched by family name. A name
 * with no file stays unpaired.
 */

import type { SwfEdit, SwfFont } from '../formats/swf';
import type { UiFace, UiFaces } from '../types';

/** Typeface names, most used first, counted over the text fields of `movies`. */
export function facesByUse(
  movies: readonly { fonts: readonly SwfFont[]; edits: readonly SwfEdit[] }[],
): string[] {
  const uses = new Map<string, number>();
  for (const movie of movies) {
    const names = new Map(movie.fonts.map(font => [font.id, font.name] as const));
    for (const edit of movie.edits) {
      const name = edit.fontId === null ? undefined : names.get(edit.fontId);
      if (name) uses.set(name, (uses.get(name) ?? 0) + 1);
    }
  }
  return [...uses].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

/** Pair the two most used names with the shipped files of the same family. */
export function pickUiFaces(
  byUse: readonly string[],
  shipped: readonly { family: string | null; bytes: Uint8Array }[],
): UiFaces {
  const find = (name: string | undefined): UiFace | null => {
    if (!name) return null;
    const hit = shipped.find(file => file.family?.toLowerCase() === name.toLowerCase());
    return hit ? { family: name, bytes: hit.bytes } : null;
  };
  return { body: find(byUse[0]), title: find(byUse[1]) };
}
