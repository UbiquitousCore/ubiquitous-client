/**
 * Every named part of one shipped piece, outlined and listed, so a thing on
 * screen can be called by name. Dev only:
 *
 *     http://localhost:8792/dev/parts.html?dir=<build>&dialog=MCToolBar
 *
 * `?dialog=` names any piece; `?movie=LGM` reads the front end's movie.
 * Hover lights a part; pressing keeps it lit and prints its path.
 */

import { render } from 'preact';
import type { JSX } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { PackAssetProvider } from '../src/assets/providers/PackAssetProvider';
import { uiIconId, uiSkinId, uiStringsId } from '../src/assets/ids';
import type { UiMovie } from '../src/assets/ids';
import type { UiSkinArt, UiSkinData } from '../src/assets/types';
import { drawPiece } from '../src/ui/art/pieceCanvas';
import { planArt, planPiece } from '../src/ui/art/piecePlan';
import type { PiecePart } from '../src/ui/art/piecePlan';
import '../src/ui/styles/global.css';

const params = new URLSearchParams(location.search);
const DIR = params.get('dir') ?? '';
const APP = params.get('app') ?? '';
const PACKS = (params.get('packs') ?? 'res.bin,tables.bin').split(',').filter(Boolean);
/** How many pixels a movie unit is drawn at here. */
const SCALE = Number(params.get('scale') ?? 3);
/** Which movie to read the piece out of: `LGM` for the screens before the world. */
const MOVIE = (params.get('movie') ?? 'IGM') as UiMovie;
/** Which face of a part to draw, as `?face=<part>:<number>`, repeatable. */
const FACES = Object.fromEntries(
  (params.getAll('face') ?? []).map(one => {
    const [where, at] = one.split(':');
    return [where ?? '', Number(at ?? 0)];
  }),
);

