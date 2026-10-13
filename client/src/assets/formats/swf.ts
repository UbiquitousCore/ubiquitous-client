/**
 * A minimal SWF reader: exports, frame-1 display lists, shapes, text fields
 * and bitmaps. Not a player: the movies carry no ActionScript. Unknown tags
 * are skipped by length. Plain data only, so it structured-clones; lengths
 * in CSS pixels (twips / 20).
 */

export class SwfError extends Error {}

/** Null-terminated byte string, the SWF string encoding. */
function readString(data: Uint8Array, pos: number): { value: string; next: number } {
  const end = data.indexOf(0, pos);
  if (end < 0) throw new SwfError('unterminated string');
  return { value: new TextDecoder('utf-8').decode(data.subarray(pos, end)), next: end + 1 };
}

class Bits {
  private bit: number;
  constructor(
    private readonly data: Uint8Array,
    bytePos: number,
  ) {
    // Shape data overrunning its tag gives NaN, which rereads byte 0 forever
    // and OOMs the worker; reject malformed shapes.
    if (!Number.isFinite(bytePos) || bytePos < 0) {
      throw new SwfError(`bit position ${bytePos} is outside its shape`);
    }
    this.bit = bytePos * 8;
  }
  get bytePos(): number {
    return (this.bit + 7) >> 3;
  }
  /** Multiplied, not shifted: shifts wrap at 32 bits and mangle wide fields. */
  ub(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      v = v * 2 + ((this.data[this.bit >> 3] >> (7 - (this.bit & 7))) & 1);
      this.bit++;
    }
    return v;
  }
  sb(n: number): number {
    if (n === 0) return 0;
    const v = this.ub(n);
    const half = 2 ** (n - 1);
    return v >= half ? v - half * 2 : v;
  }
}

export interface SwfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function readRect(data: Uint8Array, pos: number): { rect: SwfRect; next: number } {
  const bits = new Bits(data, pos);
  const n = bits.ub(5);
  const xmin = bits.sb(n);
  const xmax = bits.sb(n);
  const ymin = bits.sb(n);
  const ymax = bits.sb(n);
  const twip = 1 / 20;
  return {
    rect: {
      x: xmin * twip,
      y: ymin * twip,
      w: (xmax - xmin) * twip,
      h: (ymax - ymin) * twip,
    },
    next: bits.bytePos,
  };
}

export interface SwfMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
}

function readMatrix(data: Uint8Array, pos: number): { matrix: SwfMatrix; next: number } {
  const bits = new Bits(data, pos);
  let a = 1;
  let b = 0;
  let c = 0;
  let d = 1;
  if (bits.ub(1)) {
    const n = bits.ub(5);
    a = bits.sb(n) / 65536;
    d = bits.sb(n) / 65536;
  }
  if (bits.ub(1)) {
    const n = bits.ub(5);
    b = bits.sb(n) / 65536;
    c = bits.sb(n) / 65536;
  }
  const n = bits.ub(5);
  const tx = bits.sb(n) / 20;
  const ty = bits.sb(n) / 20;
  return { matrix: { a, b, c, d, tx, ty }, next: bits.bytePos };
}

export type SwfFill =
  | { kind: 'solid'; r: number; g: number; b: number; a: number }
  /** A tile repeated along an edge, rather than one picture. */
  | { kind: 'bitmap'; imageId: number; matrix: SwfMatrix; repeating: boolean }
  | { kind: 'unsupported'; tagType: number };

export type SwfPathOp =
  | { op: 'move'; x: number; y: number }
  | { op: 'line'; x: number; y: number }
  | { op: 'curve'; cx: number; cy: number; x: number; y: number };

export interface SwfPath {
  /** Fill-style-1 index at draw time (1-based into the shape's fills), or 0. */
  fill: number;
  ops: SwfPathOp[];
}

