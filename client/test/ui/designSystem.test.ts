import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { colours } from '../helpers/themeTokens';

/**
 * The standing audit: fail on patterns that mean a value escaped the theme.
 * What the tokens should be is `theme.contrast.test.ts`.
 */

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(CLIENT, 'src');
const STYLES = path.join(SRC, 'ui/styles');

function walk(dir: string, match: RegExp): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full, match));
    else if (match.test(entry)) found.push(full);
  }
  return found;
}

/**
 * A path as this file writes them, with forward slashes on every platform.
 *
 * `path.relative` answers in the host's own separator, and on Windows that
 * quietly turned every exception below into a key nothing matched: the
 * allow-list stopped working and the audit failed on files it was written to
 * permit.
 */
const relative = (file: string): string => path.relative(CLIENT, file).split(path.sep).join('/');

const sources = walk(SRC, /\.tsx?$/);
const stylesheets = walk(SRC, /\.css$/);

/**
 * Files allowed to name a colour outside `theme.css`, and why.
 *
 * Each of these is a value the design system does not own. Adding to this list
 * is a decision, which is the point of it being a list.
 */
const COLOUR_EXCEPTIONS = new Map<string, string>([
  [
    'src/renderer/nameLabels.ts',
    'nameplate colours consumed by three.js in world space, pinned by the renderer tests',
  ],
  ['src/app/DebugTools.ts', 'a devtools `console.group` tint, which is not rendered to anyone'],
]);

