/**
 * Ask every worn screen the questions a reviewer would, and print the
 * answers.
 *
 *     node dev/audit.mjs --dir=<a directory holding res.bin and tables.bin>
 *
 * The screens are read out of the shipped movie and driven by the screen
 * spec built from it, so most of what goes wrong with one goes wrong in
 * the same few ways: a word that never arrived, a placeholder that was
 * never meant to be read, a control with nothing behind it, something
 * drawn outside the picture it belongs to. Every one of those is a
 * question the page can answer about itself, and every one of them has
 * been found by eye at least once. This asks them instead.
 *
 * Exits non-zero on a finding, so it can be a gate rather than a habit.
 * Dev only; needs a build on disk and a dev server already running.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

if (!args.dir) {
  console.error('Pass --dir=<absolute path to a directory holding res.bin>.');
  process.exit(1);
}
const browser = BROWSERS.find(path => existsSync(path));
if (!browser) {
  console.error('No browser found. Looked in:\n  ' + BROWSERS.join('\n  '));
  process.exit(1);
}

const port = args.port ?? '8780';
const debugPort = Number(args.debugPort ?? 9444);
const patience = Number(args.wait ?? 120_000);

/**
 * Moving a thing from one store to the other, by the pointer.
 *
 * Every part of it is a place a drag has gone wrong before: a slot drawn
 * where the store has no room, a picture under the pointer that swallows
 * the drop, a window that resolves the slot but asks for the wrong one.
 * None of it shows up in a photograph, and the drag is only real if the
 * thing ends up where it was put.
 */
const DRAG = String.raw`
(async () => {
  const found = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const slot = name => document.querySelector('[data-drop-slot="' + name + '"]');
  const holds = one => !!(one && one.querySelector('img'));
  const middle = one => {
    const box = one.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  };
  const fire = (on, kind, at) => on.dispatchEvent(new PointerEvent(kind, {
    bubbles: true, cancelable: true, clientX: at.x, clientY: at.y,
    button: 0, buttons: 1, pointerId: 1, isPrimary: true,
  }));
  const drag = async (from, to) => {
    const a = middle(slot(from));
    const b = middle(slot(to));
    fire(slot(from), 'pointerdown', a);
    // Longer than the press has to hold still before it counts as a drag.
    await wait(300);
    fire(window, 'pointermove', { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    await wait(30);
    fire(window, 'pointermove', b);
    await wait(30);
    const under = document.elementFromPoint(b.x, b.y);
    const asked = under && under.closest('[data-drop-slot]');
    const reached = asked && asked.getAttribute('data-drop-slot');
    fire(window, 'pointerup', b);
    await wait(200);
    if (reached !== to) {
      found.push({ what: 'a drag reached the wrong slot', detail: from + ' to ' + to + ', landed on ' + reached });
      return false;
    }
    return true;
  };

  const named = Array.from(document.querySelectorAll('[data-drop-slot]'))
    .map(one => one.getAttribute('data-drop-slot'));
  const full = named.filter(name => holds(slot(name)));
  const bare = named.filter(name => !holds(slot(name)));
  const stores = [...new Set(named.map(name => name.split(':')[0]))];
  if (!stores.length || !full.length) {
    found.push({ what: 'a store with nothing to drag', detail: stores.join(', ') || 'no slots at all' });
    return JSON.stringify(found);
  }
  // Between the stores this screen shows, both ways, and within each one:
  // putting a thing somewhere else in the same bag is how it is tidied,
  // and it goes through the same drag.
  const pairs = [];
  for (const side of stores) for (const other of stores) pairs.push([side, other]);
  for (const [side, other] of pairs) {
    // Asked again each time: the drag before this one moved something,
    // and a list of what is where goes stale the moment it does.
    const now = Array.from(document.querySelectorAll('[data-drop-slot]'))
      .map(one => one.getAttribute('data-drop-slot'));
    const pictureless = now.find(
      name => name.startsWith(side + ':') && slot(name).getAttribute('title') && !holds(slot(name)),
    );
    const from =
      pictureless ?? now.find(name => name.startsWith(side + ':') && holds(slot(name)));
    const to = now.find(name => name.startsWith(other + ':') && !holds(slot(name)) && name !== from);
    if (!from || !to) continue;
    if (!(await drag(from, to))) continue;
    if (holds(slot(from)) || !holds(slot(to))) {
      found.push({ what: 'a drag put nothing down', detail: from + ' to ' + to });
    }
  }
  // Onto a slot that already holds something, which is most of them in a
  // bag anybody has been playing with. A drop there exchanges the two,
  // and refusing it is what made dragging look broken.
  const taken = Array.from(document.querySelectorAll('[data-drop-slot]'))
    .map(one => one.getAttribute('data-drop-slot'))
    .filter(name => holds(slot(name)));
  const one = taken[0];
  const two = taken.find(name => name !== one);
  if (one && two) {
    const came = slot(one).getAttribute('title');
    const wasThere = slot(two).getAttribute('title');
    if (await drag(one, two)) {
      // The two change places: the one dragged lands on the full slot and
      // what was there goes back where it came from.
      if (slot(two).getAttribute('title') !== came || slot(one).getAttribute('title') !== wasThere) {
        found.push({ what: 'a drop onto a full slot changed nothing', detail: one + ' to ' + two });
      }
    }
  }
  return JSON.stringify(found);
})()
`;

