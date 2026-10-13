/**
 * Browser smoke test for the local asset path.
 *
 * Unit tests run in Node, where there is no origin-private filesystem and no
 * `createImageBitmap`. Those are exactly the two things the local provider
 * depends on, so they are checked here instead — in a real browser, against a
 * synthetic .ipa built in memory so it needs no game data and no file picker.
 *
 *     npm run dev    then open  http://localhost:8780/dev/localAssets.smoke.html
 *
 * Dev-only. Not imported by the client and not part of the bundle.
 */

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { listCachedBuilds, storageEstimate } from '../src/assets/vfs/PackStore';
import { PackReader } from '../src/assets/vfs/zip';
import { bytesSource } from '../src/assets/vfs/ByteSource';
import { decodeTexture } from '../src/assets/formats/texture';

const out = document.getElementById('out') as HTMLPreElement;
let failures = 0;

function say(line: string): void {
  out.textContent += line + '\n';
}

function check(name: string, ok: boolean, detail = ''): void {
  if (!ok) failures++;
  say(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

// -- fixtures (same layouts as test/helpers/fixtures.ts) ----------------

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function deflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

interface Member {
  name: string;
  data: Uint8Array;
  deflate?: boolean;
}

async function buildPack(members: Member[], signature: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const m of members) {
    const nameBytes = new TextEncoder().encode(m.name);
    const stored = m.deflate ? await deflateRaw(m.data) : m.data;
    const method = m.deflate ? 8 : 0;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(lfh.buffer);
    ldv.setUint32(0, signature, true);
    ldv.setUint16(8, method, true);
    ldv.setUint32(18, stored.length, true);
    ldv.setUint32(22, m.data.length, true);
    ldv.setUint16(26, nameBytes.length, true);
    lfh.set(nameBytes, 30);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cd.buffer);
    cdv.setUint32(0, 0x02014b50, true);
    cdv.setUint16(10, method, true);
    cdv.setUint32(20, stored.length, true);
    cdv.setUint32(24, m.data.length, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);

    chunks.push(lfh, stored);
    central.push(cd);
    offset += lfh.length + stored.length;
  }
  const cdBytes = concat(central);
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, members.length, true);
  edv.setUint16(10, members.length, true);
  edv.setUint32(12, cdBytes.length, true);
  edv.setUint32(16, offset, true);
  return concat([...chunks, cdBytes, eocd]);
}

/** A 4x4 PVRTC texture, both endpoints opaque white. */
function whitePvr(): Uint8Array {
  const buf = new Uint8Array(60);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 52, true);
  dv.setUint32(4, 4, true);
  dv.setUint32(8, 4, true);
  dv.setUint32(16, 25, true);
  dv.setUint32(20, 8, true);
  dv.setUint32(24, 4, true);
  buf.set(new TextEncoder().encode('PVR!'), 44);
  const colourA = 0x8000 | (0x1f << 10) | (0x1f << 5) | (0x0f << 1);
  const colourB = (0x1f << 10) | (0x1f << 5) | 0x1f;
  dv.setUint32(52, 0, true);
  dv.setUint32(56, (((0x8000 | colourB) << 16) | colourA) >>> 0, true);
  return buf;
}

// -- the run -----------------------------------------------------------

