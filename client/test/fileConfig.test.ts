import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  adminPanelAllowed,
  adminPanelWanted,
  serverFromQuery,
  serverUrlFor,
} from '../src/core/FileConfig';

const SHIPPED = readFileSync(resolve(__dirname, '../public/config.txt'), 'utf8');

async function loadFrom(text: string) {
  vi.resetModules();
  vi.stubGlobal('fetch', async () => new Response(text, { status: 200 }));
  const { loadFileConfig } = await import('../src/core/FileConfig');
  return loadFileConfig();
}

afterEach(() => vi.unstubAllGlobals());

describe('the shipped config file', () => {
  it('leaves the admin panel to the build', async () => {
    expect((await loadFrom(SHIPPED)).admin).toBeNull();
  });

  it('reads admin=true and admin=false as said', async () => {
    expect((await loadFrom('admin=true\n')).admin).toBe(true);
    expect((await loadFrom('admin=false\n')).admin).toBe(false);
  });
});

describe('whether the admin panel shows', () => {
  it('shows in a development build and not in a production one', () => {
    expect(adminPanelWanted(null, null, true)).toBe(true);
    expect(adminPanelWanted(null, null, false)).toBe(false);
  });

  it('shows in a production build when the file or the address asks', () => {
    expect(adminPanelWanted(true, null, false)).toBe(true);
    expect(adminPanelWanted(null, '1', false)).toBe(true);
  });

  it('hides for ?admin=0 whatever the build or the file says', () => {
    expect(adminPanelWanted(null, '0', true)).toBe(false);
    expect(adminPanelWanted(true, '0', false)).toBe(false);
  });

  it('hides in a development build when the file says admin=false', () => {
    expect(adminPanelWanted(false, null, true)).toBe(false);
    expect(adminPanelWanted(false, '1', true)).toBe(true);
  });

  it('ignores an address value it does not know', () => {
    expect(adminPanelWanted(null, 'yes', false)).toBe(false);
    expect(adminPanelWanted(null, 'yes', true)).toBe(true);
  });

  it('shows with the shipped file in development and hides it in production', async () => {
    const { admin } = await loadFrom(SHIPPED);
    expect(adminPanelWanted(admin, null, true)).toBe(true);
    expect(adminPanelWanted(admin, null, false)).toBe(false);
  });
});

describe('where a configured server is dialled from', () => {
  const PC = { protocol: 'https:', host: 'localhost:8780', hostname: 'localhost' };
  const PHONE = { protocol: 'https:', host: '10.0.0.20:8780', hostname: '10.0.0.20' };
  const PHONE_HTTP = { ...PHONE, protocol: 'http:' };

  it('keeps the address as written on the machine running the server', () => {
    expect(serverUrlFor('ws://127.0.0.1:8781', PC, true)).toBe('ws://127.0.0.1:8781');
    expect(serverUrlFor('ws://127.0.0.1:8781', PC, false)).toBe('ws://127.0.0.1:8781');
  });

  it("goes through the dev server from a phone, in the page's own scheme", () => {
    expect(serverUrlFor('ws://127.0.0.1:8781', PHONE, true)).toBe(
      'wss://10.0.0.20:8780/ubiquitous-server',
    );
    expect(serverUrlFor('ws://localhost:8781', PHONE_HTTP, true)).toBe(
      'ws://10.0.0.20:8780/ubiquitous-server',
    );
  });

  it("dials the page's host directly when no dev server is forwarding", () => {
    expect(serverUrlFor('ws://127.0.0.1:8781', PHONE, false)).toBe('ws://10.0.0.20:8781/');
  });

  it("dials a bare path on the page's own origin, from any device", () => {
    expect(serverUrlFor('/ubiquitous-server', PHONE, false)).toBe(
      'wss://10.0.0.20:8780/ubiquitous-server',
    );
    expect(serverUrlFor('/ubiquitous-server', PC, false)).toBe(
      'wss://localhost:8780/ubiquitous-server',
    );
    expect(serverUrlFor('/ubiquitous-server', PHONE_HTTP, true)).toBe(
      'ws://10.0.0.20:8780/ubiquitous-server',
    );
  });

  it('leaves a server on another machine alone', () => {
    expect(serverUrlFor('wss://play.example:7020', PHONE, true)).toBe('wss://play.example:7020');
  });
});

describe('a server named in the address bar', () => {
  it('is ignored by a production build', () => {
    expect(serverFromQuery('wss://play.example:7020', false)).toEqual({
      asked: false,
      server: null,
    });
    expect(serverFromQuery('ws://127.0.0.1:8781', false)).toEqual({ asked: false, server: null });
  });

  it('is taken by a development build for a loopback address', () => {
    expect(serverFromQuery('ws://127.0.0.1:8781', true)).toEqual({
      asked: true,
      server: 'ws://127.0.0.1:8781',
    });
    expect(serverFromQuery('ws://localhost:9000', true)).toEqual({
      asked: true,
      server: 'ws://localhost:9000',
    });
    expect(serverFromQuery('wss://[::1]:9000', true)).toEqual({
      asked: true,
      server: 'wss://[::1]:9000',
    });
  });

  it('turns single-player on for an empty value, in development only', () => {
    expect(serverFromQuery('', true)).toEqual({ asked: true, server: null });
    expect(serverFromQuery('', false)).toEqual({ asked: false, server: null });
  });

  it('refuses a development build pointed at another machine', () => {
    expect(serverFromQuery('wss://play.example:7020', true)).toEqual({
      asked: false,
      server: null,
    });
    expect(serverFromQuery('ws://192.168.1.20:8781', true)).toEqual({
      asked: false,
      server: null,
    });
  });

  it('refuses a value that is not a websocket address', () => {
    expect(serverFromQuery('https://play.example', true)).toEqual({ asked: false, server: null });
    expect(serverFromQuery('not a url', true)).toEqual({ asked: false, server: null });
  });

  it('does not override when the address says nothing', () => {
    expect(serverFromQuery(null, true)).toEqual({ asked: false, server: null });
    expect(serverFromQuery(null, false)).toEqual({ asked: false, server: null });
  });
});

describe('adminPanelAllowed', () => {
  it('shows the panel against a server only to a GM', () => {
    expect(adminPanelAllowed(true, true, true)).toBe(true);
    expect(adminPanelAllowed(true, true, false)).toBe(false);
  });

  it('leaves it to the build and file when played alone', () => {
    expect(adminPanelAllowed(true, false, false)).toBe(true);
    expect(adminPanelAllowed(false, false, false)).toBe(false);
  });

  it('never shows it when not wanted, GM or not', () => {
    expect(adminPanelAllowed(false, true, true)).toBe(false);
  });
});
