/**
 * What a dialog's structure says about it, from names, nesting and authored
 * words alone, so it runs on any mounted movie. What a part means to us is
 * not here. Takes parts as `planPiece` measures them with every state shown.
 */

import type { PiecePart } from './piecePlan';
import type { GridSpec, ListingSpec, MenuItemSpec, TabSpec } from './uiSpec';

/** The last step of a path. */
function tailOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Everything but the last step of a path, or '' at the top of the dialog. */
function parentOf(path: string): string {
  const at = path.lastIndexOf('/');
  return at < 0 ? '' : path.slice(0, at);
}

/** The parts directly inside `parent`, where '' is the dialog itself. */
function childrenOf(parts: readonly PiecePart[], parent: string): PiecePart[] {
  return parts.filter(part => parentOf(part.path) === parent);
}

/** Whether `path` is `region` or inside it; every path is inside ''. */
export function inside(path: string, region: string): boolean {
  return !region || path === region || path.startsWith(`${region}/`);
}

/** A part directly inside `parent` whose name is `name`, in any case. */
function childNamed(
  parts: readonly PiecePart[],
  parent: string,
  name: RegExp | string,
): PiecePart | undefined {
  const test = (tail: string): boolean =>
    typeof name === 'string' ? tail.toLowerCase() === name.toLowerCase() : name.test(tail);
  return childrenOf(parts, parent).find(part => test(tailOf(part.path)));
}

/** An object without the keys whose value is `undefined`. */
function defined<T extends object>(said: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(said).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}

/** How deep a path is. */
function depthOf(path: string): number {
  return path.split('/').length;
}

/** The shallowest `btnClose`, in any case: deeper ones shut sub-pages. */
export function closeOf(parts: readonly PiecePart[]): string | undefined {
  return parts
    .filter(part => /^btn_?close$/i.test(tailOf(part.path)))
    .sort((a, b) => depthOf(a.path) - depthOf(b.path))[0]?.path;
}

/** The window: a rectangle named after the dialog (`rectdlgItem`), else `btnempty`; the table may override. */
export function frameOf(parts: readonly PiecePart[], dialog: string): string | undefined {
  const own = tailOf(dialog).toLowerCase();
  return childNamed(parts, '', `rect${own}`)?.path ?? childNamed(parts, '', 'btnempty')?.path;
}

/** Our name for a panel, from the stem it shares with its tab: `Bid` → `bid`. */
function panelName(stem: string): string {
  return stem.charAt(0).toLowerCase() + stem.slice(1);
}

export interface InferredTabs {
  tabs: TabSpec[];
  /** Our name for each panel, and the path that draws it. */
  panels: Record<string, string>;
}

/** Tabs: `btn<Stem>` beside `panel<Stem>` under one parent; words from `text<Stem>` or `txt<Stem>`. */
export function tabsOf(parts: readonly PiecePart[]): InferredTabs {
  const tabs: TabSpec[] = [];
  const panels: Record<string, string> = {};
  for (const control of parts) {
    const stem = /^btn(.+)$/i.exec(tailOf(control.path))?.[1];
    if (!stem) continue;
    const parent = parentOf(control.path);
    const panel = childNamed(parts, parent, `panel${stem}`);
    if (!panel) continue;
    const name = panelName(stem);
    const text =
      childNamed(parts, parent, `text${stem}`) ?? childNamed(parts, parent, `txt${stem}`);
    panels[name] = panel.path;
    tabs.push({
      control: control.path,
      panel: name,
      caption: name,
      ...(text ? { text: text.path } : {}),
    });
  }
  return { tabs, panels };
}

/** A marked reference to one of the build's own words: `_T[Day 1]`. */
const REFERENCE = /^_T\[(.+)\]$/;

/** Words compared the way the build's string file is: by spelling, not case. */
function plain(word: string): string {
  return word.trim().toLowerCase();
}

/**
 * A field's authored caption: words in the build's string file (or one with
 * a colon), or a `_T[...]` mark. Placeholders (`asdasd`, `99`) are left for
 * the screen.
 */
function captionOf(authored: string, words: ReadonlySet<string>): string | undefined {
  const said = authored.trim();
  if (!said) return undefined;
  const marked = REFERENCE.exec(said);
  if (marked) return marked[1].trim() || undefined;
  if (/^[\d\s.,:/+-]*$/.test(said)) return undefined;
  const bare = said.endsWith(':') ? said.slice(0, -1) : said;
  return words.has(plain(said)) || words.has(plain(bare)) ? said : undefined;
}

