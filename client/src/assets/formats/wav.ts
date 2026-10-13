/**
 * RIFF/WAVE: PCM, IMA ADPCM and Microsoft ADPCM to one Float32Array per
 * channel (browsers do not decode ADPCM). Codecs per the public IMA and
 * Microsoft specs; `fact` trims the last block's padding.
 */

export class WavError extends Error {}

/** Decoded audio, ready to hand to an AudioBuffer. */
export interface PcmData {
  sampleRate: number;
  /** One array per channel, each sample in [-1, 1]. */
  channels: Float32Array[];
}

const FORMAT_PCM = 0x0001;
const FORMAT_MS_ADPCM = 0x0002;
const FORMAT_IMA_ADPCM = 0x0011;
/** WAVE_FORMAT_EXTENSIBLE: the real tag sits in the sub-format GUID. */
const FORMAT_EXTENSIBLE = 0xfffe;

interface Format {
  tag: number;
  channels: number;
  sampleRate: number;
  blockAlign: number;
  bitsPerSample: number;
  /** The bytes after the 16-byte common part, for the codecs that use them. */
  extra: DataView | null;
}

/** Decode a whole WAV file. Throws `WavError` on anything it cannot read. */
export function decodeWav(bytes: Uint8Array): PcmData {
  const dv = leView(bytes);
  if (bytes.length < 12 || tag4(bytes, 0) !== 'RIFF' || tag4(bytes, 8) !== 'WAVE') {
    throw new WavError('not a RIFF/WAVE file');
  }

  let format: Format | null = null;
  let data: Uint8Array | null = null;
  let frames: number | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = tag4(bytes, at);
    const size = dv.getUint32(at + 4, true);
    const body = at + 8;
    // A last chunk that claims more than the file holds is cut short, not
    // refused: the data up to the end of the file is still good.
    const end = Math.min(body + size, bytes.length);
    if (id === 'fmt ')
      format = readFormat(new DataView(bytes.buffer, bytes.byteOffset + body, end - body));
    else if (id === 'data') data = bytes.subarray(body, end);
    else if (id === 'fact' && end - body >= 4) frames = dv.getUint32(body, true);
    at = body + size + (size & 1);
  }
  if (!format) throw new WavError('no fmt chunk');
  if (!data) throw new WavError('no data chunk');
  if (format.channels < 1 || format.sampleRate <= 0) {
    throw new WavError(`${format.channels} channels at ${format.sampleRate} Hz`);
  }

  let channels: Float32Array[];
  switch (format.tag) {
    case FORMAT_PCM:
      channels = decodePcm(data, format);
      break;
    case FORMAT_IMA_ADPCM:
      channels = decodeIma(data, format);
      break;
    case FORMAT_MS_ADPCM:
      channels = decodeMsAdpcm(data, format);
      break;
    default:
      throw new WavError(`unsupported coding 0x${format.tag.toString(16)}`);
  }
  if (frames !== null && frames < channels[0].length) {
    channels = channels.map(c => c.subarray(0, frames!));
  }
  return { sampleRate: format.sampleRate, channels };
}

function leView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function tag4(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
}

function readFormat(dv: DataView): Format {
  if (dv.byteLength < 16) throw new WavError('fmt chunk shorter than 16 bytes');
  let tag = dv.getUint16(0, true);
  const extraSize = dv.byteLength >= 18 ? dv.getUint16(16, true) : 0;
  const extra =
    extraSize > 0 && dv.byteLength >= 18 + extraSize
      ? new DataView(dv.buffer, dv.byteOffset + 18, extraSize)
      : null;
  // The first two bytes of the sub-format GUID are the ordinary format tag.
  if (tag === FORMAT_EXTENSIBLE && extra && extra.byteLength >= 8) tag = extra.getUint16(6, true);
  return {
    tag,
    channels: dv.getUint16(2, true),
    sampleRate: dv.getUint32(4, true),
    blockAlign: dv.getUint16(12, true),
    bitsPerSample: dv.getUint16(14, true),
    extra,
  };
}

