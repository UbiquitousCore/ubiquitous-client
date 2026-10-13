/**
 * The typefaces every word is set in: the build's, registered under two
 * fixed names, falling back to the client's own lettering. None are shipped.
 */

/** What the body face is registered as. A plain name, not a game word. */
export const BODY_FAMILY = 'UbiquitousBody';

/** What the title face is registered as. */
export const TITLE_FAMILY = 'UbiquitousTitle';

/**
 * The lettering the client came with, and what stands in for the build's
 * typefaces before they load or where they lack a glyph. The stylesheet's
 * `--font-*` tokens end in exactly this, so a canvas and the page fall back
 * alike.
 */
export const FALLBACK_STACK =
  "'EB Garamond', Georgia, 'Iowan Old Style', 'Palatino Linotype', 'Times New Roman', serif";

/** The body face, then the fallback. */
export const BODY_STACK = `'${BODY_FAMILY}', ${FALLBACK_STACK}`;

/** The title face, then the body face, then the fallback. */
export const TITLE_STACK = `'${TITLE_FAMILY}', '${BODY_FAMILY}', ${FALLBACK_STACK}`;

/**
 * A canvas `font` value in the body face.
 *
 * No weight: the build ships its typefaces in one weight only, and a
 * canvas asked for bold smears a thickened copy of it.
 */
export function canvasFont(px: number): string {
  return `${px}px ${BODY_STACK}`;
}

/** One typeface as read out of the build: the name the movies use, and the file. */
export interface Face {
  family: string;
  bytes: Uint8Array;
}

/** The names the build's typefaces go by in its own movies, once registered. */
export interface FaceNames {
  body: string | null;
  title: string | null;
}

let registered: FaceNames = { body: null, title: null };
const listeners = new Set<() => void>();

/** The build's names for the typefaces registered so far. */
export function registeredFaces(): FaceNames {
  return registered;
}

/**
 * Be told whenever a typeface has been registered, so text already drawn
 * into a canvas can be drawn again in it. Returns the unsubscribe.
 */
export function onFacesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Register the build's typefaces under the fixed names, each loaded first; one the browser rejects is skipped. */
export async function registerFaces(faces: {
  body: Face | null;
  title: Face | null;
}): Promise<boolean> {
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') return false;
  const next: FaceNames = { ...registered };
  let took = false;
  for (const [role, family] of [
    ['body', BODY_FAMILY],
    ['title', TITLE_FAMILY],
  ] as const) {
    const face = faces[role];
    if (!face) continue;
    try {
      const copy = new Uint8Array(face.bytes).buffer as ArrayBuffer;
      const loaded = new FontFace(family, copy, { weight: '400', style: 'normal' });
      await loaded.load();
      document.fonts.add(loaded);
      next[role] = face.family;
      took = true;
    } catch {
      // Unreadable: this face stays in the fallback lettering.
    }
  }
  if (!took) return false;
  registered = next;
  for (const listener of listeners) listener();
  return true;
}