/**
 * Every screen worth asking about, and the states worth asking in.
 *
 * A state is a bench switch. A screen answers differently with a full
 * list and an empty one, and both are worth a look — an empty list is
 * where the marks that say a list runs on must not be drawn.
 */
const SCREENS = [
  { screen: 'auction', as: 'the market, asked', extra: 'searched=1' },
  { screen: 'auction', as: 'the market, unasked' },
  { screen: 'auction', as: 'the market, overfull', extra: 'searched=1&over=4' },
  { screen: 'storage', as: 'the strongbox' },
  { screen: 'storage', as: 'the strongbox, empty', extra: 'stored=0' },
  { screen: 'mail', as: 'the mailbox' },
  { screen: 'mail', as: 'the mailbox, one letter', extra: 'letters=1' },
  { screen: 'mail', as: 'the mailbox, carrying coin', extra: 'opened=0' },
  { screen: 'trade', as: 'the trading table' },
  { screen: 'trade', as: 'the trading table, settled', extra: 'confirmed=1' },
  { screen: 'mailWrite', as: 'writing a letter' },
  { screen: 'mailWrite', as: 'writing a letter, carrying', extra: 'money=1230456&carrying=3' },
  { screen: 'mailWrite', as: 'writing a letter, unaddressed', extra: 'to=0' },
  { screen: 'bag', as: 'the bag' },
  { screen: 'hud', as: 'the bag, opened during play', extra: 'showing=bag&stored=8', does: DRAG },
  { screen: 'bag', as: 'the bag, empty', extra: 'stored=0' },
  { screen: 'character', as: 'the character sheet' },
  { screen: 'itemList', as: 'choosing what to wear' },
  { screen: 'menu', as: 'the menu' },
  { screen: 'card', as: 'the card' },
  // Through the HUD, the way the client opens one during play: a window
  // reached that way goes through its container, off a store the session
  // set, with the art still arriving — a fault in that gap does not show
  // on a screen the bench draws on its own.
  {
    screen: 'hud',
    as: 'the strongbox, opened during play',
    extra: 'showing=storage&stored=6',
    does: DRAG,
  },
  { screen: 'hud', as: 'the mailbox, opened during play', extra: 'showing=mail&letters=3' },
  { screen: 'hud', as: 'the quest log, opened during play', extra: 'showing=quests' },
  { screen: 'hud', as: 'a quest, told by its giver', extra: 'showing=questTalk' },
  { screen: 'hud', as: 'what a giver has to offer', extra: 'showing=questAsk' },
  { screen: 'hud', as: 'the spell book, opened during play', extra: 'showing=spells' },
  { screen: 'hud', as: 'the people list, opened during play', extra: 'showing=social' },
  { screen: 'hud', as: 'the team screen, opened during play', extra: 'showing=team' },
  { screen: 'hud', as: "the vendor's window, opened during play", extra: 'showing=shop' },
  { screen: 'hud', as: 'an NPC talking', extra: 'showing=npcChat' },
  { screen: 'hud', as: 'an NPC with things to ask about', extra: 'showing=npcMenu' },
  { screen: 'hud', as: 'the settings, opened during play', extra: 'showing=options' },
  { screen: 'hud', as: "the vendor's other page", extra: 'showing=sell' },
];

