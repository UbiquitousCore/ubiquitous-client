/** A movie's interface as a plannable list: screens, their pieces and sizes; names and measurements only. */

import type { UiSkinData, UiSkinPlaced } from '../../assets/types';
import { isDriven, planArt, planPiece } from './piecePlan';

/** What a piece looks like it is for, from its name and its shape. */
export type PieceKind =
  | 'screen'
  | 'frame'
  | 'button'
  | 'bar'
  | 'row'
  | 'icon'
  | 'well'
  | 'label'
  | 'art';

export interface PieceEntry {
  name: string;
  kind: PieceKind;
  /** Size in movie units, as the movie places it. */
  width: number;
  height: number;
  /** How many paths it draws. Zero means it is a container, not art. */
  paths: number;
  /** Named pieces placed inside it. */
  children: string[];
  /** The outermost named piece it sits under, or itself. */
  screen: string;
  /** Linkage names of the bitmaps it needs. */
  art: string[];
}

export interface ScreenEntry {
  name: string;
  width: number;
  height: number;
  /** Every piece under this screen, outermost first. */
  pieces: PieceEntry[];
}

export interface Inventory {
  movie: string;
  /** Named pieces the movie places, drawn or not. */
  total: number;
  /** Those that draw something. */
  drawn: number;
  screens: ScreenEntry[];
  /** Pieces that belong to no screen: loose art the movie places directly. */
  loose: PieceEntry[];
}

/** A piece wider than this, or taller, is a whole screen rather than a part. */
const SCREEN_EDGE = 300;

/** Fewer parts than this under one name is a piece, not a screen. */
const SCREEN_PARTS = 3;

const KIND_BY_NAME: Array<[RegExp, PieceKind]> = [
  [/^(dlg|panel|window|frame)/i, 'screen'],
  [/(btn|button|close|cancel|confirm)/i, 'button'],
  [/(bar|progress|hp|mp|exp)\d*$/i, 'bar'],
  [/^(item|slot|cell|socket)\d*$/i, 'well'],
  [/(row|line|entry|name\d+)$/i, 'row'],
  [/(icon|stone|coin|money)/i, 'icon'],
  [/^(txt|text|label|title)/i, 'label'],
];

/** A piece's likely kind: by name where the movie gives one, else by size and shape. */
export function guessKind(name: string, width: number, height: number): PieceKind {
  for (const [pattern, kind] of KIND_BY_NAME) {
    if (pattern.test(name)) return kind;
  }
  if (width >= SCREEN_EDGE && height >= SCREEN_EDGE) return 'screen';
  if (width >= SCREEN_EDGE || height >= SCREEN_EDGE) return 'frame';
  if (width <= 48 && height <= 48) return 'icon';
  if (width >= height * 3) return 'bar';
  return 'art';
}

/** Frame-0 display list of every sprite, by character id. */
function spriteFrames(skin: UiSkinData): Map<number, UiSkinPlaced[]> {
  return new Map(skin.sprites.map(s => [s.id, s.frames[0] ?? []] as const));
}

/** Parent piece by name: names sit on placements, so a sprite's parent is whoever names an instance of it. */
function parentByChild(skin: UiSkinData): Map<string, string> {
  const frames = spriteFrames(skin);
  /** Instance name of each sprite character, first one wins. */
  const nameOf = new Map<number, string>();
  for (const list of [skin.root[0] ?? [], ...frames.values()]) {
    for (const placed of list) {
      if (placed.name && placed.characterId != null && !nameOf.has(placed.characterId)) {
        nameOf.set(placed.characterId, placed.name);
      }
    }
  }
  const parents = new Map<string, string>();
  for (const [characterId, list] of frames) {
    const holder = nameOf.get(characterId);
    if (!holder) continue;
    for (const placed of list) {
      if (!placed.name || isDriven(placed.name) || placed.name === holder) continue;
      if (!parents.has(placed.name)) parents.set(placed.name, holder);
    }
  }
  return parents;
}

/** The outermost named piece above `name` short of a stage-sized wrapper, which is the movie, not a screen. */
function outermost(
  name: string,
  parents: ReadonlyMap<string, string>,
  stages: ReadonlySet<string>,
): string {
  const seen = new Set<string>([name]);
  let current = name;
  for (;;) {
    const parent = parents.get(current);
    if (!parent || seen.has(parent) || stages.has(parent)) return current;
    seen.add(parent);
    current = parent;
  }
}

/** How much of the movie a piece covers before it is the stage, not a screen. */
const STAGE_COVERAGE = 0.6;

/**
 * Everything a movie's interface is made of, grouped by the screen it
 * belongs to. Pieces that draw nothing are left out: they are containers,
 * and a plan made of them would be a plan to build nothing.
 */
