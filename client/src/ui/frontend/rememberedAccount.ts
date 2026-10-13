/** The remembered account name, never the password; forgotten at once when turned off, and silently absent without storage. */

/** The `localStorage` key. Changing it forgets the remembered name. */
export const REMEMBERED_ACCOUNT_KEY = 'ubiquitousAccount';

/** The remembered account name, or null when nothing is remembered. */
export function rememberedAccount(): string | null {
  try {
    const held = globalThis.localStorage?.getItem(REMEMBERED_ACCOUNT_KEY);
    return held ? held : null;
  } catch {
    return null;
  }
}

/**
 * After a sign-in is sent: keep `account` if remembering is on, forget
 * whatever was kept if it is off.
 */
export function rememberAccount(account: string, remember: boolean): void {
  try {
    if (remember && account !== '') {
      globalThis.localStorage?.setItem(REMEMBERED_ACCOUNT_KEY, account);
    } else {
      globalThis.localStorage?.removeItem(REMEMBERED_ACCOUNT_KEY);
    }
  } catch {
    // Storage refused: the name is simply not kept.
  }
}
