/**
 * The names the dev certificate covers, and when it is made again. A phone
 * rejects a certificate that does not name the address it dialled exactly as
 * it rejects an untrusted one, so a stale name list must trigger a fresh one.
 */

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { certNames, ensureLocalCert } from '../localCert';

const nic = (address: string, internal = false, family = 'IPv4') =>
  ({ address, internal, family }) as never;

describe('certNames', () => {
  it('names loopback, the host and each external IPv4 address, sorted', () => {
    const names = certNames(
      { en0: [nic('192.168.1.20'), nic('fe80::1', false, 'IPv6')], lo0: [nic('127.0.0.1', true)] },
      'laptop',
    );
    expect(names).toEqual(['127.0.0.1', '192.168.1.20', '::1', 'laptop.local', 'localhost']);
  });
});

describe('ensureLocalCert', () => {
  const fakeMkcert = (calls: string[][]) => (args: string[]) => {
    calls.push(args);
    if (args[0] === '-cert-file') {
      writeFileSync(args[1], 'cert');
      writeFileSync(args[3], 'key');
    }
  };

  it('makes the certificate once and reuses it while the names hold', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cert-'));
    const calls: string[][] = [];
    ensureLocalCert(dir, ['a', 'b'], fakeMkcert(calls));
    ensureLocalCert(dir, ['a', 'b'], fakeMkcert(calls));
    expect(calls.filter(c => c[0] === '-cert-file')).toHaveLength(1);
  });

  it('makes a new one when the LAN address changes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cert-'));
    const calls: string[][] = [];
    ensureLocalCert(dir, ['192.168.1.20'], fakeMkcert(calls));
    ensureLocalCert(dir, ['192.168.1.99'], fakeMkcert(calls));
    expect(calls.filter(c => c[0] === '-cert-file')).toHaveLength(2);
    expect(readFileSync(path.join(dir, 'names.txt'), 'utf8')).toBe('192.168.1.99');
  });

  it('still issues the certificate when trusting the CA fails', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cert-'));
    const result = ensureLocalCert(dir, ['a'], args => {
      if (args[0] === '-install') throw new Error('sudo needs a tty');
      fakeMkcert([])(args);
    });
    expect(result).toHaveProperty('cert');
  });

  it('reports a reason when mkcert is missing', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'cert-'));
    const result = ensureLocalCert(dir, ['a'], () => {
      throw new Error('ENOENT');
    });
    expect(result).toHaveProperty('reason');
  });
});
