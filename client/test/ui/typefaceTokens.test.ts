/**
 * Every word the client draws asks for the build's typefaces first.
 *
 * The build's typefaces are registered under fixed names by
 * `core/lettering.ts`. They only show where something asks for those
 * names, so this walks the source for anything that asks for a different
 * one: a stylesheet token, a component naming a family inline, a canvas
 * given a font string of its own.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { BODY_STACK, TITLE_STACK } from '../../src/core/lettering';
import { themeSource } from '../helpers/themeTokens';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(CLIENT, 'src');

function walk(dir: string, match: RegExp): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full, match));
    else if (match.test(entry)) found.push(full);
  }
  return found;
}

const relative = (file: string): string => path.relative(CLIENT, file).split(path.sep).join('/');
const squash = (value: string): string => value.replace(/\s+/g, ' ').trim();

const sources = walk(SRC, /\.tsx?$/);
const stylesheets = walk(SRC, /\.css$/);

/** Readouts for the developer, not part of the game's own interface, and monospaced on purpose. */
const MONOSPACE_ALLOWED = new Set(['src/ui/Hud.ts', 'src/ui/AdminPanel.ts']);

/** Tailwind's weight utilities: the other half of what a `font-*` class can be. */
const WEIGHTS = [
  'thin',
  'extralight',
  'light',
  'normal',
  'medium',
  'semibold',
  'bold',
  'extrabold',
  'black',
];

/** The one file that may spell a family out: it is where the stacks are defined. */
const STACK_HOME = 'src/core/lettering.ts';

describe('the stylesheet’s typefaces', () => {
  const tokens = new Map(
    [...themeSource.matchAll(/--font-([a-z0-9-]+):([^;]+);/g)].map(([, name, value]) => [
      name,
      squash(value),
    ]),
  );

  it('defines a body and a title token', () => {
    expect(tokens.get('chrome')).toBe(BODY_STACK);
    expect(tokens.get('title')).toBe(TITLE_STACK);
  });

  it('starts the document in the body token, not Tailwind’s sans stack', () => {
    expect(/--default-font-family:\s*([^;]+);/.exec(themeSource)?.[1]).toBe('var(--font-chrome)');
  });

  it('resolves every font token to the build’s faces, falling back exactly as a canvas does', () => {
    expect(tokens.size).toBeGreaterThan(0);
    for (const [name, value] of tokens) {
      expect([BODY_STACK, TITLE_STACK], `--font-${name}`).toContain(value);
    }
  });

  it('declares no family anywhere but through a token', () => {
    for (const file of stylesheets) {
      const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css, relative(file)).not.toMatch(/(^|[\s;{])font(-family)?\s*:/m);
    }
  });
});

describe('components and canvases', () => {
  it('name no family of their own', () => {
    const family =
      /['"`](?:[^'"`]*,\s*)?(?:serif|sans-serif|monospace|system-ui|Georgia|Arial|Helvetica|Verdana|Times New Roman)\b/;
    for (const file of sources) {
      if (relative(file) === STACK_HOME) continue;
      const code = readFileSync(file, 'utf8');
      expect(code, relative(file)).not.toMatch(family);
      expect(code, relative(file)).not.toMatch(/fontFamily:\s*['"`]/);
    }
  });

  it('use no family class but the theme’s two, save the developer readouts', () => {
    // A `font-*` class is a weight or a family. A family the theme does not
    // define is either Tailwind's own stack or no rule at all — both draw
    // in something other than the build's typefaces.
    const allowed = new Set([...WEIGHTS, 'chrome', 'title']);
    for (const file of sources) {
      const code = readFileSync(file, 'utf8');
      for (const [, name] of code.matchAll(/["'`\s]font-([a-z-]+)\b/g)) {
        if (name === 'mono' && MONOSPACE_ALLOWED.has(relative(file))) continue;
        expect(allowed, `font-${name} in ${relative(file)}`).toContain(name);
      }
    }
  });

  it('set every canvas font through the body stack', () => {
    const setters = sources.filter(file => /\.font\s*=(?!=)/.test(readFileSync(file, 'utf8')));
    expect(setters.length).toBeGreaterThan(0);
    for (const file of setters) {
      expect(readFileSync(file, 'utf8'), relative(file)).toMatch(/\bcanvasFont\b/);
    }
  });
});
