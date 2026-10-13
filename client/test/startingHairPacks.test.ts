/**
 * The hair a new character starts with, against the player's own builds.
 *
 * Every playable body in both builds carries a bare-scalp hair style as its
 * first, and some carry two. This follows a fresh draft through the same
 * steps the screens take — the body's list of looks arrives, the draft
 * settles on it — and holds the style it lands on to the model's own
 * meshes: it must be one that draws hair.
 *
 * Needs game data and skips without it: `.cache/<build>/res.bin`, or
 * `UBIQUITOUS_PACK=/path/to/res.bin`. Nothing here quotes the builds.
 */

import { existsSync, openAsBlob, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { Bdae } from '../src/assets/formats/bdae';
import { SHEET_MATERIALS } from '../src/assets/formats/avatarSheet';
import { lookOptionsId, playableKindsId } from '../src/assets/ids';
import type { LookOptions, NetworkAppearance, PlayableKinds } from '../src/assets/types';
import { draft, setLooks, startDraft } from '../src/ui/frontend/frontEndStore';
import { PackReader, unwrapBdae } from '../src/assets/vfs/zip';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Every build on disk, by the directory holding its packs. */
function builds(): string[] {
  const found = new Set<string>();
  const explicit = (process.env.UBIQUITOUS_PACK ?? '').trim();
  if (explicit && existsSync(explicit)) found.add(dirname(resolve(explicit)));
  const base = join(ROOT, '.cache');
  if (existsSync(base)) {
    for (const dir of readdirSync(base).sort()) {
      if (existsSync(join(base, dir, 'res.bin'))) found.add(join(base, dir));
    }
  }
  return [...found];
}

const BUILDS = builds();
const FEMALE = 1;

/** Indices a hair mesh draws in its own material rather than the skin's. */
async function ownHairIndices(resBin: string, model: string, style: number): Promise<number> {
  const file = new File([await openAsBlob(resBin)], 'res.bin');
  const pack = await PackReader.open(
    {
      size: file.size,
      read: async (offset, length) =>
        new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    },
    'res.bin',
  );
  const entry = pack.entries.find(e => e.name.toLowerCase() === model.toLowerCase())!;
  const doc = new Bdae((await unwrapBdae(await pack.read(entry))).payload);
  const want = `hair_${String(style).padStart(2, '0')}`;
  return doc
    .meshes(true)
    .filter(m => m.name.toLowerCase().replace('-mesh', '') === want)
    .flatMap(m => m.groups)
    .filter(g => !SHEET_MATERIALS.has(g.material))
    .reduce((sum, g) => sum + g.count, 0);
}

describe.skipIf(!BUILDS.length)('a new character’s hair, against the player’s builds', () => {
  for (const dir of BUILDS) {
    it(`starts every playable body on a style with hair in ${dir.split('/').pop()}`, async () => {
      const names = ['res.bin', 'res_t.bin', 'tables.bin'].filter(n => existsSync(join(dir, n)));
      const files = await Promise.all(
        names.map(async n => new File([await openAsBlob(join(dir, n))], n)),
      );
      const provider = new PackAssetProvider();
      await provider.useSource(provider.offer(files).id);

      const kinds = (await provider.load(playableKindsId())) as PlayableKinds;
      expect(kinds.races.length).toBeGreaterThan(0);
      let bareFirst = 0;
      for (const race of kinds.races) {
        for (const gender of [0, FEMALE]) {
          const body = `race ${race.race} gender ${gender}`;
          startDraft(race.race, gender);
          const displayInfoId =
            gender === FEMALE ? race.femaleDisplayInfoId : race.maleDisplayInfoId;
          const asked = {
            kind: 'networkAppearance' as const,
            entry: 0,
            displayInfoId,
            race: race.race,
            gender,
            skin: 1,
            face: 1,
            hairStyle: draft.value.hairStyle,
            hairColor: 1,
            equipment: [],
            animationId: 0,
          };
          const { model } = (await provider.load(asked)) as NetworkAppearance;
          const offered = (await provider.load(lookOptionsId(model))) as LookOptions;
          if (offered.bareHairStyles.includes(offered.hairStyles[0])) bareFirst++;

          setLooks(offered);
          const style = draft.value.hairStyle;
          expect(offered.hairStyles, body).toContain(style);
          expect(offered.bareHairStyles, body).not.toContain(style);
          expect(await ownHairIndices(join(dir, 'res.bin'), model, style), body).toBeGreaterThan(6);

          // What the preview asks for with the settled draft wears that
          // style's mesh, so the body shown is the body sent.
          const shown = (await provider.load({ ...asked, hairStyle: style })) as NetworkAppearance;
          const hair = shown.appearance!.meshes.filter(m => /^hair_/i.test(m));
          expect(
            hair.map(m => m.toLowerCase().replace('-mesh', '')),
            body,
          ).toEqual([`hair_${String(style).padStart(2, '0')}`]);
        }
      }
      // The case this guards: most bodies number a bare scalp first.
      expect(bareFirst).toBeGreaterThan(kinds.races.length);
    }, 300_000);
  }
});
