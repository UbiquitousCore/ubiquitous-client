/**
 * Each screen's spec: `dialogShape`'s inference merged with `screenMeanings`
 * (the table wins); a screen naming anything the movie lacks is refused.
 */

import {
  captionsOf,
  closeOf,
  frameOf,
  gridIn,
  inside,
  pagerIn,
  listIn,
  menuIn,
  purseIn,
  tabsOf,
  unavailableOf,
  wordSet,
} from './dialogShape';
import type { GridAsked, ListAsked, MenuAsked } from './dialogShape';
import { runsOf } from './faceRuns';
import type { FaceRun } from './faceRuns';
import { findPlacements, planPiece } from './piecePlan';
import type { PiecePart } from './piecePlan';
import { quoteAt } from './uiSpec';
import type { BagSpec, GridSpec, ListingSpec, ScreenSpec, TabSpec, UiSpec } from './uiSpec';
import type { UiSkinData } from '../../assets/types';
import type { UiMovie } from '../../assets/ids';

/** What an open tab's words are written in, where the table names nothing else. */
export const OPEN_TAB_TONE = 'var(--color-tab-open)';

/** In a caption, "the words the movie wrote in this field". */
export const MOVIE_TEXT = Symbol('the movie’s own words');

/** What the table says about one screen, in element names from the movie. */
export interface ScreenMeaning
  extends Omit<
    Partial<ScreenSpec>,
    'dialog' | 'lists' | 'grids' | 'bag' | 'captions' | 'tabs' | 'bars'
  > {
  dialog: string;
  movie?: UiMovie;
  /**
   * Tabs the movie does not pair itself, and what the ones it does pair
   * mean to us — matched by control. A tab listed here with no panel of
   * its own opens the panel it names.
   */
  tabs?: Array<Partial<TabSpec> & { control: string }>;
  /** Fixed words, by field: ours, or `MOVIE_TEXT` for the field's own. */
  captions?: Record<string, string | typeof MOVIE_TEXT>;
  lists?: Record<string, ListAsked>;
  /**
   * Runs of slots, by our name for the store each shows. A list of asks
   * is a list of alternatives, for builds that lay the same run out
   * differently: the first the movie answers is taken.
   */
  grids?: Record<string, GridAsked | GridAsked[]>;
  bag?: Omit<BagSpec, 'slot' | 'pageBack' | 'pageOn'> & Partial<BagSpec>;
  /**
   * Names some builds do not carry. Checked like any other where the
   * movie has them; where it does not, the screen is drawn without them
   * rather than refused.
   */
  optional?: string[];
  /**
   * Where to find the player's purse, where it is not the only one in the
   * dialog; `false` where the screen shows none.
   */
  purseIn?: string | false;
  /**
   * What a menu offers, by the emblem the movie stands on each plaque.
   * Which plaque and which field are read off the movie.
   */
  menu?: MenuAsked[];
  /**
   * Bars stepped through a run of faces. How many faces a run has is
   * the movie's, and is read off the clips when the table leaves it out.
   */
  bars?: {
    frames?: number;
    of: Record<string, string>;
    /**
     * Bars that step through a run of their own, apart from the one the
     * bars in `of` share. How long each run is, is read off its clip.
     */
    own?: Record<string, string>;
    /**
     * Who each run of a bar's faces is for, in the order the clip holds
     * its runs, keyed as in `of`: read off the colour each run fills with.
     */
    runsFor?: Record<string, string[]>;
  };
  /**
   * What each kind of word is written in, as the field the build letters
   * that kind in: `dialog/field`. The colour is read off the field.
   */
  toneOf?: Record<string, string>;
  /**
   * Rows that are a distance into the build's words, found by one of the
   * words they point at: the quote, less the number that word stands for.
   * Left out where the build carries none of those words.
   */
  rowsFrom?: Record<string, { quote: string; less: number }>;
}

/**
 * The last face of the shortest of a dialog's bars: a bar full at its first
 * face and empty at this one. None where no bar is a clip of more than one.
 */
