/**
 * The interface words file: a boundary count and boundaries, then groups of
 * a count, offsets and NUL-terminated words. The first group is the
 * interface's.
 */

const TEXT = new TextDecoder('utf-8');

/** Every word group in order; an unreadable file gives none rather than throwing. */
export function readUiStrings(bytes: Uint8Array): string[][] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    // A count, two bytes of padding, then where every group after the
    // first begins. The last of them is the end of the last group.
    const boundaries = view.getUint32(0, true);
    if (boundaries < 2 || boundaries > 0xffff) return [];
    const edges = Array.from({ length: boundaries - 1 }, (_, i) => view.getUint32(6 + 4 * i, true));
    const base = 6 + 4 * (boundaries - 1);
    return [0, ...edges.slice(0, -1)].map(start => readGroup(bytes, view, base + start));
  } catch {
    return [];
  }
}

function readGroup(bytes: Uint8Array, view: DataView, at: number): string[] {
  const count = view.getUint32(at, true);
  const body = at + 4 + 4 * count;
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    const from = body + view.getUint32(at + 4 + 4 * i, true);
    let to = from;
    while (to < bytes.length && bytes[to] !== 0) to++;
    words.push(TEXT.decode(bytes.subarray(from, to)));
  }
  return words;
}
