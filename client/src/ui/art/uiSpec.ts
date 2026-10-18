/**
 * Which element of a shipped screen is which: a movie says where each part
 * is, not what it is for. Built in the browser from the player's movie:
 * `dialogShape` infers, `screenMeanings` names, `screenSpecs` merges. A
 * screen that cannot be built falls back to its built window
 * (`screenFallback`). Notation: `client/docs/ui/SCREEN_SPEC.md`.
 */

import { computed, signal } from '@preact/signals';

import type { FaceRun } from './faceRuns';
import { movies, uiWords } from './pieceStore';
import { SCREEN_MEANINGS } from './screenMeanings';
import { buildScreenSpec } from './screenSpecs';
import type { ScreenBuilt, ScreenFallback } from './screenSpecs';
import type { UiMovie } from '../../assets/ids';
import type { UiSkinData } from '../../assets/types';

export interface ComboSpec {
  control: string;
  list: string;
  value: string;
  of: string;
  /** What the dropdown offers, in the screen's own words. */
  options?: string[];
  /** The control whose choice decides what this one offers. */
  follows?: string;
  /** What it offers, by the choice showing in the control it follows. */
  optionsBy?: Record<string, string[]>;
}

export interface TabSpec {
  /** Where this tab's own words are written, for colouring the open one. */
  text?: string;
  /** A picture the movie does not hold, drawn at the tab's point. */
  icon?: string;
  control: string;
  panel: string;
  caption: string;
  /** The colour the open tab's words are rewritten in; that is how a page shows it is open. */
  openTone?: string;
}

/** Item numbers, never words: the words differ by language. */
export interface AuctionKindSpec {
  itemClass?: number;
  subClass?: number;
  subClassFrom?: number;
  subClassTo?: number;
  inventoryType?: number;
}

/** One thing a card offers: where to press, and what it reads. */
export interface CardActionSpec {
  /** The strip this sits in, which the card stacks under the body. */
  strip?: string;
  control: string;
  label?: string;
  says?: string;
  /** Where the control writes what it costs: each coin's figure, and its picture. */
  price?: {
    amounts: Partial<Record<'gold' | 'silver' | 'copper', string>>;
    coins: Partial<Record<'gold' | 'silver' | 'copper', string>>;
  };
}

/** A card that describes one thing, and where each piece of it goes. */
export interface CardSpec {
  title: string;
  body: string;
  /** What the card offers, by our own name for each. */
  actions?: Record<string, CardActionSpec>;
  /** The control that holds one thing up against another. */
  compare?: string;
  /** Where a card standing for what is already worn says so. */
  equipped?: string;
  /** The rule drawn under that, which the plain card does not show. */
  equippedLine?: string;
}

/** A picture drawn from a build icon file at a point the movie marks without a size. */
export interface EmblemSpec {
  /** The point the screen draws it at. */
  at: string;
  /** The file, under the build's own icon directory. */
  icon?: string;
  /** Alternatives, by our own name for what each stands for. */
  icons?: Record<string, string>;
  /** How big the screen draws it, in the movie's own units. */
  size: number;
}

export interface ListingSpec {
  view: string;
  /** The slot in a row that holds the item's own picture. */
  icon?: string;
  /** The mask the rows show through: how many are visible, and where. */
  viewport?: string;
  row: string;
  /** False where a row's own art is a highlight lit only for one row. */
  rowArt?: boolean;
  /** The part inside a row the screen lights up for the chosen one. */
  chosen?: string;
  /** The screen's own scrollbar, left off a list that fits its window. */
  bar?: string;
  /** The marks a player presses to move the list, where the screen has them. */
  scroll?: { up?: string; down?: string };
  fields: Record<string, string>;
  /** Shown only in a direction with more; a list that fits shows neither. */
  more?: { above?: string; below?: string };
  /** A price of forty silver names no gold; a bare "0" beside a gold piece reads as free. */
  coins?: Record<string, string>;
  /** The emblem each row carries, where the screen draws one itself. */
  emblem?: EmblemSpec;
  /** Controls inside a row besides the row itself, by what each does. */
  does?: Record<string, string>;
}

/** A run of numbered slots for one store, and how it is paged. */
export interface GridSpec {
  /** The name every slot in the run carries, before its number. */
  slot: string;
  /** The part the run sits in, where the same name is used twice over. */
  within?: string;
  /** Parts holding slots of the same name that are not this run. */
  except?: string[];
  /** True where the slot's number says which slot it is: a run round a body is not in order. */
  numbered?: boolean;
  /** The equipment slot each numbered place holds (`EQUIPMENT_SLOTS` names); otherwise place N is slot N. */
  holds?: string[];
  /** The shape inside a slot the screen measures its picture against. */
  face?: string;
  /** Size where the run is laid out as points; without it the things have no size. */
  size?: { w: number; h: number; dx?: number; dy?: number };
  /** Where inside a slot the screen writes how many are in the stack. */
  count?: string;
  /** Empty-slot outlines, icon files from the build. */
  empty?: { icons: string[]; at?: string; size: number };
  /** The control that puts this store in order. */
  sort?: string;
  pageBack?: string;
  pageOn?: string;
  /** Where the screen writes which page of how many is showing. */
  page?: string;
}

