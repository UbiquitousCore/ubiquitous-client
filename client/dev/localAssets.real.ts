/**
 * The local asset path, in a browser, against the user's own packs.
 *
 * This checks that the readers work in a browser, through a Worker, with
 * `ImageBitmap` and OPFS — none of which exist in Node, and all of which the client actually depends on.
 *
 *     UBIQUITOUS_PACK_DIR=<extracted packs> npm run dev
 *     open http://localhost:8780/dev/localAssets.real.html
 *
 * Dev only. Reads packs over `/@fs/`, which vite serves only for the directory
 * named by $UBIQUITOUS_PACK_DIR.
 */

import { startingZone } from '../src/app/startingZone';
import { WorkerAssetProvider } from '../src/assets/providers/WorkerAssetProvider';
import type { ZoneInfo } from '../src/assets/types';
import { loadConfig } from '../src/core/config';

const out = document.getElementById('out') as HTMLPreElement;
const gallery = document.getElementById('gallery') as HTMLDivElement;
let failures = 0;

function say(line: string): void {
  out.textContent += line + '\n';
}

/** The zone `?zone=` names, else the first top-level zone with scenery. */
function pickZone(zones: readonly ZoneInfo[]): ZoneInfo | undefined {
  if (zones.length === 0) return undefined;
  const cfg = loadConfig(location.search);
  return startingZone(zones, { id: cfg.defaultZoneId, name: cfg.defaultZoneName }).zone;
}

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

function ms(v: number): string {
  return `${v.toFixed(0)} ms`;
}

/** The packs to mount, smallest first so failures surface early. */
const PACKS = [
  'conf.bin',
  'tables.bin',
  'model_phy.bin',
  'land1.bin',
  'land1_layer.bin',
  'res_t.bin',
  'res.bin',
];

