/**
 * What a production build refuses to ship: stray files in `client/public/`,
 * or the bundled typeface without its licence.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { fontLicenceText, unexpectedPublicFiles } from '../buildChecks';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const scratch: string[] = [];
function folderWith(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'ubiquitous-build-'));
  scratch.push(dir);
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('unexpectedPublicFiles', () => {
  it('passes the public folder this checkout ships', () => {
    expect(unexpectedPublicFiles(path.join(CLIENT, 'public'))).toEqual([]);
  });

  it('accepts the three top-level files and anything directly in icons/', () => {
    const dir = folderWith({
      'config.txt': '',
      'sw.js': '',
      'manifest.webmanifest': '',
      'icons/icon-192.png': '',
      'icons/new-icon.png': '',
    });
    expect(unexpectedPublicFiles(dir)).toEqual([]);
  });

  it('names every other file, nested ones included', () => {
    const dir = folderWith({
      'config.txt': '',
      'res.bin': '',
      'icons/deeper/shot.png': '',
      'textures/stone.png': '',
      '.hidden': '',
    });
    expect(unexpectedPublicFiles(dir)).toEqual([
      '.hidden',
      'icons/deeper/shot.png',
      'res.bin',
      'textures/stone.png',
    ]);
  });
});

describe('fontLicenceText', () => {
  it('reads the OFL from the installed EB Garamond package', () => {
    const text = fontLicenceText(path.join(CLIENT, 'node_modules/@fontsource/eb-garamond'));
    expect(text).toContain('SIL OPEN FONT LICENSE');
  });

  it('refuses a package whose licence is something else', () => {
    const dir = folderWith({ LICENSE: 'MIT License\n' });
    expect(() => fontLicenceText(dir)).toThrow(/not the SIL Open Font License/);
  });
});