/**
 * What the page is asked about itself.
 *
 * Runs in the page, so it is written as one string. Everything it knows
 * comes from the DOM it can see and the movie the bench exposes.
 */
const QUESTIONS = String.raw`
(() => {
  const found = [];
  const say = (what, detail) => found.push({ what, detail });

  const dialogs = Array.from(document.querySelectorAll('[role="dialog"], [role="menu"]'));
  if (!dialogs.length) return JSON.stringify([{ what: 'nothing drawn', detail: 'no screen on the page' }]);

  // The words themselves, before any screen is looked at. A build that
  // answered the question with no words at all leaves every caption on
  // every screen blank, and no screen can tell you why.
  if (Array.isArray(window.__words) && !window.__words.length) {
    say('no words read from the build', 'every caption on every screen is blank');
  }

  for (const dialog of dialogs) {
    const named = dialog.getAttribute('aria-label') || '(unnamed)';
    const on = dialog.getBoundingClientRect();

    // 1. A control nobody can name. Every button is either something a
    //    player can read or something a screen reader can.
    for (const button of dialog.querySelectorAll('button')) {
      const name = (button.getAttribute('aria-label') || button.textContent || '').trim();
      if (!name) say('control with no name', named);
    }

    // 2. Something drawn outside the picture it belongs to. The rows of a
    //    list ran past their own window this way.
    for (const span of dialog.querySelectorAll('span, img, button')) {
      const box = span.getBoundingClientRect();
      if (!box.width && !box.height) continue;
      const out =
        box.right < on.left - 1 ||
        box.left > on.right + 1 ||
        box.bottom < on.top - 1 ||
        box.top > on.bottom + 1;
      if (out) {
        const words = (span.textContent || '').trim().slice(0, 30);
        say('drawn outside the screen', named + ': ' + (span.tagName.toLowerCase()) + ' ' + words);
      }
    }

    // 3. A screen with nothing written on it. Every word on a worn
    //    screen is read out of the mounted build, so a build whose words
    //    never arrived draws every control blank — a whole session of
    //    buttons with nothing on them, and nothing else wrong.
    const written = Array.from(dialog.querySelectorAll('span')).filter(
      span => (span.textContent || '').trim(),
    );
    if (!written.length && dialog.querySelectorAll('button').length > 2) {
      say('screen with nothing written on it', named);
    }

    // 4. A picture the browser will drag off on its own. Pressing one
    //    and moving starts the browser's own picture drag, which cancels
    //    the pointer — and with it whatever drag the screen was running.
    //    It shows as the copy cursor for a moment and then nothing.
    for (const picture of dialog.querySelectorAll('img')) {
      if (picture.draggable) {
        say('a picture the browser will drag off', named + ': ' + (picture.alt || picture.src.slice(0, 30)));
      }
    }

    // 5. A word drawn over nothing: a field so small the words spill out
    //    of it reads as a screen that failed to lay itself out.
    for (const span of dialog.querySelectorAll('span')) {
      const words = (span.textContent || '').trim();
      if (!words) continue;
      const box = span.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) {
        say('words with nowhere to go', named + ': "' + words.slice(0, 30) + '"');
      }
    }
  }
  return JSON.stringify(found);
})()
`;

