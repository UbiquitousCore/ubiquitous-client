/**
 * Fixture builders: packs and tables assembled byte by byte.
 *
 * Nothing derived from the user's game files may enter this repository, so
 * every test fixture is synthesised from the format documentation instead. That is a
 * feature as much as a constraint — a hand-built file states exactly which
 * bytes the expectation depends on.
 */

import { deflateRawSync } from 'node:zlib';

/** "GBMP" — the local-header signature the shipped packs use. */
export const SIG_GBMP = 0x504d4247;
/** "PK\x03\x04" — a plain zip, which is what an .ipa is. */
export const SIG_PK = 0x04034b50;

export interface Member {
  name: string;
  data: Uint8Array;
  deflate?: boolean;
  /** Zero the sizes in the local header, as a data-descriptor entry does. */
  dataDescriptor?: boolean;
}

export function buildPack(members: Member[], signature = SIG_GBMP): Uint8Array {
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

const WIDTHS: Record<string, number> = { k: 4, u: 4, i: 4, f: 4, c: 1, h: 2, s: 6 };

/**
 * An FTABLE laid out as the reader expects:
 * header(44) | keys | format | rows | strings.
 */
export function buildTable(
  format: string,
  rows: (number | string)[][],
  keys: number[],
): Uint8Array {
  const rowStride = [...format].reduce((n, c) => n + (WIDTHS[c] ?? 4), 0);
  const keysAt = 44;
  const formatAt = keysAt + keys.length * 4;
  const rowsAt = formatAt + format.length + 1;
  const stringsAt = rowsAt + rows.length * rowStride;

  // Strings are referenced by absolute file offset, so lay them out first.
  const encoder = new TextEncoder();
  const stringBytes: number[] = [];
  const placed = new Map<string, { off: number; len: number }>();
  for (const row of rows) {
    for (const cell of row) {
      if (typeof cell !== 'string' || placed.has(cell)) continue;
      const bytes = encoder.encode(cell);
      placed.set(cell, { off: stringsAt + stringBytes.length, len: bytes.length + 1 });
      stringBytes.push(...bytes, 0);
    }
  }

  const buf = new Uint8Array(stringsAt + stringBytes.length);
  const dv = new DataView(buf.buffer);

  buf.set(encoder.encode('FTABLE'), 0);
  dv.setUint32(8, 0x010000, true);
  dv.setUint32(12, rows.length, true);
  dv.setUint32(16, format.length, true);
  dv.setUint32(20, keysAt, true);
  dv.setUint32(24, formatAt, true);
  dv.setUint32(28, rowsAt, true);
  dv.setUint32(32, rowStride, true);
  dv.setUint32(36, stringsAt, true);
  dv.setUint32(40, stringBytes.length, true);

  keys.forEach((k, i) => dv.setUint32(keysAt + i * 4, k, true));
  buf.set(encoder.encode(format), formatAt);

  rows.forEach((row, r) => {
    let at = rowsAt + r * rowStride;
    [...format].forEach((c, i) => {
      const cell = row[i];
      if (c === 's') {
        const s = placed.get(String(cell))!;
        dv.setUint32(at, s.off, true);
        dv.setInt16(at + 4, s.len, true);
        at += 6;
      } else if (c === 'f') {
        dv.setFloat32(at, Number(cell), true);
        at += 4;
      } else if (c === 'i') {
        dv.setInt32(at, Number(cell), true);
        at += 4;
      } else if (c === 'h') {
        dv.setInt16(at, Number(cell), true);
        at += 2;
      } else if (c === 'c') {
        dv.setInt8(at, Number(cell));
        at += 1;
      } else {
        dv.setUint32(at, Number(cell), true);
        at += 4;
      }
    });
  });

  buf.set(new Uint8Array(stringBytes), stringsAt);
  return buf;
}

/** A PVR v2 container, 4bpp, with `words` 8-byte blocks. */
export function buildPvr(width: number, height: number, words: [number, number][]): Uint8Array {
  const body = new Uint8Array(words.length * 8);
  const bdv = new DataView(body.buffer);
  words.forEach(([mod, colour], i) => {
    bdv.setUint32(i * 8, mod, true);
    bdv.setUint32(i * 8 + 4, colour, true);
  });

  const buf = new Uint8Array(52 + body.length);
  const dv = new DataView(buf.buffer);
  dv.setUint32(0, 52, true);
  dv.setUint32(4, height, true);
  dv.setUint32(8, width, true);
  dv.setUint32(12, 0, true);
  dv.setUint32(16, 25, true); // flags: format 25 = PVRTC 4bpp
  dv.setUint32(20, body.length, true);
  dv.setUint32(24, 4, true);
  buf.set(new TextEncoder().encode('PVR!'), 44);
  buf.set(body, 52);
  return buf;
}

/** Uncompressed 32-bit BGRA TGA. `descriptor` 0x20 means top-down. */
export function buildTga(
  width: number,
  height: number,
  bgra: number[],
  descriptor = 0x20,
  type = 2,
): Uint8Array {
  const buf = new Uint8Array(18 + bgra.length);
  const dv = new DataView(buf.buffer);
  buf[2] = type;
  dv.setUint16(12, width, true);
  dv.setUint16(14, height, true);
  buf[16] = 32;
  buf[17] = descriptor;
  buf.set(bgra, 18);
  return buf;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export const text = (s: string): Uint8Array => new TextEncoder().encode(s);
export const str = (b: Uint8Array): string => new TextDecoder().decode(b);

/**
 * A tables.bin holding every table `WorldTables` insists on.
 *
 * The formats mirror the shipped 2.2.0 shapes closely enough for the schema
 * resolution to run for real: map_info's name/.wld pair of adjacent strings,
 * and staticobject_spawns' single scale float at column 11.
 */
export function buildTablesPack(): Uint8Array {
  return buildPack(buildTableFiles());
}

/** The same tables as loose entries, for reading without a pack in the way. */
export function buildTableFiles(): Array<{ name: string; data: Uint8Array }> {
  const t = (format: string, rows: (number | string)[][], keys: number[]) =>
    buildTable(format, rows, keys);

  // map_info: "uuuuufffussuuufuuu" — name and .wld are the adjacent 's' pair.
  const mapInfo = t(
    'uuuuufffussuuufuuu',
    [[0, 0, 0, 0, 0, 0, 0, 0, 0, 'Test Vale', 'test_vale.wld', 0, 0, 0, 0, 0, 0, 0]],
    [13],
  );

  // zones: enough columns to reach ZONE_SKYBOX at 23.
  const zoneFmt = 'iiiuffffffffuuffffuuuussssssfffffusiiiu';
  const zoneRow: (number | string)[] = new Array(zoneFmt.length).fill(0);
  [...zoneFmt].forEach((c, i) => {
    zoneRow[i] = c === 's' ? '' : 0;
  });
  zoneRow[2] = 0; // parent
  zoneRow[3] = 13; // map
  zoneRow[4] = -100; // x1
  zoneRow[6] = -50; // z1
  zoneRow[8] = 100; // x2
  zoneRow[10] = 50; // z2
  zoneRow[13] = 0x8899aa; // fog colour
  zoneRow[14] = 30; // fog near
  zoneRow[15] = 200; // fog far
  zoneRow[22] = 'city_sky.bdae';
  const zones = t(zoneFmt, [zoneRow], [5]);

  const zoneNames = t('us', [[5, 'Test Vale']], [5]);

  // staticobject_spawns: one scale float at column 11 (the 1.0.2 shape).
  const spawns = t('uuuffffffuufuf', [[0, 900, 13, 1, 2, 3, 0, 1.5, 0, 0, 0, 1, 0, 0]], [1]);

  const proto: (number | string)[] = new Array(20).fill(0);
  proto[3] = 77; // display row
  proto[7] = 2; // scale
  proto[19] = 0; // festival
  const itemsTable = t('uuuufuufuuuuuuuuuuuu', [proto], [900]);

  // staticobject_displayinfo: key, model path, variants, four sound ids,
  // then six node names and six effect paths. The run of twelve strings is
  // what the schema resolution looks for, so a shorter stand-in would not
  // exercise it.
  const effectCols: (number | string)[] = new Array(12).fill('');
  effectCols[0] = 'fx_top'; // first node name
  effectCols[6] = 'effects/scene/chest_glow.beff'; // first effect path
  const display = t(
    'usuuuuussssssssssss',
    [[0, 'model/scene/tree.bdae', 0, 0, 0, 0, 0, ...effectCols]],
    [77],
  );

  const creatureSpawns = t('uuufffffu', [[0, 500, 13, 5, 6, 7, 1.2, 0, 0]], [1]);
  // creature_appearance: the name's string id at column 1, the display at 5.
  const creatureAppearance = t('uuuuuuu', [[0, 42, 0, 0, 0, 300, 0]], [500]);
  const creatureNames = t('us', [[42, 'Grey Wolf']], [42]);
  const creatureDisplay = t('uuufusuu', [[0, 400, 0, 120, 0, '', 0, 0]], [300]);
  const creatureModel = t('uus', [[0, 0, 'model/npc/wolf.bdae']], [400]);
  const creatureProto = t('uuuuuuuuuufu', [[0, 0, 0, 0, 1, 5, 0, 0, 0, 0, 1, 0]], [500]);

  const itemModel = t('uus', [[0, 0, 'model/item/sword.bdae']], [1]);
  const displayExtra = t('uu', [[0, 0]], [1]);
  const itemDisplay = t('uus', [[0, 0, '']], [1]);

  return tableEntries({
    mapInfo,
    zones,
    zoneNames,
    spawns,
    itemsTable,
    display,
    creatureSpawns,
    creatureAppearance,
    creatureNames,
    creatureDisplay,
    creatureModel,
    creatureProto,
    itemModel,
    displayExtra,
    itemDisplay,
  });
}

/** The same tables as files, for callers that read them without a pack. */
function tableEntries(t: Record<string, Uint8Array>): Array<{ name: string; data: Uint8Array }> {
  const {
    mapInfo,
    zones,
    zoneNames,
    spawns,
    itemsTable,
    display,
    creatureSpawns,
    creatureAppearance,
    creatureNames,
    creatureDisplay,
    creatureModel,
    creatureProto,
    itemModel,
    displayExtra,
    itemDisplay,
  } = t;
  return [
    { name: 'tables/map_info.tbl', data: mapInfo },
    { name: 'tables/zones.tbl', data: zones },
    { name: 'tables/String_Zones_en.tbl', data: zoneNames },
    { name: 'tables/staticobject_spawns.tbl', data: spawns },
    { name: 'tables/staticobject_proto.tbl', data: itemsTable },
    { name: 'tables/staticobject_displayinfo.tbl', data: display },
    { name: 'tables/creature_spawns.tbl', data: creatureSpawns },
    { name: 'tables/creature_appearance.tbl', data: creatureAppearance },
    { name: 'tables/String_Creature_en.tbl', data: creatureNames },
    { name: 'tables/creaturedisplayinfo.tbl', data: creatureDisplay },
    { name: 'tables/creaturemodeldata.tbl', data: creatureModel },
    { name: 'tables/creature_proto.tbl', data: creatureProto },
    { name: 'tables/itemmodeldata.tbl', data: itemModel },
    { name: 'tables/creaturedisplayinfoextra.tbl', data: displayExtra },
    { name: 'tables/itemdisplayinfo.tbl', data: itemDisplay },
  ];
}
