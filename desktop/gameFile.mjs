import { readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The game file to hand the boot screen: `--ipa=` first, then the
 * environment, then the first `.ipa` in a folder the app was built with.
 * Null when none is named, which leaves the player to choose one.
 */
export function chooseGameFile({ argv, env, folders, list = readdirSync }) {
  const flag = argv.find(a => a.startsWith('--ipa='));
  const named = (flag?.slice('--ipa='.length) ?? env.UBIQUITOUS_IPA)?.trim();
  if (named) return named;
  for (const folder of folders) {
    let names;
    try {
      names = list(folder);
    } catch {
      continue;
    }
    const found = names.filter(n => /\.ipa$/i.test(n)).sort()[0];
    if (found) return path.join(folder, found);
  }
  return null;
}

/** The boot screen's button for choosing the game file, as opposed to any other button. */
export const CHOOSE_BUTTON = /^choose game file/i;
