import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hostname, networkInterfaces } from 'node:os';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin, ProxyOptions } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { fontLicenceText, unexpectedPublicFiles } from './buildChecks';
import { devServerExposure } from './devServerExposure';
import { certNames, ensureLocalCert, type LocalCert } from './localCert';
import { configWithServerPort, serverPortFrom, withPort } from './serverPort';
import { SERVER_PROXY_PATH } from './src/core/FileConfig';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vite reads .env into import.meta.env only; the settings below also read it.
// Kept off process.env so resolving this config twice in one process (the
// tests do) cannot leak one run's settings into the next.
const envFile = path.join(__dirname, '.env');
const ENV: Record<string, string | undefined> = {
  ...(existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {}),
  ...process.env,
};

/**
 * The port the dev/preview server listens on.
 *
 * Configurable so two checkouts can run side by side — worktrees, or a second
 * agent — without colliding:
 *
 *   UBIQUITOUS_CLIENT_PORT=8781 npm run dev
 */
const CLIENT_PORT = Number(ENV.UBIQUITOUS_CLIENT_PORT ?? 8780);

/** Localhost unless `UBIQUITOUS_LAN=1`; see `devServerExposure.ts`. */
const EXPOSURE = devServerExposure(ENV, path.dirname(__dirname));

/** The game server's port when `UBIQUITOUS_SERVER_PORT` overrides `config.txt`. */
const SERVER_PORT = serverPortFrom(ENV);

/**
 * A stamp identifying exactly what is running, shown in the HUD.
 *
 * Without it there is no way to tell a genuine rendering bug from a browser
 * showing a stale bundle, and the two produce identical bug reports.
 *
 * In dev it must be recomputed per page load, not once when the server
 * starts. A dev server left running across a dozen commits kept reporting the
 * commit it booted at, so freshly served code looked stale and a bug report
 * carried the wrong revision — the exact failure this exists to prevent. The
 * plugin below re-stamps `index.html` on every request; `define` remains the
 * source for a production build, where a single value is correct.
 */
function buildStamp(): string {
  let commit = 'nogit';
  try {
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
    if (execSync('git status --porcelain', { encoding: 'utf8' }).trim()) commit += '+';
  } catch {
    // Not a git checkout; the timestamp alone still distinguishes builds.
  }
  return `${commit} ${new Date().toISOString().slice(11, 19)}`;
}

/** Re-stamp index.html per request, so a reload always reports current code. */
function freshStamp() {
  return {
    name: 'ubiquitous-build-stamp',
    transformIndexHtml(html: string) {
      return html.replace(
        '</head>',
        `<script>globalThis.__UBIQUITOUS_STAMP__ = ${JSON.stringify(buildStamp())};</script></head>`,
      );
    },
  };
}

/**
 * Fail the build on a stray file in `public/`, and ship the typeface's licence
 * beside the font files the build copies into `assets/`. See `buildChecks.ts`.
 */
function buildChecks(): Plugin {
  return {
    name: 'ubiquitous-build-checks',
    apply: 'build',
    buildStart() {
      const stray = unexpectedPublicFiles(path.join(__dirname, 'public'));
      if (stray.length > 0) {
        this.error(`client/public holds files the build must not ship: ${stray.join(', ')}`);
      }
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'assets/EB-Garamond-OFL.txt',
        source: fontLicenceText(path.join(__dirname, 'node_modules/@fontsource/eb-garamond')),
      });
    },
  };
}

/**
 * Local HTTPS for dev, always. OPFS (where the packs live) and the PWA service
 * worker need a secure context, which a plain http:// LAN address never is.
 * The certificate comes from mkcert and is made on first run, and again when
 * the laptop's LAN address changes; see `localCert.ts`. The tests resolve this
 * config too and must not shell out, so they skip it.
 *
 * One-time setup: install mkcert (`brew install mkcert`). A phone then
 * fetches `/mkcert-root-ca.pem` from the dev server and trusts it.
 */
function localHttps(): LocalCert | undefined {
  if (ENV.VITEST) return undefined;
  const made = ensureLocalCert(
    path.join(__dirname, '.cert'),
    certNames(networkInterfaces(), hostname()),
  );
  if ('reason' in made) {
    console.warn(`\n[https] serving plain http: ${made.reason}\n`);
    return undefined;
  }
  return made.cert;
}
const httpsOptions = localHttps();

