/**
 * One named piece of interface art, flattened into drawing steps: how it
 * looks, never where it belongs (screens place it). Pure data, so it tests
 * without a canvas.
 */

import { REMOVED } from '../../assets/formats/swf';
import type { UiMatrix, UiSkinData, UiSkinPlaced } from '../../assets/types';

/** A rectangle in the movie's own units. */
export interface PieceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What fills one path: a colour, or a region of a named bitmap. */
export type PieceFill =
  | { kind: 'solid'; css: string; opacity: number }
  | { kind: 'bitmap'; art: string; matrix: UiMatrix; repeating: boolean };

/** One outline of a mask, in the same space as the ops it clips. */
export interface PieceClip {
  matrix: UiMatrix;
  path: string;
}

/** One path, transformed into the piece's own coordinates. */
export interface PieceOp {
  matrix: UiMatrix;
  path: string;
  fill: PieceFill;
  /** Alpha of the placement this path was drawn under. */
  opacity: number;
  /** Masks it shows through, outermost first; each is a union, and every one must cover. */
  clips?: readonly (readonly PieceClip[])[];
}

/** A named part of a piece, and what it covers inside the picture. */
export interface PiecePart {
  name: string;
  /** The names above it, innermost last; names repeat, so parts are told apart by path. */
  path: string;
  box: PieceBox;
  /** Text setting for a text field: box, alignment, size, colour; only the words are missing. */
  text?: {
    align: 'left' | 'center' | 'right';
    sizePx: number;
    color: string | null;
    /** The name of the typeface the movie letters the field in. */
    face: string | null;
    /** The authored words, unmarked: captions to use, or placeholders to replace. */
    words: string;
  };
  /** A mask is never drawn, but it is the only measure of a list's visible window. */
  mask?: boolean;
  /** A drawing spot's authored box; the part's own box stays a point. */
  spot?: PieceBox;
  /** False for pure behaviour (a hit-area); its box is then a point. */
  draws: boolean;
}

export interface PiecePlan {
  name: string;
  /** What the piece covers, in movie units, at its authored size. */
  box: PieceBox;
  ops: PieceOp[];
  /** Every named part, measured in place: a part planned alone lands in the wrong space. */
  parts: PiecePart[];
  /** Every shape that shows, named or not; masked art and invisible paint are left out. */
  painted: PieceBox[];
}

const IDENTITY: UiMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