describe('the design system holds', () => {
  it('keeps every colour in theme.css', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const name = relative(file);
      if (COLOUR_EXCEPTIONS.has(name)) continue;
      const hex = readFileSync(file, 'utf8').match(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g);
      if (hex) offenders.push(`${name}: ${[...new Set(hex)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('writes no arbitrary Tailwind colour', () => {
    // `text-[#667085]` is a colour that no longer answers to the theme.
    const offenders: string[] = [];
    for (const file of [...sources, ...stylesheets]) {
      const found = readFileSync(file, 'utf8').match(
        /\b(?:text|bg|border|fill|stroke|ring|shadow|from|to|via)-\[[^\]]*#/g,
      );
      if (found) offenders.push(`${relative(file)}: ${found.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('names only colour tokens that exist', () => {
    // Tailwind emits nothing for an unknown colour like `text-ink-300`, so the
    // element silently inherits. Only families the theme owns are checked.
    const families = new Set([...colours.keys()].map(name => name.split('-')[0]));
    const utility =
      /\b(?:text|bg|border|fill|stroke|ring|caret|accent|outline|decoration|from|via|to)-([a-z][a-z0-9]*(?:-[a-z0-9]+)*)/g;

    const offenders: string[] = [];
    for (const file of [...sources, ...stylesheets]) {
      const named = new Set<string>();
      for (const [, name] of readFileSync(file, 'utf8').matchAll(utility)) {
        if (!families.has(name.split('-')[0])) continue;
        if (!colours.has(name)) named.add(name);
      }
      if (named.size > 0) offenders.push(`${relative(file)}: ${[...named].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps custom CSS to the shell and the tokens', () => {
    // Two files: the design system, and the four elements `index.html` owns.
    // A third is where component CSS starts accumulating again.
    expect(stylesheets.map(relative).sort()).toEqual([
      'src/ui/styles/base.css',
      'src/ui/styles/global.css',
      'src/ui/styles/theme.css',
    ]);
  });

  it('uses !important only to honour a request for less movement', () => {
    const offenders: string[] = [];
    for (const file of [...sources, ...stylesheets]) {
      const text = readFileSync(file, 'utf8');
      if (!text.includes('!important')) continue;
      // The reduced-motion killswitch has to outrank every animation, which
      // is the one thing specificity cannot express.
      const allowed =
        relative(file) === 'src/ui/styles/base.css' && text.includes('prefers-reduced-motion');
      if (!allowed) offenders.push(relative(file));
    }
    expect(offenders).toEqual([]);
  });

  it('leaves no selector for a class no component writes', () => {
    // Custom CSS may address the shell by id, and nothing else: a class
    // selector here is a rule that some component has to remember to opt into,
    // which is how dead CSS survives a refactor.
    const offenders: string[] = [];
    for (const file of stylesheets) {
      const css = readFileSync(file, 'utf8');
      // Strip the utility strings inside `@apply`, which are not selectors.
      const withoutApply = css.replace(/@apply[^;]+;/g, '');
      const classes = withoutApply.match(/^\s*\.[a-zA-Z][\w-]*/gm);
      if (classes) offenders.push(`${relative(file)}: ${classes.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('keeps @apply to the shell, where there is no call site to style at', () => {
    // `@apply` in a component stylesheet is a Tailwind class list with a name
    // nobody can search for. The shell elements are the exception: they belong
    // to `index.html`, and no component mounts early enough to class them.
    const offenders: string[] = [];
    for (const file of stylesheets) {
      if (!readFileSync(file, 'utf8').includes('@apply')) continue;
      if (relative(file) !== 'src/ui/styles/base.css') offenders.push(relative(file));
    }
    expect(offenders).toEqual([]);
  });

  it('spells the layering model in names rather than numbers', () => {
    // A bare `z-40` in a component is a claim about every other element on the
    // page, made without looking at any of them.
    const offenders: string[] = [];
    for (const file of sources) {
      // `z-10` is allowed: it orders siblings inside one component's own
      // stacking context, which is a local statement, not a global one.
      const found = readFileSync(file, 'utf8').match(/(?<![\w-])z-(?!10\b)\d+/g);
      if (found) offenders.push(`${relative(file)}: ${[...new Set(found)].join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('gives every material an art slot, so a texture can be dropped in', () => {
    // The whole point of a `surface-*` utility is that the tint and the art
    // are separable: a material that baked its image in could not be
    // re-skinned without editing the utility, which is the thing these exist
    // to avoid.
    const theme = readFileSync(path.join(STYLES, 'theme.css'), 'utf8');
    const materials = [...theme.matchAll(/@utility (surface-[a-z-]+) \{([^}]*)\}/g)];
    expect(materials.length).toBeGreaterThan(0);
    for (const [, name, body] of materials) {
      expect(body, `${name} names no --texture-* slot`).toContain('var(--texture-');
      // And the tint is a token too, not a colour written into the utility.
      expect(body, `${name} sets a colour of its own`).not.toMatch(/#[0-9a-fA-F]{3}/);
    }
  });

  it("paints a material's art behind its words, never over them", () => {
    // A `surface-*` utility lays its texture in a `::before` covering the whole
    // box. At a positive z-index that overlay paints above the element's own
    // in-flow text, which is unreadable rather than merely tinted — the dark
    // button face put its art over the label at 80% opacity and the label went
    // with it. The pairing that keeps it right is `isolation: isolate` on the
    // face (so a negative index stops at the button's own background instead
    // of sinking through it) plus a negative index on the overlay.
    const theme = readFileSync(path.join(STYLES, 'theme.css'), 'utf8');
    const materials = [...theme.matchAll(/@utility (surface-[a-z-]+) \{([\s\S]*?)\n\}/g)];
    expect(materials.length).toBeGreaterThan(0);
    for (const [, name, body] of materials) {
      if (!body.includes('&::before')) continue;
      const index = body.match(/z-index:\s*(-?\d+)/);
      expect(index, `${name} layers an overlay without saying where`).not.toBeNull();
      expect(Number(index![1]), `${name} paints its texture over its own text`).toBeLessThan(0);
      expect(body, `${name} needs isolation for a negative index to stop here`).toContain(
        'isolation: isolate',
      );
    }
  });

  it('leaves every art slot empty, so the repository ships no texture', () => {
    // A slot with a URL in it is a texture committed to the tree. The art is
    // the user's to supply; these stay `none` until they set one.
    // Comments stripped first: the block above each slot shows how to set one,
    // and an example in prose is not a declaration.
    const theme = readFileSync(path.join(STYLES, 'theme.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    for (const [, name, value] of theme.matchAll(/--(texture-[a-z-]+):\s*([^;]+);/g)) {
      if (name === 'texture-size' || name === 'texture-repeat') continue;
      expect(value.trim(), `--${name} ships with art in it`).toBe('none');
    }
  });

  it('names the whole design system where IntelliSense can see it', () => {
    // Tokens declared outside `@theme` are variables, not utilities: they do
    // not autocomplete, so nobody discovers them and everybody re-invents them.
    const theme = readFileSync(path.join(STYLES, 'theme.css'), 'utf8');
    const block = theme.slice(theme.indexOf('@theme'), theme.lastIndexOf('}'));
    for (const namespace of [
      '--color-',
      '--font-',
      '--text-',
      '--spacing-',
      '--radius-',
      '--shadow-',
      '--texture-',
      '--text-shadow-',
      '--animate-',
    ]) {
      expect(block, `no ${namespace}* tokens in @theme`).toContain(namespace);
    }
  });
});
