import { describe, expect, it } from 'vitest';

import { decodeLzmaEntry, LzmaError } from '../src/assets/vfs/lzma';

/** This file's own words, packed the way a method-14 entry is. */
const ENTRY =
  '091405005d000001000020880a06133fb56de851e955d1df870092a616778bdb596528a7167b2bb5e2b1fc9d4553bc' +
  '73ca43570fe9e3bde9ad6f1ca021fe4e0c810b607a2688c7f8b5d3c751606ad39643396eb4e691893256f31f46920e' +
  '24590f09604067177f38ffffc5217000';
const TEXT =
  'A pack entry is a small thing: a table, a model, a picture. '.repeat(6) +
  'It repeats itself, itself, itself, and then it stops.';

const bytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/../g)!.map(pair => parseInt(pair, 16)));

describe('an LZMA entry', () => {
  it('decodes to what was packed', () => {
    const out = decodeLzmaEntry(bytes(ENTRY), TEXT.length);
    expect(new TextDecoder().decode(out)).toBe(TEXT);
  });

  it('refuses a stream cut short', () => {
    expect(() => decodeLzmaEntry(bytes(ENTRY).subarray(0, 40), TEXT.length)).toThrow(LzmaError);
  });

  it('refuses a declared size the stream does not reach', () => {
    expect(() => decodeLzmaEntry(bytes(ENTRY), TEXT.length + 10)).toThrow(LzmaError);
  });
});
