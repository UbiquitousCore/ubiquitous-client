/**
 * `config.txt` with its `server=` line replaced by `server`, or the file as it
 * is when `server` is null. The window serves the client from its own origin,
 * so the address has to be absolute: a bare path there would dial the window,
 * not a server.
 */
export function withServer(text, server) {
  if (server === null) return text;
  const line = `server=${server}`;
  if (/^\s*server\s*=/m.test(text)) return text.replace(/^\s*server\s*=.*$/m, line);
  return `${text.replace(/\n*$/, '\n')}${line}\n`;
}

/** The first of the command line, the environment and the saved file that names a server. */
export function chooseServer({ argv, env, saved }) {
  const flag = argv.find(a => a.startsWith('--server='));
  const value = flag?.slice('--server='.length) ?? env.UBIQUITOUS_SERVER ?? saved;
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return /^wss?:\/\//.test(trimmed) ? trimmed : null;
}