function lastFaceOf(
  skin: UiSkinData,
  dialog: string,
  parts: readonly PiecePart[],
  bars: readonly string[],
): number | undefined {
  // A bar may be named by its path, or by its name inside each of a run
  // of rows, where the first part of that name is as good as any other;
  // or it may be the whole of the piece, a clip standing on the stage.
  const clipOf = (bar: string): number | null | undefined => {
    if (bar === dialog) return findPlacements(skin, dialog)[0]?.characterId;
    const path = parts.find(part => part.path === bar || part.path.endsWith(`/${bar}`))?.path;
    return path ? findPlacements(skin, `${dialog}/${path}`)[0]?.characterId : undefined;
  };
  const counts = bars
    .map(clipOf)
    .map(id => skin.sprites.find(sprite => sprite.id === id)?.frameCount ?? 0)
    .filter(count => count > 1);
  return counts.length ? Math.min(...counts) - 1 : undefined;
}

/**
 * Every clip of more than one face among the parts a screen is framed on,
 * by its path, with the runs its faces fall into.
 */
function runsUnder(
  skin: UiSkinData,
  dialog: string,
  parts: readonly PiecePart[],
  frame: string | readonly string[] | undefined,
): Record<string, FaceRun[]> {
  const roots = frame === undefined ? [] : typeof frame === 'string' ? [frame] : frame;
  const framed = (path: string): boolean =>
    !roots.length || roots.some(root => path === root || path.startsWith(`${root}/`));
  const out: Record<string, FaceRun[]> = {};
  for (const part of parts) {
    if (!framed(part.path)) continue;
    const clip = findPlacements(skin, `${dialog}/${part.path}`)[0]?.characterId;
    const runs = clip == null ? [] : runsOf(skin, clip);
    if (runs.length) out[part.path] = runs;
  }
  return out;
}

/** Why a screen draws its built window rather than the movie's. */
export type ScreenFallback =
  | { reason: 'no-movie' }
  | { reason: 'not-mapped' }
  | { reason: 'no-dialog'; dialog: string }
  | { reason: 'missing-part'; missing: string[] };

export type ScreenBuilt = { spec: ScreenSpec } | { fallback: ScreenFallback };

/** Whether some part is `name`, ends in it, or is one of a numbered run of it. */
function carries(parts: readonly PiecePart[], name: string): boolean {
  if (!name || name.includes('@')) return true;
  const run = new RegExp(`(^|/)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`);
  return parts.some(
    part => part.path === name || part.path.endsWith(`/${name}`) || run.test(part.path),
  );
}

/** Every element name a meaning spells out itself, for checking against the movie. */
function namedBy(meaning: ScreenMeaning): string[] {
  const out: string[] = [];
  const add = (...names: Array<string | undefined>) => {
    for (const name of names) if (name) out.push(name);
  };
  const frames = meaning.frame;
  add(...(Array.isArray(frames) ? frames : [frames]));
  // What is hidden is not checked here: hiding a part a build lacks hides
  // nothing, and the pack test holds every such name to the builds.
  add(meaning.close, ...(meaning.shown ?? []));
  add(...Object.values(meaning.panels ?? {}));
  for (const tab of meaning.tabs ?? []) add(tab.control, tab.text);
  add(...Object.keys(meaning.captions ?? {}));
  add(...Object.values(meaning.values ?? {}), ...Object.keys(meaning.actions ?? {}));
  add(...Object.keys(meaning.numbers ?? {}), ...Object.values(meaning.groups ?? {}));
  add(...Object.values(meaning.purse ?? {}), ...Object.values(meaning.coins ?? {}));
  add(...Object.keys(meaning.faces ?? {}), ...Object.keys(meaning.edits ?? {}));
  add(...Object.values(meaning.unavailable ?? {}), ...Object.values(meaning.bars?.of ?? {}));
  add(...Object.values(meaning.bars?.own ?? {}));
  add(meaning.paging?.back, meaning.paging?.on, meaning.paging?.page);
  if (typeof meaning.purseIn === 'string') add(meaning.purseIn);
  for (const combo of meaning.combos ?? []) add(combo.control, combo.list, combo.value);
  for (const list of Object.values(meaning.lists ?? {})) {
    add(list.region, list.row, list.viewport, list.chosen, list.icon);
  }
  for (const grid of Object.values(meaning.grids ?? {})) {
    if (Array.isArray(grid)) continue;
    add(...gridNames(grid));
  }
  const bag = meaning.bag;
  if (bag) add(bag.run, bag.slot, bag.sell, bag.name, bag.pageBack, bag.pageOn);
  return out;
}

