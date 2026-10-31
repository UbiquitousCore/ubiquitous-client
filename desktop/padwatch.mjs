// Prints the controller as the running window sees it, whenever it changes.
//
//   node desktop/padwatch.mjs [port]
//
// The window must have been started with --remote-debugging-port=<port>
// (default 9333). From another machine, forward the port first:
//   ssh -N -L 9333:localhost:9333 <user>@<host>

const port = process.argv[2] ?? '9333';
const BUTTONS = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'Back',
  'Start',
  'L3',
  'R3',
  'Up',
  'Down',
  'Left',
  'Right',
  'Guide',
];
const AXES = ['LX', 'LY', 'RX', 'RY'];

const targets = await (await fetch(`http://localhost:${port}/json`)).json();
const page = targets.find(t => t.type === 'page');
if (!page) throw new Error('no page to watch: is the window running with --remote-debugging-port?');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => (socket.onopen = resolve));
let nextId = 0;
const waiting = new Map();
socket.onmessage = message => {
  const reply = JSON.parse(message.data);
  waiting.get(reply.id)?.(reply.result?.result?.value);
};
const evaluate = expression =>
  new Promise(resolve => {
    const id = ++nextId;
    waiting.set(id, resolve);
    socket.send(
      JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }),
    );
  });

const read = `JSON.stringify([...navigator.getGamepads()].filter(Boolean).map(p => ({
  id: p.id, mapping: p.mapping, buttons: p.buttons.map(b => Math.round(b.value * 100) / 100),
  pressed: p.buttons.map(b => b.pressed), axes: p.axes.map(a => Math.round(a * 100) / 100),
})))`;

let last = '';
console.log('Press buttons on the controller. Ctrl+C to stop.');
for (;;) {
  const pads = JSON.parse((await evaluate(read)) ?? '[]');
  const line = pads.length
    ? pads
        .map(pad => {
          const down = pad.buttons
            .map((value, i) => (pad.pressed[i] || value > 0.5 ? `${BUTTONS[i] ?? `b${i}`}` : null))
            .filter(Boolean);
          const moved = pad.axes
            .map((value, i) => (Math.abs(value) > 0.18 ? `${AXES[i] ?? `a${i}`}=${value}` : null))
            .filter(Boolean);
          return `[${pad.mapping || 'NO MAPPING'}] ${pad.id.slice(0, 40)} | down: ${down.join(' ') || '-'} | axes: ${moved.join(' ') || '-'}`;
        })
        .join('\n')
    : 'no controller seen (press a button first: browsers hide a pad until one is touched)';
  if (line !== last) console.log(line);
  last = line;
  await new Promise(resolve => setTimeout(resolve, 80));
}