export interface SwfShape {
  id: number;
  bounds: SwfRect;
  fills: SwfFill[];
  /** One entry per fill, holding every outline it fills, in pixels. */
  paths: SwfPath[];
}

/** A placement that removes a depth: later frames record only changes. */
export const REMOVED = -1;

export interface SwfPlaced {
  depth: number;
  characterId: number | null;
  matrix: SwfMatrix;
  /** Instance name from PlaceObject, the handle interface code uses. */
  name: string | null;
  /** Alpha multiplier from CXFORMWITHALPHA, 1 when the tag carries none. */
  opacity: number;
  /** A mask: placements above it, up to this depth, show only where it covers. */
  clipDepth?: number;
}

export interface SwfSprite {
  id: number;
  frameCount: number;
  /** Placements per frame; frame 0 is what a static dialog shows. */
  frames: SwfPlaced[][];
}

export interface SwfEdit {
  id: number;
  bounds: SwfRect;
  /** The variable name interface code writes into, when it has one. */
  varName: string;
  initialHtml: string;
  /** The typeface the field is lettered in, by its id in `SwfMovie.fonts`. */
  fontId: number | null;
  fontHeight: number;
  color: string | null;
  align: number;
}

export interface SwfBitmap {
  id: number;
  width: number;
  height: number;
  /**
   * RGBA8 pixels, or null when the tag carries no pixel data — the linkage
   * name then resolves to a file outside the movie (see the export table).
   */
  pixels: Uint8ClampedArray | null;
}

/** A typeface a movie names; outlines are not embedded, so the name finds the shipped file. */
export interface SwfFont {
  id: number;
  name: string;
}

export interface SwfExport {
  id: number;
  name: string;
}

export interface SwfMovie {
  version: number;
  width: number;
  height: number;
  background: string | null;
  exports: SwfExport[];
  shapes: SwfShape[];
  sprites: SwfSprite[];
  edits: SwfEdit[];
  fonts: SwfFont[];
  bitmaps: SwfBitmap[];
  root: SwfPlaced[][];
}

const IDENTITY: SwfMatrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

function parseFill(
  data: Uint8Array,
  pos: number,
  withAlpha: boolean,
): { fill: SwfFill; next: number } {
  const type = data[pos++];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (type === 0x00) {
    const r = data[pos++];
    const g = data[pos++];
    const b = data[pos++];
    const a = withAlpha ? data[pos++] : 255;
    return { fill: { kind: 'solid', r, g, b, a }, next: pos };
  }
  if (type === 0x40 || type === 0x41 || type === 0x42 || type === 0x43) {
    const imageId = dv.getUint16(pos, true);
    pos += 2;
    const { matrix, next } = readMatrix(data, pos);
    return {
      fill: { kind: 'bitmap', imageId, matrix, repeating: type === 0x40 || type === 0x42 },
      next,
    };
  }
  // Gradient: matrix plus one count byte and 4-5 bytes per stop.
  const m = readMatrix(data, pos);
  pos = m.next;
  const stops = data[pos++];
  if (stops === undefined || pos + stops * (withAlpha ? 5 : 4) > data.length) {
    // Past the body: the next line would make pos NaN (undefined
    // arithmetic) and the record loop below would never advance.
    throw new SwfError('gradient fill overruns its shape');
  }
  pos += stops * (withAlpha ? 5 : 4);
  return { fill: { kind: 'unsupported', tagType: type }, next: pos };
}

/**
 * Step over a line style. Tags 1-3: width and colour (RGBA from 3). Tag 4:
 * width and two flag bytes; join style 2 (miter) adds a 16-bit limit, and
 * bit 3 replaces the colour with a fill style.
 */
function skipLineStyle(body: Uint8Array, pos: number, version: number): number {
  pos += 2; // width
  if (version < 4) return pos + (version >= 3 ? 4 : 3);
  const first = body[pos];
  pos += 2;
  const miterJoin = ((first >> 4) & 0x3) === 2;
  if (miterJoin) pos += 2;
  if (first & 0x08) return parseFill(body, pos, true).next;
  return pos + 4;
}

