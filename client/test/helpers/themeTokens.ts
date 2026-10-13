/**
 * The design tokens, read out of the stylesheet that defines them.
 *
 * Tests that care about a colour resolve it through here rather than
 * repeating the hex. A component names a token (`var(--color-channel-exp)`)
 * and this is what turns that name back into the value it will actually
 * render as — so the colour is pinned exactly once, in `theme.css`, and a
 * test cannot quietly disagree with the stylesheet.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const THEME = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src/ui/styles/theme.css',
);

const source = readFileSync(THEME, 'utf8');

/** Every `--color-*: #rrggbb` in the `@theme` block, keyed without the prefix. */
export const colours: Map<string, string> = new Map(
  [...source.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, name, hex]) => [
    name,
    hex.toLowerCase(),
  ]),
);

/** A token's colour, or a thrown error naming the one that is missing. */
export function colour(name: string): string {
  const found = colours.get(name);
  if (!found) throw new Error(`theme.css has no --color-${name}`);
  return found;
}

/** The whole stylesheet, for assertions about the token set itself. */
export const themeSource = source;
