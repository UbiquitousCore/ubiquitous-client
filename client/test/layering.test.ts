/**
 * The layering in AGENTS.md §3, held against every import in `src/`: a layer
 * imports only from the layers it is allowed to, readers stay behind the
 * asset boundary, and Three.js stays in the renderer.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

/** What each layer may import, besides itself. `app` wires everything and is not listed. */
const MAY_IMPORT: Readonly<Record<string, readonly string[]>> = {
  core: [],
  assets: ['core'],
  audio: ['assets', 'core'],
  // The renderer diffs the world's entities and tiles, so it reads the world's types.
  renderer: ['assets', 'core', 'world'],
  world: ['assets', 'core'],
  net: ['core', 'world'],
  gameplay: ['assets', 'core', 'net', 'renderer', 'world'],
  ui: ['assets', 'core', 'gameplay', 'net'],
};

/** Imports that break the table and are known to. Each is a debt with a reason, not a licence. */
const KNOWN_UPWARD: ReadonlySet<string> = new Set([
  // Pure window geometry both the HUD and the app's composite need; it sits by `TILE_SIZE`.
  'ui/hudStore.ts -> world/minimap',
  'ui/components/ArtMinimap.tsx -> world/minimap',
  'ui/components/minimapMarks.ts -> world/minimap',
  // The HUD publishes the rectangle its windows cover; only the type is shared.
  'ui/hudStore.ts -> renderer/viewCentre',
]);

/** The parts of `assets/` that know a format, a pack or a Worker; `app` alone mounts them. */
const BEHIND_THE_BOUNDARY = /^assets\/(formats|vfs|providers|worker|cache)\//;

function walk(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

interface Import {
  /** The importing file, relative to `src/`. */
  from: string;
  /** A package name, or the imported module relative to `src/`, without extension. */
  to: string;
  external: boolean;
}

function importsOf(file: string): Import[] {
  const from = path.relative(SRC, file).split(path.sep).join('/');
  const text = readFileSync(file, 'utf8');
  const found: Import[] = [];
  const pattern =
    /^\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]/gm;
  for (const match of text.matchAll(pattern)) {
    const spec = match[1] ?? match[2] ?? match[3]!;
    if (!spec.startsWith('.')) {
      found.push({ from, to: spec, external: true });
      continue;
    }
    const to = path
      .relative(SRC, path.resolve(path.dirname(file), spec))
      .split(path.sep)
      .join('/');
    found.push({ from, to, external: false });
  }
  return found;
}

const layerOf = (module: string): string => module.split('/')[0]!;

const imports = walk(SRC).flatMap(importsOf);

describe('layering', () => {
  it('reads imports at all', () => {
    expect(imports.length).toBeGreaterThan(1000);
    expect(imports.some(i => i.from === 'renderer/Renderer.ts' && i.to === 'three')).toBe(true);
  });

  it('lets a layer import only from the layers beneath it', () => {
    const upward: string[] = [];
    for (const { from, to, external } of imports) {
      if (external) continue;
      const layer = layerOf(from);
      const allowed = MAY_IMPORT[layer];
      const target = layerOf(to);
      if (!allowed || target === layer || allowed.includes(target)) continue;
      const edge = `${from} -> ${to}`;
      if (!KNOWN_UPWARD.has(edge)) upward.push(edge);
    }
    expect(upward).toEqual([]);
  });

  it('lists no exception that has since been fixed', () => {
    const edges = new Set(imports.filter(i => !i.external).map(i => `${i.from} -> ${i.to}`));
    expect([...KNOWN_UPWARD].filter(edge => !edges.has(edge))).toEqual([]);
  });

  it('keeps readers, packs and providers behind the asset boundary', () => {
    const reachedIn = imports
      .filter(i => !i.external && layerOf(i.to) === 'assets')
      .filter(i => !['assets', 'app'].includes(layerOf(i.from)))
      .filter(i => BEHIND_THE_BOUNDARY.test(i.to))
      .map(i => `${i.from} -> ${i.to}`);
    expect(reachedIn).toEqual([]);
  });

  it('keeps Three.js in the renderer', () => {
    const outside = imports
      .filter(i => i.external && (i.to === 'three' || i.to.startsWith('three/')))
      .filter(i => layerOf(i.from) !== 'renderer')
      .map(i => i.from);
    expect(outside).toEqual([]);
  });
});