/** The build's words, the way `captionOf` looks them up. */
export function wordSet(words: readonly string[]): Set<string> {
  return new Set(words.map(plain).filter(Boolean));
}

/** Every field authored with a caption; `skip` leaves out value fields whose sample word would cover the value. */
export function captionsOf(
  parts: readonly PiecePart[],
  words: ReadonlySet<string>,
  skip: (path: string) => boolean = () => false,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of parts) {
    if (!part.text || skip(part.path)) continue;
    const caption = captionOf(part.text.words, words);
    if (caption) out[part.path] = caption;
  }
  return out;
}

/** A name with a number on the end, split into the two: `item07` → `item`, 7. */
function numbered(name: string): { stem: string; at: number } | null {
  const found = /^(.*?)(\d+)$/.exec(name);
  return found && found[1] ? { stem: found[1], at: Number(found[2]) } : null;
}

/** Inside a numbered page after the first (`sub02`…): every page repeats the same slots. */
function onLaterPage(path: string, stop: string): boolean {
  const steps = path.split('/');
  const floor = stop ? stop.split('/').length : 0;
  for (let at = floor; at < steps.length - 1; at++) {
    const page = numbered(steps[at]);
    if (page && page.at > 1) return true;
  }
  return false;
}

/** A run of numbered siblings: where it sits and what each is called. */
interface SlotRunFound {
  /** The path the run sits directly inside. */
  within: string;
  /** The name each slot carries before its number. */
  slot: string;
  /** Every slot in the run, in the order of its number. */
  slots: PiecePart[];
}

/** Runs of numbered siblings in `region`, largest first; later pages repeat the first. */
function slotRunsIn(
  parts: readonly PiecePart[],
  region: string,
  slot?: string,
  points = false,
): SlotRunFound[] {
  const runs = new Map<string, SlotRunFound>();
  for (const part of parts) {
    if (!inside(part.path, region) || part.path === region || !(part.draws || points)) continue;
    const name = numbered(tailOf(part.path));
    if (!name || (slot && name.stem.toLowerCase() !== slot.toLowerCase())) continue;
    if (onLaterPage(part.path, region)) continue;
    const within = parentOf(part.path);
    const key = `${within}\u0000${name.stem}`;
    const run = runs.get(key) ?? { within, slot: name.stem, slots: [] };
    run.slots.push(part);
    runs.set(key, run);
  }
  return [...runs.values()]
    .filter(run => run.slots.length > 1 || slot !== undefined)
    .map(run => ({
      ...run,
      slots: run.slots.sort(
        (a, b) => (numbered(tailOf(a.path))?.at ?? 0) - (numbered(tailOf(b.path))?.at ?? 0),
      ),
    }))
    .sort((a, b) => b.slots.length - a.slots.length || depthOf(a.within) - depthOf(b.within));
}

/** A descendant of `root` whose last step is `name`, as a path relative to `root`. */
function relativeChild(
  parts: readonly PiecePart[],
  root: string,
  name: RegExp,
): string | undefined {
  const found = parts
    .filter(part => part.path.startsWith(`${root}/`) && name.test(tailOf(part.path)))
    .sort((a, b) => depthOf(a.path) - depthOf(b.path))[0];
  return found ? found.path.slice(root.length + 1) : undefined;
}

/** The pager group in `region`: `pageleftright…` with its arrows and page field. */
export interface PagerFound {
  back: string;
  on: string;
  page?: string;
  sort?: string;
}

/** A pager: `pageleftright` with `btnleft`, `btnright`, its `text` and `btnsort`; `name` picks one of two. */
export function pagerIn(
  parts: readonly PiecePart[],
  region: string,
  name: RegExp = /^pageleftright/i,
): PagerFound | undefined {
  const named = (within: string) =>
    parts.filter(part => inside(part.path, within) && name.test(tailOf(part.path)));
  // Inside the region first; a run whose arrows sit beside it rather than
  // in it — the strongbox keeps both pairs along its foot — is turned by
  // the one pair of that name anywhere in the dialog.
  const near = named(region);
  const groups = near.length ? near : named('');
  if (groups.length !== 1) return undefined;
  const at = groups[0].path;
  const back = childNamed(parts, at, 'btnleft');
  const on = childNamed(parts, at, 'btnright');
  if (!back || !on) return undefined;
  const page = childNamed(parts, at, 'text');
  const sort = childNamed(parts, at, 'btnsort');
  return {
    back: back.path,
    on: on.path,
    ...(page ? { page: page.path } : {}),
    ...(sort ? { sort: sort.path } : {}),
  };
}

