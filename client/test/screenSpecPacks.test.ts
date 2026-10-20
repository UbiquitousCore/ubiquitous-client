/**
 * The screen table against the player's own builds.
 *
 * `screenMeanings.ts` names elements of the interface movie. This holds
 * every one of those names to the builds on disk, and follows every link a
 * screen makes — a tab to its panel, a value to its field, a list to its
 * rows — so a name that is misspelt, or that a build lays out differently,
 * fails here rather than on somebody's screen.
 *
 * Needs game data and skips without it: `.cache/<build>/res.bin`, or
 * `UBIQUITOUS_PACK=/path/to/res.bin`. The build the screens are held to is
 * 1.1.4, found as a directory of that name. Nothing here quotes the builds: only names
 * the table already holds, counts and reasons.
 */

import { existsSync, openAsBlob, readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { areaLinksId, itemFactsId, talentsId, uiSkinId, uiStringsId } from '../src/assets/ids';
import type { ItemFacts } from '../src/assets/types';
import { EQUIPMENT_SLOTS, equipmentHomesFor } from '../src/ui/items';
import { Library } from '../src/assets/vfs/Library';
import type { UiMovie } from '../src/assets/ids';
import type { UiSkinData } from '../src/assets/types';
import { findPlacements, frameAround, pieceNames, planPiece } from '../src/ui/art/piecePlan';
import type { PieceBox, PiecePart } from '../src/ui/art/piecePlan';
import { SCREEN_MEANINGS } from '../src/ui/art/screenMeanings';
import { buildUiSpec } from '../src/ui/art/screenSpecs';
import type { BuiltSpecs, ScreenMeaning } from '../src/ui/art/screenSpecs';
import { quoteAnswers, unquote } from '../src/ui/art/uiSpec';
import type { ScreenSpec } from '../src/ui/art/uiSpec';
import { KNOWN_SCREENS } from '../dev/knownScreens';
import { heroFaces, strangers } from '../src/ui/components/ArtPlayerFrame';
import { LINES } from '../src/ui/gameLines';
import { slotRefs } from '../src/ui/spellBarModel';
import { wheelRefs } from '../src/ui/spellWheelModel';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every build on disk, by the name of the directory it is in. */
function builds(): Map<string, string> {
  const found = new Map<string, string>();
  const explicit = (process.env.UBIQUITOUS_PACK ?? '').trim();
  if (explicit && existsSync(explicit)) found.set(dirname(explicit), explicit);
  const base = join(ROOT, '.cache');
  if (existsSync(base)) {
    for (const dir of readdirSync(base).sort()) {
      const pack = join(base, dir, 'res.bin');
      if (existsSync(pack)) found.set(dir, pack);
    }
  }
  return found;
}

const BUILDS = builds();
/**
 * The build every mapped screen must draw in, and every quote is numbered
 * by: 1.1.4, the build the client targets. Any other build on disk is only
 * held to what every build must carry.
 */
const TARGET = [...BUILDS.keys()].find(build => basename(build) === '1.1.4');

interface Read {
  /** Every file name in the build's interface pack, in lower case. */
  files: Set<string>;
  movies: Map<UiMovie, UiSkinData>;
  words: readonly string[];
  built: BuiltSpecs;
  /** Each class's talent trees, where the build's tables sit beside it. */
  trees: number[];
  /** The world map's press area for each region, by the name the layout file gives it. */
  regionButtons: Record<number, string>;
}

const read = new Map<string, Read>();

beforeAll(async () => {
  for (const [build, pack] of BUILDS) {
    const provider = new PackAssetProvider();
    const file = new File([await openAsBlob(pack)], 'res.bin');
    const tablesAt = join(dirname(pack), 'tables.bin');
    const tables = existsSync(tablesAt)
      ? [new File([await openAsBlob(tablesAt)], 'tables.bin')]
      : [];
    await provider.useSource(provider.offer([file, ...tables]).id);
    const talents = await provider.load(talentsId()).catch(() => null);
    const movies = new Map<UiMovie, UiSkinData>();
    for (const movie of ['IGM', 'LGM'] as const) {
      const skin = await provider.load(uiSkinId(movie)).catch(() => null);
      if (skin) movies.set(movie, skin);
    }
    const words = await provider.load(uiStringsId()).catch(() => []);
    const listed = await (await Library.mountPack(file)).pack('res.bin');
    read.set(build, {
      files: new Set(listed.entries.map(entry => entry.name.toLowerCase())),
      movies,
      words,
      built: buildUiSpec(movies, words, SCREEN_MEANINGS, KNOWN_SCREENS),
      trees: talents?.trees.flatMap(row => row.trees) ?? [],
      regionButtons: (await provider.load(areaLinksId()).catch(() => null))?.buttons ?? {},
    });
  }
}, 300_000);

/** The dialog's parts with every state showing, or null where it has none. */
function partsOf(one: Read, meaning: ScreenMeaning): PiecePart[] | null {
  const skin = one.movies.get(meaning.movie ?? 'IGM');
  return skin ? (planPiece(skin, meaning.dialog, { includeParked: true })?.parts ?? null) : null;
}

/** Whether a part is `name`, ends in it, or is one of a numbered run of it. */
function carried(parts: readonly PiecePart[], name: string): boolean {
  const run = new RegExp(`(^|/)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\d+$`);
  return parts.some(
    part => part.path === name || part.path.endsWith(`/${name}`) || run.test(part.path),
  );
}

/** Every element name a table entry writes down, wherever it writes it. */
function namesIn(meaning: ScreenMeaning): string[] {
  const out: string[] = [];
  const walk = (value: unknown, key: string): void => {
    if (typeof value === 'string') {
      if (ELEMENT_KEYS.has(key)) out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const one of value) walk(one, key);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [inner, held] of Object.entries(value)) {
        if (OURS.has(inner)) continue;
        // A piece drawn out of another dialog is held to that dialog below.
        if (inner === 'pieces') continue;
        // A picture the screen draws itself: the spot is an element, the
        // file is held to the icons the build ships, below.
        if (inner === 'emblems' && held && typeof held === 'object') {
          for (const one of Object.values(held as NonNullable<ScreenSpec['emblems']>))
            out.push(one.at);
          continue;
        }
        // A card's controls are keyed by what they do, which is ours.
        if (inner === 'card' && held && typeof held === 'object') {
          const card = held as NonNullable<ScreenSpec['card']>;
          for (const name of [
            card.title,
            card.body,
            card.compare,
            card.equipped,
            card.equippedLine,
          ])
            if (name) out.push(name);
          for (const one of Object.values(card.actions ?? {}))
            out.push(...[one.strip, one.control, one.label].filter((n): n is string => Boolean(n)));
          continue;
        }
        // Records keyed by element: the key is the name, and what it maps
        // to is ours — a word, or what the element does.
        if (KEYED_BY_ELEMENT.has(key)) {
          out.push(inner);
          continue;
        }
        walk(held, VALUES_ARE_ELEMENTS.has(key) ? 'element' : inner);
      }
    }
  };
  walk(meaning, '');
  return out.filter(name => name && !name.includes('@'));
}

