import { describe, expect, it } from 'vitest';

import { readUiStrings } from '../../src/assets/formats/uiStrings';

/** A string file holding the given groups, laid out as the build lays them. */
function file(groups: string[][]): Uint8Array {
  const bodies = groups.map(words => {
    const bytes: number[] = [];
    const offsets: number[] = [];
    for (const word of words) {
      offsets.push(bytes.length);
      for (const code of new TextEncoder().encode(word)) bytes.push(code);
      // Words end at a zero byte and are padded to a four-byte boundary.
      do bytes.push(0);
      while (bytes.length % 4);
    }
    const out = new Uint8Array(4 + 4 * words.length + bytes.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, words.length, true);
    offsets.forEach((at, i) => view.setUint32(4 + 4 * i, at, true));
    out.set(bytes, 4 + 4 * words.length);
    return out;
  });

  const edges: number[] = [];
  let running = 0;
  for (const body of bodies) edges.push((running += body.length));
  const head = 6 + 4 * edges.length;
  const out = new Uint8Array(head + running);
  const view = new DataView(out.buffer);
  view.setUint32(0, edges.length + 1, true);
  edges.forEach((edge, i) => view.setUint32(6 + 4 * i, edge, true));
  let at = head;
  for (const body of bodies) {
    out.set(body, at);
    at += body.length;
  }
  return out;
}

describe('readUiStrings', () => {
  it('reads every word of every group, in the order the build numbered them', () => {
    const words = readUiStrings(file([['Quest', 'Trade', 'OK'], ['Warning']]));
    expect(words).toEqual([['Quest', 'Trade', 'OK'], ['Warning']]);
  });

  it('keeps an empty word where the build left one', () => {
    // A number with nothing behind it is a caption the build never set,
    // not a file that failed to read: the numbering has to stay put.
    expect(readUiStrings(file([['Bid', '', 'Auction']]))[0]).toEqual(['Bid', '', 'Auction']);
  });

  it('comes back empty rather than throwing on anything else', () => {
    // A build shipping no words leaves every screen to its own styling,
    // which is a thing screens are allowed to be.
    expect(readUiStrings(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))).toEqual([]);
    expect(readUiStrings(new Uint8Array(0))).toEqual([]);
  });
});
