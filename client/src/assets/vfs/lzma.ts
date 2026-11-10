/**
 * LZMA, as the pack entries of later builds are stored (ZIP method 14): a
 * range coder driving literals, matches and four remembered distances.
 * Written from the public LZMA specification; decoding only, one entry at a
 * time, since no entry is large.
 */

export class LzmaError extends Error {}

const PROB_INIT = 1024;
const TOP = 1 << 24;
const STATES = 12;
const POS_STATES_MAX = 16;
const END_POS_MODEL = 14;
const FULL_DISTANCES = 128;
const MATCH_MIN = 2;

const probs = (count: number): Uint16Array => new Uint16Array(count).fill(PROB_INIT);

class RangeDecoder {
  private range = 0xffffffff;
  private code = 0;
  private at: number;

  constructor(
    private readonly data: Uint8Array,
    start: number,
  ) {
    if (data[start] !== 0) throw new LzmaError('the stream does not open with a zero byte');
    this.at = start + 1;
    for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.next()) >>> 0;
  }

  private next(): number {
    if (this.at >= this.data.length) throw new LzmaError('the stream ends early');
    return this.data[this.at++]!;
  }

  private normalize(): void {
    if (this.range < TOP) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.next()) >>> 0;
    }
  }

  bit(model: Uint16Array, index: number): number {
    const prob = model[index]!;
    const bound = (this.range >>> 11) * prob;
    if (this.code < bound) {
      this.range = bound;
      model[index] = prob + ((2048 - prob) >> 5);
      this.normalize();
      return 0;
    }
    this.range = (this.range - bound) >>> 0;
    this.code = (this.code - bound) >>> 0;
    model[index] = prob - (prob >> 5);
    this.normalize();
    return 1;
  }

  direct(count: number): number {
    let out = 0;
    for (let i = 0; i < count; i++) {
      this.range >>>= 1;
      let bit = 0;
      if (this.code >= this.range) {
        this.code = (this.code - this.range) >>> 0;
        bit = 1;
      }
      out = ((out << 1) | bit) >>> 0;
      this.normalize();
    }
    return out;
  }

  tree(model: Uint16Array, offset: number, bits: number): number {
    let m = 1;
    for (let i = 0; i < bits; i++) m = (m << 1) | this.bit(model, offset + m);
    return m - (1 << bits);
  }

  reverseTree(model: Uint16Array, offset: number, bits: number): number {
    let m = 1;
    let out = 0;
    for (let i = 0; i < bits; i++) {
      const bit = this.bit(model, offset + m);
      m = (m << 1) | bit;
      out |= bit << i;
    }
    return out;
  }
}

class LengthDecoder {
  private readonly choice = probs(2);
  private readonly low = probs(POS_STATES_MAX << 3);
  private readonly mid = probs(POS_STATES_MAX << 3);
  private readonly high = probs(256);

  decode(rc: RangeDecoder, posState: number): number {
    if (rc.bit(this.choice, 0) === 0) return rc.tree(this.low, posState << 3, 3);
    if (rc.bit(this.choice, 1) === 0) return 8 + rc.tree(this.mid, posState << 3, 3);
    return 16 + rc.tree(this.high, 0, 8);
  }
}

/**
 * Decode one raw LZMA stream. `properties` is the five-byte block ahead of
 * it (lc/lp/pb packed in the first byte, then the dictionary size, which a
 * decoder holding the whole output has no use for).
 */