/** One thing the menu opens: where to press, its words and our screen it brings up. */
export interface MenuItemSpec {
  control: string;
  text: string;
  /** Our own name for the screen it opens. */
  screen: string;
  /** Its words, as the interface's own numbered string. */
  says?: string;
}

export interface BagSpec {
  run: string;
  slot: string;
  /** The shape inside a slot the screen measures its picture against. */
  face?: string;
  /** Where inside a slot the screen writes how many are in the stack. */
  count?: string;
  sell: string;
  pageBack: string;
  pageOn: string;
  /** Where what is being sold is named. */
  name?: string;
}

/** A button that becomes a text box when pressed; limits are the screen's own. */
export interface EditSpec {
  /** Our own name for what the control holds. */
  holds: string;
  /** How many characters the screen accepts, where it caps them. */
  max?: number;
  /** True where the control was laid out for more than one line. */
  lines?: boolean;
  /** True where only a number goes in. */
  number?: boolean;
}

/**
 * A part the movie parks off to the side and slides in; drawn as its own
 * picture so it does not stretch the backdrop.
 */
export interface PieceSpec {
  /** The piece the part belongs to, where it is not the screen's own. */
  dialog?: string;
  /** The part itself, by path or by name. */
  part: string;
  /** Parts stacked on it that this drawing leaves out. */
  without?: string[];
}

export interface ScreenSpec {
  /** The dialog this screen wears. */
  dialog: string;
  /** The movie the dialog is in, where not the in-game one (the front end has its own). */
  movie?: UiMovie;
  /** The part (or parts) whose extent is the window; the rest is masked away. */
  frame?: string | string[];
  /** Parts the screen never shows, whatever state it is in. */
  hidden?: string[];
  /** Parts always shown; one this client cannot answer wears its unavailable face. */
  shown?: string[];
  close?: string;
  /** Our name for each panel, and the element that draws it. */
  panels?: Record<string, string>;
  tabs?: TabSpec[];
  /** Pages kept down a page's edge, in stacking order. */
  sides?: TabSpec[];
  combos?: ComboSpec[];
  /** Controls that take a number, and what the number is. */
  numbers?: Record<string, string>;
  /** Rows of the build's own tables this screen reads, by our name for each. */
  rows?: Record<string, number>;
  /** Art the build keeps outside the movie (class marks, tab pictures), by file. */
  pictures?: Record<string, string[]>;
  /** Controls the player types into, by the control the screen draws. */
  edits?: Record<string, EditSpec>;
  /** Controls that do something, and what. */
  actions?: Record<string, string>;
  /** The face a control wears when it can do nothing; better than dimming ours. */
  unavailable?: Record<string, string>;
  /** Words for choices the tables leave unnamed (a class row has no name), quoted from the string file. */
  calls?: Record<string, string>;
  /** How this screen describes one thing, for screens that are a card. */
  card?: CardSpec;
  /** Fields that hold a caption, and which caption. */
  captions?: Record<string, string>;
  /** The colour each kind of message is written in, read from the build. */
  tones?: Record<string, string>;
  /** Parts drawn on their own, by our own name for what each one is. */
  pieces?: Record<string, PieceSpec>;
  /** A control's word that depends on what it is about to do, unlike a fixed caption. */
  words?: Record<string, string>;
  /** Fields the screen writes a value into, by our name for the value. */
  values?: Record<string, string>;
  /** Captions with a figure after their words ("Hit chance: 95.00%"), by field. */
  figures?: Record<string, string>;
  /** A price of forty silver names no gold; a bare "0" beside a gold piece reads as free. */
  coins?: Record<string, string>;
  /** Parts shown only while they apply, by our own name for each. */
  groups?: Record<string, string>;
  /** Where the player's money is shown. */
  purse?: Record<string, string>;
  /** How each panel lays its listing out; they differ between panels. */
  lists?: Record<string, ListingSpec>;
  bag?: BagSpec;
  /** Runs of slots, by our own name for the store each one shows. */
  grids?: Record<string, GridSpec>;
  /** How a value is written where the screen writes it into a sentence. */
  formats?: Record<string, string>;
  /** What an item's numbers are called, indexed by the number. */
  names?: {
    classes?: string[];
    worn?: string[];
    binds?: string[];
    /** By class, where the sub-classes could be placed at all. */
    subClasses?: Record<string, string[]>;
    /** What each kind of damage a weapon deals is called. */
    damageTypes?: string[];
    /** The word for each class an item may be worn by, by class number. */
    allowed?: Record<string, string>;
  };
  /** The sentence each gift kind is written into, by kind; one number each. */
  stats?: Record<string, string>;
  /**
   * Which item numbers mean what: the class carded by protection, the gift
   * kinds written plainly above the level, and two kinds absorbed by other lines.
   */
  shape?: {
    armourClass?: number;
    plainKinds?: number[];
    armour?: number;
    block?: number;
  };
  /** The face a control wears while it is the one showing. */
  faces?: Record<string, number>;
  /** Bars stepped through a clip's faces, full at the first and empty at the last. */
  bars?: {
    frames: number;
    of: Record<string, string>;
    /** Bars on a run of faces of their own: where each is, and its last face. */
    own?: Record<string, { at: string; frames: number }>;
    /** Each clip of more than one face the screen is framed on, by path, and its runs. */
    runs?: Record<string, FaceRun[]>;
    /** Who each run of a bar's faces is for, in the clip's order, keyed as in `of`. */
    runsFor?: Record<string, string[]>;
  };
  /** What the screen says in place of a list that has nothing in it. */
  emptyNote?: string;
  /** Parts that mean nothing outside a party, and so are left off until the player is in one. */
  partyOnly?: string[];
  /** What each dropdown choice narrows by; one narrowing nothing is listed so it is known. */
  conditions?: Record<string, { kinds?: AuctionKindSpec[]; quality?: number }>;
  /** For a screen that scrolls a panel rather than rows. */
  marks?: { above?: string; below?: string };
  /** How a list of more than one page is turned, and how many fit a page. */
  paging?: { back?: string; on?: string; page?: string; perPage?: number };
  /** Emblems, for screens that wear them. */
  icons?: Record<string, string>;
  /** Pictures the screen draws itself, by our own name for each. */
  emblems?: Record<string, EmblemSpec>;
  /** What the menu opens, in the order it lists them. */
  items?: MenuItemSpec[];
}

