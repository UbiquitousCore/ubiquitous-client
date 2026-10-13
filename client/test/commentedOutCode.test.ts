/**
 * No block comment swallows code: a lost `*​/` hides everything to the next
 * one from TypeScript, silently switching behaviour off.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const CLIENT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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

const sources = walk(SRC, /\.tsx?$/);

/** Every block comment in a file, with the line it starts on. */
function blockComments(text: string): Array<{ at: number; body: string }> {
  const found: Array<{ at: number; body: string }> = [];
  for (const match of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    found.push({ at: text.slice(0, match.index).split('\n').length, body: match[0] });
  }
  return found;
}

/**
 * Whether a line inside a comment looks like code rather than prose.
 *
 * A statement ends in a semicolon or opens a block, and neither happens
 * in a sentence — except in a sentence quoting one, so a line already
 * marked as comment text with a leading asterisk does not count.
 */
function looksLikeCode(line: string): boolean {
  const bare = line.trim();
  if (!bare || bare.startsWith('*') || bare.startsWith('//')) return false;
  return /[;{}]$/.test(bare);
}

describe('no source file hides code in a comment', () => {
  it('has no block comment holding statements', () => {
    const offenders: string[] = [];
    for (const file of sources) {
      const text = readFileSync(file, 'utf8');
      for (const comment of blockComments(text)) {
        const swallowed = comment.body.split('\n').filter(looksLikeCode);
        // One line is prose that happens to end in a brace; a run of them
        // is a comment that ate something.
        if (swallowed.length > 1) {
          offenders.push(
            `${path.relative(CLIENT, file)}:${comment.at} — ${swallowed.length} statements, ` +
              `starting ${swallowed[0]!.trim().slice(0, 50)!}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