/**
 * A phone visiting the dev server for the first time does not trust mkcert's
 * local CA yet — that is the point of this route: fetch it here (accepting
 * the one-time untrusted-certificate warning to do so — it is one small
 * public cert file, nothing executes), then install it as a trusted profile.
 * Only registered when a local cert actually exists, so this never shells
 * out to `mkcert` for anyone who has not set one up.
 */
function serveMkcertRootCa(): Plugin {
  return {
    name: 'ubiquitous-mkcert-root-ca',
    configureServer(server) {
      server.middlewares.use('/mkcert-root-ca.pem', (_req, res) => {
        try {
          const caRoot = execSync('mkcert -CAROOT', { encoding: 'utf8' }).trim();
          res.setHeader('Content-Type', 'application/x-pem-file');
          res.end(readFileSync(path.join(caRoot, 'rootCA.pem')));
        } catch {
          res.statusCode = 404;
          res.end('mkcert CA root not found — is mkcert installed?');
        }
      });
    },
  };
}

/** Serves `config.txt` with the server line on `UBIQUITOUS_SERVER_PORT`, when it is set. */
function serverPortOverride(): Plugin {
  return {
    name: 'ubiquitous-server-port',
    configureServer(server) {
      if (SERVER_PORT === null) return;
      server.middlewares.use('/config.txt', (_req, res) => {
        const text = readFileSync(path.join(__dirname, 'public/config.txt'), 'utf8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(configWithServerPort(text, SERVER_PORT));
      });
    },
  };
}

/**
 * The game server's socket, forwarded through the dev server.
 *
 * The game server listens on 127.0.0.1 only, and a page served over https
 * may not open a plain `ws://` socket. A phone on the LAN therefore cannot
 * reach it directly, so the page dials this path on the dev server's own
 * origin instead, and the dev server makes the loopback connection from the
 * machine it runs on. `serverUrlFor` in `src/core/FileConfig.ts` is the
 * other half.
 *
 * The target is the `server=` line of `public/config.txt`, so there is one
 * address to edit. `changeOrigin` makes the forwarded `Host` header name the
 * target: the server's listener refuses a request for any other host.
 */
function serverProxy(): Record<string, ProxyOptions> {
  let target = withPort('ws://127.0.0.1:8781', SERVER_PORT);
  try {
    const text = readFileSync(path.join(__dirname, 'public/config.txt'), 'utf8');
    const line = text.split('\n').find(l => /^\s*server\s*=/.test(l));
    const value = line?.slice(line.indexOf('=') + 1).trim();
    if (value) target = withPort(value, SERVER_PORT);
  } catch {
    // No config file: the default address above.
  }
  return {
    [SERVER_PROXY_PATH]: {
      target: target.replace(/^ws/, 'http'),
      ws: true,
      changeOrigin: true,
      rewrite: p => p.slice(SERVER_PROXY_PATH.length) || '/',
    },
  };
}

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    freshStamp(),
    serverPortOverride(),
    buildChecks(),
    ...(httpsOptions ? [serveMkcertRootCa()] : []),
  ],
  define: {
    __BUILD_STAMP__: JSON.stringify(buildStamp()),
  },
  server: {
    port: CLIENT_PORT,
    fs: {
      // Dev only: lets the dev pages read the user's extracted packs, or the
      // folder holding their .ipa, from outside the project. Opt-in through
      // $UBIQUITOUS_PACK_DIR, and refused on the LAN unless UBIQUITOUS_LAN_PACKS=1 too.
      allow: ['.', ...EXPOSURE.packDirs],
      // Secrets never; game data only once $UBIQUITOUS_PACK_DIR opts in.
      deny: EXPOSURE.deny,
    },
    host: EXPOSURE.host,
    https: httpsOptions,
    proxy: serverProxy(),
  },
  preview: {
    port: CLIENT_PORT,
    host: EXPOSURE.host,
    https: httpsOptions,
  },
  build: {
    target: 'es2020',
  },
});
