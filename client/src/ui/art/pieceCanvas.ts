/** Draw a planned piece into an image URL a screen wears through a `--texture-*` slot. */

import type { UiSkinArt } from '../../assets/types';
import type { PiecePlan } from './piecePlan';

export interface PieceImage {
  /** A `url()` value: the piece, drawn. */
  url: string;
  /** Pixel size at the scale it was drawn. */
  width: number;
  height: number;
}

/** Bitmap fills map into twips; lengths arrive in pixels, so scales divide by 20. */
const TWIPS_PER_PIXEL = 20;

/** Anything larger than this in either axis is not a piece of interface. */
const MAX_EDGE = 4096;

/** Half-pixel growth of clipped fills: anti-aliased edges laid side by side leave a pale hairline. */
const OVERLAP = 0.5;

/** Every number in a path, which for these shapes is every coordinate. */
const FIGURES = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

/** A path's extent from its coordinate pairs; null for one it cannot read. */
function extentOf(path: string): { x: number; y: number; w: number; h: number } | null {
  const figures = path.match(FIGURES);
  if (!figures || figures.length < 4 || figures.length % 2 !== 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let foot = -Infinity;
  for (let i = 0; i < figures.length; i += 2) {
    const x = Number(figures[i]);
    const y = Number(figures[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    foot = Math.max(foot, y);
  }
  if (right <= left || foot <= top) return null;
  return { x: left, y: top, w: right - left, h: foot - top };
}

/** Growth cap as a share of a shape's extent: half a pixel for a sheet, almost none for a thin rule. */
const MOST_GROWTH = 0.15;

/** Grow a path slightly about its middle so neighbours overlap; the transform is restored, the clip outlives it. */
function grown(
  ctx: CanvasRenderingContext2D,
  data: string,
  scale: number,
  paint: () => void,
): void {
  const extent = extentOf(data);
  const base = ctx.getTransform?.();
  if (!extent || !base) {
    paint();
    return;
  }
  // The growth is asked for in drawn pixels, so it is converted into the
  // space the path is in before it is applied.
  const by = (OVERLAP * 2) / scale;
  const wider = 1 + Math.min(by, extent.w * MOST_GROWTH) / extent.w;
  const taller = 1 + Math.min(by, extent.h * MOST_GROWTH) / extent.h;
  if (wider === 1 && taller === 1) {
    paint();
    return;
  }
  const middle = { x: extent.x + extent.w / 2, y: extent.y + extent.h / 2 };
  ctx.translate(middle.x, middle.y);
  ctx.scale(wider, taller);
  ctx.translate(-middle.x, -middle.y);
  paint();
  ctx.setTransform(base);
}

/** A tiling fill per its matrix, in the path's space; null falls back to one copy. */
function pattern(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  shown: { w: number; h: number },
  into: { a: number; b: number; c: number; d: number; e: number; f: number },
): CanvasPattern | null {
  const made = ctx.createPattern(image as CanvasImageSource, 'repeat');
  if (!made || typeof DOMMatrix === 'undefined' || !made.setTransform) return null;
  // The tile is laid at the size it is shown at, then placed by the fill.
  const sized = new DOMMatrix([into.a, into.b, into.c, into.d, into.e, into.f]).scale(
    shown.w / Math.max(1, Number((image as { width?: number }).width ?? shown.w)),
    shown.h / Math.max(1, Number((image as { height?: number }).height ?? shown.h)),
  );
  made.setTransform(sized);
  return made;
}

/** Render a plan at `asked` times its size, or as near as a canvas allows; null when nothing can be drawn. */
export function drawPiece(
  plan: PiecePlan,
  art: ReadonlyMap<string, UiSkinArt>,
  asked = 1,
): PieceImage | null {
  // A piece wider than a canvas allows at the asked scale is drawn as fine
  // as one allows, rather than not at all: a strip of pages side by side is
  // still a piece of interface.
  const scale = Math.min(asked, MAX_EDGE / Math.max(plan.box.w, plan.box.h, 1));
  const width = Math.round(plan.box.w * scale);
  const height = Math.round(plan.box.h * scale);
  if (width < 1 || height < 1 || width > MAX_EDGE || height > MAX_EDGE) return null;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let drew = false;
  for (const op of plan.ops) {
    const path = new Path2D(op.path);
    ctx.save();
    ctx.scale(scale, scale);
    // Each mask narrows what the path can show; nested masks narrow in
    // turn. Clipped before the path's own transform, since each outline
    // carries its own.
    for (const mask of op.clips ?? []) {
      const region = new Path2D();
      for (const outline of mask) {
        const m = outline.matrix;
        region.addPath(new Path2D(outline.path), new DOMMatrix([m.a, m.b, m.c, m.d, m.tx, m.ty]));
      }
      ctx.clip(region);
    }
    ctx.transform(op.matrix.a, op.matrix.b, op.matrix.c, op.matrix.d, op.matrix.tx, op.matrix.ty);
    if (op.fill.kind === 'solid') {
      ctx.globalAlpha = op.opacity * op.fill.opacity;
      ctx.fillStyle = op.fill.css;
      grown(ctx, op.path, scale, () => ctx.fill(path));
      drew = true;
    } else {
      const bitmap = art.get(op.fill.art);
      const m = op.fill.matrix;
      // A fill scaled to nothing covers nothing: drawing it would stretch
      // one row of pixels across the whole piece.
      if (bitmap && m.a * m.d - m.b * m.c !== 0) {
        ctx.globalAlpha = op.opacity;
        // Art shipped at the finer rung carries twice the pixels for the
        // same region, so it draws at half size to cover the same ground.
        const shown = {
          w: bitmap.image.width * bitmap.scale,
          h: bitmap.image.height * bitmap.scale,
        };
        const into = {
          a: m.a / TWIPS_PER_PIXEL,
          b: m.b / TWIPS_PER_PIXEL,
          c: m.c / TWIPS_PER_PIXEL,
          d: m.d / TWIPS_PER_PIXEL,
          e: m.tx,
          f: m.ty,
        };
        const tiled = op.fill.repeating ? pattern(ctx, bitmap.image, shown, into) : null;
        if (tiled) {
          // A tile repeats along whatever it fills — the edge of a frame
          // is one small piece of art repeated, and one copy of it leaves
          // the rest of the edge bare.
          ctx.fillStyle = tiled;
          grown(ctx, op.path, scale, () => ctx.fill(path));
        } else {
          // Clip in shape space, then draw in the fill's own space: the
          // bitmap lands where the fill puts it, showing only the region
          // the path exposes.
          grown(ctx, op.path, scale, () => ctx.clip(path));
          ctx.transform(into.a, into.b, into.c, into.d, into.e, into.f);
          ctx.drawImage(bitmap.image, 0, 0, shown.w, shown.h);
        }
        drew = true;
      }
    }
    ctx.restore();
  }
  if (!drew) return null;
  return { url: canvas.toDataURL('image/png'), width, height };
}
