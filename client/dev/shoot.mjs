/**
 * Photograph a worn screen, so it can be looked at without opening a browser.
 *
 *     node dev/shoot.mjs --dir=<packs> --screen=auction --out=/tmp/shot.png
 *
 * Starts nothing but the browser: point it at a dev server already running.
 * The page reads a whole build off disk before it draws, which takes as long
 * as it takes, so the shutter waits for the page to say it is ready rather
 * than for a timer. A photograph of a half-drawn screen is worse than none.
 *
 * Dev only. Drives the browser already on this machine over its own debug
 * port; adds no dependency.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

const args = Object.fromEntries(
  process.argv.slice(2).map(arg => {
    const [key, ...rest] = arg.replace(/^--/, '').split('=');
    return [key, rest.join('=') || 'yes'];
  }),
);

const browser = BROWSERS.find(path => existsSync(path));
if (!browser) {
  console.error('No browser found. Looked in:\n  ' + BROWSERS.join('\n  '));
  process.exit(1);
}
if (!args.dir) {
  console.error('Pass --dir=<absolute path to a directory holding res.bin>.');
  process.exit(1);
}

/** What this script reads itself; everything else is the bench's. */
const KNOWN = new Set([
  'dir',
  'screen',
  'app',
  'sheet',
  'mark',
  'debugPort',
  'port',
  'out',
  'size',
  'wait',
  'probe',
  'settle',
  'page',
  'ready',
]);

const debugPort = Number(args.debugPort ?? 9333);
const port = args.port ?? '8780';
const screen = args.screen ?? 'auction';
const out = args.out ?? `/tmp/worn-${screen}.png`;
const [width, height] = (args.size ?? '1400,1000').split(',').map(Number);
const patience = Number(args.wait ?? 120_000);
// Which page to point at. The bench by default; `--page=/dev/parts.html`
// for the one that names the parts of a piece.
const page = args.page ?? '/dev/worn.html';
const url =
  `http://localhost:${port}${page}` +
  `?dir=${encodeURIComponent(args.dir)}&screen=${encodeURIComponent(screen)}` +
  (args.app ? `&app=${encodeURIComponent(args.app)}` : '') +
  (args.sheet ? `&sheet=${encodeURIComponent(args.sheet)}` : '') +
  (args.mark ? `&mark=${encodeURIComponent(args.mark)}` : '') +
  // Anything else passed goes through to the bench as it was given: a
  // bench grows switches faster than this script should grow flags.
  Object.entries(args)
    .filter(([key]) => !KNOWN.has(key))
    .map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('');

/**
 * A browser profile of its own, thrown away afterwards.
 *
 * Each run is a fresh profile so nothing is carried between shots; left
 * behind they are 70MB apiece, and a few hundred shots fill a disk.
 */
const profile = mkdtempSync(join(tmpdir(), 'ubiquitous-shoot-'));
const sweep = () => {
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // A profile the browser still holds is cleaned up by the system.
  }
};
process.on('exit', sweep);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(1));

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    `--window-size=${width},${height}`,
    url,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let noise = '';
child.stderr.on('data', chunk => (noise += chunk));

const rest = async path => {
  const res = await fetch(`http://127.0.0.1:${debugPort}${path}`);
  return res.json();
};

const until = async (what, check) => {
  const deadline = Date.now() + patience;
  for (;;) {
    const got = await check().catch(() => null);
    if (got) return got;
    if (Date.now() > deadline) throw new Error(`gave up waiting for ${what}`);
    await new Promise(done => setTimeout(done, 250));
  }
};

/** One round trip on the debug socket. */
function speak(socket) {
  let next = 0;
  const waiting = new Map();
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    const settle = waiting.get(reply.id);
    if (!settle) return;
    waiting.delete(reply.id);
    reply.error ? settle.no(new Error(reply.error.message)) : settle.yes(reply.result);
  });
  return (method, params = {}) =>
    new Promise((yes, no) => {
      const id = ++next;
      waiting.set(id, { yes, no });
      socket.send(JSON.stringify({ id, method, params }));
    });
}

try {
  const page = await until('the browser', async () => {
    const targets = await rest('/json/list');
    return targets.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
  });

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((yes, no) => {
    socket.addEventListener('open', yes, { once: true });
    socket.addEventListener('error', () => no(new Error('debug socket refused')), { once: true });
  });
  const send = speak(socket);

  await send('Page.enable');
  // The bench says when it is ready; anything else is asked whatever the
  // caller says to ask — `--ready='...'` is a snippet that goes true when
  // the page is worth photographing.
  const asking = args.ready
    ? `(() => { try { return (${args.ready}) ? 'yes' : null } catch { return null } })()`
    : 'document.body.dataset.ready || document.body.innerText.slice(0, 200)';
  const ready = await until('the page to finish reading the build', async () => {
    const { result } = await send('Runtime.evaluate', {
      expression: asking,
      returnByValue: true,
    });
    return result.value === 'yes' ? 'yes' : null;
  }).catch(async err => {
    // Say what the page was showing when patience ran out: a bench that
    // cannot read the build should not look like a camera fault.
    const { result } = await send('Runtime.evaluate', {
      expression: 'document.body.innerText.slice(0, 300)',
      returnByValue: true,
    });
    throw new Error(`${err.message}. The page said: ${JSON.stringify(result.value)}`);
  });
  void ready;

  // Ask the page a question as well as photographing it: a screen that
  // looks wrong can say what it put where, instead of being measured off
  // a picture with a ruler.
  if (args.probe) {
    const { result } = await send('Runtime.evaluate', {
      expression: args.probe,
      returnByValue: true,
      awaitPromise: true,
    });
    console.log(typeof result.value === 'string' ? result.value : JSON.stringify(result.value));
  }

  // A screen that opens with an animation is still opening when it says
  // it is ready, and half an animation is not what anyone wants a picture
  // of. Wait a beat, unless the caller has asked not to.
  await new Promise(done => setTimeout(done, Number(args.settle ?? 400)));

  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(data, 'base64'));
  console.log(out);
} catch (err) {
  console.error(String(err.message ?? err));
  if (noise) console.error(noise.slice(-1500));
  process.exitCode = 1;
} finally {
  child.kill();
}