function parseShape(id: number, body: Uint8Array, version: number): SwfShape {
  const withAlpha = version >= 3;
  let pos = 2;
  const bounds = readRect(body, pos);
  pos = bounds.next;
  if (version === 4) {
    const edge = readRect(body, pos);
    pos = edge.next + 1; // flags byte
  }
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let fillCount = body[pos++];
  if (fillCount === 0xff) {
    fillCount = dv.getUint16(pos, true);
    pos += 2;
  }
  const fills: SwfFill[] = [];
  for (let i = 0; i < fillCount; i++) {
    const f = parseFill(body, pos, withAlpha);
    fills.push(f.fill);
    pos = f.next;
  }
  let lineCount = body[pos++];
  if (lineCount === 0xff) {
    lineCount = dv.getUint16(pos, true);
    pos += 2;
  }
  for (let i = 0; i < lineCount; i++) pos = skipLineStyle(body, pos, version);
  let bits = new Bits(body, pos);
  let fillBits = bits.ub(4);
  let lineBits = bits.ub(4);
  void lineBits;
  /**
   * One edge per fill that claims it; a left-side claim is reversed so every
   * edge of a region runs the same way round. Regions are what edges make.
   */
  interface ShapeEdge {
    from: readonly [number, number];
    to: readonly [number, number];
    /** The control point, for an edge that curves. */
    via?: readonly [number, number];
  }
  const claimed = new Map<number, ShapeEdge[]>();
  const claim = (fill: number, edge: ShapeEdge): void => {
    if (!fill) return;
    const held = claimed.get(fill);
    if (held) held.push(edge);
    else claimed.set(fill, [edge]);
  };
  let fill0 = 0;
  let fill1 = 0;
  /** Style indices restart at one when a shape declares a fresh set, so they are rebased. */
  let fillBase = 0;
  let raw0 = 0;
  let raw1 = 0;
  let x = 0;
  let y = 0;
  const twip = 1 / 20;
  /** One fill's edges walked into outlines by chaining start to end; holes and pieces yield several. */
  const outlines = (edges: readonly ShapeEdge[]): SwfPathOp[] => {
    const at = (point: readonly [number, number]): string => `${point[0]},${point[1]}`;
    const beginningAt = new Map<string, ShapeEdge[]>();
    for (const edge of edges) {
      const key = at(edge.from);
      const held = beginningAt.get(key);
      if (held) held.push(edge);
      else beginningAt.set(key, [edge]);
    }
    const walked = new Set<ShapeEdge>();
    const ops: SwfPathOp[] = [];
    for (const start of edges) {
      if (walked.has(start)) continue;
      ops.push({ op: 'move', x: start.from[0] * twip, y: start.from[1] * twip });
      let edge: ShapeEdge | undefined = start;
      while (edge && !walked.has(edge)) {
        walked.add(edge);
        if (edge.via) {
          ops.push({
            op: 'curve',
            cx: edge.via[0] * twip,
            cy: edge.via[1] * twip,
            x: edge.to[0] * twip,
            y: edge.to[1] * twip,
          });
        } else {
          ops.push({ op: 'line', x: edge.to[0] * twip, y: edge.to[1] * twip });
        }
        edge = beginningAt.get(at(edge.to))?.find(one => !walked.has(one));
      }
    }
    return ops;
  };
  let records = 0;
  for (;;) {
    // Backstop: every record below consumes at least one bit, so more
    // iterations than bits available means the position went wrong.
    // Belt and braces next to the Bits constructor's own finite check.
    if (records++ > body.length * 8 + 64) {
      throw new SwfError('shape records do not terminate');
    }
    const typeFlag = bits.ub(1);
    if (typeFlag === 0) {
      const flags = bits.ub(5);
      if (flags === 0) break; // end record
      if (flags & 0x01) {
        // MoveTo
        const n = bits.ub(5);
        x = bits.sb(n);
        y = bits.sb(n);
      }
      if (flags & 0x02) raw0 = bits.ub(fillBits);
      if (flags & 0x04) raw1 = bits.ub(fillBits);
      if (flags & 0x08) bits.ub(lineBits); // line style: strokes are not rendered
      if (flags & 0x10) {
        // New styles: re-read both arrays, then fresh bit widths. What
        // follows numbers from one again, so the new set starts here.
        fillBase = fills.length;
        const saved = bits.bytePos;
        let p = saved;
        let nf = body[p++];
        if (nf === 0xff) {
          nf = dv.getUint16(p, true);
          p += 2;
        }
        for (let i = 0; i < nf; i++) {
          const f = parseFill(body, p, withAlpha);
          fills.push(f.fill);
          p = f.next;
        }
        let nl = body[p++];
        if (nl === 0xff) {
          nl = dv.getUint16(p, true);
          p += 2;
        }
        for (let i = 0; i < nl; i++) p = skipLineStyle(body, p, version);
        const nb = new Bits(body, p);
        fillBits = nb.ub(4);
        lineBits = nb.ub(4);
        bits = nb;
      }
      fill0 = raw0 ? fillBase + raw0 : 0;
      fill1 = raw1 ? fillBase + raw1 : 0;
    } else {
      const straight = bits.ub(1);
      const n = bits.ub(4) + 2;
      if (straight) {
        const general = bits.ub(1);
        let dx = 0;
        let dy = 0;
        if (general) {
          dx = bits.sb(n);
          dy = bits.sb(n);
        } else if (bits.ub(1)) {
          dy = bits.sb(n);
        } else {
          dx = bits.sb(n);
        }
        const from = [x, y] as const;
        x += dx;
        y += dy;
        const to = [x, y] as const;
        claim(fill1, { from, to });
        claim(fill0, { from: to, to: from });
      } else {
        const from = [x, y] as const;
        const cx = x + bits.sb(n);
        const cy = y + bits.sb(n);
        x = cx + bits.sb(n);
        y = cy + bits.sb(n);
        const to = [x, y] as const;
        const via = [cx, cy] as const;
        claim(fill1, { from, to, via });
        claim(fill0, { from: to, to: from, via });
      }
    }
  }
  // In the order the shape first claimed each fill, which is the order
  // it drew them in.
  const paths: SwfPath[] = [];
  for (const [fill, edges] of claimed) paths.push({ fill, ops: outlines(edges) });
  return { id, bounds: bounds.rect, fills, paths };
}

