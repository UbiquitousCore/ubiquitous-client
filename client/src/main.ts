/**
 * Entry point. Finds the DOM the shell provides, builds the Game, starts it.
 * Everything else lives behind Game.
 */

import './ui/styles/global.css';
import { mountUiTextures } from './ui/styles/uiTextures';
import { loadConfig } from './core/config';
import { adminPanelWanted, loadFileConfig, overrideFileConfig, serverFromQuery } from './core/FileConfig';
import { Game } from './app/Game';
import { logger } from './core/log';

// Before anything renders, so no surface paints once bare and once dressed.
mountUiTextures();

function element<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`index.html is missing #${id}`);
  return el as T;
}

const log = logger('ui');

/** Log uncaught throws from control handlers, which nothing in the interface catches. */
function sayWhatFell(): void {
  addEventListener('error', event => {
    // The browser's own note that a round of measuring did not settle
    // inside one frame. Nothing threw, nothing is broken, and every
    // page that measures anything sees it — said out loud it reads like
    // a fault and hides the ones that are.
    if (event.message?.startsWith('ResizeObserver loop')) return;
    const said = event.error instanceof Error ? event.error.stack : event.message;
    log.error(`something threw: ${said ?? 'no reason given'}`);
  });
  addEventListener('unhandledrejection', event => {
    const said = event.reason instanceof Error ? event.reason.stack : String(event.reason);
    log.error(`a promise was refused: ${said}`);
  });
}

async function boot(): Promise<void> {
  sayWhatFell();
  const fileCfg = await loadFileConfig();

  // Query string overrides win over file config.
  const q = new URLSearchParams(window.location.search);
  if (q.get('debug') === '1') fileCfg.debug = true;
  if (q.get('debug') === '0') fileCfg.debug = false;
  fileCfg.admin = adminPanelWanted(fileCfg.admin, q.get('admin'), import.meta.env.DEV);
  // Somewhere else to dial, without touching the file: a second server stood
  // up beside the one this client is pointed at. Development builds only, and
  // loopback only, so a link cannot redirect a released client's sign-in.
  const elsewhere = serverFromQuery(q.get('server'), import.meta.env.DEV);
  if (elsewhere.asked) fileCfg.server = elsewhere.server;
  overrideFileConfig(fileCfg);

  const game = new Game(
    {
      canvas: element<HTMLCanvasElement>('view'),
      hud: element('debug-hud'),
      gameHud: element('hud'),
      boot: element('boot'),
    },
    loadConfig(window.location.search),
    fileCfg,
  );

  await game.start();

  // Dev-only handle for debugging from the console.
  if (import.meta.env.DEV) {
    (window as unknown as { __game: Game }).__game = game;
  }
}

void boot();

// Vite HMR would otherwise leak a WebGL context and a frame loop per edit.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // dispose is handled by the game instance captured in boot()
  });
}