// — linear PCM ---------------------------------------------------------------

function decodePcm(data: Uint8Array, f: Format): Float32Array[] {
  const bytes = f.bitsPerSample >> 3;
  if (bytes < 1 || bytes > 4) throw new WavError(`${f.bitsPerSample}-bit PCM`);
  const frame = bytes * f.channels;
  const count = Math.floor(data.length / frame);
  const dv = leView(data);
  const out = Array.from({ length: f.channels }, () => new Float32Array(count));
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < f.channels; c++) {
      const at = i * frame + c * bytes;
      let v: number;
      if (bytes === 1)
        v = (data[at] - 128) / 128; // 8-bit is unsigned
      else if (bytes === 2) v = dv.getInt16(at, true) / 32768;
      else if (bytes === 3)
        v = (((data[at + 2] << 24) | (data[at + 1] << 16) | (data[at] << 8)) >> 8) / 8388608;
      else v = dv.getInt32(at, true) / 2147483648;
      out[c][i] = v;
    }
  }
  return out;
}

// — IMA ADPCM ----------------------------------------------------------------

/** How the step index moves for each 4-bit code's magnitude. */
const IMA_INDEX_ADJUST = [-1, -1, -1, -1, 2, 4, 6, 8];

/** The 89 quantiser step sizes, from the IMA specification. */
const IMA_STEPS = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
  80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
  544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
  2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
  12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

/** One IMA channel's running state. */
interface ImaState {
  sample: number;
  index: number;
}

/** Advance an IMA channel by one 4-bit code; returns the new sample. */
export function imaStep(state: ImaState, code: number): number {
  const step = IMA_STEPS[state.index];
  let diff = step >> 3;
  if (code & 4) diff += step;
  if (code & 2) diff += step >> 1;
  if (code & 1) diff += step >> 2;
  let sample = code & 8 ? state.sample - diff : state.sample + diff;
  if (sample > 32767) sample = 32767;
  else if (sample < -32768) sample = -32768;
  let index = state.index + IMA_INDEX_ADJUST[code & 7];
  if (index < 0) index = 0;
  else if (index > 88) index = 88;
  state.sample = sample;
  state.index = index;
  return sample;
}

/** IMA ADPCM: per channel a first sample and step index; then runs of four bytes per channel, low nibble first. */
function decodeIma(data: Uint8Array, f: Format): Float32Array[] {
  const ch = f.channels;
  if (f.bitsPerSample !== 4) throw new WavError(`${f.bitsPerSample}-bit IMA ADPCM`);
  const header = 4 * ch;
  if (f.blockAlign <= header || (f.blockAlign - header) % (4 * ch) !== 0) {
    throw new WavError(`IMA ADPCM block of ${f.blockAlign} bytes for ${ch} channels`);
  }
  const perBlock = ((f.blockAlign - header) * 2) / ch + 1;

  const blocks = Math.ceil(data.length / f.blockAlign);
  const out = Array.from({ length: ch }, () => new Float32Array(blocks * perBlock));
  const dv = leView(data);
  const states: ImaState[] = Array.from({ length: ch }, () => ({ sample: 0, index: 0 }));
  let written = 0;

  for (let b = 0; b < blocks; b++) {
    const start = b * f.blockAlign;
    const end = Math.min(start + f.blockAlign, data.length);
    if (end - start < header) break;
    for (let c = 0; c < ch; c++) {
      const s = states[c];
      s.sample = dv.getInt16(start + c * 4, true);
      s.index = Math.min(88, data[start + c * 4 + 2]);
      out[c][written] = s.sample / 32768;
    }
    let frame = written + 1;
    // Each pass of this loop is one run: four bytes, eight samples, per channel.
    for (let at = start + header; at + 4 * ch <= end; at += 4 * ch) {
      for (let c = 0; c < ch; c++) {
        const s = states[c];
        const o = out[c];
        for (let i = 0; i < 4; i++) {
          const byte = data[at + c * 4 + i];
          o[frame + i * 2] = imaStep(s, byte & 0x0f) / 32768;
          o[frame + i * 2 + 1] = imaStep(s, byte >> 4) / 32768;
        }
      }
      frame += 8;
    }
    written = frame;
  }
  return out.map(c => c.subarray(0, written));
}