export interface UiSpec {
  screens: Record<string, ScreenSpec>;
}

/** A spec set by hand, for tests and benches; null in play. */
export const uiSpec = signal<UiSpec | null>(null);

/** Keyed on the skin, which stays the same object as more art is published. */
const builtFor = new WeakMap<
  UiSkinData,
  { words: readonly string[]; screens: Map<string, ScreenBuilt> }
>();

function built(name: string): ScreenBuilt | { fallback: ScreenFallback } {
  const meaning = SCREEN_MEANINGS[name];
  if (!meaning) return { fallback: { reason: 'not-mapped' } };
  const skin = movies.value.get(meaning.movie ?? 'IGM')?.skin;
  if (!skin) return { fallback: { reason: 'no-movie' } };
  const words = uiWords.value;
  let cache = builtFor.get(skin);
  if (!cache || cache.words !== words) {
    cache = { words, screens: new Map() };
    builtFor.set(skin, cache);
  }
  let screen = cache.screens.get(name);
  if (!screen) {
    screen = buildScreenSpec(skin, words, meaning);
    cache.screens.set(name, screen);
  }
  return screen;
}

/** Every screen the table knows, built from the movies read so far. */
const fromMovies = computed<UiSpec>(() => {
  const screens: Record<string, ScreenSpec> = {};
  for (const name of Object.keys(SCREEN_MEANINGS)) {
    const one = built(name);
    if ('spec' in one) screens[name] = one.spec;
  }
  return { screens };
});

/** Why a screen has no spec (one of four reasons), or null where it has one. */
export function screenFallback(name: string): ScreenFallback | null {
  if (uiSpec.value) return uiSpec.value.screens[name] ? null : { reason: 'not-mapped' };
  const one = built(name);
  return 'fallback' in one ? one.fallback : null;
}

/**
 * `@302` is entry 302 of the string file. Numbers differ between builds, so a
 * quote may carry the opening words to search by — `@302?Account` — and `#n`
 * counts n entries along from the one found. A shipped screen carries a digest
 * of those words instead of the words themselves (`@302?~<16 hex>~<length>`),
 * so the game's interface text stays the user's own rather than this tree's.
 */