async function fetchPack(dir: string, name: string): Promise<File | null> {
  const res = await fetch(`/@fs/${dir}/${name}`);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new File([blob], name);
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const dir = params.get('dir');
  if (!dir) {
    say('Pass ?dir=<absolute path to the extracted packs>.');
    say('That directory must also be $UBIQUITOUS_PACK_DIR when vite started.');
    return;
  }

  say(`user agent: ${navigator.userAgent}`);
  say(`packs from: ${dir}\n`);

  const files: File[] = [];
  const t0 = performance.now();
  for (const name of PACKS) {
    const file = await fetchPack(dir, name);
    if (file) {
      files.push(file);
      say(`  ${name.padEnd(18)} ${(file.size / 1e6).toFixed(0)} MB`);
    }
  }
  check(
    'fetched the packs',
    files.length > 0,
    `${files.length} of ${PACKS.length}, ${ms(performance.now() - t0)}`,
  );
  if (!files.length) return;

  const provider = new WorkerAssetProvider({
    onProgress: p => {
      out.textContent = out.textContent!.replace(/\n\[extracting[^\n]*$/, '');
      say(`[extracting ${p.pack} ${Math.round((p.done / p.total) * 100)}%]`);
    },
  });
  await provider.init();

  const t1 = performance.now();
  const source = await provider.useSource((await provider.offer(files)).id);
  check('mounted through the worker', !!source.label, `${ms(performance.now() - t1)}`);

  // -- zone index ------------------------------------------------------
  const t2 = performance.now();
  const index = await provider.load({ kind: 'zoneIndex' });
  check(
    'zoneIndex',
    index.zones.length > 100,
    `${index.zones.length} zones in ${ms(performance.now() - t2)}`,
  );

  const zone = pickZone(index.zones);
  if (!zone) return;
  say(`\nzone ${zone.id} (${zone.name}, map ${zone.mapId})`);

  // -- zone ------------------------------------------------------------
  const t3 = performance.now();
  const data = await provider.load({ kind: 'zone', zoneId: zone.id });
  const zoneMs = performance.now() - t3;
  check('zone: terrain', data.terrain.length > 0, `${data.terrain.length} tiles`);
  check(
    'zone: placements',
    data.placements.length > 0,
    `${data.placements.length} in ${ms(zoneMs)}`,
  );
  check(
    'zone: heights survived the worker transfer',
    data.terrain[0]?.heights instanceof Float32Array && data.terrain[0].heights.length === 65 * 65,
    `${data.terrain[0]?.heights?.length ?? 0} samples`,
  );

  // -- collision -------------------------------------------------------
  const t4 = performance.now();
  const collision = await provider.load({ kind: 'collision', zoneId: zone.id });
  check(
    'collision',
    collision.items.length > 0,
    `${collision.items.length} items in ${ms(performance.now() - t4)}`,
  );

  // -- models ----------------------------------------------------------
  const modelPath =
    data.placements.find(p => p.kind === 'scenery')?.model ?? data.placements[0].model;
  const t5 = performance.now();
  const model = await provider.load({ kind: 'model', path: modelPath });
  check(
    `model ${modelPath.split('/').pop()}`,
    model.meshes.length > 0,
    `${model.meshes.length} meshes, ${model.meshes[0].positions.length / 3} verts, ` +
      ms(performance.now() - t5),
  );
  check(
    'model: geometry is a typed array',
    model.meshes[0].positions instanceof Float32Array &&
      model.meshes[0].indices instanceof Uint32Array,
  );

  // A batch, to see what a zone's worth of models costs.
  const paths = [...new Set(data.placements.map(p => p.model))].slice(0, 40);
  const t6 = performance.now();
  const loaded = await Promise.all(
    paths.map(p => provider.load({ kind: 'model', path: p }).catch(() => null)),
  );
  const okCount = loaded.filter(Boolean).length;
  check(
    '40 models in a batch',
    okCount > paths.length * 0.8,
    `${okCount}/${paths.length} in ${ms(performance.now() - t6)}`,
  );

  // -- character + skeleton + animation --------------------------------
  const charPath = 'model/npc/character/human/male/human_m_h.bdae';
  try {
    const t7 = performance.now();
    const skeleton = await provider.load({ kind: 'skeleton', path: charPath });
    check(
      'skeleton',
      skeleton.bones.length > 0,
      `${skeleton.bones.length} bones, ${skeleton.skins.length} skins, ` +
        ms(performance.now() - t7),
    );

    const animPath = 'model/npc/character/human/male/anim/idle01.bdae';
    const t8 = performance.now();
    const clip = await provider.load({
      kind: 'animation',
      path: animPath,
      modelPath: charPath,
    });
    check(
      'animation',
      clip.tracks.length > 0,
      `${clip.tracks.length} tracks, ${clip.duration.toFixed(2)}s, ` + ms(performance.now() - t8),
    );
  } catch (err) {
    check('skeleton/animation', false, String(err));
  }

  // -- textures --------------------------------------------------------
  const textured = data.placements
    .map(p => p.model)
    .slice(0, 1)
    .flatMap(() => model.meshes.flatMap(m => m.groups.map(g => g.texture)))
    .filter((t): t is string => !!t);
  if (textured.length) {
    const t9 = performance.now();
    const texture = await provider.load({ kind: 'texture', ref: textured[0] });
    check(
      `texture ${textured[0].split('/').pop()}`,
      texture.image.width > 0,
      `${texture.image.width}x${texture.image.height} in ${ms(performance.now() - t9)}`,
    );
    draw(texture.image, textured[0]);
  }

  // The ground mask is built by the provider rather than read from a pack.
  const mask = data.terrain[0]?.maskTexture;
  if (mask) {
    try {
      const t10 = performance.now();
      const image = await provider.load({ kind: 'texture', ref: mask });
      check(
        'ground mask',
        image.image.width > 0,
        `${image.image.width}x${image.image.height} in ${ms(performance.now() - t10)}`,
      );
      draw(image.image, 'ground mask');
    } catch (err) {
      check('ground mask', false, String(err));
    }
  }

  // A composited character atlas — the layered one, not a shipped file.
  const creature = data.placements.find(p => p.appearance?.skin?.startsWith('avatar:'));
  if (creature?.appearance) {
    try {
      const t11 = performance.now();
      const skin = await provider.load({ kind: 'texture', ref: creature.appearance.skin! });
      check(
        'composited character skin',
        skin.image.width > 0,
        `${skin.image.width}x${skin.image.height} in ${ms(performance.now() - t11)}`,
      );
      draw(skin.image, `skin: ${creature.model.split('/').pop()}`);
    } catch (err) {
      check('composited character skin', false, String(err));
    }
  }

  say('');
  say(failures === 0 ? 'ALL PASS' : `${failures} FAILED`);
  document.body.dataset.result = failures === 0 ? 'pass' : 'fail';
}

function draw(bitmap: ImageBitmap, label: string): void {
  const figure = document.createElement('figure');
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
  const caption = document.createElement('figcaption');
  caption.textContent = `${label} (${bitmap.width}x${bitmap.height})`;
  figure.append(canvas, caption);
  gallery.append(figure);
}

main().catch(err => {
  say(`THREW: ${String(err)}\n${(err as Error).stack ?? ''}`);
  document.body.dataset.result = 'fail';
});
