/** Filling the interface strings' C-style holes and reading their colour markup; no user words here. */

/** What the user's strings write in place of `<` and `>`. */
const OPEN = '\x12';
const CLOSE = '\x13';

const HOLE = /%(?:\d+\$)?[-+ #0]*\d*(?:\.\d+)?(l{0,2}|h{1,2})([diouxXeEfgGcs%])/g;

/**
 * A sentence with its holes filled, in the order they are written.
 *
 * `%%` is not a hole; it is how the sentence spells a percent sign.
 */
export function fill(sentence: string, ...values: readonly (string | number)[]): string {
  let next = 0;
  return sentence.replace(HOLE, (whole, _size: string, kind: string) => {
    if (kind === '%') return '%';
    const value = values[next++];
    if (value === undefined) return whole;
    if (kind === 'x') return Number(value).toString(16);
    if (kind === 'X') return Number(value).toString(16).toUpperCase();
    return String(value);
  });
}

/** A run of a sentence, and the colour it is written in where it names one. */
export interface WordRun {
  text: string;
  /** A CSS colour, or undefined where the run takes the field's own. */
  colour?: string;
}

const TAG = new RegExp(`${OPEN}(/?)([a-z_]+)([^${CLOSE}]*)${CLOSE}?`, 'gi');
const COLOUR = /color\s*=\s*'?#?([0-9a-f]+)'?/i;

/** A sentence split into its coloured runs; showing the markup or stripping it would both be wrong. */
export function runs(sentence: string): WordRun[] {
  const pieces: WordRun[] = [];
  const open: string[] = [];
  let from = 0;
  const take = (text: string): void => {
    if (text) pieces.push({ text, colour: open[open.length - 1] });
  };
  for (const tag of sentence.matchAll(TAG)) {
    take(sentence.slice(from, tag.index));
    from = tag.index + tag[0].length;
    if (tag[1]) {
      open.pop();
      continue;
    }
    const said = COLOUR.exec(tag[3] ?? '');
    // A tag that names no colour still opens a run, so its closing tag
    // has something of its own to close.
    open.push(said ? `#${said[1]!.padStart(6, '0')}` : (open[open.length - 1] ?? ''));
  }
  take(sentence.slice(from));
  return pieces.map(run => (run.colour ? run : { text: run.text }));
}

/** Split a self-filled line into `marks` runs and the words between, each found once, left to right. */
export function markRuns(line: string, marks: readonly string[], colour: string): WordRun[] {
  const out: WordRun[] = [];
  let from = 0;
  for (const mark of marks) {
    const at = mark ? line.indexOf(mark, from) : -1;
    if (at < 0) continue;
    if (at > from) out.push({ text: line.slice(from, at) });
    out.push({ text: mark, colour });
    from = at + mark.length;
  }
  if (from < line.length) out.push({ text: line.slice(from) });
  return out;
}

/** A sentence with its markup taken off, for somewhere that draws one run. */
export function plain(sentence: string): string {
  return runs(sentence)
    .map(run => run.text)
    .join('');
}
