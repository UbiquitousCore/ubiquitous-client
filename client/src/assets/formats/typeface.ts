/** A font file's own family name, which pairs shipped files with the names movies ask for. */

/** Name ids, as the OpenType `name` table numbers them. */
const FAMILY = 1;
const TYPOGRAPHIC_FAMILY = 16;

/** Platform ids, as the `name` table numbers them. */
const PLATFORM_UNICODE = 0;
const PLATFORM_MAC = 1;
const PLATFORM_WINDOWS = 3;

/** A font file's family name (id 16 over id 1); UTF-16 for Windows and Unicode records, bytes for Mac. Null if none. */
export function readTypefaceFamily(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let font = 0;
  // A collection lists several fonts; the first one stands for the file.
  if (tag(dv, 0) === 'ttcf') {
    if (bytes.length < 16) return null;
    font = dv.getUint32(12);
  }
  if (font + 12 > bytes.length) return null;
  const version = dv.getUint32(font);
  if (version !== 0x00010000 && tag(dv, font) !== 'OTTO' && tag(dv, font) !== 'true') {
    return null;
  }
  const tables = dv.getUint16(font + 4);
  let name = -1;
  for (let i = 0; i < tables; i++) {
    const at = font + 12 + i * 16;
    if (at + 16 > bytes.length) return null;
    if (tag(dv, at) === 'name') {
      name = dv.getUint32(at + 8);
      break;
    }
  }
  if (name < 0 || name + 6 > bytes.length) return null;
  const count = dv.getUint16(name + 2);
  const strings = name + dv.getUint16(name + 4);

  let best: { rank: number; value: string } | null = null;
  for (let i = 0; i < count; i++) {
    const at = name + 6 + i * 12;
    if (at + 12 > bytes.length) break;
    const platform = dv.getUint16(at);
    const nameId = dv.getUint16(at + 6);
    if (nameId !== FAMILY && nameId !== TYPOGRAPHIC_FAMILY) continue;
    const length = dv.getUint16(at + 8);
    const start = strings + dv.getUint16(at + 10);
    if (start + length > bytes.length) continue;
    const raw = bytes.subarray(start, start + length);
    let value: string;
    if (platform === PLATFORM_WINDOWS || platform === PLATFORM_UNICODE) {
      value = new TextDecoder('utf-16be').decode(raw);
    } else if (platform === PLATFORM_MAC) {
      value = String.fromCharCode(...raw);
    } else {
      continue;
    }
    value = value.replace(/\0+$/, '').trim();
    if (!value) continue;
    // Typographic family first, then Windows over Unicode over Macintosh.
    const rank =
      (nameId === TYPOGRAPHIC_FAMILY ? 10 : 0) +
      (platform === PLATFORM_WINDOWS ? 2 : platform === PLATFORM_UNICODE ? 1 : 0);
    if (!best || rank > best.rank) best = { rank, value };
  }
  return best?.value ?? null;
}

function tag(dv: DataView, at: number): string {
  return String.fromCharCode(
    dv.getUint8(at),
    dv.getUint8(at + 1),
    dv.getUint8(at + 2),
    dv.getUint8(at + 3),
  );
}
