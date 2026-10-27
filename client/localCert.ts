import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { NetworkInterfaceInfo } from 'node:os';
import path from 'node:path';

/**
 * The names a local certificate must cover so a phone can open the dev server
 * by LAN address: loopback, this machine's hostname, and every non-internal
 * IPv4 address. Sorted, so the same machine always yields the same list and a
 * changed list means the address really did change.
 */
export function certNames(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
  hostname: string,
): string[] {
  const names = new Set(['localhost', '127.0.0.1', '::1']);
  if (hostname) names.add(hostname.endsWith('.local') ? hostname : `${hostname}.local`);
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) names.add(info.address);
    }
  }
  return [...names].sort();
}

export interface LocalCert {
  cert: Buffer;
  key: Buffer;
}

/**
 * A mkcert certificate for `names`, made if missing or stale.
 *
 * DHCP can hand the laptop a new address between runs, and a certificate that
 * does not name the address the phone dials is rejected just like an untrusted
 * one, so the list of names is kept beside the certificate and compared.
 * Returns null, with the reason, when mkcert is not installed: nothing else
 * can produce a certificate a phone can be made to trust.
 */
export function ensureLocalCert(
  dir: string,
  names: readonly string[],
  run: (args: string[]) => void = args => void execFileSync('mkcert', args, { stdio: 'ignore' }),
): { cert: LocalCert } | { reason: string } {
  const certFile = path.join(dir, 'dev.pem');
  const keyFile = path.join(dir, 'dev-key.pem');
  const namesFile = path.join(dir, 'names.txt');
  const wanted = names.join('\n');

  const current =
    existsSync(certFile) &&
    existsSync(keyFile) &&
    existsSync(namesFile) &&
    readFileSync(namesFile, 'utf8') === wanted;

  if (!current) {
    try {
      mkdirSync(dir, { recursive: true });
      try {
        // Trusting the CA on this machine can need a password prompt that has
        // no terminal here; the certificate does not depend on it.
        run(['-install']);
      } catch {
        // Run `mkcert -install` by hand to trust it in this machine's browsers.
      }
      run(['-cert-file', certFile, '-key-file', keyFile, ...names]);
      writeFileSync(namesFile, wanted);
    } catch {
      return {
        reason:
          'mkcert is not installed (brew install mkcert, or see https://github.com/FiloSottile/mkcert)',
      };
    }
  }
  return { cert: { cert: readFileSync(certFile), key: readFileSync(keyFile) } };
}