/** The names one ask for a run of slots spells out. */
function gridNames(grid: GridAsked): string[] {
  return [
    grid.region,
    grid.within,
    grid.slot,
    grid.pageBack,
    grid.pageOn,
    grid.page,
    grid.sort,
  ].filter((name): name is string => Boolean(name));
}

/** The field fields of a list, as paths below each of its rows. */
function rowFieldPaths(list: ListingSpec, parts: readonly PiecePart[]): string[] {
  const row = new RegExp(`(^|/)${list.row}\\d+$`);
  const rows = parts.filter(part => row.test(part.path)).map(part => part.path);
  return rows.flatMap(path => Object.values(list.fields).map(field => `${path}/${field}`));
}

/**
 * One screen's spec, or why it has none.
 *
 * `words` is the build's own string file, which is what tells a caption
 * the movie was authored with from placeholder text.
 */
export function buildScreenSpec(
  skin: UiSkinData,
  words: readonly string[],
  meaning: ScreenMeaning,
): ScreenBuilt {
  const plan = planPiece(skin, meaning.dialog, { includeParked: true });
  if (!plan) return { fallback: { reason: 'no-dialog', dialog: meaning.dialog } };
  const parts = plan.parts;

  const optional = new Set(meaning.optional ?? []);
  const missing = namedBy(meaning).filter(
    name => name !== meaning.dialog && !optional.has(name) && !carries(parts, name),
  );
  for (const [what, field] of Object.values(meaning.lists ?? {}).flatMap(list =>
    Object.entries(list.fields).map(entry => [list, entry[1]] as const),
  )) {
    if (!carries(parts, field)) missing.push(`${what.row}…/${field}`);
  }

  const lists: Record<string, ListingSpec> = {};
  for (const [name, asked] of Object.entries(meaning.lists ?? {})) {
    const found = listIn(parts, asked);
    if (found) lists[name] = found;
    else missing.push(`list ${name}`);
  }
  const grids: Record<string, GridSpec> = {};
  for (const [name, asks] of Object.entries(meaning.grids ?? {})) {
    const found = (Array.isArray(asks) ? asks : [asks])
      .filter(asked => gridNames(asked).every(one => carries(parts, one)))
      .map(asked => gridIn(parts, asked))
      .find(grid => grid !== undefined);
    if (found) grids[name] = found;
    else missing.push(`slots ${name}`);
  }
  let bag: BagSpec | undefined;
  if (meaning.bag) {
    const run = gridIn(parts, { region: meaning.bag.run, slot: meaning.bag.slot });
    if (run?.pageBack && run.pageOn) {
      bag = {
        slot: run.slot,
        ...(run.face ? { face: run.face } : {}),
        ...(run.count ? { count: run.count } : {}),
        pageBack: run.pageBack,
        pageOn: run.pageOn,
        ...(Object.fromEntries(
          Object.entries(meaning.bag).filter(([, value]) => value !== undefined),
        ) as Partial<BagSpec>),
        sell: meaning.bag.sell,
        run: run.within ?? meaning.bag.run,
      };
    } else missing.push(`slots ${meaning.bag.run}`);
  }
  // A meter in two lengths, each holding the clip that climbs, is in
  // another build one clip laid straight into the meter: read as one length.
  let groups = meaning.groups;
  if (groups?.step && groups.fill) {
    const meters = [groups.morale, groups.vigor].filter((one): one is string => Boolean(one));
    const lengths = meters.some(meter => carries(parts, `${meter}/${groups!.fill}`));
    if (!lengths) {
      const { step, ...rest } = groups;
      groups = { ...rest, fill: step, fillBeyond: step };
    }
  }
  const tones: Record<string, string> = { ...meaning.tones };
  for (const [kind, field] of Object.entries(meaning.toneOf ?? {})) {
    const [from, ...rest] = field.split('/');
    const within = from ? planPiece(skin, from, { includeParked: true })?.parts : undefined;
    const colour = within?.find(part => part.path === rest.join('/'))?.text?.color;
    if (colour) tones[kind] = colour;
    else missing.push(`tone ${field}`);
  }
  if (missing.length)
    return { fallback: { reason: 'missing-part', missing: [...new Set(missing)] } };

  const inferred = tabsOf(parts);
  const tabs: TabSpec[] = inferred.tabs.map(tab => {
    const said = meaning.tabs?.find(one => one.control === tab.control);
    return said ? { ...tab, ...said } : tab;
  });
  for (const said of meaning.tabs ?? []) {
    if (tabs.some(tab => tab.control === said.control)) continue;
    const panel = said.panel ?? '';
    tabs.push({ caption: said.caption ?? panel, panel, ...said });
  }
  // Read the way the screen lays them out: across, then down. The first is
  // the one the screen opens on.
  const at = (path: string) => parts.find(part => part.path === path)?.box;
  tabs.sort((a, b) => {
    const one = at(a.control);
    const other = at(b.control);
    if (!one || !other) return 0;
    return Math.round(one.y / 8) - Math.round(other.y / 8) || one.x - other.x;
  });
  // The movie letters every tab in one colour, the pale one drawn for a
  // tab's dark face, and says nothing of the open tab's light one: the
  // palette's ink for text on parchment is what it is written in there.
  for (const tab of tabs) tab.openTone ??= OPEN_TAB_TONE;
  const panels = { ...inferred.panels, ...meaning.panels };

  const purse = meaning.purseIn === false ? undefined : purseIn(parts, meaning.purseIn ?? '');

  // What holds one of our values is not a caption, whatever it was
  // authored with: a price field written "99" and a type field written
  // with the name of a place on the body are both samples.
  const valueFields = new Set<string>([
    ...Object.values(meaning.values ?? {}),
    ...Object.values(meaning.purse ?? purse?.purse ?? {}),
    ...(meaning.combos ?? []).flatMap(combo => [combo.value, combo.list]),
    ...Object.keys(meaning.numbers ?? {}),
    ...Object.values(lists).flatMap(list => rowFieldPaths(list, parts)),
  ]);
  const skipped = (path: string): boolean =>
    [...valueFields].some(
      field => path === field || path.endsWith(`/${field}`) || inside(path, field),
    ) ||
    Object.values(lists).some(list => new RegExp(`(^|/)${list.row}\\d+(/|$)`).test(path)) ||
    Object.values(grids).some(grid =>
      new RegExp(`(^|/)${grid.slot}\\d+(/|$)`).test(path.slice((grid.within ?? '').length)),
    );
  const captions: Record<string, string> = captionsOf(parts, wordSet(words), skipped);
  for (const [where, what] of Object.entries(meaning.captions ?? {})) {
    if (what === MOVIE_TEXT) {
      const field = parts.find(part => part.path === where || part.path.endsWith(`/${where}`));
      const authored = field?.text?.words.trim();
      if (authored) captions[where] = authored;
    } else captions[where] = what;
  }
  // A caption for a field the table has given a value to would be written
  // under the value; the table's own word for it is the only exception.
  for (const where of Object.keys(captions)) {
    if (skipped(where) && !(where in (meaning.captions ?? {}))) delete captions[where];
  }

  const unavailable = { ...unavailableOf(parts, meaning.actions ?? {}), ...meaning.unavailable };
  const close = meaning.close ?? closeOf(parts);
  // A dialog with one set of page arrows turns its one list with them.
  const pager = meaning.paging ? undefined : pagerIn(parts, '');
  const frame = meaning.frame ?? frameOf(parts, meaning.dialog);
  // A plaque standing for nothing this client opens wears the face of a
  // control that cannot be used, where the movie gives it one; the movie
  // lays that face over every plaque, so one that opens something has it
  // taken off.
  const menu = meaning.menu ? menuIn(parts, meaning.menu) : undefined;
  const faceOf = (controls: readonly string[]): string[] =>
    controls
      .map(control => `${control}/disable`)
      .filter(face => parts.some(part => part.path === face));
  const idle = faceOf(menu?.idle ?? []);
  const usable = faceOf(menu?.items.map(item => item.control) ?? []);
  const shown = [...(meaning.shown ?? []), ...idle];
  const hidden = [...(meaning.hidden ?? []), ...usable];
  const rows: Record<string, number> = { ...meaning.rows };
  for (const [what, from] of Object.entries(meaning.rowsFrom ?? {})) {
    const at = quoteAt(from.quote, words);
    if (at !== undefined) rows[what] = at - from.less;
  }
  const own = Object.entries(meaning.bars?.own ?? {}).map(
    ([what, at]) =>
      [what, { at, frames: lastFaceOf(skin, meaning.dialog, parts, [at]) ?? 0 }] as const,
  );
  const runs = meaning.bars ? runsUnder(skin, meaning.dialog, parts, frame) : {};
  const bars = meaning.bars
    ? {
        of: meaning.bars.of,
        frames:
          meaning.bars.frames ??
          lastFaceOf(skin, meaning.dialog, parts, Object.values(meaning.bars.of)) ??
          0,
        ...(own.length ? { own: Object.fromEntries(own) } : {}),
        ...(Object.keys(runs).length ? { runs } : {}),
        ...(meaning.bars.runsFor ? { runsFor: meaning.bars.runsFor } : {}),
      }
    : undefined;

  const {
    tabs: _tabs,
    captions: _captions,
    lists: _lists,
    grids: _grids,
    bag: _bag,
    purseIn: _purseIn,
    optional: _optional,
    menu: _menu,
    bars: _bars,
    toneOf: _toneOf,
    rowsFrom: _rowsFrom,
    ...rest
  } = meaning;
  const spec: ScreenSpec = {
    ...rest,
    ...(frame ? { frame } : {}),
    ...(shown.length ? { shown } : {}),
    ...(hidden.length ? { hidden } : {}),
    ...(menu ? { items: menu.items } : {}),
    ...(bars ? { bars } : {}),
    ...(groups ? { groups } : {}),
    ...(Object.keys(tones).length ? { tones } : {}),
    ...(Object.keys(rows).length ? { rows } : {}),
    ...(close ? { close } : {}),
    ...(tabs.length ? { tabs } : {}),
    ...(Object.keys(panels).length ? { panels } : {}),
    ...(Object.keys(captions).length ? { captions } : {}),
    ...(Object.keys(lists).length ? { lists } : {}),
    ...(Object.keys(grids).length ? { grids } : {}),
    ...(bag ? { bag } : {}),
    ...(Object.keys(unavailable).length ? { unavailable } : {}),
    ...(pager
      ? { paging: { back: pager.back, on: pager.on, ...(pager.page ? { page: pager.page } : {}) } }
      : {}),
    ...(meaning.purse ? {} : purse ? { purse: purse.purse } : {}),
    ...(meaning.coins || !purse || !Object.keys(purse.coins).length ? {} : { coins: purse.coins }),
  };
  return { spec };
}