const QUOTE = /^@(\d+)(?:\?(.+?))?(?:#(\d+))?$/;

/** What a quote expects of the build: the words themselves, or a digest of them and how many. */
interface Asked {
  literal?: string;
  digest?: string;
  length?: number;
}

/** Read a quote's expectation; the `~digest~length` form carries no words. */
function asked(expected: string | undefined): Asked | undefined {
  if (!expected) return undefined;
  const hashed = /^~([0-9a-f]{16})~(\d+)$/.exec(expected);
  if (hashed) return { digest: hashed[1], length: Number(hashed[2]) };
  return { literal: expected };
}

/** A line without the interface's font and colour markup, ready to compare. */
function bare(word: string): string {
  return unmarked(word).trim().toLowerCase();
}

/**
 * A short, stable digest of an interface word, so a shipped quote can name one
 * without carrying the words. Two 32-bit FNV-1a passes give 64 bits, enough
 * that a match over a build's few thousand lines is not a collision. The same
 * function writes the digests in `screenMeanings.ts`.
 */
export function quoteDigest(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

/** A line without the interface's font and colour markup around it. */
function unmarked(word: string): string {
  return word.replace(/\u0012[^\u0013]*\u0013/g, '');
}

/** Whether the build's line is exactly what the quote asks for. */
function sameAs(word: string, want: Asked): boolean {
  const text = bare(word);
  if (want.digest) return text.length === want.length && quoteDigest(text) === want.digest;
  return text === bare(want.literal ?? '');
}

/** The same line, or one opening with it: a description is quoted by its first sentence. */
function opensWith(word: string, want: Asked): boolean {
  const text = bare(word);
  if (want.digest) {
    const n = want.length ?? 0;
    return text.length >= n && quoteDigest(text.slice(0, n)) === want.digest;
  }
  const wanted = bare(want.literal ?? '');
  return text === wanted || text.startsWith(wanted);
}

/** One quoted caption's words in this build; a non-quote is returned as is. */
export function unquote(value: string, words: readonly string[]): string {
  const quoted = QUOTE.exec(value);
  if (!quoted) return value;
  const at = placeOf(Number(quoted[1]), quoted[2], words);
  return at === undefined
    ? (words[Number(quoted[1])] ?? '')
    : (words[at + Number(quoted[3] ?? 0)] ?? '');
}

/**
 * A quote's place in this build: its own number if it answers, else where
 * its words are. Exact matches first (short words open many lines), then
 * nearest the given number.
 */
function placeOf(
  at: number,
  expected: string | undefined,
  words: readonly string[],
): number | undefined {
  const want = asked(expected);
  if (!want) return words[at] !== undefined ? at : undefined;
  const nearest = (test: (word: string) => boolean): number =>
    words.reduce(
      (best, word, index) =>
        test(word) && (best < 0 || Math.abs(index - at) < Math.abs(best - at)) ? index : best,
      -1,
    );
  if (sameAs(words[at] ?? '', want)) return at;
  const same = nearest(word => sameAs(word, want));
  if (same >= 0) return same;
  if (opensWith(words[at] ?? '', want)) return at;
  const opens = nearest(word => opensWith(word, want));
  return opens >= 0 ? opens : undefined;
}

export function quoteAt(value: string, words: readonly string[]): number | undefined {
  const quoted = QUOTE.exec(value);
  if (!quoted) return undefined;
  const at = placeOf(Number(quoted[1]), quoted[2], words);
  return at === undefined ? undefined : at + Number(quoted[3] ?? 0);
}

/** Whether a quote finds words that answer to what it expects, in this build. */
export function quoteAnswers(value: string, words: readonly string[]): boolean {
  const quoted = QUOTE.exec(value);
  if (!quoted) return true;
  const want = asked(quoted[2]);
  const at = placeOf(Number(quoted[1]), quoted[2], words);
  if (at === undefined) return false;
  const found = want ? opensWith(words[at] ?? '', want) : (words[at] ?? '') !== '';
  return found && (words[at + Number(quoted[3] ?? 0)] ?? '') !== '';
}

/**
 * The spec with quoted captions replaced by the build's words. A quote whose
 * number disagrees is searched for by its words; a build in another
 * language matches nothing and keeps the number.
 */
const spoken = computed<UiSpec | null>(() => {
  const spec = uiSpec.value ?? fromMovies.value;
  const words = uiWords.value;
  const say = (value: unknown): unknown => {
    if (typeof value === 'string') return unquote(value, words);
    if (Array.isArray(value)) return value.map(say);
    if (value && typeof value === 'object') {
      // Keys too: what one dropdown offers is keyed by another's showing word.
      return Object.fromEntries(
        Object.entries(value).map(([key, held]) => [say(key) as string, say(held)]),
      );
    }
    return value;
  };
  return say(spec) as UiSpec;
});

/** One screen's spec, by our own name for it. */
export function screenSpec(name: string): ScreenSpec | null {
  return spoken.value?.screens[name] ?? null;
}
