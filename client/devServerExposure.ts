/**
 * Decides which network interface the dev and preview servers listen on, and
 * which directories outside the project they may serve.
 *
 * - The server listens on localhost unless `UBIQUITOUS_LAN=1`.
 * - `UBIQUITOUS_PACK_DIR` (several directories separated by `;`) lets the dev pages
 *   read the user's extracted packs or `.ipa` folder over `/@fs/`.
 * - Serving those directories to the whole LAN takes a third switch,
 *   `UBIQUITOUS_LAN_PACKS=1`. Without it the combination is refused rather than
 *   quietly allowed or quietly dropped.
 * - Some files are never served, wherever they sit: environment files,
 *   certificates and keys, and git's own directory. Game data (`.ipa`,
 *   `.bin`, the kinds of file an unpacked `.ipa` holds, and this checkout's
 *   own `.cache/` and `work/` folders) is refused too, until
 *   `UBIQUITOUS_PACK_DIR` opts in, because the dev pages read exactly those files
 *   from the pack directories. Only the project and the pack directories are
 *   served at all, so opting in serves game data from nowhere else.
 */
export interface DevServerExposure {
  /** `true` binds every interface; a string binds that host only. */
  host: true | 'localhost';
  packDirs: string[];
  /** Globs the dev server refuses to serve, checked before anything it allows. */
  deny: string[];
}

const ALWAYS_DENIED = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**'];
/** The kinds of file an unpacked `.ipa` holds, loose or inside its packs. */
const UNPACKED_KINDS = [
  'bdae',
  'tbl',
  'tga',
  'pvr',
  'trn',
  'msk',
  'shw',
  'itm',
  'wld',
  'phy',
  'beff',
  'swf',
  'wav',
  'caf',
  'mp3',
  'plist',
  'nib',
  'strings',
  'bar',
  'ttf',
  'otf',
];

/**
 * Game data the dev server refuses until a pack directory is named. The two
 * folders are anchored inside `repo`: a pattern matching any folder of that
 * name would also match a parent directory the checkout sits in, and refuse
 * the whole project.
 */
function packData(repo: string): string[] {
  const repoGlob = repo.replaceAll('\\', '/');
  return [
    `${repoGlob}/**/work/**`,
    `${repoGlob}/**/.cache/**`,
    '**/*.ipa',
    '**/*.bin',
    `**/*.{${UNPACKED_KINDS.join(',')}}`,
  ];
}

export function devServerExposure(
  env: Record<string, string | undefined>,
  repo: string,
): DevServerExposure {
  const lan = env.UBIQUITOUS_LAN === '1';
  const packDirs = (env.UBIQUITOUS_PACK_DIR ?? '')
    .split(';')
    .map(d => d.trim())
    .filter(Boolean);

  if (lan && packDirs.length > 0 && env.UBIQUITOUS_LAN_PACKS !== '1') {
    throw new Error(
      'UBIQUITOUS_LAN=1 with UBIQUITOUS_PACK_DIR set would serve your game files to the whole network. ' +
        'Unset one of them, or also set UBIQUITOUS_LAN_PACKS=1 if that is what you want.',
    );
  }

  const deny = packDirs.length > 0 ? ALWAYS_DENIED : [...ALWAYS_DENIED, ...packData(repo)];
  return { host: lan ? true : 'localhost', packDirs, deny };
}
