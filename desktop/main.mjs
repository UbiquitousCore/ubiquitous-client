import { app, BrowserWindow, Menu, net, protocol } from 'electron';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHOOSE_BUTTON, chooseGameFile } from './gameFile.mjs';
import { chooseServer, withServer } from './serverLine.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

// `localhost`, not a made-up host: the client rewrites a loopback server
// address to the page's own host, and only a loopback host leaves it alone.
const ORIGIN = 'app://localhost';

// Packaged, the built client sits beside the app's code; unpacked, it is the
// client's own build output.
const clientRoot = app.isPackaged
  ? path.join(process.resourcesPath, 'client')
  : path.join(here, '..', 'client', 'dist');

// Before `ready`: the packs live in OPFS and the page registers a service
// worker, and both need a secure origin that is not a file:// URL.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function savedServer() {
  try {
    return readFileSync(path.join(app.getPath('userData'), 'server.txt'), 'utf8');
  } catch {
    return undefined;
  }
}

function serveClient() {
  const server = chooseServer({ argv: process.argv, env: process.env, saved: savedServer() });
  protocol.handle('app', async request => {
    const { pathname } = new URL(request.url);
    const relative = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
    const file = path.normalize(path.join(clientRoot, relative));
    if (!file.startsWith(clientRoot + path.sep)) return new Response('Not found', { status: 404 });
    if (relative === '/config.txt') {
      const text = withServer(readFileSync(file, 'utf8'), server);
      return new Response(text, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// A file chosen in the window's picker is read where it lies; the page cannot
// be handed a path, so the file chooser is answered from here instead.
function answerFileChoosers(window, file) {
  const { webContents } = window;
  const debug = webContents.debugger;
  debug.attach('1.3');
  debug.on('message', (_event, method, params) => {
    if (method !== 'Page.fileChooserOpened' || params.backendNodeId === undefined) return;
    void debug.sendCommand('DOM.setFileInputFiles', {
      files: [file],
      backendNodeId: params.backendNodeId,
    });
  });
  // The client keeps a picked file only through showOpenFilePicker, whose
  // result carries no path to fill in; the plain input it falls back to does.
  // The picker is asked for long after the page's scripts have run, so
  // removing it once the document is ready is early enough.
  webContents.once('dom-ready', () => {
    void webContents.executeJavaScript('delete window.showOpenFilePicker');
  });
  // The debugger has no page to command until a navigation has begun.
  webContents.once('did-start-navigation', () => {
    void debug
      .sendCommand('Page.enable')
      .then(() => debug.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }));
  });
}

// Pressed for the player, once per button: the page refuses to open a chooser
// without a user gesture, which `executeJavaScript`'s second argument supplies.
function pressChooseButtons(window) {
  const press = `(() => {
    for (const button of document.querySelectorAll('button')) {
      if (${CHOOSE_BUTTON}.test(button.textContent.trim()) && !button.dataset.autofilled) {
        button.dataset.autofilled = '1';
        button.click();
      }
    }
  })()`;
  const timer = setInterval(() => {
    if (window.isDestroyed()) clearInterval(timer);
    else void window.webContents.executeJavaScript(press, true).catch(() => {});
  }, 1000);
}

function openWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    fullscreen: process.argv.includes('--fullscreen') || process.env.SteamDeck === '1',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      window.setFullScreen(!window.isFullScreen());
      event.preventDefault();
    }
  });
  const gameFile = chooseGameFile({
    argv: process.argv,
    env: process.env,
    folders: [path.join(app.isPackaged ? process.resourcesPath : here, 'game')],
  });
  if (gameFile) {
    answerFileChoosers(window, gameFile);
    pressChooseButtons(window);
  }
  void window.loadURL(`${ORIGIN}/index.html`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  serveClient();
  openWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow();
  });
});

app.on('window-all-closed', () => app.quit());