/**
 * One placement, from either tag. The later tag adds a flags byte before
 * the depth and a class name after; reading it as the earlier one silently
 * shifts every field a byte.
 */
function parsePlace(body: Uint8Array, extended = false): SwfPlaced | null {
  const flags = body[0];
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let pos = 1;
  const flags2 = extended ? body[pos++] : 0;
  const depth = dv.getUint16(pos, true);
  pos += 2;
  // A placement that names a class names it here, before the character.
  if (flags2 & 0x08) {
    pos = readString(body, pos).next;
  }
  let characterId: number | null = null;
  if (flags & 0x02) {
    characterId = dv.getUint16(pos, true);
    pos += 2;
  }
  let matrix = IDENTITY;
  if (flags & 0x04) {
    const m = readMatrix(body, pos);
    matrix = m.matrix;
    pos = m.next;
  }
  let opacity = 1;
  if (flags & 0x08) {
    // CXFORMWITHALPHA: add/mult flags, a bit width, then four mult terms
    // (R G B A) and four add terms. The alpha mult is the state's
    // visibility: menus park alternate states at zero rather than
    // removing them, so dropping it draws every state at once.
    const bits = new Bits(body, pos);
    const hasAdd = bits.ub(1);
    const hasMul = bits.ub(1);
    const n = bits.ub(4);
    let alpha = 1;
    if (hasMul) {
      bits.sb(n);
      bits.sb(n);
      bits.sb(n);
      alpha = bits.sb(n) / 256;
    }
    if (hasAdd) {
      bits.sb(n);
      bits.sb(n);
      bits.sb(n);
      bits.sb(n);
    }
    pos = bits.bytePos;
    opacity = Math.min(1, Math.max(0, alpha));
  }
  if (flags & 0x10) pos += 2; // ratio
  let name: string | null = null;
  if (flags & 0x20) {
    const s = readString(body, pos);
    name = s.value;
    pos = s.next;
  }
  if (flags & 0x40) {
    const clipDepth = dv.getUint16(pos, true);
    return { depth, characterId, matrix, name, opacity, clipDepth };
  }
  return { depth, characterId, matrix, name, opacity };
}

