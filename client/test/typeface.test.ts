/**
 * Reading the family name out of a font file, against hand-built files.
 *
 * Only the `name` table is built: that is all the reader looks at. The
 * shipped typefaces are checked in `realPacks.test.ts`, which needs the
 * game file and skips without it.
 */

import { describe, expect, it } from 'vitest';

import { readTypefaceFamily } from '../src/assets/formats/typeface';

interface NameRecord {
  platform: number;
  nameId: number;
  value: string;
}

function encode(record: NameRecord): number[] {
  if (record.platform === 1) return [...record.value].map(c => c.charCodeAt(0));
  const out: number[] = [];
  for (const c of record.value) out.push(c.charCodeAt(0) >> 8, c.charCodeAt(0) & 0xff);
  return out;
}

const u16 = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v: number): number[] => [...u16(v >>> 16), ...u16(v & 0xffff)];

/** A font file holding one table, `name`, with these records. */
function fontFile(records: NameRecord[], version = 0x00010000): Uint8Array {
  const strings = records.map(encode);
  const nameTable: number[] = [...u16(0), ...u16(records.length), ...u16(6 + records.length * 12)];
  let offset = 0;
  records.forEach((record, i) => {
    nameTable.push(
      ...u16(record.platform),
      ...u16(record.platform === 1 ? 0 : 1), // encoding
      ...u16(record.platform === 1 ? 0 : 0x409), // language
      ...u16(record.nameId),
      ...u16(strings[i].length),
      ...u16(offset),
    );
    offset += strings[i].length;
  });
  nameTable.push(...strings.flat());
  const tableAt = 12 + 16;
  return new Uint8Array([
    ...u32(version),
    ...u16(1), // one table
    ...u16(16),
    ...u16(0),
    ...u16(0),
    ...[...'name'].map(c => c.charCodeAt(0)),
    ...u32(0), // checksum
    ...u32(tableAt),
    ...u32(nameTable.length),
    ...nameTable,
  ]);
}

describe('the family a font file names', () => {
  it('reads a Windows family name', () => {
    expect(readTypefaceFamily(fontFile([{ platform: 3, nameId: 1, value: 'Some Face' }]))).toBe(
      'Some Face',
    );
  });

  it('reads a Macintosh family name as one byte a character', () => {
    expect(readTypefaceFamily(fontFile([{ platform: 1, nameId: 1, value: 'Mac Face' }]))).toBe(
      'Mac Face',
    );
  });

  it('prefers the typographic family, which is not split by style', () => {
    const file = fontFile([
      { platform: 3, nameId: 1, value: 'Some Face Light' },
      { platform: 3, nameId: 16, value: 'Some Face' },
    ]);
    expect(readTypefaceFamily(file)).toBe('Some Face');
  });

  it('prefers the Windows record over the Macintosh one', () => {
    const file = fontFile([
      { platform: 1, nameId: 1, value: 'Mac Spelling' },
      { platform: 3, nameId: 1, value: 'Windows Spelling' },
    ]);
    expect(readTypefaceFamily(file)).toBe('Windows Spelling');
  });

  it('reads an OpenType file with outlines of the other kind', () => {
    const otto =
      ('O'.charCodeAt(0) << 24) |
      ('T'.charCodeAt(0) << 16) |
      ('T'.charCodeAt(0) << 8) |
      'O'.charCodeAt(0);
    expect(
      readTypefaceFamily(fontFile([{ platform: 3, nameId: 1, value: 'Other' }], otto >>> 0)),
    ).toBe('Other');
  });

  it('answers nothing for bytes that are not a font, or are cut short', () => {
    expect(readTypefaceFamily(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(readTypefaceFamily(new TextEncoder().encode('definitely not a typeface'))).toBeNull();
    const whole = fontFile([{ platform: 3, nameId: 1, value: 'Some Face' }]);
    expect(readTypefaceFamily(whole.subarray(0, 20))).toBeNull();
  });

  it('answers nothing for a file with no family name', () => {
    expect(readTypefaceFamily(fontFile([{ platform: 3, nameId: 4, value: 'Full' }]))).toBeNull();
  });
});
