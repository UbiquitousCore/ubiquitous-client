/**
 * Mounting a real `.ipa`: what gets extracted, how long it takes, and whether
 * a second visit can skip it.
 *
 * This is the path a player actually walks. It should extract only the packs
 * the opened zone needs — not maps on the other side of the world or the
 * sound pack — even when a model is missing and the lookup falls back to a
 * wider search.
 *
 *     UBIQUITOUS_PACK_DIR="<packs>;<folder with the .ipa>" npm run dev
 *     open /dev/localAssets.extract.html?ipa=<abs path to the .ipa>
 *
 * Dev only.
 */

import { startingZone } from '../src/app/startingZone';
import { WorkerAssetProvider } from '../src/assets/providers/WorkerAssetProvider';
import type { ZoneInfo } from '../src/assets/types';
import { loadConfig } from '../src/core/config';

const out = document.getElementById('out') as HTMLPreElement;

function say(line: string): void {
  out.textContent += line + '\n';
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** The zone `?zone=` names, else the first top-level zone with scenery. */
function pickZone(zones: readonly ZoneInfo[]): ZoneInfo | undefined {
  if (zones.length === 0) return undefined;
  const cfg = loadConfig(location.search);
  return startingZone(zones, { id: cfg.defaultZoneId, name: cfg.defaultZoneName }).zone;
}

async function main(): Promise<void> {
  const ipaPath = new URLSearchParams(location.search).get('ipa');
  if (!ipaPath) {
    say('Pass ?ipa=<absolute path to the .ipa>, and have that folder in $UBIQUITOUS_PACK_DIR.');
    return;
  }

  // Start from clean so the timings mean "first ever visit".
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('ubiquitous-packs', { recursive: true });
    say('cleared extracted packs');
  } catch {
    say('nothing was cached');
  }

  say(`fetching ${ipaPath}`);
  const t0 = performance.now();
  const res = await fetch(`/@fs/${ipaPath}`);
  if (!res.ok) {
    say(`FAILED: ${res.status} — is the folder in $UBIQUITOUS_PACK_DIR?`);
    return;
  }
  const file = new File([await res.blob()], ipaPath.split(/[\\/]/).pop()!);
  say(`  ${(file.size / 1e9).toFixed(2)} GB in ${secs(performance.now() - t0)}`);

  const extracted = new Map<string, number>();
  const provider = new WorkerAssetProvider({
    onProgress: p => extracted.set(p.pack, p.total),
  });
  await provider.init();

  const t1 = performance.now();
  await provider.useSource((await provider.offer(file)).id);
  say(`\nmounted in ${secs(performance.now() - t1)}`);

  const index = await provider.load({ kind: 'zoneIndex' });
  const zone = pickZone(index.zones)!;
  say(`zone list: ${index.zones.length} zones`);

  const t2 = performance.now();
  const data = await provider.load({ kind: 'zone', zoneId: zone.id });
  say(
    `\nzone ${zone.id} (${zone.name}): ${data.terrain.length} tiles, ` +
      `${data.placements.length} placements, ${secs(performance.now() - t2)}`,
  );

  // Load a batch of models and textures: a missing one must not send the
  // fallback into extracting the whole build.
  const paths = [...new Set(data.placements.map(p => p.model))].slice(0, 60);
  const t3 = performance.now();
  const models = await Promise.all(
    paths.map(p => provider.load({ kind: 'model', path: p }).catch(() => null)),
  );
  say(`${models.filter(Boolean).length}/${paths.length} models in ${secs(performance.now() - t3)}`);

  const refs = [
    ...new Set(
      models.flatMap(m => (m?.meshes ?? []).flatMap(mesh => mesh.groups.map(g => g.texture))),
    ),
  ]
    .filter((r): r is string => !!r)
    .slice(0, 40);
  const t4 = performance.now();
  const textures = await Promise.all(
    refs.map(r => provider.load({ kind: 'texture', ref: r }).catch(() => null)),
  );
  say(
    `${textures.filter(Boolean).length}/${refs.length} textures in ${secs(performance.now() - t4)}`,
  );

  say(`\ntotal from mount to a loaded zone: ${secs(performance.now() - t1)}`);

  say(`\npacks extracted (${extracted.size}):`);
  let bytes = 0;
  for (const [name, size] of [...extracted].sort((a, b) => b[1] - a[1])) {
    bytes += size;
    say(`  ${name.padEnd(24)} ${(size / 1e6).toFixed(0)} MB`);
  }
  say(`  ${'total'.padEnd(24)} ${(bytes / 1e6).toFixed(0)} MB`);

  const shouldNotAppear = [
    'sound.bin',
    'eternal_frostlund.bin',
    'under_world.bin',
    'middle_land.bin',
    'res_i.bin',
    'res_t_i.bin',
  ];
  const wrongly = shouldNotAppear.filter(n => extracted.has(n));
  say(
    wrongly.length
      ? `\nFAIL: extracted packs this zone does not need: ${wrongly.join(', ')}`
      : '\nPASS: nothing irrelevant was extracted',
  );

  // Second visit: the .ipa should not be needed at all.
  const second = new WorkerAssetProvider();
  await second.init();
  const cached = await second.cachedBuilds();
  say(`\ncached builds visible without the .ipa: ${cached.length}`);
  if (cached.length) {
    const t5 = performance.now();
    await second.useSource(cached[0].id);
    const zones2 = await second.load({ kind: 'zoneIndex' });
    say(
      `PASS: remounted from storage in ${secs(performance.now() - t5)}` +
        `, ${zones2.zones.length} zones, no .ipa and no extraction`,
    );
  } else {
    say('FAIL: nothing cached, so a second visit would ask for the file again');
  }

  document.body.dataset.result = wrongly.length || !cached.length ? 'fail' : 'pass';
}

main().catch(err => {
  say(`THREW: ${String(err)}\n${(err as Error).stack ?? ''}`);
  document.body.dataset.result = 'fail';
});