export function decodeLzma(
  properties: Uint8Array,
  data: Uint8Array,
  outSize: number,
  start = 0,
): Uint8Array {
  if (properties.length < 5) throw new LzmaError('fewer than five property bytes');
  let d = properties[0]!;
  if (d >= 9 * 5 * 5) throw new LzmaError(`property byte ${d} is out of range`);
  const lc = d % 9;
  d = Math.floor(d / 9);
  const lp = d % 5;
  const pb = Math.floor(d / 5);

  const out = new Uint8Array(outSize);
  const rc = new RangeDecoder(data, start);
  const literal = probs(0x300 << (lc + lp));
  const isMatch = probs(STATES << 4);
  const isRep = probs(STATES);
  const isRepG0 = probs(STATES);
  const isRepG1 = probs(STATES);
  const isRepG2 = probs(STATES);
  const isRep0Long = probs(STATES << 4);
  const posSlot = probs(4 << 6);
  const posSpecial = probs(1 + FULL_DISTANCES - END_POS_MODEL);
  const align = probs(16);
  const matchLength = new LengthDecoder();
  const repLength = new LengthDecoder();

  let state = 0;
  let rep0 = 0;
  let rep1 = 0;
  let rep2 = 0;
  let rep3 = 0;
  let at = 0;
  const posMask = (1 << pb) - 1;
  const lpMask = (1 << lp) - 1;

  while (at < outSize) {
    const posState = at & posMask;
    if (rc.bit(isMatch, (state << 4) + posState) === 0) {
      const previous = at > 0 ? out[at - 1]! : 0;
      const offset = 0x300 * (((at & lpMask) << lc) + (previous >> (8 - lc)));
      let symbol = 1;
      if (state >= 7) {
        let matchByte = out[at - rep0 - 1]!;
        do {
          const matchBit = (matchByte >> 7) & 1;
          matchByte <<= 1;
          const bit = rc.bit(literal, offset + ((1 + matchBit) << 8) + symbol);
          symbol = (symbol << 1) | bit;
          if (matchBit !== bit) break;
        } while (symbol < 0x100);
      }
      while (symbol < 0x100) symbol = (symbol << 1) | rc.bit(literal, offset + symbol);
      out[at++] = symbol & 0xff;
      state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      continue;
    }

    let length: number;
    if (rc.bit(isRep, state) === 1) {
      if (at === 0) throw new LzmaError('a repeat with nothing written yet');
      if (rc.bit(isRepG0, state) === 0) {
        if (rc.bit(isRep0Long, (state << 4) + posState) === 0) {
          state = state < 7 ? 9 : 11;
          out[at] = out[at - rep0 - 1]!;
          at++;
          continue;
        }
      } else {
        let distance: number;
        if (rc.bit(isRepG1, state) === 0) {
          distance = rep1;
        } else {
          if (rc.bit(isRepG2, state) === 0) {
            distance = rep2;
          } else {
            distance = rep3;
            rep3 = rep2;
          }
          rep2 = rep1;
        }
        rep1 = rep0;
        rep0 = distance;
      }
      length = repLength.decode(rc, posState);
      state = state < 7 ? 8 : 11;
    } else {
      rep3 = rep2;
      rep2 = rep1;
      rep1 = rep0;
      length = matchLength.decode(rc, posState);
      state = state < 7 ? 7 : 10;
      const slot = rc.tree(posSlot, Math.min(length, 3) << 6, 6);
      if (slot < 4) {
        rep0 = slot;
      } else {
        const directBits = (slot >> 1) - 1;
        let distance = ((2 | (slot & 1)) << directBits) >>> 0;
        if (slot < END_POS_MODEL) {
          distance += rc.reverseTree(posSpecial, distance - slot, directBits);
        } else {
          distance = (distance + ((rc.direct(directBits - 4) << 4) >>> 0)) >>> 0;
          distance = (distance + rc.reverseTree(align, 0, 4)) >>> 0;
        }
        rep0 = distance;
      }
      // The end marker: an all-ones distance.
      if (rep0 === 0xffffffff) break;
    }

    if (rep0 >= at) throw new LzmaError('a match reaches back past the start');
    length += MATCH_MIN;
    const stop = Math.min(outSize, at + length);
    for (let from = at - rep0 - 1; at < stop; at++, from++) out[at] = out[from]!;
  }

  if (at !== outSize) throw new LzmaError(`decoded ${at} bytes where ${outSize} were declared`);
  return out;
}

/**
 * A ZIP method-14 entry: two version bytes, the property block's length,
 * the properties, then the stream.
 */
export function decodeLzmaEntry(entry: Uint8Array, outSize: number): Uint8Array {
  if (entry.length < 4) throw new LzmaError('shorter than its own header');
  const propertiesSize = entry[2]! | (entry[3]! << 8);
  const properties = entry.subarray(4, 4 + propertiesSize);
  return decodeLzma(properties, entry, outSize, 4 + propertiesSize);
}
