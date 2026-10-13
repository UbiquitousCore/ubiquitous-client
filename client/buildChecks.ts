/**
 * Checks a production build runs before it writes anything.
 *
 * - `client/public/` is copied into the build as it is, so it may hold only
 *   the files the app itself serves. Anything else dropped there would ship.
 * - The EB Garamond font files are bundled, and their licence asks to travel
 *   with them, so the build copies it and refuses to run without it.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** What `client/public/` may hold: three files at the top, and the app icons. */
function isPublicFile(relative: string): boolean {
  const parts = relative.split('/');
  if (parts.length === 1) return ['config.txt', 'sw.js', 'manifest.webmanifest'].includes(parts[0]);
  return parts.length === 2 && parts[0] === 'icons';
}

function filesUnder(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

/** Paths under `publicDir`, relative and `/`-separated, that the build must not ship. */
export function unexpectedPublicFiles(publicDir: string): string[] {
  return filesUnder(publicDir)
    .filter(file => !isPublicFile(file))
    .sort();
}

/** The typeface's licence text, read from its npm package. Throws unless it is the OFL. */
export function fontLicenceText(fontPackageDir: string): string {
  const text = readFileSync(path.join(fontPackageDir, 'LICENSE'), 'utf8');
  if (!text.includes('SIL OPEN FONT LICENSE Version 1.1')) {
    throw new Error(`${fontPackageDir}/LICENSE is not the SIL Open Font License 1.1`);
  }
  return text;
}