/** A field's authored text, without the markup it is wrapped in. */
function stripMarkup(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

/** Whether a placement is named by one of `wanted`, by name or by path. */
function matches(wanted: readonly string[], name: string, path: string): boolean {
  return wanted.some(entry => entry === name || path === entry || path.endsWith(`/${entry}`));
}

/** Whether an unnamed placement, by what holds it and its depth there, is one `hidden` names. */
function unnamedHidden(
  hidden: readonly string[],
  owners: readonly string[],
  depth: number,
): boolean {
  const key = `${owners.join('/')}@${depth}`;
  return hidden.some(entry => entry.includes('@') && (key === entry || key.endsWith(`/${entry}`)));
}

function outlinesHidden(
  hidden: readonly string[],
  owners: readonly string[],
  depth: number,
): Set<number> {
  const key = `${owners.join('/')}@${depth}`;
  const out = new Set<number>();
  for (const entry of hidden) {
    const at = entry.lastIndexOf('#');
    if (at < 0 || !entry.includes('@')) continue;
    const where = entry.slice(0, at);
    if (key === where || key.endsWith(`/${where}`)) out.add(Number(entry.slice(at + 1)));
  }
  return out;
}

const NO_OUTLINES: ReadonlySet<number> = new Set();

/** A shape's extent less its hidden outlines; null when all are hidden. */
export function keptBounds(
  shape: { bounds: PieceBox; paths: ReadonlyArray<{ d: string }> },
  without: ReadonlySet<number>,
): PieceBox | null {
  if (!without.size) return shape.bounds;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  shape.paths.forEach((path, index) => {
    if (without.has(index + 1)) return;
    const n = path.d.match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (let at = 0; at + 1 < n.length; at += 2) {
      const x = Number(n[at]);
      const y = Number(n[at + 1]);
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  });
  return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Whether `path` is `entry` itself or something inside it. */
function within(entry: string, path: string): boolean {
  return (
    path === entry ||
    path.endsWith(`/${entry}`) ||
    path.startsWith(`${entry}/`) ||
    path.includes(`/${entry}/`)
  );
}

/** How deep a piece may nest before the walk gives up. */
const MAX_DEPTH = 8;

/** Whether two fills are the same paint, down to the picture and its place. */
function samePaint(one: PieceFill, other: PieceFill): boolean {
  if (one.kind !== other.kind) return false;
  if (one.kind === 'solid' && other.kind === 'solid') {
    return one.css === other.css && one.opacity === other.opacity;
  }
  if (one.kind === 'bitmap' && other.kind === 'bitmap') {
    return (
      one.art === other.art &&
      one.repeating === other.repeating &&
      sameMatrix(one.matrix, other.matrix)
    );
  }
  return false;
}

function sameMatrix(one: UiMatrix, other: UiMatrix): boolean {
  return (
    one.a === other.a &&
    one.b === other.b &&
    one.c === other.c &&
    one.d === other.d &&
    one.tx === other.tx &&
    one.ty === other.ty
  );
}

/**
 * A shape's same-paint paths drawn as one: filled apart, soft edges leave
 * hairlines between strips. Only within a shape.
 */
function joined(ops: readonly (PieceOp & { run: number })[]): PieceOp[] {
  const merged: Array<PieceOp & { run: number }> = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.run === op.run &&
      last.clips === op.clips &&
      last.opacity === op.opacity &&
      sameMatrix(last.matrix, op.matrix) &&
      samePaint(last.fill, op.fill)
    ) {
      merged[merged.length - 1] = { ...last, path: last.path + op.path };
      continue;
    }
    merged.push(op);
  }
  return merged.map(({ run: _run, ...op }) => op);
}

/** `outer` applied over `inner`: the order a nested placement is drawn. */
export function compose(outer: UiMatrix, inner: UiMatrix): UiMatrix {
  return {
    a: outer.a * inner.a + outer.c * inner.b,
    b: outer.b * inner.a + outer.d * inner.b,
    c: outer.a * inner.c + outer.c * inner.d,
    d: outer.b * inner.c + outer.d * inner.d,
    tx: outer.a * inner.tx + outer.c * inner.ty + outer.tx,
    ty: outer.b * inner.tx + outer.d * inner.ty + outer.ty,
  };
}

/** A rectangle mapped by `m`, all four corners: a scaling placement moves them unevenly. */
export function mapBox(m: UiMatrix, b: PieceBox): PieceBox {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [px, py] of [
    [b.x, b.y],
    [b.x + b.w, b.y],
    [b.x, b.y + b.h],
    [b.x + b.w, b.y + b.h],
  ]) {
    xs.push(m.a * px + m.c * py + m.tx);
    ys.push(m.b * px + m.d * py + m.ty);
  }
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Placements driven at run time (masks, hooks, guides, wells), never art to bake in. */
const DRIVEN = ['mask', 'size', 'rectcooldown', 'hot', 'cnt', 'cntback', 'src'];

export function isDriven(name: string | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  if (lower.includes('displaycallback')) return true;
  return DRIVEN.some(key => lower === key || lower.endsWith(key));
}

/** Every face of every sprite, by character id. */
function spriteFrames(skin: UiSkinData): ReadonlyMap<number, readonly UiSkinPlaced[][]> {
  return new Map(skin.sprites.map(s => [s.id, s.frames] as const));
}

/**
 * A sprite's face: later faces record only changes, so they are folded in
 * order, a nameless change moving what is at its depth. Returned in depth
 * (paint) order.
 */
function faceList(faces: readonly UiSkinPlaced[][], face: number): readonly UiSkinPlaced[] {
  if (face <= 0 || face >= faces.length) {
    const only = faces[Math.min(Math.max(face, 0), faces.length - 1)] ?? faces[0] ?? [];
    // A stable sort: one face never repeats a depth in a real movie, but
    // nothing here should drop a placement because two share one.
    return [...only].sort((a, b) => a.depth - b.depth);
  }
  const byDepth = new Map<number, UiSkinPlaced>();
  for (const shown of faces.slice(0, face + 1)) {
    for (const placed of shown) {
      if (placed.characterId === REMOVED) {
        byDepth.delete(placed.depth);
        continue;
      }
      const was = byDepth.get(placed.depth);
      byDepth.set(
        placed.depth,
        placed.characterId == null && was
          ? {
              ...was,
              matrix: placed.matrix,
              opacity: placed.opacity,
              name: placed.name ?? was.name,
              ...(placed.clipDepth !== undefined ? { clipDepth: placed.clipDepth } : {}),
            }
          : placed,
      );
    }
  }
  return [...byDepth.values()].sort((a, b) => a.depth - b.depth);
}

/** A placement, and the sprite whose own frame holds it. */
interface Held {
  placed: UiSkinPlaced;
  /** The sprite it sits in, or null where it sits on the movie itself. */
  inSprite: number | null;
}

/** Every placement in the movie, the movie's own list first. */
function everyPlacement(skin: UiSkinData): Held[] {
  const all: Held[] = (skin.root[0] ?? []).map(placed => ({ placed, inSprite: null }));
  for (const sprite of skin.sprites) {
    for (const placed of sprite.frames[0] ?? []) all.push({ placed, inSprite: sprite.id });
  }
  return all;
}

/**
 * Every placement carrying `name`. Repeats are the same art; a name that
 * means different things in two screens is written as a path, each step
 * directly inside the last.
 */
function findHeld(skin: UiSkinData, name: string): Held[] {
  if (typeof name !== 'string') return [];
  const steps = name.split('/').filter(Boolean);
  if (!steps.length) return [];

  const all = everyPlacement(skin);
  const inside = (id: number | null | undefined): Held[] =>
    id == null
      ? []
      : (skin.sprites.find(sprite => sprite.id === id)?.frames[0] ?? []).map(placed => ({
          placed,
          inSprite: id,
        }));

  let looking: Held[] = all;
  let found: Held[] = [];
  for (const step of steps) {
    const wanted = step.toLowerCase();
    found = looking.filter(held => held.placed.name?.toLowerCase() === wanted);
    if (!found.length) return [];
    looking = found.flatMap(held => inside(held.placed.characterId));
  }
  return found;
}

export function findPlacements(skin: UiSkinData, name: string): UiSkinPlaced[] {
  return findHeld(skin, name).map(held => held.placed);
}

/**
 * The matrix from the movie's screen down to the piece's parent, or null
 * where unreachable. Dialogs nest a few sprites deep, each with an offset.
 */
export function transformTo(skin: UiSkinData, name: string): UiMatrix | null {
  const held = findHeld(skin, name)[0];
  if (!held) return null;
  const IDENTITY: UiMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
  const all = everyPlacement(skin);

  let above = IDENTITY;
  let sprite = held.inSprite;
  const seen = new Set<number>();
  while (sprite !== null) {
    if (seen.has(sprite)) return above;
    seen.add(sprite);
    const parent = all.find(one => one.placed.characterId === sprite);
    if (!parent) return above;
    above = compose(parent.placed.matrix, above);
    sprite = parent.inSprite;
  }
  return above;
}

/** Which parked states to draw; drawn as shipped, only the opening state shows. */
export interface PlanStates {
  /** Draw placements the movie parks, as though they had been shown. */
  includeParked?: boolean;
  /**
   * What to leave out, by name or path ending (names repeat). An unnamed
   * placement is `holder@depth`, and one outline of it `holder@depth#n`.
   */
  hidden?: readonly string[];
  /** What to draw, even where the movie parks it. Matched the same way. */
  shown?: readonly string[];
  /** Hooks drawn anyway (a cooldown sweep, a slot tint); skipped by default, matched like `shown`. */
  driven?: readonly string[];
  /** The face a control wears, by name or path; otherwise its first. */
  frames?: Readonly<Record<string, number>>;
  /** Draw these parts and everything inside them (a parked dropdown and its slots). */
  shownInside?: readonly string[];
  /** Draw these without their own art (a row's selection bar), keeping their contents. */
  withoutArt?: readonly string[];
  /**
   * Only what paints before, or after, the part `at` in paint order: the two
   * halves of art around a spot the screen draws into. Pass both the same `frame`.
   */
  split?: { at: string; keep: 'before' | 'after' };
  /** Draw only this part and its contents, in place (matched like `hidden`). */
  only?: string | readonly string[];
  /** A fixed frame, so hit-areas hold still as states change; measure once with every state on. */
  frame?: PieceBox;
}

/** The states of a piece a caller can switch between, parked ones included. */
export interface PieceState {
  name: string;
  /** True when the movie parks it: an alternate state, not the open one. */
  parked: boolean;
  characterId: number | null;
}

/**
 * Flatten a named piece into paths, moved so its top-left is the origin.
 * Null when the movie lacks the piece or it draws nothing.
 */
export function planPiece(
  skin: UiSkinData,
  name: string,
  states: PlanStates = {},
): PiecePlan | null {
  const frames = spriteFrames(skin);
  const shapes = new Map(skin.shapes.map(s => [s.id, s] as const));
  const edits = new Map(skin.edits.map(e => [e.id, e] as const));
  const placements = findPlacements(skin, name);
  if (!placements.length) return null;

  const hidden = states.hidden ?? [];
  const shown = states.shown ?? [];
  const wornHooks = states.driven ?? [];
  const onlyWithin = typeof states.only === 'string' ? [states.only] : (states.only ?? []);
  const inside = states.shownInside ?? [];
  const withoutArt = states.withoutArt ?? [];
  const faces = states.frames ?? {};
  const split = states.split;
  /** Whether the walk has reached `split.at` yet, in paint order. */
  let splitPassed = false;
  /** The face a part is wearing, and its first where none was asked for. */
  const faceOf = (name: string | null, path: string): number => {
    if (!name) return 0;
    const found = Object.entries(faces).find(([key]) => matches([key], name, path));
    return found ? found[1] : 0;
  };
  /** `run` is the source shape, kept only to join one shape's paths. */
  const drawn: Array<{
    matrix: UiMatrix;
    path: string;
    fill: PieceFill;
    opacity: number;
    run: number;
    clips?: readonly (readonly PieceClip[])[];
  }> = [];
  /** A mask's outlines, wherever inside it they sit, in the space it covers. */
  const outlines = (
    characterId: number | null,
    outer: UiMatrix,
    face: number,
    level: number,
  ): PieceClip[] => {
    if (characterId == null || level > MAX_DEPTH) return [];
    const shape = shapes.get(characterId);
    if (shape) return shape.paths.map(p => ({ matrix: outer, path: p.d }));
    return faceList(frames.get(characterId) ?? [], face).flatMap(inner =>
      inner.clipDepth === undefined
        ? outlines(inner.characterId, compose(outer, inner.matrix), 0, level + 1)
        : [],
    );
  };
  let run = 0;
  /** Where each shape that shows lies, before the piece is moved to its origin. */
  const painted: PieceBox[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  /** Running extent of each named placement, keyed by its path. */
  const partBoxes = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();
  /** Where each named placement sits, whether or not it draws. */
  const partOrigins = new Map<string, { x: number; y: number }>();
  /** How each text field is set, by path. */
  const partText = new Map<string, PiecePart['text']>();
  /** Which paths are masks, measured but never drawn. */
  const partMasks = new Set<string>();
  /** The extent each picture spot was authored as, by path. */
  const partSpots = new Map<string, { x0: number; y0: number; x1: number; y1: number }>();

  const walk = (
    characterId: number | null,
    outer: UiMatrix,
    alpha: number,
    depth: number,
    lineage: ReadonlySet<number>,
    owners: readonly string[],
    bare = false,
    face = 0,
    clips: readonly (readonly PieceClip[])[] = [],
    /** Inside an unnamed placement, which the named part's `@depth` does not count. */
    loose = false,
    /** Outlines of this shape, counted from one, that are left out. */
    without: ReadonlySet<number> = NO_OUTLINES,
  ): void => {
    if (characterId == null || depth > MAX_DEPTH || lineage.has(characterId)) return;
    const shape = shapes.get(characterId);
    if (shape) {
      // The art this placement carries itself, which the caller asked to
      // be left out. What it holds is still drawn.
      if (bare) return;
      if (states.only && !onlyWithin.some(entry => within(entry, owners.join('/')))) return;
      const clipped = clips.length ? clips : undefined;
      const kept = keptBounds(shape, without);
      if (!kept) return;
      const box = mapBox(outer, kept);
      for (let level = 0; level < owners.length; level++) {
        const path = owners.slice(0, level + 1).join('/');
        const seen = partBoxes.get(path);
        if (!seen) {
          partBoxes.set(path, { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h });
        } else {
          seen.x0 = Math.min(seen.x0, box.x);
          seen.y0 = Math.min(seen.y0, box.y);
          seen.x1 = Math.max(seen.x1, box.x + box.w);
          seen.y1 = Math.max(seen.y1, box.y + box.h);
        }
      }
      // Measured either way, so parts sit in the same place in both halves
      // of a split — only whether this half paints it changes.
      if (split && (split.keep === 'before' ? splitPassed : !splitPassed)) return;
      let drew = false;
      run += 1;
      for (const [index, path] of shape.paths.entries()) {
        if (without.has(index + 1)) continue;
        // Fill indices are one-based, and index 0 means "no fill" — a
        // path that only contributes an outline.
        const fill = shape.fills[path.fill - 1];
        if (!fill) continue;
        if (fill.kind === 'solid') {
          drawn.push({
            matrix: outer,
            path: path.d,
            fill: { kind: 'solid', css: fill.css, opacity: fill.opacity },
            opacity: alpha,
            run,
            clips: clipped,
          });
          drew = true;
        } else if (fill.kind === 'bitmap' && fill.art) {
          drawn.push({
            matrix: outer,
            path: path.d,
            fill: { kind: 'bitmap', art: fill.art, matrix: fill.matrix, repeating: fill.repeating },
            opacity: alpha,
            run,
            clips: clipped,
          });
          drew = true;
        }
      }
      const shows =
        alpha > 0 &&
        shape.paths.some(path => {
          const fill = shape.fills[path.fill - 1];
          if (fill?.kind === 'bitmap') return Boolean(fill.art);
          return fill?.kind === 'solid' && fill.opacity > 0;
        });
      if (drew && shows && !clipped) painted.push(box);
      // Only art that draws decides how big the piece is. A shape with no
      // usable fill would otherwise pad the picture with empty margin.
      if (drew) {
        minX = Math.min(minX, box.x);
        minY = Math.min(minY, box.y);
        maxX = Math.max(maxX, box.x + box.w);
        maxY = Math.max(maxY, box.y + box.h);
      }
      return;
    }
    const next = new Set(lineage);
    next.add(characterId);
    /** Masks placed so far in this sprite, and the deepest depth each reaches. */
    let masks: Array<{ reach: number; outlines: PieceClip[] }> = [];
    for (const placed of faceList(frames.get(characterId) ?? [], face)) {
      masks = masks.filter(mask => mask.reach >= placed.depth);
      const path = placed.name ? [...owners, placed.name].join('/') : '';
      if (split && !splitPassed && placed.name && matches([split.at], placed.name, path))
        splitPassed = true;
      if (placed.clipDepth !== undefined) {
        // A mask is never drawn; what it covers shows through it. A named one is
        // recorded as a part: it is a list's window.
        if (placed.name && !partBoxes.has(path)) {
          const here = compose(outer, placed.matrix);
          partMasks.add(path);
          measure(placed.characterId, here, path, 0);
        }
        if (!(placed.name && matches(hidden, placed.name, path))) {
          masks.push({
            reach: placed.clipDepth,
            outlines: outlines(
              placed.characterId,
              compose(outer, placed.matrix),
              faceOf(placed.name, path),
              depth + 1,
            ),
          });
        }
        continue;
      }
      const through = masks.length ? [...clips, ...masks.map(mask => mask.outlines)] : clips;
      if (isDriven(placed.name) && !(placed.name && matches(wornHooks, placed.name, path))) {
        // A driven placement is not drawn, but its point is where the screen
        // draws its own thing (a stack count, a row picture).
        if (placed.name) {
          const path = [...owners, placed.name].join('/');
          const here = compose(outer, placed.matrix);
          if (!partOrigins.has(path)) partOrigins.set(path, { x: here.tx, y: here.ty });
          if (/mask$/i.test(placed.name)) {
            partMasks.add(path);
            measure(placed.characterId, here, path, 0);
          }
          if (/displaycallback/i.test(placed.name)) {
            measure(placed.characterId, here, path, 0, partSpots);
          }
        }
        continue;
      }
      if (placed.name && matches(hidden, placed.name, path)) continue;
      if (!placed.name && !loose && unnamedHidden(hidden, owners, placed.depth)) continue;
      // A parked state asked for is drawn at full alpha: it is turned on, not faint.
      const forced =
        Boolean(placed.name && matches(shown, placed.name, path)) ||
        inside.some(entry => within(entry, path));
      const parked = placed.opacity < 0.01;
      if (parked && !forced && !states.includeParked) continue;
      // Where it sits, recorded whether or not it turns out to draw: a
      // control can be a hit-area with a text field in it and no art.
      if (placed.name) {
        const here = compose(outer, placed.matrix);
        if (!partOrigins.has(path)) partOrigins.set(path, { x: here.tx, y: here.ty });
        // A text field draws no art, but it does say where its words go,
        // how big they are, which way they sit and what colour they take.
        const edit = placed.characterId == null ? undefined : edits.get(placed.characterId);
        if (edit && !partText.has(path)) {
          const box = mapBox(here, edit.bounds);
          partBoxes.set(path, { x0: box.x, y0: box.y, x1: box.x + box.w, y1: box.y + box.h });
          const html = edit.sampleHtml ?? '';
          const align = /align="(left|center|right)"/.exec(html)?.[1];
          partText.set(path, {
            align: (align as 'left' | 'center' | 'right') ?? 'left',
            sizePx: edit.sizePx || 12,
            color: edit.color,
            face: edit.face ?? null,
            words: stripMarkup(html),
          });
        }
      }
      walk(
        placed.characterId,
        compose(outer, placed.matrix),
        alpha * (parked ? 1 : placed.opacity),
        depth + 1,
        next,
        placed.name ? [...owners, placed.name] : owners,
        placed.name ? matches(withoutArt, placed.name, path) : bare,
        faceOf(placed.name, path),
        through,
        !placed.name,
        placed.name || loose ? NO_OUTLINES : outlinesHidden(hidden, owners, placed.depth),
      );
    }
  };

  // The piece's own placement sizes the art: start the walk at it, not identity.
  /** A subtree's extent, recorded against `path` without drawing it. */
  function measure(
    characterId: number | null,
    outer: UiMatrix,
    path: string,
    depth: number,
    into = partBoxes,
  ): void {
    if (characterId == null || depth > MAX_DEPTH) return;
    const shape = shapes.get(characterId);
    if (shape) {
      const at = mapBox(outer, shape.bounds);
      const seen = into.get(path);
      if (!seen) {
        into.set(path, { x0: at.x, y0: at.y, x1: at.x + at.w, y1: at.y + at.h });
      } else {
        seen.x0 = Math.min(seen.x0, at.x);
        seen.y0 = Math.min(seen.y0, at.y);
        seen.x1 = Math.max(seen.x1, at.x + at.w);
        seen.y1 = Math.max(seen.y1, at.y + at.h);
      }
      return;
    }
    for (const placed of frames.get(characterId)?.[0] ?? []) {
      measure(placed.characterId, compose(outer, placed.matrix), path, depth + 1, into);
    }
  }

  const first = placements[0];
  // A piece that is a clip of faces itself — a bar standing on the stage
  // on its own — turns like any part inside one does.
  walk(first.characterId, first.matrix, first.opacity, 0, new Set(), [], false, faceOf(name, name));
  if (!drawn.length || minX === Infinity) return null;

  const box = states.frame ?? { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  const toOrigin: UiMatrix = { ...IDENTITY, tx: -box.x, ty: -box.y };
  // One moved copy per mask list, not per op: ops of one shape share a
  // list, and `joined` only merges ops whose lists are the same object.
  const movedLists = new Map<readonly (readonly PieceClip[])[], (readonly PieceClip[])[]>();
  const moved = (
    lists: readonly (readonly PieceClip[])[] | undefined,
  ): readonly (readonly PieceClip[])[] | undefined => {
    if (!lists) return undefined;
    let copy = movedLists.get(lists);
    if (!copy) {
      copy = lists.map(list =>
        list.map(clip => ({ ...clip, matrix: compose(toOrigin, clip.matrix) })),
      );
      movedLists.set(lists, copy);
    }
    return copy;
  };
  const parts: PiecePart[] = [];
  for (const [path, seen] of partBoxes) {
    const drawn = {
      x: seen.x0 - box.x,
      y: seen.y0 - box.y,
      w: seen.x1 - seen.x0,
      h: seen.y1 - seen.y0,
    };
    if (drawn.w > 0 && drawn.h > 0) {
      const text = partText.get(path);
      const isMask = partMasks.has(path);
      parts.push({
        name: path.slice(path.lastIndexOf('/') + 1),
        path,
        box: drawn,
        draws: !text && !isMask,
        ...(text ? { text } : {}),
        ...(isMask ? { mask: true } : {}),
      });
    }
  }
  for (const [path, at] of partOrigins) {
    if (partBoxes.has(path)) continue;
    const spot = partSpots.get(path);
    parts.push({
      name: path.slice(path.lastIndexOf('/') + 1),
      path,
      box: { x: at.x - box.x, y: at.y - box.y, w: 0, h: 0 },
      draws: false,
      ...(spot
        ? {
            spot: {
              x: spot.x0 - box.x,
              y: spot.y0 - box.y,
              w: spot.x1 - spot.x0,
              h: spot.y1 - spot.y0,
            },
          }
        : {}),
    });
  }
  parts.sort((a, b) => a.path.localeCompare(b.path));

  return {
    name,
    box,
    ops: joined(
      drawn.map(({ clips, ...op }) => ({
        ...op,
        matrix: compose(toOrigin, op.matrix),
        ...(clips ? { clips: moved(clips) } : {}),
      })),
    ),
    parts,
    painted: painted.map(one => ({ ...one, x: one.x - box.x, y: one.y - box.y })),
  };
}

/**
 * A frame grown, repeatedly, to take in art overlapping it; a box as big as
 * the movie's screen is a backdrop sheet and is not taken in.
 */
export function frameAround(
  frame: PieceBox,
  painted: readonly PieceBox[],
  stage: { w: number; h: number },
): PieceBox {
  let x0 = frame.x;
  let y0 = frame.y;
  let x1 = frame.x + frame.w;
  let y1 = frame.y + frame.h;
  for (let grew = true; grew; ) {
    grew = false;
    for (const one of painted) {
      const [ox0, oy0, ox1, oy1] = [one.x, one.y, one.x + one.w, one.y + one.h];
      const overlaps = ox0 < x1 && ox1 > x0 && oy0 < y1 && oy1 > y0;
      const sheet = one.w >= stage.w && one.h >= stage.h;
      if (!overlaps || sheet) continue;
      if (ox0 < x0 || oy0 < y0 || ox1 > x1 || oy1 > y1) {
        [x0, y0, x1, y1] = [
          Math.min(x0, ox0),
          Math.min(y0, oy0),
          Math.max(x1, ox1),
          Math.max(y1, oy1),
        ];
        grew = true;
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A part `suffix` names, as its whole path or its tail; a top-level part's path has no slash. */
export function isNamed(part: PiecePart, suffix: string): boolean {
  return part.path === suffix || part.path.endsWith(`/${suffix}`);
}

/** The bitmaps a plan needs, by linkage name. */
export function planArt(plan: PiecePlan): string[] {
  const out = new Set<string>();
  for (const op of plan.ops) {
    if (op.fill.kind === 'bitmap') out.add(op.fill.art);
  }
  return [...out];
}

/** Every name the movie gives to something it draws, for browsing. */
export function pieceNames(skin: UiSkinData): string[] {
  const out = new Set<string>();
  for (const list of [skin.root[0] ?? [], ...skin.sprites.map(s => s.frames[0] ?? [])]) {
    for (const placed of list) {
      if (placed.name && !isDriven(placed.name)) out.add(placed.name);
    }
  }
  return [...out].sort();
}

/** The named placements one level inside a piece, and whether each is parked: a dialog's state switches. */
export function pieceStates(skin: UiSkinData, name: string): PieceState[] {
  const frames = spriteFrames(skin);
  const placements = findPlacements(skin, name);
  const first = placements[0];
  if (!first?.characterId) return [];
  const out: PieceState[] = [];
  const seen = new Set<string>();
  for (const placed of frames.get(first.characterId)?.[0] ?? []) {
    if (!placed.name || isDriven(placed.name) || seen.has(placed.name)) continue;
    seen.add(placed.name);
    out.push({
      name: placed.name,
      parked: placed.opacity < 0.01,
      characterId: placed.characterId,
    });
  }
  return out;
}