async function main(): Promise<void> {
  say(`user agent: ${navigator.userAgent}`);
  say('');

  // A pack big enough that extracting it is a real streamed write, not a
  // single chunk: 8 MB of compressible filler beside the texture.
  const filler = new Uint8Array(8 << 20);
  for (let i = 0; i < filler.length; i++) filler[i] = i & 0xff;

  const res = await buildPack(
    [
      { name: 'texture/scene/white.tga', data: whitePvr() },
      { name: 'filler.bin', data: filler },
    ],
    0x504d4247,
  ); // GBMP
  say(`built a ${(res.length / 1e6).toFixed(1)} MB GBMP pack`);

  // Deflated inside the .ipa, as shipped packs are — this is what
  // forces the extract-to-storage path rather than addressing in place.
  const ipaBytes = await buildPack(
    [{ name: 'Payload/Game.app/res.bin', data: res, deflate: true }],
    0x04034b50,
  );
  const ipa = new File([ipaBytes as BlobPart], 'ubiquitous-2.2.0-smoke.ipa');
  say(`built a ${(ipa.size / 1e6).toFixed(1)} MB .ipa (res.bin stored deflated)`);
  say('');

  check('OPFS is available', !!navigator.storage?.getDirectory);

  // Start from clean, so "cached" below means this run wrote it.
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry('ubiquitous-packs', { recursive: true });
  } catch {
    // Nothing there yet.
  }

  const progress: number[] = [];
  const provider = new PackAssetProvider({
    onProgress: p => progress.push(p.done),
  });
  await provider.init();

  const offered = provider.offer(ipa);
  const t0 = performance.now();
  const source = await provider.useSource(offered.id);
  check(
    'mounts the .ipa',
    source.label.endsWith('.ipa'),
    `${(performance.now() - t0).toFixed(0)} ms`,
  );
  check(
    'reads the build version out of the name',
    source.version === '2.2.0',
    String(source.version),
  );

  // Loading a texture forces res.bin out of the .ipa and into storage.
  const t1 = performance.now();
  const texture = await provider.load({ kind: 'texture', ref: 'texture/white.tga' });
  const extractMs = performance.now() - t1;
  check(
    'extracts res.bin and decodes a texture through the search path',
    texture.image.width === 4 && texture.image.height === 4,
    `${extractMs.toFixed(0)} ms, ${texture.image.width}x${texture.image.height}`,
  );
  check('reported extraction progress', progress.length > 0, `${progress.length} updates`);

  // Prove the decode is right, not merely the right size.
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(texture.image, 0, 0);
  const px = ctx.getImageData(0, 0, 4, 4).data;
  check(
    'the decoded texture is opaque white',
    px[0] === 255 && px[1] === 255 && px[2] === 255 && px[3] === 255,
    `rgba(${px[0]}, ${px[1]}, ${px[2]}, ${px[3]})`,
  );

  // The point of OPFS: a second mount must not re-extract.
  const second = new PackAssetProvider();
  await second.useSource(second.offer(ipa).id);
  const t2 = performance.now();
  await second.load({ kind: 'texture', ref: 'texture/white.tga' });
  const cachedMs = performance.now() - t2;
  check(
    'a second session reads the cached pack instead of re-extracting',
    cachedMs < extractMs,
    `${cachedMs.toFixed(0)} ms cached vs ${extractMs.toFixed(0)} ms cold`,
  );

  // A pack that really is stored (not deflated) is addressed in place.
  const storedIpa = new File(
    [(await buildPack([{ name: 'Payload/x.app/res.bin', data: res }], 0x04034b50)) as BlobPart],
    'stored.ipa',
  );
  const third = new PackAssetProvider();
  await third.useSource(third.offer(storedIpa).id);
  const t3 = performance.now();
  await third.load({ kind: 'texture', ref: 'white.tga' });
  check(
    'a stored pack is addressed in place, copying nothing',
    performance.now() - t3 < extractMs,
    `${(performance.now() - t3).toFixed(0)} ms`,
  );

  // The decoders themselves, in a browser rather than Node.
  const pack = await PackReader.open(bytesSource(res), 'res.bin');
  const bytes = await pack.read('texture/scene/white.tga');
  check('decodes PVRTC in the browser', decodeTexture(bytes).info.format === 'PVRTC 4bpp');

  // The question that matters between sessions: can a returning player skip
  // both the picker and the extraction entirely?
  const builds = await listCachedBuilds();
  check(
    'the extracted build is listed without the .ipa',
    builds.length > 0,
    builds.map(b => `${b.key} (${b.packs.length} packs)`).join(', '),
  );

  if (builds.length) {
    const fresh = new PackAssetProvider();
    const sources = await fresh.listSources();
    const cachedSource = sources.find(s => s.id.startsWith('cached:'));
    check('a fresh provider offers it as a source', !!cachedSource, cachedSource?.label ?? '');
    if (cachedSource) {
      const t = performance.now();
      await fresh.useSource(cachedSource.id);
      const texture = await fresh.load({ kind: 'texture', ref: 'texture/white.tga' });
      check(
        'mounts and reads with no file and no extraction',
        texture.image.width === 4,
        `${(performance.now() - t).toFixed(0)} ms`,
      );
    }
  }

  const { quota, usage } = await storageEstimate();
  say(
    `
storage: ${(usage / 1e9).toFixed(2)} GB used of ` + `${(quota / 1e9).toFixed(2)} GB quota`,
  );

  await provider.clearCache();
  say('');
  say(failures === 0 ? `ALL PASS` : `${failures} FAILED`);
  document.body.dataset.result = failures === 0 ? 'pass' : 'fail';
}

main().catch(err => {
  say(`THREW: ${String(err)}\n${(err as Error).stack ?? ''}`);
  document.body.dataset.result = 'fail';
});
