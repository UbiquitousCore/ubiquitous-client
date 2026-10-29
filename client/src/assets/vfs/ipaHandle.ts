/**
 * Remembering the game file between sessions via the File System Access API
 * (handle survives in IndexedDB; permission re-granted on revisit). Needed
 * because packs extract lazily — an unvisited map's pack is still required
 * later. Falls back to re-asking where the API is missing.
 */

import { logger } from '../../core/log';

const log = logger('ipa-handle');

const DB_NAME = 'ubiquitous-assets';
const DB_VERSION = 1;
const STORE = 'handles';
const KEY = 'ipa';

export interface StoredHandle {
  handle: FileSystemFileHandle;
  name: string;
  size: number;
}

/** Is the File System Access API available to pick and remember a file? */
export function canRememberFiles(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as { showOpenFilePicker?: unknown }).showOpenFilePicker === 'function'
  );
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  try {
    const db = await open();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    log.debug(`handle store unavailable: ${String(err)}`);
    return null;
  }
}

/** Remember the file the user picked, so it can be reopened next time. */
export async function rememberIpa(handle: FileSystemFileHandle): Promise<void> {
  const file = await handle.getFile().catch(() => null);
  const record: StoredHandle = {
    handle,
    name: file?.name ?? handle.name,
    size: file?.size ?? 0,
  };
  // A FileSystemFileHandle is structured-cloneable, which is the whole reason
  // this works: IndexedDB can store the handle itself, not a path.
  await withStore('readwrite', s => s.put(record, KEY) as IDBRequest<IDBValidKey>);
  log.info(`remembered ${record.name}`);
}

/** What was remembered, without asking for permission yet. */
export async function storedIpa(): Promise<StoredHandle | null> {
  const record = await withStore<StoredHandle | undefined>(
    'readonly',
    s => s.get(KEY) as IDBRequest<StoredHandle | undefined>,
  );
  return record ?? null;
}

/**
 * Reopen the remembered file.
 *
 * `interactive` decides whether a permission prompt may be raised, which the
 * browser only allows during a user gesture — so boot passes false and asks
 * later if it comes back null.
 */
export async function reopenIpa(interactive = false): Promise<File | null> {
  const record = await storedIpa();
  if (!record?.handle) return null;
  try {
    const handle = record.handle as FileSystemFileHandle & {
      queryPermission?(d: { mode: string }): Promise<PermissionState>;
      requestPermission?(d: { mode: string }): Promise<PermissionState>;
    };
    let state = (await handle.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (state === 'prompt' && interactive) {
      state = (await handle.requestPermission?.({ mode: 'read' })) ?? 'denied';
    }
    if (state !== 'granted') {
      log.info(`permission for ${record.name} is '${state}'`);
      return null;
    }
    const file = await handle.getFile();
    log.info(`reopened ${file.name} (${(file.size / 1e9).toFixed(2)} GB)`);
    return file;
  } catch (err) {
    log.warn(`could not reopen the remembered file: ${String(err)}`);
    return null;
  }
}

export async function forgetIpa(): Promise<void> {
  await withStore('readwrite', s => s.delete(KEY) as IDBRequest<undefined>);
}

/**
 * Pick a game file, remembering it when the browser allows.
 *
 * Falls back to a plain file input, which cannot be remembered — the user is
 * asked again next time, which is expected rather than a failure.
 */
export async function pickIpa(): Promise<File[]> {
  if (canRememberFiles()) {
    const picker = (
      window as unknown as {
        showOpenFilePicker(o: unknown): Promise<FileSystemFileHandle[]>;
      }
    ).showOpenFilePicker;
    const handles = await picker({
      multiple: true,
      types: [
        {
          description: 'Order & Chaos game data',
          accept: { 'application/octet-stream': ['.ipa', '.bin'] },
        },
      ],
    });
    const files = await Promise.all(handles.map(h => h.getFile()));
    // Only an .ipa is worth remembering: extracted packs are already in
    // storage and do not need reopening.
    const ipa = handles.find((_, i) => /\.ipa$/i.test(files[i].name));
    if (ipa) await rememberIpa(ipa);
    return files;
  }

  return new Promise<File[]>(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    // No `accept`: an iPhone greys an `.ipa` out of the picker when one is
    // set, and what was picked is checked by its contents anyway.
    input.multiple = true;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]));
    input.click();
  });
}