/** Fields whose string values are element names. */
const ELEMENT_KEYS = new Set([
  'element',
  'dialog',
  'frame',
  'close',
  'control',
  'text',
  'list',
  'value',
  'row',
  'region',
  'within',
  'slot',
  'face',
  'count',
  'sell',
  'name',
  'run',
  'back',
  'on',
  'page',
  'hidden',
  'shown',
  'optional',
  'viewport',
  'chosen',
  'icon',
  'pageBack',
  'pageOn',
  'sort',
]);
/** Records whose values are element names, whatever each is keyed by. */
const VALUES_ARE_ELEMENTS = new Set([
  'values',
  'panels',
  'groups',
  'purse',
  'coins',
  'amounts',
  'unavailable',
  'fields',
]);
/** What holds our own words and numbers rather than element names. */
const OURS = new Set(['words', 'formats', 'conditions', 'options', 'optionsBy', 'caption', 'of']);
/**
 * Values a screen shows by turning a part to one of its faces rather than
 * by writing into it: a bar that empties frame by frame.
 */
const STEPPED = new Set(['expBar']);
/**
 * Tabs that change what one panel shows rather than opening a panel of
 * their own: buying or selling, and which of a class's trees is up.
 */
const SWITCHES = new Set(['buy', 'sell', 'treeOne', 'treeTwo']);

/** A caption quoted by its number in the build's string file. */
const QUOTED = /^@\d+/;

/** Every quoted word a table entry writes down, keys included. */
function quotesIn(value: unknown, all = false): string[] {
  if (typeof value === 'string') return QUOTED.test(value) ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(one => quotesIn(one, all));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, held]) =>
      // Rows found by a word are left out of a build that lacks it, so
      // only the target build is held to having it.
      key === 'rowsFrom' && !all ? [] : [...quotesIn(key, all), ...quotesIn(held, all)],
    );
  }
  return [];
}

/** Every icon file a table entry names, under the build's icon directory. */
function iconsIn(meaning: ScreenMeaning): string[] {
  return [
    ...Object.values(meaning.pictures ?? {}).flat(),
    ...Object.values(meaning.emblems ?? {}).flatMap(one => [
      ...(one.icon ? [one.icon] : []),
      ...Object.values(one.icons ?? {}),
    ]),
    ...Object.values(meaning.grids ?? {})
      .flatMap(grid => (Array.isArray(grid) ? grid : [grid]))
      .flatMap(grid => grid.empty?.icons ?? []),
    ...(meaning.tabs ?? []).flatMap(tab => (tab.icon ? [tab.icon] : [])),
  ];
}

/**
 * The message boxes and cards whose frame takes in art spilling over
 * their backdrop: the screens whose consumers ask `useWorn` to.
 */
const SPILLING = [
  'teamAsk',
  'voteKickAsk',
  'tradeAsk',
  'duelAsk',
  'travelAsk',
  'bagUpgradeAsk',
  'bagUpgradeShort',
  'discardAsk',
  'deleteCharacter',
  'held',
  'equipped',
  'itemList',
  'talentCard',
  'spellCard',
];

/** Records keyed by element name. */
const KEYED_BY_ELEMENT = new Set(['captions', 'numbers', 'actions', 'edits', 'faces']);