const rest = async path => (await fetch('http://127.0.0.1:' + debugPort + path)).json();

const until = async (what, check) => {
  const deadline = Date.now() + patience;
  for (;;) {
    const got = await check().catch(() => null);
    if (got) return got;
    if (Date.now() > deadline) throw new Error('gave up waiting for ' + what);
    await new Promise(done => setTimeout(done, 250));
  }
};

/**
 * Anything the page threw, kept until the screen it happened on is asked
 * about itself.
 *
 * A screen that throws while it is being used is the worst kind of fault
 * and the hardest to see in a photograph: the drawing that goes wrong is
 * the one under the pointer, and it takes the window it is in down with
 * it. Nothing else here would notice.
 */
const thrown = [];

function speak(socket) {
  let next = 0;
  const waiting = new Map();
  socket.addEventListener('message', event => {
    const reply = JSON.parse(event.data);
    if (reply.method === 'Runtime.exceptionThrown') {
      const said = reply.params.exceptionDetails;
      thrown.push(
        (said.exception && (said.exception.description || said.exception.value)) || said.text,
      );
      return;
    }
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

let findings = 0;
/**
 * The browser's own scratch directory, swept when this exits.
 *
 * A fresh one per run keeps runs from treading on each other; left
 * behind, a run costs a couple of hundred megabytes and a hundred of
 * them fill the disk — which is what they did.
 */
const profile = mkdtempSync(join(tmpdir(), 'ubiquitous-audit-'));
const sweep = () => {
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // A profile that will not go is not worth failing an audit over.
  }
};
process.on('exit', sweep);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    sweep();
    process.exit(1);
  });
}

const child = spawn(
  browser,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=' + profile,
    '--remote-debugging-port=' + debugPort,
    '--window-size=1400,1000',
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] },
);
let noise = '';
child.stderr.on('data', chunk => (noise += chunk));

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
  await send('Runtime.enable');

  for (const { screen, as, extra, does } of SCREENS) {
    const url =
      'http://localhost:' +
      port +
      '/dev/worn.html?dir=' +
      encodeURIComponent(args.dir) +
      '&screen=' +
      screen +
      (extra ? '&' + extra : '');
    await send('Page.navigate', { url });
    await until('"' + as + '" to draw', async () => {
      const { result } = await send('Runtime.evaluate', {
        expression: 'document.body.dataset.ready === "yes"',
        returnByValue: true,
      });
      return result.value === true ? 'yes' : null;
    });
    // A screen that opens with an animation is still opening when it says
    // it is ready, and half a layout answers the wrong thing.
    await new Promise(done => setTimeout(done, 400));
    const said = [];
    thrown.length = 0;
    // What only doing something can answer, before the still questions:
    // a drag leaves the screen as it found it, so the rest still holds.
    if (does) {
      const { result: acted } = await send('Runtime.evaluate', {
        expression: does,
        returnByValue: true,
        awaitPromise: true,
      });
      said.push(...JSON.parse(acted.value || '[]'));
    }
    const { result } = await send('Runtime.evaluate', {
      expression: QUESTIONS,
      returnByValue: true,
    });
    said.push(...JSON.parse(result.value || '[]'));
    // Whatever the page threw while this screen was open, said once per
    // distinct message however many times it happened.
    for (const message of new Set(thrown)) {
      said.push({ what: 'the page threw', detail: String(message).split('\n')[0] });
    }
    if (!said.length) {
      console.log('  ok  ' + as);
      continue;
    }
    findings += said.length;
    console.log('FAIL  ' + as);
    for (const { what, detail } of said) console.log('        ' + what + ' — ' + detail);
  }
} catch (err) {
  console.error(String(err.message ?? err));
  if (noise) console.error(noise.slice(-1500));
  findings += 1;
} finally {
  child.kill();
}

console.log(findings ? '\n' + findings + ' finding(s)' : '\nno findings');
process.exitCode = findings ? 1 : 0;