/** Every screen's spec from the movies read so far, and why the rest have none. */
export interface BuiltSpecs {
  spec: UiSpec;
  fallbacks: Record<string, ScreenFallback>;
}

/**
 * Every screen the table knows, built from the movies that have been read.
 *
 * `known` lists the screens the consumers ask for, so one the table has no
 * entry for is reported rather than silently missing.
 */
export function buildUiSpec(
  movies: ReadonlyMap<UiMovie, UiSkinData>,
  words: readonly string[],
  meanings: Readonly<Record<string, ScreenMeaning>>,
  known: readonly string[] = [],
): BuiltSpecs {
  const screens: Record<string, ScreenSpec> = {};
  const fallbacks: Record<string, ScreenFallback> = {};
  for (const name of known) if (!meanings[name]) fallbacks[name] = { reason: 'not-mapped' };
  for (const [name, meaning] of Object.entries(meanings)) {
    const skin = movies.get(meaning.movie ?? 'IGM');
    if (!skin) {
      fallbacks[name] = { reason: 'no-movie' };
      continue;
    }
    const built = buildScreenSpec(skin, words, meaning);
    if ('spec' in built) screens[name] = built.spec;
    else fallbacks[name] = built.fallback;
  }
  return { spec: { screens }, fallbacks };
}