describe.skipIf(!BUILDS.size)('the screen table, against the player’s builds', () => {
  it('names only elements some build on disk carries', () => {
    const unknown: string[] = [];
    for (const [screen, meaning] of Object.entries(SCREEN_MEANINGS)) {
      for (const name of namesIn(meaning)) {
        if (name === meaning.dialog) continue;
        const anywhere = [...read.values()].some(one => {
          const parts = partsOf(one, meaning);
          return parts !== null && carried(parts, name);
        });
        if (!anywhere) unknown.push(`${screen}: ${name}`);
      }
    }
    expect(unknown).toEqual([]);
  }, 60_000);

  it.skipIf(!TARGET)('reads names the movie itself uses, in the inference and in its tests', () => {
    // `dialogShape` looks for these by name, and `dialogShape.test.ts`
    // builds its made-up dialogs out of them. Each is a name the target
    // build gives some part of its interface.
    const named = new Set(pieceNames(read.get(TARGET!)!.movies.get('IGM')!));
    const conventions = [
      'btnClose',
      'btnclose',
      'btnempty',
      'btnEmpty',
      'textGold',
      'textSilver',
      'textIron',
      'iconGold',
      'iconSilver',
      'iconIron',
      'pageleftright',
      'btnleft',
      'btnright',
      'btnsort',
      'selected',
      'disable',
      'arrowup',
      'arrowdown',
      'lineTop',
      'lineBottom',
      'top',
      'bottom',
      'bg',
      'btn1',
      'text1',
    ];
    expect(conventions.filter(name => !named.has(name))).toEqual([]);
  });

  it('steps every bar through a run of faces the movie carries', () => {
    for (const [build, one] of read) {
      for (const [screen, spec] of Object.entries(one.built.spec.screens)) {
        if (spec.bars) expect(spec.bars.frames, `${build} ${screen}`).toBeGreaterThan(1);
      }
    }
  });

  it('reads the runs of every bar the hero, the target and the team wear off its clip', () => {
    for (const [build, one] of read) {
      const { playerFrame, targetFrame, teamFrames } = one.built.spec.screens;
      const runs = (spec: typeof playerFrame, path: string) => spec?.bars?.runs?.[path];
      // One run per colour the target's health fills with, as many as the
      // screen table says who they are for, every run longer than one face.
      const health = runs(targetFrame, targetFrame!.bars!.of.health!);
      expect(health?.length, build).toBe(targetFrame?.bars?.runsFor?.health?.length);
      expect(
        health?.every(run => run.last > run.first),
        build,
      ).toBe(true);
      // Every other bar is one run over all its faces.
      for (const bar of ['mana', 'morale', 'vigor'] as const) {
        expect(runs(targetFrame, targetFrame!.bars!.of[bar]!)?.length, `${build} ${bar}`).toBe(1);
      }
      for (const bar of ['health', 'mana', 'exp'] as const) {
        expect(runs(playerFrame, playerFrame!.bars!.of[bar]!)?.length, `${build} ${bar}`).toBe(1);
      }
      const row = `${teamFrames!.groups!.member1}/${teamFrames!.bars!.of.health}`;
      expect(runs(teamFrames, row), build).toHaveLength(1);
      // And the meter a warrior fills has a clip of its own to climb.
      const meter = Object.keys(playerFrame?.bars?.runs ?? {}).filter(path =>
        path.startsWith(`${playerFrame!.groups!.morale}/`),
      );
      expect(meter.length, build).toBeGreaterThan(0);
    }
  });

  it('finds the cast bar standing on the stage of every build, as a clip of faces', () => {
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.castBar;
      expect(spec?.bars?.of.cast, build).toBe(spec?.dialog);
      expect(spec?.bars?.frames, build).toBeGreaterThan(1);
    }
  });

  it.skipIf(!TARGET)(
    'finds the spell bar’s twelve slots and the mount’s, each with the parts it is drawn by',
    () => {
      const target = read.get(TARGET!)!;
      const spec = target.built.spec.screens.spellBar!;
      expect(spec, 'spellBar').toBeDefined();
      const parts = partsOf(target, SCREEN_MEANINGS.spellBar!)!;
      const names = spec.groups!;
      const grid = spec.grids!.slots!;
      const refs = slotRefs(parts, {
        slot: grid.slot,
        within: grid.within!,
        mount: names.mount,
        sweep: names.sweep!,
        unusable: names.unusable!,
        short: names.short!,
        lit: names.lit!,
        resting: names.resting!,
        flash: names.flash!,
      });
      // Twelve in a numbered run, and the mount's after them.
      expect(refs).toHaveLength(13);
      const paths = new Set(parts.map(part => part.path));
      for (const slot of refs) {
        for (const one of [
          slot.resting,
          slot.flash,
          slot.sweep,
          slot.unusable,
          slot.short,
          slot.lit,
        ]) {
          expect(paths.has(one), `${slot.path} → ${one}`).toBe(true);
        }
        // The tint is the circle the icon sits in: inside the slot, and not the whole of it.
        const plate = parts.find(part => part.path === slot.path)!.box;
        const tint = parts.find(part => part.path === slot.unusable)!.box;
        expect(tint.w, slot.path).toBeLessThan(plate.w);
        expect(tint.x, slot.path).toBeGreaterThan(plate.x);
      }
      // The sweep is a clip of many faces, the flash a shorter one, and the
      // dialog has a face for each state of its handle.
      expect(spec.bars!.frames).toBeGreaterThan(spec.bars!.own!.flash!.frames);
      expect(spec.bars!.own!.flash!.frames).toBeGreaterThan(1);
      const skin = target.movies.get('IGM')!;
      const dialog = findPlacements(skin, spec.dialog)[0]!;
      expect(skin.sprites.find(sprite => sprite.id === dialog.characterId)?.frameCount).toBe(2);
      const closed = planPiece(skin, spec.dialog, {
        includeParked: true,
        frames: { [spec.dialog]: 1 },
      })!;
      expect(closed.parts.some(part => part.path === names.handle)).toBe(false);
      expect(
        closed.parts.some(
          part => !part.path.includes('/') && part.draws && !spec.frame!.includes(part.path),
        ),
      ).toBe(true);
    },
  );

  it.skipIf(!TARGET)(
    'finds the ring’s twelve slots, each with a sweep and effects beside it',
    () => {
      const target = read.get(TARGET!)!;
      const spec = target.built.spec.screens.spellWheel!;
      expect(spec, 'spellWheel').toBeDefined();
      const parts = partsOf(target, SCREEN_MEANINGS.spellWheel!)!;
      const names = spec.groups!;
      const refs = wheelRefs(parts, {
        slot: spec.grids!.slots!.slot,
        within: spec.grids!.slots!.within!,
        sweep: names.sweep!,
        effects: names.effects!,
        flash: names.flash!,
        glow: names.glow!,
      });
      expect(refs).toHaveLength(12);
      const paths = new Set(parts.map(part => part.path));
      for (const slot of refs) {
        for (const one of [slot.sweep, slot.flash, slot.glow]) {
          expect(paths.has(one), `${slot.path} → ${one}`).toBe(true);
        }
      }
      // The sweep is the longer clip, and the ring is more than a screen's height across.
      expect(spec.bars!.frames).toBeGreaterThan(spec.bars!.own!.flash!.frames);
      const frame = parts.find(part => part.path === spec.frame)!;
      expect(frame.box.w).toBeGreaterThan(200);
    },
  );

  it.skipIf(!TARGET)('finds the jump button as a clip of two faces in the target build', () => {
    const target = read.get(TARGET!)!;
    const spec = target.built.spec.screens.jumpButton!;
    expect(spec, 'jumpButton').toBeDefined();
    const skin = target.movies.get('IGM')!;
    const parts = partsOf(target, SCREEN_MEANINGS.jumpButton!)!;
    const face = parts.find(part => part.path === spec.groups!.face)!;
    expect(face.draws).toBe(true);
    const held = findPlacements(skin, `${spec.dialog}/${spec.groups!.face}`)[0]!;
    expect(skin.sprites.find(sprite => sprite.id === held.characterId)?.frameCount).toBe(2);
  });

  it.skipIf(!TARGET)('gives the chest its sort button, live, in the target build', () => {
    const spec = read.get(TARGET!)!.built.spec.screens.storage!;
    expect(spec.grids?.bank?.sort).toBe('btnsort');
    expect(spec.grids?.bag?.sort).toBeUndefined();
    expect(spec.shown ?? []).not.toContain('btnsort/disable');
  });

  it('names every talent tree the build’s tables list, in every build', () => {
    for (const [build, one] of read) {
      if (!one.trees.length) continue;
      const from = one.built.spec.screens.talents?.rows?.treeWords;
      expect(from, build).toBeDefined();
      if (from === undefined) continue;
      const unnamed = one.trees.filter(
        tree => !/^[A-Z][A-Za-z ]+$/.test(one.words[tree + from] ?? ''),
      );
      expect(unnamed, build).toEqual([]);
    }
  });

  it('frames the talent card on its controls as well as its words', () => {
    // A card framed on its sheet alone leaves the controls under it off
    // the picture, and off the view once the card is kept inside it.
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.talentCard;
      if (!spec) continue;
      const parts = partsOf(one, spec as ScreenMeaning) ?? [];
      const framed = (Array.isArray(spec.frame) ? spec.frame : [spec.frame ?? ''])
        .map(name => parts.find(part => part.path === name))
        .filter((part): part is PiecePart => part !== undefined);
      const bottom = Math.max(...framed.map(part => part.box.y + part.box.h));
      for (const control of Object.keys(spec.actions ?? {})) {
        const part = parts.find(one => one.path.endsWith(`/${control}`));
        expect(part, `${build} ${control}`).toBeDefined();
        expect(part!.box.y + part!.box.h, `${build} ${control}`).toBeLessThanOrEqual(bottom);
      }
    }
  });

  it('frames every message box and card on all it draws over its backdrop’s edges', () => {
    // The ring a box's mark sits in stands over the box's top edge, and a
    // list's band and close mark over the top of its backdrop. Framed on
    // the backdrop alone, their tops were cut off.
    const within = (inner: PieceBox, outer: PieceBox): boolean =>
      inner.x >= outer.x - 0.01 &&
      inner.y >= outer.y - 0.01 &&
      inner.x + inner.w <= outer.x + outer.w + 0.01 &&
      inner.y + inner.h <= outer.y + outer.h + 0.01;
    let boxes = 0;
    for (const [build, one] of read) {
      for (const screen of SPILLING) {
        const spec = one.built.spec.screens[screen];
        const skin = spec && one.movies.get(spec.movie ?? 'IGM');
        if (!spec || !skin) continue;
        const whole = planPiece(skin, spec.dialog, { includeParked: true })!;
        const sheet = spec.panels?.sheet;
        const drawn = planPiece(skin, spec.dialog, {
          shown: spec.shown ?? [],
          hidden: [...(spec.hidden ?? []), ...(sheet ? [sheet] : [])],
        })!;
        const named = [spec.frame ?? []]
          .flat()
          .map(name =>
            whole.parts.find(part => (part.path === name || part.name === name) && part.draws),
          )
          .filter((part): part is PiecePart => part !== undefined)
          .map(part => ({ ...part.box, x: part.box.x + whole.box.x, y: part.box.y + whole.box.y }));
        expect(named.length, `${build} ${screen}`).toBeGreaterThan(0);
        const left = Math.min(...named.map(box => box.x));
        const top = Math.min(...named.map(box => box.y));
        const backdrop = {
          x: left,
          y: top,
          w: Math.max(...named.map(box => box.x + box.w)) - left,
          h: Math.max(...named.map(box => box.y + box.h)) - top,
        };
        const moved = (box: PieceBox): PieceBox => ({
          ...box,
          x: box.x + drawn.box.x,
          y: box.y + drawn.box.y,
        });
        const stage = { w: skin.width, h: skin.height };
        const frame = frameAround(backdrop, drawn.painted.map(moved), stage);
        // Nothing drawn that reaches the frame is cut by it.
        for (const painted of drawn.painted.map(moved)) {
          const sheetLike = painted.w >= stage.w && painted.h >= stage.h;
          const reaches =
            painted.x < frame.x + frame.w &&
            painted.x + painted.w > frame.x &&
            painted.y < frame.y + frame.h &&
            painted.y + painted.h > frame.y;
          if (reaches && !sheetLike)
            expect(within(painted, frame), `${build} ${screen}`).toBe(true);
        }
        // The spot the mark goes in is on the picture, and so is the close
        // control — its middle, since its hit-area runs wider than its art.
        const spot = spec.emblems?.mark?.at;
        const marked = spot ? drawn.parts.find(one => one.path === spot) : undefined;
        if (spot) expect(marked?.spot, `${build} ${screen}`).toBeDefined();
        if (marked?.spot)
          expect(within(moved(marked.spot), frame), `${build} ${screen}`).toBe(true);
        const shut = spec.close ? drawn.parts.find(one => one.path === spec.close) : undefined;
        if (shut) {
          const at = moved(shut.box);
          const middle = { x: at.x + at.w / 2, y: at.y + at.h / 2, w: 0, h: 0 };
          expect(within(middle, frame), `${build} ${screen} close`).toBe(true);
        }
        // A message box's ring stands over the top of its backdrop.
        if (spec.emblems?.mark) {
          expect(frame.y, `${build} ${screen}`).toBeLessThan(backdrop.y);
          boxes += 1;
        }
      }
    }
    expect(boxes).toBeGreaterThan(0);
  });

  it('stands every aura on the movie’s own spot for one, in every build', () => {
    // Both rims, the stack badge and its count, and the point the spell's
    // picture goes, all inside the one spot — and the picture square, with
    // the same margin all round, inside it.
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.auraIcon;
      expect(spec, build).toBeDefined();
      const parts = partsOf(one, spec as ScreenMeaning) ?? [];
      const at = (path: string | undefined): PiecePart | undefined =>
        parts.find(part => part.path === path);
      const spot = at(spec!.frame as string);
      expect(spot, build).toBeDefined();
      for (const name of [
        ...Object.values(spec!.groups ?? {}),
        ...Object.values(spec!.values ?? {}),
      ]) {
        const part = at(name);
        expect(part, `${build} ${name}`).toBeDefined();
        expect(part!.box.x, `${build} ${name}`).toBeGreaterThanOrEqual(spot!.box.x - 0.5);
        expect(part!.box.x + part!.box.w, `${build} ${name}`).toBeLessThanOrEqual(
          spot!.box.x + spot!.box.w + 0.5,
        );
      }
      const picture = at(spec!.groups?.picture)!;
      const inset = picture.box.x - spot!.box.x;
      const side = spot!.box.w - 2 * inset;
      expect(side, build).toBeGreaterThan(spot!.box.w / 2);
      expect(picture.box.y - spot!.box.y + side, build).toBeLessThanOrEqual(spot!.box.h + 0.5);
    }
  });

  it('frames the aura card on its words and its close control alone', () => {
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.auraCard;
      expect(spec, build).toBeDefined();
      expect(spec!.close, build).toBeDefined();
      expect(unquote(spec!.formats?.timeLeft ?? '', one.words), build).toContain('%s');
    }
  });

  it('puts away all of the talent card’s confirm with nothing staged, the plate under it too', () => {
    // The button is not all of it: the panel it sits in draws a plate of
    // its own, which put away with the button alone stays on the card.
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.talentCard;
      const skin = one.movies.get('IGM');
      if (!spec || !skin) continue;
      const button = Object.entries(spec.actions ?? {}).find(([, what]) => what === 'confirm')?.[0];
      const whole = spec.groups?.confirm;
      expect(button, build).toBeDefined();
      expect(whole, build).toBeDefined();
      const parts = partsOf(one, spec as ScreenMeaning) ?? [];
      const panel = parts.find(part => part.path.endsWith(`/${whole}`));
      expect(
        parts.some(part => part.path.startsWith(`${panel?.path}/`) && part.name === button),
        build,
      ).toBe(true);
      const opsWithout = (name: string) =>
        planPiece(skin, spec.dialog, { hidden: [name] })?.ops.length ?? 0;
      expect(opsWithout(whole!), build).toBeLessThan(opsWithout(button!));
    }
  });

  it('draws every piece out of a dialog that carries it', () => {
    const unknown: string[] = [];
    for (const [screen, meaning] of Object.entries(SCREEN_MEANINGS)) {
      for (const [what, piece] of Object.entries(meaning.pieces ?? {})) {
        const from = { ...meaning, dialog: piece.dialog ?? meaning.dialog };
        const names = [piece.part, ...(piece.without ?? []).map(one => `${piece.part}/${one}`)];
        for (const name of names) {
          const anywhere = [...read.values()].some(one => {
            const parts = partsOf(one, from);
            return parts !== null && carried(parts, name);
          });
          if (!anywhere) unknown.push(`${screen} ${what}: ${name}`);
        }
      }
    }
    expect(unknown).toEqual([]);
  });

  it('quotes only words every build carries, where the quote says what it expects', () => {
    const unanswered: string[] = [];
    for (const [build, one] of read) {
      for (const [screen, meaning] of Object.entries(SCREEN_MEANINGS)) {
        for (const quote of quotesIn(meaning)) {
          if (quoteAnswers(quote, one.words)) continue;
          // An older build may predate a word altogether — a place on the
          // body none of its items are worn in. Then nothing asks for it.
          const expected = /\?(.+?)(?:#\d+)?$/.exec(quote)?.[1]?.toLowerCase();
          const predates =
            build !== TARGET &&
            expected !== undefined &&
            !one.words.some(word => word.trim().toLowerCase().startsWith(expected));
          if (!predates) unanswered.push(`${build} ${screen}: ${quote}`);
        }
      }
    }
    expect(unanswered).toEqual([]);
  });

  it.skipIf(!TARGET)('quotes each word by the number it has in the target build', () => {
    const words = read.get(TARGET!)!.words;
    const moved: string[] = [];
    for (const [screen, meaning] of Object.entries(SCREEN_MEANINGS)) {
      for (const quote of quotesIn(meaning, true)) {
        const [, at, expected] = /^@(\d+)(?:\?(.+?))?(?:#(\d+))?$/.exec(quote)!;
        const there = words[Number(at)] ?? '';
        if (!there || (expected && !quoteAnswers(`@0?${expected}`, [there])))
          moved.push(`${screen}: ${quote}`);
      }
    }
    expect(moved).toEqual([]);
  });

  it('names only icon files every build ships', () => {
    const missing: string[] = [];
    for (const [build, one] of read) {
      for (const [screen, meaning] of Object.entries(SCREEN_MEANINGS)) {
        for (const file of iconsIn(meaning)) {
          if (!one.files.has(`ui/icons/${file}`.toLowerCase())) {
            missing.push(`${build} ${screen}: ${file}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it.skipIf(!TARGET)(
    'places a press area on the world map for every region the layout names',
    () => {
      const target = read.get(TARGET!)!;
      const parts = planPiece(target.movies.get('IGM')!, 'dlgworldmap', {
        includeParked: true,
      })!.parts;
      const group = SCREEN_MEANINGS.worldMap!.groups!.regions!;
      const names = Object.values(target.regionButtons);
      expect(names.length).toBeGreaterThan(0);
      const missing = names.filter(
        name => !parts.some(part => part.path.toLowerCase() === `${group}/${name}`.toLowerCase()),
      );
      expect(missing).toEqual([]);
    },
  );

  it.skipIf(!TARGET)('ships a picture of each region’s network beside the plain picture', () => {
    const { files } = read.get(TARGET!)!;
    const withNetwork = [...files]
      .map(name => /^2d_texture\/maps\/(\d+)_airline\.tga$/.exec(name)?.[1])
      .filter((id): id is string => id !== undefined);
    expect(withNetwork.length).toBeGreaterThan(0);
    expect(withNetwork.filter(id => !files.has(`2d_texture/maps/${id}.tga`))).toEqual([]);
  });

  it.skipIf(!TARGET)('draws every mapped screen from the target build', () => {
    const target = read.get(TARGET!)!;
    const refused = Object.keys(SCREEN_MEANINGS).filter(
      screen => !(screen in target.built.spec.screens),
    );
    expect(Object.fromEntries(refused.map(one => [one, target.built.fallbacks[one]]))).toEqual({});
  });

  it('gives a named reason for every screen a consumer knows and a build does not draw', () => {
    for (const one of read.values()) {
      for (const screen of KNOWN_SCREENS) {
        if (screen in one.built.spec.screens) continue;
        const reason = one.built.fallbacks[screen];
        expect(reason, screen).toBeDefined();
        expect(['no-movie', 'not-mapped', 'no-dialog', 'missing-part']).toContain(reason!.reason);
        // A screen the table maps is only ever refused for a reason that
        // names what is missing.
        if (SCREEN_MEANINGS[screen]) expect(reason!.reason, screen).not.toBe('not-mapped');
      }
    }
  });

  it('opens a panel that exists from every tab', () => {
    for (const [build, one] of read) {
      for (const [screen, spec] of Object.entries(one.built.spec.screens)) {
        const parts = partsOf(one, SCREEN_MEANINGS[screen]!)!;
        for (const tab of spec.tabs ?? []) {
          expect(carried(parts, tab.control), `${build} ${screen} ${tab.control}`).toBe(true);
          if (tab.text)
            expect(carried(parts, tab.text), `${build} ${screen} ${tab.text}`).toBe(true);
          // A tab opens one of the screen's own panels, where it has any.
          if (spec.panels && Object.keys(spec.panels).length && !SWITCHES.has(tab.panel)) {
            // Named by the panel's own element where a screen does that.
            const panel =
              spec.panels[tab.panel] ?? (carried(parts, tab.panel) ? tab.panel : undefined);
            expect(panel, `${build} ${screen} ${tab.control} → ${tab.panel}`).toBeDefined();
            expect(carried(parts, panel!), `${build} ${screen} ${panel}`).toBe(true);
          }
        }
      }
    }
  });

  it('writes every value into a text field', () => {
    for (const [build, one] of read) {
      for (const [screen, spec] of Object.entries(one.built.spec.screens)) {
        const meaning = SCREEN_MEANINGS[screen]!;
        const parts = partsOf(one, meaning)!;
        const optional = new Set(meaning.optional ?? []);
        const fieldAt = (name: string): PiecePart | undefined => {
          const found = parts.find(part => part.path === name || part.path.endsWith(`/${name}`));
          if (!found || found.text) return found;
          return parts.find(inner => inner.path.startsWith(`${found.path}/`) && inner.text);
        };
        const writes = (what: string, name: string): void => {
          if (optional.has(name) && !fieldAt(name)) return;
          expect(fieldAt(name)?.text, `${build} ${screen} ${what} → ${name}`).toBeDefined();
        };
        for (const [what, name] of Object.entries(spec.values ?? {})) {
          if (!STEPPED.has(what)) writes(what, name);
        }
        for (const [what, name] of Object.entries(spec.purse ?? {})) writes(what, name);
        for (const where of Object.keys(spec.captions ?? {})) writes('caption', where);
        for (const combo of spec.combos ?? []) writes(combo.of, combo.value);
      }
    }
  });

  /**
   * Each step of making a character draws a wide band across its top for
   * its title, and some a boxed strip under it with a field of its own.
   * The title belongs in the band: above every other field on the screen.
   */
  it('letters each step of making a character in the band across its top', () => {
    const titles: Record<string, RegExp> = {
      race: /YOUR RACE$/,
      class: /YOUR CLASS$/,
      look: /YOUR FEATURES$/,
    };
    for (const [build, one] of read) {
      for (const [screen, title] of Object.entries(titles)) {
        const meaning = SCREEN_MEANINGS[screen]!;
        const at = Object.entries(meaning.captions ?? {}).find(
          ([, words]) => typeof words === 'string' && title.test(unquote(words, one.words)),
        )?.[0];
        expect(at, `${build} ${screen}`).toBeDefined();
        expect(meaning.hidden ?? [], `${build} ${screen}`).not.toContain(at);
        const fields = partsOf(one, meaning)!.filter(part => part.text);
        const field = fields.find(part => part.path === at)!;
        expect(field, `${build} ${screen} ${at}`).toBeDefined();
        for (const other of fields) {
          if (other === field) continue;
          expect(
            field.box.y + field.box.h,
            `${build} ${screen} ${at} over ${other.path}`,
          ).toBeLessThanOrEqual(other.box.y);
        }
      }
    }
  });

  it('finds rows, and a field in each for every column and control, in every list', () => {
    for (const [build, one] of read) {
      for (const [screen, spec] of Object.entries(one.built.spec.screens) as [
        string,
        ScreenSpec,
      ][]) {
        const parts = partsOf(one, SCREEN_MEANINGS[screen]!)!;
        for (const [name, list] of Object.entries(spec.lists ?? {})) {
          const rows = parts.filter(part => new RegExp(`(^|/)${list.row}\\d+$`).test(part.path));
          expect(rows.length, `${build} ${screen} ${name}`).toBeGreaterThan(0);
          for (const field of [...Object.values(list.fields), ...Object.values(list.does ?? {})]) {
            expect(
              carried(parts, `${rows[0]!.path.slice(rows[0]!.path.indexOf(list.row))}/${field}`),
              `${build} ${screen} ${name} ${field}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it('finds more than one slot in every run, or the one slot named', () => {
    for (const [build, one] of read) {
      for (const [screen, spec] of Object.entries(one.built.spec.screens)) {
        const parts = partsOf(one, SCREEN_MEANINGS[screen]!)!;
        const runs = [
          ...Object.entries(spec.grids ?? {}),
          ...(spec.bag ? [['bag', { slot: spec.bag.slot, within: spec.bag.run }] as const] : []),
        ];
        for (const [name, grid] of runs) {
          const slots = parts.filter(
            part =>
              new RegExp(`(^|/)${grid.slot}\\d+$`).test(part.path) &&
              (!grid.within || part.path.startsWith(`${grid.within}/`)),
          );
          // A single slot the table names outright stands on its own.
          if (parts.some(part => part.path === grid.slot)) continue;
          expect(slots.length, `${build} ${screen} ${name}`).toBeGreaterThan(1);
        }
      }
    }
  });
});

/** The HUD's own frames, against what each build draws round them. */
describe.skipIf(!BUILDS.size)('the HUD frames, against the player’s builds', () => {
  const caster = {
    health: 50,
    maxHealth: 100,
    mana: 50,
    maxMana: 100,
    exp: 0,
    expToLevel: 100,
    inCombat: false,
  };

  /** The parts of a frame the movie lays down besides the ring itself and the meters. */
  const backing = (spec: ScreenSpec): string[] => {
    const ring = spec.groups?.portrait?.split('/')[0];
    const meters = [spec.groups?.morale, spec.groups?.vigor];
    const frame = Array.isArray(spec.frame) ? spec.frame : spec.frame ? [spec.frame] : [];
    return frame.filter(part => part !== ring && !meters.includes(part));
  };

  it('frames the hero on the art the movie lays behind the ring', () => {
    const drawn = [...read.values()].some(one => {
      const spec = one.built.spec.screens.playerFrame!;
      const parts = partsOf(one, SCREEN_MEANINGS.playerFrame!)!;
      return backing(spec).some(name =>
        parts.some(part => part.path === name && part.draws && part.box.w > 0),
      );
    });
    expect(drawn).toBe(true);
  });

  it('finds a cast bar on the target frame of every build, as a clip of faces', () => {
    for (const [build, one] of read) {
      const cast = one.built.spec.screens.targetFrame?.bars?.own?.cast;
      expect(cast?.frames, build).toBeGreaterThan(1);
    }
  });

  it('draws that art for a hero of every class, whatever their class spends', () => {
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.playerFrame!;
      const parts = partsOf(one, SCREEN_MEANINGS.playerFrame!)!;
      for (const resource of ['mana', 'morale', 'vigor'] as const) {
        const hidden = [
          ...heroFaces({ ...caster, resource }, spec).hidden,
          ...strangers(parts, spec),
        ];
        expect(
          backing(spec).filter(name => hidden.includes(name)),
          `${build} ${resource}`,
        ).toEqual([]);
      }
    }
  });

  it('draws the corner’s ornament and the experience track for a hero of every class', () => {
    /** The sprite a part named `name` is placed as, wherever the movie places it. */
    const spriteOf = (skin: UiSkinData, name: string) => {
      const sprites = new Map(skin.sprites.map(sprite => [sprite.id, sprite]));
      for (const sprite of skin.sprites) {
        const placed = sprite.frames[0]?.find(one => one.name === name);
        if (placed?.characterId != null) return sprites.get(placed.characterId);
      }
      return undefined;
    };
    /** The outlines of the shapes a part places itself, with no name between. */
    const ownOutlines = (skin: UiSkinData, name: string, depth?: number) => {
      const shapes = new Map(skin.shapes.map(shape => [shape.id, shape]));
      return (spriteOf(skin, name)?.frames[0] ?? [])
        .filter(one => !one.name && (depth === undefined || one.depth === depth))
        .flatMap(one => shapes.get(one.characterId ?? -1)?.paths.map(path => path.d) ?? []);
    };
    let ornamented = 0;
    for (const [build, one] of read) {
      const skin = one.movies.get('IGM')!;
      const spec = one.built.spec.screens.playerFrame!;
      const parts = partsOf(one, SCREEN_MEANINGS.playerFrame!)!;
      const [holder, where] = spec.groups!.ornament!.split('@');
      const [depth, outline] = where!.split('#').map(Number);
      const backing = ownOutlines(skin, holder!, depth);
      const corner = backing[outline! - 1];
      const track = backing.filter(d => d !== corner);
      const meters = [spec.groups!.morale!, spec.groups!.vigor!];
      const draws = Boolean(corner) || meters.some(meter => ownOutlines(skin, meter).length);
      if (draws) ornamented += 1;
      for (const resource of ['mana', 'morale', 'vigor'] as const) {
        const hero = { ...caster, resource };
        const hidden = [...heroFaces(hero, spec, parts).hidden, ...strangers(parts, spec)];
        const painted = (planPiece(skin, spec.dialog, { hidden })?.ops ?? []).map(op => op.path);
        const meter = resource === 'mana' ? [] : ownOutlines(skin, spec.groups![resource]!);
        // The corner's, whatever the class: a meter's own is never drawn.
        expect(
          painted.filter(d => meter.includes(d)),
          `${build} ${resource}`,
        ).toEqual([]);
        expect(painted.filter(d => d === corner).length, `${build} ${resource}`).toBe(
          corner ? 1 : 0,
        );
        expect(
          track.filter(d => !painted.includes(d)),
          `${build} ${resource}`,
        ).toEqual([]);
      }
    }
    expect(ornamented).toBeGreaterThan(0);
  });

  it('climbs a clip the movie carries, and lights pips it carries, for either length of meter', () => {
    for (const [build, one] of read) {
      const spec = one.built.spec.screens.playerFrame!;
      const parts = partsOf(one, SCREEN_MEANINGS.playerFrame!)!;
      const paths = new Set(parts.map(part => part.path));
      for (const maxMana of [100, 120]) {
        const warrior = { ...caster, resource: 'morale' as const, mana: 0, maxMana };
        const { frames, hidden } = heroFaces(warrior, spec, parts);
        const climbs = Object.keys(frames).filter(path =>
          path.startsWith(`${spec.groups!.morale}/`),
        );
        expect(climbs, `${build} ${maxMana}`).toHaveLength(1);
        expect(spec.bars?.runs?.[climbs[0]!], `${build} ${maxMana}`).toBeDefined();
        // At nothing every pip of the worn length is dark, and each is a part.
        const pips = hidden.filter(path => /\/rage\d$/.test(path));
        expect(pips.length, `${build} ${maxMana}`).toBeGreaterThan(2);
        expect(
          pips.filter(path => !paths.has(path)),
          build,
        ).toEqual([]);
      }
    }
  });
});

/** The words that float over a head, against the box the latest lines stand in. */
describe.skipIf(!BUILDS.size)('the box over a head, against the player’s builds', () => {
  it('stands words over a head in the box the latest lines show in, in every build', () => {
    for (const [build, one] of read) {
      const said = one.built.spec.screens.chatSaid;
      const peek = one.built.spec.screens.chatPeek;
      expect(said, build).toBeDefined();
      expect([said?.dialog, said?.frame], build).toEqual([peek?.dialog, peek?.frame]);
    }
  });
});

/**
 * The numbers a card's words are indexed by, against the items in the
 * target build's own tables.
 */
describe.skipIf(!TARGET || !existsSync(join(dirname(BUILDS.get(TARGET)!), 'tables.bin')))(
  'the card’s numbers, against the player’s items',
  () => {
    const items: ItemFacts[] = [];
    beforeAll(async () => {
      const provider = new PackAssetProvider();
      const file = (name: string) =>
        openAsBlob(join(dirname(BUILDS.get(TARGET!)!), name)).then(blob => new File([blob], name));
      await provider.useSource(
        provider.offer([await file('res.bin'), await file('tables.bin')]).id,
      );
      for (let entry = 1; entry <= 12_000; entry++) {
        const facts = await provider.load(itemFactsId(entry)).catch(() => null);
        if (facts) items.push(facts);
      }
    }, 300_000);

    const card = SCREEN_MEANINGS.held!;
    const carries = (kind: number) => items.some(item => item.stats.some(one => one.kind === kind));

    it('calls armour the class most things with armour on them are', () => {
      const count = new Map<number, number>();
      for (const item of items.filter(one => one.armour > 0)) {
        count.set(item.itemClass, (count.get(item.itemClass) ?? 0) + 1);
      }
      const most = [...count].sort((a, b) => b[1] - a[1])[0]?.[0];
      expect(most).toBe(card.shape?.armourClass);
    });

    it('names kinds of gift the items carry', () => {
      // Mana, the first plain kind, is on no item in the build: it is the
      // one before health in the run of sentences.
      const kinds = [
        ...(card.shape?.plainKinds ?? []).slice(1),
        card.shape!.armour!,
        card.shape!.block!,
      ];
      expect(kinds.filter(kind => !carries(kind))).toEqual([]);
      // What is blocked is given by shields, among others.
      expect(
        items.some(
          item =>
            equipmentHomesFor(item.inventoryType).includes(EQUIPMENT_SLOTS.indexOf('Off hand')) &&
            item.stats.some(one => one.kind === card.shape!.block),
        ),
      ).toBe(true);
    });

    it('has a word for every binding, place and class the items name', () => {
      const names = card.names!;
      expect(items.every(item => item.binding < names.binds!.length)).toBe(true);
      expect(items.every(item => item.inventoryType < names.worn!.length)).toBe(true);
      expect(items.every(item => item.itemClass < names.classes!.length)).toBe(true);
      expect(
        items.every(item => item.stats.every(one => one.kind < 9 || card.stats![String(one.kind)])),
      ).toBe(true);
    });
  },
);

describe.skipIf(!BUILDS.size)('the lines the interface says, against the player’s builds', () => {
  const holes = (line: string): number => (line.match(/%s/g) ?? []).length;

  it('places each line on a string with as many names in it as its own wording', () => {
    const misfits: string[] = [];
    for (const [build, one] of read) {
      if (one.words.length === 0) continue;
      for (const [key, which] of Object.entries(LINES)) {
        const at = which.at[one.words.length];
        if (at === undefined) continue;
        if (holes(one.words[at] ?? '') !== holes(which.fallback)) misfits.push(`${build}: ${key}`);
      }
    }
    expect(misfits).toEqual([]);
  });
});
