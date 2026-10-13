/**
 * Interface art from the user's movie, published by `Game` for screens to
 * wear. Decoration that may never arrive: every wearer keeps its own styling.
 */

import { computed, signal } from '@preact/signals';

import type { PieceImage } from './pieceCanvas';
import type { UiSkinArt, UiSkinData } from '../../assets/types';
import type { UiMovie } from '../../assets/ids';

export type PieceSet = ReadonlyMap<string, PieceImage>;

const NONE: PieceSet = new Map();

/** Pieces drawn so far, by name. Empty until something asks. */
export const pieces = signal<PieceSet>(NONE);

/** Names some screen has asked for and `Game` has not answered yet. */
export const wantedPieces = signal<readonly string[]>([]);

/** Publish drawn pieces, keeping whatever arrived before. */
export function setPieces(drawn: PieceSet): void {
  const merged = new Map(pieces.value);
  for (const [name, image] of drawn) merged.set(name, image);
  pieces.value = merged;
}

/** Icon files a screen draws at points the movie only marks (a mail row's letter, an empty slot's outline), by file. */
export const emblems = signal<ReadonlyMap<string, ImageBitmap>>(new Map());

/** Names some screen has asked for and `Game` has not answered yet. */
export const wantedEmblems = signal<readonly string[]>([]);

export function wantEmblems(names: readonly string[]): void {
  const have = emblems.value;
  const asked = wantedEmblems.value;
  const missing = names.filter(name => name && !have.has(name) && !asked.includes(name));
  if (missing.length) wantedEmblems.value = [...asked, ...missing];
}

/** Publish what was found. A name that answered nothing is left unset. */
export function setEmblems(found: ReadonlyMap<string, ImageBitmap>): void {
  const merged = new Map(emblems.value);
  for (const [name, image] of found) merged.set(name, image);
  emblems.value = merged;
}

/** A whole movie and its art, for screens that are a shipped screen. */
export interface MovieArt {
  skin: UiSkinData;
  art: ReadonlyMap<string, UiSkinArt>;
}

/** The movies read so far, by name: the in-game one and the front end's. */
export const movies = signal<ReadonlyMap<UiMovie, MovieArt>>(new Map());

/** The in-game movie, which is the one a screen means unless it says. */
export const movie = computed<MovieArt | null>(() => movies.value.get('IGM') ?? null);

/** One movie by name, or null while it has not been read. */
export function movieArt(name: UiMovie): MovieArt | null {
  return movies.value.get(name) ?? null;
}

/** One dialog some screen wants, and which movie it is in. */
export interface WantedDialog {
  movie: UiMovie;
  dialog: string;
}

/** Dialogs a screen has asked for, so their art can be fetched. */
export const wantedDialogs = signal<readonly WantedDialog[]>([]);

export function wantDialog(name: string, from: UiMovie = 'IGM'): void {
  if (!wantedDialogs.value.some(one => one.dialog === name && one.movie === from)) {
    wantedDialogs.value = [...wantedDialogs.value, { movie: from, dialog: name }];
  }
}

/** Publish a movie under the name screens ask by; the caller names it, so benches can mount anything. */
export function setMovie(loaded: MovieArt, as: UiMovie = 'IGM'): void {
  const merged = new Map(movies.value);
  merged.set(as, loaded);
  movies.value = merged;
}

/** The interface's words in the build's order; empty until read, or for a build with none. */
export const uiWords = signal<readonly string[]>([]);

export function setUiWords(words: readonly string[]): void {
  uiWords.value = words;
}

/** Take the interface words; `null` for none, so a build mounted later is asked again rather than remembered as wordless. */
export function takeUiWords(words: readonly string[]): readonly string[] | null {
  if (!words.length) return null;
  uiWords.value = words;
  return words;
}