function parseEdit(id: number, body: Uint8Array): SwfEdit {
  let pos = 2;
  const bounds = readRect(body, pos);
  pos = bounds.next;
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const f0 = body[pos++];
  const f1 = body[pos++];
  const hasFont = (f0 & 0x01) !== 0;
  const hasTextColor = (f0 & 0x04) !== 0;
  const hasMaxLength = (f0 & 0x02) !== 0;
  const hasText = (f0 & 0x80) !== 0;
  const hasFontClass = (f1 & 0x80) !== 0;
  const hasLayout = (f1 & 0x20) !== 0;
  void hasMaxLength;
  let fontId: number | null = null;
  let fontHeight = 0;
  if (hasFont) {
    fontId = dv.getUint16(pos, true);
    pos += 2;
    fontHeight = dv.getUint16(pos, true) / 20;
    pos += 2;
  }
  if (hasFontClass) {
    const s = readString(body, pos);
    pos = s.next;
  }
  let color: string | null = null;
  if (hasTextColor) {
    const r = body[pos++];
    const g = body[pos++];
    const b = body[pos++];
    const a = body[pos++];
    color = `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}${a === 255 ? '' : Math.round((a / 255) * 100)}`;
  }
  let align = 0;
  if (hasLayout) {
    align = body[pos++];
    pos += 8; // margins and leading
  }
  const varName = readString(body, pos);
  pos = varName.next;
  let initialHtml = '';
  if (hasText) {
    const t = readString(body, pos);
    initialHtml = t.value;
  }
  return {
    id,
    bounds: bounds.rect,
    varName: varName.value,
    initialHtml,
    fontId,
    fontHeight,
    color,
    align,
  };
}

function parseLossless(id: number, body: Uint8Array): SwfBitmap {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let pos = 2;
  const format = body[pos++];
  const width = dv.getUint16(pos, true);
  pos += 2;
  const height = dv.getUint16(pos, true);
  pos += 2;
  if (width <= 0 || height <= 0 || width > 4096 || height > 4096) {
    throw new SwfError(`implausible bitmap ${width}x${height}`);
  }
  // Format 3 carries a colour table; either way the tag may carry no pixel
  // data at all — a pure linkage placeholder whose art loads from outside.
  if (pos >= body.length) return { id, width, height, pixels: null };
  if (format === 3) {
    const tableSize = body[pos++] + 1;
    pos += tableSize * (body.length > pos + tableSize * 4 ? 4 : 3);
  }
  // Pixel decoding is intentionally absent: the shipped movies use these
  // tags as external-art linkages, and every real pixel arrives through
  // the export table instead.
  return { id, width, height, pixels: null };
}

interface TagWalk {
  shapes: SwfShape[];
  sprites: SwfSprite[];
  edits: SwfEdit[];
  fonts: SwfFont[];
  bitmaps: SwfBitmap[];
  exports: SwfExport[];
  background: string | null;
  frames: SwfPlaced[][];
  /** Tag codes skipped as unreadable. A decorative reader tolerates a
   * handful of quirky shapes; mass failure means the reader, not the
   * file, is wrong, and the movie is rejected instead (see below). */
  skipped: number[];
}

