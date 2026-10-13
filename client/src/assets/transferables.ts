/**
 * Which of a resource's buffers may move across the worker boundary.
 * `postMessage` copies by default; transferables move instead. Cached-value
 * buffers are registered here and skipped (transfer detaches the sender's
 * copy — a cached buffer handed out twice would poison the cache).
 */

/** Walk every buffer-bearing object in a structured-cloneable value. */
function walk(
  value: unknown,
  seen: Set<unknown>,
  onBitmap: (b: ImageBitmap) => void,
  onBuffer: (b: ArrayBuffer) => void,
): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (typeof ImageBitmap !== 'undefined' && value instanceof ImageBitmap) {
    onBitmap(value);
    return;
  }
  if (ArrayBuffer.isView(value)) {
    const buffer = (value as ArrayBufferView).buffer;
    if (buffer instanceof ArrayBuffer && !seen.has(buffer)) {
      seen.add(buffer);
      onBuffer(buffer);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, seen, onBitmap, onBuffer);
    return;
  }
  for (const item of Object.values(value as Record<string, unknown>)) {
    walk(item, seen, onBitmap, onBuffer);
  }
}

/**
 * Everything in `value` worth moving rather than copying.
 *
 * Buffers in `retained` are left out: the sender still owns those, and moving
 * one would detach it out from under whatever is holding it.
 */
export function transferablesOf(
  value: unknown,
  retained?: ReadonlySet<ArrayBuffer> | { has(buffer: ArrayBuffer): boolean },
): Transferable[] {
  const out: Transferable[] = [];
  walk(
    value,
    new Set(),
    bitmap => out.push(bitmap),
    buffer => {
      if (!retained?.has(buffer)) out.push(buffer);
    },
  );
  return out;
}

/**
 * Register every buffer in `value` as owned by the sender.
 *
 * Call this on anything put into a cache that outlives one response. An
 * `ImageBitmap` is deliberately not registered: it is not a buffer, transfer
 * of one is a handle move, and nothing here caches them.
 */
export function retainBuffers(value: unknown, into: { add(buffer: ArrayBuffer): void }): void {
  walk(
    value,
    new Set(),
    () => undefined,
    buffer => into.add(buffer),
  );
}