export function takeInventory(skin: UiSkinData): Inventory {
  const frames = spriteFrames(skin);
  const parents = parentByChild(skin);
  const named = new Set<string>();
  for (const list of [skin.root[0] ?? [], ...frames.values()]) {
    for (const placed of list) {
      if (placed.name && !isDriven(placed.name)) named.add(placed.name);
    }
  }

  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parents) {
    const list = childrenOf.get(parent) ?? [];
    list.push(child);
    childrenOf.set(parent, list);
  }

  const measured = new Map<string, Omit<PieceEntry, 'screen'>>();
  for (const name of [...named].sort()) {
    const plan = planPiece(skin, name);
    if (!plan) continue;
    const width = Math.round(plan.box.w);
    const height = Math.round(plan.box.h);
    measured.set(name, {
      name,
      kind: guessKind(name, width, height),
      width,
      height,
      paths: plan.ops.length,
      children: (childrenOf.get(name) ?? []).sort(),
      art: planArt(plan).sort(),
    });
  }

  // The stage: something the movie places at its own root, holding parts
  // enough to be a whole interface and covering most of the movie.
  const stageArea = skin.width * skin.height;
  const stages = new Set<string>();
  for (const placed of skin.root[0] ?? []) {
    const entry = placed.name ? measured.get(placed.name) : undefined;
    if (!entry || entry.children.length < SCREEN_PARTS) continue;
    if (stageArea > 0 && entry.width * entry.height >= stageArea * STAGE_COVERAGE) {
      stages.add(entry.name);
    }
  }

  const entries: PieceEntry[] = [];
  for (const entry of measured.values()) {
    if (stages.has(entry.name)) continue;
    entries.push({ ...entry, screen: outermost(entry.name, parents, stages) });
  }

  const grouped = new Map<string, PieceEntry[]>();
  for (const entry of entries) {
    const list = grouped.get(entry.screen) ?? [];
    list.push(entry);
    grouped.set(entry.screen, list);
  }

  // A screen is a group worth planning as one: something the movie calls a
  // dialog or sizes like one, or any group with parts enough to lay out. A
  // button that names the art inside it is not a screen of two.
  const byScreen = new Map<string, PieceEntry[]>();
  const loose: PieceEntry[] = [];
  for (const [name, pieces] of grouped) {
    const self = pieces.find(p => p.name === name);
    if (pieces.length >= SCREEN_PARTS || self?.kind === 'screen') byScreen.set(name, pieces);
    else loose.push(...pieces);
  }

  const screens: ScreenEntry[] = [...byScreen]
    .map(([name, pieces]) => {
      const self = pieces.find(p => p.name === name);
      return {
        name,
        width: self?.width ?? Math.max(...pieces.map(p => p.width)),
        height: self?.height ?? Math.max(...pieces.map(p => p.height)),
        pieces: pieces.sort((a, b) => b.width * b.height - a.width * a.height),
      };
    })
    .sort((a, b) => b.pieces.length - a.pieces.length);

  return {
    movie: skin.movie,
    total: named.size,
    drawn: entries.length,
    screens,
    loose: loose.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/**
 * The inventory as a brief per screen: what it is made of, and what
 * building it involves. Written to be handed to somebody — or something —
 * that has not seen the movie, one screen at a time.
 */
export function inventoryBriefs(inventory: Inventory): string {
  const lines: string[] = [
    `# Interface pieces: ${inventory.movie}`,
    '',
    `${inventory.drawn} of ${inventory.total} named pieces draw something.`,
    `${inventory.screens.length} screens, ${inventory.loose.length} loose pieces.`,
    '',
    'Each screen below is one task: build the layout in Preact, wear these',
    'pieces as art, and drive every word, count and hit-area from our own',
    'state. Sizes are the movie’s own units at the size it places them.',
    '',
  ];
  for (const screen of inventory.screens) {
    lines.push(`## ${screen.name} (${screen.width}×${screen.height})`);
    lines.push('');
    lines.push('| piece | kind | size | paths | art |');
    lines.push('|---|---|---|---|---|');
    for (const piece of screen.pieces) {
      lines.push(
        `| ${piece.name} | ${piece.kind} | ${piece.width}×${piece.height} | ` +
          `${piece.paths} | ${piece.art.join(', ') || '—'} |`,
      );
    }
    lines.push('');
    const wells = screen.pieces.filter(p => p.kind === 'well').length;
    const buttons = screen.pieces.filter(p => p.kind === 'button').length;
    lines.push('Checklist:');
    lines.push('');
    lines.push(`- [ ] Frame: wear the screen piece, nine-slice insets measured on the bench`);
    if (wells) lines.push(`- [ ] Wells: ${wells} of them, our sockets sit on top`);
    if (buttons) lines.push(`- [ ] Buttons: ${buttons}, each with its rest and pressed states`);
    lines.push('- [ ] Text, counts and icons stay ours — never drawn from the movie');
    lines.push('- [ ] Empty state, and the screen with no art at all, both still work');
    lines.push('');
  }
  return lines.join('\n');
}