/** What the table says about a run of slots: at least where to look. */
export type GridAsked = Partial<GridSpec> & {
  /** Where the run is to be found, where it is not the whole dialog. */
  region?: string;
  /** Which page-turning group turns it, where the dialog has more than one. */
  pager?: RegExp;
  /**
   * True for a run of points rather than of drawn slots: places the
   * screen draws its own things at, which the movie only marks.
   */
  driven?: boolean;
  /** True where the "run" is one slot, named outright by its path. */
  one?: boolean;
};

/** A run of item slots: the run, each slot's `bg` and `cnt`, and its paging arrows; the table's own words kept. */
export function gridIn(parts: readonly PiecePart[], asked: GridAsked): GridSpec | undefined {
  const { region = '', pager: pagerName, driven = false, one = false, ...given } = asked;
  const said = defined(given);
  if (one) {
    const slot = parts.find(part => part.path === said.slot)?.path;
    return slot ? { ...said, slot } : undefined;
  }
  const run = slotRunsIn(parts, said.within ?? region, said.slot, driven)[0];
  if (!run) return undefined;
  const first = run.slots[0].path;
  const face = childNamed(parts, first, 'bg') ? 'bg' : undefined;
  const count = relativeChild(parts, first, /^cnt$/i);
  const pager = pagerIn(parts, region, pagerName);
  return {
    slot: run.slot,
    within: run.within,
    ...(face ? { face } : {}),
    ...(count ? { count } : {}),
    ...(pager ? { pageBack: pager.back, pageOn: pager.on } : {}),
    ...(pager?.page ? { page: pager.page } : {}),
    ...(pager?.sort ? { sort: pager.sort } : {}),
    ...said,
  };
}

/** The coins a money field can sit beside, by the name the movie gives each. */
const COINS = ['Gold', 'Silver', 'Iron'] as const;

/** The coin beside a money field (`textGold` beside `iconGold`), or nothing. */
function coinBeside(parts: readonly PiecePart[], field: string): string | undefined {
  const coin = /text(Gold|Silver|Iron)$/i.exec(tailOf(field))?.[1];
  if (!coin) return undefined;
  return childNamed(parts, parentOf(field), `icon${coin}`)?.path;
}

/** Where the player's money is written: a group holding all three coin fields. */
export interface PurseFound {
  purse: Record<'gold' | 'silver' | 'copper', string>;
  coins: Record<string, string>;
}

/** The one group in `region` holding `textGold`, `textSilver` and `textIron`; none if two. */
export function purseIn(parts: readonly PiecePart[], region: string): PurseFound | undefined {
  const holders = new Set(
    parts
      .filter(part => inside(part.path, region) && /^textGold$/i.test(tailOf(part.path)))
      .map(part => parentOf(part.path)),
  );
  const complete = [...holders].filter(holder =>
    COINS.every(coin => childNamed(parts, holder, `text${coin}`)),
  );
  if (complete.length !== 1) return undefined;
  const at = complete[0];
  const field = (coin: (typeof COINS)[number]): string =>
    childNamed(parts, at, `text${coin}`)!.path;
  const coins: Record<string, string> = {};
  for (const [ours, coin] of [
    ['gold', 'Gold'],
    ['silver', 'Silver'],
    ['copper', 'Iron'],
  ] as const) {
    const icon = coinBeside(parts, field(coin));
    if (icon) coins[ours] = icon;
  }
  return { purse: { gold: field('Gold'), silver: field('Silver'), copper: field('Iron') }, coins };
}

/** Pairs of names that mark a list running on, above then below. */
const MORE_MARKS: ReadonlyArray<readonly [RegExp, RegExp]> = [
  [/^arrowup$/i, /^arrowdown$/i],
  [/^linetop$/i, /^linebottom$/i],
  [/^top$/i, /^bottom$/i],
];

/** What the table says about a list: at least the row name and its fields. */
export type ListAsked = Pick<ListingSpec, 'row' | 'fields'> &
  Partial<ListingSpec> & {
    /** Where the list is to be found, where it is not the whole dialog. */
    region?: string;
  };

/**
 * A list: the table names the row and its fields; the movie gives the mask
 * above the rows, the run-on marks (`arrowup`/`arrowdown`, `lineTop`/
 * `lineBottom`, `top`/`bottom`), the `selected` highlight, the item socket
 * (the part holding a `bluemask`) and each money field's coin.
 */
