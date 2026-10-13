/**
 * The pack reader is the floor of the whole client-side pipeline: if it hands
 * back the wrong bytes, every format above it fails in a way that looks like a
 * format bug. These build packs byte by byte so the expectations are exact and
 * need no game data.
 *
 * The case that matters most is the GBMP signature. A stock ZIP library
 * rejects these files outright, and the whole reason this module exists is
 * that these files stamp the local headers 'GBMP' instead of 'PK\x03\x04'.
 */

import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

import { bytesSource, sliceSource } from '../src/assets/vfs/ByteSource';
import { PackReader, SIG_LFH_GBMP, unwrapBdae } from '../src/assets/vfs/zip';

interface Member {
  name: string;
  data: Uint8Array;
  /** Deflate the payload, as the shipped packs do for anything compressible. */
  deflate?: boolean;
  /** Zero the sizes in the local header, as a data-descriptor entry does. */
  dataDescriptor?: boolean;
}

/**
 * Build a ZIP-shaped pack with whichever local-header signature is asked for.
 * `signature` is what makes this a GBMP pack rather than a plain ZIP.
 */
function buildPack(members: Member[], signature = SIG_LFH_GBMP): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const m of members) {
    const nameBytes = new TextEncoder().encode(m.name);
    const stored = m.deflate ? new Uint8Array(deflateRawSync(m.data)) : m.data;
    const method = m.deflate ? 8 : 0;

    const lfh = new Uint8Array(30 + nameBytes.length);
    const ldv = new DataView(lfh.buffer);
    ldv.setUint32(0, signature, true);
    ldv.setUint16(6, m.dataDescriptor ? 0x0008 : 0, true);
    ldv.setUint16(8, method, true);
    ldv.setUint32(18, m.dataDescriptor ? 0 : stored.length, true);
    ldv.setUint32(22, m.dataDescriptor ? 0 : m.data.length, true);
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

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const str = (b: Uint8Array): string => new TextDecoder().decode(b);

describe('PackReader', () => {
  it('reads a GBMP pack, which a stock ZIP library would reject', async () => {
    const pack = buildPack([{ name: 'texture/a.tga', data: text('hello') }]);

    const reader = await PackReader.open(bytesSource(pack), 'res.bin');
    expect(reader.length).toBe(1);
    expect(str(await reader.read('texture/a.tga'))).toBe('hello');
  });

  it('reads a plain PK zip too — an .ipa is one', async () => {
    const zip = buildPack([{ name: 'Payload/x.app/res.bin', data: text('pack') }], 0x04034b50);
    const reader = await PackReader.open(bytesSource(zip), 'game.ipa');
    expect(str(await reader.read('Payload/x.app/res.bin'))).toBe('pack');
  });

  it('inflates deflated entries', async () => {
    const body = 'the quick brown fox '.repeat(200);
    const pack = buildPack([{ name: 'model/a.bdae', data: text(body), deflate: true }]);
    const reader = await PackReader.open(bytesSource(pack), 'res.bin');
    expect(str(await reader.read('model/a.bdae'))).toBe(body);
  });

  it('falls back to the central directory when the local header has no sizes', async () => {
    // Bit 3 of the flags means the sizes live in a trailing data
    // descriptor; the local header carries zeroes. Reading the zeroes gives an
    // empty entry, which is silent and wrong.
    const body = 'x'.repeat(500);
    const pack = buildPack([
      { name: 'a.tbl', data: text(body), deflate: true, dataDescriptor: true },
    ]);
    const reader = await PackReader.open(bytesSource(pack), 'res.bin');
    expect(str(await reader.read('a.tbl'))).toBe(body);
  });

  it('looks entries up case-insensitively, as the game does', async () => {
    const pack = buildPack([{ name: 'Texture/Avatar/Human_M.tga', data: text('v') }]);
    const reader = await PackReader.open(bytesSource(pack), 'res.bin');
    expect(reader.get('texture/avatar/human_m.tga')).toBeDefined();
    expect(reader.get('TEXTURE/AVATAR/HUMAN_M.TGA')).toBeDefined();
    // Backslashes and a leading './' are normalised the same way.
    expect(reader.get('.\\texture\\avatar\\human_m.tga')).toBeDefined();
  });

  it('streams an entry without holding it whole', async () => {
    const body = 'y'.repeat(100_000);
    const pack = buildPack([{ name: 'big.bin', data: text(body), deflate: true }]);
    const reader = await PackReader.open(bytesSource(pack), 'ipa');

    const stream = await reader.stream('big.bin');
    const parts: Uint8Array[] = [];
    const r = stream.getReader();
    for (;;) {
      const chunk = await r.read();
      if (chunk.done) break;
      parts.push(chunk.value);
    }
    expect(str(concat(parts))).toBe(body);
  });

  it('reads a pack nested inside another source', async () => {
    // What mounting a *stored* pack out of an .ipa does: address it in place.
    const inner = buildPack([{ name: 'a.tga', data: text('nested') }]);
    const padded = concat([new Uint8Array(1234), inner, new Uint8Array(99)]);
    const source = sliceSource(bytesSource(padded), 1234, inner.length);

    const reader = await PackReader.open(source, 'res.bin');
    expect(str(await reader.read('a.tga'))).toBe('nested');
  });

  it('rejects a file that is not a pack', async () => {
    await expect(PackReader.open(bytesSource(text('too short')), 'x')).rejects.toThrow(
      /too small to be a pack/,
    );
    await expect(PackReader.open(bytesSource(text('x'.repeat(4096))), 'x')).rejects.toThrow(
      /end-of-central-directory/,
    );
  });
});

describe('unwrapBdae', () => {
  it('extracts the model payload from the zip a .bdae is', async () => {
    const zip = buildPack(
      [
        { name: 'decoy.bdae', data: text('wrong one') },
        { name: 'little_endian_not_quantized.bdae', data: text('the model') },
      ],
      0x04034b50,
    );

    const { member, payload } = await unwrapBdae(zip);
    expect(member).toBe('little_endian_not_quantized.bdae');
    expect(str(payload)).toBe('the model');
  });

  it('passes raw bdae through untouched', async () => {
    const raw = text('BDAEnot a zip');
    const { member, payload } = await unwrapBdae(raw);
    expect(member).toBeNull();
    expect(payload).toBe(raw);
  });
});
