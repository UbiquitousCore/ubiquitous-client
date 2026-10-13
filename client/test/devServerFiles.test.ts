/**
 * Which files the dev server will hand out, asked of Vite itself with this
 * project's own `vite.config.ts`.
 *
 * The dev pages read packs and the `.ipa` over `/@fs/` from the directories in
 * `$UBIQUITOUS_PACK_DIR`, so those must stay readable when that switch is on; with it
 * off, no game data is served from anywhere. Secrets are never served.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { isFileLoadingAllowed, normalizePath, resolveConfig } from 'vite';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.dirname(CLIENT);
const PACKS = path.join(REPO, '.cache', 'build');

const saved = process.env.UBIQUITOUS_PACK_DIR;
afterEach(() => {
  if (saved === undefined) delete process.env.UBIQUITOUS_PACK_DIR;
  else process.env.UBIQUITOUS_PACK_DIR = saved;
});

async function servable(packDir: string | undefined): Promise<(file: string) => boolean> {
  if (packDir === undefined) delete process.env.UBIQUITOUS_PACK_DIR;
  else process.env.UBIQUITOUS_PACK_DIR = packDir;
  const config = await resolveConfig(
    { configFile: path.join(CLIENT, 'vite.config.ts'), logLevel: 'silent' },
    'serve',
  );
  return file => isFileLoadingAllowed(config, normalizePath(file));
}

describe('dev server files', () => {
  it('serves the project and refuses game data anywhere when no pack directory is set', async () => {
    const can = await servable(undefined);
    expect(can(path.join(CLIENT, 'src/main.ts'))).toBe(true);
    expect(can(path.join(CLIENT, 'res.bin'))).toBe(false);
    expect(can(path.join(CLIENT, 'game.ipa'))).toBe(false);
    expect(can(path.join(CLIENT, '.cache/build/res.bin'))).toBe(false);
    expect(can(path.join(CLIENT, 'work/notes.txt'))).toBe(false);
    expect(can(path.join(PACKS, 'res.bin'))).toBe(false);
  });

  it('serves the packs and the .ipa from the pack directory, and nothing beside it', async () => {
    const can = await servable(PACKS);
    expect(can(path.join(PACKS, 'res.bin'))).toBe(true);
    expect(can(path.join(PACKS, 'game.ipa'))).toBe(true);
    expect(can(path.join(REPO, '.cache', 'other', 'res.bin'))).toBe(false);
    expect(can(path.join(REPO, 'work/notes.txt'))).toBe(false);
  });

  it('never serves environment files, certificates or git internals', async () => {
    for (const packDir of [undefined, PACKS]) {
      const can = await servable(packDir);
      expect(can(path.join(CLIENT, '.env'))).toBe(false);
      expect(can(path.join(CLIENT, '.env.local'))).toBe(false);
      expect(can(path.join(CLIENT, '.cert/dev.pem'))).toBe(false);
      expect(can(path.join(CLIENT, 'dev.crt'))).toBe(false);
      expect(can(path.join(PACKS, '.env'))).toBe(false);
      expect(can(path.join(CLIENT, '.git/config'))).toBe(false);
    }
  });
});