/** The four shape tags, by tag code, numbered as the SWF spec numbers them. */
const SHAPE_TAG_VERSION: Record<number, number> = { 2: 1, 22: 2, 32: 3, 83: 4 };

/** More unreadable tags than this rejects the movie outright. */
const MAX_SKIPPED_TAGS = 8;

function walkTags(data: Uint8Array, start: number, end: number, out: TagWalk): void {
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let pos = start;
  let frame: SwfPlaced[] = [];
  let tags = 0;
  const pushFrame = (): void => {
    out.frames.push(frame);
    frame = [];
  };
  while (pos + 2 <= end) {
    const head = dv.getUint16(pos, true);
    pos += 2;
    const code = head >> 6;
    let length = head & 0x3f;
    if (length === 0x3f) {
      length = dv.getUint32(pos, true);
      pos += 4;
    }
    if (pos + length > end) throw new SwfError(`tag ${code} overruns its movie`);
    tags++;
    const body = data.subarray(pos, pos + length);
    switch (code) {
      case 0: // End
        pushFrame();
        return;
      case 1: // ShowFrame
        pushFrame();
        break;
      case 2:
      case 22:
      case 32:
      case 83:
        try {
          out.shapes.push(parseShape(dv.getUint16(pos, true), body, SHAPE_TAG_VERSION[code]));
        } catch (err) {
          if (!(err instanceof SwfError)) throw err;
          out.skipped.push(code);
        }
        break;
      case 9: {
        const r = body[0].toString(16).padStart(2, '0');
        const g = body[1].toString(16).padStart(2, '0');
        const b = body[2].toString(16).padStart(2, '0');
        out.background = `#${r}${g}${b}`;
        break;
      }
      // Taking a depth away. The tag says which depth, and older files
      // say which character as well; either way the depth is what counts.
      case 5:
      case 28: {
        const depth = dv.getUint16(pos + (code === 5 ? 2 : 0), true);
        frame.push({
          depth,
          characterId: REMOVED,
          matrix: IDENTITY,
          name: null,
          opacity: 1,
        });
        break;
      }
      case 26:
      case 70: {
        try {
          const placed = parsePlace(body, code === 70);
          if (placed) frame.push(placed);
        } catch (err) {
          if (!(err instanceof SwfError)) throw err;
          out.skipped.push(code);
        }
        break;
      }
      case 36:
        try {
          out.bitmaps.push(parseLossless(dv.getUint16(pos, true), body));
        } catch (err) {
          if (!(err instanceof SwfError)) throw err;
          out.skipped.push(code);
        }
        break;
      case 37:
        try {
          out.edits.push(parseEdit(dv.getUint16(pos, true), body));
        } catch (err) {
          if (!(err instanceof SwfError)) throw err;
          out.skipped.push(code);
        }
        break;
      case 39: {
        const id = dv.getUint16(pos, true);
        const frameCount = dv.getUint16(pos + 2, true);
        const inner: TagWalk = {
          shapes: [],
          sprites: [],
          edits: [],
          fonts: [],
          bitmaps: [],
          exports: [],
          background: null,
          frames: [],
          skipped: [],
        };
        try {
          walkTags(data, pos + 4, pos + length, inner);
        } catch (err) {
          if (!(err instanceof SwfError)) throw err;
          out.skipped.push(code);
          break;
        }
        out.shapes.push(...inner.shapes);
        out.sprites.push(...inner.sprites);
        out.edits.push(...inner.edits);
        out.fonts.push(...inner.fonts);
        out.bitmaps.push(...inner.bitmaps);
        out.skipped.push(...inner.skipped);
        out.sprites.push({ id, frameCount, frames: inner.frames });
        break;
      }
      // DefineFont2 and DefineFont3 open the same way: id, two flag
      // bytes, then the name, length-prefixed.
      case 48:
      case 75: {
        if (length < 5 || 5 + body[4] > length) {
          out.skipped.push(code);
          break;
        }
        const name = new TextDecoder('utf-8')
          .decode(body.subarray(5, 5 + body[4]))
          .replace(/\0+$/, '');
        out.fonts.push({ id: dv.getUint16(pos, true), name });
        break;
      }
      case 56: {
        const count = dv.getUint16(pos, true);
        let p = pos + 2;
        for (let i = 0; i < count; i++) {
          const id = dv.getUint16(p, true);
          p += 2;
          const s = readString(data, p);
          out.exports.push({ id, name: s.value });
          p = s.next;
        }
        break;
      }
      default:
        break; // ActionScript, glyph outlines, sounds, metadata: not interface art.
    }
    pos += length;
  }
  if (frame.length) out.frames.push(frame);
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  // CWS wraps the body in zlib: 2 header bytes and a trailing checksum
  // around raw deflate, expanded here rather than through the pack reader
  // so this decoder stays dependency-free.
  const raw = data.subarray(2, data.length - 4);
  const stream = new Blob([raw as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Parse an SWF movie. Accepts uncompressed (FWS) and zlib-compressed (CWS)
 * movies; LZMA (ZWS) is rejected — the shipped movies are FWS.
 */
export async function parseSwf(data: Uint8Array): Promise<SwfMovie> {
  if (data.length < 8) throw new SwfError('shorter than an 8-byte SWF header');
  const sig = String.fromCharCode(data[0], data[1], data[2]);
  const version = data[3];
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const declared = dv.getUint32(4, true);
  let body: Uint8Array;
  if (sig === 'FWS') {
    body = data.subarray(8);
  } else if (sig === 'CWS') {
    body = await inflateZlib(data.subarray(8));
  } else if (sig === 'ZWS') {
    throw new SwfError('LZMA-compressed SWF is not supported');
  } else {
    throw new SwfError(`not an SWF (signature ${sig})`);
  }
  if (declared !== 0 && declared !== data.length && sig === 'FWS') {
    throw new SwfError(`declared length ${declared} disagrees with ${data.length} bytes`);
  }
  const frame = readRect(body, 0);
  let pos = frame.next + 4; // frame rate and count
  const out: TagWalk = {
    shapes: [],
    sprites: [],
    edits: [],
    fonts: [],
    bitmaps: [],
    exports: [],
    background: null,
    frames: [],
    skipped: [],
  };
  walkTags(body, pos, body.length, out);
  if (out.skipped.length > MAX_SKIPPED_TAGS) {
    throw new SwfError(
      `${out.skipped.length} unreadable tags (${out.skipped.slice(0, 8).join(',')}...)`,
    );
  }
  return {
    version,
    width: frame.rect.w,
    height: frame.rect.h,
    background: out.background,
    exports: out.exports,
    shapes: out.shapes,
    sprites: out.sprites,
    edits: out.edits,
    fonts: out.fonts,
    bitmaps: out.bitmaps,
    root: out.frames,
  };
}

/**
 * One shape contour as an SVG path `d` attribute, shape-local coordinates.
 * Curves are quadratic: the reader stores the control point directly.
 */
export function swfPathToSvg(path: SwfPath): string {
  let d = '';
  for (const op of path.ops) {
    // Each outline is closed before the next one starts: a region in two
    // pieces, or one with a hole in it, is several outlines filled as a
    // whole, and left open they run into one another.
    if (op.op === 'move') d += `${d ? 'Z' : ''}M${op.x.toFixed(2)} ${op.y.toFixed(2)}`;
    else if (op.op === 'line') d += `L${op.x.toFixed(2)} ${op.y.toFixed(2)}`;
    else d += `Q${op.cx.toFixed(2)} ${op.cy.toFixed(2)} ${op.x.toFixed(2)} ${op.y.toFixed(2)}`;
  }
  return d + 'Z';
}
