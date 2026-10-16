/**
 * Points the client at a game server on another port without editing
 * `public/config.txt`: `UBIQUITOUS_SERVER_PORT=9000 npm run dev`.
 */

/** The port named by the environment, or null when unset or not a port. */
export function serverPortFrom(env: Record<string, string | undefined>): number | null {
  const raw = env.UBIQUITOUS_SERVER_PORT?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  const port = Number(raw);
  return port >= 1 && port <= 65535 ? port : null;
}

/** `ws://host:8781` with the port swapped; an address with no parseable URL is left alone. */
export function withPort(address: string, port: number | null): string {
  if (port === null) return address;
  try {
    const url = new URL(address);
    url.port = String(port);
    return url.toString().replace(/\/$/, address.endsWith('/') ? '/' : '');
  } catch {
    return address;
  }
}

/** `config.txt` with its `server=` line pointed at `port`. */
export function configWithServerPort(text: string, port: number | null): string {
  if (port === null) return text;
  return text
    .split('\n')
    .map(line => {
      const match = /^(\s*server\s*=\s*)(.+?)(\r?)$/.exec(line);
      return match ? `${match[1]}${withPort(match[2], port)}${match[3]}` : line;
    })
    .join('\n');
}