export function listIn(parts: readonly PiecePart[], asked: ListAsked): ListingSpec | undefined {
  const { region = '', ...given } = asked;
  const said = { ...defined(given), row: given.row, fields: given.fields };
  const pattern = new RegExp(`(^|/)${said.row}\\d+$`);
  const rows = parts
    .filter(part => inside(part.path, region) && pattern.test(part.path))
    .sort((a, b) => a.box.y - b.box.y);
  const first = rows[0];
  if (!first) return undefined;
  const holder = parentOf(first.path);

  let viewport: string | undefined;
  let more: ListingSpec['more'];
  for (let at = holder; ; at = parentOf(at)) {
    viewport ??= childrenOf(parts, at).find(
      part => part.mask && /mask$/i.test(tailOf(part.path)),
    )?.path;
    if (!more) {
      for (const [up, down] of MORE_MARKS) {
        const above = childNamed(parts, at, up);
        const below = childNamed(parts, at, down);
        if (above && below) {
          more = { above: above.path, below: below.path };
          break;
        }
      }
    }
    if (!at || at === region) break;
  }

  const chosen = relativeChild(parts, first.path, /^selected$/i);
  const socket = parts
    .filter(
      part =>
        part.path.startsWith(`${first.path}/`) &&
        part.draws &&
        childNamed(parts, part.path, /^bluemask$/i),
    )
    .sort((a, b) => depthOf(a.path) - depthOf(b.path))[0];
  const icon = socket ? socket.path.slice(first.path.length + 1) : undefined;

  const coins: Record<string, string> = {};
  for (const [what, field] of Object.entries(said.fields)) {
    const coin = coinBeside(parts, `${first.path}/${field}`);
    if (coin) coins[what] = coin.slice(first.path.length + 1);
  }

  return {
    view: holder,
    ...(viewport ? { viewport } : {}),
    ...(more ? { more } : {}),
    ...(chosen ? { chosen } : {}),
    ...(icon ? { icon } : {}),
    ...(Object.keys(coins).length ? { coins } : {}),
    ...said,
  };
}

/**
 * The face each control wears while it cannot act, by our name for what it
 * does: the control's own `disable` child.
 */
export function unavailableOf(
  parts: readonly PiecePart[],
  actions: Readonly<Record<string, string>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [where, what] of Object.entries(actions)) {
    const control = parts.find(part => part.path === where || part.path.endsWith(`/${where}`));
    if (!control) continue;
    const face = childNamed(parts, control.path, /^disable$/i);
    if (face) out[what] = face.path;
  }
  return out;
}

/** One entry of a menu, by the emblem the movie stands beside its plaque. */
export interface MenuAsked {
  icon: string;
  /** Our own name for the screen it opens; none where it opens nothing of ours. */
  screen?: string;
  says?: string;
}

export interface MenuFound {
  items: MenuItemSpec[];
  /** Plaques whose emblem stands for something this client does not open. */
  idle: string[];
}

/**
 * A menu: numbered plaques (`btn1`…) each with an emblem and words field.
 * Builds number plaques differently, so which is which comes from the emblem.
 */
export function menuIn(parts: readonly PiecePart[], asked: readonly MenuAsked[]): MenuFound {
  const plaques = slotRunsIn(parts, '', 'btn')[0]?.slots ?? [];
  const found: Array<MenuItemSpec & { y: number }> = [];
  const idle: string[] = [];
  for (const entry of asked) {
    const icon = childNamed(parts, '', entry.icon);
    if (!icon) continue;
    const middle = icon.box.y + icon.box.h / 2;
    const plaque = plaques.find(one => one.box.y <= middle && middle <= one.box.y + one.box.h);
    if (!plaque) continue;
    if (!entry.screen) {
      idle.push(plaque.path);
      continue;
    }
    const at = numbered(tailOf(plaque.path))?.at ?? 0;
    const text =
      parts.find(one => numbered(tailOf(one.path))?.at === at && /^text\d+$/i.test(one.path))
        ?.path ?? plaque.path;
    found.push({
      control: plaque.path,
      text,
      screen: entry.screen,
      ...(entry.says ? { says: entry.says } : {}),
      y: plaque.box.y,
    });
  }
  return {
    items: found.sort((a, b) => a.y - b.y).map(({ y: _y, ...item }) => item),
    idle,
  };
}
