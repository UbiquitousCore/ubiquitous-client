/**
 * Who can reach the dev server, and what it will serve them.
 *
 * The dev server can serve directories outside the project (the extracted
 * packs, the folder holding the .ipa) to the dev pages. That is the user's own
 * game data, so it must never reach the local network by accident: binding to
 * the LAN and serving pack directories each need their own explicit switch.
 */

import { describe, expect, it } from 'vitest';
import { devServerExposure } from '../devServerExposure';

const REPO = '/repo';

describe('devServerExposure', () => {
  it('listens on localhost only when nothing is set', () => {
    expect(devServerExposure({}, REPO)).toMatchObject({ host: 'localhost', packDirs: [] });
  });

  it('binds to every interface when UBIQUITOUS_LAN=1', () => {
    expect(devServerExposure({ UBIQUITOUS_LAN: '1' }, REPO).host).toBe(true);
  });

  it('treats anything but 1 as LAN off', () => {
    for (const value of ['', '0', 'true', 'yes']) {
      expect(devServerExposure({ UBIQUITOUS_LAN: value }, REPO).host).toBe('localhost');
    }
  });

  it('serves the pack directories on localhost, split on semicolons', () => {
    expect(devServerExposure({ UBIQUITOUS_PACK_DIR: ' /packs ; /ipa-folder ;; ' }, REPO)).toMatchObject({
      host: 'localhost',
      packDirs: ['/packs', '/ipa-folder'],
    });
  });

  it('refuses to serve pack directories to the LAN without a second switch', () => {
    expect(() => devServerExposure({ UBIQUITOUS_LAN: '1', UBIQUITOUS_PACK_DIR: '/packs' }, REPO)).toThrow(
      /UBIQUITOUS_LAN_PACKS=1/,
    );
  });

  it('serves pack directories to the LAN when both switches are set', () => {
    expect(
      devServerExposure({ UBIQUITOUS_LAN: '1', UBIQUITOUS_PACK_DIR: '/packs', UBIQUITOUS_LAN_PACKS: '1' }, REPO),
    ).toMatchObject({ host: true, packDirs: ['/packs'] });
  });

  it('ignores UBIQUITOUS_LAN_PACKS when LAN is off', () => {
    expect(devServerExposure({ UBIQUITOUS_PACK_DIR: '/packs', UBIQUITOUS_LAN_PACKS: '1' }, REPO).host).toBe(
      'localhost',
    );
  });

  it('refuses the files an unpacked .ipa holds until a pack directory is named', () => {
    const kinds = (deny: string[]): string[] =>
      deny.flatMap(pattern => /^\*\*\/\*\.\{(.+)\}$/.exec(pattern)?.[1].split(',') ?? []);
    const unpacked = [
      'bdae',
      'tbl',
      'tga',
      'phy',
      'itm',
      'beff',
      'plist',
      'nib',
      'strings',
      'bar',
      'caf',
    ];
    expect(kinds(devServerExposure({}, REPO).deny)).toEqual(expect.arrayContaining(unpacked));
    expect(kinds(devServerExposure({ UBIQUITOUS_PACK_DIR: '/packs' }, REPO).deny)).toEqual([]);
  });

  it('refuses the scratch and cache folders of this checkout only, wherever it is cloned', () => {
    const repo = '/home/runner/work/ubiquitous-client/ubiquitous-client';
    const { deny } = devServerExposure({}, repo);
    expect(deny).toContain(`${repo}/**/work/**`);
    expect(deny).toContain(`${repo}/**/.cache/**`);
    expect(
      deny.some(pattern => pattern.startsWith('**/work') || pattern.startsWith('**/.cache')),
    ).toBe(false);
  });

  it('normalizes windows checkout paths before building deny globs', () => {
    const { deny } = devServerExposure({}, 'C:\\repo\\ubiquitous-client');
    expect(deny).toContain('C:/repo/ubiquitous-client/**/work/**');
    expect(deny).toContain('C:/repo/ubiquitous-client/**/.cache/**');
  });
});