/** Every name the movie places anything under, for the picker. */
function namesIn(skin: UiSkinData): string[] {
  const names = new Set<string>();
  for (const sprite of skin.sprites) {
    for (const frame of sprite.frames) {
      for (const placed of frame) if (placed.name) names.add(placed.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function Parts(): JSX.Element {
  const [note, setNote] = useState('Reading the build…');
  const [skin, setSkin] = useState<UiSkinData | null>(null);
  const [art, setArt] = useState<Map<string, UiSkinArt>>(new Map());
  const [dialog, setDialog] = useState(params.get('dialog') ?? 'MCToolBar');
  const [lit, setLit] = useState<string | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    void (async () => {
      if (!DIR) {
        setNote('Pass ?dir=<absolute path to a directory holding res.bin>.');
        return;
      }
      const provider = new PackAssetProvider();
      const files: File[] = [];
      for (const name of APP ? [APP] : PACKS) {
        const got = await fetch(`/@fs/${DIR}/${name}`).catch(() => null);
        if (!got?.ok) continue;
        const blob = await got.blob();
        if (blob.type.startsWith('text/')) continue;
        files.push(new File([blob], name));
      }
      if (!files.length) {
        setNote(`Nothing to mount from ${DIR}.`);
        return;
      }
      await provider.useSource(provider.offer(files).id);
      const loaded = await provider.load(uiSkinId(MOVIE));
      await provider.load(uiStringsId()).catch(() => []);
      setSkin(loaded);
      setNote('');
    })();
  }, []);

  // The sheets this piece is drawn from, fetched as it is asked for.
  useEffect(() => {
    if (!skin) return;
    void (async () => {
      const provider = new PackAssetProvider();
      const files: File[] = [];
      for (const name of APP ? [APP] : PACKS) {
        const got = await fetch(`/@fs/${DIR}/${name}`).catch(() => null);
        if (got?.ok) files.push(new File([await got.blob()], name));
      }
      if (files.length) await provider.useSource(provider.offer(files).id);
      const plan = planPiece(skin, dialog, { includeParked: true, frames: FACES });
      const found = new Map(art);
      for (const needed of plan ? planArt(plan) : []) {
        if (found.has(needed)) continue;
        const bitmap = await provider.load(uiIconId(needed, MOVIE)).catch(() => null);
        if (bitmap) found.set(needed, bitmap);
      }
      setArt(found);
      document.body.setAttribute('data-ready', 'yes');
    })();
  }, [skin, dialog]);

  const plan = useMemo(
    () => (skin ? planPiece(skin, dialog, { includeParked: true, frames: FACES }) : null),
    [skin, dialog],
  );
  const picture = useMemo(
    () => (plan && skin ? drawPiece(plan, art, SCALE) : null),
    [plan, art, skin],
  );
  const every = useMemo(() => (skin ? namesIn(skin) : []), [skin]);

  if (note) return <p className="p-4 font-mono text-parchment-100">{note}</p>;
  if (!plan || !picture) {
    return (
      <p className="p-4 font-mono text-parchment-100">
        No piece of the movie is called “{dialog}”.
      </p>
    );
  }

  const box = plan.box;
  /** Where a part sits on the drawn picture, in its pixels. */
  const at = (part: PiecePart): JSX.CSSProperties => ({
    position: 'absolute',
    left: `${part.box.x * SCALE}px`,
    top: `${part.box.y * SCALE}px`,
    width: `${Math.max(1, part.box.w * SCALE)}px`,
    height: `${Math.max(1, part.box.h * SCALE)}px`,
  });
  const showing = (part: PiecePart): boolean =>
    !filter || part.path.toLowerCase().includes(filter.toLowerCase());

  return (
    <div className="flex h-full gap-4 bg-chrome-950 p-4 font-mono text-tiny text-parchment-200">
      <div className="flex w-80 shrink-0 flex-col gap-2">
        <label class="flex flex-col gap-1">
          Piece of the movie
          <input
            list="pieces"
            value={dialog}
            onInput={event => setDialog((event.target as HTMLInputElement).value)}
            className="rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1.5 py-1"
          />
          <datalist id="pieces">
            {every.map(name => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label class="flex flex-col gap-1">
          Parts matching
          <input
            value={filter}
            placeholder="btn, text, line…"
            onInput={event => setFilter((event.target as HTMLInputElement).value)}
            className="rounded-chrome-sm border border-brass-600 bg-chrome-950 px-1.5 py-1"
          />
        </label>
        <p className="m-0 text-ink-400">
          {plan.parts.filter(showing).length} of {plan.parts.length} parts · {Math.round(box.w)}×
          {Math.round(box.h)} units
        </p>
        {held ? (
          <p className="m-0 break-all text-status-info">{held}</p>
        ) : (
          <p className="m-0 text-ink-400">Press a part to keep its name up.</p>
        )}
        <ul className="m-0 flex list-none flex-col overflow-y-auto p-0">
          {plan.parts.filter(showing).map(part => (
            <li key={part.path}>
              <button
                type="button"
                onMouseEnter={() => setLit(part.path)}
                onMouseLeave={() => setLit(null)}
                onClick={() => setHeld(part.path)}
                className={`w-full cursor-pointer border-0 bg-transparent px-1 py-0.5 text-left ${
                  held === part.path ? 'text-status-info' : 'text-parchment-200'
                }`}
              >
                {part.path}
                <span className="text-ink-400">
                  {' '}
                  {Math.round(part.box.w)}×{Math.round(part.box.h)}
                  {part.draws ? '' : ' ·flat'}
                  {part.mask ? ' ·mask' : ''}
                  {part.text ? ` ·“${part.text.words}”` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="overflow-auto">
        <div className="relative inline-block" style={{ width: `${box.w * SCALE}px` }}>
          <img src={picture.url} alt="" className="block" style={{ imageRendering: 'pixelated' }} />
          {plan.parts.filter(showing).map(part => (
            <div
              key={part.path}
              title={part.path}
              onMouseEnter={() => setLit(part.path)}
              onMouseLeave={() => setLit(null)}
              onClick={() => setHeld(part.path)}
              style={{
                ...at(part),
                outline:
                  held === part.path
                    ? '2px solid #38bdf8'
                    : lit === part.path
                      ? '2px solid #fbbf24'
                      : '1px solid rgba(255,255,255,0.18)',
                background:
                  held === part.path
                    ? 'rgba(56,189,248,0.18)'
                    : lit === part.path
                      ? 'rgba(251,191,36,0.18)'
                      : 'transparent',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

const root = document.getElementById('parts');
if (root) render(<Parts />, root);