// — Microsoft ADPCM ----------------------------------------------------------

/** How the step scale adapts after each 4-bit code. */
const MS_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];

/** The seven standard predictor pairs, used when the file carries none. */
const MS_COEFS: Array<[number, number]> = [
  [256, 0],
  [512, -256],
  [0, 0],
  [192, 64],
  [240, 0],
  [460, -208],
  [392, -232],
];

interface MsState {
  c1: number;
  c2: number;
  delta: number;
  s1: number;
  s2: number;
}

/** Advance a Microsoft ADPCM channel by one 4-bit code; returns the new sample. */
export function msStep(state: MsState, code: number): number {
  const signed = code & 8 ? code - 16 : code;
  let sample = ((state.s1 * state.c1 + state.s2 * state.c2) >> 8) + signed * state.delta;
  if (sample > 32767) sample = 32767;
  else if (sample < -32768) sample = -32768;
  state.s2 = state.s1;
  state.s1 = sample;
  state.delta = (MS_ADAPT[code] * state.delta) >> 8;
  if (state.delta < 16) state.delta = 16;
  return sample;
}

/** Microsoft ADPCM: per channel a predictor index, step scale and two seeds (later first); then high-nibble-first interleaved codes. */
function decodeMsAdpcm(data: Uint8Array, f: Format): Float32Array[] {
  const ch = f.channels;
  if (f.bitsPerSample !== 4) throw new WavError(`${f.bitsPerSample}-bit MS ADPCM`);
  const header = 7 * ch;
  if (f.blockAlign <= header) throw new WavError(`MS ADPCM block of ${f.blockAlign} bytes`);

  let coefs = MS_COEFS;
  let perBlock = ((f.blockAlign - header) * 2) / ch + 2;
  if (f.extra && f.extra.byteLength >= 4) {
    perBlock = f.extra.getUint16(0, true) || perBlock;
    const n = f.extra.getUint16(2, true);
    if (n > 0 && f.extra.byteLength >= 4 + n * 4) {
      coefs = [];
      for (let i = 0; i < n; i++) {
        coefs.push([f.extra.getInt16(4 + i * 4, true), f.extra.getInt16(6 + i * 4, true)]);
      }
    }
  }

  const blocks = Math.ceil(data.length / f.blockAlign);
  const out = Array.from({ length: ch }, () => new Float32Array(blocks * perBlock));
  const dv = leView(data);
  const states: MsState[] = Array.from({ length: ch }, () => ({
    c1: 0,
    c2: 0,
    delta: 16,
    s1: 0,
    s2: 0,
  }));
  let written = 0;

  for (let b = 0; b < blocks; b++) {
    const start = b * f.blockAlign;
    const end = Math.min(start + f.blockAlign, data.length);
    if (end - start < header) break;
    for (let c = 0; c < ch; c++) {
      const s = states[c];
      const [c1, c2] = coefs[Math.min(data[start + c], coefs.length - 1)];
      s.c1 = c1;
      s.c2 = c2;
      s.delta = dv.getInt16(start + ch + c * 2, true);
      s.s1 = dv.getInt16(start + 3 * ch + c * 2, true);
      s.s2 = dv.getInt16(start + 5 * ch + c * 2, true);
      out[c][written] = s.s2 / 32768;
      out[c][written + 1] = s.s1 / 32768;
    }
    // Codes left in this block, which a short final block cuts down.
    const codes = Math.min((end - start - header) * 2, (perBlock - 2) * ch);
    for (let n = 0; n < codes; n++) {
      const byte = data[start + header + (n >> 1)];
      const code = n & 1 ? byte & 0x0f : byte >> 4;
      const c = n % ch;
      out[c][written + 2 + Math.floor(n / ch)] = msStep(states[c], code) / 32768;
    }
    written += 2 + Math.floor(codes / ch);
  }
  return out.map(c => c.subarray(0, written));
}
