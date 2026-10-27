/**
 * FileConfig — reads public/config.txt at startup.
 *
 * The file is a simple key=value format (one per line, # comments).
 * Query string overrides still win over file values.
 */

export interface FileConfig {
  debug: boolean;
  /**
   * Whether to show the admin panel. Null where the file does not say, which
   * leaves it to the build: see `adminPanelWanted`.
   */
  admin: boolean | null;
  /** Server WebSocket address, or null for single-player; loopback is rewritten for other devices (`serverUrlFor`). */
  server: string | null;
}

const DEFAULTS: FileConfig = {
  debug: false,
  admin: null,
  server: null,
};

let cached: FileConfig | null = null;

/**
 * The path the dev server forwards to the loopback game server; see
 * `serverProxy` in `vite.config.ts`, which answers on the same path.
 */
export const SERVER_PROXY_PATH = '/ubiquitous-server';

/** The parts of `window.location` a server address depends on. */
export interface PageLocation {
  protocol: string;
  host: string;
  hostname: string;
}

/**
 * Where to dial a configured loopback server from a page on another device:
 * through the dev server's {@link SERVER_PROXY_PATH} when proxied (the server
 * binds 127.0.0.1, and https pages cannot open `ws://`), else the page's own
 * host. A page on the loopback host keeps the address as written. A bare path
 * is on the page's own origin, which is how a reverse proxy in front of both
 * serves them: one address, one certificate, on every device.
 */
export function serverUrlFor(url: string, page: PageLocation, proxied: boolean): string {
  if (url.startsWith('/')) return `${page.protocol === 'https:' ? 'wss:' : 'ws:'}//${page.host}${url}`;
  try {
    const here = page.hostname;
    if (!here || isLoopback(here)) return url;
    const u = new URL(url);
    if (!isLoopback(u.hostname)) return url;
    if (proxied) {
      const scheme = page.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${scheme}//${page.host}${SERVER_PROXY_PATH}`;
    }
    u.hostname = here;
    return u.toString();
  } catch {
    return url;
  }
}

function isLoopback(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]'
  );
}

function rewriteLocalHost(url: string): string {
  return serverUrlFor(url, window.location, import.meta.env.DEV);
}

/**
 * Load and parse public/config.txt. Returns cached result after first call.
 * Falls back to defaults if the file is missing or unparseable.
 */
export async function loadFileConfig(): Promise<FileConfig> {
  if (cached) return cached;
  try {
    const res = await fetch('/config.txt', { cache: 'no-store' });
    if (!res.ok) return DEFAULTS;
    const text = await res.text();
    const cfg = { ...DEFAULTS };
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim();
      if (key === 'debug') cfg.debug = val === 'true';
      else if (key === 'admin') cfg.admin = val === 'true';
      else if (key === 'server') cfg.server = val === '' ? null : rewriteLocalHost(val);
    }
    cached = cfg;
    return cfg;
  } catch {
    return DEFAULTS;
  }
}

/** `?admin=1`/`?admin=0` decides, else the file's `admin=`, else shown in dev builds only. */
export function adminPanelWanted(
  fileSays: boolean | null,
  query: string | null,
  developmentBuild: boolean,
): boolean {
  if (query === '1') return true;
  if (query === '0') return false;
  return fileSays ?? developmentBuild;
}

/**
 * Whether the admin panel may be built. Played against a server, only a GM
 * account gets it, whatever the build or file says; played alone there is no
 * account, so the build and file decide.
 */
export function adminPanelAllowed(wanted: boolean, online: boolean, isGameMaster: boolean): boolean {
  return wanted && (!online || isGameMaster);
}

/**
 * A server address named in the address bar, for a development build only.
 *
 * A released client must not be pointable at somebody else's socket by a link
 * alone: the sign-in form sends the account and password to whatever this
 * returns, so a crafted `?server=` would be a credential-phishing vector. The
 * override is therefore ignored outside development, and even there only a
 * loopback address is accepted — the case the dev server's socket forward
 * exists for.
 */
export function serverFromQuery(
  query: string | null,
  developmentBuild: boolean,
): { asked: boolean; server: string | null } {
  if (!developmentBuild || query === null) return { asked: false, server: null };
  if (query === '') return { asked: true, server: null };
  try {
    const url = new URL(query);
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') return { asked: false, server: null };
    if (!isLoopback(url.hostname)) return { asked: false, server: null };
    return { asked: true, server: query };
  } catch {
    return { asked: false, server: null };
  }
}

/** Override cached config (for query-string overrides). */
export function overrideFileConfig(overrides: Partial<FileConfig>): FileConfig {
  const next = { ...(cached ?? DEFAULTS), ...overrides };
  if (typeof next.server === 'string') next.server = rewriteLocalHost(next.server);
  cached = next;
  return cached;
}
