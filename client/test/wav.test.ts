/**
 * The WAV reader against files built here, byte by byte.
 *
 * Expected samples are worked by hand from the IMA and Microsoft ADPCM
 * specifications, not produced by a second copy of the decoder.
 */

import { describe, expect, it } from 'vitest';

import { decodeWav, WavError } from '../src/assets/formats/wav';

interface Fmt {
  tag: number;
  channels: number;
  rate?: number;
  blockAlign: number;
  bits: number;
  extra?: number[];
}

function u16(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}
function u32(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff];
}
function chunk(id: string, body: number[]): number[] {
  const out = [...id].map(c => c.charCodeAt(0)).concat(u32(body.length), body);
  return body.length & 1 ? out.concat(0) : out;
}

function wav(fmt: Fmt, data: number[], factFrames?: number): Uint8Array {
  const rate = fmt.rate ?? 32000;
  const extra = fmt.extra ?? [];
  const fmtBody = [
    ...u16(fmt.tag),
    ...u16(fmt.channels),
    ...u32(rate),
    ...u32(rate * fmt.blockAlign),
    ...u16(fmt.blockAlign),
    ...u16(fmt.bits),
    ...(extra.length ? [...u16(extra.length), ...extra] : []),
  ];
  const body = [
    ...[...'WAVE'].map(c => c.charCodeAt(0)),
    ...chunk('fmt ', fmtBody),
    ...(factFrames === undefined ? [] : chunk('fact', u32(factFrames))),
    ...chunk('data', data),
  ];
  return new Uint8Array([...[...'RIFF'].map(c => c.charCodeAt(0)), ...u32(body.length), ...body]);
}

const q = (samples: number[]): number[] => samples.map(s => s / 32768);

describe('decodeWav', () => {
  it('reads 16-bit PCM, channels de-interleaved', () => {
    const data = [...u16(16384), ...u16(0x10000 - 16384), ...u16(0), ...u16(32767)];
    const pcm = decodeWav(wav({ tag: 1, channels: 2, blockAlign: 4, bits: 16, rate: 22050 }, data));
    expect(pcm.sampleRate).toBe(22050);
    expect([...pcm.channels[0]]).toEqual([0.5, 0]);
    expect([...pcm.channels[1]]).toEqual([-0.5, 32767 / 32768]);
  });

  it('reads 8-bit PCM as unsigned around 128', () => {
    const pcm = decodeWav(wav({ tag: 1, channels: 1, blockAlign: 1, bits: 8 }, [128, 192, 64]));
    expect([...pcm.channels[0]]).toEqual([0, 0.5, -0.5]);
  });

  it('decodes an IMA ADPCM block: seed sample, then low nibble first', () => {
    // Seed 0 at step index 0 (step 7). Code 7 adds 0 + 7 + 3 + 1 = 11 and
    // moves the index to 8 (step 16). Code 12 subtracts 2 + 16 = 18, to -7,
    // index 10 (step 19). Code 0 adds 19 >> 3 = 2, to -5, index 9.
    const data = [0, 0, 0, 0, 0xc7, 0x00, 0x00, 0x00];
    const pcm = decodeWav(wav({ tag: 0x11, channels: 1, blockAlign: 8, bits: 4 }, data));
    expect(pcm.channels[0].length).toBe(9);
    expect([...pcm.channels[0].subarray(0, 4)]).toEqual(q([0, 11, -7, -5]));
  });

  it('keeps stereo IMA channels apart, four bytes of each in turn', () => {
    const data = [0x10, 0, 0, 0, 0, 0, 0, 0, 0x07, 0, 0, 0, 0, 0, 0, 0];
    const pcm = decodeWav(wav({ tag: 0x11, channels: 2, blockAlign: 16, bits: 4 }, data));
    expect(pcm.channels[0][0]).toBe(16 / 32768);
    expect(pcm.channels[0][1]).toBe(q([27])[0]); // 16 + 11
    expect(pcm.channels[1][1]).toBe(0); // code 0 at step 7 adds 7 >> 3 = 0
  });

  it('decodes a Microsoft ADPCM block: seeds oldest first, then high nibble first', () => {
    // Predictor 0 is (256, 0): the next sample is the last one plus
    // code * delta. Code 1: 100 + 16 = 116. Code 15 is -1: 116 - 16 = 100.
    // Delta adapts to 230 * 16 >> 8 = 14 and is floored at 16 each time.
    const header = [0, ...u16(16), ...u16(100), ...u16(50)];
    const data = [...header, 0x1f, 0x00];
    const pcm = decodeWav(wav({ tag: 2, channels: 1, blockAlign: 9, bits: 4 }, data));
    expect([...pcm.channels[0]]).toEqual(q([50, 100, 116, 100, 100, 100]));
  });

  it('uses the predictor pairs the file carries', () => {
    // One pair, (512, -256): the next sample is 2 * s1 - s2.
    const extra = [...u16(4), ...u16(1), ...u16(512), ...u16(0x10000 - 256)];
    const header = [0, ...u16(16), ...u16(10), ...u16(0)];
    const pcm = decodeWav(
      wav({ tag: 2, channels: 1, blockAlign: 8, bits: 4, extra }, [...header, 0x00]),
    );
    expect([...pcm.channels[0]]).toEqual(q([0, 10, 20, 30]));
  });

  it('trims the last block to the frame count the fact chunk gives', () => {
    const data = [0, 0, 0, 0, 0xc7, 0x00, 0x00, 0x00];
    const pcm = decodeWav(wav({ tag: 0x11, channels: 1, blockAlign: 8, bits: 4 }, data, 3));
    expect(pcm.channels[0].length).toBe(3);
  });

  it('refuses what it cannot read', () => {
    expect(() => decodeWav(new Uint8Array(40))).toThrow(WavError);
    expect(() => decodeWav(wav({ tag: 0x55, channels: 1, blockAlign: 1, bits: 8 }, [0]))).toThrow(
      /unsupported coding/,
    );
  });
});
